# 📚 Sincronização de Questões - API Externa

## 🎯 Visão Geral

A sincronização de questões permite importar questões de uma API externa de forma controlada e segura, evitando sobrecarga do sistema e processamento excessivo de dados.

## ⚙️ Como Funciona

### 1. Configuração Flexível
- **Páginas por sincronização**: 5 páginas (padrão) até 200 páginas (completa)
- **Questões por página**: 10-20 questões (ajusta automaticamente)
- **Total por sincronização**: 50 questões (padrão) até 4000 questões (completa)
- **Pausa entre requisições**: 50-100ms (otimizada para volume)

### 2. Processo de Sincronização

```
API Externa (1000 questões) → Paginação → Processamento em Lotes → Banco Local
     ↓                           ↓              ↓                    ↓
Página 1: 10 questões      Converte formato    Verifica duplicatas   Salva no DB
Página 2: 10 questões      Limpa HTML         Valida dados          Cache atualizado
Página 3: 10 questões      Mapeia campos      Log de erros          Estatísticas
...até 5 páginas máximo
```

### 3. Controles de Segurança

#### Limitação de Volume
- ✅ Máximo 5 páginas por sincronização
- ✅ Máximo 10 questões por página
- ✅ Total controlado: 50 questões por vez

#### Verificação de Duplicatas
- ✅ Verifica por `externalId` primeiro
- ✅ Verifica por `statement` como fallback
- ✅ Evita questões duplicadas no banco

#### Tratamento de Erros
- ✅ Timeout de 30 segundos por requisição
- ✅ Log detalhado de erros
- ✅ Conversão segura de dados
- ✅ Validação de campos obrigatórios

## 🚀 Como Usar

### 1. Sincronização Parcial (Recomendada para testes)

```http
POST /api/questions/sync
Authorization: Bearer {token}
Content-Type: application/json

{
  "maxPages": 5  // Opcional, padrão: 5, máximo: 200
}
```

### 2. Sincronização Completa (Todas as 1000 questões)

```http
POST /api/questions/sync/full
Authorization: Bearer {token}
```

### 3. Sincronização com Flag Full

```http
POST /api/questions/sync
Authorization: Bearer {token}
Content-Type: application/json

{
  "fullSync": true  // Importa todas as questões disponíveis
}
```

### Resposta Esperada

```json
{
  "success": true,
  "data": {
    "imported": 25,
    "skipped": 5,
    "errors": []
  },
  "message": "25 questões sincronizadas com sucesso"
}
```

## 📊 Monitoramento

### Logs Gerados
- 📝 Início da sincronização
- 📄 Progresso por página
- ⚠️ Erros de conversão
- ✅ Resultado final

### Métricas Importantes
- **Questões importadas**: Novas questões adicionadas
- **Questões ignoradas**: Duplicatas encontradas
- **Erros**: Questões com problemas de formato
- **Tempo de execução**: Performance da sincronização

## 🔧 Configuração Técnica

### Variáveis de Ambiente
```env
QUESTIONS_API_URL=https://api-questao-1.onrender.com/api/v1/questoes
```

### Mapeamento de Dados

#### Dificuldade
```
API Externa → Sistema Interno
"Fácil"     → "EASY"
"Médio"     → "MEDIUM"
"Difícil"   → "HARD"
```

#### Disciplinas
```
API Externa → Sistema Interno
"Português" → "Português"
"Matemática" → "Matemática"
"História"  → "História"
...
```

## 🛡️ Segurança e Performance

### Proteções Implementadas
1. **Rate Limiting**: Evita sobrecarga da API externa
2. **Timeout**: Evita requisições infinitas
3. **Validação**: Garante qualidade dos dados
4. **Paginação**: Controla volume de processamento
5. **Cache**: Otimiza consultas subsequentes

### Recomendações de Uso
- 🔄 Execute sincronizações em horários de baixo tráfego
- 📊 Monitore os logs para identificar problemas
- 🎯 Use `maxPages` baixo para testes iniciais
- 🔍 Verifique duplicatas antes de sincronizações grandes

## 🚨 Limitações Atuais

- **Volume**: Máximo 50 questões por sincronização
- **Frequência**: Sem limite automático (controle manual)
- **Rollback**: Não há reversão automática de importações
- **Validação**: Validação básica de campos obrigatórios

## 🎯 Estratégia de Filtragem no Frontend

### ✅ Vantagens de Importar Todas as Questões

1. **Performance**: Filtragem local é mais rápida que consultas ao banco
2. **Offline**: Funciona mesmo com conexão instável
3. **UX**: Filtros instantâneos sem loading
4. **Flexibilidade**: Múltiplos filtros combinados em tempo real

### 📊 Estrutura Recomendada para Frontend

```javascript
// Após sincronização completa, o frontend terá acesso a:
{
  "questions": [
    {
      "id": "uuid",
      "statement": "Enunciado da questão...",
      "alternatives": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "subject": "Matemática",
      "topic": "6º Ano",
      "difficulty": "EASY",
      "tags": ["geometria", "área"]
    }
    // ... 1000 questões
  ]
}
```

### 🔍 Filtros Sugeridos para Frontend

- **Por Disciplina**: Matemática, Português, História, etc.
- **Por Ano Escolar**: 6º, 7º, 8º, 9º ano
- **Por Dificuldade**: Fácil, Médio, Difícil
- **Por Tags**: Busca por palavras-chave
- **Busca Textual**: No enunciado das questões

## 📈 Próximos Passos

1. **✅ Sincronização Completa**: Implementada - importa todas as 1000 questões
2. **Sincronização Incremental**: Apenas questões novas/modificadas
3. **Agendamento**: Sincronização automática em horários específicos
4. **Validação Avançada**: Verificação de qualidade de conteúdo
5. **Dashboard**: Interface visual para monitoramento

---

**✅ Implementação Atual**: Suporta importação de todas as 1000 questões com filtragem eficiente no frontend!