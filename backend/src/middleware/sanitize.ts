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

/**
 * Ham bırakılacak alanlar: destek talebi mesajları.
 * Müşteri sık sık nginx config, hata çıktısı veya HTML yapıştırır; tag'leri
 * silmek içeriği sessizce yok eder. Bu alanlar HİÇBİR yerde HTML olarak
 * basılmaz — React metin olarak (otomatik escape) ve e-posta şablonları
 * NotificationService'teki `esc()` ile render eder.
 */
const RAW_TEXT_FIELDS = new Set(['message']);

function cleanBody(body: Record<string, unknown>, rawFields: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = rawFields.has(k) && typeof v === 'string' ? v.trim() : clean(v);
  }
  return out;
}

/** İstek yolu destek talebi mesajı taşıyor mu? */
function isTicketMessagePath(path: string): boolean {
  return /^\/api\/(admin\/)?tickets(\/|$)/.test(path);
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = Array.isArray(req.body)
      ? (clean(req.body) as Record<string, unknown>)
      : cleanBody(
          req.body as Record<string, unknown>,
          isTicketMessagePath(req.path) ? RAW_TEXT_FIELDS : new Set(),
        );
  }
  next();
}
