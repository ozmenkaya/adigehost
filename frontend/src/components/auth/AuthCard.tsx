import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Auth sayfalarının (giriş/kayıt, şifre sıfırlama) ortak cam kartı:
 * anasayfa dönüş linki + logo + başlık.
 */
export default function AuthCard({
  subtitle,
  children,
  wide = false,
}: {
  subtitle: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className={`glass w-full animate-fade-up rounded-3xl p-8 ${wide ? 'max-w-xl' : 'max-w-md'}`}
      >
        <div className="mb-6">
          <Link to="/" className="text-sm text-slate-400 transition hover:text-white">
            ← Anasayfaya Dön
          </Link>
        </div>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-neon-violet text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.9)]">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 3 20h18L12 3Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">
            ADIGE<span className="font-light text-slate-400">HOST</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  );
}
