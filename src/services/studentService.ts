import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';
import { queueJobs } from '../utils/queue';
import {
  StudentLoginRequest,
  StudentLoginResponse,
  StudentAttemptResponse,
  StudentSubmissionRequest,
  StudentSubmissionResponse,
  PaginatedResponse,
} from '../types';
import {
  NotFoundError,
  ValidationError,
} from '../middleware/errorHandler';

// ===== CONFIGURAÇÃO DO PRISMA =====

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// ===== INTERFACES =====

interface LeaderboardEntry {
  studentName: string;
  score: number;
  percentage: number;
  timeSpent: number;
  completedAt: Date;
  rank: number;
}

// ===== CLASSE PRINCIPAL =====

class StudentService {
  /**
   * Realiza login do estudante
   */
  async loginStudent(data: StudentLoginRequest): Promise<StudentLoginResponse> {
    try {
      // Verificar se o nome do estudante é válido
      if (!data.studentName || data.studentName.trim().length === 0) {
        throw new ValidationError('Nome do estudante é obrigatório');
      }

      // Validação básica do nome do estudante
      const studentName = data.studentName.trim();

      // Buscar teste pelo código de acesso
      const test = await prisma.test.findFirst({
        where: {
          accessCode: data.accessCode,
          status: 'ACTIVE',
        },
      });

      if (!test) {
        throw new NotFoundError('Teste não encontrado ou inativo');
      }

      // Buscar tentativas anteriores do estudante
      const studentAttempts = await prisma.studentAttempt.findMany({
        where: {
          studentName: studentName,
          testId: test.id,
        },
      });

      // Verificar se o estudante já atingiu o limite de tentativas
      if (studentAttempts.length >= test.maxAttempts) {
        throw new ValidationError('Limite de tentativas atingido para este teste');
      }

      return {
        success: true,
        data: {
          id: test.id,
          title: test.title,
          duration: test.duration || undefined,
          maxAttempts: test.maxAttempts,
          showResults: test.showResults,
          shuffleQuestions: test.shuffleQuestions,
          shuffleOptions: test.shuffleOptions,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      logger.error('Erro no login do estudante', error, {
        studentName: data.studentName,
      });
      throw new ValidationError('Erro interno do servidor');
    }
  }

  /**
   * Inicia uma nova tentativa de teste
   */
  async startAttempt(studentId: string, testId: string): Promise<StudentAttemptResponse> {
    try {
      // Busca o teste com suas questões
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderNum: 'asc',
            },
          },
          school: true,
        },
      });

      if (!test) {
        throw new NotFoundError('Teste não encontrado');
      }

      if (test.status !== 'ACTIVE') {
        throw new ValidationError('Teste não está ativo');
      }

      // Verificar se o teste está ativo
      if (test.status !== 'ACTIVE') {
        throw new ValidationError('Este teste não está mais disponível');
      }

      // Verificar tentativas anteriores pelo nome do estudante
      const existingAttempts = await prisma.studentAttempt.count({
        where: {
          testId: testId,
          studentName: studentId, // studentId agora é o nome do estudante
        },
      });

      if (existingAttempts >= test.maxAttempts) {
        throw new ValidationError(
          `Número máximo de tentativas (${test.maxAttempts}) excedido`
        );
      }

      // Verifica se há tentativa em progresso
      const inProgressAttempt = await prisma.studentAttempt.findFirst({
        where: {
          studentName: studentId, // studentId agora é o nome do estudante
          testId,
          completedAt: null,
        },
      });

      if (inProgressAttempt) {
        // Retorna a tentativa em progresso
        return this.getAttempt(inProgressAttempt.id);
      }

      // Embaralha as questões se necessário
      const shuffledQuestions = test.shuffleQuestions
        ? this.shuffleArray(test.questions)
        : test.questions;

      // Embaralha as opções de cada questão se necessário
      const questionsWithShuffledOptions = shuffledQuestions.map((testQuestion) => {
        const question = testQuestion.question;
        return {
          id: question.id,
          statement: question.statement,
          subject: question.subject,
          difficulty: question.difficulty,
          points: testQuestion.points,
          orderNum: testQuestion.orderNum,
          alternatives: test.shuffleOptions
            ? this.shuffleArray([...question.alternatives])
            : question.alternatives,
        };
      });

      // Cria nova tentativa
      const attempt = await prisma.studentAttempt.create({
        data: {
          studentName: studentId, // studentId agora é o nome do estudante
          testId,
          schoolId: test.schoolId!,
          grade: 'N/A',
          classroom: 'N/A',
          startedAt: new Date(),
          answers: {},
          analytics: {
            questionsOrder: questionsWithShuffledOptions.map((q) => q.id),
            optionsOrder: questionsWithShuffledOptions.reduce(
              (acc, question) => {
                acc[question.id] = question.alternatives.map((_: string, index: number) => index);
                return acc;
              },
              {} as Record<string, number[]>
            ),
          },
        },
        include: {
          test: {
            select: {
              id: true,
              title: true,
              description: true,
              duration: true,
              maxAttempts: true,
            },
          },
        },
      });

      logger.info('Nova tentativa iniciada', {
        attemptId: attempt.id,
        studentName: studentId,
        testId,
      });

      return {
        id: attempt.id,
        studentName: attempt.studentName,
        grade: attempt.grade,
        classroom: attempt.classroom,
        testId: attempt.testId,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt || undefined,
        duration: attempt.duration || undefined,
        score: attempt.score || undefined,
        totalPoints: attempt.totalPoints || undefined,
        answers: attempt.answers as Record<string, number>,
      };
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      logger.error('Erro ao iniciar tentativa', error, { studentId, testId });
      throw new ValidationError('Erro interno do servidor');
    }
  }

  /**
   * Submete resposta para uma questão
   */
  async submitAnswer(
    attemptId: string,
    data: StudentSubmissionRequest
  ): Promise<StudentSubmissionResponse> {
    try {
      const attempt = await prisma.studentAttempt.findUnique({
        where: { id: attemptId },
        include: {
          test: {
            include: {
              questions: {
                include: {
                  question: true,
                },
                orderBy: {
                  orderNum: 'asc',
                },
              },
            },
          },
        },
      });

      if (!attempt) {
        throw new NotFoundError('Tentativa não encontrada');
      }

      if (attempt.completedAt !== null) {
        throw new ValidationError('Tentativa já foi finalizada');
      }

      // Verifica se o tempo limite foi excedido
      const timeElapsed = Date.now() - new Date(attempt.startedAt).getTime();
      const timeLimitMs = Number(attempt.test.duration) * 60 * 1000; // converte para ms

      if (timeElapsed > timeLimitMs) {
        // Auto-submete a tentativa
        await this.autoSubmitAttempt(attemptId);
        throw new ValidationError('Tempo limite excedido');
      }

      // Busca a questão
      const testQuestion = attempt.test.questions.find(
        (tq) => tq.question.id === data.questionId
      );

      if (!testQuestion) {
        throw new NotFoundError('Questão não encontrada');
      }

      const question = testQuestion.question;

      // Converte selectedOption para número
      const selectedOptionNum = parseInt(data.selectedOption);
      
      // Verifica se a opção selecionada é válida
      if (selectedOptionNum < 0 || selectedOptionNum >= question.alternatives.length) {
        throw new NotFoundError('Opção não encontrada');
      }

      // Determina se a resposta está correta
      const isCorrect = selectedOptionNum === question.correctAnswer;

      // Atualiza as respostas
      const currentAnswers = (attempt.answers as any) || {};
      currentAnswers[data.questionId] = selectedOptionNum;

      // Atualiza a tentativa
      await prisma.studentAttempt.update({
        where: { id: attemptId },
        data: {
          answers: currentAnswers,
          analytics: {
            ...(attempt.analytics as any),
            lastAnsweredAt: new Date(),
          },
        },
      });

      logger.info('Resposta submetida', {
        attemptId,
        questionId: data.questionId,
        selectedOption: data.selectedOption,
        isCorrect: isCorrect,
      });

      return {
        success: true,
        data: {
          questionId: data.questionId,
          isCorrect: isCorrect,
          timeSpent: data.timeSpent,
          totalAnswered: Object.keys(currentAnswers).length,
        }
      };
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      logger.error('Erro ao submeter resposta', error, {
        attemptId,
        questionId: data.questionId,
      });
      throw new ValidationError('Erro interno do servidor');
    }
  }

  /**
   * Finaliza uma tentativa
   */
  async submitAttempt(attemptId: string): Promise<StudentAttemptResponse> {
    try {
      // Busca a tentativa com todas as informações necessárias
      const attempt = await prisma.studentAttempt.findUnique({
        where: { id: attemptId },
        include: {
          test: {
            include: {
              questions: {
                include: {
                  question: true,
                },
              },
            },
          },
        },
      });

      if (!attempt) {
        throw new NotFoundError('Tentativa não encontrada');
      }

      if (attempt.completedAt !== null) {
        throw new ValidationError('Tentativa já foi finalizada');
      }

      // Calcula métricas finais
      const submittedAt = new Date();
      const timeSpent = submittedAt.getTime() - new Date(attempt.startedAt).getTime();
      const answers = (attempt.answers as any) || {};

      // Calcula pontuação
      const totalQuestions = attempt.test.questions.length;
      const correctAnswers = Object.values(answers).filter(
        (answer: any) => answer.isCorrect
      ).length;
      const score = correctAnswers;
      const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

      // Atualiza a tentativa
      const updatedAttempt = await prisma.studentAttempt.update({
        where: { id: attemptId },
        data: {
          completedAt: submittedAt,
          duration: Math.floor(timeSpent / (1000 * 60)), // em minutos
          score,
          analytics: {
            ...(attempt.analytics as any),
            submittedAt,
            finalTimeSpent: timeSpent,
          },
        },
        include: {
          test: {
            select: {
              id: true,
              title: true,
              description: true,
              duration: true,
              maxAttempts: true,
            },
          },
        },
      });

      // Remove do cache
      await cache.del(`student_attempt:${attemptId}`);

      // Adiciona job para processamento adicional
      await queueJobs.processAttempt(attemptId);

      logger.info('Tentativa finalizada', {
        attemptId,
        score,
        percentage,
        timeSpent: Math.floor(timeSpent / 1000), // em segundos
      });

      return {
          id: updatedAttempt.id,
          studentName: updatedAttempt.studentName,
          grade: updatedAttempt.grade,
          classroom: updatedAttempt.classroom,
          testId: updatedAttempt.testId,
          startedAt: updatedAttempt.startedAt,
          completedAt: updatedAttempt.completedAt || new Date(),
          duration: updatedAttempt.duration || 0,
          score: updatedAttempt.score || 0,
          totalPoints: updatedAttempt.totalPoints || 0,
          answers: updatedAttempt.answers as Record<string, number>,
        };
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      logger.error('Erro ao finalizar tentativa', error, { attemptId });
      throw new ValidationError('Erro interno do servidor');
    }
  }

  /**
   * Obtém detalhes de uma tentativa
   */
  async getAttempt(attemptId: string): Promise<StudentAttemptResponse> {
    try {
      const cacheKey = `student_attempt:${attemptId}`;
      const cached = await cache.get(cacheKey);

      if (cached) {
        return cached as StudentAttemptResponse;
      }

      const attempt = await prisma.studentAttempt.findUnique({
        where: { id: attemptId },
        include: {
          test: {
            include: {
              questions: {
                include: {
                  question: true,
                },
              },
            },
          },
        },
      });

      if (!attempt) {
        throw new NotFoundError('Tentativa não encontrada');
      }

      // Se a tentativa ainda está em progresso, retorna as questões
      if (!attempt.completedAt) {
        const analytics = attempt.analytics as any;
        const questionsOrder = analytics?.questionsOrder || [];
        const optionsOrder = analytics?.optionsOrder || {};

        // Reordena as questões conforme a ordem original da tentativa
        const orderedQuestions = questionsOrder.length > 0
          ? questionsOrder.map((questionId: string) =>
              attempt.test.questions.find((q) => q.id === questionId)
            ).filter(Boolean)
          : attempt.test.questions;

        orderedQuestions.map((question: any) => {
          const questionOptionsOrder = optionsOrder[question.id] || [];
          const orderedOptions = questionOptionsOrder.length > 0
            ? questionOptionsOrder.map((optionId: string) =>
                question.options.find((opt: any) => opt.id === optionId)
              ).filter(Boolean)
            : question.options;

          return {
            id: question.id,
            text: question.text,
            type: question.type,
            points: question.points,
            options: orderedOptions.map((option: any) => ({
              id: option.id,
              text: option.text,
              // Não retorna se a opção é correta durante a tentativa
            })),
          };
        });
      }

      const result: StudentAttemptResponse = {
        id: attempt.id,
        studentName: attempt.studentName,
        grade: attempt.grade,
        classroom: attempt.classroom,
        testId: attempt.testId,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt || undefined,
        duration: attempt.duration || undefined,
        score: attempt.score || undefined,
        totalPoints: attempt.totalPoints || undefined,
        answers: attempt.answers as Record<string, number>,
      };

      // Cache apenas tentativas finalizadas
      if (attempt.completedAt) {
        await cache.set(cacheKey, result, 3600); // 1 hora
      }

      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Erro ao obter tentativa', error, { attemptId });
      throw new ValidationError('Erro interno do servidor');
    }
  }

  /**
   * Lista tentativas de um estudante
   */
  async getStudentAttempts(
    studentId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponse<any>> {
    try {
      const offset = (page - 1) * limit;

      const [attempts, total] = await Promise.all([
        prisma.studentAttempt.findMany({
          where: { studentName: studentId },
          include: {
            test: {
              select: {
                id: true,
                title: true,
                description: true,
                duration: true,
                maxAttempts: true,
              },
            },
          },
          orderBy: {
            startedAt: 'desc',
          },
          skip: offset,
          take: limit,
        }),
        prisma.studentAttempt.count({
          where: { studentName: studentId },
        }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data: attempts.map((attempt) => ({
          id: attempt.id,
          testId: attempt.testId,
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt,
          duration: attempt.duration,
          score: attempt.score,
          percentage: attempt.score && attempt.totalPoints ? Math.round((attempt.score / attempt.totalPoints) * 100) : 0,
          test: attempt.test,
        })),
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
      logger.error('Erro ao listar tentativas do estudante', error, {
        studentId,
        page,
        limit,
      });
      throw new ValidationError('Erro interno do servidor');
    }
  }

  /**
   * Obtém leaderboard de um teste
   */
  async getTestLeaderboard(
    testId: string,
    limit: number = 50
  ): Promise<LeaderboardEntry[]> {
    try {
      const cacheKey = `leaderboard:${testId}`;
      const cachedData = await cache.get(cacheKey) as LeaderboardEntry[] | null;

      if (cachedData) {
        return cachedData.slice(0, limit);
      }

      const attempts = await prisma.studentAttempt.findMany({
        where: {
          testId,
          completedAt: {
            not: null,
          },
        },

        orderBy: [
          { score: 'desc' },
          { duration: 'asc' },
          { completedAt: 'asc' },
        ],
      });

      if (attempts.length > 0) {
        const leaderboard: LeaderboardEntry[] = attempts.map((attempt, index) => ({
          studentName: attempt.studentName,
          score: attempt.score || 0,
          percentage: attempt.score && attempt.totalPoints ? Math.round((attempt.score / attempt.totalPoints) * 100) : 0,
          timeSpent: attempt.duration || 0,
          completedAt: attempt.completedAt!,
          rank: index + 1,
        }));

        // Cache por 30 minutos
        await cache.set(cacheKey, leaderboard, 1800);
      
        return leaderboard.slice(0, limit);
      }

      return [];
    } catch (error) {
      logger.error('Erro ao obter leaderboard', error, { testId });
      throw error;
    }
  }

  /**
   * Auto-submete tentativa por tempo limite
   */
  async autoSubmitAttempt(attemptId: string): Promise<void> {
    try {
      logger.info('Auto-submetendo tentativa por tempo limite', { attemptId });

      const attempt = await prisma.studentAttempt.findUnique({
        where: { id: attemptId },
        include: {
          test: {
            include: {
              questions: true,
            },
          },
        },
      });

      if (!attempt || attempt.completedAt !== null) {
        return;
      }

      const submittedAt = new Date();
      const timeSpent = submittedAt.getTime() - new Date(attempt.startedAt).getTime();
      const answers = (attempt.answers as any) || {};
      
      // Calcula pontuação básica
      const totalQuestions = attempt.test.questions.length;
      const correctAnswers = Object.values(answers).filter(
        (answer: any) => answer.isCorrect
      ).length;
      const score = correctAnswers;
      const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

      // Atualiza a tentativa
      await prisma.studentAttempt.update({
        where: { id: attemptId },
        data: {
          completedAt: submittedAt,
          duration: Math.floor(timeSpent / (1000 * 60)), // em minutos
          score,
          analytics: {
            ...(attempt.analytics as any),
            autoSubmitted: true,
            reason: 'time_limit',
          },
        },
      });

      // Adiciona job para processamento
      await queueJobs.processAttempt(attemptId);

      // Remove do cache
      await cache.del(`student_attempt:${attemptId}`);

      logger.info('Tentativa auto-submetida com sucesso', {
        attemptId,
        score,
        percentage,
      });
    } catch (error) {
      logger.error('Erro ao auto-submeter tentativa', error, { attemptId });
    }
  }

  /**
   * Limpa tentativas antigas em progresso
   */
  async cleanupStaleAttempts(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas atrás

      const staleAttempts = await prisma.studentAttempt.findMany({
        where: {
          completedAt: null,
          startedAt: {
            lt: cutoffTime,
          },
        },
      });

      for (const attempt of staleAttempts) {
        await this.autoSubmitAttempt(attempt.id);
      }

      logger.info('Limpeza de tentativas antigas concluída', {
        cleanedAttempts: staleAttempts.length,
      });
    } catch (error) {
      logger.error('Erro na limpeza de tentativas antigas', error);
    }
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Embaralha array usando algoritmo Fisher-Yates
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j]!;
      shuffled[j] = temp!;
    }
    return shuffled;
  }
}

// ===== INSTÂNCIA SINGLETON =====

export const studentService = new StudentService();

export default studentService;