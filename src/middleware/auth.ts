import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { config } from '../utils/config';
import { cacheManager } from '../utils/cache';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// ===== INTERFACES =====

interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  schoolId: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
    schoolId: string;
  };
}

// ===== MIDDLEWARE DE AUTENTICAÇÃO =====

/**
 * Middleware principal de autenticação
 * Otimizado para alta performance com cache
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const timer = logger.startTimer();
  
  try {
    // 1. Extrai token do header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.auth('Token ausente', { ip: req.ip, success: false });
      res.status(401).json({
        success: false,
        error: 'Token de acesso requerido',
        timestamp: new Date(),
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // 2. Verifica token JWT
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    } catch (jwtError) {
      logger.auth('Token inválido', {
        ip: req.ip,
        error: jwtError instanceof Error ? jwtError.message : 'Unknown error'
      });
      res.status(401).json({
        success: false,
        error: 'Token inválido ou expirado',
        timestamp: new Date(),
      });
      return;
    }

    // 3. Busca usuário no cache primeiro
    let user: any = await cacheManager.getUser(payload.userId);
    
    if (!user) {
      // 4. Se não estiver no cache, busca no banco
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          school: true,
        },
      });

      if (!user) {
        logger.auth('Usuário não encontrado', { userId: payload.userId, ip: req.ip, success: false });
        res.status(401).json({
          success: false,
          error: 'Usuário não encontrado',
          timestamp: new Date(),
        });
        return;
      }

      // 5. Armazena no cache por 30 minutos
      await cacheManager.setUser(user.id, user, config.CACHE_TTL.MEDIUM);
    }

    // 6. Validações de segurança
    if (!user.isActive) {
      logger.auth('Usuário inativo', { userId: user.id, ip: req.ip, success: false });
      res.status(401).json({
        success: false,
        error: 'Conta desativada',
        timestamp: new Date(),
      });
      return;
    }

    if (!user.school?.isActive) {
      logger.auth('Escola inativa', {
        userId: user.id,
        ip: req.ip,
        schoolId: user.schoolId
      });
      res.status(401).json({
        success: false,
        error: 'Escola desativada',
        timestamp: new Date(),
      });
      return;
    }

    // 7. Adiciona usuário ao request
    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    logger.performance('auth_middleware', {
      duration: timer(),
      userId: user.id,
      cached: !!user,
    });

    next();
  } catch (error) {
    logger.error('Erro no middleware de autenticação', error, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      timestamp: new Date(),
    });
  }
};

// ===== MIDDLEWARE DE AUTORIZAÇÃO =====

/**
 * Middleware para verificar roles específicas
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    
    if (!user) {
      logger.auth('Autorização sem autenticação', { ip: req.ip, success: false });
      res.status(401).json({
        success: false,
        error: 'Autenticação requerida',
        timestamp: new Date(),
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      logger.auth('Acesso negado por role', {
        userId: user.id,
        ip: req.ip,
        userRole: user.role,
        requiredRoles: allowedRoles,
      });
      res.status(403).json({
        success: false,
        error: 'Acesso negado',
        timestamp: new Date(),
      });
      return;
    }

    next();
  };
};

/**
 * Middleware para verificar se o usuário pode acessar recursos da escola
 */
export const authorizeSchool = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as AuthenticatedRequest).user;
  const schoolId = req.params.schoolId || req.body.schoolId || req.query.schoolId;
  
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Autenticação requerida',
      timestamp: new Date(),
    });
    return;
  }

  // ADMIN pode acessar qualquer escola
  if (user.role === 'STAFF') {
    next();
    return;
  }

  // Outros usuários só podem acessar sua própria escola
  if (schoolId && schoolId !== user.schoolId) {
    logger.auth('Acesso negado por escola', {
      userId: user.id,
      ip: req.ip,
      userSchoolId: user.schoolId,
      requestedSchoolId: schoolId,
    });
    res.status(403).json({
      success: false,
      error: 'Acesso negado a esta escola',
      timestamp: new Date(),
    });
    return;
  }

  next();
};

// ===== MIDDLEWARE OPCIONAL =====

/**
 * Middleware de autenticação opcional (não falha se não autenticado)
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
      
      // Busca usuário no cache
      let user: any = await cacheManager.getUser(payload.userId);
      
      if (!user) {
        user = await prisma.user.findUnique({
          where: { id: payload.userId },
          include: {
            school: true,
          },
        });
        
        if (user && user.isActive) {
          await cacheManager.setUser(user.id, user, config.CACHE_TTL.MEDIUM);
        }
      }
      
      if (user && user.isActive && user.schoolId) {
        (req as AuthenticatedRequest).user = {
          id: user.id,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
        };
      }
    } catch (jwtError) {
      // Token inválido, mas não falha
      logger.debug('Token inválido em auth opcional', { error: jwtError });
    }
    
    next();
  } catch (error) {
    logger.error('Erro no middleware de auth opcional', error);
    next(); // Continua mesmo com erro
  }
};

// ===== UTILITÁRIOS =====

/**
 * Gera token JWT
 */
export const generateTokens = (user: {
  id: string;
  email: string;
  role: UserRole;
  schoolId: string;
}) => {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
  };

  const accessToken = jwt.sign(payload, config.JWT_SECRET as string, {
    expiresIn: '1h'
  });

  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET as string, {
    expiresIn: '7d'
  });

  return { accessToken, refreshToken };
};

/**
 * Verifica refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as JWTPayload;
  } catch (error) {
    logger.debug('Refresh token inválido', { error });
    return null;
  }
};

/**
 * Invalida cache do usuário (logout)
 */
export const invalidateUserCache = async (userId: string): Promise<void> => {
  await cacheManager.del(`user:${userId}`);
};

// ===== MIDDLEWARE DE RATE LIMITING POR USUÁRIO =====

/**
 * Rate limiting específico por usuário autenticado
 */
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    
    if (!user) {
      next();
      return;
    }
    
    const now = Date.now();
    const key = `user:${user.id}`;
    const userRequests = requests.get(key);
    
    if (!userRequests || now > userRequests.resetTime) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }
    
    if (userRequests.count >= maxRequests) {
      logger.rateLimit(req.ip || 'unknown', req.originalUrl, {
        userId: user.id,
        count: userRequests.count,
      });
      
      res.status(429).json({
        success: false,
        error: 'Muitas requisições. Tente novamente em alguns minutos.',
        timestamp: new Date(),
      });
      return;
    }
    
    userRequests.count++;
    next();
  };
};

export default {
  authenticate,
  authorize,
  authorizeSchool,
  optionalAuth,
  generateTokens,
  verifyRefreshToken,
  invalidateUserCache,
  userRateLimit,
};