import { Router } from 'express';
import { z } from 'zod';
import authService from '../services/authService';
import auth from '../middleware/auth';
const { authenticate, optionalAuth } = auth;
import rateLimiting from '../middleware/rateLimiting';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import { logger } from '../utils/logger';

// ===== INICIALIZAÇÃO =====

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').max(128),
  role: z.enum(['TEACHER', 'ADMIN']).optional().default('TEACHER'),
  schoolId: z.string().cuid('ID da escola inválido'),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres').max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres').max(128),
});

// ===== ROTAS =====

/**
 * @route   POST /api/auth/register
 * @desc    Registra um novo usuário
 * @access  Public (com rate limiting)
 */
router.post(
  '/register',
  rateLimiting.authRateLimit,
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de registro', {
      email: req.body.email,
      role: req.body.role,
      schoolId: req.body.schoolId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    const result = await authService.register(req.body);

    logger.auth('Registro realizado com sucesso', {
      userId: result.user.id,
      email: req.body.email,
      role: req.body.role,
      duration: Date.now() - startTime,
    });

    return res.status(201).json(result);
  })
);

/**
 * @route   POST /api/auth/login
 * @desc    Realiza login do usuário
 * @access  Public (com rate limiting)
 */
router.post(
  '/login',
  rateLimiting.authRateLimit,
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de login', {
      email: req.body.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    const result = await authService.login(req.body.email, req.body.password);

    logger.auth('Login realizado com sucesso', {
      userId: result.user.id,
      email: req.body.email,
      duration: Date.now() - startTime,
    });

    return res.json(result);
  })
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Renova tokens de acesso
 * @access  Public (com rate limiting)
 */
router.post(
  '/refresh',
  rateLimiting.authRateLimit,
  validateRequest(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de renovação de token', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    const tokens = await authService.refreshTokens(req.body.refreshToken);

    logger.auth('Token renovado com sucesso', {
      refreshToken: req.body.refreshToken,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: {
        tokens
      }
    });
  })
);

/**
 * @route   POST /api/auth/logout
 * @desc    Realiza logout do usuário
 * @access  Private
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de logout', {
      userId: req.user!.id,
      ip: req.ip,
    });

    await authService.logout(req.user!.id);

    logger.auth('Logout realizado com sucesso', {
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  })
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Realiza logout de todos os dispositivos
 * @access  Private
 */
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de logout de todos os dispositivos', {
      userId: req.user!.id,
      ip: req.ip,
    });

    await authService.logoutAll(req.user!.id);

    logger.auth('Logout de todos os dispositivos realizado com sucesso', {
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Logout de todos os dispositivos realizado com sucesso',
    });
  })
);

/**
 * @route   GET /api/auth/me
 * @desc    Obtém dados do usuário autenticado
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Busca de dados do usuário', {
      userId: req.user!.id,
    });

    const result = await authService.getCurrentUser(req.user!.id);

    logger.performance('Busca de dados do usuário', {
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json(result);
  })
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Altera senha do usuário
 * @access  Private
 */
router.put(
  '/change-password',
  authenticate,
  rateLimiting.authRateLimit,
  validateRequest(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de alteração de senha', {
      userId: req.user!.id,
      ip: req.ip,
    });

    await authService.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword
    );

    logger.auth('Senha alterada com sucesso', {
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Senha alterada com sucesso',
    });
  })
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Solicita reset de senha
 * @access  Public (com rate limiting)
 */
router.post(
  '/forgot-password',
  rateLimiting.authRateLimit,
  validateRequest(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Solicitação de reset de senha', {
      email: req.body.email,
      ip: req.ip,
    });

    // TODO: Implementar envio de email
    // Por enquanto, apenas loga a solicitação
    
    logger.auth('Solicitação de reset processada', {
      email: req.body.email,
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Se o email existir, você receberá instruções para reset da senha',
    });
  })
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reseta senha com token
 * @access  Public (com rate limiting)
 */
router.post(
  '/reset-password',
  rateLimiting.authRateLimit,
  validateRequest(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Tentativa de reset de senha', {
      ip: req.ip,
    });

    // TODO: Implementar reset de senha com token
    // Por enquanto, apenas retorna sucesso
    
    logger.auth('Reset de senha processado', {
      duration: Date.now() - startTime,
    });

    res.json({
      success: true,
      message: 'Senha resetada com sucesso',
    });
  })
);

/**
 * @route   GET /api/auth/verify-token
 * @desc    Verifica se o token é válido
 * @access  Public
 */
router.get(
  '/verify-token',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const isValid = !!req.user;
    
    res.json({
      success: true,
      data: {
        isValid,
        user: isValid ? {
          id: req.user!.id,
          email: req.user!.email,
          role: req.user!.role,
        } : null,
      },
    });
  })
);

/**
 * @route   GET /api/auth/sessions
 * @desc    Lista sessões ativas do usuário
 * @access  Private
 */
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const sessions = await authService.getUserSessions(req.user!.id);

    logger.performance('Busca de sessões do usuário', {
      userId: req.user!.id,
      sessionsCount: sessions.length,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: sessions,
    });
  })
);

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    Revoga sessão específica
 * @access  Private
 */
router.delete(
  '/sessions/:sessionId',
  authenticate,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logger.auth('Revogação de sessão específica', {
      userId: req.user!.id,
      sessionId: req.params.sessionId,
    });

    await authService.revokeSession(req.user!.id, req.params.sessionId!);

    logger.auth('Sessão revogada com sucesso', {
      userId: req.user!.id,
      sessionId: req.params.sessionId,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      message: 'Sessão revogada com sucesso',
    });
  })
);

/**
 * @route   GET /api/auth/stats
 * @desc    Obtém estatísticas de autenticação
 * @access  Private (apenas STAFF)
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    // Verifica se é STAFF
    if (req.user!.role !== 'STAFF') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado',
      });
    }

    const startTime = Date.now();
    
    const stats = await authService.getAuthStats();

    logger.performance('Busca de estatísticas de autenticação', {
      userId: req.user!.id,
      duration: Date.now() - startTime,
    });

    return res.json({
      success: true,
      data: stats,
    });
  })
);

export default router;