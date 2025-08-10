// DEIXAR PARA O FINAL

import { Router } from 'express';
import { z } from 'zod';
import questionService from '../services/questionService';
import auth from '../middleware/auth';
const { authenticate, authorize, authorizeSchool } = auth;
import rateLimiting from '../middleware/rateLimiting';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import { logger } from '../utils/logger';
import { QuestionFilters } from '../types';

// ===== INICIALIZAÇÃO =====

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const createQuestionSchema = z.object({
  statement: z.string().min(10, 'Questão deve ter pelo menos 10 caracteres').max(2000),
  options: z.array(z.object({
    text: z.string().min(1).max(500),
    isCorrect: z.boolean()
  })).min(2).max(6),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'ESSAY']).default('MULTIPLE_CHOICE'),
  subject: z.string().min(2).max(100),
  topic: z.string().max(200).optional(),
  grade: z.number().int().min(1).max(12).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  tags: z.array(z.string().max(50)).optional(),
  hasMath: z.boolean().optional().default(false),
});

const updateQuestionSchema = z.object({
  statement: z.string().min(10).max(2000).optional(),
  options: z.array(z.object({
    text: z.string().min(1).max(500),
    isCorrect: z.boolean()
  })).min(2).max(6).optional(),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'ESSAY']).optional(),
  subject: z.string().min(2).max(100).optional(),
  topic: z.string().max(200).optional(),
  grade: z.number().int().min(1).max(12).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  tags: z.array(z.string().max(50)).optional(),
  hasMath: z.boolean().optional(),
});

const questionFiltersSchema = z.object({
  schoolId: z.string().uuid().optional(),
  subject: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'ESSAY']).optional(),
  creatorId: z.string().uuid().optional(),
  tags: z.string().optional(), // tags separadas por vírgula
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const importQuestionsSchema = z.object({
  source: z.enum(['file', 'url', 'api']),
  data: z.any(), // Pode ser arquivo, URL ou dados da API
  format: z.enum(['json', 'csv', 'xlsx']).optional().default('json'),
  mapping: z.record(z.string()).optional(), // Mapeamento de campos
});

const bulkOperationSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1, 'Pelo menos uma questão deve ser selecionada'),
  operation: z.enum(['delete', 'update', 'export']),
  data: z.record(z.any()).optional(), // Dados para operação de update
});

const syncQuestionsSchema = z.object({
  maxPages: z.coerce.number().int().min(1).max(200).optional().default(5), // Permite até 200 páginas para importar todas
  fullSync: z.boolean().optional().default(false), // Flag para sincronização completa
});

// ===== ROTAS =====

/**
 * @route   POST /api/questions
 * @desc    Cria uma nova questão
 * @access  Private (TEACHER, ADMIN, STAFF)
 */
router.post(
  '/',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  authorizeSchool,
  rateLimiting.generalRateLimit,
  validateRequest(createQuestionSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Criando nova questão', {
      userId: req.user!.id,
      subject: req.body.subject,
      topic: req.body.topic,
      difficulty: req.body.difficulty,
      type: req.body.type,
    });

    // Valida se há pelo menos uma opção correta
    const correctOptions = req.body.options.filter((opt: any) => opt.isCorrect);
    if (correctOptions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Pelo menos uma opção deve estar marcada como correta',
      });
    }

    const result = await questionService.createQuestion(req.body, req.user!.id);

    logger.question('Questão criada com sucesso', {
      questionId: result.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.status(201).json(result);
  })
);

/**
 * @route   GET /api/questions
 * @desc    Lista questões com filtros
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  authorizeSchool,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Valida query parameters
    const filters = questionFiltersSchema.parse(req.query);
    
    // Converte tags de string para array e remove campos undefined
    const parsedFilters: QuestionFilters = {};
    
    if (filters.subject) parsedFilters.subject = filters.subject;
     if (filters.topic) parsedFilters.topic = filters.topic;
     if (filters.difficulty) parsedFilters.difficulty = filters.difficulty;
     if (filters.type) parsedFilters.type = filters.type;
     if (filters.creatorId) parsedFilters.creatorId = filters.creatorId;
     if (filters.search) parsedFilters.search = filters.search;
     if (filters.tags) parsedFilters.tags = filters.tags.split(',').map(tag => tag.trim());
    
    // Define schoolId baseado no papel do usuário
    if (req.user!.role === 'STAFF' && filters.schoolId) {
      parsedFilters.schoolId = filters.schoolId;
    } else if (req.user!.role !== 'STAFF') {
      parsedFilters.schoolId = req.user!.schoolId;
    }
    
    logger.question('Listando questões', {
      userId: req.user!.id,
      filters: parsedFilters,
    });

    const result = await questionService.getQuestions(
      parsedFilters,
      req.user!.id,
      filters.page,
      filters.limit
    );

    logger.performance('Listagem de questões', {
      userId: req.user!.id,
      questionsCount: result.data.length,
      duration: Date.now() - startTime,
    });

    return res.json(result);
  })
);

/**
 * @route   GET /api/questions/:id
 * @desc    Busca questão por ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  authorizeSchool,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Buscando questão por ID', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    const result = await questionService.getQuestionById(req.params.id!, req.user!.id);

    logger.performance('Busca de questão por ID', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json(result);
  })
);

/**
 * @route   PUT /api/questions/:id
 * @desc    Atualiza uma questão
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.put(
  '/:id',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  authorizeSchool,
  rateLimiting.generalRateLimit,
  validateRequest(updateQuestionSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Atualizando questão', {
      questionId: req.params.id,
      userId: req.user!.id,
      updates: Object.keys(req.body),
    });

    // Se há opções sendo atualizadas, valida se há pelo menos uma correta
    if (req.body.options) {
      const correctOptions = req.body.options.filter((opt: any) => opt.isCorrect);
      if (correctOptions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Pelo menos uma opção deve estar marcada como correta',
        });
      }
    }

    const result = await questionService.updateQuestion(req.params.id!, req.body, req.user!.id);

    logger.question('Questão atualizada com sucesso', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.json(result);
  })
);

/**
 * @route   DELETE /api/questions/:id
 * @desc    Deleta uma questão
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  authorizeSchool,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Deletando questão', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    await questionService.deleteQuestion(req.params.id!, req.user!.id);

    logger.question('Questão deletada com sucesso', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Questão deletada com sucesso',
    });
  })
);

/**
 * @route   GET /api/questions/subjects
 * @desc    Lista matérias disponíveis
 * @access  Private
 */
router.get(
  '/meta/subjects',
  authenticate,
  authorizeSchool,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Listando matérias', {
      userId: req.user!.id,
      schoolId: req.user!.schoolId,
    });

    const subjects = await questionService.getSubjects(
      req.user!.role === 'STAFF' ? undefined : req.user!.schoolId
    );

    logger.performance('Listagem de matérias', {
      userId: req.user!.id,
      subjectsCount: subjects.length,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: subjects,
    });
  })
);

/**
 * @route   GET /api/questions/subjects/:subject/topics
 * @desc    Lista tópicos de uma matéria
 * @access  Private
 */
router.get(
  '/meta/subjects/:subject/topics',
  authenticate,
  authorizeSchool,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Listando tópicos da matéria', {
      userId: req.user!.id,
      subject: req.params.subject,
      schoolId: req.user!.schoolId,
    });

    const topics = await questionService.getTopicsBySubject(
      req.params.subject!,
      req.user!.role === 'STAFF' ? undefined : req.user!.schoolId
    );

    logger.performance('Listagem de tópicos', {
      userId: req.user!.id,
      subject: req.params.subject,
      topicsCount: topics.length,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: topics,
    });
  })
);

/**
 * @route   GET /api/questions/:id/stats
 * @desc    Obtém estatísticas de uso da questão
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.get(
  '/:id/stats',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  authorizeSchool,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Buscando estatísticas da questão', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    const stats = await questionService.getQuestionStats(req.params.id!, req.user!.id);

    logger.performance('Busca de estatísticas da questão', {
      questionId: req.params.id,
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   POST /api/questions/import
 * @desc    Importa questões de fonte externa
 * @access  Private (ADMIN, STAFF)
 */
router.post(
  '/import',
  authenticate,
  authorize('STAFF'),
  authorizeSchool,
  rateLimiting.generalRateLimit,
  validateRequest(importQuestionsSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Importando questões', {
      userId: req.user!.id,
      source: req.body.source,
      format: req.body.format,
    });

    const result = await questionService.importQuestions(
      req.body.data,
      req.user!.schoolId,
      req.user!.id
    );

    logger.question('Questões importadas com sucesso', {
      userId: req.user!.id,
      importedCount: result.imported,
      skippedCount: result.skipped,
      errorsCount: result.errors.length,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: result,
      message: `${result.imported} questões importadas com sucesso`,
    });
  })
);

/**
 * @route   POST /api/questions/sync
 * @desc    Sincroniza questões com API externa
 * @access  Private (STAFF)
 */
router.post(
  '/sync',
  authenticate,
  authorize('STAFF'),
  rateLimiting.generalRateLimit,
  validateRequest(syncQuestionsSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Sincronizando questões com API externa', {
      userId: req.user!.id,
      schoolId: req.user!.schoolId,
    });

    const maxPages = parseInt(req.body.maxPages as string) || 5;
    const fullSync = req.body.fullSync === true;
    
    // Se fullSync for true, define maxPages para um valor alto para pegar todas as questões
    const finalMaxPages = fullSync ? 200 : maxPages;
    
    const result = await questionService.syncQuestionsFromAPI(req.user!.schoolId, finalMaxPages);

    logger.question('Sincronização concluída', {
      userId: req.user!.id,
      schoolId: req.user!.schoolId,
      importedCount: result.imported,
      skippedCount: result.skipped,
      errorsCount: result.errors.length,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: result,
      message: `${result.imported} questões sincronizadas com sucesso`,
    });
  })
);

/**
 * @route   POST /api/questions/sync/full
 * @desc    Sincroniza TODAS as questões da API externa
 * @access  Private (STAFF)
 */
router.post(
  '/sync/full',
  authenticate,
  authorize('STAFF'),
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Iniciando sincronização COMPLETA com API externa', {
      userId: req.user!.id,
      schoolId: req.user!.schoolId,
    });

    // Sincronização completa - busca todas as questões disponíveis
    const result = await questionService.syncQuestionsFromAPI(req.user!.schoolId, 200);

    logger.question('Sincronização COMPLETA concluída', {
      userId: req.user!.id,
      schoolId: req.user!.schoolId,
      importedCount: result.imported,
      skippedCount: result.skipped,
      errorsCount: result.errors.length,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: result,
      message: `Sincronização completa: ${result.imported} questões importadas, ${result.skipped} ignoradas`,
    });
  })
);

/**
 * @route   POST /api/questions/bulk
 * @desc    Operações em lote (deletar, atualizar, exportar)
 * @access  Private (ADMIN, STAFF)
 */
router.post(
  '/bulk',
  authenticate,
  authorize('STAFF'),
  authorizeSchool,
  rateLimiting.generalRateLimit,
  validateRequest(bulkOperationSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.question('Operação em lote', {
      userId: req.user!.id,
      operation: req.body.operation,
      questionsCount: req.body.questionIds.length,
    });

    let result;
    
    switch (req.body.operation) {
      case 'delete':
        // TODO: Implementar deleção em lote
        result = { processed: 0, errors: [] };
        break;
        
      case 'update':
        // TODO: Implementar atualização em lote
        result = { processed: 0, errors: [] };
        break;
        
      case 'export':
        // TODO: Implementar exportação em lote
        result = { exported: 0, format: 'json', data: [] };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Operação não suportada',
        });
    }

    logger.question('Operação em lote concluída', {
      userId: req.user!.id,
      operation: req.body.operation,
      questionsCount: req.body.questionIds.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: result,
      message: `Operação ${req.body.operation} executada com sucesso`,
    });
  })
);

/**
 * @route   POST /api/questions/:id/duplicate
 * @desc    Duplica uma questão
 * @access  Private (Creator, STAFF ou ADMIN da escola)
 */
router.post(
  '/:id/duplicate',
  authenticate,
  authorize('TEACHER', 'STAFF'),
  authorizeSchool,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    logger.question('Duplicando questão', {
      questionId: req.params.id,
      userId: req.user!.id,
    });

    // TODO: Implementar duplicação no questionService
    // Por enquanto, retorna erro
    res.status(501).json({
      success: false,
      message: 'Funcionalidade não implementada',
    });
  })
);

/**
 * @route   GET /api/questions/random
 * @desc    Obtém questões aleatórias com filtros
 * @access  Private
 */
router.get(
  '/random/get',
  authenticate,
  authorizeSchool,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const count = parseInt(req.query.count as string) || 10;
    const subject = req.query.subject as string;
    const topic = req.query.topic as string;
    const difficulty = req.query.difficulty as string;
    
    logger.question('Buscando questões aleatórias', {
      userId: req.user!.id,
      count,
      subject,
      topic,
      difficulty,
    });

    // TODO: Implementar busca aleatória no questionService
    // Por enquanto, retorna array vazio
    const questions: any[] = [];

    logger.performance('Busca de questões aleatórias', {
      userId: req.user!.id,
      questionsCount: questions.length,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      data: questions,
    });
  })
);

export default router;