import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { firstZodMessage, studentCreateSchema, studentUpdateSchema } from '../schemas.js';

interface StudentRow {
  id: string;
  ra: string;
  name: string;
  email: string | null;
  course: string;
  semester: number;
  phone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.inativos === 'true' && ['PROFESSOR', 'ADMIN'].includes(req.user!.role);
    const search = String(req.query.busca ?? '').trim();
    const values: unknown[] = [];
    const filters: string[] = [];
    if (!includeInactive) filters.push('active = TRUE');
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(ra ILIKE $${values.length} OR name ILIKE $${values.length})`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const columns = req.user!.role === 'MONITOR'
      ? 'id, ra, name, course, semester, active'
      : 'id, ra, name, email, course, semester, phone, active, created_at AS "createdAt", updated_at AS "updatedAt"';
    const result = await query<StudentRow>(
      `SELECT ${columns}
         FROM students ${where} ORDER BY name ASC LIMIT 500`,
      values,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('PROFESSOR', 'ADMIN'), async (req, res, next) => {
  try {
    const parsed = studentCreateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstZodMessage(parsed.error), 'VALIDATION_ERROR');
    const student = parsed.data;
    const result = await query<StudentRow>(
      `INSERT INTO students (id, ra, name, email, course, semester, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, ra, name, email, course, semester, phone, active,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [randomUUID(), student.ra, student.name, student.email, student.course, student.semester, student.phone],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireRole('PROFESSOR', 'ADMIN'), async (req, res, next) => {
  try {
    const parsed = studentUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstZodMessage(parsed.error), 'VALIDATION_ERROR');

    const entries = Object.entries(parsed.data);
    const columnMap: Record<string, string> = {
      ra: 'ra', name: 'name', email: 'email', course: 'course', semester: 'semester', phone: 'phone', active: 'active',
    };
    const sets = entries.map(([key], index) => `${columnMap[key]} = $${index + 1}`);
    const values = entries.map(([, value]) => value);
    values.push(String(req.params.id ?? ''));

    const result = await query<StudentRow>(
      `UPDATE students SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING id, ra, name, email, course, semester, phone, active,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    if (!result.rows[0]) throw new AppError(404, 'Aluno não encontrado.', 'NOT_FOUND');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
