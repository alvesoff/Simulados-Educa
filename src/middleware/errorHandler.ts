import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { ApiResponse } from '../types';

// ===== TIPOS DE ERRO =====

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
  details?: any;
  timestamp: Date;
  requestId?: string;
}

// ===== CLASSES DE ERRO CUSTOMIZADAS =====

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Recurso') {
    super(`${resource} não encontrado`, 404, true, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Não autorizado') {
    super(message, 401, true, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Acesso negado') {
    super(message, 403, true, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, true, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Muitas requisições') {
    super(message, 429, true, 'RATE_LIMIT');
  }
}

// ===== HANDLERS ESPECÍFICOS =====

/**
 * Handler para erros do Prisma
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002':
      // Violação de constraint única
      const field = error.meta?.target as string[] | undefined;
      const fieldName = field?.[0] || 'campo';
      return new ConflictError(
        `${fieldName} já existe`,
        { field: fieldName, value: error.meta?.target }
      );

    case 'P2025':
      // Registro não encontrado
      return new NotFoundError('Registro');

    case 'P2003':
      // Violação de foreign key
      return new ValidationError(
        'Referência inválida',
        { field: error.meta?.field_name }
      );

    case 'P2014':
      // Violação de relação
      return new ValidationError(
        'Operação inválida devido a relações existentes'
      );

    case 'P1008':
      // Timeout de operação
      return new AppError(
        'Operação demorou muito para ser concluída',
        408,
        true,
        'TIMEOUT'
      );

    case 'P1001':
      // Não consegue conectar ao banco
      return new AppError(
        'Erro de conexão com o banco de dados',
        503,
        false,
        'DATABASE_CONNECTION'
      );

    default:
      return new AppError(
        'Erro interno do banco de dados',
        500,
        false,
        'DATABASE_ERROR',
        { prismaCode: error.code }
      );
  }
}

/**
 * Handler para erros de validação Zod
 */
function handleZodError(error: ZodError): ValidationError {
  const details = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  return new ValidationError(
    'Dados de entrada inválidos',
    details
  );
}

/**
 * Handler para erros de JWT
 */
function handleJWTError(error: Error): UnauthorizedError {
  if (error.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token expirado');
  }
  if (error.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Token inválido');
  }
  return new UnauthorizedError('Erro de autenticação');
}

/**
 * Handler para erros de sintaxe JSON
 */
function handleSyntaxError(error: SyntaxError): ValidationError {
  return new ValidationError(
    'JSON inválido na requisição',
    { message: error.message }
  );
}

// ===== MIDDLEWARE PRINCIPAL =====

/**
 * Middleware de tratamento de erros
 * Deve ser o último middleware da aplicação
 */
export const errorHandler = (
  error: Error | CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let appError: AppError;

  // Converte diferentes tipos de erro para AppError
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error);
  } else if (error instanceof ZodError) {
    appError = handleZodError(error);
  } else if (error.name?.includes('JWT') || error.name?.includes('Token')) {
    appError = handleJWTError(error);
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = handleSyntaxError(error);
  } else {
    // Erro não tratado
    appError = new AppError(
      config.IS_PRODUCTION ? 'Erro interno do servidor' : error.message,
      500,
      false,
      'INTERNAL_ERROR'
    );
  }

  // Gera ID único para a requisição (para rastreamento)
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Log do erro
  const errorLog = {
    requestId,
    message: appError.message,
    statusCode: appError.statusCode,
    code: appError.code,
    stack: appError.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    body: req.method !== 'GET' ? req.body : undefined,
    query: req.query,
    params: req.params,
  };

  // Log baseado na severidade
  if (appError.statusCode >= 500) {
    logger.error('Erro interno do servidor', appError, errorLog);
  } else if (appError.statusCode >= 400) {
    logger.warn('Erro de cliente', errorLog);
  } else {
    logger.info('Erro informativo', errorLog);
  }

  // Resposta para o cliente
  const errorResponse: ErrorResponse = {
    success: false,
    error: appError.message,
    timestamp: new Date(),
    requestId: config.IS_DEVELOPMENT ? (requestId || 'unknown') : 'unknown',
  };

  // Adiciona detalhes apenas em desenvolvimento ou para erros operacionais
  if (config.IS_DEVELOPMENT || appError.isOperational) {
    if (appError.details) {
      errorResponse.details = appError.details;
    }
    if (appError.code) {
      (errorResponse as any).code = appError.code;
    }
  }

  // Adiciona stack trace apenas em desenvolvimento
  if (config.IS_DEVELOPMENT && appError.stack) {
    (errorResponse as any).stack = appError.stack;
  }

  res.status(appError.statusCode).json(errorResponse);
};

// ===== MIDDLEWARE DE CAPTURA DE ERROS ASSÍNCRONOS =====

/**
 * Wrapper para capturar erros em funções assíncronas
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, _res, next)).catch(next);
  };
};

// ===== MIDDLEWARE DE ROTA NÃO ENCONTRADA =====

/**
 * Middleware para rotas não encontradas
 * Deve ser usado antes do errorHandler
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const error = new NotFoundError(`Rota ${req.originalUrl}`);
  next(error);
};

// ===== HANDLERS DE PROCESSO =====

/**
 * Handler para erros não capturados
 */
export const handleUncaughtException = (error: Error): void => {
  logger.error('Uncaught Exception', error, {
    type: 'UNCAUGHT_EXCEPTION',
    pid: process.pid,
  });

  // Graceful shutdown
  process.exit(1);
};

/**
 * Handler para promises rejeitadas não tratadas
 */
export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.error('Unhandled Rejection', reason, {
    type: 'UNHANDLED_REJECTION',
    promise: promise.toString(),
    pid: process.pid,
  });

  // Graceful shutdown
  process.exit(1);
};

// ===== UTILITÁRIOS =====

/**
 * Cria uma resposta de erro padronizada
 */
export const createErrorResponse = (
  message: string,
  _statusCode: number = 500,
  details?: any
): ApiResponse => {
  return {
    success: false,
    error: message,
    timestamp: new Date(),
    ...(details && { data: details }),
  };
};

/**
 * Valida se um erro é operacional
 */
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Middleware de validação de entrada
 */
export const validateRequest = (
  schema: any,
  property: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req[property]);
      req[property] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(handleZodError(error));
      } else {
        next(new ValidationError('Erro de validação'));
      }
    }
  };
};

// ===== SETUP DE HANDLERS GLOBAIS =====

/**
 * Configura handlers globais de erro
 */
export const setupGlobalErrorHandlers = (): void => {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);

  // Handler para SIGTERM (Render)
  process.on('SIGTERM', () => {
    logger.system('SIGTERM recebido, iniciando graceful shutdown');
    process.exit(0);
  });

  // Handler para SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.system('SIGINT recebido, iniciando graceful shutdown');
    process.exit(0);
  });
};

export default {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  setupGlobalErrorHandlers,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  createErrorResponse,
  isOperationalError,
  validateRequest,
};