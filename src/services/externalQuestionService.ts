import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';

// ===== INTERFACES =====

interface ExternalQuestionAPI {
  statement: string;
  alternatives: string[];
  correctAnswer: number;
  disciplina: string;
  anoEscolar: number;
  nivelDificuldade: string;
  tags: string[];
  has_math: boolean;
  id: string;
}

interface ExternalQuestionFormatted {
  id: string;
  statement: string;
  alternatives: string[];
  correctAnswer: number;
  subject: string;
  grade: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  hasMath: boolean;
  source: 'external';
}

interface ExternalQuestionFilters {
  skip?: number;
  limit?: number;
  disciplina?: string;
  anoEscolar?: number;
  nivelDificuldade?: string;
  tags?: string;
}

interface ExternalQuestionResponse {
  data: ExternalQuestionFormatted[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ExternalAPIResponse {
  items: ExternalQuestionAPI[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ===== CONFIGURAÇÕES =====

const EXTERNAL_API_BASE_URL = 'https://api-questao-1.onrender.com/api/v1/questoes';

// ===== CLASSE PRINCIPAL =====

class ExternalQuestionService {
  private apiClient = axios.create({
    baseURL: EXTERNAL_API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  constructor() {
    // Interceptor para logs
    this.apiClient.interceptors.request.use(
      (config) => {
        logger.system('Fazendo requisição para API externa', {
          url: config.url,
          method: config.method,
          params: config.params,
        });
        return config;
      },
      (error) => {
        logger.error('Erro na requisição para API externa', error);
        return Promise.reject(error);
      }
    );

    this.apiClient.interceptors.response.use(
      (response) => {
        logger.system('Resposta recebida da API externa', {
          status: response.status,
          dataLength: Array.isArray(response.data) ? response.data.length : 1,
        });
        return response;
      },
      (error) => {
        logger.error('Erro na resposta da API externa', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Mapeia dificuldade da API externa para o formato interno
   */
  private mapDifficulty(nivelDificuldade: string): 'EASY' | 'MEDIUM' | 'HARD' {
    const difficultyMap: Record<string, 'EASY' | 'MEDIUM' | 'HARD'> = {
      'Fácil': 'EASY',
      'Facil': 'EASY',
      'Easy': 'EASY',
      'Médio': 'MEDIUM',
      'Medio': 'MEDIUM',
      'Medium': 'MEDIUM',
      'Difícil': 'HARD',
      'Dificil': 'HARD',
      'Hard': 'HARD',
    };

    return difficultyMap[nivelDificuldade] || 'MEDIUM';
  }

  /**
   * Formata questão da API externa para o formato interno
   */
  private formatExternalQuestion(question: ExternalQuestionAPI): ExternalQuestionFormatted {
    return {
      id: question.id,
      statement: question.statement || '',
      alternatives: question.alternatives || [],
      correctAnswer: question.correctAnswer || 0,
      subject: question.disciplina || '',
      grade: question.anoEscolar || 0,
      difficulty: this.mapDifficulty(question.nivelDificuldade || ''),
      tags: Array.isArray(question.tags) ? question.tags : [],
      hasMath: Boolean(question.has_math),
      source: 'external',
    };
  }

  /**
   * Lista questões da API externa com filtros e paginação
   */
  async getExternalQuestions(
    filters: ExternalQuestionFilters = {}
  ): Promise<ExternalQuestionResponse> {
    try {
      // Prepara parâmetros da requisição
      const params: Record<string, any> = {
        skip: filters.skip || 0,
        limit: filters.limit || 10,
      };

      if (filters.disciplina) params.disciplina = filters.disciplina;
      if (filters.anoEscolar) params.anoEscolar = filters.anoEscolar;
      if (filters.nivelDificuldade) params.nivelDificuldade = filters.nivelDificuldade;
      if (filters.tags) params.tags = filters.tags;

      // Usa cache inteligente com fallback
      const result = await cache.getWithFallback<ExternalQuestionResponse>(
        cache.generateExternalQuestionsKey(params),
        async () => {
          logger.system('Buscando questões externas da API (cache miss)', { filters: params });

          // Faz requisição para API externa
          const response: AxiosResponse<ExternalAPIResponse> = await this.apiClient.get('', {
            params,
          });

          // Formata as questões
          const formattedQuestions = response.data.items.map(question => 
            this.formatExternalQuestion(question)
          );

          // Extrai informações de paginação da resposta real
          const pagination = response.data.pagination;
          const apiResult: ExternalQuestionResponse = {
            data: formattedQuestions,
            total: pagination.totalItems,
            page: pagination.currentPage,
            limit: pagination.pageSize,
            hasNext: pagination.hasMore,
            hasPrev: pagination.currentPage > 1,
          };

          logger.system('Questões externas carregadas da API', {
            itemsCount: response.data.items.length,
            pagination: pagination,
            formattedCount: formattedQuestions.length,
          });

          // Cache individual das questões para consultas futuras
          formattedQuestions.forEach(async (question) => {
            await cache.setExternalQuestion(question.id, question, cache.TTL.MEDIUM);
          });

          return apiResult;
        },
        cache.TTL.SHORT // 5 minutos para listas
      );

      logger.system('Questões externas retornadas', {
        count: result.data.length,
        fromCache: true,
        filters: params,
      });

      return result;
    } catch (error) {
      logger.error('Erro ao buscar questões externas', error, { filters });
      throw new Error('Erro ao conectar com a API externa de questões');
    }
  }

  /**
   * Busca uma questão específica da API externa por ID
   */
  async getExternalQuestionById(id: string): Promise<ExternalQuestionFormatted | null> {
    try {
      // Usa cache inteligente com fallback
      const question = await cache.getWithFallback<ExternalQuestionFormatted | null>(
        `external_question:${id}`,
        async () => {
          logger.system('Buscando questão externa da API por ID (cache miss)', { id });

          // Faz requisição para API externa
          const response: AxiosResponse<ExternalAPIResponse> = await this.apiClient.get('', {
            params: { id },
          });

          if (!response.data.items || response.data.items.length === 0) {
            logger.system('Questão externa não encontrada na API', { id });
            return null;
          }

          const firstItem = response.data.items[0];
          if (!firstItem) {
            return null;
          }

          const formattedQuestion = this.formatExternalQuestion(firstItem);
          
          logger.system('Questão externa carregada da API', { 
            id, 
            statement: formattedQuestion.statement.substring(0, 50) + '...' 
          });

          return formattedQuestion;
        },
        cache.TTL.MEDIUM // 15 minutos para questões individuais
      );

      if (question) {
        logger.system('Questão externa retornada', { 
          id, 
          fromCache: true,
          statement: question.statement.substring(0, 50) + '...' 
        });
      } else {
        logger.system('Questão externa não encontrada', { id });
      }

      return question;
    } catch (error: any) {
      logger.error('Erro ao buscar questão externa por ID', error, { id });
      
      if (error.response?.status === 404) {
        return null;
      }
      
      throw new Error('Erro ao conectar com a API externa de questões');
    }
  }

  /**
   * Cria uma nova questão na API externa
   */
  async createExternalQuestion(questionData: {
    statement: string;
    alternatives: string[];
    correctAnswer: number;
    disciplina: string;
    anoEscolar: number;
    nivelDificuldade: string;
    tags: string[];
    has_math: boolean;
  }): Promise<ExternalQuestionFormatted> {
    try {
      logger.system('Criando questão na API externa', { 
        disciplina: questionData.disciplina,
        anoEscolar: questionData.anoEscolar,
      });

      // Faz requisição para API externa
      const response: AxiosResponse<ExternalQuestionAPI> = await this.apiClient.post('', questionData);

      // Formata a questão criada
      const formattedQuestion = this.formatExternalQuestion(response.data);

      // Invalida cache usando método otimizado
      if (cache.invalidateExternalApiCache) {
        await cache.invalidateExternalApiCache();
      } else {
        await cache.del('external_questions:*');
      }

      // Atualiza estatísticas se disponível
      if (cache.setExternalStats) {
        try {
          const stats = await this.getExternalQuestionsStats();
          await cache.setExternalStats({ ...stats, totalQuestions: stats.totalQuestions + 1 }, cache.TTL.MEDIUM);
        } catch (error) {
          logger.warn('Erro ao atualizar estatísticas após criação', error);
        }
      }

      logger.system('Questão criada na API externa com sucesso', { 
        id: formattedQuestion.id,
        disciplina: questionData.disciplina,
      });

      return formattedQuestion;
    } catch (error) {
      logger.error('Erro ao criar questão na API externa', error, { questionData });
      throw new Error('Erro ao criar questão na API externa');
    }
  }

  /**
   * Atualiza uma questão na API externa
   */
  async updateExternalQuestion(
    id: string,
    questionData: Partial<{
      statement: string;
      alternatives: string[];
      correctAnswer: number;
      disciplina: string;
      anoEscolar: number;
      nivelDificuldade: string;
      tags: string[];
      has_math: boolean;
    }>
  ): Promise<ExternalQuestionFormatted> {
    try {
      logger.system('Atualizando questão na API externa', { id });

      // Faz requisição para API externa
      const response: AxiosResponse<ExternalQuestionAPI> = await this.apiClient.put(`/${id}`, questionData);

      // Formata a questão atualizada
      const formattedQuestion = this.formatExternalQuestion(response.data);

      // Invalida cache específico da questão
      await cache.del(`external_question:${id}`);
      
      // Invalida cache usando método otimizado
      if (cache.invalidateExternalApiCache) {
        await cache.invalidateExternalApiCache();
      } else {
        await cache.del('external_questions:*');
      }

      // Se mudou a disciplina, invalida filtros específicos
      if (questionData.disciplina && cache.invalidateExternalQuestionsByFilter) {
        await cache.invalidateExternalQuestionsByFilter('disciplina', questionData.disciplina);
      }

      logger.system('Questão atualizada na API externa com sucesso', { 
        id,
        changedFields: Object.keys(questionData)
      });

      return formattedQuestion;
    } catch (error: any) {
      logger.error('Erro ao atualizar questão na API externa', error, { id });
      
      if (error.response?.status === 404) {
        throw new Error('Questão não encontrada na API externa');
      }
      
      throw new Error('Erro ao atualizar questão na API externa');
    }
  }

  /**
   * Deleta uma questão na API externa
   */
  async deleteExternalQuestion(id: string): Promise<void> {
    try {
      logger.system('Deletando questão na API externa', { id });

      // Faz requisição para API externa
      await this.apiClient.delete(`/${id}`);

      // Invalida cache específico da questão
      await cache.del(`external_question:${id}`);
      
      // Invalida cache usando método otimizado
      if (cache.invalidateExternalApiCache) {
        await cache.invalidateExternalApiCache();
      } else {
        await cache.del('external_questions:*');
      }

      // Atualiza estatísticas se disponível
      if (cache.setExternalStats) {
        try {
          const stats = await this.getExternalQuestionsStats();
          await cache.setExternalStats({ ...stats, totalQuestions: Math.max(0, stats.totalQuestions - 1) }, cache.TTL.MEDIUM);
        } catch (error) {
          logger.warn('Erro ao atualizar estatísticas após deleção', error);
        }
      }

      logger.system('Questão deletada na API externa com sucesso', { id });
    } catch (error: any) {
      logger.error('Erro ao deletar questão na API externa', error, { id });
      
      if (error.response?.status === 404) {
        throw new Error('Questão não encontrada na API externa');
      }
      
      throw new Error('Erro ao deletar questão na API externa');
    }
  }

  /**
   * Testa a conectividade e formato da API externa
   */
  async testExternalAPI(): Promise<{
    isConnected: boolean;
    sampleData?: any;
    error?: string;
  }> {
    try {
      logger.system('Testando conectividade com API externa');
      
      const response = await this.apiClient.get('', {
        params: { limit: 1, skip: 0 },
        timeout: 5000,
      });
      
      const sampleQuestion = response.data[0];
      
      logger.system('Teste de API externa bem-sucedido', {
        responseLength: response.data.length,
        sampleQuestion: sampleQuestion ? {
          id: sampleQuestion.id,
          hasStatement: !!sampleQuestion.statement,
          hasAlternatives: Array.isArray(sampleQuestion.alternatives),
          hasDisciplina: !!sampleQuestion.disciplina,
          hasAnoEscolar: !!sampleQuestion.anoEscolar,
          hasNivelDificuldade: !!sampleQuestion.nivelDificuldade,
        } : null,
      });
      
      return {
        isConnected: true,
        sampleData: sampleQuestion,
      };
    } catch (error: any) {
      logger.error('Erro no teste da API externa', error);
      
      return {
        isConnected: false,
        error: error.message || 'Erro desconhecido',
      };
    }
  }

  /**
   * Obtém estatísticas das questões externas com cache
   */
  async getExternalQuestionsStats(): Promise<{
    totalQuestions: number;
    questionsByDisciplina: Record<string, number>;
    questionsByDificuldade: Record<string, number>;
    lastUpdated: Date;
  }> {
    try {
      // Usa cache para estatísticas
      const stats = await cache.getWithFallback(
        'external_questions_stats',
        async () => {
          logger.system('Calculando estatísticas das questões externas (cache miss)');

          // Busca uma amostra grande para calcular estatísticas
          const response = await this.getExternalQuestions({ limit: 1000 });
          
          const questionsByDisciplina: Record<string, number> = {};
          const questionsByDificuldade: Record<string, number> = {};

          response.data.forEach(question => {
             // Conta por disciplina
             questionsByDisciplina[question.subject] = 
               (questionsByDisciplina[question.subject] || 0) + 1;
             
             // Conta por dificuldade
             questionsByDificuldade[question.difficulty] = 
               (questionsByDificuldade[question.difficulty] || 0) + 1;
           });

          const calculatedStats = {
            totalQuestions: response.total,
            questionsByDisciplina,
            questionsByDificuldade,
            lastUpdated: new Date(),
          };

          logger.system('Estatísticas calculadas', {
            total: calculatedStats.totalQuestions,
            disciplinas: Object.keys(questionsByDisciplina).length,
            dificuldades: Object.keys(questionsByDificuldade).length,
          });

          return calculatedStats;
        },
        cache.TTL.LONG // 1 hora para estatísticas
      );

      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas das questões externas', error);
      throw new Error('Erro ao calcular estatísticas das questões externas');
    }
  }

  /**
   * Verifica a saúde da API externa
   */
  async checkExternalApiHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    lastCheck: Date;
  }> {
    try {
      const startTime = Date.now();
      
      // Usa cache para health check
      const health = await cache.getWithFallback(
        'external_api_health',
        async () => {
          logger.system('Verificando saúde da API externa (cache miss)');

          try {
            // Faz uma requisição simples para testar a API
            await this.apiClient.get('', { params: { limit: 1 } });
            
            const responseTime = Date.now() - startTime;
            
            const healthStatus = {
              status: responseTime < 2000 ? 'healthy' as const : 'degraded' as const,
              responseTime,
              lastCheck: new Date(),
            };

            logger.system('API externa verificada', healthStatus);
            return healthStatus;
          } catch (error) {
            logger.error('API externa indisponível', error);
            return {
              status: 'down' as const,
              responseTime: Date.now() - startTime,
              lastCheck: new Date(),
            };
          }
        },
        cache.TTL.SHORT // 5 minutos para health check
      );

      return health;
    } catch (error) {
      logger.error('Erro ao verificar saúde da API externa', error);
      return {
        status: 'down',
        responseTime: -1,
        lastCheck: new Date(),
      };
    }
  }
}

export default new ExternalQuestionService();