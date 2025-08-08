# Deploy na Render - Sistema de Provas

## 🚀 Configuração Automática

### 1. Configuração do Serviço Web

**Build Command:**
```bash
npm run render:build
```

**Start Command:**
```bash
npm start
```

### 2. Variáveis de Ambiente Necessárias

Configure as seguintes variáveis no painel da Render:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://usuario:senha@host:porta/database
REDIS_URL=redis://host:porta
JWT_SECRET=seu_jwt_secret_super_seguro
JWT_REFRESH_SECRET=seu_refresh_secret_super_seguro
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CACHE_TTL=300
QUEUE_REDIS_URL=redis://host:porta
```

### 3. Configuração do Banco de Dados

1. Crie um PostgreSQL na Render
2. Copie a `DATABASE_URL` gerada
3. Cole nas variáveis de ambiente do seu serviço web

### 4. Configuração do Redis

1. Crie um Redis na Render
2. Copie a `REDIS_URL` gerada
3. Use a mesma URL para `REDIS_URL` e `QUEUE_REDIS_URL`

### 5. Deploy

1. Conecte seu repositório GitHub à Render
2. Configure as variáveis de ambiente
3. Execute o deploy

## 🔧 Troubleshooting

### Erro: "Property 'ADMIN' does not exist"

Este erro foi corrigido automaticamente através do script `render:build` que:
1. Instala as dependências
2. **Gera o Prisma Client** (crucial para incluir UserRole.ADMIN)
3. Compila o TypeScript

### Verificação Local

Para testar localmente se o build está funcionando:

```bash
# Limpar e rebuildar
npm run clean
npm run render:build
npm start
```

## 📋 Checklist de Deploy

- [ ] Repositório conectado à Render
- [ ] Build Command: `npm run render:build`
- [ ] Start Command: `npm start`
- [ ] Todas as variáveis de ambiente configuradas
- [ ] PostgreSQL criado e conectado
- [ ] Redis criado e conectado
- [ ] Deploy executado com sucesso

## 🎯 Scripts Importantes

- `npm run render:build` - Build otimizado para Render
- `npm run build` - Build padrão com Prisma Client
- `npm start` - Inicia o servidor em produção
- `npx prisma generate` - Regenera o Prisma Client

## ⚡ Performance

O sistema está otimizado para:
- Alta concorrência (10.000+ requisições)
- Cache Redis integrado
- Rate limiting configurado
- Monitoramento de performance
- Background jobs para processamento assíncrono