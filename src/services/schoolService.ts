import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});
import { logger } from '../utils/logger';
import { 
  NotFoundError, 
  DuplicateError,
  BusinessRuleError 
} from '../middleware/errorHandler';
import { z } from 'zod';

// ===== TIPOS E INTERFACES =====

interface SchoolCreateRequest {
  name: string;
  code: string;
  address?: string;
}

interface SchoolUpdateRequest {
  name?: string;
  code?: string;
  address?: string;
  isActive?: boolean;
}

interface SchoolResponse {
  id: string;
  name: string;
  code: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    users: number;
    tests: number;
    studentAttempts: number;
  };
}

// ===== SCHEMAS DE VALIDAÇÃO =====

const schoolCreateSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  code: z.string().min(2, 'Código deve ter pelo menos 2 caracteres').max(20),
  address: z.string().max(255).optional(),
});

const schoolUpdateSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).optional(),
  code: z.string().min(2, 'Código deve ter pelo menos 2 caracteres').max(20).optional(),
  address: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
});

// ===== CLASSE PRINCIPAL =====

class SchoolService {
  /**
   * Cria uma nova escola
   */
  async createSchool(data: SchoolCreateRequest): Promise<SchoolResponse> {
    try {
      logger.system('Criando nova escola', { name: data.name, code: data.code });

      // Valida dados de entrada
      const validatedData = schoolCreateSchema.parse(data);

      // Verifica se já existe escola com o mesmo código
      const existingSchool = await prisma.school.findUnique({
        where: { code: validatedData.code },
      });

      if (existingSchool) {
        throw new DuplicateError('Escola', 'code');
      }

      // Cria a escola
      const school = await prisma.school.create({
        data: {
          name: validatedData.name.trim(),
          code: validatedData.code.trim().toUpperCase(),
          address: validatedData.address?.trim() || null,
        },
      });

      logger.system('Escola criada com sucesso', {
        schoolId: school.id,
        name: school.name,
        code: school.code,
      });

      return this.formatSchoolResponse(school);
    } catch (error) {
      logger.error('Erro ao criar escola', error, { name: data.name, code: data.code });
      throw error;
    }
  }

  /**
   * Lista todas as escolas
   */
  async listSchools(includeInactive = false): Promise<SchoolResponse[]> {
    try {
      logger.system('Listando escolas', { includeInactive });

      const schools = await prisma.school.findMany({
        where: includeInactive ? {} : { isActive: true },
        include: {
          _count: {
            select: {
              users: true,
              tests: true,
              studentAttempts: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      return schools.map((school: any) => this.formatSchoolResponse(school));
    } catch (error) {
      logger.error('Erro ao listar escolas', error);
      throw error;
    }
  }

  /**
   * Busca escola por ID
   */
  async getSchoolById(id: string): Promise<SchoolResponse> {
    try {
      logger.system('Buscando escola por ID', { schoolId: id });

      const school = await prisma.school.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              users: true,
              tests: true,
              studentAttempts: true,
            },
          },
        },
      });

      if (!school) {
        throw new NotFoundError('Escola');
      }

      return this.formatSchoolResponse(school);
    } catch (error) {
      logger.error('Erro ao buscar escola', error, { schoolId: id });
      throw error;
    }
  }

  /**
   * Atualiza uma escola
   */
  async updateSchool(id: string, data: SchoolUpdateRequest): Promise<SchoolResponse> {
    try {
      logger.system('Atualizando escola', { schoolId: id, data });

      // Valida dados de entrada
      const validatedData = schoolUpdateSchema.parse(data);

      // Verifica se a escola existe
      const existingSchool = await prisma.school.findUnique({
        where: { id },
      });

      if (!existingSchool) {
        throw new NotFoundError('Escola');
      }

      // Se está alterando o código, verifica se não existe outro com o mesmo código
      if (validatedData.code && validatedData.code !== existingSchool.code) {
        const schoolWithSameCode = await prisma.school.findUnique({
          where: { code: validatedData.code },
        });

        if (schoolWithSameCode) {
          throw new DuplicateError('Escola', 'code');
        }
      }

      // Atualiza a escola
      const updatedSchool = await prisma.school.update({
        where: { id },
        data: {
          ...(validatedData.name && { name: validatedData.name.trim() }),
          ...(validatedData.code && { code: validatedData.code.trim().toUpperCase() }),
          ...(validatedData.address !== undefined && { address: validatedData.address?.trim() || null }),
          ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
        },
        include: {
          _count: {
            select: {
              users: true,
              tests: true,
              studentAttempts: true,
            },
          },
        },
      });

      logger.system('Escola atualizada com sucesso', {
        schoolId: id,
        changes: validatedData,
      });

      return this.formatSchoolResponse(updatedSchool);
    } catch (error) {
      logger.error('Erro ao atualizar escola', error, { schoolId: id, data });
      throw error;
    }
  }

  /**
   * Desativa uma escola (soft delete)
   */
  async deactivateSchool(id: string): Promise<SchoolResponse> {
    try {
      logger.system('Desativando escola', { schoolId: id });

      const school = await prisma.school.findUnique({
        where: { id },
      });

      if (!school) {
        throw new NotFoundError('Escola');
      }

      if (!school.isActive) {
        throw new BusinessRuleError(
          'Escola já está desativada',
          'SCHOOL_ALREADY_INACTIVE',
          { action: 'Verifique o status da escola' }
        );
      }

      const updatedSchool = await prisma.school.update({
        where: { id },
        data: { isActive: false },
        include: {
          _count: {
            select: {
              users: true,
              tests: true,
              studentAttempts: true,
            },
          },
        },
      });

      logger.system('Escola desativada com sucesso', { schoolId: id });

      return this.formatSchoolResponse(updatedSchool);
    } catch (error) {
      logger.error('Erro ao desativar escola', error, { schoolId: id });
      throw error;
    }
  }

  /**
   * Reativa uma escola
   */
  async reactivateSchool(id: string): Promise<SchoolResponse> {
    try {
      logger.system('Reativando escola', { schoolId: id });

      const school = await prisma.school.findUnique({
        where: { id },
      });

      if (!school) {
        throw new NotFoundError('Escola');
      }

      if (school.isActive) {
        throw new BusinessRuleError(
          'Escola já está ativa',
          'SCHOOL_ALREADY_ACTIVE',
          { action: 'Verifique o status da escola' }
        );
      }

      const updatedSchool = await prisma.school.update({
        where: { id },
        data: { isActive: true },
        include: {
          _count: {
            select: {
              users: true,
              tests: true,
              studentAttempts: true,
            },
          },
        },
      });

      logger.system('Escola reativada com sucesso', { schoolId: id });

      return this.formatSchoolResponse(updatedSchool);
    } catch (error) {
      logger.error('Erro ao reativar escola', error, { schoolId: id });
      throw error;
    }
  }

  /**
   * Busca escola por código
   */
  async getSchoolByCode(code: string): Promise<SchoolResponse | null> {
    try {
      logger.system('Buscando escola por código', { code });

      const school = await prisma.school.findUnique({
        where: { code: code.toUpperCase() },
        include: {
          _count: {
            select: {
              users: true,
              tests: true,
              studentAttempts: true,
            },
          },
        },
      });

      return school ? this.formatSchoolResponse(school) : null;
    } catch (error) {
      logger.error('Erro ao buscar escola por código', error, { code });
      throw error;
    }
  }

  /**
   * Formata a resposta da escola
   */
  private formatSchoolResponse(school: any): SchoolResponse {
    return {
      id: school.id,
      name: school.name,
      code: school.code,
      address: school.address,
      isActive: school.isActive,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      ...(school._count && { _count: school._count }),
    };
  }
}

// ===== EXPORTAÇÃO =====

const schoolService = new SchoolService();
export default schoolService;
export type { SchoolCreateRequest, SchoolUpdateRequest, SchoolResponse };