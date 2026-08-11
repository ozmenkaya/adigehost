import { SERVICES } from '../../data/services';

/**
 * Hero'nun hemen altındaki hizmet şeridi.
 *
 * Amaç: ziyaretçi hiç kaydırmadan "burada her şey var" mesajını alsın.
 * Ana sayfadaki 3 büyük çözüm kartının eleme akışını bozmamak için
 * bilinçli olarak küçük ve link ağırlıklı tutuldu — burada satış yok,
 * sadece yönlendirme var.
 *
 * Kaldırmak istenirse: Sales.tsx içindeki <ServiceStrip /> satırını sil.
 */
export default function ServiceStrip() {
  return (
    <section
      aria-label="Hizmetlerimiz"
      className="relative border-t border-white/5 bg-white/[0.02]"
    >
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
          <span className="hidden shrink-0 pr-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 lg:inline">
            Hizmetlerimiz
          </span>
          {SERVICES.map((s) => (
            <a
              key={s.slug}
              href={s.href}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold whitespace-nowrap text-slate-200 transition duration-300 hover:-translate-y-0.5 hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-white hover:shadow-[0_10px_24px_-14px_rgba(59,130,246,0.9)]"
            >
              <span className="text-brand-300 transition group-hover:text-brand-200 [&_svg]:!h-4 [&_svg]:!w-4">
                {s.icon}
              </span>
              {s.title}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
