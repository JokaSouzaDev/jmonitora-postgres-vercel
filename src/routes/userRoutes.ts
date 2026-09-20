import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { query, transaction } from "../db.js";
import { audit } from "../audit.js";
import { AppError } from "../errors.js";
import {
  firstZodMessage,
  userCreateSchema,
  userUpdateSchema,
} from "../schemas.js";
import { pagination, likeTerm } from "../pagination.js";
const columns = `id,name,email,ra,role,active,approval_status AS "approvalStatus",version,created_at AS "createdAt"`;
const router = Router();
router.use(requireAuth, requireRole("ADMIN"));
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset, search } = pagination(req.query);
    const values: unknown[] = [];
    const filters: string[] = [];
    if (search) {
      values.push(likeTerm(search));
      filters.push("(name ILIKE $1 OR email ILIKE $1 OR ra ILIKE $1)");
    }
    if (req.query.pendentes === "true")
      filters.push("approval_status='PENDING'");
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const count = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM app_users ${where}`,
      values,
    );
    values.push(limit, offset);
    const result = await query(
      `SELECT ${columns} FROM app_users ${where}
      ORDER BY (approval_status='PENDING') DESC,name,id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({ items: result.rows, page, limit, total: count.rows[0]!.total });
  } catch (error) {
    next(error);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        400,
        firstZodMessage(parsed.error),
        "VALIDATION_ERROR",
      );
    const v = parsed.data;
    const hash = await bcrypt.hash(v.password, 12);
    const user = await transaction(async (client) => {
      if (v.ra) {
        const student = await client.query(
          "SELECT ra FROM students WHERE ra=$1 AND active=TRUE FOR SHARE",
          [v.ra],
        );
        if (!student.rows[0])
          throw new AppError(
            400,
            "RA não encontrado entre os alunos ativos.",
            "INVALID_RA",
          );
      }
      const result = await client.query(
        `INSERT INTO app_users(id,name,email,password_hash,role,ra) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
        [randomUUID(), v.name, v.email, hash, v.role, v.ra],
      );
      await audit(
        client,
        req.user!.id,
        "USER_CREATED",
        "user",
        result.rows[0].id,
        { role: v.role },
      );
      return result.rows[0];
    });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});
router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = userUpdateSchema.safeParse(req.body);
    const id = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success || !id.success)
      throw new AppError(
        400,
        parsed.success ? "Usuário inválido." : firstZodMessage(parsed.error),
        "VALIDATION_ERROR",
      );
    const v = parsed.data;
    const hash = v.password ? await bcrypt.hash(v.password, 12) : undefined;
    const user = await transaction(async (client) => {
      // Serialize account administration to preserve the last active administrator.
      await client.query("SELECT pg_advisory_xact_lock(20260920)");
      const old = await client.query(
        "SELECT * FROM app_users WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      const row = old.rows[0];
      if (!row) throw new AppError(404, "Usuário não encontrado.", "NOT_FOUND");
      if (row.version !== v.version)
        throw new AppError(
          409,
          "O usuário foi alterado. Atualize a lista.",
          "VERSION_CONFLICT",
        );
      const role = v.role ?? row.role;
      const approval = v.approvalStatus ?? row.approval_status;
      const active =
        approval !== "APPROVED"
          ? false
          : (v.active ?? (v.approvalStatus === "APPROVED" ? true : row.active));
      const ra = v.ra === undefined ? row.ra : v.ra;
      if (id.data === req.user!.id && (!active || role !== "ADMIN"))
        throw new AppError(
          400,
          "Você não pode remover o próprio acesso administrativo.",
          "SELF_DEACTIVATION",
        );
      if (role === "MONITOR" && !ra)
        throw new AppError(
          400,
          "Vincule o RA antes de aprovar ou alterar um monitor.",
          "INVALID_RA",
        );
      if (ra) {
        const student = await client.query(
          "SELECT ra FROM students WHERE ra=$1 AND active=TRUE FOR SHARE",
          [ra],
        );
        if (!student.rows[0])
          throw new AppError(
            400,
            "RA não encontrado entre os alunos ativos.",
            "INVALID_RA",
          );
      }
      if (row.role === "ADMIN" && row.active && (!active || role !== "ADMIN")) {
        const admins = await client.query(
          "SELECT COUNT(*)::int AS total FROM app_users WHERE role='ADMIN' AND active=TRUE",
        );
        if (admins.rows[0].total <= 1)
          throw new AppError(
            409,
            "Mantenha pelo menos um administrador ativo.",
            "LAST_ADMIN",
          );
      }
      const result = await client.query(
        `UPDATE app_users SET name=$1,role=$2,ra=$3,active=$4,approval_status=$5,
        password_hash=COALESCE($6,password_hash),session_version=session_version+1,version=version+1,updated_at=NOW()
        WHERE id=$7 RETURNING ${columns}`,
        [v.name ?? row.name, role, ra, active, approval, hash ?? null, id.data],
      );
      await audit(client, req.user!.id, "USER_UPDATED", "user", id.data, {
        role,
        active,
        approval,
      });
      return result.rows[0];
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});
export default router;
