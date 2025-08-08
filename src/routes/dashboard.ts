import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import errorHandler from '../middleware/errorHandler';
const { asyncHandler } = errorHandler;
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * @route   GET /api/dashboard/stats
 * @desc    Obtém estatísticas do dashboard
 * @access  Private
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const startTime = Date.now();
    
    try {
      // Buscar estatísticas em paralelo
      const [totalSchools, totalTests, totalQuestions, totalTeachers, activeTests] = await Promise.all([
        prisma.school.count(),
        prisma.test.count(),
        prisma.question.count(),
        prisma.user.count({ where: { role: 'TEACHER' } }),
        prisma.test.count({ where: { status: 'ACTIVE' } })
      ]);

      // Buscar atividades recentes (últimos 10 registros)
      const recentActivity = await prisma.test.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          school: true,
          createdBy: true
        }
      });

      // Mapear atividades para o formato esperado
      const formattedActivity = recentActivity.map(test => ({
        id: test.id,
        type: 'test_created' as const,
        title: `Teste criado: ${test.title}`,
        description: `Teste criado na escola ${test.school?.name || 'Escola não informada'}`,
        time: test.createdAt.toISOString(),
        user: test.createdBy.name
      }));

      const stats = {
        totalSchools,
        totalTests,
        totalQuestions,
        totalTeachers,
        activeTests,
        recentActivity: formattedActivity
      };

      logger.performance('Busca de estatísticas do dashboard', {
        userId: req.user!.id,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Erro ao buscar estatísticas do dashboard', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user!.id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

/**
 * @route   GET /api/dashboard/activity
 * @desc    Obtém atividades recentes
 * @access  Private
 */
router.get(
  '/activity',
  authenticate,
  asyncHandler(async (req: any, res: any) => {
    const { limit = 20 } = req.query;
    const startTime = Date.now();
    
    try {
      const activities = await prisma.test.findMany({
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          school: true,
          createdBy: true
        }
      });

      const formattedActivities = activities.map(test => ({
        id: test.id,
        type: 'test_created' as const,
        title: `Teste criado: ${test.title}`,
        description: `Teste criado na escola ${test.school?.name || 'Escola não informada'}`,
        time: test.createdAt.toISOString(),
        user: test.createdBy.name
      }));

      logger.performance('Busca de atividades recentes', {
        userId: req.user!.id,
        duration: Date.now() - startTime,
      });

      return res.json({
        success: true,
        data: formattedActivities,
      });
    } catch (error) {
      logger.error('Erro ao buscar atividades recentes', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId: req.user!.id,
      });

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  })
);

export default router;