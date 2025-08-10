import { PrismaClient, Question } from '@prisma/client';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';
import {
  QuestionCreateRequest,
  QuestionUpdateRequest,
  QuestionResponse,
  PaginatedResponse,
  QuestionFilters,
} from '../types';
import {
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
    if (!data.statement || typeof data.statement !== 'string' || data.statement.trim().length < 10) {
      throw new ValidationError('Questão deve ter pelo menos 10 caracteres');
    }

    if (!data.alternatives || !Array.isArray(data.alternatives) || data.alternatives.length < 2) {
      throw new ValidationError('Questão deve ter pelo menos 2 opções');
    }

    // Valida se todas as alternativas são strings válidas
    const validAlternatives = data.alternatives.filter((alt: any) => alt && typeof alt === 'string' && alt.trim().length > 0);
    if (validAlternatives.length < 2) {
      throw new ValidationError('Questão deve ter pelo menos 2 opções válidas');
    }

    if (validAlternatives.length > 6) {
      throw new ValidationError('Uma questão pode ter no máximo 6 opções');
    }

    if (typeof data.correctAnswer !== 'number' || data.correctAnswer < 0 || data.correctAnswer >= validAlternatives.length) {
      throw new ValidationError('O índice da resposta correta deve ser válido');
    }

    if (!data.difficulty || !['EASY', 'MEDIUM', 'HARD'].includes(data.difficulty)) {
      throw new ValidationError('Dificuldade deve ser EASY, MEDIUM ou HARD');
    }

    if (!data.subject || typeof data.subject !== 'string' || data.subject.trim().length < 2) {
      throw new ValidationError('Assunto deve ter pelo menos 2 caracteres');
    }

    if (data.topic && (typeof data.topic !== 'string' || data.topic.trim().length < 2)) {
      throw new ValidationError('Tópico deve ter pelo menos 2 caracteres quando fornecido');
    }

    // Verifica duplicatas nas opções válidas
    const uniqueOptions = new Set(validAlternatives.map((opt: string) => opt.trim().toLowerCase()));
    if (uniqueOptions.size !== validAlternatives.length) {
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