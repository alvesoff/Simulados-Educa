import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import app, { initializeApp, gracefulShutdown } from './app';
import { config } from './utils/config';
import { logger } from './utils/logger';

// ===== INICIALIZAÇÃO DO PRISMA =====

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// ===== CONFIGURAÇÃO DO SERVIDOR =====

/**
 * Cria e configura o servidor HTTP
 */
function createHttpServer() {
  const server = createServer(app);
  
  // Configurações de performance otimizadas para 5K usuários
  if (config.NODE_ENV === 'production') {
    // Aumenta o número máximo de conexões simultâneas para 5K usuários
    server.maxConnections = 15000;
    
    // Configura timeout otimizado para alta carga
    server.timeout = 45000; // 45 segundos - mais tolerante
    server.keepAliveTimeout = 8000; // 8 segundos - conexões mais duradouras
    server.headersTimeout = 10000; // 10 segundos - buffer maior
    
    // Configurações adicionais para alta concorrência
    server.requestTimeout = 30000; // 30 segundos para requests
  } else {
    // Configurações para desenvolvimento também otimizadas
    server.maxConnections = 5000;
    server.timeout = 30000;
    server.keepAliveTimeout = 5000;
    server.headersTimeout = 6000;
  }
  
  // Event listeners para o servidor
  server.on('connection', (socket) => {
    logger.debug('Nova conexão estabelecida', {
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
    });
    
    // Configura keep-alive no socket otimizado para 5K usuários
    socket.setKeepAlive(true, 120000); // 120 segundos - conexões mais duradouras
    socket.setNoDelay(true); // Desabilita algoritmo de Nagle para menor latência
    
    // Configurações de buffer para alta carga
    socket.setTimeout(45000); // Timeout de 45 segundos
  });
  
  server.on('clientError', (err, socket) => {
    logger.warn('Erro de cliente', {
      error: err.message,
      remoteAddress: (socket as any).remoteAddress || 'unknown',
    });
    
    // Fecha conexão com erro
    if (!socket.destroyed) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });
  
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Porta ${config.PORT} já está em uso`);
    } else {
      logger.error('Erro no servidor', { error });
    }
    process.exit(1);
  });
  
  return server;
}

/**
 * Testa conexão com o banco de dados
 */
async function testDatabaseConnection(): Promise<void> {
  try {
    logger.info('Testando conexão com banco de dados...');
    
    // Testa conexão simples
    await prisma.$queryRaw`SELECT 1`;
    
    logger.info('Conexão com banco de dados estabelecida');
  } catch (error) {
    logger.error('Erro ao conectar com banco de dados', { error });
    throw error;
  }
}

/**
 * Executa verificações de saúde do sistema
 */
async function healthChecks(): Promise<void> {
  try {
    logger.info('Executando verificações de saúde...');
    
    // Verifica uso de memória
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    };
    
    logger.info('Uso de memória', memoryUsageMB);
    
    // Aviso se uso de memória estiver alto
    if (memoryUsageMB.heapUsed > 1024) { // > 1GB
      logger.warn('Alto uso de memória detectado', memoryUsageMB);
    }
    
    // Verifica espaço em disco (se possível)
    try {
      const fs = await import('fs/promises');
      await fs.stat('.');
      logger.debug('Verificação de disco concluída');
    } catch (error) {
      logger.debug('Não foi possível verificar espaço em disco');
    }
    
    logger.info('Verificações de saúde concluídas');
  } catch (error) {
    logger.error('Erro nas verificações de saúde', { error });
    // Não falha o startup por causa disso
  }
}

/**
 * Configura monitoramento de performance
 */
function setupPerformanceMonitoring(): void {
  // Monitora uso de memória a cada 30 segundos
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    };
    
    // Log apenas se uso estiver alto
    if (memoryUsageMB.heapUsed > 512) { // > 512MB
      logger.performance('Monitoramento de memória', {
        memory: memoryUsageMB,
        uptime: Math.round(process.uptime()),
      });
    }
    
    // Força garbage collection se uso estiver muito alto
    if (memoryUsageMB.heapUsed > 1536 && global.gc) { // > 1.5GB
      logger.warn('Forçando garbage collection devido ao alto uso de memória');
      global.gc();
    }
  }, 30000);
  
  // Monitora CPU a cada minuto
  let lastCpuUsage = process.cpuUsage();
  setInterval(() => {
    const currentCpuUsage = process.cpuUsage(lastCpuUsage);
    const cpuPercent = {
      user: Math.round((currentCpuUsage.user / 1000000) * 100) / 100, // converte para segundos
      system: Math.round((currentCpuUsage.system / 1000000) * 100) / 100,
    };
    
    // Log apenas se uso estiver alto
    if (cpuPercent.user > 1 || cpuPercent.system > 0.5) {
      logger.performance('Monitoramento de CPU', {
        cpu: cpuPercent,
        uptime: Math.round(process.uptime()),
      });
    }
    
    lastCpuUsage = process.cpuUsage();
  }, 60000);
}

/**
 * Função principal para iniciar o servidor
 */
async function startServer(): Promise<void> {
  try {
    logger.info('='.repeat(50));
    logger.info('🚀 Iniciando Sistema de Provas Online - Backend');
    logger.info('='.repeat(50));
    
    // Informações do ambiente
    logger.info('Informações do ambiente', {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      env: config.NODE_ENV,
      port: config.PORT,
      pid: process.pid,
    });
    
    // Testa conexão com banco de dados
    await testDatabaseConnection();
    
    // Inicializa aplicação
    await initializeApp();
    
    // Executa verificações de saúde
    await healthChecks();
    
    // Configura monitoramento
    setupPerformanceMonitoring();
    
    // Cria e inicia servidor HTTP
    const server = createHttpServer();
    
    // Inicia servidor
    server.listen(config.PORT, '0.0.0.0', () => {
      logger.info('='.repeat(50));
      logger.info('✅ Servidor iniciado com sucesso!');
      logger.info(`🌐 Servidor rodando em http://0.0.0.0:${config.PORT}`);
      logger.info(`📊 Health check: http://0.0.0.0:${config.PORT}/health`);
      logger.info(`📈 Métricas: http://0.0.0.0:${config.PORT}/metrics`);
      logger.info(`🔧 Ambiente: ${config.NODE_ENV}`);
      logger.info('='.repeat(50));
      
      // Log de estatísticas iniciais
      const memoryUsage = process.memoryUsage();
      logger.info('Estatísticas iniciais', {
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        },
        uptime: Math.round(process.uptime()) + 's',
      });
    });
    
    // Configura graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Recebido sinal ${signal}. Iniciando shutdown...`);
      
      server.close(async () => {
        logger.info('Servidor HTTP fechado');
        
        try {
          // Fecha conexão com banco de dados
          await prisma.$disconnect();
          logger.info('Conexão com banco de dados fechada');
          
          // Executa graceful shutdown da aplicação
          await gracefulShutdown(signal);
        } catch (error) {
          logger.error('Erro durante shutdown', { error });
          process.exit(1);
        }
      });
      
      // Força shutdown após 30 segundos
      setTimeout(() => {
        logger.error('Forçando shutdown após timeout');
        process.exit(1);
      }, 30000);
    };
    
    // Registra handlers de shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Erro fatal ao iniciar servidor', { error });
    
    // Tenta fechar conexões antes de sair
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error('Erro ao desconectar do banco', { error: disconnectError });
    }
    
    process.exit(1);
  }
}

// ===== TRATAMENTO DE ERROS GLOBAIS =====

// Captura exceções não tratadas
process.on('uncaughtException', (error) => {
  logger.error('Exceção não capturada - CRÍTICO', {
    error: error.message,
    stack: error.stack,
  });
  
  // Tenta fazer graceful shutdown
  gracefulShutdown('uncaughtException').finally(() => {
    process.exit(1);
  });
});

// Captura promises rejeitadas não tratadas
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada - CRÍTICO', {
    reason,
    promise,
  });
  
  // Tenta fazer graceful shutdown
  gracefulShutdown('unhandledRejection').finally(() => {
    process.exit(1);
  });
});

// Captura avisos do Node.js
process.on('warning', (warning) => {
  logger.warn('Aviso do Node.js', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

// ===== INICIALIZAÇÃO =====

// Inicia o servidor apenas se este arquivo for executado diretamente
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Erro fatal na inicialização', { error });
    process.exit(1);
  });
}

// Exporta função para testes
export { startServer };
export default app;