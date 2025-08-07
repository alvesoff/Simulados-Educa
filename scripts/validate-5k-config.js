/**
 * Script de Validação de Configurações para 5K Usuários
 * 
 * Este script verifica se todas as configurações necessárias
 * estão corretas antes de executar o teste de carga.
 * 
 * Uso: node scripts/validate-5k-config.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class ConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.checks = [];
  }

  async validate() {
    console.log('🔍 Validando configurações para 5K usuários...');
    console.log('=' .repeat(60));

    // Verificações de arquivos
    this.checkEnvFile();
    this.checkConfigFile();
    this.checkServerFile();
    this.checkCacheFile();
    this.checkQueueFile();
    
    // Verificações de conectividade
    await this.checkServerHealth();
    await this.checkDatabaseConnection();
    await this.checkRedisConnection();
    
    // Verificações de dependências
    this.checkDependencies();
    
    // Relatório final
    this.generateReport();
  }

  checkEnvFile() {
    console.log('📄 Verificando arquivo .env...');
    
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      this.errors.push('Arquivo .env não encontrado. Copie de .env.example');
      return;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Verificações críticas
    const criticalChecks = [
      { key: 'DATABASE_URL', contains: 'connection_limit=300', desc: 'Pool de conexões do banco' },
      { key: 'RATE_LIMIT_MAX_REQUESTS', value: '2000', desc: 'Rate limit geral' },
      { key: 'RATE_LIMIT_STUDENT_LOGIN_MAX', value: '1000', desc: 'Rate limit login estudantes' },
      { key: 'QUEUE_CONCURRENCY', value: '20', desc: 'Concorrência das filas' },
      { key: 'CACHE_MAX_KEYS', value: '50000', desc: 'Máximo de chaves no cache' }
    ];
    
    criticalChecks.forEach(check => {
      if (check.contains) {
        if (!envContent.includes(check.contains)) {
          this.errors.push(`${check.desc}: ${check.key} deve conter '${check.contains}'`);
        } else {
          this.checks.push(`✅ ${check.desc}`);
        }
      } else {
        const regex = new RegExp(`${check.key}\s*=\s*["']?${check.value}["']?`);
        if (!regex.test(envContent)) {
          this.errors.push(`${check.desc}: ${check.key} deve ser '${check.value}'`);
        } else {
          this.checks.push(`✅ ${check.desc}`);
        }
      }
    });
    
    // Verificações de warning
    const warningChecks = [
      { key: 'NODE_ENV', value: 'production', desc: 'Ambiente de produção' },
      { key: 'LOG_LEVEL', value: 'info', desc: 'Nível de log otimizado' }
    ];
    
    warningChecks.forEach(check => {
      const regex = new RegExp(`${check.key}\s*=\s*["']?${check.value}["']?`);
      if (!regex.test(envContent)) {
        this.warnings.push(`${check.desc}: Recomendado ${check.key}=${check.value}`);
      }
    });
  }

  checkConfigFile() {
    console.log('⚙️  Verificando config.ts...');
    
    const configPath = path.join(process.cwd(), 'src', 'utils', 'config.ts');
    if (!fs.existsSync(configPath)) {
      this.errors.push('Arquivo config.ts não encontrado');
      return;
    }
    
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    const configChecks = [
      { pattern: /MAX:\s*300/, desc: 'Pool máximo do banco (300)' },
      { pattern: /TEST_ACCESS.*max:\s*500/, desc: 'Rate limit TEST_ACCESS (500)' },
      { pattern: /baseConfig\.RATE_LIMIT_MAX_REQUESTS \* 5/, desc: 'Rate limit GENERAL (x5)' }
    ];
    
    configChecks.forEach(check => {
      if (check.pattern.test(configContent)) {
        this.checks.push(`✅ ${check.desc}`);
      } else {
        this.errors.push(`Configuração faltando: ${check.desc}`);
      }
    });
  }

  checkServerFile() {
    console.log('🖥️  Verificando server.ts...');
    
    const serverPath = path.join(process.cwd(), 'src', 'server.ts');
    if (!fs.existsSync(serverPath)) {
      this.errors.push('Arquivo server.ts não encontrado');
      return;
    }
    
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    const serverChecks = [
      { pattern: /maxConnections = 15000/, desc: 'Máximo de conexões (15000)' },
      { pattern: /keepAliveTimeout = 8000/, desc: 'Keep-alive timeout (8000ms)' },
      { pattern: /setKeepAlive\(true, 120000\)/, desc: 'Socket keep-alive (120s)' }
    ];
    
    serverChecks.forEach(check => {
      if (check.pattern.test(serverContent)) {
        this.checks.push(`✅ ${check.desc}`);
      } else {
        this.errors.push(`Configuração do servidor faltando: ${check.desc}`);
      }
    });
  }

  checkCacheFile() {
    console.log('💾 Verificando cache.ts...');
    
    const cachePath = path.join(process.cwd(), 'src', 'utils', 'cache.ts');
    if (!fs.existsSync(cachePath)) {
      this.errors.push('Arquivo cache.ts não encontrado');
      return;
    }
    
    const cacheContent = fs.readFileSync(cachePath, 'utf8');
    
    const cacheChecks = [
      { pattern: /maxConnections: 100/, desc: 'Pool Redis máximo (100)' },
      { pattern: /enableAutoPipelining: true/, desc: 'Auto pipelining habilitado' },
      { pattern: /commandTimeout: 10000/, desc: 'Timeout de comando (10s)' }
    ];
    
    cacheChecks.forEach(check => {
      if (check.pattern.test(cacheContent)) {
        this.checks.push(`✅ ${check.desc}`);
      } else {
        this.errors.push(`Configuração do cache faltando: ${check.desc}`);
      }
    });
  }

  checkQueueFile() {
    console.log('📋 Verificando queue.ts...');
    
    const queuePath = path.join(process.cwd(), 'src', 'utils', 'queue.ts');
    if (!fs.existsSync(queuePath)) {
      this.errors.push('Arquivo queue.ts não encontrado');
      return;
    }
    
    const queueContent = fs.readFileSync(queuePath, 'utf8');
    
    const queueChecks = [
      { pattern: /maxConnections: 50/, desc: 'Pool Redis filas (50)' },
      { pattern: /attempts: 5/, desc: 'Máximo de tentativas (5)' },
      { pattern: /concurrency: 20/, desc: 'Concorrência (20)' }
    ];
    
    queueChecks.forEach(check => {
      if (check.pattern.test(queueContent)) {
        this.checks.push(`✅ ${check.desc}`);
      } else {
        this.errors.push(`Configuração das filas faltando: ${check.desc}`);
      }
    });
  }

  async checkServerHealth() {
    console.log('🏥 Verificando saúde do servidor...');
    
    try {
      const response = await axios.get('http://localhost:3001/health', {
        timeout: 5000
      });
      
      if (response.status === 200) {
        this.checks.push('✅ Servidor respondendo');
        
        const health = response.data;
        if (health.database === 'connected') {
          this.checks.push('✅ Banco de dados conectado');
        } else {
          this.errors.push('Banco de dados não conectado');
        }
        
        if (health.redis === 'connected') {
          this.checks.push('✅ Redis conectado');
        } else {
          this.errors.push('Redis não conectado');
        }
      }
    } catch (error) {
      this.errors.push(`Servidor não está rodando: ${error.message}`);
    }
  }

  async checkDatabaseConnection() {
    console.log('🗄️  Verificando conexão com banco...');
    
    try {
      const response = await axios.get('http://localhost:3001/metrics', {
        timeout: 5000
      });
      
      const metrics = response.data;
      if (metrics.database && metrics.database.poolActive !== undefined) {
        this.checks.push(`✅ Pool do banco ativo: ${metrics.database.poolActive} conexões`);
        
        if (metrics.database.poolActive > 250) {
          this.warnings.push('Pool do banco com muitas conexões ativas');
        }
      }
    } catch (error) {
      this.warnings.push('Não foi possível verificar métricas do banco');
    }
  }

  async checkRedisConnection() {
    console.log('🔴 Verificando conexão com Redis...');
    
    try {
      const response = await axios.get('http://localhost:3001/metrics', {
        timeout: 5000
      });
      
      const metrics = response.data;
      if (metrics.redis && metrics.redis.connections !== undefined) {
        this.checks.push(`✅ Conexões Redis: ${metrics.redis.connections}`);
        
        if (metrics.redis.connections > 80) {
          this.warnings.push('Muitas conexões Redis ativas');
        }
      }
    } catch (error) {
      this.warnings.push('Não foi possível verificar métricas do Redis');
    }
  }

  checkDependencies() {
    console.log('📦 Verificando dependências...');
    
    const packagePath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packagePath)) {
      this.errors.push('package.json não encontrado');
      return;
    }
    
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const deps = { ...packageContent.dependencies, ...packageContent.devDependencies };
    
    const requiredDeps = [
      'express',
      '@prisma/client',
      'ioredis',
      'bull',
      'jsonwebtoken'
    ];
    
    requiredDeps.forEach(dep => {
      if (deps[dep]) {
        this.checks.push(`✅ ${dep} instalado`);
      } else {
        this.errors.push(`Dependência faltando: ${dep}`);
      }
    });
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO DE VALIDAÇÃO');
    console.log('='.repeat(60));
    
    if (this.checks.length > 0) {
      console.log('\n✅ CONFIGURAÇÕES CORRETAS:');
      this.checks.forEach(check => console.log(`  ${check}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  AVISOS:');
      this.warnings.forEach(warning => console.log(`  🟡 ${warning}`));
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ ERROS CRÍTICOS:');
      this.errors.forEach(error => console.log(`  🔴 ${error}`));
      
      console.log('\n🚨 SISTEMA NÃO ESTÁ PRONTO PARA 5K USUÁRIOS!');
      console.log('   Corrija os erros acima antes de executar o teste.');
      process.exit(1);
    } else {
      console.log('\n🎉 SISTEMA PRONTO PARA TESTE DE 5K USUÁRIOS!');
      console.log('\n📋 Próximos passos:');
      console.log('1. node scripts/monitor-5k.js (Terminal 1)');
      console.log('2. node scripts/load-test-5k.js (Terminal 2)');
      console.log('3. artillery run scripts/artillery-5k-test.yml (Terminal 3)');
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

// Executar validação
const validator = new ConfigValidator();
validator.validate().catch(error => {
  console.error('❌ Erro durante validação:', error.message);
  process.exit(1);
});