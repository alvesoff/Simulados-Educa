import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';
import {
  CreateTestRequest,
  UpdateTestRequest,
  TestResponse,
  PaginatedResponse,
  TestFilters,
} from '../types';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../middleware/errorHandler';

// ===== INICIALIZAÇÃO =====

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// ===== INTERFACES =====

interface TestStats {
  totalAttempts: number;
  averageScore: number;
  averageTime: number;
  completionRate: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
}



// ===== SERVIÇO PRINCIPAL =====

class TestService {
  /**
   * Cria um novo teste
   */
  async createTest(data: CreateTestRequest, creatorId: string): Promise<TestResponse> {
    try {
      logger.info('Criando novo teste', { creatorId, title: data.title });

      const creator = await prisma.user.findUnique({
        where: { id: creatorId },
      });

      if (!creator) {
        throw new NotFoundError('Usuário criador');
      }

      if (creator.role !== 'TEACHER' && creator.role !== 'STAFF') {
        throw new ForbiddenError('Apenas professores e staff podem criar testes');
      }

      if (!creator.schoolId) {
        throw new ValidationError('Usuário deve estar associado a uma escola');
      }

      const accessCode = await this.generateUniqueAccessCode();

      const test = await prisma.test.create({
        data: {
          title: data.title,
          ...(data.description && { description: data.description }),
          accessCode,
          type: data.type || 'INDIVIDUAL',
          status: 'EDITING',
          ...(data.duration && { duration: data.duration }),
          maxAttempts: data.maxAttempts || 1,
          showResults: data.showResults ?? true,
          shuffleQuestions: data.shuffleQuestions ?? false,
          shuffleOptions: data.shuffleOptions ?? false,

          createdById: creatorId,
          schoolId: creator.schoolId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      logger.info('Teste criado com sucesso', {
        testId: test.id,
        accessCode: test.accessCode,
        creatorId,
      });

      return this.formatTestResponse(test);
    } catch (error) {
      logger.error('Erro ao criar teste', error, { creatorId, title: data.title });
      throw error;
    }
  }

  /**
   * Busca teste por ID
   */
  async getTestById(testId: string, userId: string): Promise<TestResponse> {
    try {
      logger.info('Buscando teste por ID', { testId, userId });

      let test = await cache.get(`test:${testId}`);
      if (!test) {
        test = await prisma.test.findUnique({
          where: { id: testId },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            school: {
              select: {
                id: true,
                name: true,
              },
            },
            questions: {
              include: {
                question: true,
              },
              orderBy: {
                orderNum: 'asc',
              },
            },
            _count: {
              select: {
                studentAttempts: true,
              },
            },
          },
        });

        if (test) {
          await cache.set(`test:${testId}`, test, 900);
        }
      }

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestAccess(test, userId);

      return this.formatTestResponse(test);
    } catch (error) {
      logger.error('Erro ao buscar teste', error, { testId, userId });
      throw error;
    }
  }

  /**
   * Busca teste por código de acesso
   */
  async getTestByAccessCode(accessCode: string): Promise<TestResponse> {
    try {
      logger.info('Buscando teste por código de acesso', { accessCode });

      let test: any = await cache.getTestByAccessCode(accessCode);
      if (!test) {
        test = await prisma.test.findUnique({
          where: { accessCode },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            school: {
              select: {
                id: true,
                name: true,
              },
            },
            questions: {
              include: {
                question: true,
              },
            },
            _count: {
              select: {
                studentAttempts: true,
              },
            },
          },
        });

        if (test) {
          await cache.setTestByAccessCode(accessCode, test, 900);
        }
      }

      if (!test) {
        throw new NotFoundError('Teste com código de acesso informado');
      }

      if (test.status !== 'ACTIVE') {
        throw new ForbiddenError('Teste não está ativo');
      }

      return this.formatTestResponse(test);
    } catch (error) {
      logger.error('Erro ao buscar teste por código', error, { accessCode });
      throw error;
    }
  }

  /**
   * Lista testes com filtros e paginação
   */
  async getTests(
    filters: TestFilters,
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponse<TestResponse>> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('Usuário');
      }

      const skip = (page - 1) * limit;
      const where: any = {};

      // Filtros de acesso baseados no papel do usuário
      if (user.role === 'STAFF') {
        // STAFF pode ver todos os testes
        if (filters.schoolId) {
          where.schoolId = filters.schoolId;
        }
      } else {
        // Outros usuários só veem:
        // 1. Seus próprios testes
        // 2. Testes colaborativos da própria escola
        where.schoolId = user.schoolId;
        where.OR = [
          { createdById: userId }, // Testes criados pelo usuário
          { type: 'COLLABORATIVE' } // Testes colaborativos da escola
        ];
      }

      // Aplicar filtros específicos
      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.createdById) {
        where.createdById = filters.createdById;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const [tests, total] = await Promise.all([
        prisma.test.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            school: {
              select: {
                id: true,
                name: true,
              },
            },
            questions: {
              include: {
                question: true,
              },
            },
            _count: {
              select: {
                studentAttempts: true,
              },
            },
          },
        }),
        prisma.test.count({ where }),
      ]);

      const formattedTests = tests.map((test: any) => this.formatTestResponse(test));

      return {
        data: formattedTests,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('Erro ao listar testes', error, { filters, userId });
      throw error;
    }
  }

  /**
   * Atualiza um teste
   */
  async updateTest(
    testId: string,
    data: UpdateTestRequest,
    userId: string
  ): Promise<TestResponse> {
    try {
      logger.info('Atualizando teste', { testId, userId });

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          questions: true,
        },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      // Validações específicas para testes ativos
      if (test.status === 'ACTIVE') {
        const restrictedFields = ['type', 'duration', 'maxAttempts'];
        const hasRestrictedChanges = restrictedFields.some(field => 
          data[field as keyof UpdateTestRequest] !== undefined && 
          data[field as keyof UpdateTestRequest] !== test[field as keyof typeof test]
        );
        if (hasRestrictedChanges) {
          throw new ValidationError('Não é possível alterar configurações críticas de um teste ativo');
        }
      }

      const updatedTest = await prisma.test.update({
        where: { id: testId },
        data: {
          ...(data.title && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.duration !== undefined && { duration: data.duration }),
          ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
          ...(data.showResults !== undefined && { showResults: data.showResults }),
          ...(data.shuffleQuestions !== undefined && { shuffleQuestions: data.shuffleQuestions }),
          ...(data.shuffleOptions !== undefined && { shuffleOptions: data.shuffleOptions }),
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      // Invalidar cache
      await Promise.all([
        cache.invalidateTestCache(testId),
        cache.invalidateSchoolCache(test.schoolId || ''),
      ]);

      logger.info('Teste atualizado com sucesso', { testId, userId });

      return this.formatTestResponse(updatedTest);
    } catch (error) {
      logger.error('Erro ao atualizar teste', error, { testId, userId });
      throw error;
    }
  }

  /**
   * Adiciona questões ao teste (aceita IDs ou dados completos)
   */
  async addQuestionsToTest(
    testId: string,
    questionIds: string[],
    userId: string
  ): Promise<TestResponse> {
    try {
      logger.info('=== INÍCIO addQuestionsToTest ===', { 
        testId, 
        questionIds, 
        questionIdsCount: questionIds.length,
        questionIdsType: typeof questionIds,
        userId 
      });

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          questions: true,
        },
      });

      logger.info('Teste encontrado:', { 
        testFound: !!test, 
        testId: test?.id,
        testStatus: test?.status,
        existingQuestionsCount: test?.questions?.length 
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      if (test.status === 'ACTIVE') {
        throw new ValidationError('Não é possível adicionar questões a um teste ativo');
      }

      // Verificar se as questões existem
      logger.info('Buscando questões no banco:', { questionIds });
      
      const questions = await prisma.question.findMany({
        where: {
          id: {
            in: questionIds,
          },
        },
      });

      logger.info('Questões encontradas no banco:', { 
        questionsFound: questions.length,
        questionsExpected: questionIds.length,
        foundQuestionIds: questions.map(q => q.id),
        requestedQuestionIds: questionIds
      });

      if (questions.length !== questionIds.length) {
        const missingIds = questionIds.filter(id => !questions.find(q => q.id === id));
        logger.error('Questões não encontradas:', { missingIds });
        throw new NotFoundError(`Questões não encontradas: ${missingIds.join(', ')}`);
      }

      // Calcular próxima ordem
      const maxOrder = test.questions.length > 0
          ? Math.max(...test.questions.map((q: any) => q.orderNum))
          : 0;

      logger.info('Calculando ordem das questões:', { 
        existingQuestionsCount: test.questions.length,
        maxOrder 
      });

      // Criar relações teste-questão
      const testQuestions = questionIds.map((questionId, index) => ({
        testId,
        questionId,
        orderNum: maxOrder + index + 1,
        points: 1, // Valor padrão de 1 ponto por questão
      }));

      logger.info('Criando relações teste-questão:', { 
        testQuestions,
        testQuestionsCount: testQuestions.length 
      });

      const createResult = await prisma.testQuestion.createMany({
        data: testQuestions,
        skipDuplicates: true,
      });

      logger.info('Resultado da criação:', { 
        createResult,
        createdCount: createResult.count 
      });

      // Buscar teste atualizado
      const updatedTest = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderNum: 'asc',
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      // Invalidar cache
      await cache.invalidateTestCache(testId);

      logger.info('Questões adicionadas com sucesso', {
        testId,
        addedQuestions: questionIds.length,
        userId,
      });

      return this.formatTestResponse(updatedTest!);
    } catch (error) {
      logger.error('Erro ao adicionar questões', error, { testId, questionIds, userId });
      throw error;
    }
  }

  /**
   * Adiciona questões externas ao teste (cria a questão e adiciona à prova)
   */
  async addExternalQuestionsToTest(
    testId: string,
    questionsData: any[],
    userId: string
  ): Promise<TestResponse> {
    try {
      logger.info('=== INÍCIO addExternalQuestionsToTest ===', { 
        testId, 
        questionsCount: questionsData.length,
        userId 
      });

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          questions: true,
        },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      if (test.status === 'ACTIVE') {
        throw new ValidationError('Não é possível adicionar questões a um teste ativo');
      }

      // Calcular próxima ordem
      const maxOrder = test.questions.length > 0
          ? Math.max(...test.questions.map((q: any) => q.orderNum))
          : 0;

      logger.info('Processando questões externas:', { 
        questionsCount: questionsData.length,
        maxOrder 
      });

      const createdQuestions = [];
      const testQuestions = [];

      // Processar cada questão externa
      for (let i = 0; i < questionsData.length; i++) {
        const questionData = questionsData[i];
        
        logger.info('Processando questão externa:', { 
          index: i,
          questionId: questionData.externalId,
          statement: questionData.statement?.substring(0, 100) + '...'
        });

        // Verificar se a questão já existe no banco
        let createdQuestion = await prisma.question.findUnique({
          where: { id: questionData.externalId }
        });

        // Se não existe, criar a questão no banco de dados
        if (!createdQuestion) {
          createdQuestion = await prisma.question.create({
            data: {
              id: questionData.externalId, // Usar o ID externo da API
              statement: questionData.statement,
              alternatives: questionData.alternatives || [],
              correctAnswer: questionData.correctAnswer || 0,
              subject: questionData.subject || 'Geral',
              topic: questionData.topic,
              grade: questionData.grade,
              difficulty: questionData.difficulty || 'MEDIUM',
              tags: questionData.tags || [],
              hasMath: questionData.hasMath || false,
            },
          });
        }

        createdQuestions.push(createdQuestion);

        // Criar relação teste-questão
        testQuestions.push({
          testId,
          questionId: createdQuestion.id,
          orderNum: maxOrder + i + 1,
          points: questionData.points || 1,
        });
      }

      logger.info('Criando relações teste-questão:', { 
        testQuestionsCount: testQuestions.length 
      });

      // Criar todas as relações teste-questão
      const createResult = await prisma.testQuestion.createMany({
        data: testQuestions,
        skipDuplicates: true,
      });

      logger.info('Resultado da criação:', { 
        createResult,
        createdCount: createResult.count 
      });

      // Buscar teste atualizado
      const updatedTest = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderNum: 'asc',
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      // Invalidar cache
      await cache.invalidateTestCache(testId);

      logger.info('Questões externas adicionadas com sucesso', {
        testId,
        addedQuestions: questionsData.length,
        userId,
      });

      return this.formatTestResponse(updatedTest!);
    } catch (error) {
      logger.error('Erro ao adicionar questões externas', error, { testId, questionsCount: questionsData.length, userId });
      throw error;
    }
  }

  /**
   * Remove questão do teste
   */
  async removeQuestionFromTest(
    testId: string,
    questionId: string,
    userId: string
  ): Promise<TestResponse> {
    try {
      logger.info('Removendo questão do teste', { testId, questionId, userId });

      const test = await prisma.test.findUnique({
        where: { id: testId },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      if (test.status === 'ACTIVE') {
        throw new ValidationError('Não é possível remover questões de um teste ativo');
      }

      // Buscar relação teste-questão
      const testQuestion = await prisma.testQuestion.findFirst({
        where: {
          testId,
          questionId,
        },
      });

      if (!testQuestion) {
        throw new NotFoundError('Questão não encontrada no teste');
      }

      await prisma.testQuestion.delete({
        where: {
          id: testQuestion.id,
        },
      });

      // Reordenar questões restantes
      const remainingQuestions = await prisma.testQuestion.findMany({
        where: { testId },
        orderBy: { orderNum: 'asc' },
      });

      for (let i = 0; i < remainingQuestions.length; i++) {
        const question = remainingQuestions[i];
        if (question?.id) {
          await prisma.testQuestion.update({
            where: { id: question.id },
            data: { orderNum: i + 1 },
          });
        }
      }

      // Buscar teste atualizado
      const updatedTest = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderNum: 'asc',
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      // Invalidar cache
      await cache.invalidateTestCache(testId);

      logger.info('Questão removida com sucesso', { testId, questionId, userId });

      return this.formatTestResponse(updatedTest!);
    } catch (error) {
      logger.error('Erro ao remover questão', error, { testId, questionId, userId });
      throw error;
    }
  }

  /**
   * Ativa um teste
   */
  async activateTest(testId: string, userId: string): Promise<TestResponse> {
    try {
      logger.info('Ativando teste', { testId, userId });

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          questions: true,
        },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      if (test.status === 'ACTIVE') {
        throw new ValidationError('Teste já está ativo');
      }

      if (test.questions.length === 0) {
        throw new ValidationError('Teste deve ter pelo menos uma questão para ser ativado');
      }

      const updatedTest = await prisma.test.update({
        where: { id: testId },
        data: {
          status: 'ACTIVE',
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderNum: 'asc',
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      // Invalidar cache
      await Promise.all([
        cache.invalidateTestCache(testId),
        cache.invalidateSchoolCache(test.schoolId || ''),
      ]);

      logger.info('Teste ativado com sucesso', { testId, userId });

      return this.formatTestResponse(updatedTest);
    } catch (error) {
      logger.error('Erro ao ativar teste', error, { testId, userId });
      throw error;
    }
  }

  /**
   * Desativa um teste
   */
  async deactivateTest(testId: string, userId: string): Promise<TestResponse> {
    try {
      logger.info('Desativando teste', { testId, userId });

      const test = await prisma.test.findUnique({
        where: { id: testId },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      if (test.status !== 'ACTIVE') {
        throw new ValidationError('Teste não está ativo');
      }

      const updatedTest = await prisma.test.update({
        where: { id: testId },
        data: {
          status: 'COMPLETED',
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderNum: 'asc',
            },
          },
          _count: {
            select: {
              studentAttempts: true,
            },
          },
        },
      });

      // Invalidar cache
      await Promise.all([
        cache.invalidateTestCache(testId),
        cache.invalidateSchoolCache(test.schoolId || ''),
      ]);

      logger.info('Teste desativado com sucesso', { testId, userId });

      return this.formatTestResponse(updatedTest);
    } catch (error) {
      logger.error('Erro ao desativar teste', error, { testId, userId });
      throw error;
    }
  }

  /**
   * Exclui um teste
   */
  async deleteTest(testId: string, userId: string): Promise<void> {
    try {
      logger.info('Excluindo teste', { testId, userId });

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          studentAttempts: true,
        },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestEditAccess(test, userId);

      if (test.status === 'ACTIVE') {
        throw new ValidationError('Não é possível excluir um teste ativo');
      }

      if (test.studentAttempts.length > 0) {
        throw new ValidationError('Não é possível excluir um teste que já possui tentativas de estudantes');
      }

      // Excluir relações teste-questão primeiro
      await prisma.testQuestion.deleteMany({
        where: { testId },
      });

      // Excluir o teste
      await prisma.test.delete({
        where: { id: testId },
      });

      // Invalidar cache
      await Promise.all([
        cache.invalidateTestCache(testId),
        cache.invalidateSchoolCache(test.schoolId || ''),
      ]);

      logger.info('Teste excluído com sucesso', { testId, userId });
    } catch (error) {
      logger.error('Erro ao excluir teste', error, { testId, userId });
      throw error;
    }
  }

  /**
   * Obtém estatísticas do teste
   */
  async getTestStats(testId: string, userId: string): Promise<TestStats> {
    try {
      logger.info('Obtendo estatísticas do teste', { testId, userId });

      const test = await prisma.test.findUnique({
        where: { id: testId },
      });

      if (!test) {
        throw new NotFoundError('Teste');
      }

      await this.checkTestAccess(test, userId);

      const attempts = await prisma.studentAttempt.findMany({
        where: {
          testId,
          completedAt: {
            not: null,
          },
        },
      });

      const totalAttempts = attempts.length;
      const averageScore = totalAttempts > 0 
        ? attempts.reduce((sum: number, attempt: any) => sum + (attempt.score || 0), 0) / totalAttempts 
        : 0;
      
      const averageTime = totalAttempts > 0
        ? attempts.reduce((sum: number, attempt: any) => {
            const duration = attempt.completedAt && attempt.startedAt 
              ? (attempt.completedAt.getTime() - attempt.startedAt.getTime()) / 1000
              : 0;
            return sum + duration;
          }, 0) / totalAttempts
        : 0;

      const completionRate = totalAttempts > 0 
        ? (attempts.filter((a: any) => a.completedAt !== null).length / totalAttempts) * 100
        : 0;

      // Distribuição de dificuldade das questões
      const questions = await prisma.testQuestion.findMany({
        where: { testId },
        include: {
          question: true,
        },
      });

      const difficultyDistribution = {
        easy: questions.filter((tq: any) => tq.question.difficulty === 'EASY').length,
        medium: questions.filter((tq: any) => tq.question.difficulty === 'MEDIUM').length,
        hard: questions.filter((tq: any) => tq.question.difficulty === 'HARD').length,
      };

      return {
        totalAttempts,
        averageScore,
        averageTime,
        completionRate,
        difficultyDistribution,
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas', error, { testId, userId });
      throw error;
    }
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Gera código de acesso único
   */
  private async generateUniqueAccessCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = Math.random().toString(36).substr(2, 8).toUpperCase();
      
      const existing = await prisma.test.findUnique({
        where: { accessCode: code },
      });

      if (!existing) {
        return code;
      }

      attempts++;
    }

    throw new AppError('Não foi possível gerar código de acesso único');
  }

  /**
   * Verifica acesso ao teste
   */
  private async checkTestAccess(test: any, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // STAFF pode acessar qualquer teste
    if (user.role === 'STAFF') {
      return;
    }

    // Usuários só podem acessar testes da própria escola
    if (test.schoolId !== user.schoolId) {
      throw new ForbiddenError('Acesso negado ao teste');
    }

    // Professores só podem acessar testes ativos (se não forem criadores)
    if (user.role === 'TEACHER' && test.creatorId !== userId && test.status !== 'ACTIVE') {
      throw new ForbiddenError('Teste não está disponível');
    }
  }

  /**
   * Verifica permissão de edição do teste
   */
  private async checkTestEditAccess(test: any, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // STAFF pode editar qualquer teste
    if (user.role === 'STAFF') {
      return;
    }

    // Apenas STAFF e criadores podem editar testes
    if (user.role === 'TEACHER' && test.creatorId !== userId) {
      throw new ForbiddenError('Apenas o criador do teste pode editá-lo');
    }

    // Criador pode editar seus próprios testes
    if (test.creatorId === userId) {
      return;
    }

    // Professores podem editar testes colaborativos da mesma escola
    if (test.type === 'COLLABORATIVE' && test.schoolId === user.schoolId) {
      return;
    }

    throw new ForbiddenError('Sem permissão para editar este teste');
  }

  /**
   * Formata resposta do teste
   */
  private formatTestResponse(test: any): TestResponse {
    return {
      id: test.id,
      title: test.title,
      description: test.description,
      type: test.type,
      status: test.status,
      duration: test.duration,
      subjects: test.subjects || [],
      targetGrades: test.targetGrades || [],
      instructions: test.instructions,
      allowReview: test.allowReview || false,
      shuffleQuestions: test.shuffleQuestions,
      shuffleOptions: test.shuffleOptions,
      showResults: test.showResults,
      maxAttempts: test.maxAttempts,
      accessCode: test.accessCode,
      totalPoints: test.questions?.reduce((sum: number, tq: any) => sum + (tq.points || 0), 0) || 0,
      questionsCount: test.questions?.length || test._count?.questions || 0,
      createdAt: test.createdAt,
      updatedAt: test.updatedAt,
      createdBy: test.createdBy,
      school: test.school,
      questions: test.questions?.map((tq: any) => ({
        id: tq.question.id,
        points: tq.points || 0,
        orderNum: tq.orderNum,
        question: {
          id: tq.question.id,
          statement: tq.question.statement,
          type: 'MULTIPLE_CHOICE',
          options: tq.question.alternatives?.map((alt: string, index: number) => ({
            text: alt,
            isCorrect: index === tq.question.correctAnswer
          })) || [],
          subject: tq.question.subject,
          topic: tq.question.topic,
          difficulty: tq.question.difficulty,
          tags: tq.question.tags || [],
          hasMath: tq.question.hasMath || false,
        },
      })) || [],
    };
  }
}

// ===== EXPORTAÇÃO =====

export const testService = new TestService();

export default testService;