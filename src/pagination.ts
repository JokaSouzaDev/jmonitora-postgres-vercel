import { z } from "zod";
import { AppError } from "./errors.js";
const schema = z.object({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  busca: z.string().trim().max(120).default(""),
});
export function pagination(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      400,
      "Filtros ou paginação inválidos.",
      "VALIDATION_ERROR",
    );
  const { pagina: page, limite: limit, busca: search } = result.data;
  return { page, limit, search, offset: (page - 1) * limit };
}
export function likeTerm(text: string) {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
