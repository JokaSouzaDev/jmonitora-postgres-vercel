import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { requireSameOrigin } from './auth.js';
import { query } from './db.js';
import { AppError } from './errors.js';
import authRoutes from './routes/authRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '../public');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(requireSameOrigin);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em instantes.' },
});
app.use('/api', apiLimiter, (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', async (_req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'online', database: 'connected', service: 'JMonitora+' });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/alunos', studentRoutes);
app.use('/api/relatorios', reportRoutes);
app.use('/api/usuarios', userRoutes);

// Utilizado apenas no desenvolvimento local. Na Vercel, public/** é servido pela CDN.
if (process.env.VERCEL !== '1') app.use(express.static(publicDir));

app.use('/api', (_req, _res, next) => next(new AppError(404, 'Rota não encontrada.', 'NOT_FOUND')));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ erro: error.message, codigo: error.code });
    return;
  }

  const pgCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (pgCode === '23505') {
    res.status(409).json({ erro: 'Já existe um cadastro com esses dados.', codigo: 'DUPLICATE' });
    return;
  }
  if (pgCode === '23503' || pgCode === '22P02') {
    res.status(400).json({ erro: 'Referência ou identificador inválido.', codigo: 'INVALID_REFERENCE' });
    return;
  }

  console.error('Erro não tratado:', error);
  res.status(500).json({ erro: 'Erro interno do servidor.', codigo: 'INTERNAL_ERROR' });
});

export default app;
