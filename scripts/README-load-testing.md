# 🚀 Guia de Teste de Carga para 5K Usuários

Este guia explica como executar e interpretar os testes de carga para validar se o sistema suporta 5.000 usuários simultâneos.

## 📋 Pré-requisitos

### 1. Ferramentas Necessárias
```bash
# Instalar Artillery (ferramenta de teste de carga)
npm install -g artillery

# Instalar dependências do projeto
npm install
```

### 2. Configuração do Ambiente
```bash
# Copiar variáveis de ambiente otimizadas
cp .env.example .env

# Verificar se as configurações estão corretas
# - DATABASE_URL com connection_limit=300
# - RATE_LIMIT_MAX_REQUESTS=500
# - QUEUE_CONCURRENCY=20
# - CACHE_MAX_KEYS=50000
```

### 3. Preparação do Banco de Dados
```bash
# Executar migrações
npx prisma migrate deploy

# Gerar cliente Prisma
npx prisma generate

# (Opcional) Seed com dados de teste
npm run seed
```

## 🎯 Executando o Teste de Carga

### Passo 1: Iniciar o Servidor
```bash
# Terminal 1: Iniciar o servidor em modo produção
NODE_ENV=production npm start

# Aguardar até ver:
# ✅ Servidor rodando na porta 3001
# ✅ Conectado ao banco de dados
# ✅ Redis conectado
```

### Passo 2: Iniciar o Monitor
```bash
# Terminal 2: Iniciar monitoramento em tempo real
node scripts/monitor-5k.js

# Você verá métricas em tempo real:
# Timestamp  CPU%  Mem(MB)  MemUsage%  ActiveConn  ReqPerMin  AvgResponse(ms)  ErrorRate%
```

### Passo 3: Executar o Teste
```bash
# Terminal 3: Executar o teste de carga
node scripts/load-test-5k.js

# Depois executar o Artillery:
artillery run scripts/artillery-5k-test.yml
```

## 📊 Interpretando os Resultados

### Métricas Críticas

| Métrica | Valor Ideal | Valor Crítico | Descrição |
|---------|-------------|---------------|------------|
| **CPU Usage** | < 70% | > 90% | Uso de processador |
| **Memory Usage** | < 80% | > 90% | Uso de memória RAM |
| **Avg Response Time** | < 1000ms | > 3000ms | Latência média |
| **Error Rate** | < 2% | > 10% | Taxa de erros HTTP |
| **Active Connections** | < 12000 | > 15000 | Conexões simultâneas |
| **Requests/min** | > 1000 | < 500 | Throughput |

### Fases do Teste

1. **Warm up (1 min)**: 10-100 usuários
   - Sistema deve responder normalmente
   - CPU < 30%, Memória < 50%

2. **Ramp up to 1K (2 min)**: 100-1000 usuários
   - Aumento gradual da carga
   - CPU < 50%, Latência < 500ms

3. **Ramp up to 3K (3 min)**: 1000-3000 usuários
   - Teste de resistência
   - CPU < 70%, Latência < 1000ms

4. **Peak load 5K (5 min)**: 5000 usuários
   - **FASE CRÍTICA**: Sistema deve manter estabilidade
   - CPU < 80%, Latência < 2000ms, Erro < 5%

5. **Cool down (1 min)**: 5000-100 usuários
   - Sistema deve se recuperar rapidamente
   - Métricas devem voltar aos níveis normais

## ✅ Critérios de Aprovação

O teste é considerado **APROVADO** se:

- ✅ CPU máximo ≤ 90%
- ✅ Memória máxima ≤ 90%
- ✅ Latência média ≤ 3000ms
- ✅ Taxa de erro ≤ 10%
- ✅ Throughput mínimo ≥ 1000 req/min
- ✅ Sistema se mantém estável por 5 minutos no pico

## 🚨 Troubleshooting

### Problema: CPU muito alta (>90%)
**Soluções:**
- Verificar queries lentas no banco
- Otimizar algoritmos de processamento
- Implementar cache adicional
- Considerar scaling horizontal

### Problema: Memória muito alta (>90%)
**Soluções:**
- Verificar vazamentos de memória
- Reduzir TTL do cache
- Otimizar estruturas de dados
- Implementar garbage collection

### Problema: Latência alta (>3000ms)
**Soluções:**
- Otimizar queries do banco de dados
- Implementar índices adicionais
- Aumentar pool de conexões
- Implementar cache de resultados

### Problema: Taxa de erro alta (>10%)
**Soluções:**
- Verificar rate limiting
- Aumentar timeouts
- Verificar capacidade do banco
- Implementar circuit breaker

### Problema: Baixo throughput (<1000 req/min)
**Soluções:**
- Aumentar workers do servidor
- Otimizar middleware
- Implementar keep-alive
- Verificar gargalos de rede

## 📈 Otimizações Implementadas

As seguintes otimizações já foram aplicadas para suportar 5K usuários:

### Banco de Dados
- ✅ Pool de conexões: 300 (era 100)
- ✅ Connection timeout: 45s (era 30s)
- ✅ Statement timeout: 45s (era 30s)

### Redis Cache
- ✅ Pool de conexões: 100 max, 20 min
- ✅ Pipeline automático habilitado
- ✅ Timeout de comando: 10s

### Servidor HTTP
- ✅ Max conexões: 15.000 (era 10.000)
- ✅ Keep-alive: 120s (era 60s)
- ✅ Request timeout: 45s (era 30s)

### Rate Limiting
- ✅ Limite geral: 10.000 req/15min (era 500)
- ✅ Login estudantes: 1.000 req/15min (era 50)
- ✅ Submissão respostas: 300 req/15min (era 60)
- ✅ **Suporte para laboratórios:** Até 1.000 alunos do mesmo IP

### Sistema de Filas
- ✅ Concorrência: 20 workers (era 5)
- ✅ Max tentativas: 5 (era 3)
- ✅ Pool Redis: 50 conexões

## 📝 Logs e Relatórios

Após o teste, você encontrará:

- **logs/load-test-[timestamp].log**: Métricas detalhadas
- **logs/load-test-report-[timestamp].json**: Relatório completo
- **Artillery report**: Estatísticas do teste de carga

## 🔄 Próximos Passos

Se o teste **PASSAR**:
- ✅ Sistema está pronto para 5K usuários
- Implementar monitoramento em produção
- Configurar alertas automáticos
- Planejar testes regulares

Se o teste **FALHAR**:
- Analisar logs detalhados
- Identificar gargalos específicos
- Aplicar otimizações adicionais
- Repetir o teste

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verificar logs em `logs/`
2. Consultar métricas em `/metrics`
3. Revisar configurações em `.env`
4. Analisar performance do banco de dados

---

**⚠️ IMPORTANTE**: Execute estes testes apenas em ambiente de desenvolvimento ou teste. Nunca execute testes de carga em produção sem planejamento adequado.