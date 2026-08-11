import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore } from '../../store/cartStore';
import PageBackdrop from '../../components/shop/PageBackdrop';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';

interface ServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number; // GB
  disk: number; // GB
  cpuType: string; // 'shared' | 'dedicated'
  architecture: string; // 'x86' | 'arm'
  pricesByLocation: Record<string, { monthlyExVat: number; monthlyIncVat: number; eurOriginal: number }>;
}

interface Location {
  name: string;
  city: string;
  country: string;
  description: string;
}

interface Image {
  name: string;
  description: string;
  osFlavor: string;
  osVersion: string;
  architecture: string;
}

interface Options {
  serverTypes: ServerType[];
  locations: Location[];
  images: Image[];
  ipv4: { monthlyIncVat: number; eurOriginal: number };
  vatRate: number;
  eurTry: number;
  usdTry: number;
  markup: number;
}

const FLAG: Record<string, string> = {
  fsn1: '🇩🇪 Frankfurt',
  nbg1: '🇩🇪 Nürnberg',
  hel1: '🇫🇮 Helsinki',
  ash: '🇺🇸 Ashburn',
  hil: '🇺🇸 Hillsboro',
  sin: '🇸🇬 Singapur',
};

function locLabel(name: string, city: string, country: string) {
  return FLAG[name] || `${city}, ${country}`;
}

function fmtTL(n: number) {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VPSConfigurator() {
  const navigate = useNavigate();
  const { add, items } = useCartStore();

  const [opts, setOpts] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [stIdx, setStIdx] = useState(0);
  const [location, setLocation] = useState('fsn1');
  const [image, setImage] = useState('ubuntu-24.04');
  const [withIpv4, setWithIpv4] = useState(true);
  const [hostname, setHostname] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api.get('/public/vps/options')
      .then((r) => {
        setOpts(r.data.data);
        const ubu = r.data.data.images.find((i: Image) => i.name === 'ubuntu-24.04');
        if (!ubu) {
          const fallback = r.data.data.images.find((i: Image) => i.osFlavor === 'ubuntu');
          if (fallback) setImage(fallback.name);
        }
      })
      .catch((e) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // Seçili lokasyonda stokta olan tipler — CPU ASC, RAM ASC, disk ASC
  // Böylece slider en küçükten en büyüğe doğru ilerler
  const filteredTypes = useMemo(() => {
    if (!opts) return [];
    return opts.serverTypes
      .filter((s) => s.pricesByLocation[location])
      .sort((a, b) => {
        // CPU çekirdek sayısına göre
        if (a.cores !== b.cores) return a.cores - b.cores;
        // Sonra RAM
        if (a.memory !== b.memory) return a.memory - b.memory;
        // Sonra disk
        return a.disk - b.disk;
      });
  }, [opts, location]);

  // Backend'den gelen lokasyonlar boşsa (ör. hepsi stok dışı) mevcut seçimi koru
  useEffect(() => {
    if (!opts?.locations.length) return;
    if (!opts.locations.some((l) => l.name === location)) setLocation(opts.locations[0].name);
  }, [opts, location]);

  // Lokasyon değişince slider indeksini listeye sığdır
  useEffect(() => {
    if (filteredTypes.length && stIdx > filteredTypes.length - 1) setStIdx(filteredTypes.length - 1);
  }, [filteredTypes, stIdx]);

  // Geçerli server type
  const currentType = filteredTypes[Math.min(stIdx, Math.max(filteredTypes.length - 1, 0))];

  // Filtrelenmiş images: mevcut server type'ın mimarisine uygun
  const filteredImages = useMemo(() => {
    if (!opts || !currentType) return opts?.images ?? [];
    return opts.images.filter((i) => i.architecture === currentType.architecture || !i.architecture);
  }, [opts, currentType]);

  // Lokasyon etiketi (sade gösterim için)
  const locationLabel = useMemo(() => {
    const loc = opts?.locations.find((l) => l.name === location);
    return loc ? locLabel(loc.name, loc.city, loc.country) : location;
  }, [opts, location]);

  // Fiyat hesabı
  const serverPrice = currentType?.pricesByLocation[location]?.monthlyIncVat ?? 0;
  const ipv4Price = withIpv4 ? (opts?.ipv4.monthlyIncVat ?? 0) : 0;
  const totalMonthly = serverPrice + ipv4Price;

  const cartId = currentType ? `vps:${currentType.name}:${location}:${image}:${withIpv4 ? 'v4' : 'v6'}` : '';
  const isInCart = items.some((i) => i.id === cartId);

  const addToCart = () => {
    if (!currentType) return;
    if (!hostname.trim()) {
      setError('Lütfen sunucu için bir hostname girin');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(hostname.trim())) {
      setError('Hostname yalnızca harf, rakam ve tire içerebilir');
      return;
    }
    setError('');

    add({
      id: cartId,
      type: 'vps',
      name: `VPS ${currentType.name.toUpperCase()} — ${hostname}`,
      price: Math.round(totalMonthly * 1.2 * 100) / 100, // KDV dahil olarak markup yapılmış
      priceExVat: totalMonthly / 1.2, // backend yeniden hesaplayacak
      vatRate: opts?.vatRate ?? 20,
      billingCycle: 'monthly',
      domain: hostname.trim().toLowerCase(),
      meta: {
        kind: 'vps',
        serverType: currentType.name,
        location,
        image,
        withIpv4,
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };

  if (loading)
    return (
      <PageBackdrop>
        <div className="flex min-h-screen items-center justify-center">
          <p className="animate-pulse text-slate-400">Yükleniyor…</p>
        </div>
      </PageBackdrop>
    );

  return (
    <PageBackdrop>
      <ShopHeader />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-extrabold text-white sm:text-4xl">
            Kendi VPS'inizi Yapılandırın
          </h1>
          <p className="text-slate-400">
            Hetzner Cloud altyapısı — ihtiyacınıza göre seçin, dakikalar içinde teslim.
          </p>
        </div>

        {error && (
          <div className="mx-auto mb-4 max-w-3xl rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {added && (
          <div className="mx-auto mb-4 max-w-3xl rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            Sepete eklendi
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sol — Yapılandırma */}
          <div className="space-y-6 lg:col-span-2">
            {/* Server Type Slider */}
            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sunucu Büyüklüğü
                </div>
                {currentType && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-brand-500/20 px-3 py-0.5 text-xs font-bold text-brand-200 ring-1 ring-brand-400/30">
                      {currentType.name.toUpperCase()}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                        currentType.cpuType === 'dedicated'
                          ? 'bg-violet-500/15 text-violet-200 ring-violet-400/30'
                          : 'bg-white/5 text-slate-300 ring-white/10'
                      }`}
                    >
                      {currentType.cpuType === 'dedicated' ? 'Dedicated' : 'Paylaşımlı'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                        currentType.architecture === 'arm'
                          ? 'bg-amber-500/15 text-amber-200 ring-amber-400/30'
                          : 'bg-brand-500/15 text-brand-200 ring-brand-400/30'
                      }`}
                    >
                      {currentType.architecture === 'arm' ? 'ARM (Ampere)' : 'Intel / AMD'}
                    </span>
                  </div>
                )}
              </div>

              {filteredTypes.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Bu mimaride sunucu yok</p>
              ) : (
                <>
                  <input
                    type="range"
                    min={0}
                    max={filteredTypes.length - 1}
                    value={stIdx}
                    onChange={(e) => setStIdx(Number(e.target.value))}
                    className="w-full accent-brand-500"
                  />

                  {currentType && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {[
                        { label: 'CPU', value: currentType.cores, unit: 'çekirdek' },
                        { label: 'RAM', value: currentType.memory, unit: 'GB' },
                        { label: 'Disk (SSD)', value: currentType.disk, unit: 'GB' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                          <div className="text-xs text-slate-400">{s.label}</div>
                          <div className="text-lg font-bold text-white">{s.value}</div>
                          <div className="text-[10px] text-slate-500">{s.unit}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Lokasyon */}
            <div className="glass rounded-2xl p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Lokasyon
              </div>
              <div className="flex flex-wrap gap-2">
                {(opts?.locations ?? []).map((l) => (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() => setLocation(l.name)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition ${
                      location === l.name
                        ? 'bg-brand-500/20 text-brand-100 ring-brand-400/40'
                        : 'bg-white/[0.03] text-slate-300 ring-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    {locLabel(l.name, l.city, l.country)}
                  </button>
                ))}
              </div>
            </div>

            {/* İşletim Sistemi */}
            <div className="glass rounded-2xl p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                İşletim Sistemi
              </div>
              <select
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="field text-base font-medium"
              >
                {filteredImages.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.description}
                  </option>
                ))}
              </select>
            </div>

            {/* IPv4 */}
            <div className="glass rounded-2xl p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={withIpv4}
                  onChange={(e) => setWithIpv4(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-brand-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-white">Birincil IPv4 Adresi</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Sadece IPv6 ile devam ederseniz{' '}
                    {opts?.ipv4.monthlyIncVat ? fmtTL(opts.ipv4.monthlyIncVat) : ''} ₺/ay tasarruf
                    edersiniz. Birçok hizmet hala IPv4 gerektirir.
                  </div>
                </div>
                {withIpv4 && opts && (
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-200">+ {fmtTL(opts.ipv4.monthlyIncVat)} ₺</div>
                    <div className="text-[10px] text-slate-500">aylık</div>
                  </div>
                )}
              </label>
            </div>

            {/* Hostname */}
            <div className="glass rounded-2xl p-5">
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sunucu Adı (Hostname)
                </div>
                <input
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="orn: webserver1"
                  className="field font-mono text-base"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Yalnızca küçük harf, rakam ve tire (-)
                </div>
              </label>
            </div>
          </div>

          {/* Sağ — Özet (mobilde üstte) */}
          <div className="order-first space-y-4 lg:order-last">
            <div className="glass glow-ring rounded-2xl p-6 lg:sticky lg:top-24">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tahmini Ücret
              </div>
              {currentType && (
                <div className="mb-4">
                  <div className="text-lg font-bold text-white">{currentType.name.toUpperCase()}</div>
                  <div className="text-xs text-slate-400">
                    {currentType.cores} CPU · {currentType.memory} GB RAM · {currentType.disk} GB SSD
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Lokasyon: {locationLabel}</div>
                </div>
              )}

              <div className="space-y-2 border-y border-white/10 py-3 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Sunucu</span>
                  <span className="font-medium">{fmtTL(serverPrice)} ₺</span>
                </div>
                {withIpv4 && (
                  <div className="flex justify-between text-slate-300">
                    <span>IPv4</span>
                    <span className="font-medium">{fmtTL(ipv4Price)} ₺</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-slate-500">
                  <span>20 TB trafik</span>
                  <span>Dahil</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-400">Aylık</span>
                  <div className="text-right">
                    <div className="text-3xl font-extrabold text-white">
                      {fmtTL(totalMonthly)}
                      <span className="text-base font-normal text-slate-400"> ₺</span>
                    </div>
                    <div className="text-[10px] text-slate-500">KDV dahil</div>
                  </div>
                </div>
              </div>

              <button
                onClick={addToCart}
                disabled={!currentType || isInCart}
                className="btn-neon mt-5 w-full disabled:cursor-default disabled:opacity-60"
              >
                {isInCart ? 'Sepette ✓' : 'Sepete Ekle'}
              </button>

              {isInCart && (
                <button
                  onClick={() => navigate('/checkout')}
                  className="mt-2 w-full rounded-xl border border-brand-400/40 py-3 text-sm font-bold text-brand-200 transition hover:bg-brand-500/10"
                >
                  Sepete Git
                </button>
              )}

              <div className="mt-4 text-center text-[10px] text-slate-500">
                Hetzner Cloud altyapısı. Anlık kur: 1 EUR = {opts ? fmtTL(opts.eurTry ?? 0) : '—'} ₺
              </div>
            </div>
          </div>
        </div>
      </div>

      <ShopFooter />
    </PageBackdrop>
  );
}
