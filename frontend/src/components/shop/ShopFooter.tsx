import { useCompany } from '../../hooks/useCompany';

/** Public sayfaların ortak koyu alt bilgisi. */
export default function ShopFooter({ companyTitle = 'AdigeHost' }: { companyTitle?: string }) {
  const company = useCompany();
  return (
    <footer className="relative border-t border-white/10 bg-night-950/80 px-4 pb-6 pt-14 text-sm text-slate-400 backdrop-blur">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="mb-3 text-xl font-bold text-white">
              ADIGE<span className="font-light text-slate-400">HOST</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Web sitesi yapımı, alan adı ve hosting — Türkiye odaklı, tek çatı altında.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Hizmetler</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/web-sitesi" className="hover:text-white">Web Sitesi Yaptır</a></li>
              <li><a href="/#alan-adi" className="hover:text-white">Alan Adı Sorgula</a></li>
              <li><a href="/#planlar" className="hover:text-white">Hosting Paketleri</a></li>
              <li><a href="/vps" className="hover:text-white">Sunucu / VPS</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Kurumsal</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/legal/hakkimizda" className="hover:text-white">Hakkımızda</a></li>
              <li><a href="/sss" className="hover:text-white">Sık Sorulan Sorular</a></li>
              <li><a href="/legal/ssl-sertifikasi" className="hover:text-white">SSL Sertifikası</a></li>
              <li><a href="mailto:destek@adigehost.tr" className="hover:text-white">İletişim</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Yasal</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/legal/teslimat-ve-iade" className="hover:text-white">Teslimat ve İade Şartları</a></li>
              <li><a href="/legal/gizlilik" className="hover:text-white">Gizlilik Sözleşmesi</a></li>
              <li><a href="/legal/mesafeli-satis" className="hover:text-white">Mesafeli Satış Sözleşmesi</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Hesap</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/login" className="hover:text-white">Giriş / Kayıt</a></li>
              <li><a href="/app" className="hover:text-white">Müşteri Paneli</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex justify-center border-t border-white/10 pt-8">
          <img
            src="/media/logo_band_white.svg"
            alt="iyzico ile öde — Visa, MasterCard, Troy"
            width={456}
            height={32}
            className="h-8 w-auto opacity-80"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-2 text-xs text-slate-500 md:flex-row">
          <div>© {new Date().getFullYear()} {companyTitle} — 2001'den beri hizmetinizdeyiz.</div>
          <div className="flex items-center gap-3">
            {company.company_phone && <a href={`tel:${company.company_phone.replace(/\s/g, '')}`} className="hover:text-white">{company.company_phone}</a>}
            <a href="mailto:destek@adigehost.tr" className="hover:text-white">destek@adigehost.tr</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
