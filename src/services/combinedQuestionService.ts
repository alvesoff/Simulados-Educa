import questionService from './questionService';
import externalQuestionService from './externalQuestionService';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';

// ===== INTERFACES =====

interface CombinedQuestion {
  id: string;
  statement: string;
  alternatives: string[];
  correctAnswer: number;
  subject: string;
  grade?: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  hasMath: boolean;
  source: 'local' | 'external';
  createdAt?: Date;
  updatedAt?: Date;
}

interface CombinedQuestionFilters {
  subject?: string;
  grade?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  tags?: string[];
  search?: string;
  source?: 'local' | 'external' | 'both';
  page?: number;
  limit?: number;
}

interface CombinedQuestionResponse {
  data: CombinedQuestion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  sources: {
    local: number;
    external: number;
  };
}

// ===== CLASSE PRINCIPAL =====

class CombinedQuestionService {
  /**
   * Mapeia questão local para o formato combinado
   */
  private mapLocalQuestion(question: any): CombinedQuestion {
    return {
      id: question.id,
      statement: question.statement,
      alternatives: question.alternatives || question.options?.map((opt: any) => opt.text) || [],
      correctAnswer: question.correctAnswer,
      subject: question.subject,
      grade: question.grade,
      difficulty: question.difficulty,
      tags: question.tags || [],
      hasMath: question.hasMath || false,
      source: 'local',
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  /**
   * Mapeia questão externa para o formato combinado
   */
  private mapExternalQuestion(question: any): CombinedQuestion {
    return {
      id: `ext_${question.id}`,
      statement: question.statement,
      alternatives: question.alternatives,
      correctAnswer: question.correctAnswer,
      subject: question.subject,
      grade: question.grade,
      difficulty: question.difficulty,
      tags: question.tags || [],
      hasMath: question.hasMath || false,
      source: 'external',
    };
  }

  /**
   * Converte filtros combinados para filtros locais
   */
  private convertToLocalFilters(filters: CombinedQuestionFilters): any {
    const localFilters: any = {};
    
    if (filters.subject) localFilters.subject = filters.subject;
    if (filters.difficulty) localFilters.difficulty = filters.difficulty;
    if (filters.search) localFilters.search = filters.search;
    if (filters.tags) localFilters.tags = filters.tags;
    
    return localFilters;
  }

  /**
   * Converte filtros combinados para filtros externos
   */
  private convertToExternalFilters(filters: CombinedQuestionFilters): any {
    const externalFilters: any = {};
    
    if (filters.subject) externalFilters.disciplina = filters.subject;
    if (filters.grade) externalFilters.anoEscolar = filters.grade;
    if (filters.difficulty) {
      const difficultyMap = {
        'EASY': 'Fácil',
        'MEDIUM': 'Médio',
        'HARD': 'Difícil',
      };
      externalFilters.nivelDificuldade = difficultyMap[filters.difficulty];
    }
    if (filters.tags) externalFilters.tags = filters.tags.join(',');
    
    return externalFilters;
  }

  /**
   * Busca questões combinadas (locais e externas)
   */
  async getCombinedQuestions(
    filters: CombinedQuestionFilters,
    userId: string
  ): Promise<CombinedQuestionResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const source = filters.source || 'both';

      logger.system('Buscando questões combinadas', {
        userId,
        filters,
        source,
        page,
        limit,
      });

      let localQuestions: CombinedQuestion[] = [];
      let externalQuestions: CombinedQuestion[] = [];
      let localTotal = 0;
      let externalTotal = 0;

      // Busca questões locais se necessário
      if (source === 'local' || source === 'both') {
        try {
          const localFilters = this.convertToLocalFilters(filters);
          const localResult = await questionService.getQuestions(
            localFilters,
            userId,
            page,
            limit
          );
          
          localQuestions = localResult.data.map(q => this.mapLocalQuestion(q));
          localTotal = localResult.pagination.total;
          
          logger.system('Questões locais carregadas', {
            count: localQuestions.length,
            total: localTotal,
            filters: localFilters,
          });
        } catch (error) {
          logger.warn('Erro ao buscar questões locais', { error, userId });
        }
      }

      // Busca questões externas se necessário
      if (source === 'external' || source === 'both') {
        try {
          const externalFilters = this.convertToExternalFilters(filters);
          externalFilters.skip = (page - 1) * limit;
          externalFilters.limit = limit;
          
          const externalResult = await externalQuestionService.getExternalQuestions(externalFilters);
          
          externalQuestions = externalResult.data.map(q => this.mapExternalQuestion(q));
          externalTotal = externalResult.total;
          
          logger.system('Questões externas carregadas', {
            count: externalQuestions.length,
            total: externalTotal,
            filters: externalFilters,
            apiResponse: {
              dataLength: externalResult.data.length,
              hasNext: externalResult.hasNext,
              hasPrev: externalResult.hasPrev,
            },
          });
        } catch (error) {
          logger.warn('Erro ao buscar questões externas', { error, userId });
        }
      }

      // Combina e ordena as questões
      let combinedQuestions: CombinedQuestion[] = [];
      
      if (source === 'both') {
        // Algoritmo melhorado de intercalação
        const totalLocal = localQuestions.length;
        const totalExternal = externalQuestions.length;
        const totalAvailable = totalLocal + totalExternal;
        
        if (totalAvailable === 0) {
          combinedQuestions = [];
        } else {
          // Calcula a proporção ideal para intercalação
          const localRatio = totalLocal / totalAvailable;
          const externalRatio = totalExternal / totalAvailable;
          
          let localIndex = 0;
          let externalIndex = 0;
          let localNext = 0;
          let externalNext = 0;
          
          for (let i = 0; i < Math.min(limit, totalAvailable); i++) {
            // Decide se deve adicionar questão local ou externa
            const shouldAddLocal = localIndex < totalLocal && 
              (externalIndex >= totalExternal || localNext <= externalNext);
            
            if (shouldAddLocal) {
              const localQuestion = localQuestions[localIndex];
              if (localQuestion) {
                combinedQuestions.push(localQuestion);
                localIndex++;
                localNext = localIndex / localRatio;
              }
            } else if (externalIndex < totalExternal) {
              const externalQuestion = externalQuestions[externalIndex];
              if (externalQuestion) {
                combinedQuestions.push(externalQuestion);
                externalIndex++;
                externalNext = externalIndex / externalRatio;
              }
            }
          }
        }
      } else if (source === 'local') {
        combinedQuestions = localQuestions.slice(0, limit);
      } else {
        combinedQuestions = externalQuestions.slice(0, limit);
      }

      // Aplica filtros adicionais se necessário
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        combinedQuestions = combinedQuestions.filter(q =>
          q.statement.toLowerCase().includes(searchTerm) ||
          q.subject.toLowerCase().includes(searchTerm) ||
          q.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
      }

      const total = source === 'both' ? localTotal + externalTotal : 
                   source === 'local' ? localTotal : externalTotal;

      const result: CombinedQuestionResponse = {
        data: combinedQuestions,
        pagination: {
          page,
          limit,
          total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
        sources: {
          local: localQuestions.length,
          external: externalQuestions.length,
        },
      };

      logger.system('Questões combinadas carregadas com sucesso', {
        userId,
        totalQuestions: combinedQuestions.length,
        localCount: localQuestions.length,
        externalCount: externalQuestions.length,
      });

      return result;
    } catch (error) {
      logger.error('Erro ao buscar questões combinadas', error, { userId, filters });
      throw new Error('Erro ao buscar questões combinadas');
    }
  }

  /**
   * Busca uma questão específica (local ou externa)
   */
  async getCombinedQuestionById(id: string, userId: string): Promise<CombinedQuestion> {
    try {
      logger.system('Buscando questão combinada por ID', { id, userId });

      // Verifica se é questão externa (prefixo ext_)
      if (id.startsWith('ext_')) {
        const externalId = id.replace('ext_', '');
        const externalQuestion = await externalQuestionService.getExternalQuestionById(externalId);
        return this.mapExternalQuestion(externalQuestion);
      } else {
        // Questão local
        const localQuestion = await questionService.getQuestionById(id, userId);
        return this.mapLocalQuestion(localQuestion);
      }
    } catch (error) {
      logger.error('Erro ao buscar questão combinada por ID', error, { id, userId });
      throw error;
    }
  }

  /**
   * Obtém estatísticas combinadas
   */
  async getCombinedStats(userId: string): Promise<{
    total: number;
    bySource: {
      local: number;
      external: number;
    };
    bySubject: Record<string, number>;
    byDifficulty: Record<string, number>;
    byGrade: Record<number, number>;
  }> {
    try {
      const cacheKey = `combined_stats:${userId}`;
      
      // Verifica cache primeiro
      const cached = await cache.get(cacheKey);
      if (cached && typeof cached === 'string') {
        return JSON.parse(cached);
      }

      logger.system('Calculando estatísticas combinadas', { userId });

      // Busca estatísticas locais
      let localStats: { 
        total: number; 
        subjects: string[]; 
        difficulties: Record<string, number>; 
        grades: number[] 
      } = { total: 0, subjects: [], difficulties: {}, grades: [] };
      try {
        const localResult = await questionService.getQuestions({}, userId, 1, 1000);
        localStats.total = localResult.pagination.total;
        
        // Calcula estatísticas dos dados locais
        const localQuestions = localResult.data.map(q => this.mapLocalQuestion(q));
        localStats.subjects = [...new Set(localQuestions.map(q => q.subject))];
        localStats.difficulties = localQuestions.reduce((acc, q) => {
          acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        localStats.grades = [...new Set(localQuestions.map(q => q.grade).filter((grade): grade is number => grade !== null && grade !== undefined))];
      } catch (error) {
        logger.warn('Erro ao buscar estatísticas locais', { error, userId });
      }

      // Busca estatísticas externas
      let externalStats: { 
        total: number; 
        subjects: string[]; 
        difficulties: Record<string, number>; 
        grades: number[] 
      } = { total: 0, subjects: [], difficulties: {}, grades: [] };
      try {
        const externalStatsResult = await externalQuestionService.getExternalQuestionsStats();
        externalStats = {
          total: externalStatsResult.totalQuestions,
          subjects: Object.keys(externalStatsResult.questionsByDisciplina),
          difficulties: externalStatsResult.questionsByDificuldade,
          grades: [], // Não temos informação de grades nas estatísticas externas
        };
      } catch (error) {
        logger.warn('Erro ao buscar estatísticas externas', { error, userId });
      }

      // Combina estatísticas
      const allSubjects = [...new Set([...localStats.subjects, ...externalStats.subjects])];
      const bySubject = allSubjects.reduce((acc, subject) => {
        acc[subject] = 0;
        return acc;
      }, {} as Record<string, number>);

      const allDifficulties = [...new Set([
        ...Object.keys(localStats.difficulties),
        ...Object.keys(externalStats.difficulties)
      ])];
      const byDifficulty = allDifficulties.reduce((acc, difficulty) => {
        acc[difficulty] = (localStats.difficulties[difficulty] || 0) + 
                         (externalStats.difficulties[difficulty] || 0);
        return acc;
      }, {} as Record<string, number>);

      const allGrades = [...new Set([...localStats.grades, ...externalStats.grades])];
      const byGrade = allGrades.reduce((acc, grade) => {
        acc[grade] = 0;
        return acc;
      }, {} as Record<number, number>);

      const stats = {
        total: localStats.total + externalStats.total,
        bySource: {
          local: localStats.total,
          external: externalStats.total,
        },
        bySubject,
        byDifficulty,
        byGrade,
      };

      // Salva no cache por 10 minutos
      await cache.set(cacheKey, stats, 600);

      logger.system('Estatísticas combinadas calculadas', {
        userId,
        total: stats.total,
        local: stats.bySource.local,
        external: stats.bySource.external,
      });

      return stats;
    } catch (error) {
      logger.error('Erro ao calcular estatísticas combinadas', error, { userId });
      throw new Error('Erro ao calcular estatísticas combinadas');
    }
  }

  /**
   * Busca questões para um teste específico
   */
  async getQuestionsForTest(
    filters: CombinedQuestionFilters & {
      count: number;
      excludeIds?: string[];
    },
    userId: string
  ): Promise<CombinedQuestion[]> {
    try {
      logger.system('Buscando questões para teste', {
        userId,
        count: filters.count,
        filters,
      });

      // Busca mais questões do que necessário para ter opções
      const searchLimit = Math.max(filters.count * 3, 50);
      const searchFilters = { ...filters, limit: searchLimit, page: 1 };
      
      const result = await this.getCombinedQuestions(searchFilters, userId);
      let availableQuestions = result.data;

      // Remove questões excluídas
      if (filters.excludeIds && filters.excludeIds.length > 0) {
        availableQuestions = availableQuestions.filter(q => 
          !filters.excludeIds!.includes(q.id)
        );
      }

      // Embaralha as questões usando algoritmo Fisher-Yates
      for (let i = availableQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = availableQuestions[i];
        const questionJ = availableQuestions[j];
        if (temp && questionJ) {
          availableQuestions[i] = questionJ;
          availableQuestions[j] = temp;
        }
      }

      // Retorna apenas a quantidade solicitada
      const selectedQuestions = availableQuestions.slice(0, filters.count);

      logger.system('Questões selecionadas para teste', {
        userId,
        requested: filters.count,
        selected: selectedQuestions.length,
        localCount: selectedQuestions.filter(q => q.source === 'local').length,
        externalCount: selectedQuestions.filter(q => q.source === 'external').length,
      });

      return selectedQuestions;
    } catch (error) {
      logger.error('Erro ao buscar questões para teste', error, { userId, filters });
      throw new Error('Erro ao buscar questões para teste');
    }
  }
}

export default new CombinedQuestionService();