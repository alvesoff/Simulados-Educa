# Integração com API Externa de Questões

Este documento descreve como usar a integração com a API externa de questões no sistema.

## Visão Geral

O sistema agora suporta três tipos de endpoints para questões:

1. **Questões Locais** (`/api/questions`) - Questões armazenadas no banco de dados local
2. **Questões Externas** (`/api/external-questions`) - Questões da API externa
3. **Questões Combinadas** (`/api/combined-questions`) - Integração de ambas as fontes

## API Externa

### URL Base
```
https://api-questao-1.onrender.com/api/v1/questoes
```

### Formato das Questões Externas

```json
{
  "id": "6830a6b1671c248de2ab2a1f",
  "statement": "<p>Qual é a capital do Brasil?</p>",
  "alternatives": [
    "Rio de Janeiro",
    "São Paulo", 
    "Brasília",
    "Belo Horizonte"
  ],
  "correctAnswer": 2,
  "disciplina": "Geografia",
  "anoEscolar": 5,
  "nivelDificuldade": "Fácil",
  "tags": ["geografia", "capitais"],
  "has_math": false
}
```

## Endpoints Disponíveis

### 1. Questões Externas (`/api/external-questions`)

#### Listar Questões Externas
```http
GET /api/external-questions?skip=0&limit=10&disciplina=Matemática
```

**Parâmetros:**
- `skip` (opcional): Número de registros para pular
- `limit` (opcional): Número máximo de questões (máx: 50)
- `disciplina` (opcional): Filtrar por disciplina
- `anoEscolar` (opcional): Filtrar por ano escolar (1-12)
- `nivelDificuldade` (opcional): "Fácil", "Médio", "Difícil"
- `tags` (opcional): Filtrar por tags

#### Buscar Questão Externa por ID
```http
GET /api/external-questions/6830a6b1671c248de2ab2a1f
```

#### Criar Questão Externa
```http
POST /api/external-questions
Content-Type: application/json

{
  "statement": "<p>Qual é o resultado de 2 + 2?</p>",
  "alternatives": ["3", "4", "5", "6"],
  "correctAnswer": 1,
  "disciplina": "Matemática",
  "anoEscolar": 1,
  "nivelDificuldade": "Fácil",
  "tags": ["matemática", "adição"],
  "has_math": false
}
```

#### Atualizar Questão Externa
```http
PUT /api/external-questions/6830a6b1671c248de2ab2a1f
Content-Type: application/json

{
  "statement": "<p>Questão atualizada</p>",
  "nivelDificuldade": "Médio"
}
```

#### Deletar Questão Externa
```http
DELETE /api/external-questions/6830a6b1671c248de2ab2a1f
```

#### Metadados
```http
GET /api/external-questions/meta/stats      # Estatísticas
GET /api/external-questions/meta/subjects   # Disciplinas disponíveis
GET /api/external-questions/meta/difficulties # Níveis de dificuldade
GET /api/external-questions/meta/grades     # Anos escolares
```

### 2. Questões Combinadas (`/api/combined-questions`)

Esta é a **API recomendada para o frontend** pois combina questões locais e externas em um formato unificado.

#### Listar Questões Combinadas
```http
GET /api/combined-questions?source=both&subject=Matemática&page=1&limit=20
```

**Parâmetros:**
- `source` (opcional): "local", "external", "both" (padrão: "both")
- `subject` (opcional): Filtrar por disciplina
- `grade` (opcional): Filtrar por ano escolar (1-12)
- `difficulty` (opcional): "EASY", "MEDIUM", "HARD"
- `tags` (opcional): Tags separadas por vírgula
- `search` (opcional): Busca textual
- `page` (opcional): Página (padrão: 1)
- `limit` (opcional): Itens por página (máx: 100, padrão: 20)

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "local_123",
      "statement": "Questão local...",
      "alternatives": ["A", "B", "C", "D"],
      "correctAnswer": 1,
      "subject": "Matemática",
      "grade": 5,
      "difficulty": "EASY",
      "tags": ["matemática"],
      "hasMath": false,
      "source": "local",
      "createdAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "ext_6830a6b1671c248de2ab2a1f",
      "statement": "Questão externa...",
      "alternatives": ["A", "B", "C", "D"],
      "correctAnswer": 2,
      "subject": "Geografia",
      "grade": 5,
      "difficulty": "EASY",
      "tags": ["geografia"],
      "hasMath": false,
      "source": "external"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasNext": true,
    "hasPrev": false
  },
  "sources": {
    "local": 8,
    "external": 12
  }
}
```

#### Buscar Questão Combinada por ID
```http
GET /api/combined-questions/ext_6830a6b1671c248de2ab2a1f
```

#### Questões para Teste
```http
POST /api/combined-questions/for-test
Content-Type: application/json

{
  "count": 10,
  "subject": "Matemática",
  "difficulty": "EASY",
  "source": "both",
  "excludeIds": ["local_123", "ext_456"]
}
```

#### Busca Avançada
```http
GET /api/combined-questions/search?q=capital&source=both&limit=10
```

#### Metadados Combinados
```http
GET /api/combined-questions/meta/stats        # Estatísticas combinadas
GET /api/combined-questions/meta/subjects     # Todas as disciplinas
GET /api/combined-questions/meta/difficulties # Níveis de dificuldade
GET /api/combined-questions/meta/grades       # Anos escolares
```

## Formato Unificado para Frontend

Todas as questões são retornadas no formato unificado:

```typescript
interface CombinedQuestion {
  id: string;                    // "local_123" ou "ext_456"
  statement: string;             // Enunciado em HTML
  alternatives: string[];        // Array de alternativas
  correctAnswer: number;         // Índice da resposta correta (0-based)
  subject: string;              // Disciplina
  grade?: number;               // Ano escolar (1-12)
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];               // Array de tags
  hasMath: boolean;             // Contém fórmulas matemáticas
  source: 'local' | 'external'; // Origem da questão
  createdAt?: Date;             // Apenas questões locais
  updatedAt?: Date;             // Apenas questões locais
}
```

## Mapeamento de Dificuldades

| API Externa | Sistema Interno |
|-------------|-----------------|
| "Fácil"     | "EASY"         |
| "Médio"     | "MEDIUM"       |
| "Difícil"   | "HARD"         |

## Cache e Performance

- **Cache Redis**: Questões externas são cacheadas por 5 minutos
- **Cache de Estatísticas**: Estatísticas são cacheadas por 30 minutos
- **Rate Limiting**: Aplicado em todas as rotas
- **Timeout**: Requisições para API externa têm timeout de 10 segundos

## Tratamento de Erros

O sistema trata graciosamente falhas na API externa:

- Se a API externa falhar, apenas questões locais são retornadas
- Logs detalhados são gerados para monitoramento
- Mensagens de erro amigáveis para o usuário

## Recomendações para Frontend

### 1. Use a API Combinada
```javascript
// ✅ Recomendado - API combinada
const response = await fetch('/api/combined-questions?source=both&limit=20');

// ❌ Evite - Múltiplas chamadas
const local = await fetch('/api/questions');
const external = await fetch('/api/external-questions');
```

### 2. Implemente Loading States
```javascript
const [loading, setLoading] = useState(true);
const [questions, setQuestions] = useState([]);

useEffect(() => {
  fetchQuestions().finally(() => setLoading(false));
}, []);
```

### 3. Trate Fontes Diferentes
```javascript
const renderQuestion = (question) => (
  <div className={`question ${question.source}`}>
    <span className="source-badge">{question.source}</span>
    {question.statement}
  </div>
);
```

### 4. Use Filtros Inteligentes
```javascript
// Busca em ambas as fontes por padrão
const searchQuestions = (filters) => {
  return fetch('/api/combined-questions', {
    method: 'GET',
    params: { source: 'both', ...filters }
  });
};
```

## Monitoramento

Logs são gerados para:
- Requisições para API externa
- Tempo de resposta
- Erros de conexão
- Cache hits/misses
- Estatísticas de uso

## Segurança

- Autenticação obrigatória em todas as rotas
- Rate limiting aplicado
- Validação de entrada com Zod
- Sanitização de dados da API externa