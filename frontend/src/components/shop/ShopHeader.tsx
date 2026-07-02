import { useAuthStore } from '../../store/authStore';

/**
 * Public sayfaların ortak yapışkan cam başlığı.
 * - showNav: ortadaki Hosting/Sunucu/SSL bağlantılarını göster (ana sayfa)
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
            <a href="/#planlar" className="transition hover:text-white">Hosting</a>
            <a href="/#cozumler" className="transition hover:text-white">Sunucu</a>
            <a href="/#altyapi" className="transition hover:text-white">SSL</a>
          </nav>
        )}

        <div className="flex items-center gap-3">
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
        </div>
      </div>
    </header>
  );
}
