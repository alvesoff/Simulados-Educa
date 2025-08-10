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
      enableReadyCheck: true,
      maxRetriesPerRequest: 3, // Limite de tentativas para evitar loops infinitos
      lazyConnect: false, // Conecta imediatamente para evitar delays
      keepAlive: 30000, // Reduzido para 30s
      connectTimeout: 15000, // Timeout aumentado para 15s
      commandTimeout: 10000, // Timeout aumentado para 10s
      // Configurações de performance para recursos limitados
      family: 4,
      db: 0,
      enableOfflineQueue: true, // Habilitado para evitar erros de conexão
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

      // 2. Busca no Redis com tratamento de erro robusto
      try {
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
      } catch (redisError) {
        console.warn(`Redis não disponível para chave ${key}:`, redisError instanceof Error ? redisError.message : 'Erro desconhecido');
        // Continua sem Redis, usando apenas cache local
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
      
      // Define no cache local primeiro
      const localTtl = Math.min(ttl, 300); // Máximo 5 minutos no cache local
      this.localCache.set(key, {
        value: value,
        expires: Date.now() + (localTtl * 1000)
      });
      
      // Define no Redis com tratamento de erro
      try {
        await this.redis.setex(key, ttl, serialized);
      } catch (redisError) {
        console.warn(`Redis não disponível para armazenar chave ${key}:`, redisError instanceof Error ? redisError.message : 'Erro desconhecido');
        // Continua funcionando apenas com cache local
      }
      
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
      // Remove do cache local primeiro
      this.localCache.delete(key);
      
      // Remove do Redis com tratamento de erro
      try {
        await this.redis.del(key);
      } catch (redisError) {
        console.warn(`Redis não disponível para remover chave ${key}:`, redisError instanceof Error ? redisError.message : 'Erro desconhecido');
        // Continua funcionando apenas com cache local
      }
      
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

  // ===== MÉTODOS ESPECÍFICOS PARA API EXTERNA =====

  /**
   * Cache de questões externas com filtros (performance crítica)
   */
  async getExternalQuestions(filters: Record<string, any>) {
    const cacheKey = this.generateExternalQuestionsKey(filters);
    return this.get(cacheKey);
  }

  async setExternalQuestions(filters: Record<string, any>, questions: any, ttl: number = this.TTL.SHORT) {
    const cacheKey = this.generateExternalQuestionsKey(filters);
    return this.set(cacheKey, questions, ttl);
  }

  /**
   * Cache de questão externa individual
   */
  async getExternalQuestion(id: string) {
    return this.get(`external_question:${id}`);
  }

  async setExternalQuestion(id: string, question: any, ttl: number = this.TTL.MEDIUM) {
    return this.set(`external_question:${id}`, question, ttl);
  }

  /**
   * Cache de estatísticas da API externa
   */
  async getExternalStats() {
    return this.get('external_api:stats');
  }

  async setExternalStats(stats: any, ttl: number = this.TTL.MEDIUM) {
    return this.set('external_api:stats', stats, ttl);
  }

  /**
   * Cache de conectividade da API externa
   */
  async getExternalApiHealth() {
    return this.get('external_api:health');
  }

  async setExternalApiHealth(health: any, ttl: number = 60) { // 1 minuto
    return this.set('external_api:health', health, ttl);
  }

  /**
   * Invalida todo o cache da API externa
   */
  async invalidateExternalApiCache(): Promise<void> {
    await Promise.all([
      this.delPattern('external_questions:*'),
      this.delPattern('external_question:*'),
      this.delPattern('external_api:*'),
    ]);
  }

  /**
   * Invalida cache de questões externas por filtros específicos
   */
  async invalidateExternalQuestionsByFilter(filterKey: string, filterValue: any): Promise<void> {
    // Invalida todas as consultas que contenham esse filtro
    const patterns = [
      `external_questions:*"${filterKey}":"${filterValue}"*`,
      `external_questions:*"${filterKey}":${filterValue}*`,
    ];
    
    for (const pattern of patterns) {
      await this.delPattern(pattern);
    }
  }

  /**
   * Gera chave de cache consistente para questões externas
   */
  generateExternalQuestionsKey(filters: Record<string, any>): string {
    // Ordena as chaves para garantir consistência
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((result, key) => {
        result[key] = filters[key];
        return result;
      }, {} as Record<string, any>);
    
    return `external_questions:${JSON.stringify(sortedFilters)}`;
  }

  /**
   * Cache inteligente com fallback para API externa
   */
  async getWithFallback<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    ttl: number = this.TTL.SHORT
  ): Promise<T> {
    try {
      // Tenta buscar no cache primeiro
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Se não encontrou, executa a função de fallback
      const result = await fallbackFn();
      
      // Salva no cache para próximas consultas
      await this.set(key, result, ttl);
      
      return result;
    } catch (error) {
      console.error(`Erro no cache com fallback para chave ${key}:`, error);
      // Em caso de erro, executa a função de fallback diretamente
      return await fallbackFn();
    }
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