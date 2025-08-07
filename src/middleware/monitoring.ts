import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { cacheManager as cache } from '../utils/cache';
import { config } from '../utils/config';


// ===== INTERFACES =====

interface RequestMetrics {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  userId?: string;
  userAgent?: string;
  ip: string;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
}

interface SystemMetrics {
  timestamp: Date;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  uptime: number;
  activeConnections: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
}

// ===== CONTADORES E MÉTRICAS =====

class MetricsCollector {
  private requests: RequestMetrics[] = [];
  private readonly maxRequestHistory = 1000;
  private startTime = Date.now();
  private cpuUsageStart = process.cpuUsage();
  
  // Contadores em tempo real
  private counters = {
    totalRequests: 0,
    totalErrors: 0,
    activeConnections: 0,
    requestsLastMinute: 0,
  };

  // Métricas por endpoint
  private endpointMetrics = new Map<string, {
    count: number;
    totalTime: number;
    errors: number;
    lastAccess: Date;
  }>();

  /**
   * Adiciona uma requisição às métricas
   */
  addRequest(metrics: RequestMetrics): void {
    this.requests.push(metrics);
    this.counters.totalRequests++;
    
    if (metrics.statusCode >= 400) {
      this.counters.totalErrors++;
    }

    // Mantém apenas as últimas requisições
    if (this.requests.length > this.maxRequestHistory) {
      this.requests.shift();
    }

    // Atualiza métricas por endpoint
    const endpoint = `${metrics.method} ${metrics.url.split('?')[0]}`;
    const endpointData = this.endpointMetrics.get(endpoint) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      lastAccess: new Date(),
    };

    endpointData.count++;
    endpointData.totalTime += metrics.responseTime;
    endpointData.lastAccess = metrics.timestamp;
    
    if (metrics.statusCode >= 400) {
      endpointData.errors++;
    }

    this.endpointMetrics.set(endpoint, endpointData);
  }

  /**
   * Obtém métricas do sistema
   */
  getSystemMetrics(): SystemMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentRequests = this.requests.filter(
      req => req.timestamp.getTime() > oneMinuteAgo
    );

    const requestsPerMinute = recentRequests.length;
    const averageResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length
      : 0;

    const recentErrors = recentRequests.filter(req => req.statusCode >= 400).length;
    const errorRate = recentRequests.length > 0 ? (recentErrors / recentRequests.length) * 100 : 0;

    return {
      timestamp: new Date(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(this.cpuUsageStart),
      uptime: (now - this.startTime) / 1000,
      activeConnections: this.counters.activeConnections,
      requestsPerMinute,
      averageResponseTime,
      errorRate,
    };
  }

  /**
   * Obtém métricas por endpoint
   */
  getEndpointMetrics(): Array<{
    endpoint: string;
    count: number;
    averageTime: number;
    errorRate: number;
    lastAccess: Date;
  }> {
    return Array.from(this.endpointMetrics.entries()).map(([endpoint, data]) => ({
      endpoint,
      count: data.count,
      averageTime: data.totalTime / data.count,
      errorRate: (data.errors / data.count) * 100,
      lastAccess: data.lastAccess,
    }));
  }

  /**
   * Incrementa conexões ativas
   */
  incrementConnections(): void {
    this.counters.activeConnections++;
  }

  /**
   * Decrementa conexões ativas
   */
  decrementConnections(): void {
    this.counters.activeConnections = Math.max(0, this.counters.activeConnections - 1);
  }

  /**
   * Reseta métricas
   */
  reset(): void {
    this.requests = [];
    this.counters = {
      totalRequests: 0,
      totalErrors: 0,
      activeConnections: 0,
      requestsLastMinute: 0,
    };
    this.endpointMetrics.clear();
    this.startTime = Date.now();
    this.cpuUsageStart = process.cpuUsage();
  }
}

// Instância global do coletor
const metricsCollector = new MetricsCollector();

// ===== MIDDLEWARE DE MONITORAMENTO =====

/**
 * Middleware principal de monitoramento
 */
export const monitoringMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = performance.now();
  const startCpuUsage = process.cpuUsage();
  const startMemory = process.memoryUsage();

  // Incrementa conexões ativas
  metricsCollector.incrementConnections();

  // Captura o final da requisição
  const originalSend = res.send;
  res.send = function(data) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    const endMemory = process.memoryUsage();

    // Coleta métricas da requisição
    const requestMetrics: RequestMetrics = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      timestamp: new Date(),
      userId: (req as any).user?.id,
      userAgent: req.get('User-Agent') || 'unknown',
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      memoryUsage: endMemory,
      cpuUsage: process.cpuUsage(startCpuUsage),
    };

    // Adiciona às métricas
    metricsCollector.addRequest(requestMetrics);

    // Log de acesso
    logger.access(req, res, responseTime);

    // Log de performance para requisições lentas
    if (responseTime > 2000) { // 2 segundos
      logger.performance('Requisição lenta detectada', {
        method: req.method,
        url: req.originalUrl,
        responseTime,
        userId: (req as any).user?.id,
        memoryDelta: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        },
      });
    }

    // Decrementa conexões ativas
    metricsCollector.decrementConnections();

    return originalSend.call(this, data);
  };

  next();
};

// ===== MIDDLEWARE DE HEALTH CHECK =====

/**
 * Middleware de health check
 */
export const healthCheckMiddleware = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const systemMetrics = metricsCollector.getSystemMetrics();
    const cacheMetrics = await cache.getMetrics();
    
    // Verifica saúde do sistema
    const memoryUsagePercent = (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) * 100;
    const isHealthy = {
      memory: memoryUsagePercent < 90,
      errorRate: systemMetrics.errorRate < 10,
      responseTime: systemMetrics.averageResponseTime < 1000,
      cache: cacheMetrics.hitRate > 0.5,
    };

    const overallHealth = Object.values(isHealthy).every(Boolean);

    const healthData = {
      status: overallHealth ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      uptime: systemMetrics.uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      system: {
        memory: {
          used: systemMetrics.memory.heapUsed,
          total: systemMetrics.memory.heapTotal,
          percentage: memoryUsagePercent,
          healthy: isHealthy.memory,
        },
        cpu: {
          user: systemMetrics.cpu.user,
          system: systemMetrics.cpu.system,
        },
        connections: systemMetrics.activeConnections,
      },
      performance: {
        requestsPerMinute: systemMetrics.requestsPerMinute,
        averageResponseTime: systemMetrics.averageResponseTime,
        errorRate: systemMetrics.errorRate,
        healthy: isHealthy.errorRate && isHealthy.responseTime,
      },
      cache: {
        hitRate: cacheMetrics.hitRate,
        healthy: isHealthy.cache,
      },
      checks: isHealthy,
    };

    res.status(overallHealth ? 200 : 503).json({
      success: true,
      data: healthData,
    });
  } catch (error) {
    logger.error('Erro no health check', error);
    res.status(503).json({
      success: false,
      error: 'Health check falhou',
      timestamp: new Date(),
    });
  }
};

// ===== MIDDLEWARE DE MÉTRICAS =====

/**
 * Middleware para endpoint de métricas
 */
export const metricsMiddleware = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const systemMetrics = metricsCollector.getSystemMetrics();
    const endpointMetrics = metricsCollector.getEndpointMetrics();
    const cacheMetrics = await cache.getMetrics();

    const metricsData = {
      timestamp: new Date(),
      system: systemMetrics,
      endpoints: endpointMetrics,
      cache: cacheMetrics,
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    res.json({
      success: true,
      data: metricsData,
    });
  } catch (error) {
    logger.error('Erro ao obter métricas', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas',
      timestamp: new Date(),
    });
  }
};

// ===== MIDDLEWARE DE ALERTAS =====

/**
 * Middleware de monitoramento de alertas
 */
export const alertsMiddleware = (
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Verifica métricas críticas após cada requisição
  setImmediate(async () => {
    try {
      const systemMetrics = metricsCollector.getSystemMetrics();
      const memoryUsagePercent = (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) * 100;

      // Alerta de memória alta
      if (memoryUsagePercent > 85) {
        logger.warn('Alerta: Uso de memória alto', {
          percentage: memoryUsagePercent,
          used: systemMetrics.memory.heapUsed,
          total: systemMetrics.memory.heapTotal,
        });
      }

      // Alerta de taxa de erro alta
      if (systemMetrics.errorRate > 15) {
        logger.warn('Alerta: Taxa de erro alta', {
          errorRate: systemMetrics.errorRate,
          requestsPerMinute: systemMetrics.requestsPerMinute,
        });
      }

      // Alerta de tempo de resposta alto
      if (systemMetrics.averageResponseTime > 2000) {
        logger.warn('Alerta: Tempo de resposta alto', {
          averageResponseTime: systemMetrics.averageResponseTime,
          requestsPerMinute: systemMetrics.requestsPerMinute,
        });
      }

      // Alerta de muitas conexões ativas
      if (systemMetrics.activeConnections > config.MAX_CONNECTIONS * 0.9) {
        logger.warn('Alerta: Muitas conexões ativas', {
          activeConnections: systemMetrics.activeConnections,
          maxConnections: config.MAX_CONNECTIONS,
        });
      }
    } catch (error) {
      logger.error('Erro no monitoramento de alertas', error);
    }
  });

  next();
};

// ===== UTILITÁRIOS =====

/**
 * Obtém métricas do sistema
 */
export const getSystemMetrics = (): SystemMetrics => {
  return metricsCollector.getSystemMetrics();
};

/**
 * Obtém métricas por endpoint
 */
export const getEndpointMetrics = () => {
  return metricsCollector.getEndpointMetrics();
};

/**
 * Reseta todas as métricas
 */
export const resetMetrics = (): void => {
  metricsCollector.reset();
  logger.system('Métricas resetadas');
};

/**
 * Middleware para incrementar conexões
 */
export const incrementConnections = (): void => {
  metricsCollector.incrementConnections();
};

/**
 * Middleware para decrementar conexões
 */
export const decrementConnections = (): void => {
  metricsCollector.decrementConnections();
};

// ===== AGENDAMENTO DE LIMPEZA =====

/**
 * Limpa métricas antigas periodicamente
 */
setInterval(() => {
  try {
    const systemMetrics = metricsCollector.getSystemMetrics();
    
    // Log periódico de métricas
    const performanceMetrics = {
      requestCount: systemMetrics.requestsPerMinute,
      responseTime: systemMetrics.averageResponseTime,
      errorRate: systemMetrics.errorRate,
      activeConnections: systemMetrics.activeConnections,
      memoryUsage: {
        used: systemMetrics.memory.heapUsed,
        total: systemMetrics.memory.heapTotal,
        percentage: (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) * 100
      },
      cpuUsage: 0 // Placeholder, pois cpu usage precisa ser calculado
    };
    logger.metrics(performanceMetrics);
  } catch (error) {
    logger.error('Erro no log periódico de métricas', error);
  }
}, 60000); // 1 minuto

export default {
  monitoringMiddleware,
  healthCheckMiddleware,
  metricsMiddleware,
  alertsMiddleware,
  getSystemMetrics,
  getEndpointMetrics,
  resetMetrics,
  incrementConnections,
  decrementConnections,
};