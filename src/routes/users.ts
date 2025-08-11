import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler, validateRequest } = errorHandler;
import { generalRateLimit, authRateLimit } from '../middleware/rateLimiting';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ===== SCHEMAS DE VALIDAÇÃO =====

const listUsersQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  role: z.enum(['ADMIN', 'STAFF', 'TEACHER', 'STUDENT']).optional(),
  schoolId: z.string().cuid().optional(),
  isActive: z.string().optional().transform(val => val === 'true'),
  search: z.string().optional(),
});

const userParamsSchema = z.object({
  id: z.string().uuid('ID deve ser um UUID válido'),
});

const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').max(128),
  role: z.enum(['ADMIN', 'STAFF', 'TEACHER', 'STUDENT']),
  schoolId: z.string().cuid('Escola deve ser um ID válido').optional(),
  isActive: z.boolean().optional().default(true),
});

const updateUserBodySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).optional(),
  email: z.string().email('Email inválido').max(255).optional(),
  role: z.enum(['ADMIN', 'STAFF', 'TEACHER', 'STUDENT']).optional(),
  schoolId: z.string().cuid('Escola deve ser um ID válido').optional(),
  isActive: z.boolean().optional(),
});

const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// ===== ROTAS =====

/**
 * @route GET /api/users
 * @desc Listar usuários com filtros
 * @access Private (Admin e Staff)
 */
router.get(
  '/',
  generalRateLimit,
  authenticate,
  validateRequest(listUsersQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    // Verifica se o usuário tem permissão
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.STAFF)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores e staff podem listar usuários.',
      });
    }

    const startTime = Date.now();
    const { page = 1, limit = 10, role, schoolId, isActive, search } = req.query || {};
    
    // Converter para números
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;

    try {
      // Construir filtros
      const where: any = {};
      
      if (role) where.role = role;
      if (schoolId) where.schoolId = schoolId;
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
          include: {
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

      // Remover senhas dos resultados
      const safeUsers = users.map(user => {
        const { password, ...safeUser } = user;
        return safeUser;
      });

      const totalPages = Math.ceil(total / limitNum);

      logger.performance('Listagem de usuários', {
        userId: req.user.id,
        filters: { role, schoolId, isActive, search },
        resultCount: users.length,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        data: {
          items: safeUsers,
          pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages
        }
        },
      });
    } catch (error) {
      logger.error('Erro ao listar usuários', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route GET /api/users/:id
 * @desc Obter usuário por ID
 * @access Private (Admin, Staff ou próprio usuário)
 */
router.get(
  '/:id',
  generalRateLimit,
  authenticate,
  validateRequest(userParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const startTime = Date.now();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID do usuário é obrigatório',
      });
    }

    // Verifica se o usuário tem permissão (admin, staff ou próprio usuário)
    if (!req.user || 
        (req.user.role !== UserRole.ADMIN && 
         req.user.role !== UserRole.STAFF && 
         req.user.id !== id)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado.',
      });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          school: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado',
        });
      }

      // Remover senha do resultado
      const { password, ...safeUser } = user;

      logger.performance('Busca de usuário por ID', {
        userId: req.user.id,
        targetUserId: id,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        data: safeUser,
      });
    } catch (error) {
      logger.error('Erro ao buscar usuário', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
        targetUserId: id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route POST /api/users
 * @desc Criar novo usuário
 * @access Private (Admin apenas)
 */
router.post(
  '/',
  authRateLimit,
  authenticate,
  validateRequest(createUserSchema, 'body'),
  asyncHandler(async (req, res) => {
    // Verifica se o usuário é admin ou staff
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.STAFF)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores e staff podem criar usuários.',
      });
    }

    const startTime = Date.now();
    const { name, email, password, role, schoolId, isActive } = req.body;

    // LOG TEMPORÁRIO: Verificar dados recebidos
    console.log('🔍 DEBUG - Dados recebidos na criação de usuário:');
    console.log('📝 Body completo:', JSON.stringify(req.body, null, 2));
    console.log('🏫 schoolId recebido:', schoolId);
    console.log('📊 Tipo do schoolId:', typeof schoolId);
    console.log('📏 Tamanho do schoolId:', schoolId ? schoolId.length : 'undefined/null');

    try {
      // Verificar se email já existe
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email já está em uso',
        });
      }

      // Verificar se escola existe (se fornecida)
      if (schoolId) {
        const school = await prisma.school.findUnique({
          where: { id: schoolId }
        });

        if (!school) {
          return res.status(400).json({
            success: false,
            message: 'Escola não encontrada',
          });
        }
      }

      // Hash da senha
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(password, 12);

      // Criar usuário
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role,
          schoolId,
          isActive
        },
        include: {
          school: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        }
      });

      // Remover senha do resultado
      const { password: _, ...safeUser } = user;

      logger.system('Usuário criado', {
        userId: req.user.id,
        newUserId: user.id,
        email: user.email,
        role: user.role,
        duration: Date.now() - startTime,
      });

      return res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso',
        data: safeUser,
      });
    } catch (error) {
      logger.error('Erro ao criar usuário', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
        email,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route PUT /api/users/:id
 * @desc Atualizar usuário
 * @access Private (Admin apenas)
 */
router.put(
  '/:id',
  authRateLimit,
  authenticate,
  validateRequest(userParamsSchema, 'params'),
  validateRequest(updateUserBodySchema, 'body'),
  asyncHandler(async (req, res) => {
    // Verifica se o usuário é admin
    if (!req.user || req.user.role !== UserRole.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores podem atualizar usuários.',
      });
    }

    const { id } = req.params;
    const updateData = req.body;
    const startTime = Date.now();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID do usuário é obrigatório',
      });
    }

    try {
      // Verificar se usuário existe
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado',
        });
      }

      // Verificar se email já existe (se sendo alterado)
      if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
          where: { email: updateData.email }
        });

        if (emailExists) {
          return res.status(400).json({
            success: false,
            message: 'Email já está em uso',
          });
        }
      }

      // Verificar se escola existe (se fornecida)
      if (updateData.schoolId) {
        const school = await prisma.school.findUnique({
          where: { id: updateData.schoolId }
        });

        if (!school) {
          return res.status(400).json({
            success: false,
            message: 'Escola não encontrada',
          });
        }
      }

      // Atualizar usuário
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          school: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        }
      });

      // Remover senha do resultado
      const { password, ...safeUser } = user;

      logger.system('Usuário atualizado', {
        userId: req.user.id,
        targetUserId: id,
        updateData,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        message: 'Usuário atualizado com sucesso',
        data: safeUser,
      });
    } catch (error) {
      logger.error('Erro ao atualizar usuário', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
        targetUserId: id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route DELETE /api/users/:id
 * @desc Deletar usuário
 * @access Private (Admin apenas)
 */
router.delete(
  '/:id',
  authRateLimit,
  authenticate,
  validateRequest(userParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    // Verifica se o usuário é admin
    if (!req.user || req.user.role !== UserRole.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores podem deletar usuários.',
      });
    }

    const { id } = req.params;
    const startTime = Date.now();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID do usuário é obrigatório',
      });
    }

    try {
      // Verificar se usuário existe
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado',
        });
      }

      // Não permitir deletar o próprio usuário
      if (id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Não é possível deletar seu próprio usuário',
        });
      }

      // Deletar usuário
      await prisma.user.delete({
        where: { id }
      });

      logger.system('Usuário deletado', {
        userId: req.user.id,
        deletedUserId: id,
        deletedUserEmail: existingUser.email,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        message: 'Usuário deletado com sucesso',
      });
    } catch (error) {
      logger.error('Erro ao deletar usuário', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
        targetUserId: id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route PATCH /api/users/:id/status
 * @desc Alternar status ativo/inativo do usuário
 * @access Private (Admin apenas)
 */
router.patch(
  '/:id/status',
  authRateLimit,
  authenticate,
  validateRequest(userParamsSchema, 'params'),
  validateRequest(updateUserStatusSchema, 'body'),
  asyncHandler(async (req, res) => {
    // Verifica se o usuário é admin
    if (!req.user || req.user.role !== UserRole.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores podem alterar status de usuários.',
      });
    }

    const { id } = req.params;
    const { isActive } = req.body;
    const startTime = Date.now();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID do usuário é obrigatório',
      });
    }

    try {
      // Verificar se usuário existe
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado',
        });
      }

      // Não permitir desativar o próprio usuário
      if (id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Não é possível alterar o status do seu próprio usuário',
        });
      }

      // Atualizar status
      const user = await prisma.user.update({
        where: { id },
        data: { isActive },
        include: {
          school: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        }
      });

      // Remover senha do resultado
      const { password, ...safeUser } = user;

      logger.system('Status do usuário alterado', {
        userId: req.user.id,
        targetUserId: id,
        newStatus: user.isActive,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        message: `Usuário ${user.isActive ? 'ativado' : 'desativado'} com sucesso`,
        data: safeUser,
      });
    } catch (error) {
      logger.error('Erro ao alterar status do usuário', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
        targetUserId: id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route GET /api/users/stats
 * @desc Obter estatísticas de usuários
 * @access Private (Admin e Staff)
 */
router.get(
  '/stats',
  generalRateLimit,
  authenticate,
  asyncHandler(async (req, res) => {
    // Verifica se o usuário tem permissão
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.STAFF)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Apenas administradores e staff podem ver estatísticas.',
      });
    }

    const startTime = Date.now();

    try {
      const [totalUsers, activeUsers, usersByRole, recentUsers] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.groupBy({
          by: ['role'],
          _count: { role: true }
        }),
        prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Últimos 30 dias
            }
          }
        })
      ]);

      const roleStats = usersByRole.reduce((acc, item) => {
        acc[item.role] = item._count.role;
        return acc;
      }, {} as Record<string, number>);

      logger.performance('Estatísticas de usuários', {
        userId: req.user.id,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        data: {
          totalUsers,
          activeUsers,
          inactiveUsers: totalUsers - activeUsers,
          recentUsers,
          roleStats
        },
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas de usuários', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user.id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

export default router;