import type { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Async route handler'ları sarmalar; reddedilen promise'leri
 * Express error middleware'ine yönlendirir (try/catch tekrarını önler).
 */
export const asyncHandler =
  (fn: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
