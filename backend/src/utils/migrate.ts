/**
 * Şema senkronizasyonu (geliştirme/ilk kurulum için).
 *
 * NOT: Production'da kontrollü şema değişimi için ileride umzug tabanlı
 * versiyonlu migration'lara geçilmelidir. `sync({ alter })` veri kaybına
 * yol açabileceğinden production'da DİKKATLE kullanılmalıdır.
 *
 * Kullanım:
 *   npm run migrate            # güvenli: eksik tabloları oluşturur
 *   npm run migrate -- --alter # şemayı modellere göre günceller (dev)
 *   npm run migrate -- --force # TÜM tabloları siler ve yeniden kurar (TEHLİKE)
 */
import { sequelize } from '../config/database';
import { models } from '../models';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

async function migrate(): Promise<void> {
  const alter = process.argv.includes('--alter');
  const force = process.argv.includes('--force');

  if (force && isProd) {
    throw new Error('--force production ortamında kullanılamaz!');
  }

  await sequelize.authenticate();
  logger.info('DB bağlantısı OK, şema senkronize ediliyor...', {
    mode: force ? 'force' : alter ? 'alter' : 'safe',
    models: Object.keys(models).length,
  });

  await sequelize.sync({ alter, force });
  logger.info('✅ Şema senkronizasyonu tamamlandı');
  await sequelize.close();
  process.exit(0);
}

migrate().catch((err) => {
  logger.error('Migration hatası', { error: (err as Error).message });
  process.exit(1);
});
