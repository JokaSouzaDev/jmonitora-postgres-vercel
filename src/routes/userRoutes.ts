import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { firstZodMessage, userCreateSchema, userUpdateSchema } from '../schemas.js';
import type { UserRole } from '../types.js';

interface PublicUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    const result = await query<PublicUserRow>(
      `SELECT id, name, email, role, active, created_at AS "createdAt"
         FROM app_users ORDER BY name ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstZodMessage(parsed.error), 'VALIDATION_ERROR');
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await query<PublicUserRow>(
      `INSERT INTO app_users (id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, active, created_at AS "createdAt"`,
      [randomUUID(), parsed.data.name, parsed.data.email, passwordHash, parsed.data.role],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstZodMessage(parsed.error), 'VALIDATION_ERROR');
    const userId = String(req.params.id ?? '');
    if (userId === req.user!.id && parsed.data.active === false) {
      throw new AppError(400, 'Você não pode desativar o próprio usuário.', 'SELF_DEACTIVATION');
    }

    const updates: Array<[string, unknown]> = [];
    if (parsed.data.name !== undefined) updates.push(['name', parsed.data.name]);
    if (parsed.data.role !== undefined) updates.push(['role', parsed.data.role]);
    if (parsed.data.active !== undefined) updates.push(['active', parsed.data.active]);
    if (parsed.data.password !== undefined) updates.push(['password_hash', await bcrypt.hash(parsed.data.password, 12)]);

    const sets = updates.map(([column], index) => `${column} = $${index + 1}`);
    const values = updates.map(([, value]) => value);
    values.push(userId);
    const result = await query<PublicUserRow>(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id = $${values.length}
       RETURNING id, name, email, role, active, created_at AS "createdAt"`,
      values,
    );
    if (!result.rows[0]) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
