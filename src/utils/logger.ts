import * as winston from 'winston';
import { PerformanceMetrics } from '../types';

// ===== CONFIGURAÇÃO DE LOGGING PARA ALTA PERFORMANCE =====

class Logger {
  private logger!: winston.Logger;
  private performanceLogger!: winston.Logger;
  private errorLogger!: winston.Logger;
  private accessLogger!: winston.Logger;

  constructor() {
    this.setupLoggers();
  }

  private setupLoggers(): void {
    // Formato customizado para logs
    const customFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          ...meta,
          pid: process.pid,
          memory: process.memoryUsage().heapUsed,
        });
      })
    );

    // Logger principal
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: customFormat,
      defaultMeta: {
        service: 'educasmart-backend',
        version: '2.0.0',
      },
      transports: [
        // Console para desenvolvimento
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
          silent: process.env.NODE_ENV === 'test',
        }),
        
        // Arquivo para logs gerais
        new winston.transports.File({
          filename: 'logs/app.log',
          level: 'info',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 7,
        }),
      ],
      // Não sair em caso de erro
      exitOnError: false,
    });

    // Logger específico para performance
    this.performanceLogger = winston.createLogger({
      level: 'info',
      format: customFormat,
      transports: [
        new winston.transports.File({
          filename: 'logs/performance.log',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 3,
        }),
      ],
    });

    // Logger específico para erros
    this.errorLogger = winston.createLogger({
      level: 'error',
      format: customFormat,
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 14,
        }),
      ],
    });

    // Logger para access logs (crítico para análise de tráfego)
    this.accessLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/access.log',
          maxsize: 200 * 1024 * 1024, // 200MB
          maxFiles: 7,
        }),
      ],
    });
  }

  // ===== MÉTODOS DE LOG BÁSICOS =====

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const errorMeta = {
      ...meta,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    };
    
    this.logger.error(message, errorMeta);
    this.errorLogger.error(message, errorMeta);
  }

  // ===== LOGS ESPECÍFICOS DO SISTEMA =====

  /**
   * Log de acesso HTTP (crítico para monitoramento)
   */
  access(req: any, res: any, responseTime: number): void {
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id,
      schoolId: req.user?.schoolId,
      contentLength: res.get('Content-Length'),
      referer: req.get('Referer'),
    };

    this.accessLogger.info('HTTP Request', logData);
  }

  /**
   * Log de performance (crítico para otimização)
   */
  performance(operation: string, meta?: any): void {
    const duration = meta?.duration || 0;
    const perfData = {
      operation,
      duration: typeof duration === 'number' ? `${duration}ms` : duration,
      ...meta,
    };

    this.performanceLogger.info('Performance Metric', perfData);
    
    // Log warning se operação for muito lenta
    if (typeof duration === 'number' && duration > 1000) {
      this.warn(`Operação lenta detectada: ${operation}`, perfData);
    }
  }

  /**
   * Log de autenticação
   */
  auth(action: string, meta?: any): void {
    this.info(`Auth: ${action}`, {
      action,
      ...meta,
    });
  }

  /**
   * Log de operações de teste (crítico para auditoria)
   */
  testOperation(action: string, testId: string, userId: string, meta?: any): void {
    this.info(`Test Operation: ${action}`, {
      testId,
      userId,
      action,
      ...meta,
    });
  }

  /**
   * Log de tentativas de aluno (crítico para análise)
   */
  studentAttempt(action: string, attemptId: string, testId: string, meta?: any): void {
    this.info(`Student Attempt: ${action}`, {
      attemptId,
      testId,
      action,
      ...meta,
    });
  }

  /**
   * Log de cache (para otimização)
   */
  cache(action: string, key: string, hit: boolean, meta?: any): void {
    this.debug(`Cache ${action}`, {
      key,
      hit,
      action,
      ...meta,
    });
  }

  /**
   * Log de database (para otimização de queries)
   */
  database(query: string, duration: number, meta?: any): void {
    const dbData = {
      query: query.substring(0, 200), // Limita tamanho do log
      duration: `${duration}ms`,
      ...meta,
    };

    this.performanceLogger.info('Database Query', dbData);
    
    // Log warning para queries lentas
    if (duration > 500) {
      this.warn('Query lenta detectada', dbData);
    }
  }

  /**
   * Log de sistema (startup, shutdown, etc.)
   */
  system(event: string, meta?: any): void {
    this.info(`System: ${event}`, {
      event,
      ...meta,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  }

  /**
   * Log de métricas de performance
   */
  metrics(metrics: PerformanceMetrics): void {
    this.performanceLogger.info('System Metrics', metrics);
  }

  // ===== LOGS DE SEGURANÇA =====

  /**
   * Log de tentativas de acesso suspeitas
   */
  security(event: string, ip: string, meta?: any): void {
    this.warn(`Security: ${event}`, {
      event,
      ip,
      ...meta,
    });
  }

  /**
   * Log de rate limiting
   */
  rateLimit(ip: string, endpoint: string, meta?: any): void {
    this.logger.warn('Rate limit exceeded', {
      ip,
      endpoint,
      ...meta,
    });
  }

  // Log específico para atividades de estudantes
  student(action: string, meta?: any): void {
    this.logger.info('Student activity', {
      action,
      ...meta,
    });
  }

  // Log específico para operações de questões
  question(action: string, meta?: any): void {
    this.logger.info('Question operation', {
      action,
      ...meta,
    });
  }

  // ===== UTILITÁRIOS =====

  /**
   * Cria um timer para medir performance
   */
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }

  /**
   * Wrapper para medir performance de funções
   */
  async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    meta?: any
  ): Promise<T> {
    const timer = this.startTimer();
    try {
      const result = await fn();
      this.performance(operation, { duration: timer(), ...meta, success: true });
      return result;
    } catch (error) {
      this.performance(operation, { duration: timer(), ...meta, success: false, error });
      throw error;
    }
  }

  /**
   * Health check do sistema de logs
   */
  healthCheck(): boolean {
    try {
      this.debug('Logger health check');
      return true;
    } catch (error) {
      console.error('Logger health check failed:', error);
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.end(() => {
        this.performanceLogger.end(() => {
          this.errorLogger.end(() => {
            this.accessLogger.end(() => {
              resolve();
            });
          });
        });
      });
    });
  }
}

// Singleton para garantir uma única instância
export const logger = new Logger();
export default logger;