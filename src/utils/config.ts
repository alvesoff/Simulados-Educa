import * as dotenv from 'dotenv';
import { z } from 'zod';

// Carrega variáveis de ambiente
dotenv.config();

// ===== SCHEMA DE VALIDAÇÃO DAS CONFIGURAÇÕES =====

const configSchema = z.object({
  // Configurações básicas
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Banco de dados
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // URLs externas
  FRONTEND_URL: z.string().default('http://localhost:3001'),
  
  // API de questões
  QUESTIONS_API_URL: z.string().default('https://api-questao-1.onrender.com/api/v1/questoes'),
  
  // Segurança
  BCRYPT_ROUNDS: z.string().default('12').transform(Number),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('300000').transform(Number), // 5 minutos
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000').transform(Number),
  RATE_LIMIT_STUDENT_LOGIN_MAX: z.string().default('1000').transform(Number),
  RATE_LIMIT_TEST_ACCESS_MAX: z.string().default('500').transform(Number),
  
  // Performance
  WEB_CONCURRENCY: z.string().default('4').transform(Number),
  NODE_OPTIONS: z.string().optional(),
  
  // Monitoramento
  ENABLE_MONITORING: z.string().default('false').transform(val => val === 'true'),
  METRICS_ENDPOINT: z.string().default('/api/v1/metrics'),
});

// ===== CONFIGURAÇÕES DERIVADAS =====

type Config = z.infer<typeof configSchema> & {
  // Configurações calculadas
  IS_PRODUCTION: boolean;
  IS_DEVELOPMENT: boolean;
  IS_TEST: boolean;
  
  // Configurações de performance
  CLUSTER_WORKERS: number;
  MAX_CONNECTIONS: number;
  KEEP_ALIVE_TIMEOUT: number;
  HEADERS_TIMEOUT: number;
  
  // Configurações de cache
  CACHE_TTL: {
    SHORT: number;    // 5 minutos
    MEDIUM: number;   // 30 minutos
    LONG: number;     // 2 horas
    VERY_LONG: number; // 24 horas
  };
  
  // Configurações de database
  DB_POOL: {
    MIN: number;
    MAX: number;
    IDLE_TIMEOUT: number;
    ACQUIRE_TIMEOUT: number;
  };
  
  // Configurações de rate limiting por endpoint
  RATE_LIMITS: {
    AUTH: { windowMs: number; max: number };
    STUDENT_LOGIN: { windowMs: number; max: number };
    TEST_ACCESS: { windowMs: number; max: number };
    SUBMIT_ANSWERS: { windowMs: number; max: number };
    GENERAL: { windowMs: number; max: number };
  };
};

// ===== VALIDAÇÃO E CRIAÇÃO DA CONFIGURAÇÃO =====

function createConfig(): Config {
  try {
    const baseConfig = configSchema.parse(process.env);
    
    return {
      ...baseConfig,
      
      // Flags de ambiente
      IS_PRODUCTION: baseConfig.NODE_ENV === 'production',
      IS_DEVELOPMENT: baseConfig.NODE_ENV === 'development',
      IS_TEST: baseConfig.NODE_ENV === 'test',
      
      // Configurações de performance otimizadas para recursos limitados (512MB RAM, 0.1 CPU)
      CLUSTER_WORKERS: 1, // Apenas 1 worker para recursos limitados
      MAX_CONNECTIONS: 100, // Reduzido para recursos limitados
      KEEP_ALIVE_TIMEOUT: 30000, // 30 segundos
      HEADERS_TIMEOUT: 31000, // 31 segundos
      
      // TTLs de cache otimizados
      CACHE_TTL: {
        SHORT: 300,      // 5 minutos - dados que mudam frequentemente
        MEDIUM: 1800,    // 30 minutos - dados moderadamente estáveis
        LONG: 7200,      // 2 horas - dados estáveis
        VERY_LONG: 86400, // 24 horas - dados muito estáveis
      },
      
      // Pool de conexões do banco otimizado para recursos limitados
      DB_POOL: {
        MIN: 2, // Mínimo reduzido
        MAX: 10, // Pool máximo reduzido para recursos limitados
        IDLE_TIMEOUT: 30000, // Timeout reduzido
        ACQUIRE_TIMEOUT: 10000, // Timeout reduzido
      },
      
      // Rate limits específicos por funcionalidade
      RATE_LIMITS: {
        // Autenticação - mais restritivo
        AUTH: {
          windowMs: 15 * 60 * 1000, // 15 minutos
          max: 5, // 5 tentativas por IP
        },
        
        // Login de estudante - moderado
        STUDENT_LOGIN: {
          windowMs: 5 * 60 * 1000, // 5 minutos
          max: baseConfig.RATE_LIMIT_STUDENT_LOGIN_MAX, // Configurável via env
        },
        
        // Acesso a testes - otimizado para 5K usuários
        TEST_ACCESS: {
          windowMs: 1 * 60 * 1000, // 1 minuto
          max: baseConfig.RATE_LIMIT_TEST_ACCESS_MAX, // Configurável via env
        },
        
        // Submissão de respostas - crítico
        SUBMIT_ANSWERS: {
          windowMs: 1 * 60 * 1000, // 1 minuto
          max: 10, // 10 submissões por IP
        },
        
        // Geral - ajustado para recursos limitados
        GENERAL: {
          windowMs: baseConfig.RATE_LIMIT_WINDOW_MS,
          max: baseConfig.RATE_LIMIT_MAX_REQUESTS, // Sem multiplicador para recursos limitados
        },
      },
    };
  } catch (error) {
    console.error('❌ Erro na configuração:', error);
    process.exit(1);
  }
}

// ===== CONFIGURAÇÃO GLOBAL =====

export const config = createConfig();

// ===== UTILITÁRIOS DE CONFIGURAÇÃO =====

/**
 * Valida se todas as configurações críticas estão presentes
 */
export function validateConfig(): boolean {
  const criticalConfigs = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];
  
  for (const configKey of criticalConfigs) {
    if (!process.env[configKey]) {
      console.error(`❌ Configuração crítica ausente: ${configKey}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Retorna configurações específicas para o ambiente
 */
export function getEnvironmentConfig() {
  return {
    cors: {
      origin: config.IS_PRODUCTION 
        ? [config.FRONTEND_URL]
        : true,
      credentials: true,
      optionsSuccessStatus: 200,
    },
    
    helmet: {
      contentSecurityPolicy: config.IS_PRODUCTION ? undefined : false,
      crossOriginEmbedderPolicy: false,
    },
    
    compression: {
      level: config.IS_PRODUCTION ? 6 : 1,
      threshold: 1024,
    },
    
    logging: {
      level: config.IS_PRODUCTION ? 'info' : 'debug',
      silent: config.IS_TEST,
    },
  };
}

/**
 * Configurações específicas para o Render
 */
export function getRenderConfig() {
  return {
    // Configurações de health check
    healthCheck: {
      path: '/health',
      interval: 30000, // 30 segundos
      timeout: 5000,   // 5 segundos
    },
    
    // Configurações de graceful shutdown
    gracefulShutdown: {
      timeout: 30000, // 30 segundos
      signals: ['SIGTERM', 'SIGINT'],
    },
    
    // Configurações de cluster
    cluster: {
      workers: config.CLUSTER_WORKERS,
      respawn: true,
      respawnDelay: 1000,
    },
  };
}

/**
 * Configurações de monitoramento
 */
export function getMonitoringConfig() {
  return {
    enabled: config.ENABLE_MONITORING,
    endpoint: config.METRICS_ENDPOINT,
    
    // Métricas coletadas
    metrics: {
      http: true,
      system: true,
      database: true,
      cache: true,
      custom: true,
    },
    
    // Alertas
    alerts: {
      responseTime: 2000,    // 2 segundos
      errorRate: 0.05,       // 5%
      memoryUsage: 0.85,     // 85%
      cpuUsage: 0.80,        // 80%
    },
  };
}

/**
 * Exibe configurações no startup (sem dados sensíveis)
 */
export function logConfig(): void {
  console.log('🔧 Configurações do Sistema:');
  console.log(`   Ambiente: ${config.NODE_ENV}`);
  console.log(`   Porta: ${config.PORT}`);
  console.log(`   Workers: ${config.CLUSTER_WORKERS}`);
  console.log(`   Max Connections: ${config.MAX_CONNECTIONS}`);
  console.log(`   Redis: ${config.REDIS_URL.replace(/\/\/.*@/, '//***@')}`);
  console.log(`   Frontend: ${config.FRONTEND_URL}`);
  console.log(`   Monitoramento: ${config.ENABLE_MONITORING ? 'Ativo' : 'Inativo'}`);
  console.log(`   Rate Limit: ${config.RATE_LIMIT_MAX_REQUESTS} req/${config.RATE_LIMIT_WINDOW_MS}ms`);
}

export default config;