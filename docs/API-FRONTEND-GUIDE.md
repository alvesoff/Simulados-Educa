# 📚 Guia da API - Educandário Simulados

**Versão:** 1.0.0  
**Ambiente:** Produção  
**Base URL:** `https://educandario-simulados-api.onrender.com`  
**Status:** ✅ Online e Funcional

---

## 🚀 Visão Geral

Esta API fornece todos os recursos necessários para o sistema de simulados do Educandário, incluindo autenticação, gerenciamento de testes, questões e acompanhamento de estudantes.

### ⚡ Status Atual do Sistema
- **Servidor:** Online e estável
- **Banco de Dados:** Conectado e funcional
- **Autenticação:** Implementada e segura
- **Cache:** Configurado (limitações do plano Free)
- **Monitoramento:** Ativo com métricas em tempo real

---

## 🔐 Autenticação

### Base URL para Autenticação
```
POST /api/auth/*
```

### Endpoints Disponíveis

#### 1. Registro de Usuário
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "João Silva",
  "email": "joao@escola.com",
  "password": "senha123",
  "role": "TEACHER", // ou "ADMIN" (apenas maiúsculas)
  "schoolId": "uuid-da-escola"
}
```

**Resposta de Sucesso (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "João Silva",
      "email": "joao@escola.com",
      "role": "teacher"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-token"
    }
  }
}
```

#### 2. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "joao@escola.com",
  "password": "senha123"
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "João Silva",
      "email": "joao@escola.com",
      "role": "teacher"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-token"
    }
  }
}
```

#### 3. Verificar Token
```http
GET /api/auth/verify-token
Authorization: Bearer {token}
```

#### 4. Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh-token"
}
```

#### 5. Logout
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

#### 6. Perfil do Usuário
```http
GET /api/auth/me
Authorization: Bearer {token}
```

#### 7. Mudança de Senha
```http
PUT /api/auth/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "senhaAtual123",
  "newPassword": "novaSenha456"
}
```



#### 6. Logout de Todas as Sessões
```http
POST /api/auth/logout-all
Authorization: Bearer {token}
```

#### 7. Listar Sessões Ativas
```http
GET /api/auth/sessions
Authorization: Bearer {token}
```

#### 8. Remover Sessão Específica
```http
DELETE /api/auth/sessions/{sessionId}
Authorization: Bearer {token}
```

#### 9. Estatísticas de Autenticação
```http
GET /api/auth/stats
Authorization: Bearer {token}
```

---

## 📝 Testes

### Base URL
```
/api/tests
```

### Endpoints Principais

#### 1. Listar Testes
```http
GET /api/tests
Authorization: Bearer {token}

# Parâmetros de Query (opcionais)
?page=1&limit=10&search=matematica&status=active
```

#### 2. Criar Teste
```http
POST /api/tests
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Simulado de Matemática",
  "description": "Teste sobre álgebra e geometria",
  "type": "PRIVATE", // ou "COLLABORATIVE"
  "duration": 120, // em minutos
  "maxAttempts": 1, // número máximo de tentativas
  "showResults": true,
  "shuffleQuestions": false,
  "shuffleOptions": false,
  "settings": {} // configurações adicionais
}
```

#### 3. Obter Teste por ID
```http
GET /api/tests/{testId}
Authorization: Bearer {token}
```

#### 4. Atualizar Teste
```http
PUT /api/tests/{testId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Novo título",
  "description": "Nova descrição"
}
```

#### 5. Ativar Teste
```http
POST /api/tests/{testId}/activate
Authorization: Bearer {token}
```

#### 6. Desativar Teste
```http
POST /api/tests/{testId}/deactivate
Authorization: Bearer {token}
```

#### 7. Adicionar Questões ao Teste
```http
POST /api/tests/{testId}/questions
Authorization: Bearer {token}
Content-Type: application/json

{
  "questionIds": ["uuid1", "uuid2", "uuid3"]
}
```

#### 8. Remover Questão do Teste
```http
DELETE /api/tests/{testId}/questions/{questionId}
Authorization: Bearer {token}
```

#### 9. Obter Estatísticas do Teste
```http
GET /api/tests/{testId}/stats
Authorization: Bearer {token}
```

#### 10. Obter Tentativas do Teste
```http
GET /api/tests/{testId}/attempts
Authorization: Bearer {token}
```

#### 9. Deletar Teste
```http
DELETE /api/tests/{testId}
Authorization: Bearer {token}
```

---

## ❓ Questões

### Base URL
```
/api/questions
```

### Endpoints Principais

#### 1. Listar Questões
```http
GET /api/questions
Authorization: Bearer {token}

# Parâmetros de Query
?page=1&limit=10&subject=matematica&difficulty=medium
```

#### 2. Criar Questão
```http
POST /api/questions
Authorization: Bearer {token}
Content-Type: application/json

{
  "statement": "Qual é o resultado de 2 + 2? Calcule a soma dos números abaixo:",
  "type": "MULTIPLE_CHOICE", // ou "TRUE_FALSE", "ESSAY"
  "subject": "Matemática",
  "topic": "Aritmética", // opcional
  "grade": 5, // série/ano (opcional)
  "difficulty": "EASY", // "EASY", "MEDIUM", "HARD"
  "tags": ["soma", "aritmética"], // opcional
  "hasMath": false, // opcional
  "options": [
    { "text": "3", "isCorrect": false },
    { "text": "4", "isCorrect": true },
    { "text": "5", "isCorrect": false },
    { "text": "6", "isCorrect": false }
  ]
}
```

#### 3. Obter Questão por ID
```http
GET /api/questions/{questionId}
Authorization: Bearer {token}
```

#### 4. Atualizar Questão
```http
PUT /api/questions/{questionId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "statement": "Nova pergunta atualizada",
  "difficulty": "MEDIUM"
}
```

#### 5. Importar Questões
```http
POST /api/questions/import
Authorization: Bearer {token}
Content-Type: multipart/form-data

{
  "file": "arquivo.xlsx ou .json",
  "format": "xlsx" // ou "json"
}
Content-Type: application/json

{
  "questionIds": ["uuid1", "uuid2"],
  "format": "xlsx" // ou "json"
}
```



#### 7. Obter Questões Aleatórias
```http
GET /api/questions/random/get?count=5&subject=Matemática&difficulty=MEDIUM
Authorization: Bearer {token}
```

**Parâmetros de Query:**
- `count` (opcional): Número de questões (padrão: 10)
- `subject` (opcional): Filtrar por matéria
- `difficulty` (opcional): Filtrar por dificuldade
- `grade` (opcional): Filtrar por série
- `type` (opcional): Filtrar por tipo

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "statement": "Qual é o resultado de 2 + 2?",
      "options": [
        { "text": "3", "isCorrect": false },
        { "text": "4", "isCorrect": true }
      ],
      "type": "MULTIPLE_CHOICE",
      "subject": "Matemática",
      "difficulty": "EASY"
    }
  ],
  "message": "5 questões aleatórias encontradas"
}
```

#### 9. Obter Matérias
```http
GET /api/questions/meta/subjects
Authorization: Bearer {token}
```

#### 10. Obter Tópicos por Matéria
```http
GET /api/questions/meta/subjects/{subject}/topics
Authorization: Bearer {token}
```

#### 8. Estatísticas da Questão
```http
GET /api/questions/{questionId}/stats
Authorization: Bearer {token}
```



#### 9. Deletar Questão
```http
DELETE /api/questions/{questionId}
Authorization: Bearer {token}
```

---

## 👥 Estudantes

### Base URL
```
/api/students
```

### Endpoints Principais

#### 1. Login de Estudante
```http
POST /api/students/login
Content-Type: application/json

{
  "accessCode": "ABC123",
  "studentName": "Maria Silva",
  "grade": "9ANO", // ou "1ENSINO_MEDIO", etc.
  "classroom": "A",
  "schoolId": "uuid-da-escola",
  "studentEmail": "maria@email.com", // opcional
  "studentId": "12345" // opcional
}
```

#### 2. Obter Tentativa Ativa
```http
GET /api/students/attempt/{attemptId}
Content-Type: application/json
```
```

#### 3. Submeter Resposta Individual
```http
POST /api/students/attempt/{attemptId}/answer
Content-Type: application/json

{
  "questionId": "uuid-da-questao",
  "answer": 1, // índice da alternativa ou string para dissertativa
  "timeSpent": 30 // em segundos
}
```

#### 3b. Submeter Múltiplas Respostas
```http
POST /api/students/attempt/{attemptId}/answers
Content-Type: application/json

{
  "answers": [
    {
      "questionId": "uuid-da-questao",
      "selectedOption": "texto-da-opcao",
      "timeSpent": 30
    }
  ]
}
```

#### 4. Finalizar Tentativa
```http
POST /api/students/attempt/{attemptId}/finish
Content-Type: application/json

{
  "finalAnswers": [ // opcional
    {
      "questionId": "uuid-da-questao",
      "selectedOption": "texto-da-opcao",
      "timeSpent": 30
    }
  ]
}
```

#### 5. Obter Resultados da Tentativa
```http
GET /api/students/attempt/{attemptId}/results
```

Content-Type: application/json
```

#### 9. Verificar Tempo Restante
```http
GET /api/students/attempt/{attemptId}/time
```

#### 10. Listar Tentativas
```http
GET /api/students/attempts?testId=uuid&status=ACTIVE&page=1&limit=20
Authorization: Bearer {token} // opcional
```
**Parâmetros de Query:**
- `testId` (opcional): Filtrar por teste específico
- `status` (opcional): Filtrar por status (ACTIVE, FINISHED)
- `studentName` (opcional): Filtrar por nome do estudante
- `page` (opcional): Página (padrão: 1)
- `limit` (opcional): Itens por página (padrão: 20)

**Resposta:**
```json
{
  "success": true,
  "data": {
    "attempts": [
      {
        "id": "uuid",
        "studentName": "João Silva",
        "testTitle": "Simulado de Matemática",
        "status": "ACTIVE",
        "startedAt": "2025-01-27T10:00:00Z",
        "score": null,
        "totalQuestions": 20,
        "answeredQuestions": 15
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

## 📊 Monitoramento e Status

### Endpoints de Sistema

#### 1. Status Geral
```http
GET /status
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "service": "Backend API",
    "version": "1.0.0",
    "environment": "production",
    "uptime": 86400,
    "timestamp": "2025-01-10T10:00:00Z",
    "memory": {
      "rss": 45678912,
      "heapTotal": 34567890,
      "heapUsed": 23456789
    },
    "cpu": {
      "user": 123456,
      "system": 78901
    }
  }
}
```

#### 2. Métricas Detalhadas
```http
GET /metrics
```

#### 3. Health Check
```http
GET /health
```

#### 4. Ping
```http
GET /ping
```

---

## 🔧 Configuração do Cliente

### Headers Obrigatórios
```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}` // quando autenticado
};
```

### Exemplo de Configuração Axios
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://educandario-simulados-api.onrender.com',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para adicionar token automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expirado, tentar refresh
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await api.post('/api/auth/refresh', {
            refreshToken
          });
          const { accessToken } = response.data.data.tokens;
          localStorage.setItem('accessToken', accessToken);
          // Repetir requisição original
          return api.request(error.config);
        } catch (refreshError) {
          // Refresh falhou, redirecionar para login
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## ⚠️ Tratamento de Erros

### Códigos de Status HTTP
- **200** - OK - Sucesso
- **201** - Created - Recurso criado
- **400** - Bad Request - Dados inválidos
- **401** - Unauthorized - Token inválido ou ausente
- **403** - Forbidden - Sem permissão
- **404** - Not Found - Recurso não encontrado
- **409** - Conflict - Conflito de dados
- **422** - Unprocessable Entity - Erro de validação
- **429** - Too Many Requests - Rate limit excedido
- **500** - Internal Server Error - Erro interno
- **503** - Service Unavailable - Serviço indisponível

### Estrutura de Erro Padrão
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos fornecidos",
    "details": {
      "field": "email",
      "issue": "Formato de email inválido"
    }
  },
  "timestamp": "2025-01-27T10:30:00Z"
}
```

### Códigos de Erro Específicos
- **AUTH_INVALID_CREDENTIALS:** Credenciais inválidas
- **AUTH_TOKEN_EXPIRED:** Token expirado
- **AUTH_INSUFFICIENT_PERMISSIONS:** Permissões insuficientes
- **VALIDATION_ERROR:** Erro de validação de dados
- **RESOURCE_NOT_FOUND:** Recurso não encontrado
- **DUPLICATE_RESOURCE:** Recurso duplicado
- **RATE_LIMIT_EXCEEDED:** Limite de requisições excedido
- **TEST_NOT_ACTIVE:** Teste não está ativo
- **ATTEMPT_ALREADY_FINISHED:** Tentativa já finalizada
- **QUEUE_PROCESSING_ERROR:** Erro no processamento da fila

---

## 🔧 Endpoints de Sistema

### 1. Status da API
```http
GET /api/status
```

### 2. Métricas do Sistema
```http
GET /api/metrics
```

### 3. Health Check
```http
GET /api/health
```

### 4. Ping
```http
GET /api/ping
```
**Resposta:**
```json
{
  "success": true,
  "message": "pong",
  "timestamp": "2025-01-27T10:30:00Z"
}
```

### 5. Informações da API
```http
GET /api
```
**Resposta:**
```json
{
  "success": true,
  "data": {
    "name": "Sistema de Provas Online - API",
    "version": "1.0.0",
    "description": "API para sistema de provas online otimizada para alta concorrência",
    "endpoints": {
      "auth": "/api/auth",
      "tests": "/api/tests",
      "questions": "/api/questions",
      "students": "/api/students"
    },
    "documentation": "https://docs.example.com",
    "support": "support@example.com"
  }
}
```

---

## 📊 Rate Limiting

### Limites por Endpoint
- **Geral:** 1000 requisições por 15 minutos
- **Autenticação:** 5 tentativas por 15 minutos
- **Login de Estudante:** 100 por 15 minutos
- **Submissão de Respostas:** 50 por minuto
- **Acesso a Teste:** 100 por 15 minutos

### Headers de Rate Limit
```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 499
X-RateLimit-Reset: 1641811200
```

---

## 🔄 Fluxo Típico de Uso

### 1. Autenticação de Professor
```javascript
// 1. Login
const loginResponse = await api.post('/api/auth/login', {
  email: 'professor@escola.com',
  password: 'senha123'
});

const { accessToken, refreshToken } = loginResponse.data.data.tokens;
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);

// 2. Criar teste
const testResponse = await api.post('/api/tests', {
  title: 'Simulado de História',
  duration: 90,
  // ... outros campos
});

const testId = testResponse.data.data.id;
```

### 2. Acesso de Estudante
```javascript
// 1. Login de estudante
const loginResponse = await api.post('/api/students/login', {
  accessCode: 'ABC123',
  studentName: 'João Aluno',
  grade: '9ANO',
  classroom: 'A',
  schoolId: 'uuid-da-escola'
});

const { attemptId, test } = loginResponse.data.data;

// 2. Obter dados da tentativa
const attemptResponse = await api.get(`/api/students/attempt/${attemptId}`);
const attempt = attemptResponse.data.data;

// 3. Responder questões
for (const question of test.questions) {
  await api.post(`/api/students/attempt/${attemptId}/answer`, {
    questionId: question.id,
    answer: selectedAnswerIndex, // ou string para dissertativa
    timeSpent: 45
  });
}

// 4. Finalizar
const finishResponse = await api.post(`/api/students/attempt/${attemptId}/finish`, {
  finalAnswers: [ // opcional
    {
      questionId: question.id,
      selectedOption: "resposta final",
      timeSpent: 45
    }
  ]
});
```

---

## ⚙️ Configuração e Variáveis de Ambiente

### Variáveis Obrigatórias
```env
# Banco de dados
DATABASE_URL=postgresql://user:password@localhost:5432/database

# JWT Secrets (mínimo 32 caracteres)
JWT_SECRET=your-super-secret-jwt-key-here-32-chars-min
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here-32-chars-min
```

### Variáveis Opcionais
```env
# Servidor
PORT=3000
NODE_ENV=development # development | production | test

# Redis
REDIS_URL=redis://localhost:6379

# Frontend
FRONTEND_URL=http://localhost:3001

# JWT
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=300000 # 5 minutos
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_STUDENT_LOGIN_MAX=1000
RATE_LIMIT_TEST_ACCESS_MAX=500

# Segurança
BCRYPT_ROUNDS=12

# Performance
WEB_CONCURRENCY=4

# Monitoramento
ENABLE_MONITORING=false
METRICS_ENDPOINT=/api/v1/metrics

# API Externa de Questões
QUESTIONS_API_URL=https://api-questao-1.onrender.com/api/v1/questoes
```

### Configurações de Rate Limiting por Endpoint
- **Autenticação:** 5 tentativas por 15 minutos
- **Login de Estudante:** 1000 por 15 minutos
- **Acesso a Teste:** 500 por 15 minutos
- **Submissão de Respostas:** 50 por minuto
- **Geral:** 1000 requisições por 15 minutos

### Configurações de Cache (TTL)
- **SHORT:** 5 minutos
- **MEDIUM:** 30 minutos
- **LONG:** 2 horas
- **VERY_LONG:** 24 horas

---

## 📈 Considerações de Performance

### Cache
- Dados de testes são cacheados por 30 minutos
- Questões são cacheadas por 30 minutos


### Otimizações
- Use paginação para listas grandes
- Implemente debounce em buscas
- Cache dados no frontend quando apropriado


---

## 🔄 Versionamento da API

### Versão Atual: v1
- **Base URL:** `https://educandario-simulados-api.onrender.com/api`
- **Versão:** 1.0.0
- **Última Atualização:** Janeiro 2025

### Política de Versionamento
- **Breaking Changes:** Nova versão major (v2, v3, etc.)
- **Novas Features:** Versão minor (v1.1, v1.2, etc.)
- **Bug Fixes:** Versão patch (v1.0.1, v1.0.2, etc.)

### Compatibilidade
- **Suporte:** Versões anteriores mantidas por 6 meses
- **Deprecação:** Aviso com 3 meses de antecedência
- **Migração:** Guias de migração fornecidos

---

## 🔍 Logs e Debugging

### Estrutura de Logs
A API utiliza um sistema de logging estruturado com diferentes níveis:

```javascript
// Níveis de log disponíveis
- ERROR: Erros críticos
- WARN: Avisos importantes
- INFO: Informações gerais
- DEBUG: Informações de debug (apenas em desenvolvimento)
```

### Logs por Módulo
```javascript
// Logs de autenticação
logger.auth('Login realizado', { userId, email, ip });

// Logs de testes
logger.test('Teste criado', { testId, title, creatorId });

// Logs de questões
logger.question('Questão criada', { questionId, subject, difficulty });

// Logs de estudantes
logger.student('Tentativa iniciada', { attemptId, testId, studentName });
```

### Informações Incluídas nos Logs
- **Timestamp:** Data e hora da operação
- **Request ID:** Identificador único da requisição
- **User Info:** ID do usuário, IP, user agent
- **Performance:** Tempo de execução das operações
- **Context:** Dados relevantes da operação

### Debugging em Desenvolvimento
```bash
# Habilitar logs de debug
NODE_ENV=development DEBUG=* npm run dev

# Logs específicos
DEBUG=app:auth,app:test npm run dev
```

---

## 🚀 Funcionalidades Futuras

### Planejadas
- **Mobile App:** Aplicativo móvel nativo
- **Integração LMS:** Integração com sistemas de gestão de aprendizagem
- **AI Proctoring:** Monitoramento automatizado de tentativas
- **Gamificação:** Sistema de pontos e conquistas
- **Multi-idioma:** Suporte a múltiplos idiomas

---

## 🔒 Segurança e Melhores Práticas

### Autenticação e Autorização
- **JWT Tokens:** Utilize tokens JWT para autenticação
- **Refresh Tokens:** Implemente renovação automática de tokens
- **Roles e Permissões:** Respeite os níveis de acesso (ADMIN, STAFF, TEACHER)
- **Session Management:** Gerencie sessões ativas adequadamente

### Proteção de Dados
- **HTTPS Only:** Sempre use HTTPS em produção
- **Sanitização:** Sanitize todos os inputs do usuário
- **Validação:** Valide dados tanto no frontend quanto no backend
- **Rate Limiting:** Respeite os limites para evitar ataques

### Headers de Segurança
```javascript
// Headers implementados automaticamente
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
```

### Dados Sensíveis
- **Nunca** exponha senhas ou tokens em logs
- **Criptografe** dados sensíveis em repouso
- **Minimize** dados coletados de estudantes
- **Anonimize** dados para analytics

---

## 📝 Notas Importantes

1. **Autenticação:** Todos os endpoints protegidos requerem o header `Authorization: Bearer {token}`
2. **Rate Limiting:** Respeite os limites de requisições para evitar bloqueios
3. **Validação:** Sempre valide os dados antes de enviar
4. **Timeouts:** Configure timeouts adequados (recomendado: 30s)
5. **Retry Logic:** Implemente retry com backoff exponencial para erros 5xx
6. **CORS:** A API suporta CORS para requisições do frontend
7. **Cache:** Utilize cache adequadamente para melhorar performance
8. **Logs:** Monitore logs de erro para debugging
9. **Segurança:** Siga as práticas de segurança documentadas acima
10. **Compliance:** Respeite LGPD/GDPR para dados de estudantes

---

## 📞 Suporte e Contato

### Documentação
- **API Docs:** Esta documentação
- **Changelog:** Histórico de mudanças disponível
- **Status Page:** Monitor de status da API

### Ambiente de Desenvolvimento
- **Base URL Local:** `http://localhost:3000/api`
- **Prisma Studio:** `http://localhost:5555`
- **Métricas:** `http://localhost:3000/api/metrics`

---

*Documentação atualizada em: Janeiro 2025 - Versão 1.0.0*