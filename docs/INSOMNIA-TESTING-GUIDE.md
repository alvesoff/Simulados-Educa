# Guia de Testes com Insomnia - API Sistema de Provas

## Configuração Inicial

### 1. Configurar Ambiente no Insomnia

1. Abra o Insomnia
2. Crie um novo Workspace: "Sistema de Provas API"
3. Crie um Environment com as seguintes variáveis:

```json
{
  "base_url": "https://educandario-simulados-backend.onrender.com",
  "auth_token": "",
  "school_id": "",
  "teacher_id": "",
  "student_id": "",
  "test_id": "",
  "question_id": "",
  "attempt_id": ""
}
```

### 2. Headers Globais

Configure headers globais no Environment:
- `Content-Type`: `application/json`
- `Authorization`: `Bearer {{ _.auth_token }}` (para endpoints autenticados)

---

## Fluxo de Testes Completo

### Etapa 1: Autenticação e Criação de Escola

#### 1.1 Registrar Escola (Admin)

**POST** `{{ _.base_url }}/api/auth/register`

```json
{
  "name": "Escola Exemplo",
  "email": "admin@escola.com",
  "password": "senha123",
  "role": "ADMIN"
}
```

**Resposta esperada:**
```json
{
  "message": "Usuário registrado com sucesso",
  "user": {
    "id": "uuid-do-admin",
    "name": "Escola Exemplo",
    "email": "admin@escola.com",
    "role": "ADMIN"
  },
  "token": "jwt-token-aqui"
}
```

**Ação:** Copie o `token` e cole na variável `auth_token` do Environment.

#### 1.2 Login (Alternativo)

**POST** `{{ _.base_url }}/api/auth/login`

```json
{
  "email": "admin@escola.com",
  "password": "senha123"
}
```

### Etapa 2: Criar Professores

#### 2.1 Registrar Professor

**POST** `{{ _.base_url }}/api/auth/register`

```json
{
  "name": "Professor João",
  "email": "professor@escola.com",
  "password": "senha123",
  "role": "TEACHER"
}
```

**Ação:** Anote o ID do professor retornado para usar na variável `teacher_id`.

#### 2.2 Listar Usuários (Admin)

**GET** `{{ _.base_url }}/api/auth/users`

**Headers:** `Authorization: Bearer {{ _.auth_token }}`

### Etapa 3: Criar Estudantes

#### 3.1 Registrar Estudante

**POST** `{{ _.base_url }}/api/auth/register`

```json
{
  "name": "Aluno Maria",
  "email": "aluno@escola.com",
  "password": "senha123",
  "role": "STUDENT"
}
```

**Ação:** Anote o ID do estudante para usar na variável `student_id`.

#### 3.2 Obter Perfil do Estudante

**GET** `{{ _.base_url }}/api/students/profile`

**Headers:** `Authorization: Bearer {{ _.auth_token }}`

### Etapa 4: Gerenciar Questões

#### 4.1 Criar Questão (Professor/Admin)

**POST** `{{ _.base_url }}/api/questions`

```json
{
  "title": "Questão de Matemática",
  "content": "Quanto é 2 + 2?",
  "type": "MULTIPLE_CHOICE",
  "options": [
    {
      "text": "3",
      "isCorrect": false
    },
    {
      "text": "4",
      "isCorrect": true
    },
    {
      "text": "5",
      "isCorrect": false
    },
    {
      "text": "6",
      "isCorrect": false
    }
  ],
  "difficulty": "EASY",
  "subject": "Matemática",
  "tags": ["aritmética", "básico"]
}
```

**Ação:** Anote o ID da questão retornado para usar na variável `question_id`.

#### 4.2 Listar Questões

**GET** `{{ _.base_url }}/api/questions`

**Query Parameters opcionais:**
- `page=1`
- `limit=10`
- `difficulty=EASY`
- `subject=Matemática`
- `type=MULTIPLE_CHOICE`

#### 4.3 Obter Questão por ID

**GET** `{{ _.base_url }}/api/questions/{{ _.question_id }}`

#### 4.4 Atualizar Questão

**PUT** `{{ _.base_url }}/api/questions/{{ _.question_id }}`

```json
{
  "title": "Questão de Matemática Atualizada",
  "content": "Quanto é 3 + 3?",
  "options": [
    {
      "text": "5",
      "isCorrect": false
    },
    {
      "text": "6",
      "isCorrect": true
    },
    {
      "text": "7",
      "isCorrect": false
    },
    {
      "text": "8",
      "isCorrect": false
    }
  ]
}
```

#### 4.5 Obter Questões Aleatórias

**GET** `{{ _.base_url }}/api/questions/random?count=5&difficulty=EASY`

#### 4.6 Estatísticas da Questão

**GET** `{{ _.base_url }}/api/questions/{{ _.question_id }}/stats`

#### 4.7 Deletar Questão

**DELETE** `{{ _.base_url }}/api/questions/{{ _.question_id }}`

### Etapa 5: Gerenciar Testes

#### 5.1 Criar Teste (Professor/Admin)

**POST** `{{ _.base_url }}/api/tests`

```json
{
  "title": "Prova de Matemática Básica",
  "description": "Teste sobre operações básicas",
  "duration": 3600,
  "maxAttempts": 3,
  "passingScore": 70,
  "isActive": true,
  "questionIds": ["{{ _.question_id }}"]
}
```

**Ação:** Anote o ID do teste retornado para usar na variável `test_id`.

#### 5.2 Listar Testes

**GET** `{{ _.base_url }}/api/tests`

**Query Parameters opcionais:**
- `page=1`
- `limit=10`
- `isActive=true`
- `createdBy=teacher_id`

#### 5.3 Obter Teste por ID

**GET** `{{ _.base_url }}/api/tests/{{ _.test_id }}`

#### 5.4 Atualizar Teste

**PUT** `{{ _.base_url }}/api/tests/{{ _.test_id }}`

```json
{
  "title": "Prova de Matemática Básica - Atualizada",
  "duration": 7200,
  "maxAttempts": 5
}
```

#### 5.5 Adicionar Questões ao Teste

**POST** `{{ _.base_url }}/api/tests/{{ _.test_id }}/questions`

```json
{
  "questionIds": ["outro-question-id"]
}
```

#### 5.6 Remover Questões do Teste

**DELETE** `{{ _.base_url }}/api/tests/{{ _.test_id }}/questions`

```json
{
  "questionIds": ["question-id-para-remover"]
}
```

#### 5.7 Obter Estatísticas do Teste

**GET** `{{ _.base_url }}/api/tests/{{ _.test_id }}/stats`

#### 5.8 Deletar Teste

**DELETE** `{{ _.base_url }}/api/tests/{{ _.test_id }}`

### Etapa 6: Realizar Tentativas (Estudante)

#### 6.1 Fazer Login como Estudante

**POST** `{{ _.base_url }}/api/auth/login`

```json
{
  "email": "aluno@escola.com",
  "password": "senha123"
}
```

**Ação:** Atualize o `auth_token` com o token do estudante.

#### 6.2 Iniciar Tentativa

**POST** `{{ _.base_url }}/api/students/attempts`

```json
{
  "testId": "{{ _.test_id }}"
}
```

**Ação:** Anote o ID da tentativa retornado para usar na variável `attempt_id`.

#### 6.3 Responder Questão

**POST** `{{ _.base_url }}/api/students/attempts/{{ _.attempt_id }}/answers`

```json
{
  "questionId": "{{ _.question_id }}",
  "selectedOptions": ["option-id-da-resposta-correta"]
}
```

#### 6.4 Finalizar Tentativa

**POST** `{{ _.base_url }}/api/students/attempts/{{ _.attempt_id }}/submit`

#### 6.5 Obter Resultado da Tentativa

**GET** `{{ _.base_url }}/api/students/attempts/{{ _.attempt_id }}/result`

#### 6.6 Listar Tentativas do Estudante

**GET** `{{ _.base_url }}/api/students/attempts`

**Query Parameters opcionais:**
- `testId={{ _.test_id }}`
- `status=COMPLETED`

#### 6.7 Obter Histórico de Tentativas

**GET** `{{ _.base_url }}/api/students/history`

---

## Cenários de Teste Avançados

### Teste de Validações

#### 1. Tentar criar questão sem autenticação

**POST** `{{ _.base_url }}/api/questions`

**Sem header Authorization**

**Resposta esperada:** `401 Unauthorized`

#### 2. Tentar acessar recurso com role inadequado

**GET** `{{ _.base_url }}/api/auth/users`

**Com token de STUDENT**

**Resposta esperada:** `403 Forbidden`

#### 3. Criar questão com dados inválidos

**POST** `{{ _.base_url }}/api/questions`

```json
{
  "title": "",
  "content": "Questão sem título",
  "type": "INVALID_TYPE"
}
```

**Resposta esperada:** `400 Bad Request` com detalhes dos erros de validação

### Teste de Rate Limiting

#### Fazer múltiplas requisições rapidamente

Execute a mesma requisição várias vezes em sequência rápida para testar o rate limiting:

**GET** `{{ _.base_url }}/api/questions`

**Resposta esperada após limite:** `429 Too Many Requests`

### Teste de Paginação

#### Testar limites de paginação

**GET** `{{ _.base_url }}/api/questions?page=1&limit=1000`

**Resposta esperada:** Limite máximo aplicado (100 itens)

---

## Monitoramento e Métricas

### Verificar Status da API

**GET** `{{ _.base_url }}/health`

### Obter Métricas (se habilitado)

**GET** `{{ _.base_url }}/metrics`

---

## Dicas de Uso do Insomnia

### 1. Organizando Requisições

Crie pastas para organizar:
- 📁 **Autenticação**
- 📁 **Questões**
- 📁 **Testes**
- 📁 **Tentativas**
- 📁 **Validações**

### 2. Usando Variáveis

- Use `{{ _.variable_name }}` para referenciar variáveis do Environment
- Atualize variáveis automaticamente usando Scripts (aba Tests)

### 3. Scripts Úteis

#### Extrair token da resposta:

```javascript
const response = insomnia.response.json();
if (response.token) {
  insomnia.environment.set('auth_token', response.token);
}
```

#### Extrair ID de recursos:

```javascript
const response = insomnia.response.json();
if (response.id) {
  insomnia.environment.set('question_id', response.id);
}
```

### 4. Testes Automatizados

#### Verificar status code:

```javascript
expect(insomnia.response.status()).to.equal(200);
```

#### Verificar estrutura da resposta:

```javascript
const response = insomnia.response.json();
expect(response).to.have.property('id');
expect(response).to.have.property('title');
```

---

## Troubleshooting

### Problemas Comuns

1. **401 Unauthorized**: Verifique se o token está correto e não expirou
2. **403 Forbidden**: Verifique se o usuário tem a role adequada
3. **404 Not Found**: Verifique se o ID do recurso existe
4. **429 Too Many Requests**: Aguarde antes de fazer nova requisição
5. **500 Internal Server Error**: Verifique os logs do servidor

### Verificar Logs

Para debugar problemas, verifique:
- Console do servidor Node.js
- Logs de erro no terminal
- Response body das requisições com erro

---

## Conclusão

Este guia cobre todos os endpoints disponíveis na API. Siga a sequência proposta para ter um ambiente de teste completo e funcional. Lembre-se de sempre verificar as respostas e atualizar as variáveis do Environment conforme necessário.

Para testes mais avançados, considere criar múltiplos usuários, questões e testes para simular um ambiente real de uso.