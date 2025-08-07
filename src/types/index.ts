import { TestStatus, TestType, UserRole, Difficulty } from '@prisma/client';

// ===== INTERFACES DE REQUEST/RESPONSE =====

// Auth Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthRequest {
  name: string;
  email: string;
  password: string;
  role?: 'TEACHER' | 'ADMIN';
  schoolId: string;
}

export interface AuthResponse {
  user: UserWithSchool;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserWithSchool {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolId: string;
  school?: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  };
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  password?: string;
}

// User Types
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolId: string;
  school?: {
    id: string;
    name: string;
    code: string;
  };
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

// Test Types
export interface CreateTestRequest {
  title: string;
  description?: string;
  type: TestType;
  duration?: number;
  subjects: string[];
  targetGrades: string[];
  instructions?: string;
  allowReview?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
  maxAttempts?: number;
  questions: CreateTestQuestionRequest[];
}

export interface CreateTestQuestionRequest {
  questionId: string;
  points: number;
  orderNum: number;
}

export interface UpdateTestRequest {
  title?: string;
  description?: string;
  type?: TestType;
  duration?: number;
  subjects?: string[];
  targetGrades?: string[];
  instructions?: string;
  allowReview?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
  maxAttempts?: number;
}

export interface TestResponse {
  id: string;
  title: string;
  description?: string;
  type: TestType;
  status: TestStatus;
  duration?: number;
  subjects: string[];
  targetGrades: string[];
  instructions?: string;
  allowReview: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: boolean;
  maxAttempts: number;
  accessCode?: string;
  totalPoints: number;
  questionsCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  school?: {
    id: string;
    name: string;
    code: string;
  };
  questions?: TestQuestionResponse[];
}

export interface TestQuestionResponse {
  id: string;
  points: number;
  orderNum: number;
  question: {
    id: string;
    statement: string;
    alternatives: string[];
    correctAnswer: number;
    subject: string;
    topic?: string;
    difficulty: Difficulty;
  };
}

// Student Types
export interface StudentLoginRequest {
  accessCode: string;
  studentName: string;
  grade: string;
  classroom: string;
  schoolId: string;
  studentEmail?: string;
  studentId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface StudentLoginResponse {
  success: boolean;
  data: TestForStudent;
}

export interface TestForStudent {
  id: string;
  title: string;
  duration?: number | undefined;
  maxAttempts: number;
  showResults: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export interface QuestionForStudent {
  id: string;
  statement: string;
  alternatives: string[];
  difficulty: string;
  subject: string;
  topic?: string;
  orderNum: number;
}

export interface SubmitAnswersRequest {
  answers: Record<string, number>; // questionId -> selectedAlternativeIndex
}

export interface StudentSubmissionRequest {
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

export interface StudentSubmissionResponse {
  success: boolean;
  data: {
    questionId: string;
    isCorrect: boolean;
    timeSpent: number;
    totalAnswered: number;
  };
}

export interface StudentAttemptResponse {
  id: string;
  testId: string;
  studentName: string;
  grade: string;
  classroom: string;
  score?: number | undefined;
  totalPoints?: number | undefined;
  startedAt: Date;
  completedAt?: Date | undefined;
  duration?: number | undefined;
  answers: Record<string, number>;
}

// Question Types
export interface QuestionResponse {
  id: string;
  statement: string;
  alternatives: string[];
  correctAnswer: number;
  subject: string;
  topic?: string;
  grade?: number;
  difficulty: Difficulty;
  tags: string[];
  hasMath: boolean;
  externalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionCreateRequest {
  statement: string;
  alternatives: string[];
  correctAnswer: number;
  subject: string;
  topic?: string;
  grade?: number;
  difficulty: Difficulty;
  tags?: string[];
  hasMath?: boolean;
}

export interface QuestionUpdateRequest {
  statement?: string;
  alternatives?: string[];
  correctAnswer?: number;
  subject?: string;
  topic?: string;
  grade?: number;
  difficulty?: Difficulty;
  tags?: string[];
  hasMath?: boolean;
}

// ===== UTILITY TYPES =====

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: Date;
}

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  key: string;
}

// ===== PERFORMANCE & MONITORING TYPES =====

export interface PerformanceMetrics {
  requestCount: number;
  responseTime: number;
  errorRate: number;
  activeConnections: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
}

// ===== VALIDATION SCHEMAS =====

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// ===== QUEUE TYPES =====

export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  priority?: number;
  delay?: number;
  attempts?: number;
}

export interface ProcessTestResultsJob {
  attemptId: string;
  testId: string;
  answers: Record<string, number>;
}

// ===== FILTER & SEARCH TYPES =====

export interface TestFilters {
  page?: number;
  limit?: number;
  type?: TestType;
  status?: TestStatus;
  search?: string;
  schoolId?: string;
  createdById?: string;
  subjects?: string[];
  targetGrades?: string[];
}

export interface QuestionFilters {
  page?: number;
  limit?: number;
  schoolId?: string;
  subject?: string;
  topic?: string;
  grade?: number;
  difficulty?: Difficulty;
  type?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'ESSAY';
  creatorId?: string;
  tags?: string[];
  search?: string;
}

// ===== EXPRESS EXTENSIONS =====

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        schoolId: string;
      };
      startTime?: number;
    }
  }
}

export {};