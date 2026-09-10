import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { COOKIE_NAME, createSession, requireAuth, sessionCookieOptions } from '../auth.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { firstZodMessage, loginSchema } from '../schemas.js';
import type { AuthUser, UserRole } from '../types.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  active: boolean;
}

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

async function createInitialAdmin(email: string): Promise<void> {
  const adminName = process.env.ADMIN_NAME?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (email !== adminEmail || !adminName || !adminPassword || adminPassword.length < 8) return;

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await query(
    `INSERT INTO app_users (id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'ADMIN')
     ON CONFLICT (LOWER(email)) DO NOTHING`,
    [randomUUID(), adminName, adminEmail, passwordHash],
  );
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstZodMessage(parsed.error), 'VALIDATION_ERROR');

    let result = await query<UserRow>(
      `SELECT id, name, email, password_hash, role, active
         FROM app_users WHERE email = $1 LIMIT 1`,
      [parsed.data.email],
    );

    if (!result.rows[0]) {
      await createInitialAdmin(parsed.data.email);
      result = await query<UserRow>(
        `SELECT id, name, email, password_hash, role, active
           FROM app_users WHERE email = $1 LIMIT 1`,
        [parsed.data.email],
      );
    }

    const row = result.rows[0];
    const valid = row?.active && await bcrypt.compare(parsed.data.password, row.password_hash);
    if (!row || !valid) throw new AppError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');

    const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
    res.cookie(COOKIE_NAME, createSession(user), sessionCookieOptions());
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
