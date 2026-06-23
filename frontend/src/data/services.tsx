import type { ReactNode } from 'react';

/**
 * Ana sayfadaki "çözüm" kartları ve /hizmet/:slug detay sayfaları için
 * ortak hizmet tanımları. İçerik metinlerini ServiceDetail içindeki
 * SERVICE_CONTENT'ten düzenleyebilirsiniz.
 */
export interface ServiceDef {
  slug: string;
  title: string;
  tagline: string; // ana sayfa kartında görünen kısa açıklama
  href: string; // kart tıklanınca gidilecek sayfa
  accent: string; // ikon kutusu renkleri (tailwind)
  icon: ReactNode;
}

const iconProps = {
  className: 'h-7 w-7',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const SERVICES: ServiceDef[] = [
  {
    slug: 'web-sitesi',
    title: 'Web Sitesi',
    tagline: 'Hızlı ve güvenli hosting ile sitenizi yayında tutun.',
    href: '/hizmet/web-sitesi',
    accent: 'bg-blue-50 text-blue-600',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M6.5 6.5h.01M9.5 6.5h.01" />
      </svg>
    ),
  },
  {
    slug: 'e-posta',
    title: 'E-Posta',
    tagline: 'Alan adınıza özel kurumsal mail çözümleri.',
    href: '/hizmet/e-posta',
    accent: 'bg-amber-50 text-amber-600',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    slug: 'yedekleme',
    title: 'Yedekleme',
    tagline: 'Otomatik yedek ve hızlı kurtarma ile veriniz güvende.',
    href: '/hizmet/yedekleme',
    accent: 'bg-emerald-50 text-emerald-600',
    icon: (
      <svg {...iconProps}>
        <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 1 6.86" />
        <path d="M12 21v-8m0 0-2.4 2.4M12 13l2.4 2.4" />
      </svg>
    ),
  },
  {
    slug: 'alan-adi',
    title: 'Alan Adı',
    tagline: 'Domain kayıt, yenileme ve transfer — hızlı ve uygun.',
    href: '/hizmet/alan-adi',
    accent: 'bg-violet-50 text-violet-600',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
      </svg>
    ),
  },
  {
    slug: 'vps',
    title: 'VPS',
    tagline: 'CPU, RAM ve diski siz seçin; dakikalar içinde teslim.',
    href: '/vps',
    accent: 'bg-sky-50 text-sky-600',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="13" width="18" height="7" rx="1.5" />
        <path d="M6.5 7.5h.01M6.5 16.5h.01" />
      </svg>
    ),
  },
  {
    slug: 'sunucu',
    title: 'Sunucu',
    tagline: 'Dedicated ve fiziksel sunucu çözümleri.',
    href: '/hizmet/sunucu',
    accent: 'bg-slate-100 text-slate-600',
    icon: (
      <svg {...iconProps}>
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M9 7h6M9 11h6M9 15h.01" />
      </svg>
    ),
  },
  {
    slug: 'cozum',
    title: 'Çözüm',
    tagline: 'İşletmenize özel danışmanlık ve projeler.',
    href: '/hizmet/cozum',
    accent: 'bg-rose-50 text-rose-600',
    icon: (
      <svg {...iconProps}>
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3Z" />
      </svg>
    ),
  },
];

export const SERVICE_BY_SLUG: Record<string, ServiceDef> = Object.fromEntries(
  SERVICES.map((s) => [s.slug, s]),
);
