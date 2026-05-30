import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { redis } from '../config/redis';

export interface JwtPayload {
  sub: string; // user id
  role: 'admin' | 'client';
  email: string;
}

const REFRESH_PREFIX = 'refresh:';

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  } as SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

/**
 * Refresh token: rastgele opak değer. JWT değil; Redis'te saklanır,
 * böylece sunucu tarafında iptal (logout / rotation) mümkün olur.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  const ttlSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES);
  await redis.set(`${REFRESH_PREFIX}${token}`, userId, 'EX', ttlSeconds);
  return token;
}

export async function rotateRefreshToken(
  oldToken: string,
): Promise<{ userId: string; newToken: string } | null> {
  const userId = await redis.get(`${REFRESH_PREFIX}${oldToken}`);
  if (!userId) return null;
  await redis.del(`${REFRESH_PREFIX}${oldToken}`);
  const newToken = await issueRefreshToken(userId);
  return { userId, newToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await redis.del(`${REFRESH_PREFIX}${token}`);
}

/**
 * Tek-kullanımlık opak token (şifre sıfırlama, e-posta doğrulama).
 * Redis'te `<purpose>:<token>` → userId olarak TTL ile saklanır.
 */
export async function issueOneTimeToken(
  purpose: string,
  userId: string,
  ttlSeconds: number,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await redis.set(`ot:${purpose}:${token}`, userId, 'EX', ttlSeconds);
  return token;
}

/** Token'ı doğrular ve TÜKETİR (tek kullanım). Geçerliyse userId döner. */
export async function consumeOneTimeToken(purpose: string, token: string): Promise<string | null> {
  const key = `ot:${purpose}:${token}`;
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}

/** "15m", "7d", "3600s" gibi süreleri saniyeye çevirir. */
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return Number(duration) || 0;
  const value = Number(match[1]);
  const unit = match[2];
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * mult[unit];
}
