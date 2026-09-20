import { z } from "zod";
const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} é obrigatório.`).max(max);
export const raSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9.-]{0,39}$/, "Informe um RA válido, sem espaços.");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .max(254);
// bcrypt uses at most 72 bytes, not 72 characters.
export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "A senha deve ter até 72 bytes.",
  );
const optionalRa = z
  .union([raSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: email.optional(),
    password: z.string().min(8, "Informe a senha.").max(128),
  })
  .refine((v) => !!(v.identifier || v.email), "Informe seu RA ou e-mail.");
export const registrationSchema = z
  .object({
    name: text("Nome", 120),
    email,
    password: passwordSchema,
    role: z.enum(["MONITOR", "PROFESSOR"]),
    ra: optionalRa,
  })
  .strict()
  .refine((v) => v.role !== "MONITOR" || !!v.ra, {
    message: "O RA é obrigatório para monitores.",
    path: ["ra"],
  });
export const studentCreateSchema = z.object({
  ra: raSchema,
  name: text("Nome", 160),
  email: z
    .union([email, z.literal("")])
    .optional()
    .transform((v) => v || null),
  course: text("Curso", 160),
  className: z.string().trim().max(80).default(""),
  semester: z.coerce
    .number()
    .int()
    .min(1, "Semestre inválido.")
    .max(20, "Semestre inválido."),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null),
});
export const studentUpdateSchema = studentCreateSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
    className: z.string().trim().max(80).optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "version"),
    "Informe um campo para alterar.",
  );
export const reportCreateSchema = z
  .object({
    studentRa: raSchema.optional(),
    studentId: z.string().uuid("Aluno inválido.").optional(),
    observation: z
      .string()
      .trim()
      .min(10, "A observação deve ter pelo menos 10 caracteres.")
      .max(2000),
    requestKey: z.string().uuid().optional(),
  })
  .refine((v) => !!(v.studentRa || v.studentId), "Informe o RA do aluno.");
export const reportReviewSchema = z
  .object({
    status: z.enum(["NEW", "IN_REVIEW", "RESOLVED"]),
    note: z.string().trim().min(3, "Descreva o acompanhamento.").max(2000),
    version: z.number().int().positive(),
  })
  .strict();
export const userCreateSchema = z
  .object({
    name: text("Nome", 120),
    email,
    password: passwordSchema,
    role: z.enum(["MONITOR", "PROFESSOR", "ADMIN"]),
    ra: optionalRa,
  })
  .refine(
    (v) => v.role !== "MONITOR" || !!v.ra,
    "O RA é obrigatório para monitores.",
  );
export const userUpdateSchema = z
  .object({
    name: text("Nome", 120).optional(),
    password: passwordSchema.optional(),
    role: z.enum(["MONITOR", "PROFESSOR", "ADMIN"]).optional(),
    ra: optionalRa.optional(),
    active: z.boolean().optional(),
    approvalStatus: z.enum(["APPROVED", "REJECTED"]).optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "version"),
    "Informe um campo para alterar.",
  );
export function firstZodMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
