import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore } from '../../store/cartStore';

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

export default function OrderVPS() {
  const navigate = useNavigate();
  const { add, items } = useCartStore();

  const [opts, setOpts] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Seçimler
  const [location, setLocation] = useState('fsn1');
  const [architecture, setArchitecture] = useState<'x86' | 'arm'>('x86');
  const [cpuType, setCpuType] = useState<'shared' | 'dedicated'>('shared');
  const [serverName, setServerName] = useState('');
  const [image, setImage] = useState('ubuntu-24.04');
  const [withIpv4, setWithIpv4] = useState(true);
  const [backups, setBackups] = useState(false);
  const [sshKey, setSshKey] = useState('');
  const [userData, setUserData] = useState('');
  const [hostname, setHostname] = useState('');

  const [added, setAdded] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Array<{ id: string; name: string; publicKey: string }>>([]);

  useEffect(() => {
    api
      .get('/ssh-keys')
      .then((r) => setSavedKeys(r.data.data ?? []))
      .catch(() => {});
    api
      .get('/public/vps/options')
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

  // Seçili lokasyonda hangi mimari/cpu tipleri var? (filtre butonlarını akıllı göster)
  const availAtLocation = useMemo(() => {
    if (!opts) return [];
    return opts.serverTypes.filter((s) => s.pricesByLocation[location]);
  }, [opts, location]);

  const availArchitectures = useMemo(
    () => Array.from(new Set(availAtLocation.map((s) => s.architecture))),
    [availAtLocation],
  );
  const availCpuTypes = useMemo(
    () => Array.from(new Set(availAtLocation.filter((s) => s.architecture === architecture).map((s) => s.cpuType))),
    [availAtLocation, architecture],
  );

  // Filtrelenmiş sunucu tipleri: lokasyon + mimari + cpu tipi, CPU/RAM ASC sıralı
  const serverTypes = useMemo(() => {
    return availAtLocation
      .filter((s) => s.architecture === architecture && s.cpuType === cpuType)
      .sort((a, b) => a.cores - b.cores || a.memory - b.memory || a.disk - b.disk);
  }, [availAtLocation, architecture, cpuType]);

  const selected = useMemo(
    () => serverTypes.find((s) => s.name === serverName) ?? null,
    [serverTypes, serverName],
  );

  // Filtre değişince: seçili mimari/cpu tipi mevcut değilse ilk uygun olana geç
  useEffect(() => {
    if (availArchitectures.length && !availArchitectures.includes(architecture)) {
      setArchitecture(availArchitectures[0] as 'x86' | 'arm');
    }
  }, [availArchitectures, architecture]);

  useEffect(() => {
    if (availCpuTypes.length && !availCpuTypes.includes(cpuType)) {
      setCpuType(availCpuTypes[0] as 'shared' | 'dedicated');
    }
  }, [availCpuTypes, cpuType]);

  // Filtre değişince: seçili sunucu listede yoksa ilkini seç
  useEffect(() => {
    if (serverTypes.length && !serverTypes.some((s) => s.name === serverName)) {
      setServerName(serverTypes[0].name);
    }
  }, [serverTypes, serverName]);

  // OS listesi: seçili mimariye uygun
  const filteredImages = useMemo(() => {
    if (!opts) return [];
    return opts.images.filter((i) => i.architecture === architecture || !i.architecture);
  }, [opts, architecture]);

  // Seçili OS mimariyle uyumsuzsa ilk uygun olana geç
  useEffect(() => {
    if (filteredImages.length && !filteredImages.some((i) => i.name === image)) {
      setImage(filteredImages[0].name);
    }
  }, [filteredImages, image]);

  // Fiyat
  const serverPrice = selected?.pricesByLocation[location]?.monthlyIncVat ?? 0;
  const ipv4Price = withIpv4 ? opts?.ipv4.monthlyIncVat ?? 0 : 0;
  const backupPrice = backups ? Math.round(serverPrice * 0.2 * 100) / 100 : 0; // +%20
  const totalMonthly = serverPrice + ipv4Price + backupPrice;

  const locationLabel = useMemo(() => {
    const loc = opts?.locations.find((l) => l.name === location);
    return loc ? locLabel(loc.name, loc.city, loc.country) : location;
  }, [opts, location]);

  const vatMult = 1 + (opts?.vatRate ?? 20) / 100;
  const canAdd = !!selected && /^[a-z0-9-]+$/.test(hostname.trim());

  const cartId = selected
    ? `vps:${selected.name}:${location}:${image}:${withIpv4 ? 'v4' : 'v6'}:${backups ? 'bak' : 'nobak'}`
    : '';
  const isInCart = items.some((i) => i.id === cartId);

  // Sepete ekle (public mağaza akışıyla aynı — /checkout'ta kart/havale ile ödenir)
  const addToCart = () => {
    if (!selected) return;
    if (!/^[a-z0-9-]+$/.test(hostname.trim())) {
      setError('Hostname yalnızca harf, rakam ve tire içerebilir');
      return;
    }
    setError('');
    add({
      id: cartId,
      type: 'vps',
      name: `VPS ${selected.name.toUpperCase()} — ${hostname.trim().toLowerCase()}`,
      price: totalMonthly, // KDV dahil TL (backend checkout'ta yeniden doğrular)
      priceExVat: Math.round((totalMonthly / vatMult) * 100) / 100,
      vatRate: opts?.vatRate ?? 20,
      billingCycle: 'monthly',
      domain: hostname.trim().toLowerCase(),
      meta: {
        kind: 'vps',
        serverType: selected.name,
        location,
        image,
        withIpv4,
        backups,
        sshKey: sshKey.trim() || undefined,
        userData: userData.trim() || undefined,
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="animate-pulse text-slate-400">Yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">VPS Yapılandır</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hetzner Cloud altyapısı — lokasyon, işlemci ve kaynakları seçin, dakikalar içinde teslim.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {added && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">Sepete eklendi.</div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Sol — Yapılandırma */}
        <div className="space-y-5 lg:col-span-2">
          {/* Lokasyon */}
          <Card title="Lokasyon">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {opts?.locations.map((l) => (
                <button
                  key={l.name}
                  onClick={() => setLocation(l.name)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm transition ${
                    location === l.name
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-slate-200 hover:border-brand-300'
                  }`}
                >
                  <div className="font-medium text-slate-800">
                    {locLabel(l.name, l.city, l.country)}
                  </div>
                  <div className="text-[11px] text-slate-400">{l.description || l.country}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* İşlemci mimarisi + CPU tipi */}
          <Card title="İşlemci">
            <div className="mb-3">
              <div className="mb-1.5 text-xs font-medium text-slate-500">Mimari</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'x86', label: 'Intel / AMD (x86)' },
                  { key: 'arm', label: 'ARM (Ampere)' },
                ]
                  .filter((a) => availArchitectures.includes(a.key))
                  .map((a) => (
                    <Chip
                      key={a.key}
                      active={architecture === a.key}
                      onClick={() => setArchitecture(a.key as 'x86' | 'arm')}
                    >
                      {a.label}
                    </Chip>
                  ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">CPU Tipi</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'shared', label: 'Paylaşımlı' },
                  { key: 'dedicated', label: 'Dedicated (Özel)' },
                ]
                  .filter((c) => availCpuTypes.includes(c.key))
                  .map((c) => (
                    <Chip
                      key={c.key}
                      active={cpuType === c.key}
                      onClick={() => setCpuType(c.key as 'shared' | 'dedicated')}
                    >
                      {c.label}
                    </Chip>
                  ))}
              </div>
            </div>
          </Card>

          {/* Sunucu paketi */}
          <Card title="Sunucu Paketi">
            {serverTypes.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Bu lokasyon/filtre için sunucu yok. Farklı bir seçim deneyin.
              </p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {serverTypes.map((s) => {
                  const price = s.pricesByLocation[location]?.monthlyIncVat ?? 0;
                  return (
                    <button
                      key={s.name}
                      onClick={() => setServerName(s.name)}
                      className={`rounded-xl border-2 p-3.5 text-left transition ${
                        serverName === s.name
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-slate-200 hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{s.name.toUpperCase()}</span>
                        <span className="text-sm font-semibold text-brand-700">
                          {fmtTL(price)} ₺
                          <span className="text-[11px] font-normal text-slate-400">/ay</span>
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {s.cores} CPU · {s.memory} GB RAM · {s.disk} GB SSD
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* İşletim Sistemi */}
          <Card title="İşletim Sistemi">
            <select
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {filteredImages.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.description}
                </option>
              ))}
            </select>
          </Card>

          {/* IPv4 */}
          <Card title="Ağ">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={withIpv4}
                onChange={(e) => setWithIpv4(e.target.checked)}
                className="mt-1 h-4 w-4 accent-brand-600"
              />
              <div className="flex-1">
                <div className="font-medium text-slate-800">Birincil IPv4 Adresi</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Sadece IPv6 ile devam ederseniz{' '}
                  {opts?.ipv4.monthlyIncVat ? fmtTL(opts.ipv4.monthlyIncVat) : ''} ₺/ay tasarruf
                  edersiniz. Birçok hizmet hâlâ IPv4 gerektirir.
                </div>
              </div>
              {withIpv4 && opts && (
                <div className="text-right text-sm font-semibold text-slate-700">
                  + {fmtTL(opts.ipv4.monthlyIncVat)} ₺
                </div>
              )}
            </label>
          </Card>

          {/* Otomatik Yedekleme */}
          <Card title="Otomatik Yedekleme">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={backups}
                onChange={(e) => setBackups(e.target.checked)}
                className="mt-1 h-4 w-4 accent-brand-600"
              />
              <div className="flex-1">
                <div className="font-medium text-slate-800">Günlük otomatik yedek (+%20)</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Hetzner son 7 günün otomatik yedeğini tutar. Sunucu ücretinin %20'si eklenir.
                </div>
              </div>
              {backups && (
                <div className="text-right text-sm font-semibold text-slate-700">
                  + {fmtTL(backupPrice)} ₺
                </div>
              )}
            </label>
          </Card>

          {/* SSH Anahtarı */}
          <Card title="SSH Anahtarı (Opsiyonel)">
            {savedKeys.length > 0 && (
              <select
                onChange={(e) => {
                  const k = savedKeys.find((x) => x.id === e.target.value);
                  if (k) setSshKey(k.publicKey);
                }}
                defaultValue=""
                className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="">Kayıtlı anahtarlardan seç…</option>
                {savedKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            )}
            <textarea
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              rows={3}
              placeholder="ssh-ed25519 AAAA... veya ssh-rsa AAAA..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Kayıtlı anahtar seçin veya public anahtarınızı yapıştırın; girilirse root parola yerine
              anahtarla giriş yapılır.{' '}
              <a href="/app/ssh-keys" className="text-brand-600 hover:underline">
                Anahtarları yönet
              </a>
            </div>
          </Card>

          {/* cloud-init */}
          <Card title="Başlangıç Betiği — cloud-init (Opsiyonel)">
            <textarea
              value={userData}
              onChange={(e) => setUserData(e.target.value)}
              rows={4}
              placeholder={'#cloud-config\npackages:\n  - nginx'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Sunucu ilk açılışta bu cloud-init betiğini çalıştırır (paket kurulumu, kullanıcı, vb.).
            </div>
          </Card>

          {/* Hostname */}
          <Card title="Sunucu Adı (Hostname)">
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="orn: webserver1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Yalnızca küçük harf, rakam ve tire (-)
            </div>
          </Card>
        </div>

        {/* Sağ — Özet */}
        <div>
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Tahmini Ücret
            </div>
            {selected && (
              <div className="mt-2">
                <div className="text-lg font-bold text-slate-900">{selected.name.toUpperCase()}</div>
                <div className="text-xs text-slate-500">
                  {selected.cores} CPU · {selected.memory} GB RAM · {selected.disk} GB SSD
                </div>
                <div className="mt-0.5 text-xs text-slate-400">Lokasyon: {locationLabel}</div>
              </div>
            )}

            <div className="mt-4 space-y-2 border-y border-slate-100 py-3 text-sm">
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
              {backups && (
                <div className="flex justify-between text-slate-600">
                  <span>Yedekleme</span>
                  <span className="font-medium">{fmtTL(backupPrice)} ₺</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-400">
                <span>20 TB trafik</span>
                <span>Dahil</span>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-sm text-slate-500">Aylık</span>
              <div className="text-right">
                <div className="text-2xl font-extrabold text-slate-900">
                  {fmtTL(totalMonthly)}
                  <span className="text-sm font-normal text-slate-400"> ₺</span>
                </div>
                <div className="text-[10px] text-slate-400">KDV dahil</div>
              </div>
            </div>

            <button
              onClick={addToCart}
              disabled={!canAdd || isInCart}
              className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isInCart ? 'Sepette ✓' : 'Sepete Ekle'}
            </button>
            {isInCart && (
              <button
                onClick={() => navigate('/checkout')}
                className="mt-2 w-full rounded-lg border border-brand-300 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                Sepete Git → Öde
              </button>
            )}

            <div className="mt-3 text-center text-[10px] text-slate-400">
              Ödeme adımında kredi kartı (iyzico) veya havale/EFT seçebilirsiniz.
            </div>
            <div className="mt-1 text-center text-[10px] text-slate-400">
              Hetzner Cloud altyapısı. Anlık kur: 1 EUR = {opts ? fmtTL(opts.eurTry ?? 0) : '—'} ₺
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 text-slate-700 hover:border-brand-300'
      }`}
    >
      {children}
    </button>
  );
}
