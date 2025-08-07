# Documentação da API - Sistema de Testes Educacionais

## Visão Geral

Este sistema é uma plataforma de testes educacionais que permite professores criarem e gerenciarem testes, e estudantes realizarem esses testes sem necessidade de cadastro prévio.

## Configuração Atual

- **Recursos**: 512 MB RAM, 0.1 CPU
- **Banco de Dados**: PostgreSQL
- **Cache**: Redis
- **Autenticação**: JWT com Refresh Tokens
- **Rate Limiting**: Configurado para diferentes tipos de operação

---

## Banco de Dados

### Tabelas Principais

#### 1. **schools** (Escolas)
```sql
id          String   @id @default(cuid())
name        String   -- Nome da escola
code        String   @unique -- Código único da escola
address     String?  -- Endereço (opcional)
isActive    Boolean  @default(true)
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

#### 2. **users** (Usuários - Professores/Staff)
```sql
id          String    @id @default(cuid())
email       String    @unique
name        String
password    String    -- Hash da senha
role        UserRole  @default(TEACHER) -- TEACHER | STAFF
schoolId    String    -- FK para schools
avatarUrl   String?   -- URL do avatar (opcional)
isActive    Boolean   @default(true)
lastLoginAt DateTime? -- Último login
createdAt   DateTime  @default(now())
updatedAt   DateTime  @updatedAt
```

#### 3. **refresh_tokens** (Tokens de Refresh)
```sql
id        String   @id @default(cuid())
token     String   @unique
userId    String   -- FK para users
expiresAt DateTime
createdAt DateTime @default(now())
```

#### 4. **tests** (Testes/Provas)
```sql
id               String     @id @default(cuid())
title            String     -- Título do teste
description      String?    -- Descrição (opcional)
type             TestType   @default(PRIVATE) -- PRIVATE | COLLABORATIVE
status           TestStatus @default(ACTIVE) -- ACTIVE | COMPLETED | EDITING
duration         Int?       -- Duração em minutos
subjects         String[]   -- Array de matérias
targetGrades     String[]   -- Array de séries alvo
instructions     String?    -- Instruções do teste
allowReview      Boolean    @default(false)
shuffleQuestions Boolean    @default(false)
shuffleOptions   Boolean    @default(false)
showResults      Boolean    @default(true)
maxAttempts      Int        @default(1)
accessCode       String?    @unique -- Código de acesso para estudantes
totalPoints      Int        @default(0)
questionsCount   Int        @default(0)
createdAt        DateTime   @default(now())
updatedAt        DateTime   @updatedAt
createdById      String     -- FK para users
schoolId         String?    -- FK para schools
```

#### 5. **questions** (Questões)
```sql
id              String     @id @default(cuid())
statement       String     -- Enunciado da questão
alternatives    String[]   -- Array de alternativas
correctAnswer   Int        -- Índice da resposta correta (0-based)
subject         String     -- Disciplina
topic           String?    -- Tópico da questão
grade           Int?       -- Ano escolar
difficulty      Difficulty -- EASY | MEDIUM | HARD
tags            String[]   -- Array de tags
hasMath         Boolean    @default(false)
externalId      String?    -- ID da API externa
createdAt       DateTime   @default(now())
updatedAt       DateTime   @updatedAt
```

#### 6. **test_questions** (Relacionamento Teste-Questão)
```sql
id         String @id @default(cuid())
testId     String -- FK para tests
questionId String -- FK para questions
points     Int    -- Pontos da questão
orderNum   Int    -- Ordem da questão no teste
```

#### 7. **student_attempts** (Tentativas dos Estudantes)
```sql
id          String    @id @default(cuid())
testId      String    -- FK para tests
studentName String    -- Nome do estudante
schoolId    String    -- FK para schools
grade       String    -- Série do estudante
classroom   String    -- Sala de aula
answers     Json      -- Respostas do aluno
score       Int?      -- Pontuação obtida
totalPoints Int?      -- Total de pontos possíveis
startedAt   DateTime  @default(now())
completedAt DateTime? -- Data de conclusão
duration    Int?      -- Tempo gasto em minutos
analytics   Json?     -- Dados de analytics
```

### Relacionamentos

- **School** → **User** (1:N)
- **School** → **Test** (1:N)
- **School** → **StudentAttempt** (1:N)
- **User** → **Test** (1:N)
- **User** → **RefreshToken** (1:N)
- **Test** → **TestQuestion** (1:N)
- **Test** → **StudentAttempt** (1:N)
- **Question** → **TestQuestion** (1:N)

---

## Rotas da API

### 🔐 Autenticação (`/api/auth`)

#### POST `/api/auth/register`
- **Descrição**: Registra um novo usuário (professor/staff)
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "name": "string (2-100 chars)",
  "email": "string (email válido)",
  "password": "string (8-128 chars)",
  "role": "TEACHER | ADMIN" (opcional, default: TEACHER),
  "schoolId": "string (UUID)"
}
```

#### POST `/api/auth/login`
- **Descrição**: Realiza login do usuário
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "email": "string",
  "password": "string"
}
```

#### POST `/api/auth/refresh`
- **Descrição**: Renova o token de acesso
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "refreshToken": "string"
}
```

#### POST `/api/auth/logout`
- **Descrição**: Realiza logout (invalida token atual)
- **Acesso**: Privado (autenticado)

#### POST `/api/auth/logout-all`
- **Descrição**: Realiza logout de todas as sessões
- **Acesso**: Privado (autenticado)

#### GET `/api/auth/me`
- **Descrição**: Retorna dados do usuário logado
- **Acesso**: Privado (autenticado)

#### PUT `/api/auth/change-password`
- **Descrição**: Altera senha do usuário
- **Acesso**: Privado (autenticado, com rate limiting)
- **Body**:
```json
{
  "currentPassword": "string",
  "newPassword": "string (8-128 chars)"
}
```

#### POST `/api/auth/forgot-password`
- **Descrição**: Solicita reset de senha
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "email": "string"
}
```

#### POST `/api/auth/reset-password`
- **Descrição**: Reseta senha com token
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "token": "string",
  "newPassword": "string (8-128 chars)"
}
```

#### GET `/api/auth/verify-token`
- **Descrição**: Verifica validade do token
- **Acesso**: Público (auth opcional)

#### GET `/api/auth/sessions`
- **Descrição**: Lista sessões ativas do usuário
- **Acesso**: Privado (autenticado)

#### DELETE `/api/auth/sessions/:sessionId`
- **Descrição**: Remove sessão específica
- **Acesso**: Privado (autenticado)

#### GET `/api/auth/stats`
- **Descrição**: Estatísticas de autenticação
- **Acesso**: Privado (autenticado)

---

### 📝 Testes (`/api/tests`)

#### POST `/api/tests`
- **Descrição**: Cria um novo teste
- **Acesso**: Privado (TEACHER, STAFF)
- **Body**:
```json
{
  "title": "string (3-200 chars)",
  "description": "string (max 1000 chars)" (opcional),
  "type": "PRIVATE | PUBLIC | COLLABORATIVE" (opcional, default: PRIVATE),
  "duration": "number (1-480 min)" (opcional),
  "maxAttempts": "number (1-10)" (opcional, default: 1),
  "showResults": "boolean" (opcional, default: true),
  "shuffleQuestions": "boolean" (opcional, default: false),
  "shuffleOptions": "boolean" (opcional, default: false),
  "settings": "object" (opcional)
}
```

#### GET `/api/tests`
- **Descrição**: Lista testes com filtros
- **Acesso**: Privado (autenticado)
- **Query Params**:
  - `schoolId`: UUID (opcional)
  - `status`: EDITING | ACTIVE | COMPLETED (opcional)
  - `type`: PRIVATE | PUBLIC | COLLABORATIVE (opcional)
  - `creatorId`: UUID (opcional)
  - `search`: string (opcional)
  - `page`: number (default: 1)
  - `limit`: number (1-100, default: 20)

#### GET `/api/tests/:id`
- **Descrição**: Busca teste por ID
- **Acesso**: Privado (autenticado)

#### GET `/api/tests/access/:accessCode`
- **Descrição**: Busca teste por código de acesso
- **Acesso**: Público (com rate limiting)

#### PUT `/api/tests/:id`
- **Descrição**: Atualiza teste
- **Acesso**: Privado (TEACHER, STAFF)
- **Body**: Mesmos campos do POST (todos opcionais)

#### POST `/api/tests/:id/questions`
- **Descrição**: Adiciona questões ao teste
- **Acesso**: Privado (TEACHER, STAFF)
- **Body**:
```json
{
  "questionIds": ["uuid1", "uuid2"]
}
```

#### DELETE `/api/tests/:id/questions/:questionId`
- **Descrição**: Remove questão do teste
- **Acesso**: Privado (TEACHER, STAFF)

#### POST `/api/tests/:id/activate`
- **Descrição**: Ativa teste
- **Acesso**: Privado (TEACHER, STAFF)

#### POST `/api/tests/:id/deactivate`
- **Descrição**: Desativa teste
- **Acesso**: Privado (TEACHER, STAFF)

#### DELETE `/api/tests/:id`
- **Descrição**: Exclui teste
- **Acesso**: Privado (TEACHER, STAFF)

#### GET `/api/tests/:id/stats`
- **Descrição**: Estatísticas do teste
- **Acesso**: Privado (TEACHER, STAFF)

#### GET `/api/tests/:id/attempts`
- **Descrição**: Lista tentativas do teste
- **Acesso**: Privado (TEACHER, STAFF)
- **Query Params**:
  - `page`: number (default: 1)
  - `limit`: number (1-100, default: 20)
  - `status`: completed | in_progress (opcional)

#### GET `/api/tests/:id/leaderboard`
- **Descrição**: Ranking do teste
- **Acesso**: Privado (TEACHER, STAFF)
- **Query Params**:
  - `limit`: number (1-100, default: 10)

#### POST `/api/tests/:id/duplicate`
- **Descrição**: Duplica teste
- **Acesso**: Privado (TEACHER, STAFF)

#### POST `/api/tests/:id/export`
- **Descrição**: Exporta dados do teste
- **Acesso**: Privado (TEACHER, STAFF)

---

### ❓ Questões (`/api/questions`)

#### POST `/api/questions`
- **Descrição**: Cria uma nova questão
- **Acesso**: Privado (TEACHER, STAFF)
- **Body**:
```json
{
  "statement": "string (10-2000 chars)",
  "options": [
    {
      "text": "string (1-500 chars)",
      "isCorrect": "boolean"
    }
  ],
  "type": "MULTIPLE_CHOICE | TRUE_FALSE | ESSAY" (default: MULTIPLE_CHOICE),
  "subject": "string (2-100 chars)",
  "topic": "string (max 200 chars)" (opcional),
  "grade": "number (1-12)" (opcional),
  "difficulty": "EASY | MEDIUM | HARD",
  "tags": ["string"] (opcional),
  "hasMath": "boolean" (opcional, default: false)
}
```

#### GET `/api/questions`
- **Descrição**: Lista questões com filtros
- **Acesso**: Privado (autenticado)
- **Query Params**:
  - `schoolId`: UUID (opcional)
  - `subject`: string (opcional)
  - `topic`: string (opcional)
  - `difficulty`: EASY | MEDIUM | HARD (opcional)
  - `type`: MULTIPLE_CHOICE | TRUE_FALSE | ESSAY (opcional)
  - `creatorId`: UUID (opcional)
  - `tags`: string (separadas por vírgula, opcional)
  - `search`: string (opcional)
  - `page`: number (default: 1)
  - `limit`: number (1-100, default: 20)

#### GET `/api/questions/:id`
- **Descrição**: Busca questão por ID
- **Acesso**: Privado (autenticado)

#### PUT `/api/questions/:id`
- **Descrição**: Atualiza questão
- **Acesso**: Privado (TEACHER, STAFF)
- **Body**: Mesmos campos do POST (todos opcionais)

#### DELETE `/api/questions/:id`
- **Descrição**: Exclui questão
- **Acesso**: Privado (TEACHER, STAFF)

#### GET `/api/questions/meta/subjects`
- **Descrição**: Lista matérias disponíveis
- **Acesso**: Privado (autenticado)

#### GET `/api/questions/meta/subjects/:subject/topics`
- **Descrição**: Lista tópicos de uma matéria
- **Acesso**: Privado (autenticado)

#### GET `/api/questions/:id/stats`
- **Descrição**: Estatísticas da questão
- **Acesso**: Privado (TEACHER, STAFF)

#### POST `/api/questions/import`
- **Descrição**: Importa questões em lote
- **Acesso**: Privado (STAFF)
- **Body**:
```json
{
  "source": "file | url | api",
  "data": "any",
  "format": "json | csv | xlsx" (opcional, default: json),
  "mapping": "object" (opcional)
}
```

#### POST `/api/questions/bulk`
- **Descrição**: Operações em lote
- **Acesso**: Privado (STAFF)
- **Body**:
```json
{
  "questionIds": ["uuid1", "uuid2"],
  "operation": "delete | update | export",
  "data": "object" (opcional)
}
```

#### POST `/api/questions/:id/duplicate`
- **Descrição**: Duplica questão
- **Acesso**: Privado (TEACHER, STAFF)

#### GET `/api/questions/random/get`
- **Descrição**: Busca questões aleatórias
- **Acesso**: Privado (autenticado)
- **Query Params**:
  - `count`: number (1-50, default: 10)
  - `subject`: string (opcional)
  - `difficulty`: EASY | MEDIUM | HARD (opcional)
  - `grade`: number (opcional)

---

### 👨‍🎓 Estudantes (`/api/students`)

#### POST `/api/students/login`
- **Descrição**: Login de estudante com código de acesso
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "accessCode": "string (6-20 chars)",
  "studentName": "string (2-100 chars)",
  "grade": "1ANO | 2ANO | ... | 3ENSINO_MEDIO",
  "classroom": "string (1-10 chars)",
  "schoolId": "string (UUID)",
  "studentEmail": "string (email)" (opcional),
  "studentId": "string (max 50 chars)" (opcional)
}
```

#### GET `/api/students/attempt/:attemptId`
- **Descrição**: Busca tentativa do estudante
- **Acesso**: Público (com rate limiting)

#### POST `/api/students/attempt/:attemptId/answer`
- **Descrição**: Submete resposta individual
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "questionId": "string (UUID)",
  "answer": "number | string | boolean",
  "timeSpent": "number (0-3600 segundos)"
}
```

#### POST `/api/students/attempt/:attemptId/answers`
- **Descrição**: Submete múltiplas respostas
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "answers": [
    {
      "questionId": "string (UUID)",
      "selectedOption": "string",
      "timeSpent": "number (0-3600)"
    }
  ]
}
```

#### POST `/api/students/attempt/:attemptId/finish`
- **Descrição**: Finaliza tentativa
- **Acesso**: Público (com rate limiting)
- **Body**:
```json
{
  "finalAnswers": [
    {
      "questionId": "string (UUID)",
      "selectedOption": "string",
      "timeSpent": "number"
    }
  ] (opcional)
}
```

#### GET `/api/students/attempt/:attemptId/results`
- **Descrição**: Busca resultados da tentativa
- **Acesso**: Público (com rate limiting)

#### GET `/api/students/test/:testId/leaderboard`
- **Descrição**: Ranking do teste (visão do estudante)
- **Acesso**: Público (com rate limiting)
- **Query Params**:
  - `limit`: number (1-50, default: 10)

#### GET `/api/students/attempts`
- **Descrição**: Lista tentativas do estudante
- **Acesso**: Público (auth opcional, com rate limiting)
- **Query Params**:
  - `studentName`: string (opcional)
  - `schoolId`: UUID (opcional)
  - `page`: number (default: 1)
  - `limit`: number (1-50, default: 20)

#### POST `/api/students/attempt/:attemptId/pause`
- **Descrição**: Pausa tentativa
- **Acesso**: Público (com rate limiting)

#### POST `/api/students/attempt/:attemptId/resume`
- **Descrição**: Retoma tentativa
- **Acesso**: Público (com rate limiting)

#### GET `/api/students/attempt/:attemptId/time`
- **Descrição**: Busca tempo restante
- **Acesso**: Público (com rate limiting)

---

### 🔧 Sistema

#### GET `/api/health`
- **Descrição**: Health check do sistema
- **Acesso**: Público

#### GET `/api/metrics`
- **Descrição**: Métricas do sistema
- **Acesso**: Público

#### GET `/api/status`
- **Descrição**: Status detalhado do sistema
- **Acesso**: Público

#### GET `/api/ping`
- **Descrição**: Ping simples
- **Acesso**: Público

---

## Rate Limiting

### Configurações Atuais

- **Autenticação**: 5 requests/min
- **Login de Estudante**: 10 requests/min
- **Acesso a Testes**: 500 requests/min
- **Submissão de Respostas**: 100 requests/min
- **Geral**: 500 requests/min

### Códigos de Status HTTP

- **200**: Sucesso
- **201**: Criado com sucesso
- **400**: Erro de validação
- **401**: Não autenticado
- **403**: Não autorizado
- **404**: Não encontrado
- **409**: Conflito (ex: email já existe)
- **429**: Rate limit excedido
- **500**: Erro interno do servidor

### Estrutura de Resposta de Erro

```json
{
  "error": {
    "message": "Descrição do erro",
    "code": "CODIGO_ERRO",
    "details": {} // Detalhes adicionais quando aplicável
  }
}
```

### Autenticação

A API usa JWT (JSON Web Tokens) para autenticação:

1. **Access Token**: Válido por 15 minutos
2. **Refresh Token**: Válido por 7 dias
3. **Header**: `Authorization: Bearer <token>`

### Logs e Monitoramento

O sistema registra:
- Tentativas de login
- Criação de testes e questões
- Submissões de respostas
- Erros e exceções
- Métricas de performance

---

## Próximos Passos

1. **Executar Prisma Studio** para visualizar o banco
2. **Testar todas as rotas** com dados reais
3. **Verificar performance** com recursos limitados
4. **Deploy para produção**

---

*Documentação gerada em: 2025*