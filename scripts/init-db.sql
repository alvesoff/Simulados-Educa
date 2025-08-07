-- Script de Inicialização do Banco de Dados
-- Sistema de Provas Online

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Configurações de performance
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Configurações de log para desenvolvimento
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Criar usuário para a aplicação (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sistema_provas_user') THEN
        CREATE ROLE sistema_provas_user WITH LOGIN PASSWORD 'sistema_provas_pass';
    END IF;
END
$$;

-- Conceder permissões
GRANT CONNECT ON DATABASE sistema_provas TO sistema_provas_user;
GRANT USAGE ON SCHEMA public TO sistema_provas_user;
GRANT CREATE ON SCHEMA public TO sistema_provas_user;

-- Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Criar função para gerar códigos de acesso únicos
CREATE OR REPLACE FUNCTION generate_access_code(length INTEGER DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Criar função para calcular pontuação
CREATE OR REPLACE FUNCTION calculate_score(
    answers JSONB,
    test_questions JSONB
)
RETURNS INTEGER AS $$
DECLARE
    total_score INTEGER := 0;
    question JSONB;
    answer JSONB;
BEGIN
    FOR question IN SELECT * FROM jsonb_array_elements(test_questions)
    LOOP
        SELECT jsonb_array_elements(answers) INTO answer
        WHERE (jsonb_array_elements(answers)->>'questionId')::TEXT = (question->>'id')::TEXT;
        
        IF answer IS NOT NULL AND (answer->>'answer')::TEXT = (question->>'correctAnswer')::TEXT THEN
            total_score := total_score + COALESCE((question->>'points')::INTEGER, 1);
        END IF;
    END LOOP;
    
    RETURN total_score;
END;
$$ LANGUAGE plpgsql;

-- Criar índices para otimização de performance
-- Estes serão criados automaticamente pelo Prisma, mas deixamos como referência

-- Comentários sobre índices importantes:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tests_access_code ON "Test" ("accessCode");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tests_school_status ON "Test" ("schoolId", "status");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_subject_difficulty ON "Question" ("subject", "difficulty");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_attempts_test_school ON "StudentAttempt" ("testId", "schoolId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_attempts_completed ON "StudentAttempt" ("completedAt") WHERE "completedAt" IS NOT NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_user_expires ON "RefreshToken" ("userId", "expiresAt");

-- Configurações de timezone
SET timezone = 'UTC';

-- Mensagem de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Banco de dados inicializado com sucesso para o Sistema de Provas Online!';
    RAISE NOTICE 'Extensões criadas: uuid-ossp, pg_trgm, btree_gin';
    RAISE NOTICE 'Funções utilitárias criadas: update_updated_at_column, generate_access_code, calculate_score';
    RAISE NOTICE 'Configurações de performance aplicadas';
END
$$;