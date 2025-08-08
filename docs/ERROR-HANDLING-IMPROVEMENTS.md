# Melhorias no Sistema de Tratamento de Erros

## Visão Geral

Este documento descreve as melhorias implementadas no sistema de tratamento de erros do backend para fornecer mensagens mais específicas e úteis aos usuários.

## Principais Melhorias

### 1. Novas Classes de Erro Específicas

Foram criadas novas classes de erro para cenários comuns:

#### `DuplicateError`
- **Uso**: Quando um recurso já existe (ex: email duplicado, código de escola duplicado)
- **Código**: `DUPLICATE`
- **Status**: 409 (Conflict)
- **Exemplo**: `new DuplicateError('Escola', 'code')`
- **Mensagem**: "Escola com este código já existe"

#### `InvalidCredentialsError`
- **Uso**: Credenciais de login incorretas
- **Código**: `INVALID_CREDENTIALS`
- **Status**: 401 (Unauthorized)
- **Ação sugerida**: "Verifique suas credenciais e tente novamente"

#### `ExpiredTokenError`
- **Uso**: Tokens JWT ou refresh tokens expirados
- **Código**: `EXPIRED_TOKEN`
- **Status**: 401 (Unauthorized)
- **Ação sugerida**: "Faça login novamente"

#### `InvalidTokenError`
- **Uso**: Tokens JWT ou refresh tokens inválidos
- **Código**: `INVALID_TOKEN`
- **Status**: 401 (Unauthorized)
- **Ação sugerida**: "Faça login novamente"

#### `InsufficientPermissionsError`
- **Uso**: Usuário sem permissão para uma ação
- **Código**: `INSUFFICIENT_PERMISSIONS`
- **Status**: 403 (Forbidden)
- **Ação sugerida**: "Entre em contato com um administrador"

#### `ResourceInUseError`
- **Uso**: Tentativa de remover recurso que está sendo usado
- **Código**: `RESOURCE_IN_USE`
- **Status**: 409 (Conflict)
- **Ação sugerida**: "Remova as dependências primeiro"

#### `BusinessRuleError`
- **Uso**: Violação de regras de negócio
- **Código**: `BUSINESS_RULE_VIOLATION`
- **Status**: 422 (Unprocessable Entity)
- **Ação sugerida**: "Verifique as regras de negócio"

#### `ExternalServiceError`
- **Uso**: Falhas em serviços externos
- **Código**: `EXTERNAL_SERVICE_ERROR`
- **Status**: 503 (Service Unavailable)
- **Ação sugerida**: "Tente novamente em alguns instantes"

### 2. Melhorias no Handler de Erros Prisma

O tratamento de erros do Prisma foi aprimorado com:

- **Mensagens mais específicas** para cada código de erro
- **Mapeamento de campos** para nomes amigáveis (ex: `email` → "e-mail")
- **Sugestões de ação** para cada tipo de erro
- **Códigos de erro padronizados**

#### Códigos Prisma Tratados:
- **P2002**: Violação de constraint única → `DuplicateError`
- **P2025**: Registro não encontrado → `NotFoundError`
- **P2003**: Violação de foreign key → `ValidationError`
- **P2014**: Violação de relação → `ConflictError`
- **P1008**: Timeout de operação → `AppError`
- **P1001**: Erro de conexão → `AppError`
- **P2004**: Violação de constraint → `ValidationError`
- **P2011**: Violação de constraint null → `ValidationError`
- **P2012**: Valor obrigatório ausente → `ValidationError`

### 3. Melhorias no Handler de Erros Zod

O tratamento de erros de validação Zod foi aprimorado com:

- **Mensagens específicas** por tipo de erro de validação
- **Campos traduzidos** para português
- **Detalhes sobre valores esperados vs recebidos**
- **Mensagens de ação sugerida**

#### Tipos de Erro Zod Tratados:
- `invalid_type`: Tipo de dado incorreto
- `too_small`: Valor muito pequeno/curto
- `too_big`: Valor muito grande/longo
- `invalid_string`: Formato de string inválido
- `invalid_enum_value`: Valor de enum inválido

### 4. Melhorias na Resposta de Erro

A estrutura de resposta de erro foi aprimorada com:

```json
{
  "success": false,
  "error": "Mensagem principal do erro",
  "code": "CODIGO_DO_ERRO",
  "details": {
    "field": "campo_com_erro",
    "friendlyField": "Campo Amigável",
    "action": "Ação sugerida para o usuário"
  },
  "action": "Ação sugerida",
  "timestamp": "2025-01-XX...",
  "requestId": "uuid"
}
```

#### Em Desenvolvimento:
```json
{
  "debug": {
    "url": "/api/endpoint",
    "method": "POST",
    "userAgent": "...",
    "ip": "..."
  },
  "stack": "Stack trace completo"
}
```

### 5. Atualizações nos Serviços

#### AuthService
- `register()`: Usa `DuplicateError` para email duplicado
- `login()`: Usa `InvalidCredentialsError` para credenciais incorretas
- `refreshTokens()`: Usa `ExpiredTokenError` e `InvalidTokenError`

#### SchoolService
- `createSchool()`: Usa `DuplicateError` para código duplicado
- `updateSchool()`: Usa `DuplicateError` para código duplicado
- `deactivateSchool()`: Usa `BusinessRuleError` para escola já inativa
- `reactivateSchool()`: Usa `BusinessRuleError` para escola já ativa

## Benefícios

1. **Mensagens mais claras**: Usuários recebem mensagens específicas sobre o que deu errado
2. **Códigos padronizados**: Frontend pode tratar erros de forma consistente
3. **Ações sugeridas**: Usuários sabem como resolver o problema
4. **Melhor debugging**: Desenvolvedores têm mais informações em ambiente de desenvolvimento
5. **Experiência do usuário**: Interface mais amigável e informativa

## Compatibilidade

Todas as melhorias são **retrocompatíveis**. Códigos existentes continuam funcionando, mas agora retornam mensagens mais específicas e úteis.

## Próximos Passos

1. Atualizar outros serviços para usar as novas classes de erro
2. Implementar tratamento específico no frontend baseado nos códigos de erro
3. Adicionar testes unitários para os novos handlers de erro
4. Documentar padrões de uso para a equipe de desenvolvimento