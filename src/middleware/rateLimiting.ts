import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { cacheManager } from '../utils/cache';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

// ===== RATE LIMITING DISTRIBUÍDO COM REDIS =====

/**
 * Store customizado para usar Redis como backend
 * Crítico para clusters e múltiplas instâncias
 */
class RedisStore {
  private prefix: string;
  private windowMs: number;

  constructor(windowMs: number, prefix: string = 'rl:') {
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; timeToExpire: number }> {
    const redisKey = `${this.prefix}${key}`;
    const now = Date.now();
    const window = Math.floor(now / this.windowMs);
    const windowKey = `${redisKey}:${window}`;

    try {
      // Usa pipeline para operações atômicas
      const pipeline = (cacheManager as any).redis.pipeline();
      pipeline.incr(windowKey);
      pipeline.expire(windowKey, Math.ceil(this.windowMs / 1000));
      
      const results = await pipeline.exec();
      const totalHits = results[0][1];
      
      const timeToExpire = this.windowMs - (now % this.windowMs);
      
      return { totalHits, timeToExpire };
    } catch (error) {
      logger.error('Erro no RedisStore rate limiting', error);
      // Fallback: permite a requisição em caso de erro
      return { totalHits: 1, timeToExpire: this.windowMs };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    const now = Date.now();
    const window = Math.floor(now / this.windowMs);
    const windowKey = `${redisKey}:${window}`;

    try {
      await (cacheManager as any).redis.decr(windowKey);
    } catch (error) {
      logger.error('Erro ao decrementar rate limit', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await cacheManager.delPattern(`${this.prefix}${key}:*`);
    } catch (error) {
      logger.error('Erro ao resetar rate limit', error);
    }
  }
}

// ===== CONFIGURAÇÕES DE RATE LIMITING =====

/**
 * Rate limiting geral para todas as rotas
 */
export const generalRateLimit = rateLimit({
  windowMs: config.RATE_LIMITS.GENERAL.windowMs,
  max: config.RATE_LIMITS.GENERAL.max,
  message: {
    success: false,
    error: 'Muitas requisições. Tente novamente em alguns minutos.',
    timestamp: new Date(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Usa IP + User-Agent para identificação mais precisa
  keyGenerator: (req: Request) => {
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${req.ip}-${userAgent}`;
  },
  // Store distribuído
  store: new (class {
    private redisStore = new RedisStore(config.RATE_LIMITS.GENERAL.windowMs, 'rl:general:');
    
    async increment(key: string) {
      const result = await this.redisStore.increment(key);
      return {
        totalHits: result.totalHits,
        timeToExpire: result.timeToExpire,
        resetTime: new Date(Date.now() + result.timeToExpire)
      };
    }
    
    async decrement(key: string) {
      return this.redisStore.decrement(key);
    }
    
    async resetKey(key: string) {
      return this.redisStore.resetKey(key);
    }
  })(),
  // Handler customizado para logging
  handler: (req: Request, res: Response) => {
    logger.rateLimit(req.ip || 'unknown', req.originalUrl, {
      userAgent: req.get('User-Agent'),
      method: req.method,
    });
    
    res.status(429).json({
      success: false,
      error: 'Muitas requisições. Tente novamente em alguns minutos.',
      timestamp: new Date(),
    });
  },
});

/**
 * Rate limiting para autenticação (mais restritivo)
 */
export const authRateLimit = rateLimit({
  windowMs: config.RATE_LIMITS.AUTH.windowMs,
  max: config.RATE_LIMITS.AUTH.max,
  message: {
    success: false,
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    timestamp: new Date(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || 'unknown',
  store: new (class {
    private redisStore = new RedisStore(config.RATE_LIMITS.AUTH.windowMs, 'rl:auth:');
    
    async increment(key: string) {
      const result = await this.redisStore.increment(key);
      return {
        totalHits: result.totalHits,
        timeToExpire: result.timeToExpire,
        resetTime: new Date(Date.now() + result.timeToExpire)
      };
    }
    
    async decrement(key: string) {
      return this.redisStore.decrement(key);
    }
    
    async resetKey(key: string) {
      return this.redisStore.resetKey(key);
    }
  })(),
  handler: (req: Request, res: Response) => {
    logger.security('Rate limit exceeded - Auth', req.ip || 'unknown', {
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(429).json({
      success: false,
      error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
      timestamp: new Date(),
    });
  },
});

/**
 * Rate limiting para login de estudantes
 */
export const studentLoginRateLimit = rateLimit({
  windowMs: config.RATE_LIMITS.STUDENT_LOGIN.windowMs,
  max: config.RATE_LIMITS.STUDENT_LOGIN.max,
  message: {
    success: false,
    error: 'Muitas tentativas de acesso. Tente novamente em alguns minutos.',
    timestamp: new Date(),
  },
  keyGenerator: (req: Request) => {
    // Combina IP + código de acesso para rate limiting mais preciso
    const accessCode = req.body.accessCode || 'unknown';
    const ip = req.ip || 'unknown';
    return `${ip}:${accessCode}`;
  },
  store: new (class {
    private redisStore = new RedisStore(config.RATE_LIMITS.STUDENT_LOGIN.windowMs, 'rl:student:');
    
    async increment(key: string) {
      const result = await this.redisStore.increment(key);
      return {
        totalHits: result.totalHits,
        timeToExpire: result.timeToExpire,
        resetTime: new Date(Date.now() + result.timeToExpire)
      };
    }
    
    async decrement(key: string) {
      return this.redisStore.decrement(key);
    }
    
    async resetKey(key: string) {
      return this.redisStore.resetKey(key);
    }
  })(),
});

/**
 * Rate limiting para acesso a testes
 */
export const testAccessRateLimit = rateLimit({
  windowMs: config.RATE_LIMITS.TEST_ACCESS.windowMs,
  max: config.RATE_LIMITS.TEST_ACCESS.max,
  message: {
    success: false,
    error: 'Muitas requisições de teste. Aguarde um momento.',
    timestamp: new Date(),
  },
  keyGenerator: (req: Request) => req.ip || 'unknown',
  store: new (class {
    private redisStore = new RedisStore(config.RATE_LIMITS.TEST_ACCESS.windowMs, 'rl:test:');
    
    async increment(key: string) {
      const result = await this.redisStore.increment(key);
      return {
        totalHits: result.totalHits,
        timeToExpire: result.timeToExpire,
        resetTime: new Date(Date.now() + result.timeToExpire)
      };
    }
    
    async decrement(key: string) {
      return this.redisStore.decrement(key);
    }
    
    async resetKey(key: string) {
      return this.redisStore.resetKey(key);
    }
  })(),
});

/**
 * Rate limiting para submissão de respostas (crítico)
 */
export const submitAnswersRateLimit = rateLimit({
  windowMs: config.RATE_LIMITS.SUBMIT_ANSWERS.windowMs,
  max: config.RATE_LIMITS.SUBMIT_ANSWERS.max,
  message: {
    success: false,
    error: 'Muitas submissões. Aguarde antes de tentar novamente.',
    timestamp: new Date(),
  },
  keyGenerator: (req: Request) => {
    // Combina IP + testId para evitar spam em testes específicos
    const testId = req.params.testId || req.body.testId || 'unknown';
    const ip = req.ip || 'unknown';
    return `${ip}:${testId}`;
  },
  store: new (class {
    private redisStore = new RedisStore(config.RATE_LIMITS.SUBMIT_ANSWERS.windowMs, 'rl:submit:');
    
    async increment(key: string) {
      const result = await this.redisStore.increment(key);
      return {
        totalHits: result.totalHits,
        timeToExpire: result.timeToExpire,
        resetTime: new Date(Date.now() + result.timeToExpire)
      };
    }
    
    async decrement(key: string) {
      return this.redisStore.decrement(key);
    }
    
    async resetKey(key: string) {
      return this.redisStore.resetKey(key);
    }
  })(),
  handler: (req: Request, res: Response) => {
    logger.security('Rate limit exceeded - Submit', req.ip || 'unknown', {
      testId: req.params.testId || req.body.testId,
      endpoint: req.originalUrl,
    });
    
    res.status(429).json({
      success: false,
      error: 'Muitas submissões. Aguarde antes de tentar novamente.',
      timestamp: new Date(),
    });
  },
});

// ===== SLOW DOWN MIDDLEWARE =====

/**
 * Slow down para reduzir velocidade de resposta em caso de muitas requisições
 */
export const slowDownMiddleware: any = slowDown({
  windowMs: 5 * 60 * 1000, // 5 minutos
  delayAfter: 50, // Após 50 requests
  delayMs: () => 100, // Adiciona 100ms de delay (nova sintaxe)
  maxDelayMs: 2000, // Máximo 2 segundos de delay
  keyGenerator: (req: Request) => req.ip || 'unknown',
  validate: { 
    delayMs: false, // Desabilita aviso sobre delayMs
    keyGeneratorIpFallback: false // Desabilita validação IPv6
  },
});

// ===== MIDDLEWARE ADAPTATIVO =====

/**
 * Rate limiting adaptativo baseado na carga do sistema
 */
export const adaptiveRateLimit = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verifica métricas do sistema
      const memoryUsage = process.memoryUsage();
      const memoryPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      // Se memória alta, aplica rate limiting mais agressivo
      if (memoryPercent > 0.85) {
        const ip = req.ip || 'unknown';
        const key = `adaptive:${ip}`;
        const cached = await cacheManager.get(key);
        
        if (cached && (cached as number) > 10) {
          logger.warn('Rate limiting adaptativo ativado', {
            ip,
            memoryPercent,
            requests: cached,
          });
          
          res.status(503).json({
            success: false,
            error: 'Sistema temporariamente sobrecarregado. Tente novamente em alguns minutos.',
            timestamp: new Date(),
          });
          return;
        }
        
        await cacheManager.set(key, ((cached as number) || 0) + 1, 60); // 1 minuto
      }
      
      next();
    } catch (error) {
      logger.error('Erro no rate limiting adaptativo', error);
      next(); // Continua em caso de erro
    }
  };
};

// ===== MIDDLEWARE DE PROTEÇÃO CONTRA DDoS =====

/**
 * Proteção básica contra ataques DDoS
 */
export const ddosProtection = () => {
  const suspiciousIPs = new Map<string, { count: number; lastSeen: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minuto
    const maxRequests = 200; // 200 requests por minuto
    
    const ipData = suspiciousIPs.get(ip);
    
    if (!ipData || now - ipData.lastSeen > windowMs) {
      suspiciousIPs.set(ip, { count: 1, lastSeen: now });
      next();
      return;
    }
    
    ipData.count++;
    ipData.lastSeen = now;
    
    if (ipData.count > maxRequests) {
      logger.security('Possível ataque DDoS detectado', ip, {
        requests: ipData.count,
        endpoint: req.originalUrl,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(429).json({
        success: false,
        error: 'Muitas requisições detectadas. Acesso temporariamente bloqueado.',
        timestamp: new Date(),
      });
      return;
    }
    
    next();
  };
};

// ===== UTILITÁRIOS =====

/**
 * Limpa rate limits para um IP específico (uso administrativo)
 */
export const clearRateLimit = async (ip: string): Promise<void> => {
  try {
    await Promise.all([
      cacheManager.delPattern(`rl:general:${ip}:*`),
      cacheManager.delPattern(`rl:auth:${ip}:*`),
      cacheManager.delPattern(`rl:student:${ip}:*`),
      cacheManager.delPattern(`rl:test:${ip}:*`),
      cacheManager.delPattern(`rl:submit:${ip}:*`),
      cacheManager.delPattern(`adaptive:${ip}`),
    ]);
    
    logger.info('Rate limits limpos', { ip });
  } catch (error) {
    logger.error('Erro ao limpar rate limits', error, { ip });
  }
};

/**
 * Obtém estatísticas de rate limiting
 */
export const getRateLimitStats = async (ip: string) => {
  try {
    const stats = {
      general: await cacheManager.get(`rl:general:${ip}`) || 0,
      auth: await cacheManager.get(`rl:auth:${ip}`) || 0,
      student: await cacheManager.get(`rl:student:${ip}`) || 0,
      test: await cacheManager.get(`rl:test:${ip}`) || 0,
      submit: await cacheManager.get(`rl:submit:${ip}`) || 0,
    };
    
    return stats;
  } catch (error) {
    logger.error('Erro ao obter stats de rate limit', error, { ip });
    return null;
  }
};

export default {
  generalRateLimit,
  authRateLimit,
  studentLoginRateLimit,
  testAccessRateLimit,
  submitAnswersRateLimit,
  slowDownMiddleware,
  adaptiveRateLimit,
  ddosProtection,
  clearRateLimit,
  getRateLimitStats,
};