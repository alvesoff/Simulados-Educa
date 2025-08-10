import { Router } from 'express';
import { z } from 'zod';
import externalQuestionService from '../services/externalQuestionService';
import auth from '../middleware/auth';
const { authenticate, authorize } = auth;
import rateLimiting from '../middleware/rateLimiting';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import { logger } from '../utils/logger';

// ===== INICIALIZAÇÃO =====

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const externalQuestionFiltersSchema = z.object({
  skip: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  disciplina: z.string().optional(),
  anoEscolar: z.coerce.number().int().min(1).max(12).optional(),
  nivelDificuldade: z.enum(['Fácil', 'Médio', 'Difícil']).optional(),
  tags: z.string().optional(),
});

const createExternalQuestionSchema = z.object({
  statement: z.string().min(10, 'Enunciado deve ter pelo menos 10 caracteres').max(2000),
  alternatives: z.array(z.string().min(1).max(500)).min(2).max(6),
  correctAnswer: z.number().int().min(0),
  disciplina: z.string().min(2).max(100),
  anoEscolar: z.number().int().min(1).max(12),
  nivelDificuldade: z.enum(['Fácil', 'Médio', 'Difícil']),
  tags: z.array(z.string().max(50)).optional().default([]),
  has_math: z.boolean().optional().default(false),
});

const updateExternalQuestionSchema = z.object({
  statement: z.string().min(10).max(2000).optional(),
  alternatives: z.array(z.string().min(1).max(500)).min(2).max(6).optional(),
  correctAnswer: z.number().int().min(0).optional(),
  disciplina: z.string().min(2).max(100).optional(),
  anoEscolar: z.number().int().min(1).max(12).optional(),
  nivelDificuldade: z.enum(['Fácil', 'Médio', 'Difícil']).optional(),
  tags: z.array(z.string().max(50)).optional(),
  has_math: z.boolean().optional(),
});

// ===== ROTAS =====

/**
 * @route   GET /api/external-questions
 * @desc    Lista questões da API externa com filtros e paginação
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Valida query parameters
    const filters = externalQuestionFiltersSchema.parse(req.query);
    
    // Constrói filtros condicionalmente
    const processedFilters: any = {
      skip: filters.skip,
      limit: filters.limit,
    };

    if (filters.disciplina) processedFilters.disciplina = filters.disciplina;
    if (filters.anoEscolar) processedFilters.anoEscolar = filters.anoEscolar;
    if (filters.nivelDificuldade) processedFilters.nivelDificuldade = filters.nivelDificuldade;
    if (filters.tags) processedFilters.tags = filters.tags;
    
    logger.system('Listando questões externas', {
      userId: req.user!.id,
      filters,
    });

    const result = await externalQuestionService.getExternalQuestions(processedFilters);

    logger.performance('Listagem de questões externas', {
      userId: req.user!.id,
      questionsCount: result.data.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      },
    });
  })
);

/**
 * @route   GET /api/external-questions/:id
 * @desc    Busca questão específica da API externa
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Buscando questão externa por ID', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    const result = await externalQuestionService.getExternalQuestionById(req.params.id as string);

    logger.performance('Busca de questão externa por ID', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   POST /api/external-questions
 * @desc    Cria nova questão na API externa
 * @access  Private (TEACHER, ADMIN, STAFF)
 */
router.post(
  '/',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  validateRequest(createExternalQuestionSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Criando questão na API externa', {
      userId: req.user!.id,
      disciplina: req.body.disciplina,
      anoEscolar: req.body.anoEscolar,
    });

    // Valida se o índice da resposta correta está dentro do range das alternativas
    if (req.body.correctAnswer >= req.body.alternatives.length) {
      return res.status(400).json({
        success: false,
        message: 'Índice da resposta correta inválido',
      });
    }

    const result = await externalQuestionService.createExternalQuestion(req.body);

    logger.system('Questão criada na API externa com sucesso', {
      questionId: result.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Questão criada com sucesso na API externa',
    });
  })
);

/**
 * @route   PUT /api/external-questions/:id
 * @desc    Atualiza questão na API externa
 * @access  Private (TEACHER, ADMIN, STAFF)
 */
router.put(
  '/:id',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  validateRequest(updateExternalQuestionSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Atualizando questão na API externa', {
      questionId: req.params.id,
      userId: req.user!.id,
      updates: Object.keys(req.body),
    });

    // Valida se o índice da resposta correta está dentro do range das alternativas (se fornecido)
    if (req.body.correctAnswer !== undefined && req.body.alternatives) {
      if (req.body.correctAnswer >= req.body.alternatives.length) {
        return res.status(400).json({
          success: false,
          message: 'Índice da resposta correta inválido',
        });
      }
    }

    const result = await externalQuestionService.updateExternalQuestion(req.params.id!, req.body);

    logger.system('Questão atualizada na API externa com sucesso', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result,
      message: 'Questão atualizada com sucesso na API externa',
    });
  })
);

/**
 * @route   DELETE /api/external-questions/:id
 * @desc    Deleta questão na API externa
 * @access  Private (TEACHER, ADMIN, STAFF)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Deletando questão na API externa', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    await externalQuestionService.deleteExternalQuestion(req.params.id!);

    logger.system('Questão deletada na API externa com sucesso', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      message: 'Questão deletada com sucesso na API externa',
    });
  })
);

/**
 * @route   GET /api/external-questions/test
 * @desc    Testa conectividade com API externa
 * @access  Private (ADMIN)
 */
router.get(
  '/test',
  authenticate,
  authorize('ADMIN'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    logger.system('Testando conectividade com API externa', {
      userId: req.user!.id,
    });

    const testResult = await externalQuestionService.testExternalAPI();

    logger.performance('Teste de API externa executado', {
      duration: Date.now() - startTime,
      isConnected: testResult.isConnected,
      userId: req.user!.id,
    });

    return res.json({
      success: true,
      data: testResult,
    });
  })
);

/**
 * @route   GET /api/external-questions/meta/stats
 * @desc    Obtém estatísticas das questões externas
 * @access  Private
 */
router.get(
  '/meta/stats',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Buscando estatísticas das questões externas', {
      userId: req.user!.id,
    });

    const stats = await externalQuestionService.getExternalQuestionsStats();

    logger.performance('Busca de estatísticas das questões externas', {
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/external-questions/meta/subjects
 * @desc    Lista disciplinas disponíveis na API externa
 * @access  Private
 */
router.get(
  '/meta/subjects',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Listando disciplinas das questões externas', {
      userId: req.user!.id,
    });

    const stats = await externalQuestionService.getExternalQuestionsStats();
    const subjects = Object.keys(stats.questionsByDisciplina);

    logger.performance('Listagem de disciplinas das questões externas', {
      userId: req.user!.id,
      subjectsCount: subjects.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: subjects,
    });
  })
);

/**
 * @route   GET /api/external-questions/meta/difficulties
 * @desc    Lista níveis de dificuldade disponíveis na API externa
 * @access  Private
 */
router.get(
  '/meta/difficulties',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Listando níveis de dificuldade das questões externas', {
      userId: req.user!.id,
    });

    const difficulties = ['Fácil', 'Médio', 'Difícil'];

    logger.performance('Listagem de níveis de dificuldade das questões externas', {
      userId: req.user!.id,
      difficultiesCount: difficulties.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: difficulties,
    });
  })
);

/**
 * @route   GET /api/external-questions/meta/grades
 * @desc    Lista anos escolares disponíveis na API externa
 * @access  Private
 */
router.get(
  '/meta/grades',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Listando anos escolares das questões externas', {
      userId: req.user!.id,
    });

    // Como não temos informação de grades nas estatísticas externas,
    // vamos retornar uma lista padrão baseada no sistema educacional brasileiro
    const grades = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    logger.performance('Listagem de anos escolares das questões externas', {
      userId: req.user!.id,
      gradesCount: grades.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: grades,
    });
  })
);

export default router;