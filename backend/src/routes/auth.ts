import { Router } from 'express';
import { z } from 'zod';
import { env, isProd } from '../config/env';
import { User } from '../models/User';
import { hashPassword, verifyPassword } from '../security/password';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  parseDurationToSeconds,
} from '../security/tokens';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

export const authRouter = Router();

const REFRESH_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path: '/',
  };
}

function setAuthCookies(
  res: import('express').Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(
    ACCESS_COOKIE,
    accessToken,
    cookieOpts(parseDurationToSeconds(env.JWT_ACCESS_EXPIRES) * 1000),
  );
  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    cookieOpts(parseDurationToSeconds(env.JWT_REFRESH_EXPIRES) * 1000),
  );
}

const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(100),
    lastName: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    phone: z.string().max(30).optional(),
    company: z.string().max(150).optional(),
  }),
});

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, phone, company } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) throw ApiError.conflict('Bu e-posta zaten kayıtlı');

    const user = await User.create({
      firstName,
      lastName,
      email,
      password: await hashPassword(password),
      phone,
      company,
      role: 'client',
      status: 'pending',
    });

    await logActivity({
      userId: user.id,
      action: 'auth.register',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email },
      message: 'Kayıt başarılı. E-posta doğrulaması bekleniyor.',
    });
  }),
);

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.scope('withSecret').findOne({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      throw ApiError.unauthorized('E-posta veya şifre hatalı');
    }
    if (user.status === 'suspended') {
      throw ApiError.forbidden('Hesabınız askıya alınmış');
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);

    user.lastLogin = new Date();
    await user.save();
    await logActivity({
      userId: user.id,
      action: 'auth.login',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
      },
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    if (!token) throw ApiError.unauthorized('Refresh token yok');
    const rotated = await rotateRefreshToken(token);
    if (!rotated) throw ApiError.unauthorized('Geçersiz refresh token');

    const user = await User.findByPk(rotated.userId);
    if (!user) throw ApiError.unauthorized();

    const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
    setAuthCookies(res, accessToken, rotated.newToken);
    res.json({ success: true, data: { accessToken } });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.json({ success: true, message: 'Çıkış yapıldı' });
  }),
);

// TODO (kodlama fazı): forgot-password, reset-password, verify-email
