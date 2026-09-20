import { createHmac } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db.js";
import { AppError } from "./errors.js";
import type { AuthUser, UserRole } from "./types.js";
export const COOKIE_NAME = "jmonitora_session";
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      503,
      "Autenticação não configurada.",
      "AUTH_NOT_CONFIGURED",
    );
  return secret;
}
export function createSession(user: AuthUser, version = 1): string {
  return jwt.sign({ sub: user.id, version }, jwtSecret(), {
    algorithm: "HS256",
    expiresIn: "8h",
    issuer: "jmonitora",
  });
}
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token)
    return next(
      new AppError(401, "Faça login para continuar.", "UNAUTHORIZED"),
    );
  let userId: string;
  let tokenVersion: unknown;
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      issuer: "jmonitora",
      algorithms: ["HS256"],
    });
    if (typeof payload !== "object" || typeof payload.sub !== "string")
      throw new Error();
    userId = payload.sub;
    tokenVersion = payload.version ?? 1;
  } catch (error) {
    return next(
      error instanceof AppError
        ? error
        : new AppError(401, "Sessão inválida ou expirada.", "INVALID_SESSION"),
    );
  }
  try {
    const { rows } = await query<
      AuthUser & {
        active: boolean;
        approval_status: string;
        session_version: number;
        student_active: boolean | null;
      }
    >(
      `SELECT u.id, u.name, u.email, u.role, u.ra, u.active, u.approval_status, u.session_version, s.active AS student_active
       FROM app_users u LEFT JOIN students s ON s.ra=u.ra WHERE u.id=$1`,
      [userId],
    );
    const u = rows[0];
    if (
      !u?.active ||
      u.approval_status !== "APPROVED" ||
      u.session_version !== tokenVersion ||
      (u.role === "MONITOR" && u.ra && !u.student_active)
    ) {
      return next(
        new AppError(401, "Sessão inválida ou expirada.", "INVALID_SESSION"),
      );
    }
    req.user = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      ra: u.ra,
    };
    next();
  } catch (error) {
    next(error);
  }
}
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user)
      return next(
        new AppError(401, "Faça login para continuar.", "UNAUTHORIZED"),
      );
    if (!roles.includes(req.user.role))
      return next(
        new AppError(
          403,
          "Você não possui permissão para esta ação.",
          "FORBIDDEN",
        ),
      );
    next();
  };
}
export function requireSameOrigin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site")
    return next(new AppError(403, "Origem não permitida.", "INVALID_ORIGIN"));
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    const expected =
      process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
    if (new URL(origin).origin === new URL(expected).origin) return next();
  } catch {
    /* reject malformed origins */
  }
  next(
    new AppError(403, "Origem da requisição não permitida.", "INVALID_ORIGIN"),
  );
}
/** Database-backed throttling works across serverless instances and shared school Wi-Fi. */
export async function limitAuth(key: string, maximum = 12) {
  const hash = createHmac("sha256", jwtSecret()).update(key).digest("hex");
  const result = await query<{ attempts: number }>(
    `INSERT INTO auth_attempts(key_hash,attempts,expires_at)
    VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN auth_attempts.expires_at<NOW() THEN 1 ELSE auth_attempts.attempts+1 END,
    expires_at=CASE WHEN auth_attempts.expires_at<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE auth_attempts.expires_at END
    RETURNING attempts`,
    [hash],
  );
  if (result.rows[0]!.attempts > maximum)
    throw new AppError(
      429,
      "Muitas tentativas. Aguarde 15 minutos.",
      "RATE_LIMITED",
    );
  // Bounded cleanup avoids collecting identifiers indefinitely.
  await query(
    "DELETE FROM auth_attempts WHERE key_hash IN (SELECT key_hash FROM auth_attempts WHERE expires_at < NOW() LIMIT 100)",
  );
}
