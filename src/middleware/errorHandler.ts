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

export class DuplicateError extends AppError {
  constructor(resource: string, field?: string) {
    const friendlyField = field ? getFieldName(field) : '';
    const message = friendlyField 
      ? `${resource} com este ${friendlyField} já existe`
      : `${resource} já existe`;
    
    super(message, 409, true, 'DUPLICATE', {
      resource,
      field,
      friendlyField,
      action: 'Use um valor diferente'
    });
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'E-mail ou senha incorretos') {
    super(message, 401, true, 'INVALID_CREDENTIALS', {
      action: 'Verifique suas credenciais e tente novamente'
    });
  }
}

export class ExpiredTokenError extends AppError {
  constructor(tokenType: string = 'Token') {
    super(`${tokenType} expirado`, 401, true, 'EXPIRED_TOKEN', {
      tokenType,
      action: 'Faça login novamente'
    });
  }
}

export class InvalidTokenError extends AppError {
  constructor(tokenType: string = 'Token') {
    super(`${tokenType} inválido`, 401, true, 'INVALID_TOKEN', {
      tokenType,
      action: 'Faça login novamente'
    });
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(requiredRole?: string, action?: string) {
    const message = requiredRole 
      ? `Acesso negado. Permissão de ${requiredRole} necessária`
      : 'Você não tem permissão para realizar esta ação';
    
    super(message, 403, true, 'INSUFFICIENT_PERMISSIONS', {
      requiredRole,
      action: action || 'Entre em contato com um administrador'
    });
  }
}

export class ResourceInUseError extends AppError {
  constructor(resource: string, dependents?: string[]) {
    const message = dependents && dependents.length > 0
      ? `Não é possível remover ${resource} pois está sendo usado por: ${dependents.join(', ')}`
      : `Não é possível remover ${resource} pois está sendo usado`;
    
    super(message, 409, true, 'RESOURCE_IN_USE', {
      resource,
      dependents,
      action: 'Remova as dependências primeiro'
    });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, rule: string, details?: any) {
    super(message, 422, true, 'BUSINESS_RULE_VIOLATION', {
      rule,
      ...details,
      action: 'Verifique as regras de negócio'
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, operation?: string) {
    const message = operation 
      ? `Erro no serviço ${service} durante ${operation}`
      : `Erro no serviço externo ${service}`;
    
    super(message, 503, false, 'EXTERNAL_SERVICE_ERROR', {
      service,
      operation,
      action: 'Tente novamente em alguns instantes'
    });
  }
}

// ===== MAPEAMENTO DE CAMPOS PARA MENSAGENS AMIGÁVEIS =====

const FIELD_TRANSLATIONS: Record<string, string> = {
  email: 'E-mail',
  name: 'Nome',
  code: 'Código',
  password: 'Senha',
  schoolId: 'Escola',
  userId: 'Usuário',
  testId: 'Teste',
  questionId: 'Questão',
  studentName: 'Nome do estudante',
  subject: 'Matéria',
  topic: 'Tópico',
  difficulty: 'Dificuldade',
  title: 'Título',
  description: 'Descrição',
  address: 'Endereço',
  phone: 'Telefone',
};

const getFieldName = (field: string): string => {
  return FIELD_TRANSLATIONS[field] || field;
};

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
      
      return new DuplicateError('Registro', fieldName);

    case 'P2025':
      // Registro não encontrado
      const model = error.meta?.modelName || 'Registro';
      return new NotFoundError(`${model} não encontrado ou foi removido`);

    case 'P2003':
      // Violação de foreign key
      const fkField = error.meta?.field_name as string;
      const friendlyFkField = getFieldName(fkField || 'referência');
      return new ValidationError(
        `${friendlyFkField} inválido ou não existe`,
        { 
          field: fkField, 
          friendlyField: friendlyFkField,
          constraint: 'foreign_key',
          action: 'Verifique se o valor selecionado é válido'
        }
      );

    case 'P2014':
      // Violação de relação
      return new ValidationError(
        'Não é possível realizar esta operação pois existem registros relacionados',
        {
          constraint: 'relation',
          action: 'Remova os registros relacionados primeiro'
        }
      );

    case 'P1008':
      // Timeout de operação
      return new AppError(
        'A operação demorou muito para ser concluída. Tente novamente.',
        408,
        true,
        'TIMEOUT',
        { action: 'Tente novamente em alguns instantes' }
      );

    case 'P1001':
      // Não consegue conectar ao banco
      return new AppError(
        'Erro de conexão com o banco de dados. Tente novamente.',
        503,
        false,
        'DATABASE_CONNECTION',
        { action: 'Aguarde alguns instantes e tente novamente' }
      );

    case 'P2004':
      // Constraint check falhou
      return new ValidationError(
        'Os dados fornecidos não atendem aos critérios de validação',
        {
          constraint: 'check',
          action: 'Verifique os dados e tente novamente'
        }
      );

    case 'P2011':
      // Null constraint violation
      const nullField = error.meta?.constraint as string;
      const friendlyNullField = getFieldName(nullField || 'campo');
      return new ValidationError(
        `${friendlyNullField} é obrigatório`,
        {
          field: nullField,
          friendlyField: friendlyNullField,
          constraint: 'required',
          action: 'Preencha o campo obrigatório'
        }
      );

    case 'P2012':
      // Missing required value
      const missingField = error.meta?.field as string;
      const friendlyMissingField = getFieldName(missingField || 'campo');
      return new ValidationError(
        `${friendlyMissingField} é obrigatório`,
        {
          field: missingField,
          friendlyField: friendlyMissingField,
          constraint: 'required',
          action: 'Preencha o campo obrigatório'
        }
      );

    default:
      return new AppError(
        'Erro interno do banco de dados. Nossa equipe foi notificada.',
        500,
        false,
        'DATABASE_ERROR',
        { 
          prismaCode: error.code,
          action: 'Tente novamente. Se o problema persistir, entre em contato conosco.'
        }
      );
  }
}

/**
 * Handler para erros de validação Zod
 */
function handleZodError(error: ZodError): ValidationError {
  const details = error.errors.map(err => {
    const fieldPath = err.path.join('.');
    const friendlyField = getFieldName(fieldPath);
    
    // Mensagens mais específicas baseadas no tipo de erro
    let friendlyMessage = err.message;
    
    switch (err.code) {
      case 'invalid_type':
        if (err.expected === 'string' && err.received === 'undefined') {
          friendlyMessage = `${friendlyField} é obrigatório`;
        } else {
          friendlyMessage = `${friendlyField} deve ser do tipo ${err.expected}`;
        }
        break;
      case 'too_small':
        if (err.type === 'string') {
          friendlyMessage = `${friendlyField} deve ter pelo menos ${err.minimum} caracteres`;
        } else {
          friendlyMessage = `${friendlyField} deve ser maior que ${err.minimum}`;
        }
        break;
      case 'too_big':
        if (err.type === 'string') {
          friendlyMessage = `${friendlyField} deve ter no máximo ${err.maximum} caracteres`;
        } else {
          friendlyMessage = `${friendlyField} deve ser menor que ${err.maximum}`;
        }
        break;
      case 'invalid_string':
        if (err.validation === 'email') {
          friendlyMessage = `${friendlyField} deve ser um e-mail válido`;
        } else if (err.validation === 'uuid') {
          friendlyMessage = `${friendlyField} deve ser um ID válido`;
        } else {
          friendlyMessage = `${friendlyField} tem formato inválido`;
        }
        break;
      case 'invalid_enum_value':
        friendlyMessage = `${friendlyField} deve ser um dos valores: ${err.options?.join(', ')}`;
        break;
      case 'custom':
        friendlyMessage = err.message;
        break;
      default:
        friendlyMessage = `${friendlyField}: ${err.message}`;
    }
    
    const detail: any = {
      field: fieldPath,
      friendlyField,
      message: friendlyMessage,
      code: err.code,
    };
    
    // Adiciona propriedades opcionais apenas se existirem
    if ('received' in err) detail.received = err.received;
    if ('expected' in err) detail.expected = err.expected;
    
    return detail;
  });

  // Cria uma mensagem principal mais amigável
  const mainMessage = details.length === 1 
    ? details[0].message
    : `Foram encontrados ${details.length} erros nos dados fornecidos`;

  return new ValidationError(
    mainMessage,
    {
      errors: details,
      count: details.length,
      action: 'Corrija os campos indicados e tente novamente'
    }
  );
}

/**
 * Handler para erros de JWT
 */
function handleJWTError(error: Error): AppError {
  if (error.name === 'TokenExpiredError') {
    return new ExpiredTokenError('Token de acesso');
  }
  if (error.name === 'JsonWebTokenError') {
    return new InvalidTokenError('Token de acesso');
  }
  return new AppError('Erro de autenticação', 401, true, 'AUTH_ERROR', {
    action: 'Verifique suas credenciais'
  });
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

  // Sempre adiciona o código do erro para facilitar o tratamento no frontend
  if (appError.code) {
    (errorResponse as any).code = appError.code;
  }

  // Adiciona detalhes para erros operacionais (que são seguros para mostrar)
  if (appError.isOperational && appError.details) {
    errorResponse.details = appError.details;
  }

  // Em desenvolvimento, adiciona mais informações para debug
  if (config.IS_DEVELOPMENT) {
    if (appError.details && !appError.isOperational) {
      errorResponse.details = appError.details;
    }
    if (appError.stack) {
      (errorResponse as any).stack = appError.stack;
    }
    // Adiciona informações da requisição para debug
    (errorResponse as any).debug = {
      url: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    };
  }

  // Adiciona sugestões de ação quando disponíveis
  if (appError.details?.action) {
    (errorResponse as any).action = appError.details.action;
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