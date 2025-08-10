import { Router } from 'express';
import { z } from 'zod';
import combinedQuestionService from '../services/combinedQuestionService';
import auth from '../middleware/auth';
const { authenticate } = auth;
import rateLimiting from '../middleware/rateLimiting';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import { logger } from '../utils/logger';

// ===== INICIALIZAÇÃO =====

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const combinedQuestionFiltersSchema = z.object({
  subject: z.string().optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  tags: z.string().optional(), // tags separadas por vírgula
  search: z.string().optional(),
  source: z.enum(['local', 'external', 'both']).optional().default('both'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const questionsForTestSchema = z.object({
  subject: z.string().optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  tags: z.string().optional(),
  source: z.enum(['local', 'external', 'both']).optional().default('both'),
  count: z.coerce.number().int().min(1).max(100),
  excludeIds: z.array(z.string()).optional(),
});

// ===== ROTAS =====

/**
 * @route   GET /api/combined-questions
 * @desc    Lista questões combinadas (locais e externas) com filtros
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Valida query parameters
    const filters = combinedQuestionFiltersSchema.parse(req.query);
    
    // Converte tags de string para array
    const parsedFilters: any = { ...filters };
    if (filters.tags) {
      parsedFilters.tags = filters.tags.split(',').map(tag => tag.trim());
    }
    
    logger.system('Listando questões combinadas', {
      userId: req.user!.id,
      filters: parsedFilters,
    });

    const result = await combinedQuestionService.getCombinedQuestions(
      parsedFilters,
      req.user!.id
    );

    logger.performance('Listagem de questões combinadas', {
      userId: req.user!.id,
      questionsCount: result.data.length,
      localCount: result.sources.local,
      externalCount: result.sources.external,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      sources: result.sources,
    });
  })
);

/**
 * @route   GET /api/combined-questions/:id
 * @desc    Busca questão específica (local ou externa)
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Buscando questão combinada por ID', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    const result = await combinedQuestionService.getCombinedQuestionById(
      req.params.id!,
      req.user!.id
    );

    logger.performance('Busca de questão combinada por ID', {
      questionId: req.params.id,
      userId: req.user!.id,
      source: result.source,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * @route   GET /api/combined-questions/meta/stats
 * @desc    Obtém estatísticas combinadas das questões
 * @access  Private
 */
router.get(
  '/meta/stats',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Buscando estatísticas combinadas', {
      userId: req.user!.id,
    });

    const stats = await combinedQuestionService.getCombinedStats(req.user!.id);

    logger.performance('Busca de estatísticas combinadas', {
      userId: req.user!.id,
      totalQuestions: stats.total,
      localQuestions: stats.bySource.local,
      externalQuestions: stats.bySource.external,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   POST /api/combined-questions/for-test
 * @desc    Busca questões específicas para criação de teste
 * @access  Private
 */
router.post(
  '/for-test',
  authenticate,
  rateLimiting.generalRateLimit,
  validateRequest(questionsForTestSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Converte tags de string para array se fornecido
    const filters: any = { ...req.body };
    if (req.body.tags) {
      filters.tags = req.body.tags.split(',').map((tag: string) => tag.trim());
    }
    
    logger.system('Buscando questões para teste', {
      userId: req.user!.id,
      count: req.body.count,
      filters,
    });

    const questions = await combinedQuestionService.getQuestionsForTest(
      filters,
      req.user!.id
    );

    logger.performance('Busca de questões para teste', {
      userId: req.user!.id,
      requested: req.body.count,
      found: questions.length,
      localCount: questions.filter(q => q.source === 'local').length,
      externalCount: questions.filter(q => q.source === 'external').length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: questions,
      meta: {
        requested: req.body.count,
        found: questions.length,
        sources: {
          local: questions.filter(q => q.source === 'local').length,
          external: questions.filter(q => q.source === 'external').length,
        },
      },
    });
  })
);

/**
 * @route   GET /api/combined-questions/meta/subjects
 * @desc    Lista todas as disciplinas disponíveis (locais e externas)
 * @access  Private
 */
router.get(
  '/meta/subjects',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Listando disciplinas combinadas', {
      userId: req.user!.id,
    });

    const stats = await combinedQuestionService.getCombinedStats(req.user!.id);
    const subjects = Object.keys(stats.bySubject).sort();

    logger.performance('Listagem de disciplinas combinadas', {
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
 * @route   GET /api/combined-questions/meta/difficulties
 * @desc    Lista todos os níveis de dificuldade disponíveis
 * @access  Private
 */
router.get(
  '/meta/difficulties',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Listando níveis de dificuldade combinados', {
      userId: req.user!.id,
    });

    const difficulties = ['EASY', 'MEDIUM', 'HARD'];

    logger.performance('Listagem de níveis de dificuldade combinados', {
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
 * @route   GET /api/combined-questions/meta/grades
 * @desc    Lista todos os anos escolares disponíveis
 * @access  Private
 */
router.get(
  '/meta/grades',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.system('Listando anos escolares combinados', {
      userId: req.user!.id,
    });

    const stats = await combinedQuestionService.getCombinedStats(req.user!.id);
    const grades = Object.keys(stats.byGrade).map(Number).sort((a, b) => a - b);

    logger.performance('Listagem de anos escolares combinados', {
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

/**
 * @route   GET /api/combined-questions/search
 * @desc    Busca avançada em questões combinadas
 * @access  Private
 */
router.get(
  '/search',
  authenticate,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const { q: query, ...filters } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro de busca "q" é obrigatório',
      });
    }

    const searchFilters = {
      ...filters,
      search: query,
      page: Number(filters.page) || 1,
      limit: Number(filters.limit) || 20,
    };

    logger.system('Busca avançada em questões combinadas', {
      userId: req.user!.id,
      query,
      filters: searchFilters,
    });

    const result = await combinedQuestionService.getCombinedQuestions(
      searchFilters,
      req.user!.id
    );

    logger.performance('Busca avançada em questões combinadas', {
      userId: req.user!.id,
      query,
      resultsCount: result.data.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      sources: result.sources,
      query,
    });
  })
);

export default router;