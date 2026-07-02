import type { ReactNode } from 'react';

/**
 * Public/satış sayfaları için ortak koyu, fütüristik zemin.
 * Sabit glow orb'ları + blueprint ızgara. Panel sayfalarında KULLANILMAZ.
 */
export default function PageBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-night-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[460px] w-[460px] rounded-full bg-neon-violet/15 blur-[130px]" />
        <div className="absolute bottom-0 left-0 h-[420px] w-[420px] rounded-full bg-neon-cyan/10 blur-[120px]" />
        <div className="absolute inset-0 grid-bg opacity-70" />
      </div>
      {children}
    </div>
  );
}
