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
  issueOneTimeToken,
  consumeOneTimeToken,
} from '../security/tokens';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { NotificationService } from '../services/NotificationService';

const VERIFY_TTL = 24 * 60 * 60; // 24 saat
const RESET_TTL = 60 * 60; // 1 saat

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
    // Fatura / KVKK bilgileri
    identityType: z.enum(['individual', 'corporate']).default('individual'),
    taxNumber: z.string().max(20).optional(), // VKN (kurumsal) / TCKN (bireysel)
    taxOffice: z.string().max(100).optional(), // vergi dairesi (kurumsal)
    company: z.string().max(150).optional(), // ünvan (kurumsal)
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    district: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
  }),
});

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const existing = await User.findOne({ where: { email: b.email } });
    if (existing) throw ApiError.conflict('Bu e-posta zaten kayıtlı');

    const user = await User.create({
      firstName: b.firstName,
      lastName: b.lastName,
      email: b.email,
      password: await hashPassword(b.password),
      phone: b.phone,
      identityType: b.identityType ?? 'individual',
      taxNumber: b.taxNumber ?? null,
      taxOffice: b.taxOffice ?? null,
      company: b.company ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      district: b.district ?? null,
      postalCode: b.postalCode ?? null,
      role: 'client',
      // Müşteri kaydı sonrası direkt aktif. E-posta doğrulama linki
      // gönderilir ama satın alma/erişim için zorunlu değildir.
      status: 'active',
    });

    // E-posta doğrulama linki gönder (SMTP yoksa log'a yazılır).
    const verifyToken = await issueOneTimeToken('verify', user.id, VERIFY_TTL);
    await NotificationService.sendEmailVerification(user.email, verifyToken);

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
      message: 'Kayıt başarılı. E-posta adresinize doğrulama linki gönderildi.',
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

// --- POST /auth/verify-email ---
const verifyEmailSchema = z.object({ body: z.object({ token: z.string().min(10) }) });

authRouter.post(
  '/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const userId = await consumeOneTimeToken('verify', req.body.token);
    if (!userId) throw ApiError.badRequest('Geçersiz veya süresi dolmuş doğrulama linki');

    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Kullanıcı bulunamadı');

    user.emailVerified = true;
    if (user.status === 'pending') user.status = 'active';
    await user.save();
    await logActivity({
      userId: user.id,
      action: 'auth.email_verified',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'E-posta adresiniz doğrulandı' });
  }),
);

// --- POST /auth/forgot-password ---
const forgotSchema = z.object({ body: z.object({ email: z.string().email() }) });

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(forgotSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ where: { email: req.body.email } });
    // E-posta varlığını sızdırmamak için her durumda aynı yanıt döner.
    if (user && user.status !== 'suspended') {
      const token = await issueOneTimeToken('reset', user.id, RESET_TTL);
      await NotificationService.sendPasswordReset(user.email, token);
      await logActivity({
        userId: user.id,
        action: 'auth.password_reset_requested',
        resource: 'user',
        resourceId: user.id,
        ip: req.ip,
      });
    }
    res.json({
      success: true,
      message: 'E-posta adresiniz kayıtlıysa şifre sıfırlama linki gönderildi.',
    });
  }),
);

// --- POST /auth/reset-password ---
const resetSchema = z.object({
  body: z.object({ token: z.string().min(10), password: z.string().min(8).max(128) }),
});

authRouter.post(
  '/reset-password',
  authLimiter,
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const userId = await consumeOneTimeToken('reset', req.body.token);
    if (!userId) throw ApiError.badRequest('Geçersiz veya süresi dolmuş sıfırlama linki');

    const user = await User.scope('withSecret').findByPk(userId);
    if (!user) throw ApiError.notFound('Kullanıcı bulunamadı');

    user.password = await hashPassword(req.body.password);
    await user.save();
    await logActivity({
      userId: user.id,
      action: 'auth.password_reset',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });
    res.json({
      success: true,
      message: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.',
    });
  }),
);
