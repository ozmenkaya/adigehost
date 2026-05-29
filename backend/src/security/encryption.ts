import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * AES-256-GCM simetrik şifreleme.
 * Hassas veriler (API key, kart token, WHM token) DB'ye bu fonksiyonlarla
 * şifrelenerek yazılır.
 *
 * Çıktı formatı: iv(12B):authTag(16B):ciphertext  — hepsi hex, ':' ile ayrık.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM için önerilen
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex'); // 32 byte

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Geçersiz şifreli veri formatı');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Boş/null güvenli sarmalayıcılar (opsiyonel alanlar için). */
export function encryptNullable(value?: string | null): string | null {
  return value ? encrypt(value) : null;
}

export function decryptNullable(value?: string | null): string | null {
  return value ? decrypt(value) : null;
}
