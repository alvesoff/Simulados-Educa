import Redis from 'ioredis';
import { CacheMetrics } from '../types';

// ===== CONFIGURAÇÃO REDIS PARA ALTA CONCORRÊNCIA =====

class CacheManager {
  private redis: Redis;
  private localCache: Map<string, { value: any; expires: number }>;
  private metrics: CacheMetrics;
  
  // TTL constants
  public readonly TTL = {
    SHORT: 300,      // 5 minutos
    MEDIUM: 1800,    // 30 minutos
    LONG: 7200,      // 2 horas
    VERY_LONG: 86400 // 24 horas
  };

  constructor() {
    // Redis configurado para recursos limitados (512MB RAM, 0.1 CPU)
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3, // Reduzido para recursos limitados
      lazyConnect: true,
      keepAlive: 30000, // Reduzido para 30s
      connectTimeout: 10000, // Timeout reduzido
      commandTimeout: 5000, // 5s timeout para comandos
      // Configurações de performance para recursos limitados
      family: 4,
      db: 0,
      enableOfflineQueue: false,
      enableAutoPipelining: false, // Desabilitado para recursos limitados
    });

    // Cache local para dados frequentemente acessados
    this.localCache = new Map();

    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalKeys: 0,
      memoryUsage: 0,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.redis.on('connect', () => {
      console.log('✅ Redis conectado com sucesso');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Erro no Redis:', error);
    });

    this.redis.on('ready', () => {
      console.log('🚀 Redis pronto para uso');
    });

    // Limpeza periódica do cache local
    setInterval(() => {
      this.cleanExpiredLocalCache();
    }, 60000); // A cada minuto
  }

  // ===== MÉTODOS DE CACHE HÍBRIDO =====

  /**
   * Busca primeiro no cache local, depois no Redis
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // 1. Verifica cache local primeiro (mais rápido)
      const localEntry = this.localCache.get(key);
      if (localEntry && localEntry.expires > Date.now()) {
        this.metrics.hits++;
        return localEntry.value as T;
      } else if (localEntry) {
        // Remove entrada expirada
        this.localCache.delete(key);
      }

      // 2. Busca no Redis
      const redisValue = await this.redis.get(key);
      if (redisValue) {
        const parsed = JSON.parse(redisValue) as T;
        // Armazena no cache local para próximas consultas (otimizado para 5K usuários)
        this.localCache.set(key, {
          value: parsed,
          expires: Date.now() + 180000 // 3 minutos - rotação mais rápida
        });
        this.metrics.hits++;
        return parsed;
      }

      this.metrics.misses++;
      return null;
    } catch (error) {
      console.error(`Erro ao buscar cache ${key}:`, error);
      this.metrics.misses++;
      return null;
    }
  }

  /**
   * Define valor em ambos os caches
   */
  async set<T>(key: string, value: T, ttl: number = 3600): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      
      // Define no Redis com TTL
      await this.redis.setex(key, ttl, serialized);
      
      // Define no cache local com TTL menor
      const localTtl = Math.min(ttl, 300); // Máximo 5 minutos no cache local
      this.localCache.set(key, {
        value: value,
        expires: Date.now() + (localTtl * 1000)
      });
      
      this.updateMetrics();
      return true;
    } catch (error) {
      console.error(`Erro ao definir cache ${key}:`, error);
      return false;
    }
  }

  /**
   * Remove de ambos os caches
   */
  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      this.localCache.delete(key);
      this.updateMetrics();
      return true;
    } catch (error) {
      console.error(`Erro ao deletar cache ${key}:`, error);
      return false;
    }
  }

  /**
   * Remove múltiplas chaves
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      await this.redis.del(...keys);
      
      // Remove do cache local também
      keys.forEach(key => this.localCache.delete(key));
      
      this.updateMetrics();
      return keys.length;
    } catch (error) {
      console.error(`Erro ao deletar pattern ${pattern}:`, error);
      return 0;
    }
  }

  // ===== MÉTODOS ESPECÍFICOS PARA O SISTEMA =====

  /**
   * Cache de teste por código de acesso (crítico para performance)
   */
  async getTestByAccessCode(accessCode: string) {
    return this.get(`test:access:${accessCode}`);
  }

  async setTestByAccessCode(accessCode: string, test: any, ttl: number = 900) {
    return this.set(`test:access:${accessCode}`, test, ttl); // 15 minutos
  }

  /**
   * Cache de escola (dados raramente mudam)
   */
  async getSchool(schoolId: string) {
    return this.get(`school:${schoolId}`);
  }

  async setSchool(schoolId: string, school: any, ttl: number = 3600) {
    return this.set(`school:${schoolId}`, school, ttl); // 1 hora
  }

  /**
   * Cache de usuário (sessão)
   */
  async getUser(userId: string) {
    return this.get(`user:${userId}`);
  }

  async setUser(userId: string, user: any, ttl: number = 1800) {
    return this.set(`user:${userId}`, user, ttl); // 30 minutos
  }

  /**
   * Cache de questões de teste (performance crítica)
   */
  async getTestQuestions(testId: string) {
    return this.get(`test:questions:${testId}`);
  }

  async setTestQuestions(testId: string, questions: any, ttl: number = 1800) {
    return this.set(`test:questions:${testId}`, questions, ttl); // 30 minutos
  }

  /**
   * Cache de tentativa de aluno
   */
  async getStudentAttempt(attemptId: string) {
    return this.get(`attempt:${attemptId}`);
  }

  async setStudentAttempt(attemptId: string, attempt: any, ttl: number = 7200) {
    return this.set(`attempt:${attemptId}`, attempt, ttl); // 2 horas
  }

  // ===== INVALIDAÇÃO DE CACHE =====

  /**
   * Invalida cache relacionado a um teste
   */
  async invalidateTestCache(testId: string): Promise<void> {
    await Promise.all([
      this.delPattern(`test:${testId}*`),
      this.delPattern(`test:questions:${testId}`),
      this.delPattern(`test:access:*`), // Pode ser otimizado se soubermos o accessCode
    ]);
  }

  /**
   * Invalida cache relacionado a uma escola
   */
  async invalidateSchoolCache(schoolId: string): Promise<void> {
    await Promise.all([
      this.delPattern(`school:${schoolId}*`),
      this.delPattern(`user:*:school:${schoolId}`),
    ]);
  }

  /**
   * Invalida cache relacionado a uma questão específica
   */
  async invalidateQuestion(questionId: string): Promise<void> {
    await this.delPattern(`question:${questionId}*`);
    await this.delPattern(`questions:*`);
  }

  /**
   * Invalida cache de questões de uma escola
   */
  async invalidateSchoolQuestions(schoolId: string): Promise<void> {
    await this.delPattern(`questions:${schoolId}*`);
    await this.delPattern(`question:*:school:${schoolId}`);
  }

  // ===== MÉTRICAS E MONITORAMENTO =====

  private cleanExpiredLocalCache(): void {
    const now = Date.now();
    const entries = Array.from(this.localCache.entries());
    for (const [key, entry] of entries) {
      if (entry.expires <= now) {
        this.localCache.delete(key);
      }
    }
  }

  private updateMetrics(): void {
    this.metrics.totalKeys = this.localCache.size;
    this.metrics.hitRate = this.metrics.hits / (this.metrics.hits + this.metrics.misses) || 0;
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
  }

  getMetrics(): CacheMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Limpa todos os caches (usar com cuidado)
   */
  async flush(): Promise<void> {
    await this.redis.flushdb();
    this.localCache.clear();
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalKeys: 0,
      memoryUsage: 0,
    };
  }

  /**
   * Fecha conexões
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.localCache.clear();
  }

  /**
   * Desconecta do Redis
   */
  async disconnect(): Promise<void> {
    await this.close();
  }

  // ===== HEALTH CHECK =====

  async healthCheck(): Promise<{ redis: boolean; local: boolean }> {
    try {
      await this.redis.ping();
      const testKey = 'health:check';
      this.localCache.set(testKey, {
        value: 'ok',
        expires: Date.now() + 1000
      });
      const localEntry = this.localCache.get(testKey);
      const localTest = localEntry?.value;
      
      return {
        redis: true,
        local: localTest === 'ok',
      };
    } catch (error) {
      return {
        redis: false,
        local: false,
      };
    }
  }
}

// Singleton para garantir uma única instância
export const cacheManager = new CacheManager();
export default cacheManager;