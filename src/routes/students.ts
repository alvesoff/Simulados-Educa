import { Router } from 'express';
import { z } from 'zod';
import studentService from '../services/studentService';
import rateLimiting from '../middleware/rateLimiting';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import auth from '../middleware/auth';
const { optionalAuth } = auth;
import { logger } from '../utils/logger';

// ===== INICIALIZAÇÃO =====

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const studentLoginSchema = z.object({
  accessCode: z.string().min(6, 'Código de acesso deve ter pelo menos 6 caracteres').max(20),
  studentName: z.string().min(2, 'Nome completo deve ter pelo menos 2 caracteres').max(100),
  grade: z.enum([
    '1ANO', '2ANO', '3ANO', '4ANO', '5ANO', '6ANO', '7ANO', '8ANO', '9ANO',
    '1ENSINO_MEDIO', '2ENSINO_MEDIO', '3ENSINO_MEDIO'
  ], {
    errorMap: () => ({ message: 'Série deve ser entre 1ANO-9ANO ou 1ENSINO_MEDIO-3ENSINO_MEDIO' })
  }),
  classroom: z.string().min(1, 'Sala é obrigatória').max(10, 'Sala deve ter no máximo 10 caracteres'),
  schoolId: z.string().uuid('ID da escola inválido'),
  studentEmail: z.string().email('Email inválido').optional(),
  studentId: z.string().max(50).optional(), // ID/matrícula do estudante
});

const submitAnswerSchema = z.object({
  questionId: z.string().uuid('ID da questão inválido'),
  answer: z.union([
    z.number().int().min(0), // Para múltipla escolha (índice da alternativa)
    z.string().min(1), // Para questões dissertativas
    z.boolean(), // Para verdadeiro/falso
  ]),
  timeSpent: z.number().int().min(0).max(3600), // tempo em segundos
});

const submitAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid('ID da questão inválido'),
    selectedOption: z.string().min(1, 'Opção selecionada é obrigatória'),
    timeSpent: z.number().int().min(0).max(3600),
  })).min(1, 'Pelo menos uma resposta deve ser enviada'),
});

const finishAttemptSchema = z.object({
  finalAnswers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOption: z.string(),
    timeSpent: z.number().int().min(0),
  })).optional(),
});

// ===== ROTAS =====

/**
 * @route   POST /api/students/login
 * @desc    Login de estudante com código de acesso
 * @access  Public (com rate limiting)
 */
router.post(
  '/login',
  rateLimiting.studentLoginRateLimit,
  validateRequest(studentLoginSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Tentativa de login de estudante', {
      accessCode: req.body.accessCode,
      studentName: req.body.studentName,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    const result = await studentService.loginStudent({
      accessCode: req.body.accessCode,
      studentName: req.body.studentName,
      grade: req.body.grade,
      classroom: req.body.classroom,
      schoolId: req.body.schoolId,
      studentEmail: req.body.studentEmail,
      studentId: req.body.studentId,
    });

    logger.student('Login de estudante realizado com sucesso', {
      testId: result.data.id,
      studentName: req.body.studentName,
      duration: Date.now() - startTime,
    });

    res.status(201).json(result);
  })
);

/**
 * @route   GET /api/students/attempt/:attemptId
 * @desc    Obtém dados da tentativa atual
 * @access  Public (com validação de tentativa)
 */
router.get(
  '/attempt/:attemptId',
  rateLimiting.testAccessRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Buscando dados da tentativa', {
      attemptId: req.params.attemptId,
      ip: req.ip,
    });

    const result = await studentService.getAttempt(req.params.attemptId!);

    logger.performance('Busca de dados da tentativa', {
      duration: Date.now() - startTime,
      attemptId: req.params.attemptId,
      testId: result.testId,
    });

    return res.json(result);
  })
);

/**
 * @route   POST /api/students/attempt/:attemptId/answer
 * @desc    Submete uma resposta individual
 * @access  Public (com validação de tentativa)
 */
router.post(
  '/attempt/:attemptId/answer',
  rateLimiting.submitAnswersRateLimit,
  validateRequest(submitAnswerSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Submetendo resposta individual', {
      attemptId: req.params.attemptId,
      questionId: req.body.questionId,
      timeSpent: req.body.timeSpent,
      ip: req.ip,
    });

    const result = await studentService.submitAnswer(
      req.params.attemptId!,
      {
        questionId: req.body.questionId,
        selectedOption: req.body.answer,
        timeSpent: req.body.timeSpent,
      }
    );

    logger.student('Resposta individual submetida com sucesso', {
      attemptId: req.params.attemptId,
      questionId: req.body.questionId,
      duration: Date.now() - startTime,
    });

    return res.json(result);
  })
);

/**
 * @route   POST /api/students/attempt/:attemptId/answers
 * @desc    Submete múltiplas respostas de uma vez
 * @access  Public (com validação de tentativa)
 */
router.post(
  '/attempt/:attemptId/answers',
  rateLimiting.submitAnswersRateLimit,
  validateRequest(submitAnswersSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Submetendo múltiplas respostas', {
      attemptId: req.params.attemptId,
      answersCount: req.body.answers.length,
      ip: req.ip,
    });

    const results = [];
    
    const attemptId = req.params.attemptId;
    if (!attemptId) {
      return res.status(400).json({ error: 'ID da tentativa é obrigatório' });
    }
    
    // Processa cada resposta sequencialmente para evitar race conditions
    for (const answer of req.body.answers) {
      const result = await studentService.submitAnswer(attemptId, answer);
      results.push(result.data);
    }

    logger.student('Múltiplas respostas submetidas com sucesso', {
      attemptId,
      answersCount: req.body.answers.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: results,
      message: `${results.length} respostas submetidas com sucesso`,
    });
  })
);

/**
 * @route   POST /api/students/attempt/:attemptId/finish
 * @desc    Finaliza a tentativa do estudante
 * @access  Public (com validação de tentativa)
 */
router.post(
  '/attempt/:attemptId/finish',
  rateLimiting.submitAnswersRateLimit,
  validateRequest(finishAttemptSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Finalizando tentativa', {
      attemptId: req.params.attemptId,
      finalAnswersCount: req.body.finalAnswers?.length || 0,
      ip: req.ip,
    });

    const attemptId = req.params.attemptId;
    if (!attemptId) {
      return res.status(400).json({ error: 'ID da tentativa é obrigatório' });
    }
    
    // Se há respostas finais, submete elas primeiro
    if (req.body.finalAnswers && req.body.finalAnswers.length > 0) {
      for (const answer of req.body.finalAnswers) {
        await studentService.submitAnswer(attemptId, answer);
      }
    }

    const result = await studentService.submitAttempt(attemptId);

    logger.student('Tentativa finalizada com sucesso', {
      attemptId,
      score: result.score,
      duration: Date.now() - startTime,
    });

    return res.json(result);
  })
);

/**
 * @route   GET /api/students/attempt/:attemptId/results
 * @desc    Obtém resultados da tentativa (se permitido)
 * @access  Public (com validação de tentativa)
 */
router.get(
  '/attempt/:attemptId/results',
  rateLimiting.testAccessRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Buscando resultados da tentativa', {
      attemptId: req.params.attemptId,
      ip: req.ip,
    });

    const attempt = await studentService.getAttempt(req.params.attemptId!);
    
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Tentativa não encontrada',
      });
    }
    
    // Verifica se a tentativa foi finalizada
    if (!attempt.completedAt) {
      return res.status(400).json({
        success: false,
        message: 'Tentativa ainda não foi finalizada',
      });
    }

    logger.performance('Busca de resultados da tentativa', {
      duration: Date.now() - startTime,
      attemptId: req.params.attemptId,
      score: attempt.score,
    });

    return res.json({
      success: true,
      data: {
        attemptId: attempt.id,
        score: attempt.score,
        totalPoints: attempt.totalPoints,
        percentage: attempt.totalPoints && attempt.totalPoints > 0 ? ((attempt.score || 0) / attempt.totalPoints) * 100 : 0,
        completedAt: attempt.completedAt,
        duration: attempt.duration,
        answers: attempt.answers,
        testId: attempt.testId,
      },
    });
  })
);

/**
 * @route   GET /api/students/test/:testId/leaderboard
 * @desc    Obtém leaderboard público do teste
 * @access  Public (se o teste for público)
 */
router.get(
  '/test/:testId/leaderboard',
  rateLimiting.testAccessRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const limit = parseInt(req.query.limit as string) || 10;
    
    logger.student('Buscando leaderboard público', {
      testId: req.params.testId,
      limit,
      ip: req.ip,
    });

    const testId = req.params.testId;
    if (!testId) {
      return res.status(400).json({ error: 'ID do teste é obrigatório' });
    }
    
    const leaderboard = await studentService.getTestLeaderboard(
      testId,
      limit
    );

    logger.performance('Busca de leaderboard público', {
      duration: Date.now() - startTime,
      testId,
      entriesCount: leaderboard.length,
    });

    return res.json({
      success: true,
      data: leaderboard,
    });
  })
);

/**
 * @route   GET /api/students/attempts
 * @desc    Lista tentativas do estudante (se autenticado)
 * @access  Public (com autenticação opcional)
 */
router.get(
  '/attempts',
  optionalAuth,
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Se não há usuário autenticado, retorna erro
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária para listar tentativas',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    
    logger.student('Listando tentativas do estudante', {
      userId: req.user.id,
      page,
      limit,
      status,
    });

    const result = await studentService.getStudentAttempts(
      req.user.id,
      page,
      limit
    );

    logger.performance('Listagem de tentativas do estudante', {
      duration: Date.now() - startTime,
      userId: req.user.id,
      attemptsCount: result.data.length,
    });

    return res.json(result);
  })
);

/**
 * @route   POST /api/students/attempt/:attemptId/pause
 * @desc    Pausa a tentativa (salva progresso)
 * @access  Public (com validação de tentativa)
 */
router.post(
  '/attempt/:attemptId/pause',
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Pausando tentativa', {
      attemptId: req.params.attemptId,
      ip: req.ip,
    });

    // TODO: Implementar funcionalidade de pausa no studentService
    // Por enquanto, apenas retorna sucesso
    
    logger.student('Tentativa pausada com sucesso', {
      attemptId: req.params.attemptId,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Tentativa pausada com sucesso',
      data: {
        attemptId: req.params.attemptId,
        pausedAt: new Date().toISOString(),
      },
    });
  })
);

/**
 * @route   POST /api/students/attempt/:attemptId/resume
 * @desc    Retoma a tentativa pausada
 * @access  Public (com validação de tentativa)
 */
router.post(
  '/attempt/:attemptId/resume',
  rateLimiting.generalRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Retomando tentativa', {
      attemptId: req.params.attemptId,
      ip: req.ip,
    });

    // TODO: Implementar funcionalidade de retomada no studentService
    // Por enquanto, apenas retorna sucesso
    
    logger.student('Tentativa retomada com sucesso', {
      attemptId: req.params.attemptId,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Tentativa retomada com sucesso',
      data: {
        attemptId: req.params.attemptId,
        resumedAt: new Date().toISOString(),
      },
    });
  })
);

/**
 * @route   GET /api/students/attempt/:attemptId/time
 * @desc    Obtém tempo restante da tentativa
 * @access  Public (com validação de tentativa)
 */
router.get(
  '/attempt/:attemptId/time',
  rateLimiting.testAccessRateLimit,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.student('Verificando tempo restante', {
      attemptId: req.params.attemptId,
      ip: req.ip,
    });

    const attemptId = req.params.attemptId;
    if (!attemptId) {
      return res.status(400).json({ error: 'ID da tentativa é obrigatório' });
    }
    
    const attempt = await studentService.getAttempt(attemptId);
    
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Tentativa não encontrada',
      });
    }
    
    let timeRemaining = null;
    
    if (attempt.duration && attempt.startedAt) {
      const timeLimitMs = attempt.duration * 60 * 1000; // converte para ms
      const elapsedMs = Date.now() - new Date(attempt.startedAt).getTime();
      timeRemaining = Math.max(0, timeLimitMs - elapsedMs);
    }

    logger.performance('Verificação de tempo restante', {
      duration: Date.now() - startTime,
      attemptId,
      timeRemaining,
    });

    return res.json({
      success: true,
      data: {
        attemptId,
        timeRemaining, // em milissegundos, null se sem limite
        hasTimeLimit: !!attempt.duration,
        duration: attempt.duration, // em minutos
        startedAt: attempt.startedAt,
      },
    });
  })
);

export default router;