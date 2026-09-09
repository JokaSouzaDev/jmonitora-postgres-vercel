import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { firstZodMessage, reportCreateSchema } from '../schemas.js';

interface ReportRow {
  id: string;
  observation: string;
  createdAt: string;
  updatedAt: string;
  studentId: string;
  studentRa: string;
  studentName: string;
  course: string;
  authorId: string;
  authorName: string;
}

const SELECT_REPORT = `
  SELECT r.id, r.observation, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
         s.id AS "studentId", s.ra AS "studentRa", s.name AS "studentName", s.course,
         u.id AS "authorId", u.name AS "authorName"
    FROM reports r
    JOIN students s ON s.id = r.student_id
    JOIN app_users u ON u.id = r.author_id`;

const router = Router();
router.use(requireAuth);

router.post('/', requireRole('MONITOR', 'PROFESSOR', 'ADMIN'), async (req, res, next) => {
  try {
    const parsed = reportCreateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstZodMessage(parsed.error), 'VALIDATION_ERROR');

    const student = await query<{ id: string }>('SELECT id FROM students WHERE id = $1 AND active = TRUE', [parsed.data.studentId]);
    if (!student.rows[0]) throw new AppError(404, 'Aluno não encontrado ou inativo.', 'STUDENT_NOT_FOUND');

    const id = randomUUID();
    await query(
      'INSERT INTO reports (id, student_id, author_id, observation) VALUES ($1, $2, $3, $4)',
      [id, parsed.data.studentId, req.user!.id, parsed.data.observation],
    );
    const result = await query<ReportRow>(`${SELECT_REPORT} WHERE r.id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/', requireRole('PROFESSOR', 'ADMIN'), async (req, res, next) => {
  try {
    const search = String(req.query.busca ?? '').trim();
    const values: unknown[] = [];
    let where = '';
    if (search) {
      values.push(`%${search}%`);
      where = ` WHERE s.ra ILIKE $1 OR s.name ILIKE $1 OR r.observation ILIKE $1 OR u.name ILIKE $1`;
    }
    const result = await query<ReportRow>(`${SELECT_REPORT}${where} ORDER BY r.created_at DESC LIMIT 1000`, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireRole('PROFESSOR', 'ADMIN'), async (req, res, next) => {
  try {
    const result = await query<ReportRow>(`${SELECT_REPORT} WHERE r.id = $1`, [String(req.params.id ?? '')]);
    if (!result.rows[0]) throw new AppError(404, 'Relatório não encontrado.', 'NOT_FOUND');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
