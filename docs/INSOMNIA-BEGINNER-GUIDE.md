# Guia Passo a Passo para Iniciantes - Testando API com Insomnia

## 📋 Pré-requisitos

- Computador com Windows, Mac ou Linux
- Conexão com a internet
- API em produção: `https://educandario-simulados-backend.onrender.com`

---

## 🚀 Passo 1: Instalação do Insomnia

### 1.1 Download
1. Acesse: https://insomnia.rest/download
2. Clique em **"Download for Windows"** (ou seu sistema operacional)
3. Aguarde o download terminar

### 1.2 Instalação
1. Execute o arquivo baixado
2. Siga as instruções de instalação
3. Abra o Insomnia após a instalação

### 1.3 Primeira Configuração
1. Na primeira abertura, você pode:
   - **Criar uma conta** (recomendado para sincronizar)
   - **Usar localmente** (clique em "Use the local Scratch Pad")
2. Para este tutorial, escolha a opção que preferir

---

## 🏗️ Passo 2: Criando seu Workspace

### 2.1 Criar Novo Workspace
1. No Insomnia, clique em **"Create"**
2. Selecione **"Request Collection"**
3. Digite o nome: **"Sistema de Provas API"**
4. Clique em **"Create"**

### 2.2 Configurar Environment (Variáveis)
1. No canto superior direito, clique em **"No Environment"**
2. Clique em **"Manage Environments"**
3. Clique no **"+"** para criar um novo environment
4. Digite o nome: **"Produção"**
5. Cole o seguinte código JSON:

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

6. Clique em **"Done"**
7. Selecione o environment **"Produção"** no dropdown

---

## 📁 Passo 3: Organizando as Requisições

### 3.1 Criar Pastas
1. Clique com botão direito no workspace
2. Selecione **"New Folder"**
3. Crie as seguintes pastas (uma por vez):
   - **"1. Autenticação"**
   - **"2. Questões"**
   - **"3. Testes"**
   - **"4. Tentativas"**
   - **"5. Validações"**

---

## 🔐 Passo 4: Testando Autenticação

### 4.1 Registrar Usuário Admin

1. **Criar a requisição:**
   - Clique com botão direito na pasta **"1. Autenticação"**
   - Selecione **"New HTTP Request"**
   - Nome: **"Registrar Admin"**

2. **Configurar a requisição:**
   - **Método:** POST (dropdown à esquerda)
   - **URL:** `{{ _.base_url }}/api/auth/register`
   - **Body:** Clique na aba **"Body"** → **"JSON"**
   - Cole este JSON:

```json
{
  "name": "Admin Escola",
  "email": "admin@minhaescola.com",
  "password": "senha123",
  "role": "ADMIN"
}
```

3. **Executar:**
   - Clique em **"Send"**
   - ✅ **Sucesso:** Status 201, resposta com `token`
   - ❌ **Erro:** Verifique URL e JSON

4. **Salvar o token:**
   - Copie o valor do `token` da resposta
   - Vá em **Environment** → **"Manage Environments"**
   - Cole o token no campo `auth_token`
   - Clique **"Done"**

### 4.2 Testar Login

1. **Criar nova requisição:**
   - Nome: **"Login Admin"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/auth/login`
   - **Body JSON:**

```json
{
  "email": "admin@minhaescola.com",
  "password": "senha123"
}
```

2. **Executar e verificar** se retorna o mesmo token

---

## 👨‍🏫 Passo 5: Criando Professores

### 5.1 Registrar Professor

1. **Nova requisição:**
   - Nome: **"Registrar Professor"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/auth/register`
   - **Body JSON:**

```json
{
  "name": "Professor João",
  "email": "professor@minhaescola.com",
  "password": "senha123",
  "role": "TEACHER"
}
```

2. **Executar** e anotar o ID do professor retornado

### 5.2 Listar Usuários (Verificação)

1. **Nova requisição:**
   - Nome: **"Listar Usuários"**
   - **Método:** GET
   - **URL:** `{{ _.base_url }}/api/auth/users`
   - **Headers:** Clique na aba **"Headers"**
     - **Name:** `Authorization`
     - **Value:** `Bearer {{ _.auth_token }}`

2. **Executar** para ver todos os usuários criados

---

## 👨‍🎓 Passo 6: Criando Estudantes

### 6.1 Registrar Estudante

1. **Nova requisição:**
   - Nome: **"Registrar Estudante"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/auth/register`
   - **Body JSON:**

```json
{
  "name": "Aluno Maria",
  "email": "aluno@minhaescola.com",
  "password": "senha123",
  "role": "STUDENT"
}
```

2. **Executar** e anotar o ID do estudante

---

## ❓ Passo 7: Criando Questões

### 7.1 Criar Questão

1. **Nova requisição na pasta "2. Questões":**
   - Nome: **"Criar Questão"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/questions`
   - **Headers:**
     - `Authorization`: `Bearer {{ _.auth_token }}`
   - **Body JSON:**

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

2. **Executar** e anotar o ID da questão retornado

### 7.2 Listar Questões

1. **Nova requisição:**
   - Nome: **"Listar Questões"**
   - **Método:** GET
   - **URL:** `{{ _.base_url }}/api/questions`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`

2. **Executar** para ver todas as questões

---

## 📝 Passo 8: Criando Testes

### 8.1 Criar Teste

1. **Nova requisição na pasta "3. Testes":**
   - Nome: **"Criar Teste"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/tests`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`
   - **Body JSON:**

```json
{
  "title": "Prova de Matemática Básica",
  "description": "Teste sobre operações básicas",
  "duration": 3600,
  "maxAttempts": 3,
  "passingScore": 70,
  "isActive": true,
  "questionIds": ["COLE_AQUI_O_ID_DA_QUESTAO"]
}
```

**⚠️ IMPORTANTE:** Substitua `"COLE_AQUI_O_ID_DA_QUESTAO"` pelo ID real da questão criada no passo anterior!

2. **Executar** e anotar o ID do teste

### 8.2 Listar Testes

1. **Nova requisição:**
   - Nome: **"Listar Testes"**
   - **Método:** GET
   - **URL:** `{{ _.base_url }}/api/tests`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`

---

## 🎯 Passo 9: Fazendo Tentativas (Como Estudante)

### 9.1 Login como Estudante

1. **Nova requisição na pasta "4. Tentativas":**
   - Nome: **"Login Estudante"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/auth/login`
   - **Body JSON:**

```json
{
  "email": "aluno@minhaescola.com",
  "password": "senha123"
}
```

2. **Executar** e **ATUALIZAR** o `auth_token` no Environment com o token do estudante

### 9.2 Iniciar Tentativa

1. **Nova requisição:**
   - Nome: **"Iniciar Tentativa"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/students/attempts`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`
   - **Body JSON:**

```json
{
  "testId": "COLE_AQUI_O_ID_DO_TESTE"
}
```

2. **Executar** e anotar o ID da tentativa

### 9.3 Responder Questão

1. **Nova requisição:**
   - Nome: **"Responder Questão"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/students/attempts/ID_DA_TENTATIVA/answers`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`
   - **Body JSON:**

```json
{
  "questionId": "ID_DA_QUESTAO",
  "selectedOptions": ["ID_DA_OPCAO_CORRETA"]
}
```

**⚠️ IMPORTANTE:** Você precisa pegar os IDs reais das opções da questão!

### 9.4 Finalizar Tentativa

1. **Nova requisição:**
   - Nome: **"Finalizar Tentativa"**
   - **Método:** POST
   - **URL:** `{{ _.base_url }}/api/students/attempts/ID_DA_TENTATIVA/submit`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`

### 9.5 Ver Resultado

1. **Nova requisição:**
   - Nome: **"Ver Resultado"**
   - **Método:** GET
   - **URL:** `{{ _.base_url }}/api/students/attempts/ID_DA_TENTATIVA/result`
   - **Headers:** `Authorization`: `Bearer {{ _.auth_token }}`

---

## 🧪 Passo 10: Testes de Validação

### 10.1 Teste sem Autenticação

1. **Nova requisição na pasta "5. Validações":**
   - Nome: **"Sem Auth - Deve Falhar"**
   - **Método:** GET
   - **URL:** `{{ _.base_url }}/api/questions`
   - **SEM Headers de Authorization**

2. **Executar** - deve retornar erro 401

### 10.2 Teste com Role Inadequado

1. **Nova requisição:**
   - Nome: **"Estudante Acessando Admin - Deve Falhar"**
   - **Método:** GET
   - **URL:** `{{ _.base_url }}/api/auth/users`
   - **Headers:** `Authorization` com token de STUDENT

2. **Executar** - deve retornar erro 403

---

## 💡 Dicas Importantes

### ✅ Checklist de Verificação
- [ ] Environment configurado com URL de produção
- [ ] Token de autenticação salvo no Environment
- [ ] IDs copiados corretamente entre requisições
- [ ] Headers de Authorization em requisições protegidas
- [ ] JSON válido nos bodies das requisições

### 🔧 Solucionando Problemas

**❌ Erro 401 (Unauthorized):**
- Verifique se o token está correto no Environment
- Confirme se o header Authorization está presente

**❌ Erro 403 (Forbidden):**
- Verifique se o usuário tem a role adequada
- Confirme se está usando o token correto

**❌ Erro 404 (Not Found):**
- Verifique se a URL está correta
- Confirme se os IDs existem

**❌ Erro 400 (Bad Request):**
- Verifique se o JSON está válido
- Confirme se todos os campos obrigatórios estão presentes

### 📱 Atalhos Úteis do Insomnia
- **Ctrl + Enter:** Enviar requisição
- **Ctrl + D:** Duplicar requisição
- **Ctrl + K:** Busca rápida
- **Ctrl + E:** Gerenciar Environments

---

## 🎉 Parabéns!

Você completou o teste completo da API! Agora você sabe:
- ✅ Configurar o Insomnia
- ✅ Criar e organizar requisições
- ✅ Usar variáveis de ambiente
- ✅ Testar autenticação
- ✅ Criar questões e testes
- ✅ Simular tentativas de estudantes
- ✅ Validar cenários de erro

**Próximos passos:**
- Experimente criar mais questões e testes
- Teste diferentes cenários de erro
- Explore outros endpoints da API
- Pratique com diferentes tipos de questões

---

## 📞 Precisa de Ajuda?

Se encontrar algum problema:
1. Verifique se a API está online: `https://educandario-simulados-backend.onrender.com/health`
2. Confirme se todos os IDs estão corretos
3. Verifique se o JSON está bem formatado
4. Consulte a documentação completa no arquivo `INSOMNIA-TESTING-GUIDE.md`