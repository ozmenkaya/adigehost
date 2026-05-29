import type { NextFunction, Request, Response } from 'express';
import { type AnyZodObject, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * Zod şemasıyla request doğrulama middleware'i.
 * body/query/params'ı tek şemada doğrular ve temizlenmiş veriyi geri yazar.
 *
 * Kullanım:
 *   router.post('/', validate(z.object({ body: loginSchema })), handler)
 */
export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body) req.body = parsed.body;
      // query/params salt-okunur olabilir; sadece body'yi geri yazıyoruz.
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(ApiError.badRequest('Doğrulama hatası', err.flatten().fieldErrors));
      } else {
        next(err);
      }
    }
  };
}
