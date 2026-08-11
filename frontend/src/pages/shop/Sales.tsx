import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore, type CartItem } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { SERVICES } from '../../data/services';
import ServerScene from '../../components/shop/ServerScene';
import Reveal from '../../components/shop/Reveal';
import PageBackdrop from '../../components/shop/PageBackdrop';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';
import ServiceStrip from '../../components/shop/ServiceStrip';

interface Product {
  id: string;
  name: string;
  type: string;
  categoryId: string | null;
  priceMonthly: number;
  priceAnnually: number | null;
  setupFee: number | null;
  specs: Record<string, string> | null;
  description: string | null;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
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

/** İlk (hızlı) turda sorgulanan popüler uzantılar. */
const POPULAR_TLDS = ['com', 'com.tr', 'net', 'org', 'io', 'app', 'dev', 'tr'];
/** İkinci turda (arka planda) sorgulanan diğer uzantılar. */
const MORE_TLDS = [
  'info', 'co', 'net.tr', 'org.tr', 'xyz', 'online', 'site', 'tech', 'biz', 'cloud',
  'shop', 'store', 'me', 'eu', 'de', 'co.uk', 'web.tr', 'gen.tr', 'ist', 'istanbul',
  'club', 'pro', 'live', 'art', 'blog', 'agency', 'digital', 'design', 'studio',
  'tv', 'cc', 'us', 'asia',
];

/** Diziden tekrarları at, sırayı koru. */
function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/** İki domain sonucu listesini domain adına göre birleştirir (tekrarsız). */
function mergeDomainResults(a: DomainResult[], b: DomainResult[]): DomainResult[] {
  const seen = new Set(a.map((d) => d.domain));
  return [...a, ...b.filter((d) => !seen.has(d.domain))];
}

/**
 * Ana sayfadaki 3 büyük "ne satıyoruz" kartı.
 *
 * Sıra bilinçli: ziyaretçilerin çoğu "sitem yok, yapılsın" diye gelir —
 * en açıklamalı ve en kârlı hizmet başta. Her kart GERÇEK bir satın alma
 * adımına gider (hukuki metne değil).
 */
const SOLUTIONS: {
  title: string;
  desc: string;
  bullets: string[];
  cta: string;
  icon: ReactNode;
  href: string;
  hue: string;
}[] = [
  {
    title: 'Web Sitenizi Yapalım',
    desc: 'Siteniz yok mu? Tasarımdan yayına kadar her şeyi biz yapalım — siz tek satır kod görmeyin.',
    bullets: ['Anahtar teslim kurulum', 'Hosting ve SSL dahil', 'Bakım ve güncelleme bizde'],
    cta: 'Paketleri ve fiyatları gör',
    href: '/web-sitesi',
    hue: 'from-sky-400/80 to-blue-600/80',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01" />
      </svg>
    ),
  },
  {
    title: 'Alan Adınızı Alın',
    desc: 'İşletmenizin internetteki adresi. .com, .com.tr ve 40+ uzantıyı hemen sorgulayın.',
    bullets: ['40+ uzantı', 'Anında tescil', 'DNS yönetimi ücretsiz'],
    cta: 'Alan adı sorgula',
    href: '#alan-adi',
    hue: 'from-violet-400/80 to-fuchsia-600/80',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
      </svg>
    ),
  },
  {
    title: 'Siteniz Varsa Barındıralım',
    desc: 'Hazır siteniz mi var? cPanel hosting paketlerimize taşıyalım — taşıma ücretsiz.',
    bullets: ['Ücretsiz taşıma', 'Günlük yedek', 'Ücretsiz SSL'],
    cta: 'Hosting paketlerine bak',
    href: '#planlar',
    hue: 'from-emerald-400/80 to-teal-600/80',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 17a4 4 0 0 1-.8-7.92A5.5 5.5 0 0 1 16 8.5a3.5 3.5 0 0 1 1 6.86" />
        <path d="M8 17h9" />
      </svg>
    ),
  },
];

function CartDrawer({ onCheckout }: { onCheckout: () => void }) {
  const { items, remove, total, totalExVat, count } = useCartStore();
  const [open, setOpen] = useState(false);
  const vat = total() - totalExVat();

  return (
    <>
      {/* Sepet butonu — sabit sağ üst */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-20 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-neon-violet px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.7)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_50px_-8px_rgba(139,92,246,0.8)]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6h15l-1.5 9h-12z" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
          <path d="M6 6 5 3H3" />
        </svg>
        Sepet
        {count() > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700">
            {count()}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative flex w-full max-w-sm flex-col border-l border-white/10 bg-night-900 text-slate-100 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-lg font-bold text-white">Sepetim ({count()})</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.length === 0 ? (
                <p className="text-center text-slate-500 py-10">Sepetiniz boş.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-100 text-sm">{item.name}</div>
                      {item.billingCycle && (
                        <div className="text-xs text-slate-400">
                          {item.billingCycle === 'annually' ? 'Yıllık' : 'Aylık'}
                        </div>
                      )}
                      <div className="mt-1 font-semibold text-brand-300">{tr(item.price)} ₺</div>
                      <div className="text-xs text-slate-500">KDV hariç {tr(item.priceExVat)} ₺</div>
                    </div>
                    <button
                      onClick={() => remove(item.id)}
                      className="mt-0.5 text-red-400 hover:text-red-300 text-xs"
                    >
                      Kaldır
                    </button>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-white/10 px-5 py-4 space-y-3">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Ara toplam</span>
                  <span>{tr(totalExVat())} ₺</span>
                </div>
                <div className="flex justify-between text-sm text-slate-400">
                  <span>KDV</span>
                  <span>{tr(vat)} ₺</span>
                </div>
                <div className="flex justify-between font-bold text-white">
                  <span>Toplam</span>
                  <span className="text-brand-300 text-lg">{tr(total())} ₺</span>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    onCheckout();
                  }}
                  className="btn-neon w-full"
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

/** Tek bir ürün/paket kartı — hosting sepete eklenir, VPS yapılandırıcıya yönlendirir. */
function ProductCard({
  p,
  isPopular,
  isInCart,
  onAddHosting,
  onConfigureVps,
}: {
  p: Product;
  isPopular: boolean;
  isInCart: (id: string) => boolean;
  onAddHosting: (p: Product, cycle: 'monthly' | 'annually') => void;
  onConfigureVps: () => void;
}) {
  const monthly = Math.round(Number(p.priceMonthly) * 1.2 * 100) / 100;
  const annually = p.priceAnnually ? Math.round(Number(p.priceAnnually) * 1.2 * 100) / 100 : null;
  const specs = p.specs ?? {};
  const isVps = p.type === 'vps';

  return (
    <div
      className={`card-3d relative flex flex-col rounded-2xl p-6 ${
        isPopular
          ? 'glass glow-ring bg-gradient-to-b from-white/[0.08] to-white/[0.02]'
          : 'glass'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-neon-violet px-4 py-1 text-xs font-bold text-white shadow-lg">
          En Popüler
        </div>
      )}
      <h3 className="text-xl font-bold text-white">{p.name}</h3>
      {p.description && <p className="text-sm text-slate-400 mt-1">{p.description}</p>}

      <div className="mt-4 mb-5">
        <div className="text-3xl font-extrabold text-white">
          {tr(monthly)}
          <span className="text-base font-normal text-slate-400">₺/ay</span>
        </div>
        {annually && (
          <div className="text-sm text-emerald-400 font-medium mt-0.5">
            Yıllık: {tr(annually)} ₺ — {Math.round((1 - annually / (monthly * 12)) * 100)}% indirim
          </div>
        )}
        <div className="text-xs text-slate-500 mt-0.5">KDV dahil</div>
      </div>

      {/* Özellikler */}
      {Object.keys(specs).length > 0 && (
        <ul className="space-y-2 mb-6 flex-1">
          {Object.entries(specs).map(([k, v]) => (
            <li key={k} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-brand-400">▸</span>
              <span>
                <b className="text-slate-100">{k}:</b> {String(v)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Butonlar */}
      <div className="space-y-2 mt-auto">
        {isVps ? (
          <button onClick={onConfigureVps} className="btn-neon w-full">
            VPS Yapılandır →
          </button>
        ) : (
          <>
            <button
              onClick={() => onAddHosting(p, 'monthly')}
              disabled={isInCart(`hosting:${p.id}:monthly`)}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                isInCart(`hosting:${p.id}:monthly`)
                  ? 'bg-emerald-500/15 text-emerald-300 cursor-default ring-1 ring-emerald-400/30'
                  : isPopular
                    ? 'btn-neon'
                    : 'border border-brand-400/50 text-brand-200 hover:bg-brand-500/10 hover:border-brand-300'
              }`}
            >
              {isInCart(`hosting:${p.id}:monthly`) ? 'Sepette ✓' : 'Aylık Seç'}
            </button>
            {annually && (
              <button
                onClick={() => onAddHosting(p, 'annually')}
                disabled={isInCart(`hosting:${p.id}:annually`)}
                className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  isInCart(`hosting:${p.id}:annually`)
                    ? 'bg-emerald-500/15 text-emerald-300 cursor-default ring-1 ring-emerald-400/30'
                    : 'bg-white/5 text-slate-200 hover:bg-white/10 ring-1 ring-white/10'
                }`}
              >
                {isInCart(`hosting:${p.id}:annually`) ? 'Sepette ✓' : `Yıllık Seç — ${tr(annually)} ₺`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Başlık + ürün kartı ızgarası — hem kategori bölümleri hem de kategorisiz ürünler için. */
function ProductSection({
  id,
  title,
  subtitle,
  items,
  isInCart,
  onAddHosting,
  onConfigureVps,
}: {
  id?: string;
  title: string;
  subtitle?: string | null;
  items: Product[];
  isInCart: (id: string) => boolean;
  onAddHosting: (p: Product, cycle: 'monthly' | 'annually') => void;
  onConfigureVps: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-16">
      <Reveal className="text-center mb-10">
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">{title}</h2>
        {subtitle && <p className="text-slate-400 mt-2">{subtitle}</p>}
      </Reveal>
      <div
        className={`grid gap-6 ${
          items.length === 1
            ? 'max-w-sm mx-auto'
            : items.length === 2
              ? 'sm:grid-cols-2'
              : 'sm:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {items.map((p, idx) => (
          <Reveal key={p.id} delay={idx * 90} className="[perspective:1200px]">
            <ProductCard
              p={p}
              isPopular={idx === 1 && items.length >= 3 && p.type === 'hosting'}
              isInCart={isInCart}
              onAddHosting={onAddHosting}
              onConfigureVps={onConfigureVps}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export default function Sales() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { add, items } = useCartStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [domainName, setDomainName] = useState('');
  const [domainResults, setDomainResults] = useState<DomainResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [domainError, setDomainError] = useState('');
  const searchSeq = useRef(0);
  const [addedMsg, setAddedMsg] = useState('');
  // Transfer tab state

  useEffect(() => {
    api.get('/public/products').then((r) => setProducts(r.data.data ?? []));
    api.get('/public/categories').then((r) => setCategories(r.data.data ?? []));
  }, []);

  /** Tek turda backend'e uzantı listesi sorar. */
  const queryTlds = async (name: string, tlds: string[]): Promise<DomainResult[]> => {
    const r = await api.post('/public/domains/check', { name, tlds });
    return (r.data.data ?? []) as DomainResult[];
  };

  const searchDomain = async (e: FormEvent) => {
    e.preventDefault();
    const raw = domainName.trim().toLowerCase();
    if (!raw) return;

    // Kullanıcı "ornek.com" / "ornek.com.tr" yazarsa uzantıyı tanı ve öne al.
    let name = raw;
    let userTld: string | null = null;
    const dotIdx = raw.indexOf('.');
    if (dotIdx > 0) {
      name = raw.slice(0, dotIdx);
      userTld = raw.slice(dotIdx + 1).replace(/[^a-z0-9.]/g, '') || null;
    }
    // Alan adını temizle (harf, rakam, tire)
    name = name.replace(/[^a-z0-9-]/g, '');
    if (!name) {
      setDomainError('Geçerli bir alan adı girin (harf, rakam, tire)');
      return;
    }

    // 1. tur: yazılan uzantı (varsa) + popülerler — HIZLI
    const firstBatch = uniq([...(userTld ? [userTld] : []), ...POPULAR_TLDS]);
    // 2. tur: geri kalan her şey (ilk turdakiler hariç)
    const restBatch = uniq([...POPULAR_TLDS, ...MORE_TLDS]).filter((t) => !firstBatch.includes(t));

    const seq = ++searchSeq.current;
    setDomainError('');
    setDomainResults(null);
    setSearching(true);
    setLoadingMore(true);
    try {
      // Popülerleri hemen getir ve göster
      const first = await queryTlds(name, firstBatch);
      if (seq !== searchSeq.current) return; // yeni bir arama başladıysa bırak
      setDomainResults(first);
      setSearching(false);

      // Kalanları arka planda getir, gelince listeye ekle
      if (restBatch.length > 0) {
        queryTlds(name, restBatch)
          .then((rest) => {
            if (seq !== searchSeq.current) return; // eski aramanın kalanını yok say
            setDomainResults((prev) => mergeDomainResults(prev ?? first, rest));
          })
          .catch(() => {
            /* kalanlar alınamadıysa sessiz geç — popülerler zaten gösterildi */
          })
          .finally(() => {
            if (seq === searchSeq.current) setLoadingMore(false);
          });
      } else {
        setLoadingMore(false);
      }
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setDomainError(getApiErrorMessage(err));
      setSearching(false);
      setLoadingMore(false);
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
    const priceRaw =
      cycle === 'annually' && p.priceAnnually ? Number(p.priceAnnually) : Number(p.priceMonthly);
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
  const goVps = () => navigate('/vps');

  // Web sitesi yapım paketleri kendi vitrininde gösterilir; hosting/VPS kategori
  // bölümlerine karışmamalı (fiyat mantığı farklı: kurulum + abonelik).
  const websitePackages = products.filter((p) => p.type === 'website');
  const sellableProducts = products.filter((p) => p.type !== 'website');

  // Yalnızca ürünü olan aktif kategoriler bölüm olur (sortOrder zaten backend'de uygulanır)
  const categorySections = categories
    .map((c) => ({ category: c, items: sellableProducts.filter((p) => p.categoryId === c.id) }))
    .filter((s) => s.items.length > 0);

  // Kategorisi olmayan hosting/e-posta ürünleri eski "Hosting Paketleri" bölümünde
  // kalır — kategorisi olanlar kendi bölümünde çıkar. E-posta da buraya dahil,
  // yoksa kategorisiz bir e-posta paketi vitrinde hiç görünmez.
  const uncategorizedHosting = sellableProducts.filter(
    (p) => (p.type === 'hosting' || p.type === 'email') && !p.categoryId,
  );

  /** Hero sağ sütununda, animasyonun üzerinde gösterilen sonuç paneli. */
  const renderDomainPanel = () => {
    const available = domainResults?.filter((d) => d.available) ?? [];
    const taken = domainResults?.filter((d) => !d.available) ?? [];
    return (
      <div className="absolute inset-x-0 -top-6 -bottom-10 flex animate-fade-up flex-col overflow-hidden rounded-3xl border border-white/15 bg-night-900/95 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:-inset-x-6 sm:-top-8 sm:-bottom-12">
        {/* Başlık */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            Alan Adı Sonuçları
            {domainResults && available.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                {available.length} müsait
              </span>
            )}
          </div>
          <button
            onClick={() => {
              searchSeq.current++;
              setDomainResults(null);
              setSearching(false);
              setLoadingMore(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        {addedMsg && (
          <div className="mb-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {addedMsg}
          </div>
        )}
        {searching && (
          <div className="mb-2 flex items-center gap-2 text-xs text-brand-200">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-300/40 border-t-brand-300" />
            Popüler uzantılar sorgulanıyor…
          </div>
        )}
        {loadingMore && !searching && (
          <div className="mb-2 flex items-center gap-2 text-xs text-brand-200">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-300/40 border-t-brand-300" />
            Diğer uzantılar yükleniyor…
          </div>
        )}

        {/* Kayan liste */}
        <div className="-mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
          {available.map((d) => (
            <div
              key={d.domain}
              className="flex items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] px-3 py-2 transition hover:border-emerald-400/50"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{d.domain}</div>
                {d.priceTRY && (
                  <div className="text-xs font-bold text-brand-300">{tr(d.priceTRY)} ₺/yıl</div>
                )}
              </div>
              {d.priceTRY && (
                <button
                  onClick={() => addDomain(d)}
                  disabled={isInCart(`domain:${d.domain}`)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isInCart(`domain:${d.domain}`)
                      ? 'cursor-default bg-emerald-500/15 text-emerald-300'
                      : 'bg-gradient-to-r from-brand-600 to-neon-violet text-white hover:opacity-90'
                  }`}
                >
                  {isInCart(`domain:${d.domain}`) ? 'Sepette' : '+ Ekle'}
                </button>
              )}
            </div>
          ))}

          {taken.length > 0 && (
            <div className="pt-1">
              <div className="mb-1.5 text-xs font-medium text-slate-500">Kayıtlı ({taken.length})</div>
              <div className="space-y-1.5">
                {taken.map((d) => (
                  <div
                    key={d.domain}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5"
                  >
                    <span className="truncate text-xs text-slate-400">{d.domain}</span>
                    <a
                      href={`https://who.is/whois/${encodeURIComponent(d.domain)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[11px] text-brand-300 hover:text-brand-200 hover:underline"
                    >
                      WHOIS →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {domainResults && !searching && available.length === 0 && taken.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">Sonuç bulunamadı.</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <PageBackdrop>
      <ShopHeader showNav />

      {/* ===================== HERO ===================== */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-16 pb-10 lg:grid-cols-2 lg:pt-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-emerald-400" />
            2001'den beri hizmetinizdeyiz • %99.9 çalışma süresi
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
            İşletmenizin{' '}
            <span className="text-gradient text-gradient-anim">web sitesini biz kuralım</span>, biz yayında tutalım.
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-400">
            Alan adı, hosting ve web sitesi tasarımı — üçü tek yerden. Teknik hiçbir şey bilmenize
            gerek yok: siteyi biz yapıyor, biz güncelliyor, biz açık tutuyoruz.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="/web-sitesi" className="btn-neon">
              WEB SİTESİ YAPTIRMAK İSTİYORUM
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              href="#planlar"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/5"
            >
              Sadece hosting arıyorum
            </a>
          </div>

          {/* Domain arama — cam kutu */}
          <div id="alan-adi" className="glass mt-9 scroll-mt-24 rounded-2xl p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-300" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
              </svg>
              Alan adınız müsait mi? Hemen sorgulayın
            </div>
            <form onSubmit={searchDomain} className="flex gap-2">
              <input
                value={domainName}
                onChange={(e) => setDomainName(e.target.value.replace(/\s/g, '').toLowerCase())}
                placeholder="ornek-domain veya ornek.com"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-night-900/70 px-4 py-3 text-base text-white placeholder-slate-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/30"
              />
              <button type="submit" disabled={searching} className="btn-neon shrink-0 disabled:opacity-60">
                {searching ? 'Aranıyor…' : 'Sorgula'}
              </button>
            </form>
            {domainError && <p className="mt-3 text-sm text-red-300">{domainError}</p>}
            {searching && (
              <p className="mt-3 text-sm text-brand-200">Popüler uzantılar sorgulanıyor…</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {['.com', '.com.tr', '.net', '.io', '.app', '.dev', '.tr'].map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-slate-300">
                  {t}
                </span>
              ))}
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-semibold text-amber-300">
                +30 daha
              </span>
            </div>
          </div>
        </div>

        {/* Animasyonlu görsel + domain sonuç paneli (üstte) */}
        <div className="relative mx-auto w-full max-w-[520px] animate-fade-up [animation-delay:0.15s]">
          <ServerScene />
          {(searching || domainResults) && renderDomainPanel()}
        </div>
      </section>

      {/* Hizmet şeridi — tüm hizmetler ilk ekranda görünsün (kaldırmak için bu satır yeter) */}
      <ServiceStrip />

      {/* Kayan güven şeridi */}
      <div className="relative overflow-hidden border-y border-white/5 py-4">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap px-5 text-sm font-medium text-slate-500">
          {[...Array(2)].map((_, dup) => (
            <div key={dup} className="flex gap-10">
              {['NVMe SSD', 'LiteSpeed', 'Ücretsiz SSL', 'Günlük Yedek', 'DDoS Koruması', 'Hetzner Cloud', '7/24 Destek', 'cPanel', 'Türkçe Panel', 'e-Fatura'].map((f) => (
                <span key={f} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                  {f}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===================== ÇÖZÜMLER (3 büyük kart) ===================== */}
      <section id="cozumler" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="mb-12 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Size Nasıl Yardımcı Olabiliriz?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Durumunuza en yakın olanı seçin — gerisini biz hallederiz.
          </p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s, i) => (
            <Reveal key={s.title} delay={i * 120} className="[perspective:1200px]">
              <a
                href={s.href}
                className="card-3d group relative flex h-full flex-col overflow-hidden rounded-2xl glass p-7"
              >
                {/* İç parıltı */}
                <div className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${s.hue} opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-50`} />
                <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${s.hue} text-white shadow-lg`}>
                  {s.icon}
                </span>
                <h3 className="relative mt-6 text-xl font-bold text-white">{s.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
                <ul className="relative mt-4 flex-1 space-y-1.5">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-slate-300">
                      <span className="text-emerald-400">✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
                <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 transition group-hover:gap-3">
                  {s.cta}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== WEB SİTESİ PAKETLERİ VİTRİNİ =====================
          Ana gelir kalemi anasayfada görünür olmalı. Detay ve satın alma /web-sitesi'nde. */}
      {websitePackages.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <Reveal className="mb-10 text-center">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Siteniz Yok mu? Biz Yapalım.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">
              Kurulum bedeli tek seferlik; aylık abonelik sitenizi yayında tutar — hosting, SSL,
              yedekleme ve bakım dahil.
            </p>
          </Reveal>
          <div
            className={`grid gap-6 ${
              websitePackages.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {websitePackages.map((p, i) => {
              const setup = Number(p.setupFee ?? 0) * 1.2;
              const monthly = Number(p.priceMonthly) * 1.2;
              return (
                <Reveal key={p.id} delay={i * 100}>
                  <a
                    href="/web-sitesi"
                    className="glass group flex h-full flex-col rounded-2xl p-6 transition duration-300 hover:-translate-y-1.5 hover:border-brand-400/40"
                  >
                    <h3 className="text-lg font-bold text-white">{p.name}</h3>
                    {p.description && (
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-5 border-t border-white/10 pt-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Kurulum (tek seferlik)
                      </div>
                      <div className="text-2xl font-extrabold text-white">
                        {Math.round(setup).toLocaleString('tr-TR')} ₺
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        + aylık{' '}
                        <b className="text-brand-300">
                          {Math.round(monthly).toLocaleString('tr-TR')} ₺
                        </b>{' '}
                        bakım ve hosting
                      </div>
                      <div className="mt-1 text-xs text-slate-500">KDV dahil</div>
                    </div>
                    <span className="mt-5 text-sm font-semibold text-brand-300 transition group-hover:translate-x-1">
                      Detaylar ve sipariş →
                    </span>
                  </a>
                </Reveal>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <a href="/web-sitesi" className="btn-neon">
              PAKETLERİ KARŞILAŞTIR VE SİPARİŞ VER
            </a>
          </div>
        </section>
      )}

      {/* Tüm hizmetler ızgarası */}
      <section className="mx-auto max-w-6xl px-4 pb-8">
        <Reveal className="mb-10 text-center">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">Tüm İhtiyaçlarınız Tek Çatı Altında</h2>
          <p className="mt-2 text-slate-400">İhtiyacınız olan hizmeti seçin — gerisini AdigeHost halletsin.</p>
        </Reveal>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {SERVICES.map((s, i) => (
            <Reveal key={s.slug} delay={i * 60}>
              <a
                href={s.href}
                className="group flex h-full flex-col items-start gap-3 rounded-2xl glass p-5 transition duration-300 hover:-translate-y-1.5 hover:border-brand-400/40 hover:shadow-[0_24px_50px_-24px_rgba(37,99,235,0.7)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-brand-300 ring-1 ring-white/10 transition group-hover:bg-brand-500/20 group-hover:text-brand-200">
                  {s.icon}
                </span>
                <div className="flex-1">
                  <div className="font-bold text-white">{s.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-400">{s.tagline}</div>
                </div>
                <span className="text-sm font-semibold text-brand-300 transition group-hover:translate-x-1">
                  Keşfet →
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Kategori bölümleri — her aktif kategori ayrı başlık olarak */}
      <div id="planlar" />
      {categorySections.map((s) => (
        <ProductSection
          key={s.category.id}
          title={s.category.name}
          subtitle={s.category.description}
          items={s.items}
          isInCart={isInCart}
          onAddHosting={addHosting}
          onConfigureVps={goVps}
        />
      ))}

      {/* Kategorisiz hosting paketleri */}
      <ProductSection
        title="Hosting Paketleri"
        subtitle="Siteniz hazırsa yayına alın — WordPress dahil tüm PHP tabanlı siteleri barındırır."
        items={uncategorizedHosting}
        isInCart={isInCart}
        onAddHosting={addHosting}
        onConfigureVps={goVps}
      />

      {/* ===================== ALTYAPI & TEKNOLOJİ ===================== */}
      <section id="altyapi" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-extrabold uppercase tracking-wide text-white sm:text-4xl">
              Altyapı & Teknoloji
            </h2>
            <p className="mt-3 max-w-md text-slate-400">
              Modern yığın, güçlü donanım ve otomasyon — hepsi tek panelde.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                { t: 'Yüksek Performans', d: 'NVMe SSD depolama, LiteSpeed ve HTTP/3 ile ışık hızında yükleme.' },
                { t: 'Otomasyon & Ölçekleme', d: 'Dakikalar içinde tahsis, tek tıkla kaynak yükseltme.' },
                { t: 'Güvenlik & SSL', d: 'Ücretsiz sertifika, WAF ve gerçek zamanlı tehdit izleme.' },
              ].map((row, i) => (
                <li key={row.t} className="flex items-start gap-4">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-neon-violet text-white shadow-[0_0_20px_-4px_rgba(59,130,246,0.8)] animate-float"
                    style={{ animationDelay: `${i * 0.4}s` }}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                  <div>
                    <div className="font-semibold text-white">{row.t}</div>
                    <div className="text-sm text-slate-400">{row.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Animasyonlu kod editörü maketi */}
          <Reveal delay={120}>
            <div className="glass glow-ring relative overflow-hidden rounded-2xl animate-float-slow">
              {/* parıltı */}
              <div className="pointer-events-none absolute -inset-1 -z-10 bg-gradient-to-tr from-brand-600/20 via-transparent to-neon-violet/20 blur-2xl" />
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400/80" />
                <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs text-slate-500">deploy — adigehost</span>
              </div>
              <div className="space-y-2.5 p-5 font-mono text-[13px] leading-relaxed">
                <div><span className="text-violet-300">$</span> <span className="text-slate-200">adige deploy --prod</span></div>
                <div className="text-slate-500">→ altyapı hazırlanıyor…</div>
                <div className="text-emerald-300">✓ NVMe disk bağlandı</div>
                <div className="text-emerald-300">✓ SSL sertifikası üretildi</div>
                <div className="text-emerald-300">✓ CDN & WAF etkin</div>
                <div className="text-brand-300">↑ dağıtım tamamlandı — 42s</div>
                <div className="flex items-center gap-2 pt-1 text-slate-300">
                  <span className="text-violet-300">$</span>
                  <span className="inline-block h-4 w-2 animate-blink bg-brand-300" />
                </div>
                {/* Tarama ışığı */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="absolute -inset-y-4 w-1/3 -skew-x-12 animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* VPS CTA */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <Reveal>
          <div className="glass relative overflow-hidden rounded-3xl px-6 py-14 text-center">
            <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[80%] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[100px]" />
            <div className="pointer-events-none absolute bottom-0 right-10 h-40 w-40 rounded-full bg-neon-violet/20 blur-[80px]" />
            <h2 className="relative text-3xl font-extrabold text-white sm:text-4xl">Kendi VPS'inizi Yapılandırın</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-slate-400">
              CPU, RAM, disk ve lokasyonu seçin — Hetzner Cloud altyapısında dakikalar içinde teslim.
            </p>
            <a href="/vps" className="btn-neon relative mt-8">
              VPS Yapılandır →
            </a>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3 text-xs">
              {['Frankfurt', 'Nürnberg', 'Helsinki', 'Ashburn', 'Singapur'].map((c) => (
                <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* Neden AdigeHost */}
      <section className="mx-auto max-w-4xl px-4 py-16">
        <Reveal className="mb-12 text-center">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">Neden AdigeHost?</h2>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: '2001\'den Beri',
              desc: '25 yılı aşkın tecrübeyle kesintisiz hizmet veriyoruz.',
              icon: (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </>
              ),
            },
            {
              title: 'Hızlı Kurulum',
              desc: 'Ödeme onayının ardından hosting hesabınız dakikalar içinde aktive edilir.',
              icon: (
                <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
              ),
            },
            {
              title: 'Güvenli',
              desc: 'SSL sertifikası, DDoS koruması ve düzenli yedekleme dahil.',
              icon: (
                <>
                  <path d="M12 3 5 6v5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-3Z" />
                  <path d="m9 12 2 2 4-4" />
                </>
              ),
            },
            {
              title: 'Türkiye Odaklı',
              desc: 'Havale/EFT ile ödeme, Türkçe destek, e-fatura.',
              icon: (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
                </>
              ),
            },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 110}>
              <div className="glass h-full rounded-2xl p-6 text-center transition hover:-translate-y-1">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-neon-violet/30 text-brand-200 ring-1 ring-white/10">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {f.icon}
                  </svg>
                </div>
                <div className="mb-1 font-bold text-white">{f.title}</div>
                <div className="text-sm text-slate-400">{f.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <ShopFooter />

      {/* Sepet */}
      <CartDrawer onCheckout={goCheckout} />
    </PageBackdrop>
  );
}
