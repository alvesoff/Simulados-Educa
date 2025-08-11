import { z } from 'zod';

/**
 * Validador para CUID (formato usado pelo Prisma)
 * CUID tem formato: c + timestamp + counter + fingerprint + random
 * Exemplo: cme5rs0mm000bhbqsbr2yhm0j
 */
export const cuidSchema = z.string().regex(
  /^c[a-z0-9]{24}$/,
  'ID deve ser um CUID válido'
);

/**
 * Validador flexível para IDs que aceita tanto CUID quanto outros formatos
 */
export const idSchema = z.string().min(1, 'ID é obrigatório');

/**
 * Validador para array de IDs
 */
export const idsArraySchema = z.array(idSchema).min(1, 'Pelo menos um ID deve ser fornecido');

/**
 * Validador para email
 */
export const emailSchema = z.string().email('Email inválido');

/**
 * Validador para senha
 */
export const passwordSchema = z.string().min(6, 'Senha deve ter pelo menos 6 caracteres');

/**
 * Validador para código de acesso
 */
export const accessCodeSchema = z.string().length(6, 'Código de acesso deve ter 6 caracteres');

/**
 * Validador para paginação
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/**
 * Função utilitária para validar se uma string é um CUID válido
 */
export function isValidCuid(id: string): boolean {
  return /^c[a-z0-9]{24}$/.test(id);
}

/**
 * Função utilitária para validar se uma string é um ID válido (formato flexível)
 */
export function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}