# 🤝 Guia de Contribuição

Obrigado por considerar contribuir para o Sistema de Provas Online! Este documento fornece diretrizes para contribuir com o projeto.

## 📋 Índice

- [Código de Conduta](#código-de-conduta)
- [Como Contribuir](#como-contribuir)
- [Configuração do Ambiente](#configuração-do-ambiente)
- [Padrões de Código](#padrões-de-código)
- [Processo de Pull Request](#processo-de-pull-request)
- [Reportando Bugs](#reportando-bugs)
- [Sugerindo Melhorias](#sugerindo-melhorias)

## 📜 Código de Conduta

Este projeto segue um código de conduta. Ao participar, você concorda em manter um ambiente respeitoso e inclusivo para todos.

### Comportamentos Esperados

- Use linguagem acolhedora e inclusiva
- Respeite diferentes pontos de vista e experiências
- Aceite críticas construtivas com elegância
- Foque no que é melhor para a comunidade
- Mostre empatia com outros membros da comunidade

## 🚀 Como Contribuir

### Tipos de Contribuição

- 🐛 **Correção de bugs**
- ✨ **Novas funcionalidades**
- 📚 **Documentação**
- 🧪 **Testes**
- 🎨 **Melhorias de UI/UX**
- ⚡ **Otimizações de performance**

### Processo Geral

1. **Fork** o repositório
2. **Clone** seu fork localmente
3. **Crie** uma branch para sua contribuição
4. **Faça** suas alterações
5. **Teste** suas alterações
6. **Commit** com mensagens claras
7. **Push** para seu fork
8. **Abra** um Pull Request

## 🛠️ Configuração do Ambiente

### Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Git

### Configuração Local

```bash
# 1. Clone seu fork
git clone https://github.com/SEU-USUARIO/sistema-provas-backend.git
cd sistema-provas-backend

# 2. Adicione o repositório original como upstream
git remote add upstream https://github.com/ORIGINAL-OWNER/sistema-provas-backend.git

# 3. Instale as dependências
npm install

# 4. Configure as variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas configurações locais

# 5. Configure o banco de dados
npm run db:migrate
npm run db:seed

# 6. Execute os testes
npm test

# 7. Inicie o servidor de desenvolvimento
npm run dev
```

## 📝 Padrões de Código

### Estilo de Código

- **TypeScript**: Use tipagem estrita
- **ESLint**: Siga as regras configuradas
- **Prettier**: Formate o código automaticamente
- **Convenções**: Use camelCase para variáveis e funções

### Estrutura de Arquivos

```
src/
├── config/          # Configurações
├── middleware/      # Middlewares Express
├── services/        # Lógica de negócio
├── routes/          # Rotas da API
├── utils/           # Utilitários
├── types/           # Definições de tipos
└── __tests__/       # Testes
```

### Nomenclatura

- **Arquivos**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Funções**: camelCase (`getUserById`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase com prefixo I (`IUserData`)

### Comentários

```typescript
/**
 * Busca um usuário pelo ID
 * @param id - ID do usuário
 * @returns Promise com os dados do usuário
 * @throws {NotFoundError} Quando o usuário não é encontrado
 */
async function getUserById(id: string): Promise<User> {
  // Implementação...
}
```

## 🧪 Testes

### Executando Testes

```bash
# Todos os testes
npm test

# Testes em modo watch
npm run test:watch

# Cobertura de testes
npm run test:coverage

# Testes específicos
npm test -- --testNamePattern="UserService"
```

### Escrevendo Testes

- **Unit Tests**: Para funções individuais
- **Integration Tests**: Para fluxos completos
- **API Tests**: Para endpoints da API

```typescript
describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = 'user-123';
      const expectedUser = { id: userId, name: 'John Doe' };
      
      // Act
      const result = await userService.getUserById(userId);
      
      // Assert
      expect(result).toEqual(expectedUser);
    });
    
    it('should throw NotFoundError when user not found', async () => {
      // Arrange
      const userId = 'non-existent';
      
      // Act & Assert
      await expect(userService.getUserById(userId))
        .rejects.toThrow(NotFoundError);
    });
  });
});
```

## 📤 Processo de Pull Request

### Antes de Submeter

- [ ] Código segue os padrões estabelecidos
- [ ] Testes passam (`npm test`)
- [ ] Linting passa (`npm run lint`)
- [ ] Build funciona (`npm run build`)
- [ ] Documentação atualizada (se necessário)
- [ ] Changelog atualizado (se necessário)

### Template de PR

```markdown
## 📝 Descrição

Descreva brevemente as mudanças realizadas.

## 🔗 Issue Relacionada

Fixes #123

## 🧪 Como Testar

1. Passo 1
2. Passo 2
3. Resultado esperado

## 📸 Screenshots (se aplicável)

## ✅ Checklist

- [ ] Código segue os padrões do projeto
- [ ] Testes adicionados/atualizados
- [ ] Documentação atualizada
- [ ] Build passa sem erros
- [ ] Testado localmente
```

### Revisão de Código

- Pelo menos 1 aprovação é necessária
- Todos os checks automáticos devem passar
- Conflitos devem ser resolvidos
- Feedback deve ser endereçado

## 🐛 Reportando Bugs

### Antes de Reportar

1. Verifique se o bug já foi reportado
2. Teste na versão mais recente
3. Colete informações do ambiente

### Template de Bug Report

```markdown
## 🐛 Descrição do Bug

Descrição clara e concisa do bug.

## 🔄 Passos para Reproduzir

1. Vá para '...'
2. Clique em '...'
3. Role para baixo até '...'
4. Veja o erro

## ✅ Comportamento Esperado

O que deveria acontecer.

## 📸 Screenshots

Se aplicável, adicione screenshots.

## 🖥️ Ambiente

- OS: [e.g. Windows 11]
- Node.js: [e.g. 18.17.0]
- Browser: [e.g. Chrome 91]
- Versão: [e.g. 1.0.0]

## 📋 Informações Adicionais

Qualquer outra informação relevante.
```

## 💡 Sugerindo Melhorias

### Template de Feature Request

```markdown
## 🚀 Descrição da Funcionalidade

Descrição clara da funcionalidade desejada.

## 🎯 Problema que Resolve

Que problema esta funcionalidade resolve?

## 💭 Solução Proposta

Como você imagina que isso deveria funcionar?

## 🔄 Alternativas Consideradas

Outras soluções que você considerou?

## 📋 Informações Adicionais

Contexto adicional ou screenshots.
```

## 📚 Recursos Úteis

- [Documentação da API](./DOCUMENTACAO_API.md)
- [Guia de Setup](./README.md#instalação-e-configuração)
- [Arquitetura do Sistema](./docs/architecture.md)
- [Convenções de Commit](https://www.conventionalcommits.org/)

## 🆘 Precisa de Ajuda?

- 💬 **Discord**: [Link do servidor]
- 📧 **Email**: dev@sistemaprovas.com
- 📖 **Documentação**: [Link da documentação]
- 🐛 **Issues**: [GitHub Issues](https://github.com/OWNER/REPO/issues)

---

**Obrigado por contribuir! 🎉**