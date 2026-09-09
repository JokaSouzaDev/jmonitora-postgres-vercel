import { z } from 'zod';

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} é obrigatório.`).max(max, `${label} excede o limite de ${max} caracteres.`);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(254),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128),
});

export const studentCreateSchema = z.object({
  ra: text('RA', 40),
  name: text('Nome', 160),
  email: z.union([z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(254), z.literal('')]).optional()
    .transform((value) => value || null),
  course: text('Curso', 160),
  semester: z.coerce.number().int().min(1, 'Semestre inválido.').max(20, 'Semestre inválido.'),
  phone: z.union([z.string().trim().max(30), z.literal('')]).optional().transform((value) => value || null),
});

export const studentUpdateSchema = studentCreateSchema.partial().extend({
  active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, 'Informe pelo menos um campo para alterar.');

export const reportCreateSchema = z.object({
  studentId: z.string().uuid('Aluno inválido.'),
  observation: z.string().trim().min(10, 'A observação deve ter pelo menos 10 caracteres.')
    .max(2000, 'A observação deve ter no máximo 2000 caracteres.'),
});

export const userCreateSchema = z.object({
  name: text('Nome', 120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(254),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128),
  role: z.enum(['MONITOR', 'PROFESSOR', 'ADMIN']),
});

export const userUpdateSchema = z.object({
  name: text('Nome', 120).optional(),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128).optional(),
  role: z.enum(['MONITOR', 'PROFESSOR', 'ADMIN']).optional(),
  active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, 'Informe pelo menos um campo para alterar.');

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.';
}
