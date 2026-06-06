import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';

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
  const { user } = useAuthStore();
  const { add, items } = useCartStore();

  const [opts, setOpts] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [arch, setArch] = useState<'x86' | 'arm'>('x86');
  const [cpuType, setCpuType] = useState<'shared' | 'dedicated'>('shared');
  const [stIdx, setStIdx] = useState(0);
  const [location, setLocation] = useState('nbg1');
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

  // Filtrelenmiş server type'lar
  const filteredTypes = useMemo(() => {
    if (!opts) return [];
    return opts.serverTypes
      .filter((st) => st.architecture === arch && st.cpuType === cpuType)
      .sort((a, b) => a.cores - b.cores || a.memory - b.memory);
  }, [opts, arch, cpuType]);

  // Geçerli server type
  const currentType = filteredTypes[stIdx];

  // Lokasyon değişince stIdx hala geçerli mi kontrol
  useEffect(() => {
    if (stIdx >= filteredTypes.length) setStIdx(0);
  }, [filteredTypes, stIdx]);

  // Server type değişince: seçili lokasyon bu type'da yoksa otomatik desteklenen ilkine geç
  useEffect(() => {
    if (!currentType) return;
    if (!currentType.pricesByLocation[location]) {
      const firstAvailable = Object.keys(currentType.pricesByLocation)[0];
      if (firstAvailable) setLocation(firstAvailable);
    }
  }, [currentType, location]);

  // Filtrelenmiş images (architecture eşleşmeli)
  const filteredImages = useMemo(() => {
    if (!opts) return [];
    return opts.images.filter((i) => i.architecture === arch || !i.architecture);
  }, [opts, arch]);

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

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400">Yükleniyor…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <Link to="/" className="text-2xl font-bold text-brand-700">AdigeHost</Link>
          <div className="flex items-center gap-3">
            {user ? (
              <a href="/app" className="text-sm text-brand-600 hover:underline">Panelim</a>
            ) : (
              <>
                <a href="/login" className="text-sm text-slate-600 hover:text-brand-600">Giriş</a>
                <a href="/register" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Kayıt</a>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">
            Kendi VPS'inizi Yapılandırın
          </h1>
          <p className="text-slate-500">
            Hetzner Cloud altyapısı — ihtiyacınıza göre seçin, dakikalar içinde teslim.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 mb-4 max-w-3xl mx-auto">
            {error}
          </div>
        )}
        {added && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 mb-4 max-w-3xl mx-auto">
            Sepete eklendi
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sol — Yapılandırma */}
          <div className="lg:col-span-2 space-y-6">
            {/* CPU Türü */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                CPU Mimarisi
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setArch('x86')}
                  className={`rounded-xl py-3 px-4 border-2 font-semibold ${
                    arch === 'x86'
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Intel / AMD
                </button>
                <button
                  onClick={() => setArch('arm')}
                  className={`rounded-xl py-3 px-4 border-2 font-semibold ${
                    arch === 'arm'
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  ARM (Ampere)
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCpuType('shared')}
                  className={`rounded-xl py-2.5 px-4 border-2 text-sm font-semibold ${
                    cpuType === 'shared'
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Paylaşımlı CPU
                </button>
                <button
                  onClick={() => setCpuType('dedicated')}
                  className={`rounded-xl py-2.5 px-4 border-2 text-sm font-semibold ${
                    cpuType === 'dedicated'
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Dedicated CPU
                </button>
              </div>
            </div>

            {/* Server Type Slider */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Sunucu Büyüklüğü
                </div>
                {currentType && (
                  <span className="rounded-full bg-brand-100 text-brand-700 px-3 py-0.5 text-xs font-bold">
                    {currentType.name.toUpperCase()}
                  </span>
                )}
              </div>

              {filteredTypes.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">
                  Bu mimaride sunucu yok
                </p>
              ) : (
                <>
                  <input
                    type="range"
                    min={0}
                    max={filteredTypes.length - 1}
                    value={stIdx}
                    onChange={(e) => setStIdx(Number(e.target.value))}
                    className="w-full accent-brand-600"
                  />

                  {currentType && (
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <div className="text-xs text-slate-500">CPU</div>
                        <div className="font-bold text-slate-900 text-lg">{currentType.cores}</div>
                        <div className="text-[10px] text-slate-400">çekirdek</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <div className="text-xs text-slate-500">RAM</div>
                        <div className="font-bold text-slate-900 text-lg">{currentType.memory}</div>
                        <div className="text-[10px] text-slate-400">GB</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <div className="text-xs text-slate-500">Disk (SSD)</div>
                        <div className="font-bold text-slate-900 text-lg">{currentType.disk}</div>
                        <div className="text-[10px] text-slate-400">GB</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Lokasyon */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Sunucu Lokasyonu
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {opts?.locations.map((l) => {
                  const available = !!currentType?.pricesByLocation[l.name];
                  const isSelected = location === l.name;
                  return (
                    <button
                      key={l.name}
                      onClick={() => available && setLocation(l.name)}
                      disabled={!available}
                      title={!available ? `${currentType?.name?.toUpperCase()} bu lokasyonda mevcut değil` : ''}
                      className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-left ${
                        !available
                          ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed line-through'
                          : isSelected
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold">{locLabel(l.name, l.city, l.country)}</div>
                      <div className="text-[10px] text-slate-400">{l.name.toUpperCase()}</div>
                    </button>
                  );
                })}
              </div>
              {currentType && (
                <p className="text-xs text-slate-400 mt-2">
                  {currentType.name.toUpperCase()} mevcut: {Object.keys(currentType.pricesByLocation).length} lokasyon
                </p>
              )}
            </div>

            {/* İşletim Sistemi */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                İşletim Sistemi
              </div>
              <select
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-brand-500"
              >
                {filteredImages.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.description}
                  </option>
                ))}
              </select>
            </div>

            {/* IPv4 */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withIpv4}
                  onChange={(e) => setWithIpv4(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-brand-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800">Birincil IPv4 Adresi</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Sadece IPv6 ile devam ederseniz {opts?.ipv4.monthlyIncVat ? fmtTL(opts.ipv4.monthlyIncVat) : ''} ₺/ay tasarruf edersiniz.
                    Birçok hizmet hala IPv4 gerektirir.
                  </div>
                </div>
                {withIpv4 && opts && (
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-700">+ {fmtTL(opts.ipv4.monthlyIncVat)} ₺</div>
                    <div className="text-[10px] text-slate-400">aylık</div>
                  </div>
                )}
              </label>
            </div>

            {/* Hostname */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Sunucu Adı (Hostname)
                </div>
                <input
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="orn: webserver1"
                  className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-mono outline-none focus:border-brand-500"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Yalnızca küçük harf, rakam ve tire (-)
                </div>
              </label>
            </div>
          </div>

          {/* Sağ — Özet */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border-2 border-brand-200 p-6 shadow-sm sticky top-20">
              <div className="text-xs uppercase font-semibold tracking-wider text-slate-400 mb-1">
                Tahmini Ücret
              </div>
              {currentType && (
                <div className="mb-4">
                  <div className="font-bold text-slate-900 text-lg">
                    {currentType.name.toUpperCase()}
                  </div>
                  <div className="text-xs text-slate-500">
                    {currentType.cores} CPU · {currentType.memory} GB RAM · {currentType.disk} GB SSD
                  </div>
                </div>
              )}

              <div className="space-y-2 text-sm border-y border-slate-100 py-3">
                <div className="flex justify-between text-slate-600">
                  <span>Sunucu</span>
                  <span className="font-medium">{fmtTL(serverPrice)} ₺</span>
                </div>
                {withIpv4 && (
                  <div className="flex justify-between text-slate-600">
                    <span>IPv4</span>
                    <span className="font-medium">{fmtTL(ipv4Price)} ₺</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 text-xs">
                  <span>20 TB trafik</span>
                  <span>Dahil</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-slate-600">Aylık</span>
                  <div className="text-right">
                    <div className="text-3xl font-extrabold text-brand-700">
                      {fmtTL(totalMonthly)}
                      <span className="text-base font-normal text-slate-500"> ₺</span>
                    </div>
                    <div className="text-[10px] text-slate-400">KDV dahil</div>
                  </div>
                </div>
              </div>

              <button
                onClick={addToCart}
                disabled={!currentType || isInCart}
                className="mt-5 w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-default"
              >
                {isInCart ? 'Sepette' : 'Sepete Ekle'}
              </button>

              {isInCart && (
                <button
                  onClick={() => navigate('/checkout')}
                  className="mt-2 w-full rounded-xl border-2 border-brand-300 py-3 text-sm font-bold text-brand-700 hover:bg-brand-50"
                >
                  Sepete Git
                </button>
              )}

              <div className="mt-4 text-[10px] text-slate-400 text-center">
                Hetzner Cloud altyapısı. Anlık kur: 1 EUR = {opts ? fmtTL(opts.eurTry ?? 0) : '—'} ₺
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
