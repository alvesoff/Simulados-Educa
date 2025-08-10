API= https://api-questao-1.onrender.com

Endpoints da API
POST /api/v1/questoes - Criar nova questão
GET /api/v1/questoes - Listar questões (com suporte a paginação)
GET /api/v1/questoes/:id - Obter questão específica
PUT /api/v1/questoes/:id - Atualizar questão
DELETE /api/v1/questoes/:id - Excluir questão

URL Base da API
https://api-questao-1.onrender.com/api/v1/questoes
Endpoints Disponíveis
Listar Questões
Método: GET
URL: https://api-questao-1.onrender.com/api/v1/questoes
Parâmetros de Consulta:

skip (opcional): Número de registros para pular (padrão: 0)
limit (opcional): Número máximo de questões a retornar (padrão: 10)
disciplina (opcional): Filtrar por disciplina
anoEscolar (opcional): Filtrar por ano escolar
nivelDificuldade (opcional): Filtrar por nível de dificuldade
tags (opcional): Filtrar por tags
Exemplo de Requisição:

GET https://api-questao-1.onrender.com/api/v1/questoes?limit=5&disciplina=Matemática
Exemplo de Resposta:

[
  {
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
    "has_math": false,
    "id": "6830a6b1671c248de2ab2a1f"
  },
  // ... mais questões
]
Obter Questão Específica
Método: GET
URL: https://api-questao-1.onrender.com/api/v1/questoes/{id}

Exemplo de Requisição:

GET https://api-questao-1.onrender.com/api/v1/questoes/6830a6b1671c248de2ab2a1f
Exemplo de Resposta:

{
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
  "has_math": false,
  "id": "6830a6b1671c248de2ab2a1f"
}
Criar Nova Questão
Método: POST
URL: https://api-questao-1.onrender.com/api/v1/questoes
Headers:

Content-Type: application/json
Accept: application/json
Corpo da Requisição:

{
  "statement": "<p>Qual é o resultado de 2 + 2?</p>",
  "alternatives": [
    "3",
    "4",
    "5",
    "6"
  ],
  "correctAnswer": 1,
  "disciplina": "Matemática",
  "anoEscolar": 1,
  "nivelDificuldade": "Fácil",
  "tags": ["matemática", "adição", "operações básicas"],
  "has_math": false
}
Exemplo de Resposta:

{
  "statement": "<p>Qual é o resultado de 2 + 2?</p>",
  "alternatives": [
    "3",
    "4",
    "5",
    "6"
  ],
  "correctAnswer": 1,
  "disciplina": "Matemática",
  "anoEscolar": 1,
  "nivelDificuldade": "Fácil",
  "tags": ["matemática", "adição", "operações básicas"],
  "has_math": false,
  "id": "7a40b6c1782d359ef3bc3b2g"
}
Atualizar Questão
Método: PUT
URL: https://api-questao-1.onrender.com/api/v1/questoes/{id}
Headers:

Content-Type: application/json
Accept: application/json
Corpo da Requisição: Mesmo formato do POST

Excluir Questão
Método: DELETE
URL: https://api-questao-1.onrender.com/api/v1/questoes/{id}

Modelo de Dados
Questão
Campo	Tipo	Descrição
statement	String	Enunciado da questão em formato HTML
alternatives	Array	Lista de alternativas (textos em HTML)
correctAnswer	Number	Índice da alternativa correta (0-based)
disciplina	String	Disciplina da questão
anoEscolar	Number	Ano escolar (1-12)
nivelDificuldade	String	Nível de dificuldade (Fácil, Médio, Difícil)
tags	Array	Lista de tags para categorização
has_math	Boolean	Indica se contém fórmulas matemáticas
id	String	ID único da questão

Recursos Adicionais
Suporte para Fórmulas Matemáticas
A API suporta fórmulas matemáticas utilizando a sintaxe LaTeX. Para incluir fórmulas:

No statement ou alternatives, inclua a fórmula entre $ (inline) ou $$ (block)
Defina has_math como true
Exemplo:

"statement": "<p>Resolva a equação: $x^2 + 5x + 6 = 0$</p>",
"has_math": true
Suporte Avançado para Imagens com Configuração e Edição de Tamanho
O sistema oferece recursos avançados para gerenciamento de imagens no enunciado e alternativas, permitindo controle total sobre o tamanho e posicionamento das imagens.

Recursos para Inserção de Novas Imagens
Ao clicar no botão de imagem no editor, você poderá:

Selecionar uma imagem do seu computador
Visualizar um preview em tempo real da imagem
Definir a largura e altura exatas (em pixels)
Manter a proporção original automaticamente com a opção de checkbox
Adicionar texto alternativo para acessibilidade
Ver as dimensões originais da imagem e escolher o tamanho adequado
Recursos para Edição de Imagens Existentes
Após inserir uma imagem, você ainda pode:

Editar o tamanho: Clique na imagem para exibir o menu de edição e selecione "Editar tamanho"
Remover a imagem: Clique na imagem e selecione "Remover" para excluí-la
Ajustar dimensões: Altere a largura e altura mesmo depois de inserida
Modificar o texto alternativo: Atualize a descrição da imagem a qualquer momento
Este sistema avançado permite um controle preciso sobre o tamanho das imagens, garantindo que elas se ajustem perfeitamente ao layout da questão e não fiquem desproporcionais.

Exemplo de Imagem Inserida no HTML
<p>Qual animal está na imagem abaixo?</p>
<img src='data:image/png;base64,iVBORw0KGg...' alt='Imagem de um animal' width="400" height="300" style="width: 400px; height: 300px; max-width: 100%;">
Como Usar a Edição de Imagens
Inserção: Clique no botão de imagem na barra de ferramentas
Configuração inicial: Defina o tamanho e texto alternativo no modal que aparecer
Edição posterior: Clique em qualquer imagem já inserida para exibir as opções de edição
Ajuste de tamanho: No modal de edição, modifique as dimensões conforme necessário
Benefícios do Sistema Avançado de Imagens
Otimização de Espaço: Controle exato de quanto espaço a imagem ocupa na questão
Consistência Visual: Mantém um padrão visual entre diferentes questões
Melhor Desempenho: Redimensiona a imagem no cliente, reduzindo o tamanho do arquivo enviado para a API
Acessibilidade: Permite adicionar texto alternativo para leitores de tela
Flexibilidade: Possibilidade de editar imagens a qualquer momento sem precisar removê-las e inseri-las novamente
Interface Intuitiva: Controles visuais que facilitam o gerenciamento de imagens
Implementação de Paginação
A API suporta paginação para lidar com grandes conjuntos de dados, o que é essencial para otimizar o desempenho e a experiência do usuário. Abaixo está uma explicação detalhada de como implementar e utilizar a paginação:

Parâmetros de Paginação na API
skip: Número de registros a serem pulados (offset)
limit: Número máximo de registros a serem retornados por página
Exemplo de Requisição com Paginação
GET https://api-questao-1.onrender.com/api/v1/questoes?skip=10&limit=10