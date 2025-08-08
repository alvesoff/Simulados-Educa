import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import cache from '../utils/cache';
import { config } from '../utils/config';
import { 
  AuthRequest, 
  AuthResponse, 
  TokenPair, 
  UserWithSchool 
} from '../types';
import { 
  UnauthorizedError, 
  ValidationError, 
  NotFoundError,
  DuplicateError,
  InvalidCredentialsError,
  ExpiredTokenError,
  InvalidTokenError
} from '../middleware/errorHandler';

// ===== INICIALIZAÇÃO =====

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// ===== INTERFACES =====

interface JWTPayload {
  userId: string;
  schoolId: string;
  role: string;
  iat: number;
  exp: number;
}

interface LoginResult {
  user: UserWithSchool;
  tokens: TokenPair;
  sessionId: string;
}

// ===== CLASSE PRINCIPAL =====

class AuthService {
  /**
   * Registra um novo usuário
   */
  async register(data: AuthRequest): Promise<AuthResponse> {
    try {
      logger.auth(`Tentativa de registro: ${data.email}`);

      // Verifica se o usuário já existe
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new DuplicateError('Usuário', 'email');
      }

      // Verifica se a escola existe
      const school = await prisma.school.findUnique({
        where: { id: data.schoolId },
      });

      if (!school) {
        throw new NotFoundError('Escola');
      }

      if (!school.isActive) {
        throw new ValidationError('Escola não está ativa');
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);

      // Cria o usuário
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: (data.role as UserRole) || UserRole.TEACHER,
          schoolId: data.schoolId,
        },
        include: {
          school: true,
        },
      });

      // Converte user para UserWithSchool
      const { avatarUrl: regUserAvatarUrl, lastLoginAt: regUserLastLoginAt, ...regUserWithoutOptionals } = user;
      const regUserConverted: UserWithSchool = {
        ...regUserWithoutOptionals,
        ...(regUserAvatarUrl && { avatarUrl: regUserAvatarUrl }),
        ...(regUserLastLoginAt && { lastLoginAt: regUserLastLoginAt })
      };

      // Gera tokens
      const tokens = await this.generateTokens(regUserConverted);
      const sessionId = this.generateSessionId();

      // Salva no cache
      await this.cacheUserSession(regUserConverted, sessionId);

      logger.auth(`Usuário registrado com sucesso: ${user.email} (${user.id})`);

      return {
        user: this.sanitizeUser(regUserConverted),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      logger.error('Erro no registro', error, { email: data.email });
      throw error;
    }
  }

  /**
   * Autentica um usuário
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      logger.auth(`Tentativa de login para email ${email}`);

      // Busca o usuário
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          school: true,
        },
      });

      if (!user) {
        throw new InvalidCredentialsError();
      }

      // Verifica se o usuário está ativo
      if (!user.isActive) {
        throw new UnauthorizedError('Usuário inativo');
      }

      // Verifica se a escola está ativa
      if (!user.school.isActive) {
        throw new UnauthorizedError('Escola inativa');
      }

      // Verifica a senha
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new InvalidCredentialsError();
      }

      // Converte user para UserWithSchool
      const { avatarUrl: userAvatarUrl, lastLoginAt: userLastLoginAt, ...userWithoutOptionals } = user;
      const userConverted: UserWithSchool = {
        ...userWithoutOptionals,
        ...(userAvatarUrl && { avatarUrl: userAvatarUrl }),
        ...(userLastLoginAt && { lastLoginAt: userLastLoginAt })
      };

      // Gera tokens
      const tokens = await this.generateTokens(userConverted);
      const sessionId = this.generateSessionId();

      // Salva no cache
      await this.cacheUserSession(userConverted, sessionId);

      // Atualiza último login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      logger.auth(`Login realizado com sucesso para usuário ${user.id} (${user.email})`);

      return {
        user: this.sanitizeUser(userConverted),
        tokens,
        sessionId,
      };
    } catch (error) {
      logger.error('Erro no login', error, { email });
      throw error;
    }
  }

  /**
   * Login específico para estudantes (sem senha)
   */
  async studentLogin(accessCode: string, studentName: string): Promise<LoginResult> {
    try {
      logger.auth(`Tentativa de login de estudante: ${studentName} com código ${accessCode}`);

      // Busca o teste pelo código de acesso
      const test = await cache.getTestByAccessCode(accessCode);
      if (!test) {
        // Busca no banco se não estiver no cache
        const dbTest = await prisma.test.findUnique({
          where: { accessCode },
          include: {
            school: true,
          },
        });

        if (!dbTest) {
          throw new NotFoundError('Teste com este código de acesso');
        }

        if (dbTest.status !== 'ACTIVE') {
          throw new ValidationError('Teste não está ativo');
        }

        if (!(dbTest as any).school?.isActive) {
          throw new ValidationError('Escola não está ativa');
        }

        // Salva no cache
        await cache.setTestByAccessCode(accessCode, dbTest);
      }

      // Cria ou busca usuário estudante temporário
      const studentEmail = `student_${accessCode}_${studentName.toLowerCase().replace(/\s+/g, '_')}@temp.local`;
      
      let student = await prisma.user.findUnique({
        where: { email: studentEmail },
        include: { school: true },
      });

      if (!student) {
        // Cria estudante temporário
        student = await prisma.user.create({
          data: {
            name: studentName,
            email: studentEmail,
            password: '', // Estudantes não têm senha
            role: 'STUDENT' as any,
            schoolId: (test as any).schoolId,
            isActive: true,
          },
          include: {
            school: true,
          },
        });
      }

      // Converte student para UserWithSchool
      const { avatarUrl: studentAvatarUrl, lastLoginAt: studentLastLoginAt, ...studentWithoutOptionals } = student;
      const studentConverted: UserWithSchool = {
        ...studentWithoutOptionals,
        ...(studentAvatarUrl && { avatarUrl: studentAvatarUrl }),
        ...(studentLastLoginAt && { lastLoginAt: studentLastLoginAt })
      };

      // Gera tokens
      const tokens = await this.generateTokens(studentConverted);
      const sessionId = this.generateSessionId();

      // Salva no cache
      await this.cacheUserSession(studentConverted, sessionId);

      logger.auth(`Login de estudante realizado com sucesso: ${studentName} no teste ${(test as any).id}`);

      return {
        user: this.sanitizeUser(studentConverted),
        tokens,
        sessionId,
      };
    } catch (error) {
      logger.error('Erro no login de estudante', error, { accessCode, studentName });
      throw error;
    }
  }

  /**
   * Renova tokens usando refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      logger.auth('Tentativa de renovação de token');

      // Verifica o refresh token no banco
      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: {
          user: {
            include: {
              school: true,
            },
          },
        },
      });

      if (!tokenRecord) {
        throw new InvalidTokenError('Refresh token');
      }

      if (tokenRecord.expiresAt < new Date()) {
        // Remove token expirado
        await prisma.refreshToken.delete({
          where: { id: tokenRecord.id },
        });
        throw new ExpiredTokenError('Refresh token');
      }

      if (!tokenRecord.user.isActive || !tokenRecord.user.school.isActive) {
        throw new UnauthorizedError('Usuário ou escola inativo');
      }

      // Gera novos tokens
      const { avatarUrl, lastLoginAt, ...userWithoutOptionals } = tokenRecord.user;
      const userForTokens: UserWithSchool = {
        ...userWithoutOptionals,
        ...(avatarUrl && { avatarUrl }),
        ...(lastLoginAt && { lastLoginAt })
      };
      const newTokens = await this.generateTokens(userForTokens);

      // Remove o refresh token antigo
      await prisma.refreshToken.delete({
        where: { id: tokenRecord.id },
      });

      logger.auth(`Tokens renovados com sucesso para usuário ${tokenRecord.user.id}`);

      return newTokens;
    } catch (error) {
      logger.error('Erro na renovação de tokens', error);
      throw error;
    }
  }

  /**
   * Logout do usuário
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    try {
      logger.auth(`Logout iniciado para usuário ${userId}`);

      // Remove refresh token se fornecido
      if (refreshToken) {
        await prisma.refreshToken.deleteMany({
          where: {
            token: refreshToken,
            userId,
          },
        });
      }

      // Remove do cache
      await cache.del(`user:${userId}`);

      logger.auth(`Logout realizado com sucesso para usuário ${userId}`);
    } catch (error) {
      logger.error('Erro no logout', error, { userId });
      throw error;
    }
  }

  /**
   * Logout de todos os dispositivos
   */
  async logoutAll(userId: string): Promise<void> {
    try {
      logger.auth(`Logout de todos os dispositivos para usuário ${userId}`);

      // Remove todos os refresh tokens do usuário
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // Remove do cache
      await cache.del(`user:${userId}`);

      logger.auth(`Logout de todos os dispositivos realizado para usuário ${userId}`);
    } catch (error) {
      logger.error('Erro no logout de todos os dispositivos', error, { userId });
      throw error;
    }
  }

  /**
   * Verifica se um token JWT é válido
   */
  async verifyToken(token: string): Promise<UserWithSchool> {
    try {
      // Decodifica o token
      const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;

      // Busca o usuário no cache primeiro
      let user: UserWithSchool | null = await cache.getUser(decoded.userId) as UserWithSchool | null;
      
      if (!user) {
        // Busca no banco se não estiver no cache
        const dbUser = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            school: true,
          },
        });

        if (!dbUser) {
          throw new UnauthorizedError('Usuário não encontrado');
        }

        user = dbUser as UserWithSchool;
        // Salva no cache
        await cache.setUser(user.id, user);
      }

      if (!user.isActive || !user.school?.isActive) {
        throw new UnauthorizedError('Usuário ou escola inativo');
      }

      return user;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Token inválido');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expirado');
      }
      throw error;
    }
  }

  /**
   * Gera par de tokens (access + refresh)
   */
  private async generateTokens(user: UserWithSchool): Promise<TokenPair> {
    const payload = {
      userId: user.id,
      schoolId: user.schoolId,
      role: user.role,
    };

    // Access token (15 minutos)
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: '15m',
    });

    // Refresh token (7 dias) - adiciona timestamp único para evitar duplicatas
    const refreshTokenPayload = {
      ...payload,
      jti: `${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // JWT ID único
    };
    const refreshToken = jwt.sign(refreshTokenPayload, config.JWT_SECRET, {
      expiresIn: '7d',
    });

    // Salva refresh token no banco
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Gera ID de sessão único
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Salva sessão do usuário no cache
   */
  private async cacheUserSession(user: UserWithSchool, sessionId: string): Promise<void> {
    await Promise.all([
      cache.setUser(user.id, user),
      cache.set(`session:${sessionId}`, user.id, cache.TTL.SHORT),
    ]);
  }

  /**
   * Remove dados sensíveis do usuário
   */
  private sanitizeUser(user: UserWithSchool): Omit<UserWithSchool, 'password'> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  /**
   * Limpa tokens expirados (job de limpeza)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      logger.system(`${result.count} tokens expirados removidos`);
      return result.count;
    } catch (error) {
      logger.error('Erro na limpeza de tokens expirados', error);
      throw error;
    }
  }

  /**
   * Obtém dados do usuário atual
   */
  async getCurrentUser(userId: string): Promise<UserWithSchool> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          school: true,
        },
      });

      if (!user) {
        throw new NotFoundError('Usuário');
      }

      return this.sanitizeUser(user as UserWithSchool);
    } catch (error) {
      logger.error('Erro ao buscar dados do usuário', error, { userId });
      throw error;
    }
  }

  /**
   * Altera a senha do usuário
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('Usuário');
      }

      // Verifica senha atual
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedError('Senha atual incorreta');
      }

      // Hash da nova senha
      const hashedNewPassword = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);

      // Atualiza a senha
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
          updatedAt: new Date(),
        },
      });

      // Remove todas as sessões ativas (força novo login)
      await this.logoutAll(userId);

      logger.auth('Senha alterada com sucesso', { userId });
    } catch (error) {
      logger.error('Erro ao alterar senha', error, { userId });
      throw error;
    }
  }

  /**
   * Obtém sessões ativas do usuário
   */
  async getUserSessions(userId: string): Promise<any[]> {
    try {
      const sessions = await prisma.refreshToken.findMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return sessions.map(session => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        isActive: session.expiresAt > new Date(),
      }));
    } catch (error) {
      logger.error('Erro ao buscar sessões do usuário', error, { userId });
      throw error;
    }
  }

  /**
   * Revoga sessão específica
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    try {
      await prisma.refreshToken.deleteMany({
        where: {
          id: sessionId,
          userId,
        },
      });

      logger.auth(`Sessão ${sessionId} revogada para usuário ${userId}`);
    } catch (error) {
      logger.error('Erro ao revogar sessão', error, { userId, sessionId });
      throw error;
    }
  }

  /**
   * Obtém estatísticas de autenticação
   */
  async getAuthStats(): Promise<{
    activeUsers: number;
    activeSessions: number;
    expiredTokens: number;
  }> {
    try {
      const [activeUsers, activeSessions, expiredTokens] = await Promise.all([
        prisma.user.count({
          where: {
            isActive: true,
            lastLoginAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
            },
          },
        }),
        prisma.refreshToken.count({
          where: {
            expiresAt: {
              gt: new Date(),
            },
          },
        }),
        prisma.refreshToken.count({
          where: {
            expiresAt: {
              lt: new Date(),
            },
          },
        }),
      ]);

      return {
        activeUsers,
        activeSessions,
        expiredTokens,
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas de autenticação', error);
      throw error;
    }
  }
}

// ===== INSTÂNCIA SINGLETON =====

export const authService = new AuthService();

export default authService;