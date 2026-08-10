import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useCompany } from '../../hooks/useCompany';

const NAV_LINKS = [
  { href: '/#planlar', label: 'Hosting' },
  { href: '/#cozumler', label: 'Sunucu' },
  { href: '/#altyapi', label: 'SSL' },
  { href: '/legal/hakkimizda', label: 'Hakkımızda' },
  { href: '/sss', label: 'SSS' },
];

/**
 * Public sayfaların ortak yapışkan cam başlığı.
 * - showNav: ortadaki Hosting/Sunucu/SSL bağlantılarını göster (ana sayfa) —
 *   masaüstünde satır içinde, mobilde hamburger menüde.
 * - back: sağda auth butonları yerine geri bağlantısı göster
 */
export default function ShopHeader({
  showNav = false,
  back,
}: {
  showNav?: boolean;
  back?: { label: string; to: string };
}) {
  const user = useAuthStore((s) => s.user);
  const company = useCompany();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-night-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-neon-violet text-white shadow-[0_0_20px_-2px_rgba(59,130,246,0.8)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 3 20h18L12 3Z" />
            </svg>
          </span>
          <span className="text-white">
            ADIGE<span className="font-light text-slate-400">HOST</span>
          </span>
        </a>

        {showNav && (
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition hover:text-white">{l.label}</a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-4">
          {company.company_phone && (
            <a
              href={`tel:${company.company_phone.replace(/\s/g, '')}`}
              className="hidden items-center gap-1.5 text-sm font-medium text-slate-300 transition hover:text-white sm:flex"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
              </svg>
              {company.company_phone}
            </a>
          )}
          {back ? (
            <a href={back.to} className="text-sm text-slate-300 transition hover:text-white">
              {back.label}
            </a>
          ) : user ? (
            <a
              href="/app"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400/60 hover:bg-white/5"
            >
              Panelim →
            </a>
          ) : (
            <>
              <a href="/login" className="hidden text-sm text-slate-300 transition hover:text-white sm:block">
                Giriş Yap
              </a>
              <a
                href="/login"
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400/60 hover:bg-white/5 hover:shadow-[0_0_24px_-6px_rgba(59,130,246,0.8)]"
              >
                MÜŞTERİ GİRİŞİ
              </a>
            </>
          )}

          {showNav && (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menü"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/5 md:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {menuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          )}
        </div>
      </div>

      {showNav && menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-white/5 px-4 py-3 text-sm font-medium text-slate-300 md:hidden">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-2 py-2.5 transition hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
          {company.company_phone && (
            <a
              href={`tel:${company.company_phone.replace(/\s/g, '')}`}
              className="rounded-lg px-2 py-2.5 transition hover:bg-white/5 hover:text-white"
            >
              📞 {company.company_phone}
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
