import type { NextFunction, Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';

/**
 * Gelen body string alanlarındaki tehlikeli HTML/script'i temizler (XSS koruması).
 * Varsayılan: hiçbir tag/attribute'a izin verme (düz metin).
 * Zengin metin gereken alanlar (örn. ticket mesajı) route bazında ayrıca yönetilir.
 */
function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clean(v);
    }
    return out;
  }
  return value;
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = clean(req.body) as Record<string, unknown>;
  }
  next();
}
