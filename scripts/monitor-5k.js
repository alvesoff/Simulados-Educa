/**
 * Monitor de Performance para Teste de 5K Usuários
 * 
 * Este script monitora métricas em tempo real durante o teste de carga:
 * - CPU e Memória
 * - Conexões ativas
 * - Latência de resposta
 * - Taxa de erro
 * - Métricas do Redis
 * - Pool de conexões do banco
 * 
 * Uso: node scripts/monitor-5k.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class LoadTestMonitor {
  constructor() {
    this.baseUrl = 'http://localhost:3001';
    this.logFile = path.join(__dirname, '../logs', `load-test-${Date.now()}.log`);
    this.metrics = [];
    this.isRunning = false;
    this.interval = null;
    
    // Cria diretório de logs se não existir
    const logsDir = path.dirname(this.logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  async start() {
    console.log('🚀 Iniciando monitoramento de performance...');
    console.log(`📊 Logs salvos em: ${this.logFile}`);
    console.log('\n' + '='.repeat(80));
    
    this.isRunning = true;
    this.logHeader();
    
    // Monitora a cada 5 segundos
    this.interval = setInterval(() => {
      this.collectMetrics();
    }, 5000);
    
    // Para o monitoramento com Ctrl+C
    process.on('SIGINT', () => {
      this.stop();
    });
  }

  stop() {
    console.log('\n\n🛑 Parando monitoramento...');
    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
    }
    
    this.generateReport();
    process.exit(0);
  }

  logHeader() {
    const header = [
      'Timestamp',
      'CPU%',
      'Mem(MB)',
      'MemUsage%',
      'ActiveConn',
      'ReqPerMin',
      'AvgResponse(ms)',
      'ErrorRate%',
      'RedisConn',
      'DBPool'
    ].join('\t');
    
    fs.appendFileSync(this.logFile, header + '\n');
    console.log(header);
  }

  async collectMetrics() {
    try {
      const timestamp = new Date().toISOString();
      
      // Coleta métricas do endpoint /metrics
      const response = await axios.get(`${this.baseUrl}/metrics`, {
        timeout: 5000
      });
      
      const metrics = response.data;
      
      // Calcula métricas derivadas
      const memoryUsageMB = Math.round(metrics.system.memory.used / 1024 / 1024);
      const memoryUsagePercent = Math.round((metrics.system.memory.used / metrics.system.memory.total) * 100);
      const errorRate = metrics.requests.total > 0 
        ? Math.round((metrics.requests.errors / metrics.requests.total) * 100) 
        : 0;
      
      const currentMetrics = {
        timestamp,
        cpu: Math.round(metrics.system.cpu || 0),
        memoryMB: memoryUsageMB,
        memoryPercent: memoryUsagePercent,
        activeConnections: metrics.system.activeConnections || 0,
        requestsPerMinute: metrics.requests.perMinute || 0,
        avgResponseTime: Math.round(metrics.requests.avgResponseTime || 0),
        errorRate,
        redisConnections: metrics.redis?.connections || 0,
        dbPoolActive: metrics.database?.poolActive || 0
      };
      
      this.metrics.push(currentMetrics);
      
      // Log na tela e arquivo
      const logLine = [
        timestamp.substring(11, 19), // Apenas HH:MM:SS
        currentMetrics.cpu + '%',
        currentMetrics.memoryMB,
        currentMetrics.memoryPercent + '%',
        currentMetrics.activeConnections,
        currentMetrics.requestsPerMinute,
        currentMetrics.avgResponseTime,
        currentMetrics.errorRate + '%',
        currentMetrics.redisConnections,
        currentMetrics.dbPoolActive
      ].join('\t');
      
      console.log(logLine);
      fs.appendFileSync(this.logFile, `${timestamp}\t${logLine.substring(9)}\n`);
      
      // Alertas em tempo real
      this.checkAlerts(currentMetrics);
      
    } catch (error) {
      const errorMsg = `❌ Erro ao coletar métricas: ${error.message}`;
      console.log(errorMsg);
      fs.appendFileSync(this.logFile, `${new Date().toISOString()}\tERROR\t${error.message}\n`);
    }
  }

  checkAlerts(metrics) {
    const alerts = [];
    
    if (metrics.cpu > 80) {
      alerts.push(`🔥 CPU alta: ${metrics.cpu}%`);
    }
    
    if (metrics.memoryPercent > 85) {
      alerts.push(`💾 Memória alta: ${metrics.memoryPercent}%`);
    }
    
    if (metrics.avgResponseTime > 2000) {
      alerts.push(`🐌 Latência alta: ${metrics.avgResponseTime}ms`);
    }
    
    if (metrics.errorRate > 5) {
      alerts.push(`⚠️  Taxa de erro alta: ${metrics.errorRate}%`);
    }
    
    if (metrics.activeConnections > 12000) {
      alerts.push(`🔗 Muitas conexões: ${metrics.activeConnections}`);
    }
    
    if (alerts.length > 0) {
      console.log('\n' + '⚠️ '.repeat(20));
      alerts.forEach(alert => console.log(alert));
      console.log('⚠️ '.repeat(20) + '\n');
    }
  }

  generateReport() {
    if (this.metrics.length === 0) {
      console.log('❌ Nenhuma métrica coletada.');
      return;
    }
    
    const report = this.calculateSummary();
    const reportPath = path.join(__dirname, '../logs', `load-test-report-${Date.now()}.json`);
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 RELATÓRIO FINAL DO TESTE DE CARGA');
    console.log('='.repeat(80));
    console.log(`⏱️  Duração: ${report.duration} minutos`);
    console.log(`📈 Pico de CPU: ${report.peak.cpu}%`);
    console.log(`💾 Pico de Memória: ${report.peak.memory}MB (${report.peak.memoryPercent}%)`);
    console.log(`🔗 Máx Conexões: ${report.peak.connections}`);
    console.log(`🚀 Máx Req/min: ${report.peak.requestsPerMinute}`);
    console.log(`⚡ Latência Média: ${report.average.responseTime}ms`);
    console.log(`❌ Taxa de Erro: ${report.average.errorRate}%`);
    console.log(`\n📄 Relatório completo: ${reportPath}`);
    
    // Verifica se passou no teste
    const passed = this.evaluateTestResults(report);
    console.log(`\n${passed ? '✅ TESTE APROVADO' : '❌ TESTE REPROVADO'}`);
  }

  calculateSummary() {
    const duration = Math.round((this.metrics.length * 5) / 60); // 5 segundos por coleta
    
    return {
      duration,
      totalSamples: this.metrics.length,
      peak: {
        cpu: Math.max(...this.metrics.map(m => m.cpu)),
        memory: Math.max(...this.metrics.map(m => m.memoryMB)),
        memoryPercent: Math.max(...this.metrics.map(m => m.memoryPercent)),
        connections: Math.max(...this.metrics.map(m => m.activeConnections)),
        requestsPerMinute: Math.max(...this.metrics.map(m => m.requestsPerMinute)),
        responseTime: Math.max(...this.metrics.map(m => m.avgResponseTime))
      },
      average: {
        cpu: Math.round(this.metrics.reduce((sum, m) => sum + m.cpu, 0) / this.metrics.length),
        memory: Math.round(this.metrics.reduce((sum, m) => sum + m.memoryMB, 0) / this.metrics.length),
        connections: Math.round(this.metrics.reduce((sum, m) => sum + m.activeConnections, 0) / this.metrics.length),
        requestsPerMinute: Math.round(this.metrics.reduce((sum, m) => sum + m.requestsPerMinute, 0) / this.metrics.length),
        responseTime: Math.round(this.metrics.reduce((sum, m) => sum + m.avgResponseTime, 0) / this.metrics.length),
        errorRate: Math.round(this.metrics.reduce((sum, m) => sum + m.errorRate, 0) / this.metrics.length)
      },
      rawData: this.metrics
    };
  }

  evaluateTestResults(report) {
    const criteria = {
      maxCpu: 90,
      maxMemoryPercent: 90,
      maxAvgResponseTime: 3000,
      maxErrorRate: 10,
      minRequestsPerMinute: 1000
    };
    
    return (
      report.peak.cpu <= criteria.maxCpu &&
      report.peak.memoryPercent <= criteria.maxMemoryPercent &&
      report.average.responseTime <= criteria.maxAvgResponseTime &&
      report.average.errorRate <= criteria.maxErrorRate &&
      report.peak.requestsPerMinute >= criteria.minRequestsPerMinute
    );
  }
}

// Inicia o monitor
const monitor = new LoadTestMonitor();
monitor.start();

console.log('\n💡 Dicas:');
console.log('- Execute este script ANTES de iniciar o teste de carga');
console.log('- Use Ctrl+C para parar o monitoramento e gerar relatório');
console.log('- Monitore especialmente CPU, Memória e Latência');
console.log('- Taxa de erro deve ficar abaixo de 5%');