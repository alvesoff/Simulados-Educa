import Bull, { Queue, Job, JobOptions } from 'bull';
import { logger } from './logger';
import { config } from './config';

// ===== TIPOS DE JOBS =====

export enum JobType {
  // Processamento de tentativas
  PROCESS_ATTEMPT = 'process_attempt',
  CALCULATE_SCORE = 'calculate_score',
  UPDATE_LEADERBOARD = 'update_leaderboard',
  
  // Notificações
  SEND_NOTIFICATION = 'send_notification',
  SEND_EMAIL = 'send_email',
  
  // Cache e limpeza
  INVALIDATE_CACHE = 'invalidate_cache',
  CLEANUP_OLD_DATA = 'cleanup_old_data',
  
  // Relatórios
  GENERATE_REPORT = 'generate_report',
  EXPORT_DATA = 'export_data',
  
  // Sincronização
  SYNC_QUESTIONS = 'sync_questions',
  BACKUP_DATA = 'backup_data',
}

// ===== CONFIGURAÇÕES DE FILAS =====

const queueConfig = {
  redis: config.REDIS_URL || 'redis://localhost:6379',
  redisOptions: {
    connectTimeout: 10000, // Reduzido para recursos limitados
    commandTimeout: 5000, // Reduzido para recursos limitados
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: 3, // Reduzido para recursos limitados
    lazyConnect: true,
    keepAlive: 30000, // Reduzido para 30s
    family: 4,
    // Pool de conexões reduzido para recursos limitados
    maxConnections: 5, // Drasticamente reduzido
    minConnections: 2, // Reduzido
    // Configurações de reconexão para recursos limitados
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000); // Reconexão mais lenta
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY';
      return err.message.includes(targetError);
    },
  },
  defaultJobOptions: {
    removeOnComplete: 50, // Reduzido para recursos limitados
    removeOnFail: 25, // Reduzido para recursos limitados
    attempts: 3, // Menos tentativas para recursos limitados
    backoff: {
      type: 'exponential',
      delay: 2000, // Delay maior para recursos limitados
    },
    // Configurações para alta performance
    jobId: undefined, // Permite duplicatas para alta concorrência
    delay: 0,
    priority: 0,
  } as JobOptions,
  settings: {
    stalledInterval: 30 * 1000, // 30 segundos - detecção mais lenta
    maxStalledCount: 2, // Menos tolerância para recursos limitados
    maxRetriesPerRequest: 3, // Reduzido
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxLoadingTimeout: 5000, // Timeout maior para recursos limitados
    // Configurações para 5K usuários
    concurrency: 2, // Poucos workers para recursos limitados
  },
};

// ===== CLASSE PRINCIPAL DE FILAS =====

class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private isInitialized = false;

  /**
   * Inicializa o gerenciador de filas
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Cria filas com diferentes prioridades
      await this.createQueue('high-priority', { 
        ...queueConfig.defaultJobOptions,
        priority: 10 
      });
      
      await this.createQueue('normal-priority', { 
        ...queueConfig.defaultJobOptions,
        priority: 5 
      });
      
      await this.createQueue('low-priority', { 
        ...queueConfig.defaultJobOptions,
        priority: 1 
      });

      // Configura listeners globais
      this.setupGlobalListeners();

      this.isInitialized = true;
      logger.system('Gerenciador de filas inicializado');
    } catch (error) {
      logger.error('Erro ao inicializar gerenciador de filas', error);
      throw error;
    }
  }

  /**
   * Cria uma nova fila
   */
  private async createQueue(name: string, jobOptions?: JobOptions): Promise<Queue> {
    const queue = new Bull(name, {
      redis: queueConfig.redis,
      defaultJobOptions: jobOptions || queueConfig.defaultJobOptions,
      settings: {
        ...queueConfig.settings,
        ...queueConfig.redisOptions,
      },
    });

    // Configura listeners específicos da fila
    this.setupQueueListeners(queue, name);

    this.queues.set(name, queue);
    logger.system(`Fila '${name}' criada`);
    
    return queue;
  }

  /**
   * Configura listeners globais
   */
  private setupGlobalListeners(): void {
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * Configura listeners específicos de uma fila
   */
  private setupQueueListeners(queue: Queue, queueName: string): void {
    queue.on('ready', () => {
      logger.system(`Fila '${queueName}' pronta`);
    });

    queue.on('error', (error) => {
      // Filtra erros de conexão temporários do Redis que são normais
      if (error.message && (
        error.message.includes('ECONNRESET') ||
        error.message.includes('Connection is closed') ||
        error.message.includes('connect ECONNREFUSED')
      )) {
        logger.debug(`Erro de conexão temporário na fila '${queueName}': ${error.message}`);
        return;
      }
      
      // Log apenas erros críticos
      logger.error(`Erro crítico na fila '${queueName}'`, error);
    });

    queue.on('waiting', (jobId) => {
      logger.debug(`Job ${jobId} aguardando na fila '${queueName}'`);
    });

    queue.on('active', (job) => {
      logger.debug(`Job ${job.id} iniciado na fila '${queueName}'`, {
        jobType: job.name,
        data: job.data,
      });
    });

    queue.on('completed', (job, result) => {
      logger.debug(`Job ${job.id} completado na fila '${queueName}'`, {
        jobType: job.name,
        duration: Date.now() - job.processedOn!,
        result,
      });
    });

    queue.on('failed', (job, error) => {
      logger.error(`Job ${job.id} falhou na fila '${queueName}'`, error, {
        jobType: job.name,
        attempts: job.attemptsMade,
        data: job.data,
      });
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} travado na fila '${queueName}'`, {
        jobType: job.name,
        attempts: job.attemptsMade,
      });
    });
  }

  /**
   * Adiciona um job à fila
   */
  async addJob<T = any>(
    jobType: JobType,
    data: T,
    options: {
      priority?: 'high' | 'normal' | 'low';
      delay?: number;
      attempts?: number;
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    } = {}
  ): Promise<Job<T>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const queueName = `${options.priority || 'normal'}-priority`;
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Fila '${queueName}' não encontrada`);
    }

    const jobOptions: JobOptions = {
      delay: options.delay,
      attempts: options.attempts,
      removeOnComplete: options.removeOnComplete,
      removeOnFail: options.removeOnFail,
    };

    const job = await queue.add(jobType, data, jobOptions);
    
    logger.debug(`Job adicionado à fila`, {
      jobId: job.id,
      jobType,
      queueName,
      data,
    });

    return job;
  }

  /**
   * Obtém uma fila específica
   */
  getQueue(priority: 'high' | 'normal' | 'low' = 'normal'): Queue | undefined {
    return this.queues.get(`${priority}-priority`);
  }

  /**
   * Obtém estatísticas de todas as filas
   */
  async getStats(): Promise<{
    [queueName: string]: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    };
  }> {
    const stats: any = {};

    for (const [name, queue] of this.queues) {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
        queue.isPaused(),
      ]);

      stats[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused ? 1 : 0,
      };
    }

    return stats;
  }

  /**
   * Limpa jobs antigos de todas as filas
   */
  async cleanOldJobs(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        // Remove jobs completados há mais de 1 hora
        await queue.clean(60 * 60 * 1000, 'completed');
        // Remove jobs falhados há mais de 24 horas
        await queue.clean(24 * 60 * 60 * 1000, 'failed');
        
        logger.debug(`Jobs antigos limpos da fila '${name}'`);
      } catch (error) {
        logger.error(`Erro ao limpar jobs da fila '${name}'`, error);
      }
    }
  }

  /**
   * Pausa todas as filas
   */
  async pauseAll(): Promise<void> {
    for (const [name, queue] of this.queues) {
      await queue.pause();
      logger.system(`Fila '${name}' pausada`);
    }
  }

  /**
   * Resume todas as filas
   */
  async resumeAll(): Promise<void> {
    for (const [name, queue] of this.queues) {
      await queue.resume();
      logger.system(`Fila '${name}' resumida`);
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(): Promise<void> {
    logger.system('Iniciando graceful shutdown das filas');

    try {
      // Pausa todas as filas
      await this.pauseAll();

      // Aguarda jobs ativos terminarem (máximo 30 segundos)
      const timeout = 30000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const stats = await this.getStats();
        const hasActiveJobs = Object.values(stats).some(stat => stat.active > 0);
        
        if (!hasActiveJobs) break;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Fecha todas as filas
      for (const [name, queue] of this.queues) {
        await queue.close();
        logger.system(`Fila '${name}' fechada`);
      }

      this.queues.clear();
      this.isInitialized = false;
      
      logger.system('Graceful shutdown das filas concluído');
    } catch (error) {
      logger.error('Erro durante graceful shutdown das filas', error);
    }
  }

  /**
   * Health check das filas
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    queues: { [name: string]: { healthy: boolean; error?: string } };
  }> {
    const result = {
      healthy: true,
      queues: {} as { [name: string]: { healthy: boolean; error?: string } },
    };

    for (const [name, queue] of this.queues) {
      try {
        // Testa conexão básica
        await queue.getWaiting();
        result.queues[name] = { healthy: true };
      } catch (error) {
        result.queues[name] = { 
          healthy: false, 
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        };
        result.healthy = false;
      }
    }

    return result;
  }
}

// ===== INSTÂNCIA GLOBAL =====

export const queueManager = new QueueManager();

// ===== FUNÇÕES DE CONVENIÊNCIA =====

/**
 * Adiciona job de alta prioridade
 */
export const addHighPriorityJob = async <T = any>(
  jobType: JobType,
  data: T,
  options?: Omit<Parameters<typeof queueManager.addJob>[2], 'priority'>
): Promise<Job<T>> => {
  return queueManager.addJob(jobType, data, { ...options, priority: 'high' });
};

/**
 * Adiciona job de prioridade normal
 */
export const addJob = async <T = any>(
  jobType: JobType,
  data: T,
  options?: Omit<Parameters<typeof queueManager.addJob>[2], 'priority'>
): Promise<Job<T>> => {
  return queueManager.addJob(jobType, data, { ...options, priority: 'normal' });
};

/**
 * Adiciona job de baixa prioridade
 */
export const addLowPriorityJob = async <T = any>(
  jobType: JobType,
  data: T,
  options?: Omit<Parameters<typeof queueManager.addJob>[2], 'priority'>
): Promise<Job<T>> => {
  return queueManager.addJob(jobType, data, { ...options, priority: 'low' });
};

/**
 * Adiciona job com delay
 */
export const addDelayedJob = async <T = any>(
  jobType: JobType,
  data: T,
  delayMs: number,
  options?: Omit<Parameters<typeof queueManager.addJob>[2], 'delay'>
): Promise<Job<T>> => {
  return queueManager.addJob(jobType, data, { ...options, delay: delayMs });
};

/**
 * Jobs específicos para o sistema de provas
 */
export const queueJobs = {
  /**
   * Processa tentativa de aluno
   */
  processAttempt: (attemptId: string) => 
    addHighPriorityJob(JobType.PROCESS_ATTEMPT, { attemptId }),

  /**
   * Calcula pontuação
   */
  calculateScore: (attemptId: string) => 
    addJob(JobType.CALCULATE_SCORE, { attemptId }),

  /**
   * Atualiza leaderboard
   */
  updateLeaderboard: (testId: string) => 
    addJob(JobType.UPDATE_LEADERBOARD, { testId }),

  /**
   * Invalida cache
   */
  invalidateCache: (pattern: string) => 
    addHighPriorityJob(JobType.INVALIDATE_CACHE, { pattern }),

  /**
   * Sincroniza questões
   */
  syncQuestions: () => 
    addLowPriorityJob(JobType.SYNC_QUESTIONS, {}),

  /**
   * Limpeza de dados antigos
   */
  cleanupOldData: () => 
    addLowPriorityJob(JobType.CLEANUP_OLD_DATA, {}),

  /**
   * Gera relatório
   */
  generateReport: (reportConfig: any) => 
    addLowPriorityJob(JobType.GENERATE_REPORT, reportConfig),
};

// ===== INICIALIZAÇÃO AUTOMÁTICA =====

// Inicializa automaticamente quando o módulo é importado
setImmediate(async () => {
  try {
    await queueManager.initialize();
  } catch (error) {
    logger.error('Erro na inicialização automática das filas', error);
  }
});

// Limpeza automática de jobs antigos a cada hora
setInterval(async () => {
  try {
    await queueManager.cleanOldJobs();
  } catch (error) {
    logger.error('Erro na limpeza automática de jobs', error);
  }
}, 60 * 60 * 1000); // 1 hora

// ===== FUNÇÕES PARA COMPATIBILIDADE COM APP.TS =====

/**
 * Inicializa as filas (alias para queueManager.initialize)
 */
export const initializeQueues = async (): Promise<void> => {
  return queueManager.initialize();
};

/**
 * Shutdown das filas (alias para queueManager.gracefulShutdown)
 */
export const queueShutdown = async (): Promise<void> => {
  return queueManager.gracefulShutdown();
};

export default {
  queueManager,
  JobType,
  addJob,
  addHighPriorityJob,
  addLowPriorityJob,
  addDelayedJob,
  queueJobs,
  initializeQueues,
  queueShutdown,
};