/** @type {import('jest').Config} */
module.exports = {
  // Ambiente de teste
  testEnvironment: 'node',

  // Extensões de arquivo para módulos
  moduleFileExtensions: ['js', 'json', 'ts'],

  // Padrões de arquivos de teste
  testMatch: [
    '**/__tests__/**/*.(ts|js)',
    '**/*.(test|spec).(ts|js)'
  ],

  // Transformação de arquivos TypeScript
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },

  // Diretórios a serem ignorados
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],

  // Configuração de cobertura
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,js}',
    '!src/**/*.spec.{ts,js}',
    '!src/server.ts',
    '!src/app.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Configuração de setup
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],

  // Mapeamento de módulos (para aliases)
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Timeout para testes
  testTimeout: 30000,

  // Configurações do ts-jest
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },

  // Limpar mocks automaticamente
  clearMocks: true,
  restoreMocks: true,

  // Configuração para testes assíncronos
  maxWorkers: '50%',

  // Verbose output
  verbose: true,

  // Detectar arquivos abertos
  detectOpenHandles: true,
  forceExit: true
};