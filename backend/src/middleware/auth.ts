import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken, type JwtPayload } from '../security/tokens';

/**
 * Access token'ı doğrular. Token öncelik sırası:
 *   1) Authorization: Bearer <token>
 *   2) HttpOnly cookie: access_token
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.access_token;
  return cookieToken ?? null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('Oturum bulunamadı');
  }
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw ApiError.unauthorized('Geçersiz veya süresi dolmuş token');
  }
}

/** Belirli rolleri zorunlu kılar. authenticate'ten sonra kullanılır. */
export function requireRole(...roles: Array<JwtPayload['role']>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden();
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
