import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { closePool, query } from '../src/db.js';

const name = process.env.ADMIN_NAME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!name || !email || !password || password.length < 8) {
  throw new Error('Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 8 caracteres).');
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO app_users (id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'ADMIN')
     ON CONFLICT (LOWER(email)) DO UPDATE SET
       name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, active = TRUE`,
    [randomUUID(), name, email, passwordHash],
  );
  console.log(`Administrador configurado: ${email}`);
} finally {
  await closePool();
}
