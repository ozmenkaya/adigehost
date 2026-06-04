import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore, type CartItem } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';

interface Product {
  id: string;
  name: string;
  type: string;
  priceMonthly: number;
  priceAnnually: number | null;
  setupFee: number | null;
  specs: Record<string, string> | null;
  description: string | null;
}

interface DomainResult {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
  priceTRY: number | null;
  priceExVat: number | null;
  vatRate: number;
  period: number;
}

function tr(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CartDrawer({ onCheckout }: { onCheckout: () => void }) {
  const { items, remove, total, totalExVat, count } = useCartStore();
  const [open, setOpen] = useState(false);
  const vat = total() - totalExVat();

  return (
    <>
      {/* Sepet butonu — sabit sağ alt */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-700"
      >
        🛒 Sepet
        {count() > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700">
            {count()}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative flex w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Sepetim ({count()})</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.length === 0 ? (
                <p className="text-center text-slate-400 py-10">Sepetiniz boş.</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex-1">
                      <div className="font-medium text-slate-800 text-sm">{item.name}</div>
                      {item.billingCycle && (
                        <div className="text-xs text-slate-500">
                          {item.billingCycle === 'annually' ? 'Yıllık' : 'Aylık'}
                        </div>
                      )}
                      <div className="mt-1 font-semibold text-brand-700">{tr(item.price)} ₺</div>
                      <div className="text-xs text-slate-400">KDV hariç {tr(item.priceExVat)} ₺</div>
                    </div>
                    <button
                      onClick={() => remove(item.id)}
                      className="mt-0.5 text-red-400 hover:text-red-600 text-xs"
                    >
                      Kaldır
                    </button>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t px-5 py-4 space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Ara toplam</span><span>{tr(totalExVat())} ₺</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>KDV</span><span>{tr(vat)} ₺</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Toplam</span><span className="text-brand-700 text-lg">{tr(total())} ₺</span>
                </div>
                <button
                  onClick={() => { setOpen(false); onCheckout(); }}
                  className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700"
                >
                  Satın Al →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Sales() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { add, items } = useCartStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [domainName, setDomainName] = useState('');
  const [domainResults, setDomainResults] = useState<DomainResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [addedMsg, setAddedMsg] = useState('');

  useEffect(() => {
    api.get('/public/products').then((r) => setProducts(r.data.data ?? []));
  }, []);

  const searchDomain = async (e: FormEvent) => {
    e.preventDefault();
    const raw = domainName.trim().toLowerCase();
    if (!raw) return;

    // Kullanıcı "ornek.com" yazdıysa: name="ornek", tlds=[com, ...alternatives]
    // Sadece "ornek" yazdıysa: backend default liste kullansın
    let name = raw;
    let tlds: string[] | undefined;
    const dotIdx = raw.indexOf('.');
    if (dotIdx > 0) {
      name = raw.slice(0, dotIdx);
      const userTld = raw.slice(dotIdx + 1);
      // Kullanıcının yazdığı TLD'yi başa al + 20 alternatif
      const alts = [
        'com', 'com.tr', 'net', 'org', 'info', 'co',
        'io', 'app', 'dev', 'tr', 'net.tr', 'org.tr',
        'xyz', 'online', 'site', 'tech', 'biz', 'cloud',
        'me', 'shop', 'store',
      ];
      tlds = [userTld, ...alts.filter((t) => t !== userTld)].slice(0, 20);
    }
    // Geçersiz karakterleri temizle
    name = name.replace(/[^a-z0-9-]/g, '');
    if (!name) {
      setDomainError('Geçerli bir alan adı girin (harf, rakam, tire)');
      return;
    }

    setSearching(true);
    setDomainError('');
    setDomainResults(null);
    try {
      const r = await api.post('/public/domains/check', tlds ? { name, tlds } : { name });
      setDomainResults(r.data.data ?? []);
    } catch (err) {
      setDomainError(getApiErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const addDomain = (d: DomainResult) => {
    if (!d.available || !d.priceTRY) return;
    const item: CartItem = {
      id: `domain:${d.domain}`,
      type: 'domain',
      name: `Domain: ${d.domain}`,
      price: d.priceTRY,
      priceExVat: d.priceExVat ?? d.priceTRY,
      vatRate: d.vatRate,
      domain: d.domain,
      period: d.period || 1,
    };
    add(item);
    setAddedMsg(`${d.domain} sepete eklendi`);
    setTimeout(() => setAddedMsg(''), 3000);
  };

  const addHosting = (p: Product, cycle: 'monthly' | 'annually') => {
    const priceRaw = cycle === 'annually' && p.priceAnnually ? Number(p.priceAnnually) : Number(p.priceMonthly);
    const priceExVat = priceRaw;
    const price = Math.round(priceExVat * 1.2 * 100) / 100;
    const item: CartItem = {
      id: `hosting:${p.id}:${cycle}`,
      type: 'hosting',
      name: `${p.name} (${cycle === 'annually' ? 'Yıllık' : 'Aylık'})`,
      price,
      priceExVat,
      vatRate: 20,
      billingCycle: cycle,
      productId: p.id,
      domain: '',
    };
    add(item);
    setAddedMsg(`${p.name} sepete eklendi`);
    setTimeout(() => setAddedMsg(''), 3000);
  };

  const goCheckout = () => {
    if (user) {
      navigate('/checkout');
    } else {
      navigate('/checkout');
    }
  };

  const isInCart = (id: string) => items.some((i) => i.id === id);
  const hostingProducts = products.filter((p) => p.type === 'hosting');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <div className="text-2xl font-bold text-brand-700">AdigeHost</div>
          <div className="flex items-center gap-3">
            {user ? (
              <a href="/app" className="text-sm text-brand-600 hover:underline">Panelim →</a>
            ) : (
              <>
                <a href="/login" className="text-sm text-slate-600 hover:text-brand-600">Giriş Yap</a>
                <a href="/register" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Kayıt Ol</a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero — Domain arama */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 py-20 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold text-white mb-3">
            Hayalinizin Alan Adını Bulun
          </h1>
          <p className="text-brand-200 mb-8 text-lg">
            Domain kayıt, yenileme ve transfer — hızlı ve güvenli.
          </p>
          <form onSubmit={searchDomain} className="flex gap-2">
            <input
              value={domainName}
              onChange={(e) => setDomainName(e.target.value.replace(/\s/g, '').toLowerCase())}
              placeholder="ornek-domain veya ornek.com"
              className="flex-1 rounded-xl px-5 py-3.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-xl bg-amber-400 px-6 py-3.5 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-60"
            >
              {searching ? '⏳' : 'Sorgula'}
            </button>
          </form>
          {domainError && <p className="mt-3 text-red-300 text-sm">{domainError}</p>}
          {searching && (
            <p className="mt-3 text-brand-100 text-sm">
              40+ uzantı sorgulanıyor… birkaç saniye sürebilir.
            </p>
          )}

          {/* Popüler TLD'ler */}
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
            {['.com', '.com.tr', '.net', '.org', '.io', '.app', '.dev', '.xyz', '.online', '.tech', '.shop', '.tr'].map((t) => (
              <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-brand-100 font-medium">
                {t}
              </span>
            ))}
            <span className="rounded-full bg-amber-400/20 px-3 py-1 text-amber-200 font-semibold">+30 daha</span>
          </div>
        </div>
      </section>

      {/* Domain sonuçları */}
      {domainResults && (
        <section className="mx-auto max-w-4xl px-4 py-8">
          {addedMsg && (
            <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              ✅ {addedMsg}
            </div>
          )}

          {(() => {
            const available = domainResults.filter((d) => d.available);
            const taken = domainResults.filter((d) => !d.available);

            return (
              <>
                {/* Müsait olanlar */}
                {available.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-lg font-bold text-slate-800 mb-3">
                      <span className="text-green-600">✓</span> Müsait Alan Adları
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {available.length}
                      </span>
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {available.map((d) => (
                        <div key={d.domain} className="rounded-2xl border-2 border-green-200 bg-white p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-800 truncate">{d.domain}</div>
                            {d.priceTRY && (
                              <div className="text-sm font-bold text-brand-700 mt-0.5">
                                {tr(d.priceTRY)} ₺/yıl
                              </div>
                            )}
                          </div>
                          {d.priceTRY && (
                            <button
                              onClick={() => addDomain(d)}
                              disabled={isInCart(`domain:${d.domain}`)}
                              className={`ml-2 shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                                isInCart(`domain:${d.domain}`)
                                  ? 'bg-green-100 text-green-700 cursor-default'
                                  : 'bg-brand-600 text-white hover:bg-brand-700'
                              }`}
                            >
                              {isInCart(`domain:${d.domain}`) ? '✓ Sepette' : '+ Ekle'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alınmış olanlar */}
                {taken.length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-700 mb-3">
                      <span className="text-slate-400">✗</span> Kayıtlı Alan Adları
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {taken.length}
                      </span>
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {taken.map((d) => (
                        <div key={d.domain} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-700 truncate">{d.domain}</div>
                            <div className="text-xs text-slate-400 mt-0.5">Bu alan adı alınmış</div>
                          </div>
                          <a
                            href={`https://who.is/whois/${encodeURIComponent(d.domain)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 shrink-0 text-xs text-brand-600 hover:text-brand-800 hover:underline"
                          >
                            WHOIS →
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {available.length === 0 && taken.length === 0 && (
                  <p className="text-center text-slate-400 py-8">Sonuç bulunamadı.</p>
                )}
              </>
            );
          })()}
        </section>
      )}

      {/* Hosting Paketleri */}
      {hostingProducts.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-slate-900">Hosting Paketleri</h2>
            <p className="text-slate-500 mt-2">WordPress için optimize edilmiş, hızlı ve güvenli.</p>
          </div>

          <div className={`grid gap-6 ${hostingProducts.length === 1 ? 'max-w-sm mx-auto' : hostingProducts.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {hostingProducts.map((p, idx) => {
              const isPopular = idx === 1 && hostingProducts.length >= 3;
              const monthly = Math.round(Number(p.priceMonthly) * 1.2 * 100) / 100;
              const annually = p.priceAnnually
                ? Math.round(Number(p.priceAnnually) * 1.2 * 100) / 100
                : null;
              const specs = p.specs ?? {};

              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border p-6 flex flex-col ${
                    isPopular
                      ? 'border-brand-400 bg-white shadow-xl ring-2 ring-brand-500'
                      : 'border-slate-200 bg-white shadow-sm'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-bold text-white">
                      En Popüler
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
                  {p.description && (
                    <p className="text-sm text-slate-500 mt-1">{p.description}</p>
                  )}

                  <div className="mt-4 mb-5">
                    <div className="text-3xl font-extrabold text-brand-700">
                      {tr(monthly)} <span className="text-base font-normal text-slate-500">₺/ay</span>
                    </div>
                    {annually && (
                      <div className="text-sm text-green-600 font-medium mt-0.5">
                        Yıllık: {tr(annually)} ₺ — {Math.round((1 - annually / (monthly * 12)) * 100)}% indirim
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5">KDV dahil</div>
                  </div>

                  {/* Özellikler */}
                  {Object.keys(specs).length > 0 && (
                    <ul className="space-y-2 mb-6 flex-1">
                      {Object.entries(specs).map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="text-brand-500">✓</span>
                          <span><b>{k}:</b> {v}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Butonlar */}
                  <div className="space-y-2 mt-auto">
                    <button
                      onClick={() => addHosting(p, 'monthly')}
                      disabled={isInCart(`hosting:${p.id}:monthly`)}
                      className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                        isInCart(`hosting:${p.id}:monthly`)
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : isPopular
                            ? 'bg-brand-600 text-white hover:bg-brand-700'
                            : 'border border-brand-500 text-brand-700 hover:bg-brand-50'
                      }`}
                    >
                      {isInCart(`hosting:${p.id}:monthly`) ? '✓ Sepette' : 'Aylık Seç'}
                    </button>
                    {annually && (
                      <button
                        onClick={() => addHosting(p, 'annually')}
                        disabled={isInCart(`hosting:${p.id}:annually`)}
                        className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                          isInCart(`hosting:${p.id}:annually`)
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isInCart(`hosting:${p.id}:annually`) ? '✓ Sepette' : `Yıllık Seç — ${tr(annually)} ₺`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Neden AdigeHost */}
      <section className="bg-white border-t border-slate-100 py-16 px-4">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-10">Neden AdigeHost?</h2>
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              { icon: '⚡', title: 'Hızlı Kurulum', desc: 'Ödeme onayının ardından hosting hesabınız dakikalar içinde aktive edilir.' },
              { icon: '🔒', title: 'Güvenli', desc: 'SSL sertifikası, DDoS koruması ve düzenli yedekleme dahil.' },
              { icon: '🇹🇷', title: 'Türkiye Odaklı', desc: 'Havale/EFT ile ödeme, Türkçe destek, e-fatura.' },
            ].map((f) => (
              <div key={f.title}>
                <div className="text-4xl mb-3">{f.icon}</div>
                <div className="font-bold text-slate-800 mb-1">{f.title}</div>
                <div className="text-sm text-slate-500">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Güven kuşağı — Ödeme & SSL logoları */}
      <section className="border-t border-slate-200 bg-white py-8 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center text-xs uppercase tracking-wider text-slate-400 mb-4">
            Güvenli Ödeme
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Visa */}
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <svg width="56" height="18" viewBox="0 0 56 18" xmlns="http://www.w3.org/2000/svg">
                <text x="0" y="14" fontFamily="Helvetica, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="16" fill="#1A1F71">VISA</text>
              </svg>
            </div>
            {/* MasterCard */}
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm flex items-center gap-1">
              <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="9" cy="12" r="7" fill="#EB001B"/><circle cx="15" cy="12" r="7" fill="#F79E1B" opacity="0.85"/></svg>
              <span className="text-xs font-semibold text-slate-700">MasterCard</span>
            </div>
            {/* Troy */}
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <span className="text-sm font-extrabold text-blue-700">troy</span>
            </div>
            {/* iyzico */}
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#1E64FF"><path d="M12 2L2 12l10 10 10-10L12 2zm0 4l6 6-6 6-6-6 6-6z"/></svg>
              <span className="text-sm font-bold text-slate-700">iyzico ile Öde</span>
            </div>
            {/* Havale/EFT */}
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm flex items-center gap-2">
              <span className="text-base">🏦</span>
              <span className="text-sm font-semibold text-slate-700">Havale / EFT</span>
            </div>
            {/* SSL */}
            <div className="rounded-lg border-2 border-green-500 bg-green-50 px-4 py-2 shadow-sm flex items-center gap-2">
              <span className="text-green-600 text-base">🔒</span>
              <div>
                <div className="text-[10px] font-bold text-green-700 leading-tight">SSL</div>
                <div className="text-[10px] text-green-600 leading-tight">Güvenli Sertifika</div>
              </div>
            </div>
            {/* KDV/E-Fatura */}
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-700">✓ E-Fatura</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 text-slate-300 text-sm pt-12 pb-6 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 md:grid-cols-4">
            {/* Marka */}
            <div>
              <div className="text-xl font-bold text-white mb-3">AdigeHost</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Türkiye odaklı hosting, VPS ve domain hizmetleri.
              </p>
            </div>

            {/* Kurumsal */}
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Kurumsal</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="/legal/hakkimizda" className="hover:text-white">Hakkımızda</a></li>
                <li><a href="/legal/ssl-sertifikasi" className="hover:text-white">SSL Sertifikası</a></li>
                <li><a href="mailto:destek@adigehost.tr" className="hover:text-white">İletişim</a></li>
              </ul>
            </div>

            {/* Yasal */}
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Yasal</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="/legal/teslimat-ve-iade" className="hover:text-white">Teslimat ve İade Şartları</a></li>
                <li><a href="/legal/gizlilik" className="hover:text-white">Gizlilik Sözleşmesi</a></li>
                <li><a href="/legal/mesafeli-satis" className="hover:text-white">Mesafeli Satış Sözleşmesi</a></li>
              </ul>
            </div>

            {/* Hesap */}
            <div>
              <h4 className="font-semibold text-white mb-3 text-sm">Hesap</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="/login" className="hover:text-white">Giriş Yap</a></li>
                <li><a href="/register" className="hover:text-white">Kayıt Ol</a></li>
                <li><a href="/app" className="hover:text-white">Müşteri Paneli</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-700 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-slate-400">
            <div>© {new Date().getFullYear()} AdigeHost — Tüm hakları saklıdır.</div>
            <div>destek@adigehost.tr</div>
          </div>
        </div>
      </footer>

      {/* Sepet */}
      <CartDrawer onCheckout={goCheckout} />
    </div>
  );
}
