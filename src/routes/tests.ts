import { Router } from 'express';
import { z } from 'zod';
import testService from '../services/testService';
import auth from '../middleware/auth';
const { authenticate, authorize } = auth;
import rateLimiting from '../middleware/rateLimiting';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import { logger } from '../utils/logger';
import { idSchema, idsArraySchema, paginationSchema } from '../utils/validation';

// ===== INICIALIZAÇÃO =====

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const createTestSchema = z.object({
  title: z.string().min(3, 'Título deve ter pelo menos 3 caracteres').max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['PRIVATE', 'PUBLIC', 'COLLABORATIVE']).optional().default('PRIVATE'),
  duration: z.number().int().min(1).max(480).optional(), // em minutos
  maxAttempts: z.number().int().min(1).max(10).optional().default(1),
  showResults: z.boolean().optional().default(true),
  shuffleQuestions: z.boolean().optional().default(false),
  shuffleOptions: z.boolean().optional().default(false),
  settings: z.record(z.any()).optional().default({}),
});

const updateTestSchema = z.object({
  title: z.string().min(3, 'Título deve ter pelo menos 3 caracteres').max(200).optional(),
  description: z.string().max(1000).optional(),
  duration: z.number().int().min(1).max(480).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  showResults: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  settings: z.record(z.any()).optional(),
});

const addQuestionsSchema = z.object({
  questionIds: idsArraySchema,
});

const testFiltersSchema = z.object({
  schoolId: idSchema.optional(),
  status: z.enum(['EDITING', 'ACTIVE', 'COMPLETED']).optional(),
  type: z.enum(['PRIVATE', 'PUBLIC', 'COLLABORATIVE']).optional(),
  creatorId: idSchema.optional(),
  search: z.string().optional(),
}).merge(paginationSchema);

// ===== ROTAS =====

/**
 * @route   POST /api/tests
 * @desc    Cria um novo teste
 * @access  Private (TEACHER, ADMIN, STAFF)
 */
router.post(
  '/',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  validateRequest(createTestSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Criando novo teste', {
      userId: req.user!.id,
      title: req.body.title,
      type: req.body.type,
    });

    const result = await testService.createTest(req.body, req.user!.id);

    logger.performance('Teste criado com sucesso', {
      duration: Date.now() - startTime,
      testId: result.id,
      userId: req.user!.id,
    });

    res.status(201).json(result);
  })
);

/**
 * @route   GET /api/tests
 * @desc    Lista testes com filtros
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Valida query parameters
    const filters = testFiltersSchema.parse(req.query);
    
    logger.info('Listando testes', {
      userId: req.user!.id,
      filters: {
        ...filters,
        schoolId: filters.schoolId || req.user!.schoolId,
      },
    });

    // Filtrar propriedades undefined para compatibilidade com exactOptionalPropertyTypes
    const cleanFilters: any = {};
    if (filters.type !== undefined) cleanFilters.type = filters.type;
    if (filters.status !== undefined) cleanFilters.status = filters.status;
    if (filters.search !== undefined) cleanFilters.search = filters.search;
    if (filters.creatorId !== undefined) cleanFilters.createdById = filters.creatorId;
    
    cleanFilters.schoolId = req.user!.role === 'STAFF' ? filters.schoolId : req.user!.schoolId;

    const result = await testService.getTests(
      cleanFilters,
      req.user!.id,
      filters.page,
      filters.limit
    );

    logger.performance('Listagem de testes', {
      userId: req.user!.id,
      testsCount: result.data.length,
      duration: Date.now() - startTime,
    });

    res.json(result);
  })
);

/**
 * @route   GET /api/tests/:id
 * @desc    Busca teste por ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Buscando teste por ID', {
      testId: req.params.id,
      userId: req.user!.id,
    });

    const result = await testService.getTestById(req.params.id!, req.user!.id);

    logger.performance('Busca de teste por ID', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
    });

    res.json(result);
  })
);

/**
 * @route   GET /api/tests/access/:accessCode
 * @desc    Busca teste por código de acesso
 * @access  Public (com rate limiting)
 */
router.get(
  '/access/:accessCode',
  rateLimiting.testAccessRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Buscando teste por código de acesso', {
      accessCode: req.params.accessCode,
      ip: req.ip,
    });

    const result = await testService.getTestByAccessCode(req.params.accessCode!);

    logger.performance('Busca de teste por código', {
      duration: Date.now() - startTime,
      accessCode: req.params.accessCode,
      testId: result.id,
    });

    res.json(result);
  })
);

/**
 * @route   PUT /api/tests/:id
 * @desc    Atualiza um teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.put(
  '/:id',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  validateRequest(updateTestSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Atualizando teste', {
      testId: req.params.id,
      userId: req.user!.id,
      updates: Object.keys(req.body),
    });

    const result = await testService.updateTest(req.params.id!, req.body, req.user!.id);

    logger.performance('Teste atualizado com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
    });

    res.json(result);
  })
);

/**
 * @route   POST /api/tests/:id/questions
 * @desc    Adiciona questões ao teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.post(
  '/:id/questions',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  validateRequest(addQuestionsSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Adicionando questões ao teste', {
      testId: req.params.id,
      userId: req.user!.id,
      questionsCount: req.body.questionIds.length,
    });

    const result = await testService.addQuestionsToTest(
      req.params.id!,
      req.body.questionIds,
      req.user!.id
    );

    logger.performance('Questões adicionadas com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
      questionsCount: req.body.questionIds.length,
    });

    res.json(result);
  })
);

/**
 * @route   DELETE /api/tests/:id/questions/:questionId
 * @desc    Remove questão do teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.delete(
  '/:id/questions/:questionId',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Removendo questão do teste', {
      testId: req.params.id,
      questionId: req.params.questionId,
      userId: req.user!.id,
    });

    const result = await testService.removeQuestionFromTest(
      req.params.id!,
      req.params.questionId!,
      req.user!.id
    );

    logger.performance('Questão removida com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      questionId: req.params.questionId,
      userId: req.user!.id,
    });

    res.json(result);
  })
);

/**
 * @route   POST /api/tests/:id/activate
 * @desc    Ativa um teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.post(
  '/:id/activate',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Ativando teste', {
      testId: req.params.id,
      userId: req.user!.id,
    });

    const result = await testService.activateTest(req.params.id!, req.user!.id);

    logger.performance('Teste ativado com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
    });

    res.json(result);
  })
);

/**
 * @route   POST /api/tests/:id/deactivate
 * @desc    Desativa um teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.post(
  '/:id/deactivate',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Desativando teste', {
      testId: req.params.id,
      userId: req.user!.id,
    });

    const result = await testService.deactivateTest(req.params.id!, req.user!.id);

    logger.performance('Teste desativado com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
    });

    res.json(result);
  })
);

/**
 * @route   DELETE /api/tests/:id
 * @desc    Deleta um teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Deletando teste', {
      testId: req.params.id,
      userId: req.user!.id,
    });

    await testService.deleteTest(req.params.id!, req.user!.id);

    logger.performance('Teste deletado com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      message: 'Teste deletado com sucesso',
    });
  })
);

/**
 * @route   GET /api/tests/:id/stats
 * @desc    Obtém estatísticas do teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.get(
  '/:id/stats',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.info('Buscando estatísticas do teste', {
      testId: req.params.id,
      userId: req.user!.id,
    });

    const result = await testService.getTestStats(req.params.id!, req.user!.id);

    logger.performance('Estatísticas do teste obtidas com sucesso', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   GET /api/tests/:id/attempts
 * @desc    Lista tentativas do teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.get(
  '/:id/attempts',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    
    logger.info('Listando tentativas do teste', {
      testId: req.params.id,
      userId: req.user!.id,
      page,
      limit,
      status,
    });

    // TODO: Implementar getTestAttempts no testService
    // const result = await testService.getTestAttempts(
    //   req.params.id!,
    //   req.user!.id,
    //   page,
    //   limit
    // );
    const result = { data: [], total: 0, page, limit };

    logger.performance('Listagem de tentativas do teste', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
      attemptsCount: result.data.length,
    });

    res.json(result);
  })
);

/**
 * @route   GET /api/tests/:id/leaderboard
 * @desc    Obtém leaderboard do teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.get(
  '/:id/leaderboard',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const limit = parseInt(req.query.limit as string) || 50;
    
    logger.info('Buscando leaderboard do teste', {
      testId: req.params.id,
      userId: req.user!.id,
      limit,
    });

    // TODO: Implementar getTestLeaderboard no testService
    // const result = await testService.getTestLeaderboard(
    //   req.params.id!,
    //   req.user!.id,
    //   limit
    // );
    const result = { data: [] };

    logger.performance('Busca de leaderboard do teste', {
      duration: Date.now() - startTime,
      testId: req.params.id,
      userId: req.user!.id,
      entriesCount: result.data.length,
    });

    res.json(result);
  })
);

/**
 * @route   POST /api/tests/:id/duplicate
 * @desc    Duplica um teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.post(
  '/:id/duplicate',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req) => {
    logger.info('Duplicando teste', {
      originalTestId: req.params.id,
      userId: req.user!.id,
    });

    // TODO: Implementar duplicateTest no testService
    // const result = await testService.duplicateTest(req.params.id!, req.user!.id);
    throw new Error('Funcionalidade não implementada');

    // logger.performance('Teste duplicado com sucesso', {
    //   duration: Date.now() - startTime,
    //   originalTestId: req.params.id,
    //   newTestId: result.id,
    //   userId: req.user!.id,
    // });

    // res.json(result);
  })
);

/**
 * @route   POST /api/tests/:id/export
 * @desc    Exporta dados do teste
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.post(
  '/:id/export',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req) => {
    const format = req.query.format as string || 'json';
    
    logger.info('Exportando dados do teste', {
      testId: req.params.id,
      userId: req.user!.id,
      format,
    });

    // TODO: Implementar exportTestData no testService
    // const result = await testService.exportTestData(
    //   req.params.id!,
    //   req.user!.id,
    //   format
    // );
    throw new Error('Funcionalidade não implementada');

    // logger.performance('Dados do teste exportados com sucesso', {
    //   duration: Date.now() - startTime,
    //   testId: req.params.id,
    //   userId: req.user!.id,
    //   format,
    // });

    // res.json(result);
  })
);

export default router;