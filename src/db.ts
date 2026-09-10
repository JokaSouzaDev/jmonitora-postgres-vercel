import pg from 'pg';
import { AppError } from './errors.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (pool) return pool;

  const preferredConnectionStrings = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_DATABASE_URL,
    process.env.DATABASE_URL_POSTGRES_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.STORAGE_URL,
    process.env.POSTGRES_URL,
    process.env.NEON_DATABASE_URL,
  ];

  const detectedConnectionString = Object.entries(process.env).find(
    ([key, value]) =>
      (key.endsWith('DATABASE_URL') || key.endsWith('POSTGRES_URL') || key.endsWith('URL_UNPOOLED')) &&
      typeof value === 'string' &&
      /^postgres(?:ql)?:\/\//i.test(value),
  )?.[1];

  const connectionString =
    preferredConnectionStrings.find((value) => value && /^postgres(?:ql)?:\/\//i.test(value)) ??
    detectedConnectionString;

  if (!connectionString) {
    throw new AppError(503, 'Banco de dados não configurado.', 'DATABASE_NOT_CONFIGURED');
  }

  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (error) => {
    console.error('Falha inesperada no pool PostgreSQL:', error.message);
  });

  return pool;
}

export function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
