import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  COOKIE_NAME,
  createSession,
  limitAuth,
  requireAuth,
  sessionCookieOptions,
} from "../auth.js";
import { query, transaction } from "../db.js";
import { audit } from "../audit.js";
import { AppError } from "../errors.js";
import {
  firstZodMessage,
  loginSchema,
  passwordSchema,
  registrationSchema,
} from "../schemas.js";
import type { AuthUser } from "../types.js";
interface UserRow extends AuthUser {
  password_hash: string;
  active: boolean;
  approval_status: string;
  session_version: number;
  student_active: boolean | null;
}
const router = Router();
// Compare against an actual bcrypt hash even when the account is unknown.
const dummyHash = "$2b$12$gkWKQw8MMqzPatUSPRUN0e55elBJpa1kiwicfox1jurUn/l5ARVau";
async function createInitialAdmin(identifier: string) {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (
    identifier !== email ||
    !name ||
    !passwordSchema.safeParse(password).success
  )
    return;
  const hash = await bcrypt.hash(password!, 12);
  await query(
    `INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')
    ON CONFLICT(LOWER(email)) DO NOTHING`,
    [randomUUID(), name, email, hash],
  );
}
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        400,
        firstZodMessage(parsed.error),
        "VALIDATION_ERROR",
      );
    const identifier = (parsed.data.identifier || parsed.data.email!).trim();
    // Per identifier avoids locking out an entire school behind a shared IP.
    await limitAuth(`login:${identifier.toLowerCase()}`);
    const lookup = async () =>
      query<UserRow>(
        `SELECT u.*, s.active AS student_active FROM app_users u
      LEFT JOIN students s ON s.ra=u.ra WHERE ${identifier.includes("@") ? "u.email=$1" : "u.ra=$1"} LIMIT 1`,
        [
          identifier.includes("@")
            ? identifier.toLowerCase()
            : identifier.toUpperCase(),
        ],
      );
    let result = await lookup();
    if (!result.rows[0]) {
      await createInitialAdmin(identifier.toLowerCase());
      result = await lookup();
    }
    const row = result.rows[0];
    const valid = await bcrypt.compare(
      parsed.data.password,
      row?.password_hash || dummyHash,
    );
    if (!row || !valid)
      throw new AppError(
        401,
        "RA, e-mail ou senha incorretos.",
        "INVALID_CREDENTIALS",
      );
    if (row.approval_status === "PENDING")
      throw new AppError(
        403,
        "Seu cadastro aguarda aprovação da escola.",
        "PENDING_APPROVAL",
      );
    if (
      !row.active ||
      row.approval_status !== "APPROVED" ||
      (row.role === "MONITOR" && row.ra && !row.student_active)
    ) {
      throw new AppError(
        403,
        "Acesso desativado. Procure o administrador da escola.",
        "ACCOUNT_DISABLED",
      );
    }
    const user: AuthUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      ra: row.ra,
    };
    res.cookie(
      COOKIE_NAME,
      createSession(user, row.session_version),
      sessionCookieOptions(),
    );
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
router.post("/register", async (req, res, next) => {
  try {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        400,
        firstZodMessage(parsed.error),
        "VALIDATION_ERROR",
      );
    await limitAuth(`register:${req.ip}`, 30);
    const v = parsed.data;
    const message =
      "Solicitação recebida. Aguarde a aprovação da escola. Se já possui cadastro, use a tela de entrada.";
    if (v.email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) {
      res.status(202).json({ message });
      return;
    }
    const hash = await bcrypt.hash(v.password, 12);
    await transaction(async (client) => {
      if (v.ra) {
        const student = await client.query(
          "SELECT ra FROM students WHERE ra=$1 AND active=TRUE FOR SHARE",
          [v.ra],
        );
        if (!student.rows[0])
          throw new AppError(
            400,
            "Confira o RA com a escola antes de solicitar acesso.",
            "INVALID_RA",
          );
      }
      const inserted = await client.query(
        `INSERT INTO app_users(id,name,email,password_hash,role,ra,active,approval_status)
        VALUES($1,$2,$3,$4,$5,$6,FALSE,'PENDING') ON CONFLICT DO NOTHING RETURNING id`,
        [randomUUID(), v.name, v.email, hash, v.role, v.ra],
      );
      if (inserted.rows[0])
        await audit(
          client,
          null,
          "ACCESS_REQUESTED",
          "user",
          inserted.rows[0].id,
          { role: v.role },
        );
    });
    res.status(202).json({ message });
  } catch (error) {
    next(error);
  }
});
router.post("/password", requireAuth, async (req, res, next) => {
  try {
    const current = req.body?.currentPassword;
    const parsed = passwordSchema.safeParse(req.body?.newPassword);
    if (typeof current !== "string" || !parsed.success)
      throw new AppError(
        400,
        "Informe a senha atual e uma nova senha de 8 a 72 bytes.",
        "VALIDATION_ERROR",
      );
    await limitAuth(`password:${req.user!.id}`);
    await transaction(async (client) => {
      const result = await client.query(
        "SELECT password_hash FROM app_users WHERE id=$1 FOR UPDATE",
        [req.user!.id],
      );
      if (!(await bcrypt.compare(current, result.rows[0].password_hash)))
        throw new AppError(400, "Senha atual incorreta.", "INVALID_PASSWORD");
      await client.query(
        `UPDATE app_users SET password_hash=$1,session_version=session_version+1,version=version+1,updated_at=NOW() WHERE id=$2`,
        [await bcrypt.hash(parsed.data, 12), req.user!.id],
      );
      await audit(
        client,
        req.user!.id,
        "PASSWORD_CHANGED",
        "user",
        req.user!.id,
      );
    });
    res.clearCookie(COOKIE_NAME, {
      ...sessionCookieOptions(),
      maxAge: undefined,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    ...sessionCookieOptions(),
    maxAge: undefined,
  });
  res.status(204).end();
});
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
export default router;
