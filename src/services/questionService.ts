import { PrismaClient, Question, Difficulty } from '@prisma/client';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';
import { config } from '../utils/config';
import {
  QuestionCreateRequest,
  QuestionUpdateRequest,
  QuestionResponse,
  PaginatedResponse,
  QuestionFilters,
} from '../types';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../middleware/errorHandler';

// ===== INICIALIZAÇÃO =====

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// ===== INTERFACES =====

// interface QuestionWithStats extends Question {
//   usage: {
//     timesUsed: number;
//     correctRate: number;
//     averageTime: number;
//     lastUsed: Date | null;
//   };
// }

interface QuestionImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface ExternalQuestion {
  id?: string;
  question: string;
  options: string[];
  correctAnswer: string;
  difficulty: Difficulty;
  subject: string;
  topic: string;
  explanation?: string;
  tags?: string[];
}

// ===== CLASSE PRINCIPAL =====

class QuestionService {
  /**
   * Cria uma nova questão
   */
  async createQuestion(
    data: QuestionCreateRequest,
    creatorId: string
  ): Promise<QuestionResponse> {
    try {
      logger.system('Criando nova questão', { creatorId, subject: data.subject });

      // Verifica se o usuário pode criar questões
      const creator = await prisma.user.findUnique({
        where: { id: creatorId },
        include: { school: true },
      });

      if (!creator) {
        throw new NotFoundError('Usuário');
      }

      if (creator.role === 'STUDENT' as any) {
        throw new ForbiddenError('Estudantes não podem criar questões');
      }

      if (!creator.school.isActive) {
        throw new ValidationError('Escola não está ativa');
      }

      // Valida dados da questão
      this.validateQuestionData(data);

      // Verifica duplicatas
      const existingQuestion = await prisma.question.findFirst({
          where: {
            statement: data.statement,
        },
      });

      if (existingQuestion) {
        throw new ConflictError('Questão já existe nesta escola');
      }

      // Cria a questão
      const question = await prisma.question.create({
        data: {
          statement: data.statement.trim(),
          alternatives: data.alternatives.map(opt => opt.trim()),
          correctAnswer: data.correctAnswer,
          difficulty: data.difficulty,
          subject: data.subject.trim(),
          topic: data.topic?.trim() ?? null,
          tags: data.tags || [],
        },
      });

      // Invalida cache de questões
      await cache.del('questions');

      logger.system('Questão criada com sucesso', {
        questionId: question.id,
        subject: question.subject,
        creatorId,
      });

      return this.formatQuestionResponse(question);
    } catch (error) {
      logger.error('Erro ao criar questão', error, { creatorId, subject: data.subject });
      throw error;
    }
  }

  /**
   * Busca questão por ID
   */
  async getQuestionById(questionId: string, userId: string): Promise<QuestionResponse> {
    try {
      // Busca no cache primeiro
      let question = await cache.get(`question:${questionId}`);
      
      if (!question) {
        // Busca no banco
        question = await prisma.question.findUnique({
          where: { id: questionId },
          include: {
            _count: {
              select: {
                testQuestions: true,
              },
            },
          },
        });

        if (!question) {
          throw new NotFoundError('Questão');
        }

        // Salva no cache
        await cache.set(`question:${questionId}`, question);
      }

      // Verifica permissões
      await this.checkQuestionAccess(question, userId);

      return this.formatQuestionResponse(question);
    } catch (error) {
      logger.error('Erro ao buscar questão', error, { questionId, userId });
      throw error;
    }
  }

  /**
   * Lista questões com filtros e paginação
   */
  async getQuestions(
    filters: QuestionFilters,
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponse<Question>> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('Usuário');
      }

      const skip = (page - 1) * limit;
      const where: any = {};

      // Filtros específicos
      if (filters.subject) {
        where.subject = {
          contains: filters.subject,
          mode: 'insensitive',
        };
      }

      // Filtro por tópico removido - não existe no QuestionFilters

      if (filters.difficulty) {
        where.difficulty = filters.difficulty;
      }

      if (filters.tags && filters.tags.length > 0) {
        where.tags = {
          hasEvery: filters.tags,
        };
      }

      if (filters.search) {
        where.OR = [
          {
            statement: {
              contains: filters.search,
              mode: 'insensitive',
            },
          },
          {
            subject: {
              contains: filters.search,
              mode: 'insensitive',
            },
          },
          {
            topic: {
              contains: filters.search,
              mode: 'insensitive',
            },
          },
        ];
      }

      // Busca com paginação
      const [questions, total] = await Promise.all([
        prisma.question.findMany({
          where,
          include: {
            _count: {
              select: {
                testQuestions: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.question.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data: questions.map(question => this.formatQuestionResponse(question)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('Erro ao listar questões', error, { filters, userId });
      throw error;
    }
  }

  /**
   * Atualiza uma questão
   */
  async updateQuestion(
    questionId: string,
    data: QuestionUpdateRequest,
    userId: string
  ): Promise<QuestionResponse> {
    try {
      logger.system('Atualizando questão', { questionId, userId });

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
          _count: {
            select: {
              testQuestions: true,
            },
          },
        },
      });

      if (!question) {
        throw new NotFoundError('Questão');
      }

      // Verifica permissões
      await this.checkQuestionEditAccess(question, userId);

      // Não permite editar questões em uso em testes ativos
      if (question._count.testQuestions > 0) {
        const activeTests = await prisma.test.count({
          where: {
            status: 'ACTIVE',
            questions: {
              some: {
                questionId,
              },
            },
          },
        });

        if (activeTests > 0) {
          throw new ValidationError('Não é possível editar questão em uso em testes ativos');
        }
      }

      // Valida dados
      this.validateQuestionData(data);

      // Atualiza a questão
      const updatedQuestion = await prisma.question.update({
          where: { id: questionId },
          data: {
            ...(data.statement && { statement: data.statement.trim() }),
            ...(data.alternatives && { alternatives: data.alternatives.map(opt => opt.trim()) }),
            ...(data.correctAnswer !== undefined && { correctAnswer: data.correctAnswer }),
            ...(data.difficulty && { difficulty: data.difficulty }),
            ...(data.subject && { subject: data.subject.trim() }),
            ...(data.topic && { topic: data.topic.trim() }),
            ...(data.tags && { tags: data.tags }),
        },
        include: {
          _count: {
            select: {
              testQuestions: true,
            },
          },
        },
      });

      // Invalida cache
      await cache.del('questions');

      logger.system('Questão atualizada com sucesso', { questionId, userId });

      return this.formatQuestionResponse(updatedQuestion);
    } catch (error) {
      logger.error('Erro ao atualizar questão', error, { questionId, userId });
      throw error;
    }
  }

  /**
   * Deleta uma questão
   */
  async deleteQuestion(questionId: string, userId: string): Promise<void> {
    try {
      logger.system('Deletando questão', { questionId, userId });

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
          _count: {
            select: {
              testQuestions: true,
            },
          },
        },
      });

      if (!question) {
        throw new NotFoundError('Questão');
      }

      // Verifica permissões
      await this.checkQuestionEditAccess(question, userId);

      if (question._count.testQuestions > 0) {
        throw new ValidationError('Não é possível deletar questão em uso em testes');
      }

      // Deleta a questão
      await prisma.question.delete({
        where: { id: questionId },
      });

      // Invalida cache
      await cache.invalidateQuestion(questionId);

      logger.system('Questão deletada com sucesso', { questionId, userId });
    } catch (error) {
      logger.error('Erro ao deletar questão', error, { questionId, userId });
      throw error;
    }
  }

  /**
   * Importa questões de fonte externa
   */
  async importQuestions(
    questions: ExternalQuestion[],
    schoolId: string,
    creatorId: string
  ): Promise<QuestionImportResult> {
    try {
      logger.system('Importando questões', {
        count: questions.length,
        schoolId,
        creatorId,
      });

      const result: QuestionImportResult = {
        imported: 0,
        skipped: 0,
        errors: [],
      };

      for (const questionData of questions) {
        try {
          // Valida dados da questão
          this.validateQuestionData(questionData);

          // Verifica duplicatas por externalId primeiro, depois por statement
          let existing = null;
          
          if (questionData.id) {
            existing = await prisma.question.findFirst({
              where: {
                externalId: questionData.id,
              },
            });
          }
          
          if (!existing) {
            existing = await prisma.question.findFirst({
              where: {
                statement: questionData.question,
              },
            });
          }

          if (existing) {
            result.skipped++;
            continue;
          }

          // Converte correctAnswer para número (índice)
          const correctAnswerIndex = questionData.options.findIndex(
            option => option === questionData.correctAnswer
          );

          if (correctAnswerIndex === -1) {
            throw new Error('Resposta correta não encontrada nas opções');
          }

          // Cria a questão
          await prisma.question.create({
            data: {
              statement: questionData.question.trim(),
              alternatives: questionData.options.map(opt => opt.trim()),
              correctAnswer: correctAnswerIndex,
              difficulty: questionData.difficulty,
              subject: questionData.subject.trim(),
              topic: questionData.topic.trim(),
              tags: questionData.tags || [],
              externalId: questionData.id || null,
            },
          });

          result.imported++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          result.errors.push(
            `Erro na questão "${questionData.question.substring(0, 50)}...": ${errorMessage}`
          );
        }
      }

      // Invalida cache de questões
      await cache.del('questions');

      logger.system('Importação de questões concluída', {
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors.length,
        schoolId,
      });

      return result;
    } catch (error) {
      logger.error('Erro na importação de questões', error, {
        count: questions.length,
        schoolId,
        creatorId,
      });
      throw error;
    }
  }

  /**
   * Sincroniza questões com API externa
   */
  async syncQuestionsFromAPI(schoolId: string, maxPages: number = 5): Promise<QuestionImportResult> {
    try {
      logger.system('Sincronizando questões da API externa', { schoolId, maxPages });

      const externalQuestions: ExternalQuestion[] = [];

      if (!config.QUESTIONS_API_URL) {
        throw new AppError('URL da API externa não configurada');
      }

      try {
        let currentPage = 1;
        let hasMore = true;
        const pageSize = maxPages > 50 ? 20 : 10; // Aumenta pageSize para sincronizações grandes

        while (hasMore && currentPage <= maxPages) {
          logger.system(`Buscando página ${currentPage} da API externa`, { 
            page: currentPage, 
            pageSize 
          });

          const url = `${config.QUESTIONS_API_URL}?page=${currentPage}&limit=${pageSize}`;
          
          // Cria um AbortController para timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`API externa retornou status ${response.status}: ${response.statusText}`);
          }

          const data = await response.json() as any;
          
          if (!data.items || !Array.isArray(data.items)) {
            throw new Error('Formato de resposta inválido da API externa');
          }

          // Converte questões da API externa para o formato interno
          for (const item of data.items) {
            try {
              const convertedQuestion = this.convertExternalQuestion(item);
              externalQuestions.push(convertedQuestion);
            } catch (conversionError) {
              logger.warn('Erro ao converter questão da API externa', {
                error: conversionError instanceof Error ? conversionError.message : 'Erro desconhecido',
                questionId: item.id,
                statement: item.statement?.substring(0, 50),
              });
            }
          }

          // Verifica se há mais páginas
          hasMore = data.pagination?.hasMore === true;
          currentPage++;

          // Pausa entre requisições - menor para sincronizações grandes
          if (hasMore && currentPage <= maxPages) {
            const delay = maxPages > 50 ? 50 : 100; // Reduz delay para sincronizações grandes
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        logger.system('Busca na API externa concluída', {
          totalQuestions: externalQuestions.length,
          pagesProcessed: currentPage - 1,
        });

      } catch (error) {
        logger.error('Erro ao buscar questões da API externa', error);
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        throw new AppError(`Erro na sincronização com API externa: ${errorMessage}`);
      }

      // Busca um usuário STAFF da escola para ser o criador
      const creator = await prisma.user.findFirst({
        where: {
          schoolId,
          role: 'STAFF',
        },
      });

      if (!creator) {
        throw new ValidationError('Nenhum usuário STAFF encontrado na escola');
      }

      return await this.importQuestions(externalQuestions, schoolId, creator.id);
    } catch (error) {
      logger.error('Erro na sincronização de questões', error, { schoolId });
      throw error;
    }
  }

  /**
   * Converte questão da API externa para formato interno
   */
  private convertExternalQuestion(externalItem: any): ExternalQuestion {
    try {
      // Mapeia dificuldade da API externa para o formato interno
      const difficultyMap: Record<string, Difficulty> = {
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

      // Mapeia disciplinas da API externa para formato padronizado
      const subjectMap: Record<string, string> = {
        'Português': 'Português',
        'PortuguÃªs': 'Português',
        'Matemática': 'Matemática',
        'MatemÃ¡tica': 'Matemática',
        'História': 'História',
        'HistÃ³ria': 'História',
        'Geografia': 'Geografia',
        'Ciências': 'Ciências',
        'CiÃªncias': 'Ciências',
        'Inglês': 'Inglês',
        'InglÃªs': 'Inglês',
        'Educação Física': 'Educação Física',
        'EducaÃ§Ã£o FÃ­sica': 'Educação Física',
        'Arte': 'Arte',
        'Artes': 'Arte',
      };

      // Limpa e decodifica o HTML das strings
      const cleanHtml = (text: string): string => {
        if (!text) return '';
        return text
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
          .replace(/\\u0026/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/<[^>]*>/g, '') // Remove tags HTML
          .replace(/\s+/g, ' ') // Normaliza espaços
          .trim();
      };

      const statement = cleanHtml(externalItem.statement);
      const alternatives = externalItem.alternatives?.map((alt: string) => cleanHtml(alt)) || [];
      const difficulty = difficultyMap[externalItem.nivelDificuldade] || 'MEDIUM';
      const subject = subjectMap[externalItem.disciplina] || externalItem.disciplina || 'Geral';
      
      // Gera tópico baseado no ano escolar se não estiver disponível
      const topic = externalItem.topic || `${externalItem.anoEscolar}º Ano` || 'Geral';

      // Valida dados básicos
      if (!statement || statement.length < 10) {
        throw new Error('Statement inválido ou muito curto');
      }

      if (!alternatives || alternatives.length < 2) {
        throw new Error('Alternativas insuficientes');
      }

      if (externalItem.correctAnswer < 0 || externalItem.correctAnswer >= alternatives.length) {
        throw new Error('Índice de resposta correta inválido');
      }

      return {
        id: externalItem.id,
        question: statement,
        options: alternatives,
        correctAnswer: alternatives[externalItem.correctAnswer],
        difficulty,
        subject,
        topic,
        explanation: externalItem.explanation || undefined,
        tags: externalItem.tags || [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new Error(`Erro ao converter questão: ${errorMessage}`);
    }
  }

  /**
   * Obtém estatísticas de uso da questão
   */
  async getQuestionStats(questionId: string, userId: string): Promise<any> {
    try {
      const question = await prisma.question.findUnique({
        where: { id: questionId },
      });

      if (!question) {
        throw new NotFoundError('Questão');
      }

      // Verifica permissões
      await this.checkQuestionAccess(question, userId);

      // Busca no cache primeiro
      const cacheKey = `question:stats:${questionId}`;
      let stats = await cache.get(cacheKey);

      if (!stats) {
        // Calcula estatísticas
        const [testUsage, attempts] = await Promise.all([
          prisma.testQuestion.count({
            where: { questionId },
          }),
          prisma.studentAttempt.findMany({
            where: {
              test: {
                questions: {
                  some: {
                    questionId,
                  },
                },
              },
              completedAt: { not: null },
            },
            select: {
              answers: true,
              completedAt: true,
            },
          }),
        ]);

        let correctAnswers = 0;
        let totalAnswers = 0;
        let totalTime = 0;
        let lastUsed: Date | null = null;

        for (const attempt of attempts) {
          const answers = (attempt.answers as any) || {};
          const questionAnswer = answers[questionId];
          
          if (questionAnswer) {
            totalAnswers++;
            if (questionAnswer.isCorrect) {
              correctAnswers++;
            }
            totalTime += questionAnswer.timeSpent || 0;
            
            if (!lastUsed || (attempt.completedAt && attempt.completedAt > lastUsed)) {
              lastUsed = attempt.completedAt;
            }
          }
        }

        const correctRate = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;
        const averageTime = totalAnswers > 0 ? totalTime / totalAnswers : 0;

        stats = {
          timesUsed: testUsage,
          totalAnswers,
          correctAnswers,
          correctRate,
          averageTime,
          lastUsed,
        };

        // Salva no cache
        await cache.set(cacheKey, stats, cache.TTL.MEDIUM);
      }

      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas da questão', error, { questionId, userId });
      throw error;
    }
  }

  /**
   * Busca questões por assunto e tópico
   */
  async getQuestionsBySubjectAndTopic(
    subject: string,
    topic: string,
    schoolId: string,
    limit: number = 50
  ): Promise<Question[]> {
    try {
      const cacheKey = `questions:${schoolId}:${subject}:${topic}`;
      let questions = await cache.get(cacheKey);

      if (!questions) {
        questions = await prisma.question.findMany({
          where: {
            subject: {
              contains: subject,
              mode: 'insensitive',
            },
            topic: {
              contains: topic,
              mode: 'insensitive',
            },
          },
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
        });

        await cache.set(cacheKey, questions, cache.TTL.MEDIUM);
      }

      return questions as Question[];
    } catch (error) {
      logger.error('Erro ao buscar questões por assunto e tópico', error, {
        subject,
        topic,
        schoolId,
      });
      throw error;
    }
  }

  /**
   * Lista todas as matérias disponíveis
   */
  async getSubjects(schoolId?: string): Promise<string[]> {
    try {
      const cacheKey = `subjects:${schoolId || 'all'}`;
      let subjects = await cache.get(cacheKey);

      if (!subjects) {
        const where: any = {};
        
        // Se schoolId for fornecido, filtra por escola (quando implementado)
        // Por enquanto, busca todas as matérias
        
        const result = await prisma.question.findMany({
          where,
          select: {
            subject: true,
          },
          distinct: ['subject'],
          orderBy: {
            subject: 'asc',
          },
        });

        subjects = result.map(q => q.subject).filter(Boolean);
        await cache.set(cacheKey, subjects, cache.TTL.LONG);
      }

      return subjects as string[];
    } catch (error) {
      logger.error('Erro ao buscar matérias', error, { schoolId });
      throw error;
    }
  }

  /**
   * Lista tópicos de uma matéria específica
   */
  async getTopicsBySubject(subject: string, schoolId?: string): Promise<string[]> {
    try {
      const cacheKey = `topics:${schoolId || 'all'}:${subject}`;
      let topics = await cache.get(cacheKey);

      if (!topics) {
        const where: any = {
          subject: {
            equals: subject,
            mode: 'insensitive',
          },
        };
        
        // Se schoolId for fornecido, filtra por escola (quando implementado)
        // Por enquanto, busca todos os tópicos da matéria
        
        const result = await prisma.question.findMany({
          where,
          select: {
            topic: true,
          },
          distinct: ['topic'],
          orderBy: {
            topic: 'asc',
          },
        });

        topics = result.map(q => q.topic).filter(Boolean);
        await cache.set(cacheKey, topics, cache.TTL.LONG);
      }

      return topics as string[];
    } catch (error) {
      logger.error('Erro ao buscar tópicos da matéria', error, { subject, schoolId });
      throw error;
    }
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Valida dados da questão
   */
  private validateQuestionData(data: any): void {
    if (!data.statement || data.statement.trim().length < 10) {
          throw new ValidationError('Questão deve ter pelo menos 10 caracteres');
        }

        if (!data.alternatives || !Array.isArray(data.alternatives) || data.alternatives.length < 2) {
          throw new ValidationError('Questão deve ter pelo menos 2 opções');
    }

    if (data.alternatives.length > 6) {
      throw new ValidationError('Uma questão pode ter no máximo 6 opções');
    }

    if (data.correctAnswer < 0 || data.correctAnswer >= data.alternatives.length) {
      throw new ValidationError('O índice da resposta correta deve ser válido');
    }

    if (!data.difficulty || !['EASY', 'MEDIUM', 'HARD'].includes(data.difficulty)) {
      throw new ValidationError('Dificuldade deve ser EASY, MEDIUM ou HARD');
    }

    if (!data.subject || data.subject.trim().length < 2) {
      throw new ValidationError('Assunto deve ter pelo menos 2 caracteres');
    }

    if (!data.topic || data.topic.trim().length < 2) {
      throw new ValidationError('Tópico deve ter pelo menos 2 caracteres');
    }

    // Verifica duplicatas nas opções
    const uniqueOptions = new Set(data.alternatives.map((opt: string) => opt.trim().toLowerCase()));
    if (uniqueOptions.size !== data.alternatives.length) {
      throw new ValidationError('Opções não podem ser duplicadas');
    }
  }

  /**
   * Verifica acesso à questão
   */
  private async checkQuestionAccess(_question: any, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // STAFF pode acessar qualquer questão
    if (user.role === 'STAFF') {
      return;
    }

    // Todos os usuários podem acessar questões por enquanto
    // TODO: Implementar controle de acesso baseado em escola
  }

  /**
   * Verifica permissão de edição da questão
   */
  private async checkQuestionEditAccess(_question: any, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // STAFF pode editar qualquer questão
    if (user.role === 'STAFF') {
      return;
    }

    // Todos os usuários podem editar questões por enquanto
    // TODO: Implementar controle de acesso baseado em criador e escola
  }

  /**
   * Formata resposta da questão
   */
  private formatQuestionResponse(question: any): any {
      return {
        id: question.id,
        statement: question.statement,
        alternatives: question.alternatives,
      correctAnswer: question.correctAnswer,
      difficulty: question.difficulty,
      subject: question.subject,
      topic: question.topic,
      tags: question.tags,
      testsCount: question._count?.testQuestions || 0,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }
}

// ===== INSTÂNCIA SINGLETON =====

export const questionService = new QuestionService();

export default questionService;