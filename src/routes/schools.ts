import { Router } from 'express';
import { UserRole, PrismaClient } from '@prisma/client';
import schoolService from '../services/schoolService';
import { authenticate } from '../middleware/auth';
import errorHandler from '../middleware/errorHandler';
const { validateRequest, asyncHandler } = errorHandler;
import { generalRateLimit, authRateLimit } from '../middleware/rateLimiting';
import { z } from 'zod';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();


// Estende o tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        schoolId: string;
      };
    }
  }
}

const router = Router();

// ===== SCHEMAS DE VALIDAÇÃO =====

const createSchoolSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
    code: z.string().min(2, 'Código deve ter pelo menos 2 caracteres').max(20),
    address: z.string().max(255).optional(),
  }),
});

const updateSchoolSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).optional(),
    code: z.string().min(2, 'Código deve ter pelo menos 2 caracteres').max(20).optional(),
    address: z.string().max(255).optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().uuid('ID deve ser um UUID válido'),
  }),
});

const schoolParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID deve ser um UUID válido'),
  }),
});

const schoolCodeParamsSchema = z.object({
  params: z.object({
    code: z.string().min(1, 'Código é obrigatório'),
  }),
});

const listSchoolsQuerySchema = z.object({
  query: z.object({
    includeInactive: z.string().optional().transform(val => val === 'true'),
  }).optional(),
});

// ===== ROTAS =====

/**
 * @route POST /api/schools
 * @desc Criar uma nova escola
 * @access Private (Admin apenas)
 */
router.post(
  '/',
  authRateLimit,
  authenticate,
  validateRequest(createSchoolSchema),
  async (req, res, next) => {
    try {
      // Verifica se o usuário é admin
      if (!req.user || req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores podem criar escolas.',
        });
      }

      const { name, code, address } = req.body;

      logger.system('Tentativa de criação de escola', {
        userId: req.user.id,
        name,
        code,
      });

      const school = await schoolService.createSchool({
        name,
        code,
        address,
      });

      res.status(201).json({
        success: true,
        message: 'Escola criada com sucesso',
        data: school,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @route GET /api/schools
 * @desc Listar todas as escolas
 * @access Private (Admin e Staff)
 */
router.get(
  '/',
  generalRateLimit,
  authenticate,
  validateRequest(listSchoolsQuerySchema),
  async (req, res, next) => {
    try {
      // Verifica se o usuário tem permissão
      if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.STAFF)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores e staff podem listar escolas.',
        });
      }

      const { includeInactive } = req.query || {};

      logger.system('Listagem de escolas solicitada', {
        userId: req.user.id,
        includeInactive,
      });

      const includeInactiveBoolean = typeof includeInactive === 'string' ? includeInactive === 'true' : false;
      const schools = await schoolService.listSchools(includeInactiveBoolean);

      res.json({
        success: true,
        message: 'Escolas listadas com sucesso',
        data: schools,
        count: schools.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @route GET /api/schools/active
 * @desc Listar apenas escolas ativas (para uso público)
 * @access Public
 */
router.get('/active', generalRateLimit, async (_req, res, next) => {
  try {
    logger.system('Listagem de escolas ativas solicitada');

    const schools = await schoolService.listSchools(false);

    // Remove informações sensíveis para acesso público
    const publicSchools = schools.map(school => ({
      id: school.id,
      name: school.name,
      code: school.code,
    }));

    res.json({
      success: true,
      message: 'Escolas ativas listadas com sucesso',
      data: publicSchools,
      count: publicSchools.length,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @route GET /api/schools/:id
 * @desc Buscar escola por ID
 * @access Private (Admin e Staff)
 */
router.get(
  '/:id',
  generalRateLimit,
  authenticate,
  validateRequest(schoolParamsSchema),
  async (req, res, next) => {
    try {
      // Verifica se o usuário tem permissão
      if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.STAFF)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores e staff podem visualizar detalhes de escolas.',
        });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da escola é obrigatório',
        });
      }

      logger.system('Busca de escola por ID solicitada', {
        userId: req.user.id,
        schoolId: id,
      });

      const school = await schoolService.getSchoolById(id);

      res.json({
        success: true,
        message: 'Escola encontrada com sucesso',
        data: school,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @route GET /api/schools/code/:code
 * @desc Buscar escola por código
 * @access Public
 */
router.get(
  '/code/:code',
  generalRateLimit,
  validateRequest(schoolCodeParamsSchema),
  async (req, res, next) => {
    try {
      const { code } = req.params;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Código da escola é obrigatório',
        });
      }

      logger.system('Busca de escola por código solicitada', { code });

      const school = await schoolService.getSchoolByCode(code);

      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'Escola não encontrada',
        });
      }

      // Remove informações sensíveis para acesso público
      const publicSchool = {
        id: school.id,
        name: school.name,
        code: school.code,
        isActive: school.isActive,
      };

      res.json({
        success: true,
        message: 'Escola encontrada com sucesso',
        data: publicSchool,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @route PUT /api/schools/:id
 * @desc Atualizar uma escola
 * @access Private (Admin apenas)
 */
router.put(
  '/:id',
  authRateLimit,
  authenticate,
  validateRequest(updateSchoolSchema),
  async (req, res, next) => {
    try {
      // Verifica se o usuário é admin
      if (!req.user || req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores podem atualizar escolas.',
        });
      }

      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da escola é obrigatório',
        });
      }

      logger.system('Tentativa de atualização de escola', {
        userId: req.user.id,
        schoolId: id,
        updateData,
      });

      const school = await schoolService.updateSchool(id, updateData);

      res.json({
        success: true,
        message: 'Escola atualizada com sucesso',
        data: school,
      });
      } catch (error) {
        return next(error);
      }
    }
  );

/**
 * @route PATCH /api/schools/:id/deactivate
 * @desc Desativar uma escola
 * @access Private (Admin apenas)
 */
router.patch(
  '/:id/deactivate',
  authRateLimit,
  authenticate,
  validateRequest(schoolParamsSchema),
  async (req, res, next) => {
    try {
      // Verifica se o usuário é admin
      if (!req.user || req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores podem desativar escolas.',
        });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da escola é obrigatório',
        });
      }

      logger.system('Tentativa de desativação de escola', {
        userId: req.user.id,
        schoolId: id,
      });

      const school = await schoolService.deactivateSchool(id);

      res.json({
        success: true,
        message: 'Escola desativada com sucesso',
        data: school,
      });
      } catch (error) {
        return next(error);
      }
    }
  );

/**
 * @route PATCH /api/schools/:id/reactivate
 * @desc Reativar uma escola
 * @access Private (Admin apenas)
 */
router.patch(
  '/:id/reactivate',
  authRateLimit,
  authenticate,
  validateRequest(schoolParamsSchema),
  async (req, res, next) => {
    try {
      // Verifica se o usuário é admin
      if (!req.user || req.user.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores podem reativar escolas.',
        });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da escola é obrigatório',
        });
      }

      logger.system('Tentativa de reativação de escola', {
        userId: req.user.id,
        schoolId: id,
      });

      const school = await schoolService.reactivateSchool(id);

      res.json({
        success: true,
        message: 'Escola reativada com sucesso',
        data: school,
      });
      } catch (error) {
        return next(error);
      }
    }
  );

/**
 * @route GET /api/schools/:id/users
 * @desc Obter usuários de uma escola
 * @access Private (Admin e Staff)
 */
router.get(
  '/:id/users',
  generalRateLimit,
  authenticate,
  validateRequest(z.object({
    params: z.object({
      id: z.string().uuid('ID deve ser um UUID válido'),
    }),
    query: z.object({
      page: z.string().optional().transform(val => val ? parseInt(val) : 1),
      limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
      search: z.string().optional(),
      role: z.enum(['ADMIN', 'STAFF', 'TEACHER', 'STUDENT']).optional(),
      isActive: z.string().optional().transform(val => val === 'true'),
    }).optional(),
  })),
  asyncHandler(async (req, res) => {
    // Verifica se o usuário tem permissão
    if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'STAFF')) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores e staff podem listar usuários.',
      });
    }

    const { id } = req.params;
    const { page = 1, limit = 10, search, role, isActive } = req.query || {};
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const startTime = Date.now();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da escola é obrigatório',
      });
    }

    try {
      // Verificar se a escola existe
      const school = await prisma.school.findUnique({
        where: { id }
      });

      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'Escola não encontrada',
        });
      }

      // Construir filtros
      const where: any = { schoolId: id };
      
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Buscar usuários com paginação
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            school: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      logger.performance('Listagem de usuários por escola', {
        userId: req.user.id,
        schoolId: id,
        filters: { role, isActive, search },
        resultCount: users.length,
        duration: Date.now() - startTime,
      });

      return res.json({
         success: true,
         data: {
           items: users,
           pagination: {
             page,
             limit,
             total,
             totalPages
           }
         },
       });
    } catch (error) {
      logger.error('Erro ao listar usuários da escola', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
        schoolId: id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

export default router;