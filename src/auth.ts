import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { AppError } from './errors.js';
import type { AuthUser, UserRole } from './types.js';

export const COOKIE_NAME = 'jmonitora_session';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new AppError(503, 'Autenticação não configurada.', 'AUTH_NOT_CONFIGURED');
  }
  return secret;
}

export function createSession(user: AuthUser): string {
  return jwt.sign({ sub: user.id }, jwtSecret(), { expiresIn: '8h', issuer: 'jmonitora' });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return next(new AppError(401, 'Faça login para continuar.', 'UNAUTHORIZED'));

  try {
    const payload = jwt.verify(token, jwtSecret(), { issuer: 'jmonitora' });
    const userId = typeof payload === 'object' ? payload.sub : undefined;
    if (!userId) throw new Error('Token sem usuário.');
    const result = await query<AuthUser & { active: boolean }>(
      'SELECT id, name, email, role, active FROM app_users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const user = result.rows[0];
    if (!user?.active) throw new Error('Usuário inativo.');
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch {
    next(new AppError(401, 'Sessão inválida ou expirada.', 'INVALID_SESSION'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError(401, 'Faça login para continuar.', 'UNAUTHORIZED'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'Você não possui permissão para esta ação.', 'FORBIDDEN'));
    }
    next();
  };
}

export function requireSameOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();

  try {
    const originHost = new URL(origin).host;
    const requestHost = req.get('x-forwarded-host') ?? req.get('host');
    if (requestHost && originHost === requestHost) return next();
  } catch {
    // A origem será rejeitada abaixo.
  }

  next(new AppError(403, 'Origem da requisição não permitida.', 'INVALID_ORIGIN'));
}
