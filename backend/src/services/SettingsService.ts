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

/** Domain fiyatlama ayarları. */
export const DOMAIN_KEYS = [
  'domain_provider',  // 'alantron' | 'domainnameapi'
  'domain_markup',    // kâr marjı çarpanı (ör. 1.3 = %30)
  'vat_rate',         // KDV oranı (ör. 20)
];

/** VPS (Hetzner Cloud) fiyatlama ayarları. */
export const VPS_KEYS = [
  'vps_markup',       // kâr marjı çarpanı (ör. 1.4 = %40)
];

/** Satıcı (şirket) bilgisi anahtarları (group: company) — e-fatura "satıcı" alanları. */
export const COMPANY_KEYS = [
  'company_title', // ünvan
  'company_vkn', // VKN
  'company_tax_office', // vergi dairesi
  'company_address',
  'company_city',
  'company_district',
  'company_postal_code',
  'company_email',
  'company_phone',
  'company_alias', // EDM GB/PK etiketi (gönderici alias)
];
