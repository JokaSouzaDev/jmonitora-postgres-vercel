import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { closePool, query } from '../src/db.js';

interface LegacyReport { id: string; ra: string; observacao: string; criadoEm: string }

const authorEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
if (!authorEmail) throw new Error('Configure ADMIN_EMAIL antes de importar os dados antigos.');

try {
  const author = await query<{ id: string }>('SELECT id FROM app_users WHERE email = $1', [authorEmail]);
  const authorId = author.rows[0]?.id;
  if (!authorId) throw new Error('Administrador não encontrado. Execute npm run db:seed primeiro.');

  const raw = await readFile(path.resolve('legacy-data/relatorios.json'), 'utf8');
  const reports = JSON.parse(raw) as LegacyReport[];

  for (const legacy of reports) {
    let student = await query<{ id: string }>('SELECT id FROM students WHERE LOWER(ra) = LOWER($1)', [legacy.ra]);
    let studentId = student.rows[0]?.id;
    if (!studentId) {
      studentId = randomUUID();
      await query(
        `INSERT INTO students (id, ra, name, course, semester)
         VALUES ($1, $2, $3, 'Não informado', 1)`,
        [studentId, legacy.ra, `Aluno RA ${legacy.ra}`],
      );
    }

    await query(
      `INSERT INTO reports (id, student_id, author_id, observation, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [legacy.id, studentId, authorId, legacy.observacao, legacy.criadoEm],
    );
  }
  console.log(`${reports.length} relatórios antigos processados sem duplicação.`);
} finally {
  await closePool();
}
