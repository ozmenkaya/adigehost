import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Ortam değişkenlerinin şema doğrulaması.
 * Uygulama açılışında geçersiz/eksik kritik değişkenler varsa
 * süreç hemen durur (fail-fast).
 */
const boolFromString = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .pipe(z.boolean());

const envSchema = z.object({
  // Uygulama
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_NAME: z.string().default('AdigeHost'),
  APP_URL: z.string().url().default('http://localhost:5000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  // Veritabanı
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('adigehost'),
  DB_USER: z.string().default('adigehost_user'),
  DB_PASS: z.string().default(''),
  DB_LOGGING: boolFromString.default('false'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // Şifreleme
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY 64 hex karakter (32 byte) olmalı'),

  // Entegrasyonlar (opsiyonel — runtime'da kullanıldığında kontrol edilir)
  HETZNER_API_TOKEN: z.string().optional(),
  WHM_HOST: z.string().optional(),
  WHM_PORT: z.coerce.number().int().positive().default(2087),
  WHM_USER: z.string().default('root'),
  WHM_API_TOKEN: z.string().optional(),
  DOMAIN_API_URL: z.string().optional(),
  DOMAIN_API_USER: z.string().optional(),
  DOMAIN_API_PASS: z.string().optional(),
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  IYZICO_BASE_URL: z.string().default('https://sandbox-api.iyzipay.com'),
  EDM_WSDL_URL: z.string().optional(),
  EDM_USER: z.string().optional(),
  EDM_PASS: z.string().optional(),
  EDM_TEST_MODE: boolFromString.default('true'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),

  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: boolFromString.default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('AdigeHost <noreply@adigehost.tr>'),

  // Admin seed
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASS: z.string().optional(),

  // Loglama
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),

  // Faturalandırma
  VAT_RATE: z.coerce.number().default(20),
  CURRENCY: z.string().default('TRY'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // logger henüz hazır olmayabilir; doğrudan stderr'e yaz.
  // eslint-disable-next-line no-console
  console.error('❌ Geçersiz ortam değişkenleri:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
