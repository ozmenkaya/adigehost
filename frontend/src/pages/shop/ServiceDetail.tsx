import { Link, Navigate, useParams } from 'react-router-dom';
import { SERVICE_BY_SLUG } from '../../data/services';
import PageBackdrop from '../../components/shop/PageBackdrop';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';
import Reveal from '../../components/shop/Reveal';

/**
 * Hizmet detay sayfası — /hizmet/:slug
 *
 * İÇERİK BURADAN DÜZENLENİR: aşağıdaki SERVICE_CONTENT nesnesinde her hizmet
 * için başlık altı, giriş paragrafı, madde listesi ve buton ayarlanır.
 * Yeni metin/bölüm eklemek isterseniz bu nesneyi genişletin.
 */
interface ServiceContent {
  subtitle: string;
  intro: string;
  bullets: string[];
  cta: { label: string; href: string };
}

const SERVICE_CONTENT: Record<string, ServiceContent> = {
  'web-sitesi': {
    subtitle: 'Web siteniz için hızlı, güvenli ve ölçeklenebilir hosting.',
    intro:
      'Bu sayfanın içeriğini buradan düzenleyebilirsiniz. Web sitesi/hosting hizmetinizi, paket avantajlarını ve teknik özellikleri burada anlatın.',
    bullets: ['NVMe SSD disk', 'Ücretsiz SSL sertifikası', 'Günlük yedekleme', '7/24 Türkçe destek'],
    cta: { label: 'Paketleri Gör', href: '/' },
  },
  'e-posta': {
    subtitle: 'Alan adınıza özel kurumsal e-posta çözümleri.',
    intro:
      'Bu sayfanın içeriğini buradan düzenleyebilirsiniz. Kurumsal e-posta paketlerinizi, kutu boyutlarını ve spam/virüs korumasını burada anlatın.',
    bullets: ['Alan adınıza özel adresler', 'Webmail erişimi', 'Spam ve virüs koruması', 'Mobil senkronizasyon'],
    cta: { label: 'İletişime Geç', href: 'mailto:destek@adigehost.tr' },
  },
  yedekleme: {
    subtitle: 'Otomatik yedekleme ve hızlı kurtarma ile veriniz güvende.',
    intro:
      'Bu sayfanın içeriğini buradan düzenleyebilirsiniz. Yedekleme sıklığı, saklama süresi ve geri yükleme süreçlerini burada anlatın.',
    bullets: ['Otomatik günlük yedek', 'Tek tıkla geri yükleme', 'Farklı lokasyonda saklama', 'Şifreli yedek depolama'],
    cta: { label: 'İletişime Geç', href: 'mailto:destek@adigehost.tr' },
  },
  'alan-adi': {
    subtitle: 'Domain kayıt, yenileme ve transfer — hızlı ve uygun fiyatlı.',
    intro:
      'Bu sayfanın içeriğini buradan düzenleyebilirsiniz. Desteklenen uzantıları, fiyatları ve transfer sürecini burada anlatın.',
    bullets: ['40+ uzantı', 'Ücretsiz DNS yönetimi', 'Kolay transfer', 'WHOIS gizliliği'],
    cta: { label: 'Alan Adı Sorgula', href: '/' },
  },
  sunucu: {
    subtitle: 'Yüksek performanslı dedicated ve fiziksel sunucu çözümleri.',
    intro:
      'Bu sayfanın içeriğini buradan düzenleyebilirsiniz. Donanım seçeneklerini, lokasyonları ve yönetim hizmetlerini burada anlatın.',
    bullets: ['Özel donanım', 'Yönetilen hizmet seçeneği', 'Yüksek bant genişliği', 'Kurumsal SLA'],
    cta: { label: 'Teklif Al', href: 'mailto:destek@adigehost.tr' },
  },
  cozum: {
    subtitle: 'İşletmenize özel danışmanlık ve uçtan uca projeler.',
    intro:
      'Bu sayfanın içeriğini buradan düzenleyebilirsiniz. Sunduğunuz özel çözümleri ve danışmanlık kapsamını burada anlatın.',
    bullets: ['İhtiyaç analizi', 'Özel mimari tasarımı', 'Göç (migration) desteği', 'Sürekli bakım'],
    cta: { label: 'Bizimle İletişime Geçin', href: 'mailto:destek@adigehost.tr' },
  },
};

export default function ServiceDetail() {
  const { slug = '' } = useParams();
  const service = SERVICE_BY_SLUG[slug];
  const content = SERVICE_CONTENT[slug];

  // Tanımsız slug → ana sayfaya
  if (!service || !content) return <Navigate to="/" replace />;

  return (
    <PageBackdrop>
      <ShopHeader />

      {/* Hero */}
      <section className="relative px-4 pt-20 pb-12">
        <div className="pointer-events-none absolute left-1/2 top-6 h-64 w-[70%] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[110px]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-neon-violet text-white shadow-[0_0_40px_-6px_rgba(59,130,246,0.9)] animate-float">
            <span className="[&>svg]:h-10 [&>svg]:w-10">{service.icon}</span>
          </span>
          <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {service.title}
          </h1>
          <p className="text-lg text-slate-400">{content.subtitle}</p>
        </div>
      </section>

      {/* İçerik */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <Reveal>
          <p className="text-lg leading-relaxed text-slate-300">{content.intro}</p>
        </Reveal>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {content.bullets.map((b, i) => (
            <Reveal key={b} delay={i * 80}>
              <div className="flex items-center gap-3 rounded-xl glass px-4 py-3 text-sm font-medium text-slate-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 12 5 5L20 6" />
                  </svg>
                </span>
                {b}
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a href={content.cta.href} className="btn-neon">
            {content.cta.label}
          </a>
          <Link
            to="/"
            className="rounded-xl border border-white/15 px-7 py-3.5 font-semibold text-slate-200 transition hover:bg-white/5"
          >
            ← Ana Sayfa
          </Link>
        </div>
      </section>

      <ShopFooter />
    </PageBackdrop>
  );
}
