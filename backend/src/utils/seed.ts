/**
 * Başlangıç verisi: ilk admin kullanıcısı + varsayılan sistem ayarları.
 * Idempotent — tekrar çalıştırılabilir.
 *
 * Kullanım: npm run seed
 */
import { sequelize, User, Setting, Product } from '../models';
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
  { key: 'terminate_after', value: '30', type: 'number', group: 'billing' },
  { key: 'auto_terminate', value: 'false', type: 'boolean', group: 'billing' },
  { key: 'warning_days', value: '1,3,7', type: 'string', group: 'billing' },
];

/**
 * Web sitesi yapım paketleri — başlangıç fiyatlarıdır, admin panelinden
 * (Ürünler) değiştirilebilir. Fiyatlar KDV HARİÇ TL.
 *
 * `setupFee` = tek seferlik tasarım/kurulum, `priceMonthly` = bakım + hosting
 * aboneliği (düzenli gelir). `priceAnnually` yıllık peşin ödeyene indirimli dönem
 * fiyatıdır (12 ay yerine ~10 ay).
 */
const WEBSITE_PACKAGES: Array<{
  name: string;
  description: string;
  setupFee: number;
  priceMonthly: number;
  priceAnnually: number;
  sortOrder: number;
  specs: Record<string, string>;
}> = [
  {
    name: 'Vitrin Site',
    description:
      'Küçük işletmeler için tek sayfalık tanıtım sitesi. Sizi arayan müşteri telefonunuzu, adresinizi ve hizmetlerinizi bulsun.',
    setupFee: 7500,
    priceMonthly: 450,
    priceAnnually: 4500,
    sortOrder: 10,
    specs: {
      'Sayfa sayısı': '1 sayfa (tek sayfa tanıtım)',
      Tasarım: 'Mobil uyumlu hazır tema',
      'Teslim süresi': '5 iş günü',
      'İçerik girişi': 'Sizin metin/görselleriniz yüklenir',
      Dahil: 'Hosting + SSL + günlük yedek',
      Bakım: 'Yılda 2 küçük içerik güncellemesi',
    },
  },
  {
    name: 'Kurumsal Site',
    description:
      'Çok sayfalı kurumsal web sitesi: hakkımızda, hizmetler, blog ve iletişim formu. Google\'da bulunmak isteyen firmalar için.',
    setupFee: 18000,
    priceMonthly: 750,
    priceAnnually: 7500,
    sortOrder: 20,
    specs: {
      'Sayfa sayısı': '8 sayfaya kadar',
      Tasarım: 'Kurumsal kimliğinize özel tasarım',
      'Teslim süresi': '15 iş günü',
      Blog: 'Kendiniz yazı ekleyebileceğiniz blog',
      Form: 'İletişim ve teklif formu',
      SEO: 'Temel SEO kurulumu + Google kaydı',
      Dahil: 'Hosting + SSL + kurumsal e-posta',
      Bakım: 'Ayda 1 içerik güncellemesi + güncelleme/yedek takibi',
    },
  },
  {
    name: 'E-Ticaret Sitesi',
    description:
      'Online satış yapmak isteyenler için sanal POS entegreli mağaza. Ürün, sipariş ve kargo yönetimi sizde.',
    setupFee: 42000,
    priceMonthly: 1500,
    priceAnnually: 15000,
    sortOrder: 30,
    specs: {
      Ürün: 'Sınırsız ürün ve kategori',
      Ödeme: 'Sanal POS / kredi kartı entegrasyonu',
      Kargo: 'Kargo firması entegrasyonu',
      'Teslim süresi': '25 iş günü',
      Panel: 'Sipariş ve stok yönetim paneli',
      Eğitim: 'Panel kullanım eğitimi (1 seans)',
      Dahil: 'Yüksek kaynaklı hosting + SSL',
      Bakım: 'Ayda 2 güncelleme + öncelikli destek',
    },
  },
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

  // Web sitesi yapım paketleri — ada göre idempotent, mevcut fiyatlara dokunulmaz
  // (admin panelinden düzenlenmiş fiyatlar seed tekrar çalışınca ezilmesin).
  let websiteCreated = 0;
  for (const pkg of WEBSITE_PACKAGES) {
    const [, created] = await Product.findOrCreate({
      where: { name: pkg.name, type: 'website' },
      defaults: {
        name: pkg.name,
        type: 'website',
        description: pkg.description,
        setupFee: pkg.setupFee,
        priceMonthly: pkg.priceMonthly,
        priceAnnually: pkg.priceAnnually,
        specs: pkg.specs,
        sortOrder: pkg.sortOrder,
        isActive: true,
      },
    });
    if (created) websiteCreated++;
  }
  logger.info(
    websiteCreated > 0
      ? `✅ ${websiteCreated} web sitesi paketi oluşturuldu (fiyatları admin > Ürünler'den düzenleyin)`
      : 'Web sitesi paketleri zaten mevcut',
  );

  await sequelize.close();
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed hatası', { error: (err as Error).message });
  process.exit(1);
});
