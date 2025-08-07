import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { cacheManager as cache } from './utils/cache';
import { initializeQueues, queueShutdown } from './utils/queue';
import { setupGlobalErrorHandlers, errorHandler as errorHandlerMiddleware, notFoundHandler } from './middleware/errorHandler';
import { monitoringMiddleware, healthCheckMiddleware, metricsMiddleware, alertsMiddleware } from './middleware/monitoring';
// import rateLimiting from './middleware/rateLimiting'; // Usado nas rotas individuais

// Importar rotas
import authRoutes from './routes/auth';
import testRoutes from './routes/tests';
import questionRoutes from './routes/questions';
import studentRoutes from './routes/students';

// ===== CONFIGURAÇÃO DA APLICAÇÃO =====

const app = express();

// ===== MIDDLEWARES DE SEGURANÇA =====

// Helmet para headers de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configurado para produção
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400, // 24 horas
}));

// Compressão gzip/deflate
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // máximo 1000 requests por IP por janela
  message: {
    success: false,
    message: 'Muitas requisições. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pula rate limiting para health checks
    return req.path === '/health' || req.path === '/metrics';
  },
}));

// ===== MIDDLEWARES DE PARSING =====

// Body parser com limites de segurança
app.use(express.json({
  limit: '10mb',
  verify: (_req, _res, buf) => {
    // Verifica se o JSON é válido
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      const error = new Error('JSON inválido');
      error.name = 'SyntaxError';
      throw error;
    }
  },
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
}));

// ===== MIDDLEWARES DE MONITORAMENTO =====

// Middleware de monitoramento (deve vir antes das rotas)
app.use(monitoringMiddleware);

// Middleware de alertas
app.use(alertsMiddleware);

// ===== MIDDLEWARES DE LOGGING =====

// Log de requisições
app.use((_req, res, next) => {
  const startTime = Date.now();
  
  logger.info('Nova requisição', {
    method: _req.method,
    url: _req.url,
    ip: _req.ip,
    userAgent: _req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });

  // Override do res.end para capturar tempo de resposta
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - startTime;
    
    logger.info('Resposta enviada', {
      method: _req.method,
      url: _req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
    });
    
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
});

// ===== ROTAS DE SISTEMA =====

// Rota raiz - Welcome message
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Sistema de Provas Online - API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      api: '/api',
      health: '/health',
      status: '/status',
      ping: '/ping',
      metrics: '/metrics'
    },
    documentation: 'https://github.com/alvesoff/educandario-simulados-backend'
  });
});

// Rota para favicon.ico - evita erro 404
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// Health check
app.get('/health', healthCheckMiddleware);

// Métricas
app.get('/metrics', metricsMiddleware);

// Status da aplicação
app.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 'Backend API',
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
  });
});

// Rota de teste de conectividade
app.get('/ping', (_req, res) => {
  res.json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
  });
});

// ===== ROTAS DA API =====

// Prefixo para todas as rotas da API
const API_PREFIX = '/api';

// Rotas de autenticação
app.use(`${API_PREFIX}/auth`, authRoutes);

// Rotas de testes
app.use(`${API_PREFIX}/tests`, testRoutes);

// Rotas de questões
app.use(`${API_PREFIX}/questions`, questionRoutes);

// Rotas de estudantes
app.use(`${API_PREFIX}/students`, studentRoutes);

// Rota de informações da API
app.get(API_PREFIX, (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Sistema de Provas Online - API',
      version: '1.0.0',
      description: 'API para sistema de provas online otimizada para alta concorrência',
      endpoints: {
        auth: `${API_PREFIX}/auth`,
        tests: `${API_PREFIX}/tests`,
        questions: `${API_PREFIX}/questions`,
        students: `${API_PREFIX}/students`,
      },
      documentation: 'https://docs.example.com',
      support: 'support@example.com',
    },
  });
});

// ===== TRATAMENTO DE ERROS =====

// Handler para rotas não encontradas
app.use(notFoundHandler);

// Handler global de erros
app.use(errorHandlerMiddleware);

// ===== INICIALIZAÇÃO =====

/**
 * Inicializa a aplicação e suas dependências
 */
export async function initializeApp(): Promise<void> {
  try {
    logger.info('Inicializando aplicação...');

    // Testa conexão com Redis
    try {
      await cache.get('test');
      logger.info('Conexão com Redis estabelecida');
    } catch (error) {
      logger.warn('Redis não disponível, continuando sem cache');
    }

    // Inicializar filas
  await initializeQueues();
    logger.info('Filas inicializadas');

    // Configura handlers globais de erro
    setupGlobalErrorHandlers();
    logger.info('Handlers de erro configurados');

    logger.info('Aplicação inicializada com sucesso');
  } catch (error) {
    logger.error('Erro ao inicializar aplicação', { error });
    throw error;
  }
}

/**
 * Graceful shutdown da aplicação
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Recebido sinal ${signal}. Iniciando graceful shutdown...`);

  try {
    // Para de aceitar novas conexões
    logger.info('Parando servidor HTTP...');
    
    // Finaliza filas
    logger.info('Finalizando filas...');
    await queueShutdown();
    
    // Fecha conexão com Redis
    logger.info('Fechando conexão com Redis...');
    await cache.disconnect();
    
    logger.info('Graceful shutdown concluído');
    process.exit(0);
  } catch (error) {
    logger.error('Erro durante graceful shutdown', { error });
    process.exit(1);
  }
}

// ===== CONFIGURAÇÃO DE SINAIS =====

// Graceful shutdown em sinais do sistema
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Log de exceções não capturadas
process.on('uncaughtException', (error) => {
  logger.error('Exceção não capturada', { error });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// ===== CONFIGURAÇÕES DE PERFORMANCE =====

// Otimizações do Node.js
if (config.NODE_ENV === 'production') {
  // Aumenta o pool de threads para operações de I/O
  process.env.UV_THREADPOOL_SIZE = '16';
  
  // Otimiza garbage collection
  if (!process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --optimize-for-size';
  }
}

// ===== MIDDLEWARE DE KEEP-ALIVE =====

// Configura keep-alive para conexões HTTP
app.use((_req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5, max=1000');
  next();
});

// ===== MIDDLEWARE DE CACHE HEADERS =====

// Configura headers de cache para recursos estáticos
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 ano
    res.setHeader('ETag', `"${Date.now()}"`); // ETag simples
  } else if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hora
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ===== MIDDLEWARE DE TIMEOUT =====

// Timeout para requisições longas
app.use((req, res, next) => {
  const timeout = 30000; // 30 segundos
  
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      logger.warn('Timeout de requisição', {
        method: req.method,
        url: req.url,
        timeout,
      });
      
      res.status(408).json({
        success: false,
        message: 'Timeout da requisição',
      });
    }
  }, timeout);
  
  res.on('finish', () => {
    clearTimeout(timer);
  });
  
  next();
});



export default app;