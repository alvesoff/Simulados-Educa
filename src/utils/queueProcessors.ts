import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import cache from './cache';
import { JobType, queueManager } from './queue';

// ===== INICIALIZAÇÃO =====

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// ===== PROCESSADORES DE JOBS =====

/**
 * Processa tentativa de aluno
 */
const processAttemptJob = async (job: Job<{ attemptId: string }>): Promise<void> => {
  const { attemptId } = job.data;
  
  try {
    logger.debug(`Processando tentativa ${attemptId}`);

    // Busca a tentativa com dados relacionados
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
      throw new Error(`Tentativa ${attemptId} não encontrada`);
    }

    // Calcula pontuação
    let totalScore = 0;
    let correctAnswers = 0;
    const answers = attempt.answers as any;

    for (const testQuestion of attempt.test.questions) {
      const userAnswer = answers[testQuestion.questionId];
      const correctAnswer = testQuestion.question.correctAnswer;

      if (userAnswer === correctAnswer) {
        correctAnswers++;
        // Pontuação baseada na dificuldade
        switch (testQuestion.question.difficulty) {
          case 'EASY':
            totalScore += 1;
            break;
          case 'MEDIUM':
            totalScore += 2;
            break;
          case 'HARD':
            totalScore += 3;
            break;
        }
      }
    }

    // Calcula percentual
    const totalQuestions = attempt.test.questions.length;
    const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

    // Atualiza a tentativa
    await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: {
        score: totalScore,
        completedAt: new Date(),
      },
    });

    // Invalida caches relacionados
    await Promise.all([
      cache.del(`user:attempts:${attempt.studentName}`),
      cache.invalidateTestCache(attempt.testId),
      cache.del(`attempt:${attemptId}`),
    ]);

    // Agenda atualização do leaderboard
    await queueManager.addJob(JobType.UPDATE_LEADERBOARD, {
      testId: attempt.testId,
    }, { priority: 'normal' });

    logger.debug(`Tentativa ${attemptId} processada com sucesso`, {
      score: totalScore,
      percentage,
      correctAnswers,
      totalQuestions,
    });
  } catch (error) {
    logger.error(`Erro ao processar tentativa ${attemptId}`, error);
    throw error;
  }
};

/**
 * Calcula pontuação detalhada
 */
const calculateScoreJob = async (job: Job<{ attemptId: string }>): Promise<void> => {
  const { attemptId } = job.data;
  
  try {
    logger.debug(`Calculando pontuação detalhada para tentativa ${attemptId}`);

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
      throw new Error(`Tentativa ${attemptId} não encontrada`);
    }

    const answers = attempt.answers as any;
    const detailedResults = [];
    let timeBonus = 0;

    // Calcula tempo médio por questão
    const totalTime = attempt.duration || 0;
    const avgTimePerQuestion = totalTime / attempt.test.questions.length;

    for (const testQuestion of attempt.test.questions) {
      const userAnswer = answers[testQuestion.questionId];
      const correctAnswer = testQuestion.question.correctAnswer;
      const isCorrect = userAnswer === correctAnswer;

      // Bônus de tempo (se respondeu rápido e correto)
      let questionTimeBonus = 0;
      if (isCorrect && avgTimePerQuestion < 30000) { // Menos de 30 segundos
        questionTimeBonus = 0.5;
      }

      detailedResults.push({
        questionId: testQuestion.questionId,
        userAnswer,
        correctAnswer,
        isCorrect,
        difficulty: testQuestion.question.difficulty,
        timeBonus: questionTimeBonus,
      });

      timeBonus += questionTimeBonus;
    }

    // Atualiza com dados detalhados no campo analytics
    await prisma.studentAttempt.update({
      where: { id: attemptId },
      data: {
        analytics: {
          detailedResults,
          timeBonus,
          finalScore: (attempt.score || 0) + timeBonus,
        },
      },
    });

    logger.debug(`Pontuação detalhada calculada para tentativa ${attemptId}`, {
      timeBonus,
      finalScore: (attempt.score || 0) + timeBonus,
    });
  } catch (error) {
    logger.error(`Erro ao calcular pontuação detalhada para tentativa ${attemptId}`, error);
    throw error;
  }
};

/**
 * Atualiza leaderboard do teste
 */
const updateLeaderboardJob = async (job: Job<{ testId: string }>): Promise<void> => {
  const { testId } = job.data;
  
  try {
    logger.debug(`Atualizando leaderboard do teste ${testId}`);

    // Busca as melhores tentativas
    const topAttempts = await prisma.studentAttempt.findMany({
      where: {
        testId,
        completedAt: { not: null },
      },
      orderBy: [
        { score: 'desc' },
        { duration: 'asc' },
        { completedAt: 'asc' },
      ],
      take: 100, // Top 100
    });

    // Agrupa por usuário (melhor tentativa de cada)
    const userBestAttempts = new Map();
    
    for (const attempt of topAttempts) {
      if (!userBestAttempts.has(attempt.studentName)) {
        userBestAttempts.set(attempt.studentName, attempt);
      }
    }

    const leaderboard = Array.from(userBestAttempts.values())
      .map((attempt, index) => ({
        position: index + 1,
        studentName: attempt.studentName,
        score: attempt.score,
        duration: attempt.duration,
        completedAt: attempt.completedAt,
      }))
      .slice(0, 50); // Top 50 final

    // Salva no cache
    await cache.set(
      `leaderboard:${testId}`,
      leaderboard,
      1800 // 30 minutos
    );

    // Atualiza estatísticas do teste
    const stats = await prisma.studentAttempt.aggregate({
      where: {
        testId,
        completedAt: { not: null },
      },
      _avg: {
        score: true,
        duration: true,
      },
      _count: true,
      _max: {
        score: true,
      },
      _min: {
        score: true,
      },
    });

    await cache.set(
      `test:stats:${testId}`,
      {
        totalAttempts: stats._count,
        averageScore: stats._avg.score,
        averageTime: stats._avg.duration,
        maxScore: stats._max.score,
        minScore: stats._min.score,
        updatedAt: new Date(),
      },
      1800 // 30 minutos
    );

    logger.debug(`Leaderboard atualizado para teste ${testId}`, {
      topPlayersCount: leaderboard.length,
      totalAttempts: stats._count,
    });
  } catch (error) {
    logger.error(`Erro ao atualizar leaderboard do teste ${testId}`, error);
    throw error;
  }
};

/**
 * Invalida cache por padrão
 */
const invalidateCacheJob = async (job: Job<{ pattern: string }>): Promise<void> => {
  const { pattern } = job.data;
  
  try {
    logger.debug(`Invalidando cache com padrão: ${pattern}`);
    
    await cache.delPattern(pattern);
    
    logger.debug(`Cache invalidado com sucesso para padrão: ${pattern}`);
  } catch (error) {
    logger.error(`Erro ao invalidar cache com padrão ${pattern}`, error);
    throw error;
  }
};

/**
 * Sincroniza questões da API externa
 */
const syncQuestionsJob = async (_job: Job): Promise<void> => {
  try {
    logger.debug('Iniciando sincronização de questões');

    // Aqui você implementaria a lógica de sincronização
    // com a API externa de questões
    
    // Exemplo básico:
    // const response = await fetch(config.QUESTIONS_API_URL);
    // const questions = await response.json();
    // 
    // for (const questionData of questions) {
    //   await prisma.question.upsert({
    //     where: { externalId: questionData.id },
    //     update: questionData,
    //     create: questionData,
    //   });
    // }

    logger.debug('Sincronização de questões concluída');
  } catch (error) {
    logger.error('Erro na sincronização de questões', error);
    throw error;
  }
};

/**
 * Limpa dados antigos
 */
const cleanupOldDataJob = async (_job: Job): Promise<void> => {
  try {
    logger.debug('Iniciando limpeza de dados antigos');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Remove refresh tokens expirados
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    // Remove tentativas muito antigas de testes inativos
    const deletedAttempts = await prisma.studentAttempt.deleteMany({
      where: {
        completedAt: {
          lt: thirtyDaysAgo,
        },
        test: {
          status: 'COMPLETED',
        },
      },
    });

    logger.debug('Limpeza de dados antigos concluída', {
      deletedTokens: deletedTokens.count,
      deletedAttempts: deletedAttempts.count,
    });
  } catch (error) {
    logger.error('Erro na limpeza de dados antigos', error);
    throw error;
  }
};

/**
 * Gera relatório
 */
const generateReportJob = async (job: Job<any>): Promise<void> => {
  const reportConfig = job.data;
  
  try {
    logger.debug('Gerando relatório', { config: reportConfig });

    // Aqui você implementaria a lógica de geração de relatórios
    // baseada na configuração recebida
    
    logger.debug('Relatório gerado com sucesso');
  } catch (error) {
    logger.error('Erro ao gerar relatório', error, { config: reportConfig });
    throw error;
  }
};

/**
 * Envia notificação
 */
const sendNotificationJob = async (job: Job<any>): Promise<void> => {
  const notificationData = job.data;
  
  try {
    logger.debug('Enviando notificação', { data: notificationData });

    // Aqui você implementaria a lógica de envio de notificações
    // (email, push, SMS, etc.)
    
    logger.debug('Notificação enviada com sucesso');
  } catch (error) {
    logger.error('Erro ao enviar notificação', error, { data: notificationData });
    throw error;
  }
};

// ===== MAPEAMENTO DE PROCESSADORES =====

const processors = {
  [JobType.PROCESS_ATTEMPT]: processAttemptJob,
  [JobType.CALCULATE_SCORE]: calculateScoreJob,
  [JobType.UPDATE_LEADERBOARD]: updateLeaderboardJob,
  [JobType.INVALIDATE_CACHE]: invalidateCacheJob,
  [JobType.SYNC_QUESTIONS]: syncQuestionsJob,
  [JobType.CLEANUP_OLD_DATA]: cleanupOldDataJob,
  [JobType.GENERATE_REPORT]: generateReportJob,
  [JobType.SEND_NOTIFICATION]: sendNotificationJob,
  [JobType.SEND_EMAIL]: sendNotificationJob, // Reutiliza o mesmo processador
  [JobType.EXPORT_DATA]: generateReportJob, // Reutiliza o mesmo processador
  [JobType.BACKUP_DATA]: cleanupOldDataJob, // Placeholder
};

// ===== CONFIGURAÇÃO DOS PROCESSADORES =====

/**
 * Configura todos os processadores nas filas
 */
export const setupQueueProcessors = async (): Promise<void> => {
  try {
    logger.system('Configurando processadores de filas');

    // Configura processadores para cada fila
    const queues = ['high-priority', 'normal-priority', 'low-priority'];
    
    for (const queueName of queues) {
      const queue = queueManager.getQueue(
        queueName.replace('-priority', '') as 'high' | 'normal' | 'low'
      );
      
      if (!queue) continue;

      // Configura concorrência baseada na prioridade
      const concurrency = queueName === 'high-priority' ? 10 : 
                         queueName === 'normal-priority' ? 5 : 2;

      // Registra processadores para cada tipo de job
      for (const [jobType, processor] of Object.entries(processors)) {
        queue.process(jobType, concurrency, async (job) => {
          const startTime = Date.now();
          
          try {
            await processor(job);
            
            const duration = Date.now() - startTime;
            logger.debug(`Job ${jobType} processado com sucesso`, {
              jobId: job.id,
              duration,
              queue: queueName,
            });
          } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Erro no processamento do job ${jobType}`, error, {
              jobId: job.id,
              duration,
              queue: queueName,
              data: job.data,
            });
            throw error;
          }
        });
      }

      logger.system(`Processadores configurados para fila '${queueName}' com concorrência ${concurrency}`);
    }

    logger.system('Todos os processadores de filas configurados');
  } catch (error) {
    logger.error('Erro ao configurar processadores de filas', error);
    throw error;
  }
};

// ===== JOBS AGENDADOS =====

/**
 * Configura jobs recorrentes
 */
export const setupRecurringJobs = async (): Promise<void> => {
  try {
    logger.system('Configurando jobs recorrentes');

    // Limpeza de dados antigos - diariamente às 2h
    await queueManager.addJob(
      JobType.CLEANUP_OLD_DATA,
      {},
      {
        priority: 'low',
        delay: getDelayUntil(2, 0), // 2:00 AM
      }
    );

    // Sincronização de questões - a cada 6 horas
    await queueManager.addJob(
      JobType.SYNC_QUESTIONS,
      {},
      {
        priority: 'low',
        delay: 6 * 60 * 60 * 1000, // 6 horas
      }
    );

    logger.system('Jobs recorrentes configurados');
  } catch (error) {
    logger.error('Erro ao configurar jobs recorrentes', error);
  }
};

// ===== UTILITÁRIOS =====

/**
 * Calcula delay até uma hora específica
 */
function getDelayUntil(hour: number, minute: number = 0): number {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  
  return target.getTime() - now.getTime();
}

/**
 * Graceful shutdown dos processadores
 */
export const shutdownProcessors = async (): Promise<void> => {
  try {
    logger.system('Iniciando shutdown dos processadores');
    
    await prisma.$disconnect();
    
    logger.system('Processadores desconectados');
  } catch (error) {
    logger.error('Erro no shutdown dos processadores', error);
  }
};

export default {
  setupQueueProcessors,
  setupRecurringJobs,
  shutdownProcessors,
  processors,
};