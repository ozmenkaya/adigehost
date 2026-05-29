import type { JwtPayload } from '../security/tokens';

/**
 * Express Request nesnesine auth bağlamı ekler.
 * auth middleware'i req.user'ı doldurur.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}

export {};
