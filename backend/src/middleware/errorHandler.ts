import type { NextFunction, Request, Response } from 'express';
import { ValidationError as SequelizeValidationError, UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

/** 404 — eşleşmeyen rotalar. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Endpoint bulunamadı: ${req.method} ${req.originalUrl}`));
}

/** Merkezi hata yönetimi. Tüm rotalardan sonra eklenir. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = 'INTERNAL';
  let message = 'Sunucu hatası';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Doğrulama hatası';
    details = err.flatten().fieldErrors;
  } else if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Bu kayıt zaten mevcut';
    details = err.errors.map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof SequelizeValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Veri doğrulama hatası';
    details = err.errors.map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof Error) {
    message = err.message;
  }

  // 5xx hataları her zaman logla; 4xx'leri debug seviyesinde.
  const logMeta = {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    code,
    userId: req.user?.sub,
  };
  if (statusCode >= 500) {
    logger.error(message, { ...logMeta, stack: err instanceof Error ? err.stack : undefined });
  } else {
    logger.debug(message, logMeta);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 && isProd ? 'Sunucu hatası' : message,
      ...(details ? { details } : {}),
    },
  });
}
