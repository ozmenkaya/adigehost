import { Integration } from '../models/Integration';
import { encrypt, decrypt } from '../security/encryption';
import { getProvider } from '../config/integrationProviders';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

type Creds = Record<string, unknown>;

/** Sağlayıcı kimlik bilgisi önbelleği (servislerin sık DB sorgusunu önler). */
const cache = new Map<string, { values: Creds; ts: number }>();
const CACHE_TTL = 60_000;

export class IntegrationService {
  /** Bir sağlayıcının varsayılan + aktif bağlantısının çözülmüş kimlik bilgileri. */
  static async getCredentials(provider: string): Promise<Creds | null> {
    const cached = cache.get(provider);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.values;

    const integ = await Integration.findOne({
      where: { provider, isActive: true, isDefault: true },
    });
    const fallback = integ ?? (await Integration.findOne({ where: { provider, isActive: true } }));
    if (!fallback) return null;

    const values = JSON.parse(decrypt(fallback.credentials)) as Creds;
    cache.set(provider, { values, ts: Date.now() });
    return values;
  }

  static invalidate(provider?: string): void {
    if (provider) cache.delete(provider);
    else cache.clear();
  }

  /** Admin listesi — gizli alanlar maskelenir, gizli olmayanlar gösterilir. */
  static async listForAdmin(): Promise<unknown[]> {
    const rows = await Integration.findAll({ order: [['provider', 'ASC']] });
    return rows.map((r) => {
      const def = getProvider(r.provider);
      const values = JSON.parse(decrypt(r.credentials)) as Creds;
      const masked: Record<string, unknown> = {};
      for (const f of def?.fields ?? []) {
        masked[f.key] = f.secret ? (values[f.key] ? '••••••••' : '') : (values[f.key] ?? '');
      }
      return {
        id: r.id,
        provider: r.provider,
        name: r.name,
        values: masked,
        isActive: r.isActive,
        isDefault: r.isDefault,
        status: r.status,
        lastChecked: r.lastChecked,
        lastError: r.lastError,
      };
    });
  }

  static async create(
    provider: string,
    name: string,
    values: Creds,
    isDefault = false,
  ): Promise<Integration> {
    const def = getProvider(provider);
    if (!def) throw ApiError.badRequest(`Bilinmeyen sağlayıcı: ${provider}`);

    const integ = await Integration.create({
      provider,
      name,
      credentials: encrypt(JSON.stringify(values)),
      isDefault,
    });
    if (isDefault) await this.setDefault(integ.id);
    // İlk bağlantı otomatik varsayılan olsun.
    const count = await Integration.count({ where: { provider } });
    if (count === 1) await this.setDefault(integ.id);
    this.invalidate(provider);
    return integ;
  }

  /** Günceller. Boş bırakılan gizli alanlar eski değerini korur. */
  static async update(id: string, name: string, values: Creds): Promise<Integration> {
    const integ = await Integration.findByPk(id);
    if (!integ) throw ApiError.notFound('Entegrasyon bulunamadı');
    const def = getProvider(integ.provider);
    const current = JSON.parse(decrypt(integ.credentials)) as Creds;
    const merged: Creds = { ...current };
    for (const f of def?.fields ?? []) {
      const incoming = values[f.key];
      // Gizli alan boş gelirse eskiyi koru.
      if (f.secret && (incoming === undefined || incoming === '' || incoming === '••••••••'))
        continue;
      if (incoming !== undefined) merged[f.key] = incoming;
    }
    integ.name = name;
    integ.credentials = encrypt(JSON.stringify(merged));
    integ.status = 'unknown';
    await integ.save();
    this.invalidate(integ.provider);
    return integ;
  }

  static async setDefault(id: string): Promise<void> {
    const integ = await Integration.findByPk(id);
    if (!integ) throw ApiError.notFound('Entegrasyon bulunamadı');
    await Integration.update({ isDefault: false }, { where: { provider: integ.provider } });
    integ.isDefault = true;
    integ.isActive = true;
    await integ.save();
    this.invalidate(integ.provider);
  }

  static async remove(id: string): Promise<void> {
    const integ = await Integration.findByPk(id);
    if (!integ) throw ApiError.notFound('Entegrasyon bulunamadı');
    const provider = integ.provider;
    await integ.destroy();
    // Varsayılan silindiyse başka birini varsayılan yap.
    if (integ.isDefault) {
      const next = await Integration.findOne({ where: { provider } });
      if (next) await this.setDefault(next.id);
    }
    this.invalidate(provider);
  }

  /** Bağlantıyı test eder ve durumu kaydeder. */
  static async test(id: string): Promise<{ connected: boolean; error?: string }> {
    const integ = await Integration.findByPk(id);
    if (!integ) throw ApiError.notFound('Entegrasyon bulunamadı');
    const values = JSON.parse(decrypt(integ.credentials)) as Creds;

    let connected = false;
    let error: string | undefined;
    try {
      connected = await runProviderTest(integ.provider, values);
    } catch (err) {
      error = (err as Error).message;
    }
    integ.status = connected ? 'connected' : 'error';
    integ.lastChecked = new Date();
    integ.lastError = connected ? null : (error ?? 'Bağlantı kurulamadı');
    await integ.save();
    return { connected, error };
  }
}

/** Sağlayıcıya özel bağlantı testi. Lazy import ile döngüsel bağımlılık önlenir. */
async function runProviderTest(provider: string, values: Creds): Promise<boolean> {
  switch (provider) {
    case 'hetzner': {
      const axios = (await import('axios')).default;
      const r = await axios.get('https://api.hetzner.cloud/v1/locations', {
        headers: { Authorization: `Bearer ${values.apiToken}` },
        timeout: 15000,
      });
      return r.status === 200;
    }
    case 'smtp': {
      const nodemailer = (await import('nodemailer')).default;
      const tx = nodemailer.createTransport({
        host: String(values.host),
        port: Number(values.port) || 587,
        secure: Boolean(values.secure),
        auth: values.user ? { user: String(values.user), pass: String(values.pass) } : undefined,
      });
      await tx.verify();
      return true;
    }
    case 'iyzico': {
      const axios = (await import('axios')).default;
      // Basit erişilebilirlik testi (kimlik doğrulama imzası gerektirmez).
      const r = await axios.get(`${values.baseUrl}`, {
        timeout: 10000,
        validateStatus: () => true,
      });
      return r.status > 0;
    }
    default:
      logger.info(`Test desteklenmeyen sağlayıcı: ${provider}`);
      return false;
  }
}
