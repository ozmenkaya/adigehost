import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useCartStore, type CartItem } from '../../store/cartStore';
import PageBackdrop from '../../components/shop/PageBackdrop';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';
import Reveal from '../../components/shop/Reveal';

/**
 * /web-sitesi — "Bana web sitesi yapın" sayfası.
 *
 * Satılan şey burada bir yazılım değil, bir HİZMET: siteyi biz kuruyoruz
 * (tek seferlik kurulum bedeli), sonra yayında tutuyoruz (aylık abonelik).
 * Paketler admin > Ürünler'de type='website' olan kayıtlardan gelir.
 */

interface Product {
  id: string;
  name: string;
  type: string;
  priceMonthly: string | number;
  priceAnnually: string | number | null;
  setupFee: string | number;
  specs: Record<string, string> | null;
  description: string | null;
}

/** Tam sayı TL — büyük kurulum bedellerinde kuruş göstermek gereksiz gürültü. */
const trWhole = (n: number) => Math.round(n).toLocaleString('tr-TR');

const VAT = 1.2;

const STEPS = [
  {
    n: '1',
    title: 'Paketinizi seçin',
    desc: 'Vitrin, kurumsal veya e-ticaret. Emin değilseniz bize sorun, birlikte karar veririz.',
  },
  {
    n: '2',
    title: 'İçeriğinizi bize gönderin',
    desc: 'Logo, metinler, görseller ve iletişim bilgileriniz. Elinizde yoksa biz yazalım.',
  },
  {
    n: '3',
    title: 'Siteniz yayına alınır',
    desc: 'Alan adı, hosting, SSL ve e-posta kurulumu dahil — siz hiçbir teknik işle uğraşmazsınız.',
  },
  {
    n: '4',
    title: 'Biz yayında tutarız',
    desc: 'Aylık abonelik: hosting, yedekleme, güvenlik güncellemeleri ve içerik değişiklikleriniz.',
  },
];

const FAQ = [
  {
    q: 'Alan adı (domain) ve hosting ücreti ayrıca mı ödenecek?',
    a: 'Hosting ve SSL aylık aboneliğe dahildir, ayrıca ödemezsiniz. Alan adı yıllık ücreti ayrıdır çünkü kayıt kuruluşuna ödenir — sitesi olan bir alan adınız varsa onu da kullanabiliriz. Yeni alan adı almak isterseniz sipariş sırasında sepete ekleyebilirsiniz.',
  },
  {
    q: 'Aylık ödemeyi bırakırsam siteme ne olur?',
    a: 'Abonelik bittiğinde site yayından çıkar; hosting ve bakım hizmeti durur. Sitenizin dosyalarını ve verilerini talep ederseniz size teslim ederiz — siteniz sizin malınızdır, rehin tutmayız.',
  },
  {
    q: 'Sitede sonradan değişiklik isteyebilir miyim?',
    a: 'Evet. Her paketin bakım kapsamında düzenli içerik güncellemesi hakkı var (paket detaylarında yazılı). Kapsamı aşan yeni sayfa veya yeniden tasarım gibi işler ayrıca fiyatlandırılır — öncesinde onayınızı alırız.',
  },
  {
    q: 'Siteyi kendim de güncelleyebilir miyim?',
    a: 'Kurumsal ve E-Ticaret paketlerinde yönetim paneli erişimi verilir; blog yazısı, ürün veya fiyat güncellemelerini kendiniz yapabilirsiniz. İsterseniz kullanım eğitimi de veriyoruz.',
  },
  {
    q: 'Ne kadar sürede teslim edilir?',
    a: 'Paket detaylarında yazan iş günü süreleri, içerikleriniz (metin, görsel, logo) bize ulaştıktan sonra başlar. Süreç boyunca ara onaylar için sizinle iletişimde kalırız.',
  },
  {
    q: 'Ödeme nasıl yapılır?',
    a: 'Kredi kartı (tek çekim veya taksit) ya da havale/EFT. Faturanız e-fatura olarak düzenlenir. İlk ödeme kurulum bedeli + ilk dönem aboneliğini kapsar; sonrasında yalnızca abonelik tahsil edilir.',
  },
];

/** Tek paket kartı — aylık/yıllık seçimi ve sepete ekleme. */
function PackageCard({
  p,
  isPopular,
  cycle,
  inCart,
  onAdd,
}: {
  p: Product;
  isPopular: boolean;
  cycle: 'monthly' | 'annually';
  inCart: boolean;
  onAdd: () => void;
}) {
  const setupExVat = Number(p.setupFee ?? 0);
  const setup = setupExVat * VAT;
  const monthlyExVat = Number(p.priceMonthly);
  const annualExVat = p.priceAnnually != null ? Number(p.priceAnnually) : null;

  // Gösterilen abonelik tutarı — yıllıkta "ayına düşen"i de belirtiyoruz.
  const subExVat = cycle === 'annually' && annualExVat != null ? annualExVat : monthlyExVat;
  const sub = subExVat * VAT;
  const annualSaving =
    annualExVat != null ? Math.round((1 - annualExVat / (monthlyExVat * 12)) * 100) : 0;

  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl p-6 ${
        isPopular ? 'glass glow-ring bg-gradient-to-b from-white/[0.08] to-white/[0.02]' : 'glass'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-neon-violet px-4 py-1 text-xs font-bold text-white shadow-lg">
          En Çok Tercih Edilen
        </div>
      )}

      <h3 className="text-xl font-bold text-white">{p.name}</h3>
      {p.description && (
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.description}</p>
      )}

      {/* Fiyat — kurulum ve abonelik AYRI, çünkü müşteri en çok bunu karıştırıyor */}
      <div className="mt-5 rounded-xl border border-white/10 bg-night-900/50 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Tek seferlik kurulum
        </div>
        <div className="mt-0.5 text-3xl font-extrabold text-white">
          {trWhole(setup)}
          <span className="ml-1 text-base font-normal text-slate-400">₺</span>
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Sonra {cycle === 'annually' ? 'yıllık' : 'aylık'}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-brand-300">{trWhole(sub)}</span>
            <span className="text-sm text-slate-400">₺/{cycle === 'annually' ? 'yıl' : 'ay'}</span>
          </div>
          {cycle === 'annually' && annualExVat != null && (
            <div className="mt-0.5 text-xs font-medium text-emerald-400">
              Ayına {trWhole((annualExVat / 12) * VAT)} ₺ — %{annualSaving} tasarruf
            </div>
          )}
          <div className="mt-1 text-xs text-slate-500">Hosting, SSL ve bakım dahil</div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Tüm fiyatlar KDV dahildir. İlk ödeme: {trWhole(setup + sub)} ₺
        </div>
      </div>

      {/* Paket kapsamı */}
      {p.specs && Object.keys(p.specs).length > 0 && (
        <ul className="mt-5 flex-1 space-y-2.5">
          {Object.entries(p.specs).map(([k, v]) => (
            <li key={k} className="flex gap-2.5 text-sm text-slate-300">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m4 12 5 5L20 6" />
                </svg>
              </span>
              <span>
                <b className="font-semibold text-slate-100">{k}:</b> {v}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onAdd}
        disabled={inCart}
        className={`mt-6 w-full rounded-xl py-3 text-sm font-semibold transition ${
          inCart
            ? 'cursor-default bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30'
            : isPopular
              ? 'btn-neon'
              : 'border border-brand-400/50 text-brand-200 hover:border-brand-300 hover:bg-brand-500/10'
        }`}
      >
        {inCart ? 'Sepette ✓' : 'Bu Paketi Seç'}
      </button>
    </div>
  );
}

export default function WebsitePackages() {
  const navigate = useNavigate();
  const { add, items } = useCartStore();

  const [packages, setPackages] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<'monthly' | 'annually'>('monthly');
  const [note, setNote] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [addedMsg, setAddedMsg] = useState('');

  useEffect(() => {
    api
      .get('/public/products')
      .then((r) => {
        const all = (r.data.data ?? []) as Product[];
        setPackages(all.filter((p) => p.type === 'website'));
      })
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  const addPackage = (p: Product) => {
    const setupExVat = Number(p.setupFee ?? 0);
    const subExVat =
      cycle === 'annually' && p.priceAnnually != null
        ? Number(p.priceAnnually)
        : Number(p.priceMonthly);
    // İlk ödeme = kurulum + ilk dönem. Yenilemede yalnızca abonelik tahsil edilir.
    const priceExVat = setupExVat + subExVat;
    const item: CartItem = {
      id: `website:${p.id}:${cycle}`,
      type: 'website',
      name: `${p.name} (${cycle === 'annually' ? 'Yıllık' : 'Aylık'} bakım)`,
      price: Math.round(priceExVat * VAT * 100) / 100,
      priceExVat,
      vatRate: 20,
      billingCycle: cycle,
      productId: p.id,
      setupFee: setupExVat,
      projectNote: note.trim() || undefined,
    };
    add(item);
    setAddedMsg(`${p.name} sepete eklendi`);
    setTimeout(() => setAddedMsg(''), 4000);
  };

  const inCart = (p: Product) => items.some((i) => i.id === `website:${p.id}:${cycle}`);
  const hasWebsiteInCart = items.some((i) => i.type === 'website');

  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    document.getElementById('paketler')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <PageBackdrop>
      <ShopHeader showNav />

      {/* Bildirim */}
      {addedMsg && (
        <div className="fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-fade-up rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-200 backdrop-blur">
          {addedMsg} —{' '}
          <button onClick={() => navigate('/checkout')} className="underline hover:text-white">
            sepete git
          </button>
        </div>
      )}

      {/* ===================== HERO ===================== */}
      <section className="relative px-4 pt-16 pb-10 lg:pt-24">
        <div className="pointer-events-none absolute left-1/2 top-10 h-72 w-[70%] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-emerald-400" />
            Anahtar teslim — teknik hiçbir şey bilmenize gerek yok
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
            İşletmeniz için <span className="text-gradient text-gradient-anim">web sitesini biz yapalım</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
            Alan adı, hosting, tasarım ve e-posta — hepsini biz kuruyor, biz yayında tutuyoruz.
            Siz işinize bakın, sitenizi müşterileriniz bulsun.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a href="#paketler" className="btn-neon">
              PAKETLERİ VE FİYATLARI GÖR
            </a>
            <a
              href="mailto:destek@adigehost.tr?subject=Web%20sitesi%20teklifi"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/5"
            >
              Önce Konuşalım
            </a>
          </div>
        </div>
      </section>

      {/* ===================== NASIL ÇALIŞIR ===================== */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal className="mb-12 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Nasıl İşliyor?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Dört adım. Teknik kısmı tamamen bizde.
          </p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110}>
              <div className="glass relative h-full rounded-2xl p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-neon-violet text-lg font-bold text-white shadow-[0_0_24px_-6px_rgba(59,130,246,0.9)]">
                  {s.n}
                </span>
                <h3 className="mt-4 font-bold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== PAKETLER ===================== */}
      <section id="paketler" className="mx-auto max-w-6xl px-4 py-16">
        <Reveal className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Paketler ve Fiyatlar</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Kurulum bedeli tek seferliktir. Aylık abonelik sitenizi yayında tutar: hosting, SSL,
            yedekleme, güvenlik güncellemeleri ve içerik değişiklikleriniz dahil.
          </p>
        </Reveal>

        {/* Aylık / Yıllık anahtarı */}
        <div className="mb-10 flex justify-center">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(['monthly', 'annually'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                  cycle === c ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                {c === 'monthly' ? 'Aylık öde' : 'Yıllık öde — 2 ay bedava'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-16 text-center text-slate-500">Paketler yükleniyor…</p>
        ) : packages.length === 0 ? (
          <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
            <p className="text-slate-300">
              Web sitesi paketleri henüz tanımlanmamış.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Yönetici iseniz: <code className="text-brand-300">npm run seed --workspace backend</code>{' '}
              komutunu çalıştırın ya da admin panelinden <b>Ürünler</b> bölümünde
              tür olarak <b>Web Sitesi</b> seçip paket ekleyin.
            </p>
            <a
              href="mailto:destek@adigehost.tr?subject=Web%20sitesi%20teklifi"
              className="btn-neon mt-6 inline-flex"
            >
              Teklif İsteyin
            </a>
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              packages.length === 1
                ? 'mx-auto max-w-sm'
                : packages.length === 2
                  ? 'sm:grid-cols-2'
                  : 'sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {packages.map((p, i) => (
              <Reveal key={p.id} delay={i * 100}>
                <PackageCard
                  p={p}
                  isPopular={i === 1 && packages.length >= 3}
                  cycle={cycle}
                  inCart={inCart(p)}
                  onAdd={() => addPackage(p)}
                />
              </Reveal>
            ))}
          </div>
        )}

        {/* Proje notu — sepete eklenmeden önce doldurulursa siparişe iliştirilir */}
        {packages.length > 0 && (
          <Reveal>
            <form onSubmit={submitNote} className="glass mx-auto mt-12 max-w-2xl rounded-2xl p-6">
              <label className="mb-2 block text-sm font-semibold text-white">
                Projenizden kısaca bahsedin{' '}
                <span className="font-normal text-slate-500">(isteğe bağlı)</span>
              </label>
              <p className="mb-3 text-xs text-slate-400">
                Ne iş yapıyorsunuz, sitede neler olsun, beğendiğiniz örnek site var mı? Bu notu
                siparişinize ekleriz; ekibimiz size dönerken elinde bilgi olur.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Örn: Ankara'da kuruyemiş toptancılığı yapıyorum. Ürünlerimi gösteren, telefonla sipariş alabilecekleri bir site istiyorum."
                className="w-full rounded-xl border border-white/10 bg-night-900/70 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/30"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{note.length}/2000</span>
                {hasWebsiteInCart && note.trim() && (
                  <span className="text-amber-300">
                    Not: sepetteki paketi kaldırıp yeniden ekleyin ki bu not siparişe işlensin.
                  </span>
                )}
              </div>
            </form>
          </Reveal>
        )}
      </section>

      {/* ===================== NE DAHİL DEĞİL (dürüstlük bölümü) ===================== */}
      <section className="mx-auto max-w-4xl px-4 py-12">
        <Reveal>
          <div className="glass rounded-2xl p-7">
            <h2 className="text-xl font-bold text-white">Şeffaf olalım — bunlar dahil değil</h2>
            <p className="mt-2 text-sm text-slate-400">
              Sürpriz faturayla karşılaşmamanız için baştan yazıyoruz:
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              {[
                'Alan adı (domain) yıllık ücreti — kayıt kuruluşuna ödenir, uzantıya göre değişir.',
                'Profesyonel fotoğraf çekimi ve logo tasarımı — isterseniz ayrı teklif veririz.',
                'Metin yazarlığı (copywriting) — içerikleri siz gönderirseniz dahildir.',
                'Reklam bütçesi (Google/Meta) — reklam yönetimi ayrı hizmettir.',
                'Paket kapsamını aşan yeni sayfa veya yeniden tasarım — öncesinde onayınızı alırız.',
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ===================== SSS ===================== */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <Reveal className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Sık Sorulan Sorular</h2>
        </Reveal>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <div className="glass overflow-hidden rounded-xl">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={openFaq === i}
                >
                  <span className="font-semibold text-white">{f.q}</span>
                  <span
                    className={`shrink-0 text-brand-300 transition-transform ${openFaq === i ? 'rotate-45' : ''}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                {openFaq === i && (
                  <p className="border-t border-white/10 px-5 py-4 text-sm leading-relaxed text-slate-300">
                    {f.a}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== KAPANIŞ CTA ===================== */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <Reveal>
          <div className="glass relative overflow-hidden rounded-3xl px-6 py-14 text-center">
            <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[80%] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[100px]" />
            <h2 className="relative text-3xl font-extrabold text-white sm:text-4xl">
              Hangi paket size uygun, emin değil misiniz?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-slate-400">
              Bize ne iş yaptığınızı anlatın; size uygun olanı söyleyelim. Satış baskısı yok,
              gereğinden büyük paket satmıyoruz.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <a href="mailto:destek@adigehost.tr?subject=Web%20sitesi%20danışma" className="btn-neon">
                E-posta ile Sorun
              </a>
              <a
                href="/sss"
                className="rounded-xl border border-white/15 px-7 py-3.5 font-semibold text-slate-200 transition hover:bg-white/5"
              >
                Tüm SSS
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <ShopFooter />
    </PageBackdrop>
  );
}
