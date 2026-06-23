import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { SERVICE_BY_SLUG } from '../../data/services';

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
  const { user } = useAuthStore();
  const service = SERVICE_BY_SLUG[slug];
  const content = SERVICE_CONTENT[slug];

  // Tanımsız slug → ana sayfaya
  if (!service || !content) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <Link to="/" className="text-2xl font-bold text-brand-700">
            AdigeHost
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <a href="/app" className="text-sm text-brand-600 hover:underline">
                Panelim →
              </a>
            ) : (
              <>
                <a href="/login" className="text-sm text-slate-600 hover:text-brand-600">
                  Giriş Yap
                </a>
                <a
                  href="/register"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Kayıt Ol
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 py-16 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
            <span className="[&>svg]:h-9 [&>svg]:w-9">{service.icon}</span>
          </span>
          <h1 className="text-4xl font-extrabold text-white mb-3">{service.title}</h1>
          <p className="text-brand-100 text-lg">{content.subtitle}</p>
        </div>
      </section>

      {/* İçerik */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-lg leading-relaxed text-slate-600">{content.intro}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {content.bullets.map((b) => (
            <div
              key={b}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                ✓
              </span>
              {b}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={content.cta.href}
            className="rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white hover:bg-brand-700"
          >
            {content.cta.label}
          </a>
          <Link
            to="/"
            className="rounded-xl border border-slate-300 px-7 py-3.5 font-semibold text-slate-600 hover:bg-white"
          >
            ← Ana Sayfa
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 text-slate-400 text-sm py-8 px-4">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row justify-between items-center gap-2">
          <div>© {new Date().getFullYear()} AdigeHost — Tüm hakları saklıdır.</div>
          <a href="mailto:destek@adigehost.tr" className="hover:text-white">
            destek@adigehost.tr
          </a>
        </div>
      </footer>
    </div>
  );
}
