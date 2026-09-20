import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { query, transaction } from "../db.js";
import { audit } from "../audit.js";
import { AppError } from "../errors.js";
import {
  firstZodMessage,
  raSchema,
  reportCreateSchema,
  reportReviewSchema,
} from "../schemas.js";
import { pagination, likeTerm } from "../pagination.js";
const SELECT = `SELECT r.id,r.observation,r.status,r.version,r.created_at AS "createdAt",r.updated_at AS "updatedAt",
  s.ra AS "studentRa",s.name AS "studentName",s.course,s.class_name AS "className",u.id AS "authorId",u.name AS "authorName"
  FROM reports r JOIN students s ON s.ra=r.student_ra JOIN app_users u ON u.id=r.author_id`;
const router = Router();
router.use(requireAuth);
const idSchema = z.string().uuid();
router.get("/resumo", async (req, res, next) => {
  try {
    const own = req.user!.role === "MONITOR";
    const result = await query(
      `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER(WHERE status='NEW')::int AS new,
      COUNT(*) FILTER(WHERE status='IN_REVIEW')::int AS reviewing,
      COUNT(*) FILTER(WHERE status='RESOLVED')::int AS resolved
      FROM reports ${own ? "WHERE author_id=$1" : ""}`,
      own ? [req.user!.id] : [],
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset, search } = pagination(req.query);
    const values: unknown[] = [];
    const filters: string[] = [];
    const add = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };
    if (req.user!.role === "MONITOR")
      filters.push(`r.author_id=${add(req.user!.id)}`);
    if (search) {
      const p = add(likeTerm(search));
      filters.push(
        `(s.ra ILIKE ${p} OR s.name ILIKE ${p} OR r.observation ILIKE ${p} OR u.name ILIKE ${p})`,
      );
    }
    if (req.query.ra) {
      const ra = raSchema.safeParse(req.query.ra);
      if (!ra.success)
        throw new AppError(400, "RA inválido.", "VALIDATION_ERROR");
      filters.push(`r.student_ra=${add(ra.data)}`);
    }
    if (req.query.status) {
      const status = z
        .enum(["NEW", "IN_REVIEW", "RESOLVED"])
        .safeParse(req.query.status);
      if (!status.success)
        throw new AppError(400, "Status inválido.", "VALIDATION_ERROR");
      filters.push(`r.status=${add(status.data)}`);
    }
    for (const [key, op] of [
      ["de", ">="],
      ["ate", "<"],
    ] as const) {
      if (!req.query[key]) continue;
      const date = z.iso.date().safeParse(req.query[key]);
      if (!date.success)
        throw new AppError(400, "Data inválida.", "VALIDATION_ERROR");
      // Calendar dates follow the school's timezone; timestamps remain stored in UTC.
      filters.push(
        `r.created_at ${op} ((${add(date.data)}::date${key === "ate" ? " + 1" : ""})::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
      );
    }
    if (
      req.query.de &&
      req.query.ate &&
      String(req.query.de) > String(req.query.ate)
    )
      throw new AppError(
        400,
        "A data inicial deve vir antes da final.",
        "VALIDATION_ERROR",
      );
    const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
    const count = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM reports r JOIN students s ON s.ra=r.student_ra JOIN app_users u ON u.id=r.author_id ${where}`,
      values,
    );
    values.push(limit, offset);
    const result = await query(
      `${SELECT}${where} ORDER BY r.created_at DESC,r.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({ items: result.rows, page, limit, total: count.rows[0]!.total });
  } catch (error) {
    next(error);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const parsed = reportCreateSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        400,
        firstZodMessage(parsed.error),
        "VALIDATION_ERROR",
      );
    const v = parsed.data;
    const data = await transaction(async (client) => {
      const student = await client.query(
        `SELECT id,ra FROM students WHERE ${v.studentRa ? "ra=$1" : "id=$1"} AND active=TRUE FOR SHARE`,
        [v.studentRa || v.studentId],
      );
      const s = student.rows[0];
      if (!s)
        throw new AppError(
          404,
          "Aluno não encontrado ou inativo.",
          "STUDENT_NOT_FOUND",
        );
      if (v.studentId && v.studentId !== s.id)
        throw new AppError(
          400,
          "RA e aluno não correspondem.",
          "INVALID_REFERENCE",
        );
      const inserted = await client.query(
        `INSERT INTO reports(id,student_id,student_ra,author_id,observation,request_key)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(author_id,request_key) WHERE request_key IS NOT NULL DO NOTHING RETURNING id`,
        [
          randomUUID(),
          s.id,
          s.ra,
          req.user!.id,
          v.observation,
          v.requestKey || null,
        ],
      );
      let id = inserted.rows[0]?.id;
      if (!id) {
        const existing = await client.query(
          "SELECT id,student_ra,observation FROM reports WHERE author_id=$1 AND request_key=$2",
          [req.user!.id, v.requestKey],
        );
        const r = existing.rows[0];
        if (!r || r.student_ra !== s.ra || r.observation !== v.observation)
          throw new AppError(
            409,
            "Este envio já foi utilizado com outros dados.",
            "IDEMPOTENCY_CONFLICT",
          );
        id = r.id;
      } else {
        await audit(client, req.user!.id, "REPORT_CREATED", "report", id, {
          studentRa: s.ra,
        });
      }
      const report = await client.query(`${SELECT} WHERE r.id=$1`, [id]);
      return { report: report.rows[0], created: !!inserted.rows[0] };
    });
    res.status(data.created ? 201 : 200).json(data.report);
  } catch (error) {
    next(error);
  }
});
router.get("/:id", async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success)
      throw new AppError(400, "Relatório inválido.", "VALIDATION_ERROR");
    const result = await query(
      `${SELECT} WHERE r.id=$1 ${req.user!.role === "MONITOR" ? "AND r.author_id=$2" : ""}`,
      req.user!.role === "MONITOR" ? [id.data, req.user!.id] : [id.data],
    );
    if (!result.rows[0])
      throw new AppError(404, "Relatório não encontrado.", "NOT_FOUND");
    const events = await query(
      `SELECT e.id,e.status,e.note,e.created_at AS "createdAt",u.name AS "actorName"
      FROM report_events e JOIN app_users u ON u.id=e.actor_id WHERE e.report_id=$1 ORDER BY e.created_at,e.id`,
      [id.data],
    );
    res.json({ ...result.rows[0], events: events.rows });
  } catch (error) {
    next(error);
  }
});
router.patch(
  "/:id",
  requireRole("PROFESSOR", "ADMIN"),
  async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const parsed = reportReviewSchema.safeParse(req.body);
      if (!id.success || !parsed.success)
        throw new AppError(
          400,
          parsed.success
            ? "Relatório inválido."
            : firstZodMessage(parsed.error),
          "VALIDATION_ERROR",
        );
      const v = parsed.data;
      const report = await transaction(async (client) => {
        const old = await client.query(
          "SELECT version FROM reports WHERE id=$1 FOR UPDATE",
          [id.data],
        );
        if (!old.rows[0])
          throw new AppError(404, "Relatório não encontrado.", "NOT_FOUND");
        if (old.rows[0].version !== v.version)
          throw new AppError(
            409,
            "O relatório foi atualizado. Feche e abra novamente antes de salvar.",
            "VERSION_CONFLICT",
          );
        await client.query(
          "UPDATE reports SET status=$1,version=version+1,updated_at=NOW() WHERE id=$2",
          [v.status, id.data],
        );
        await client.query(
          "INSERT INTO report_events(id,report_id,actor_id,status,note) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), id.data, req.user!.id, v.status, v.note],
        );
        await audit(
          client,
          req.user!.id,
          "REPORT_REVIEWED",
          "report",
          id.data,
          { status: v.status },
        );
        return (await client.query(`${SELECT} WHERE r.id=$1`, [id.data]))
          .rows[0];
      });
      res.json(report);
    } catch (error) {
      next(error);
    }
  },
);
export default router;
