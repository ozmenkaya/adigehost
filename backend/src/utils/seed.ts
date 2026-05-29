/**
 * Başlangıç verisi: ilk admin kullanıcısı + varsayılan sistem ayarları.
 * Idempotent — tekrar çalıştırılabilir.
 *
 * Kullanım: npm run seed
 */
import { sequelize, User, Setting } from '../models';
import { hashPassword } from '../security/password';
import { env } from '../config/env';
import { logger } from '../config/logger';

const DEFAULT_SETTINGS: Array<{
  key: string;
  value: string;
  type: Setting['type'];
  group: string;
}> = [
  { key: 'app_name', value: 'AdigeHost', type: 'string', group: 'general' },
  { key: 'language', value: 'tr', type: 'string', group: 'general' },
  { key: 'vat_rate', value: String(env.VAT_RATE), type: 'number', group: 'billing' },
  { key: 'currency', value: env.CURRENCY, type: 'string', group: 'billing' },
  { key: 'invoice_prefix', value: 'ARS', type: 'string', group: 'billing' },
  { key: 'efatura_prefix', value: 'FAT', type: 'string', group: 'billing' },
  { key: 'payment_due_days', value: '7', type: 'number', group: 'billing' },
  { key: 'suspend_after', value: '7', type: 'number', group: 'billing' },
  { key: 'warning_days', value: '1,3,7', type: 'string', group: 'billing' },
];

async function seed(): Promise<void> {
  await sequelize.authenticate();

  // Varsayılan ayarlar
  for (const s of DEFAULT_SETTINGS) {
    await Setting.findOrCreate({ where: { key: s.key }, defaults: s });
  }
  logger.info(`✅ ${DEFAULT_SETTINGS.length} varsayılan ayar hazır`);

  // İlk admin
  if (env.ADMIN_EMAIL && env.ADMIN_PASS) {
    const [admin, created] = await User.findOrCreate({
      where: { email: env.ADMIN_EMAIL },
      defaults: {
        firstName: 'Admin',
        lastName: 'AdigeHost',
        email: env.ADMIN_EMAIL,
        password: await hashPassword(env.ADMIN_PASS),
        role: 'admin',
        status: 'active',
        emailVerified: true,
      },
    });
    logger.info(
      created ? `✅ Admin oluşturuldu: ${admin.email}` : `Admin zaten mevcut: ${admin.email}`,
    );
  } else {
    logger.warn('ADMIN_EMAIL/ADMIN_PASS tanımlı değil — admin oluşturulmadı');
  }

  await sequelize.close();
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed hatası', { error: (err as Error).message });
  process.exit(1);
});
