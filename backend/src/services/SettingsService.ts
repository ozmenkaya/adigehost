import { Setting } from '../models/Setting';

/**
 * Sistem ayarları okuma/yazma yardımcısı (settings tablosu).
 * Hassas değerler için ileride şifreleme eklenecek (isEncrypted alanı mevcut).
 */
export class SettingsService {
  static async get(key: string, fallback = ''): Promise<string> {
    const row = await Setting.findByPk(key);
    return row?.value ?? fallback;
  }

  static async getMany(keys: string[]): Promise<Record<string, string>> {
    const rows = await Setting.findAll({ where: { key: keys } });
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = rows.find((r) => r.key === k)?.value ?? '';
    return out;
  }

  static async getGroup(group: string): Promise<Record<string, string>> {
    const rows = await Setting.findAll({ where: { group } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
  }

  static async set(key: string, value: string, group?: string): Promise<void> {
    await Setting.upsert({ key, value, ...(group ? { group } : {}) });
  }

  static async setMany(entries: Record<string, string>, group?: string): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value, group);
    }
  }
}

/** Banka/havale bilgisi anahtarları (group: payment). */
export const BANK_KEYS = ['bank_name', 'bank_iban', 'bank_account_holder', 'bank_branch'];
