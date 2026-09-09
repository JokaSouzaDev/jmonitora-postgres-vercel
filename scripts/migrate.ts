import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { closePool, query } from '../src/db.js';

try {
  const sql = await readFile(path.resolve('db/schema.sql'), 'utf8');
  await query(sql);
  console.log('Estrutura do PostgreSQL criada/atualizada com sucesso.');
} finally {
  await closePool();
}
