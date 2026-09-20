import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { query, transaction } from "../db.js";
import { audit } from "../audit.js";
import { AppError } from "../errors.js";
import {
  firstZodMessage,
  raSchema,
  studentCreateSchema,
  studentUpdateSchema,
} from "../schemas.js";
import { pagination, likeTerm } from "../pagination.js";
const full = `id,ra,name,email,course,semester,phone,active,class_name AS "className",version,
  created_at AS "createdAt",updated_at AS "updatedAt"`;
const minimal = 'ra,name,course,semester,class_name AS "className",active';
const router = Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset, search } = pagination(req.query);
    const values: unknown[] = [];
    const filters: string[] = [];
    if (!(req.query.inativos === "true" && req.user!.role !== "MONITOR"))
      filters.push("active=TRUE");
    if (search) {
      values.push(likeTerm(search));
      filters.push(`(ra ILIKE $1 OR name ILIKE $1 OR class_name ILIKE $1)`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const count = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM students ${where}`,
      values,
    );
    values.push(limit, offset);
    const result = await query(
      `SELECT ${req.user!.role === "MONITOR" ? minimal : full} FROM students ${where}
      ORDER BY name,ra LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({ items: result.rows, page, limit, total: count.rows[0]!.total });
  } catch (error) {
    next(error);
  }
});
router.get("/ra/:ra", async (req, res, next) => {
  try {
    const ra = raSchema.safeParse(req.params.ra);
    if (!ra.success)
      throw new AppError(400, "RA inválido.", "VALIDATION_ERROR");
    const result = await query(
      `SELECT ${req.user!.role === "MONITOR" ? minimal : full} FROM students WHERE ra=$1
      ${req.user!.role === "MONITOR" ? "AND active=TRUE" : ""}`,
      [ra.data],
    );
    if (!result.rows[0])
      throw new AppError(404, "Aluno não encontrado.", "STUDENT_NOT_FOUND");
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
router.post("/", requireRole("PROFESSOR", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = studentCreateSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        400,
        firstZodMessage(parsed.error),
        "VALIDATION_ERROR",
      );
    const v = parsed.data;
    const student = await transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO students(id,ra,name,email,course,semester,phone,class_name)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${full}`,
        [
          randomUUID(),
          v.ra,
          v.name,
          v.email,
          v.course,
          v.semester,
          v.phone,
          v.className,
        ],
      );
      await audit(client, req.user!.id, "STUDENT_CREATED", "student", v.ra);
      return result.rows[0];
    });
    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
});
router.patch(
  "/ra/:ra",
  requireRole("PROFESSOR", "ADMIN"),
  async (req, res, next) => {
    try {
      const parsed = studentUpdateSchema.safeParse(req.body);
      const ra = raSchema.safeParse(req.params.ra);
      if (!parsed.success)
        throw new AppError(
          400,
          firstZodMessage(parsed.error),
          "VALIDATION_ERROR",
        );
      if (!ra.success)
        throw new AppError(400, "RA inválido.", "VALIDATION_ERROR");
      const { version, ...changes } = parsed.data;
      const student = await transaction(async (client) => {
        const old = await client.query(
          "SELECT version FROM students WHERE ra=$1 FOR UPDATE",
          [ra.data],
        );
        if (!old.rows[0])
          throw new AppError(404, "Aluno não encontrado.", "STUDENT_NOT_FOUND");
        if (old.rows[0].version !== version)
          throw new AppError(
            409,
            "O cadastro foi alterado por outra pessoa. Atualize e tente novamente.",
            "VERSION_CONFLICT",
          );
        const map: Record<string, string> = {
          ra: "ra",
          name: "name",
          email: "email",
          course: "course",
          semester: "semester",
          phone: "phone",
          className: "class_name",
          active: "active",
        };
        const entries = Object.entries(changes).filter(
          ([, v]) => v !== undefined,
        );
        const values: unknown[] = entries.map(([, v]) => v);
        values.push(ra.data);
        const result = await client.query(
          `UPDATE students SET ${entries.map(([k], i) => `${map[k]}=$${i + 1}`).join(",")},
        updated_at=NOW(),version=version+1 WHERE ra=$${values.length} RETURNING ${full}`,
          values,
        );
        await audit(
          client,
          req.user!.id,
          "STUDENT_UPDATED",
          "student",
          result.rows[0].ra,
          { fields: entries.map(([k]) => k), previousRa: ra.data },
        );
        return result.rows[0];
      });
      res.json(student);
    } catch (error) {
      next(error);
    }
  },
);
export default router;
