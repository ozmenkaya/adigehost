import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env, isProd } from './env';

/**
 * Winston logger.
 * - Geliştirmede renkli konsol çıktısı
 * - Production'da JSON + günlük dosya rotasyonu
 * - Hassas alanlar (token, password, key) maskeleme ile loglanmamalı;
 *   bunun için logda asla ham obje yerine seçilmiş alanlar geçirin.
 */
const SENSITIVE_KEYS = [
  'password',
  'pass',
  'token',
  'secret',
  'api_key',
  'apiKey',
  'authorization',
  'card_token',
  'cardToken',
  'cvv',
  'encryption_key',
];

/** Log objelerinde hassas alanları maskeler. */
const maskSensitive = winston.format((info) => {
  const mask = (obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(mask);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
        out[k] = '***';
      } else if (typeof v === 'object') {
        out[k] = mask(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return mask(info) as winston.Logform.TransformableInfo;
});

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  maskSensitive(),
  winston.format.json(),
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProd ? fileFormat : consoleFormat,
  }),
];

if (isProd) {
  transports.push(
    new DailyRotateFile({
      dirname: path.resolve(env.LOG_DIR),
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
    new DailyRotateFile({
      dirname: path.resolve(env.LOG_DIR),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    }),
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'adigehost-api' },
  transports,
  exitOnError: false,
});
