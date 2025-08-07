// import { PrismaClient } from '@prisma/client';
// import Redis from 'ioredis';

// Mock do Prisma para testes
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn(),
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    school: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    test: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    question: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    studentAttempt: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    }
  }))
}));

// Mock do Redis para testes
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    flushall: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    status: 'ready'
  };
  
  return jest.fn().mockImplementation(() => mockRedis);
});

// Mock do Bull (filas) para testes
jest.mock('bull', () => {
  const mockQueue = {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
    getJob: jest.fn(),
    getJobs: jest.fn(),
    getJobCounts: jest.fn(),
    clean: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn()
  };
  
  return jest.fn().mockImplementation(() => mockQueue);
});

// Mock do Winston (logger) para testes
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock do winston-daily-rotate-file
jest.mock('winston-daily-rotate-file', () => jest.fn());

// Mock do bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt')
}));

// Mock do jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn().mockReturnValue({ userId: '1', role: 'TEACHER' }),
  decode: jest.fn().mockReturnValue({ userId: '1', role: 'TEACHER' })
}));

// Configurações globais para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LOG_LEVEL = 'error';

// Configurar timeout global para testes
jest.setTimeout(30000);

// Limpar mocks antes de cada teste
beforeEach(() => {
  jest.clearAllMocks();
});

// Limpar timers após cada teste
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Configuração global para testes assíncronos
global.setImmediate = global.setImmediate || ((fn: any, ...args: any[]) => global.setTimeout(fn, 0, ...args));

// Helper para criar dados de teste
export const createMockUser = (overrides = {}) => ({
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'TEACHER',
  schoolId: 'school_123',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockSchool = (overrides = {}) => ({
  id: 'school_123',
  name: 'Test School',
  domain: 'testschool.edu',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockTest = (overrides = {}) => ({
  id: 'test_123',
  title: 'Test Title',
  description: 'Test Description',
  accessCode: 'ABC123',
  type: 'PRIVATE',
  status: 'ACTIVE',
  duration: 60,
  maxAttempts: 3,
  shuffleQuestions: false,
  shuffleOptions: false,
  showResults: true,
  allowReview: true,
  schoolId: 'school_123',
  createdById: 'user_123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockQuestion = (overrides = {}) => ({
  id: 'question_123',
  statement: 'What is 2 + 2?',
  alternatives: ['2', '3', '4', '5'],
  correctAnswer: 2,
  difficulty: 'EASY',
  subject: 'Mathematics',
  topic: 'Basic Arithmetic',
  grade: 10,
  tags: ['arithmetic', 'basic'],
  hasMath: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockStudentAttempt = (overrides = {}) => ({
  id: 'attempt_123',
  testId: 'test_123',
  studentName: 'Test Student',
  schoolId: 'school_123',
  grade: '10',
  classroom: 'A',
  answers: [],
  score: null,
  totalPoints: null,
  startedAt: new Date(),
  completedAt: null,
  duration: null,
  analytics: {},
  ...overrides
});

// Helper para simular delay em testes
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper para capturar logs em testes
export const captureLogs = () => {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = (...args) => logs.push(`LOG: ${args.join(' ')}`);
  console.error = (...args) => logs.push(`ERROR: ${args.join(' ')}`);
  console.warn = (...args) => logs.push(`WARN: ${args.join(' ')}`);
  
  return {
    getLogs: () => logs,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  };
};