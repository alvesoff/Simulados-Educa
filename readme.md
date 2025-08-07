# 🎓 Sistema de Provas Online - Backend

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-lightgrey.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.7+-2D3748.svg)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-6+-red.svg)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)

🚀 **Backend otimizado para alta concorrência - Suporta 5000+ usuários simultâneos**

## 📋 Visão Geral

Sistema de backend robusto e escalável para aplicações de provas online, desenvolvido especificamente para suportar alta concorrência na plataforma Render. Arquitetado para lidar com milhares de estudantes realizando provas simultaneamente.

### 🎯 Características Principais

- **🚀 Alta Performance**: Otimizado para 5000+ usuários simultâneos
- **⚡ Cache Inteligente**: Sistema de cache em Redis para reduzir latência
- **🔄 Filas Assíncronas**: Processamento em background para operações pesadas
- **🛡️ Rate Limiting**: Proteção contra spam e ataques DDoS
- **📊 Monitoramento**: Métricas e alertas em tempo real
- **🔐 Segurança**: Autenticação JWT, validação de dados e headers de segurança
- **📈 Escalabilidade**: Arquitetura preparada para crescimento horizontal

## 🛠️ Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|----------|
| Node.js | 18+ | Runtime JavaScript |
| TypeScript | 5.3+ | Linguagem tipada |
| Express.js | 4.18+ | Framework web |
| PostgreSQL | 14+ | Banco de dados principal |
| Redis | 6+ | Cache e filas |
| Prisma | 5.7+ | ORM e migrations |
| Bull | 4.12+ | Sistema de filas |
| Zod | 3.22+ | Validação de dados |
| Winston | 3.11+ | Sistema de logs |
| Jest | 29+ | Testes unitários |

## 📁 Estrutura do Projeto

```
src/
├── 📁 config/           # Configurações da aplicação
│   ├── config.ts        # Configurações principais
│   └── database.ts      # Configuração do Prisma
├── 📁 middleware/       # Middlewares do Express
│   ├── auth.ts          # Autenticação e autorização
│   ├── rateLimiting.ts  # Rate limiting
│   ├── errorHandler.ts  # Tratamento de erros
│   └── monitoring.ts    # Monitoramento e métricas
├── 📁 services/         # Lógica de negócio
│   ├── authService.ts   # Serviços de autenticação
│   ├── testService.ts   # Serviços de testes
│   ├── questionService.ts # Serviços de questões
│   └── studentService.ts # Serviços de estudantes
├── 📁 routes/           # Rotas da API
│   ├── auth.ts          # Rotas de autenticação
│   ├── tests.ts         # Rotas de testes
│   ├── questions.ts     # Rotas de questões
│   └── students.ts      # Rotas de estudantes
├── 📁 utils/            # Utilitários
│   ├── logger.ts        # Sistema de logs
│   ├── cache.ts         # Cache Redis
│   ├── queue.ts         # Filas assíncronas
│   └── queueProcessors.ts # Processadores de jobs
├── 📁 types/            # Definições de tipos
│   └── index.ts         # Interfaces e tipos
├── app.ts               # Configuração do Express
└── server.ts            # Ponto de entrada
```

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- npm ou yarn

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/sistema-provas-backend.git
cd sistema-provas-backend
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` baseado no exemplo:

```env
# Ambiente
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Banco de Dados (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/sistema_provas?connection_limit=10"

# Cache (Redis)
REDIS_URL="redis://localhost:6379"

# Autenticação JWT
JWT_SECRET="seu-jwt-secret-super-seguro"
JWT_REFRESH_SECRET="seu-refresh-secret-super-seguro"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=500
RATE_LIMIT_WINDOW_MS=900000

# Cache
CACHE_TTL=300
CACHE_MAX_KEYS=5000

# Filas
QUEUE_CONCURRENCY=2

# Logs
LOG_LEVEL="info"
LOG_MAX_FILES="14d"
LOG_MAX_SIZE="20m"
```

### 4. Configure o banco de dados

```bash
# Gerar o Prisma Client
npm run db:generate

# Executar migrations
npm run db:migrate

# (Opcional) Popular com dados de teste
npm run db:seed
```

### 5. Execute o projeto

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

## 🌐 Deploy na Render

### 1. Configuração do Serviço Web

- **Build Command**: `npm run render:build`
- **Start Command**: `npm run start:prod`
- **Node Version**: 18

### 2. Variáveis de Ambiente na Render

```env
NODE_ENV=production
DATABASE_URL=<sua-database-url-render>
REDIS_URL=<sua-redis-url-render>
JWT_SECRET=<seu-jwt-secret>
JWT_REFRESH_SECRET=<seu-refresh-secret>
```

### 3. Recursos Recomendados

- **Web Service**: Starter ($7/mês) ou Standard ($25/mês)
- **PostgreSQL**: Starter ($7/mês) ou Standard ($20/mês)
- **Redis**: Starter ($7/mês) ou Standard ($25/mês)

## 📊 API Endpoints

### 🔐 Autenticação
- `POST /api/auth/register` - Registrar usuário
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Renovar token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Perfil do usuário

### 📝 Testes
- `GET /api/tests` - Listar testes
- `POST /api/tests` - Criar teste
- `GET /api/tests/:id` - Obter teste
- `PUT /api/tests/:id` - Atualizar teste
- `DELETE /api/tests/:id` - Deletar teste

### ❓ Questões
- `GET /api/questions` - Listar questões
- `POST /api/questions` - Criar questão
- `GET /api/questions/:id` - Obter questão
- `PUT /api/questions/:id` - Atualizar questão
- `DELETE /api/questions/:id` - Deletar questão

### 👨‍🎓 Estudantes
- `POST /api/students/login` - Login de estudante
- `GET /api/students/attempts` - Listar tentativas
- `POST /api/students/attempt/:id/answer` - Responder questão
- `POST /api/students/attempt/:id/finish` - Finalizar teste

### 🔧 Sistema
- `GET /api/health` - Health check
- `GET /api/metrics` - Métricas do sistema
- `GET /api/status` - Status dos serviços

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Testes em modo watch
npm run test:watch

# Cobertura de testes
npm run test:coverage
```

## 📈 Monitoramento

O sistema inclui:

- **Logs estruturados** com Winston
- **Métricas de performance** em tempo real
- **Health checks** automáticos
- **Rate limiting** configurável
- **Alertas** para erros críticos

## 🔧 Scripts Disponíveis

| Script | Descrição |
|--------|----------|
| `npm run dev` | Executa em modo desenvolvimento |
| `npm run build` | Compila o TypeScript |
| `npm start` | Executa a versão compilada |
| `npm test` | Executa os testes |
| `npm run lint` | Verifica o código com ESLint |
| `npm run format` | Formata o código com Prettier |
| `npm run db:migrate` | Executa migrations do banco |
| `npm run db:studio` | Abre o Prisma Studio |

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Suporte

Para suporte, entre em contato:

- 📧 Email: suporte@sistemaprovas.com
- 💬 Discord: [Link do servidor]
- 📖 Documentação: [Link da documentação]

---

⭐ **Se este projeto foi útil para você, considere dar uma estrela!**