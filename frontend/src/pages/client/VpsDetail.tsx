import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import VncConsole from '../../components/shared/VncConsole';

interface Service {
  id: string;
  type: string;
  name: string;
  status: string;
  hetznerIp: string | null;
  hetznerIpv6: string | null;
  hetznerPlan: string | null;
  hetznerLocation: string | null;
  hetznerOs: string | null;
  price: number;
  nextDue: string | null;
  config?: {
    cores?: number;
    memory?: number;
    disk?: number;
    withIpv4?: boolean;
    backups?: boolean;
    sshKeyUsed?: boolean;
    volumes?: Array<{ id: number; name: string; size: number; priceTRY: number }>;
  } | null;
}

interface Credentials {
  ipAddress: string | null;
  ipv6: string | null;
  username: string;
  password: string | null;
  sshKeyUsed: boolean;
}

interface HetznerServer {
  status: string;
}

interface ServerTypeOpt {
  name: string;
  cores: number;
  memory: number;
  disk: number;
  architecture: string;
  pricesByLocation: Record<string, { monthlyIncVat: number }>;
}
interface ImageOpt {
  name: string;
  description: string;
  architecture: string;
}
interface IsoOpt {
  id: number;
  name: string;
  description: string;
}
interface Snapshot {
  id: number;
  description: string;
  created: string;
  image_size?: number | null;
}
interface Volume {
  id: number;
  name: string;
  size: number;
  linux_device?: string;
}
interface FwRule {
  direction: 'in' | 'out';
  protocol: 'tcp' | 'udp' | 'icmp' | 'esp' | 'gre';
  port?: string;
  source_ips?: string[];
  description?: string;
}

const FLAG: Record<string, string> = {
  fsn1: '🇩🇪 Frankfurt',
  nbg1: '🇩🇪 Nürnberg',
  hel1: '🇫🇮 Helsinki',
  ash: '🇺🇸 Ashburn',
  hil: '🇺🇸 Hillsboro',
  sin: '🇸🇬 Singapur',
};

const STATUS_TR: Record<string, { label: string; cls: string }> = {
  running: { label: 'Çalışıyor', cls: 'bg-green-100 text-green-700' },
  off: { label: 'Kapalı', cls: 'bg-slate-200 text-slate-600' },
  starting: { label: 'Başlatılıyor', cls: 'bg-amber-100 text-amber-700' },
  stopping: { label: 'Durduruluyor', cls: 'bg-amber-100 text-amber-700' },
  initializing: { label: 'Hazırlanıyor', cls: 'bg-amber-100 text-amber-700' },
  rebuilding: { label: 'Yeniden Kuruluyor', cls: 'bg-amber-100 text-amber-700' },
};

function fmtTL(n: number) {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBw(bytesPerSec: number) {
  if (bytesPerSec > 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec > 1e3) return `${(bytesPerSec / 1e3).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* yut */
        }
      }}
      className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
    >
      {ok ? 'Kopyalandı' : 'Kopyala'}
    </button>
  );
}

function Sparkline({ data, color = '#0ea5e9', unit }: { data: number[]; color?: string; unit?: string }) {
  if (!data.length) return <p className="text-xs text-slate-400">Veri yok</p>;
  const w = 300;
  const h = 60;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ');
  const last = data[data.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <p className="mt-1 text-xs text-slate-500">
        Son: <span className="font-medium">{unit === 'bw' ? fmtBw(last) : `${last.toFixed(1)}%`}</span>
      </p>
    </div>
  );
}

type Tab = 'genel' | 'yonetim' | 'networking' | 'grafik' | 'snapshot' | 'volume' | 'firewall';

interface PrivateNet {
  id: number;
  name: string;
  ip: string;
  ipRange?: string;
}
interface FloatingIp {
  id: number;
  ip: string;
  type: string;
}
interface NetInfo {
  ipv4: string | null;
  ipv4Ptr: string | null;
  ipv6: string | null;
  privateNetworks: PrivateNet[];
}

export default function VpsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<Service | null>(null);
  const [tab, setTab] = useState<Tab>('genel');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [creds, setCreds] = useState<Credentials | null>(null);
  const [credLoading, setCredLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [server, setServer] = useState<HetznerServer | null>(null);
  const [vncOpen, setVncOpen] = useState(false);

  const [images, setImages] = useState<ImageOpt[]>([]);
  const [serverTypes, setServerTypes] = useState<ServerTypeOpt[]>([]);
  const [rebuildImage, setRebuildImage] = useState('');
  const [rebuildKeyId, setRebuildKeyId] = useState('');
  const [savedKeys, setSavedKeys] = useState<Array<{ id: string; name: string }>>([]);
  const [rescaleType, setRescaleType] = useState('');
  const [rescuePass, setRescuePass] = useState<string | null>(null);
  const [ptr, setPtr] = useState('');
  const [isos, setIsos] = useState<IsoOpt[]>([]);
  const [selectedIso, setSelectedIso] = useState('');

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapDesc, setSnapDesc] = useState('');
  const [backupsOn, setBackupsOn] = useState(false);

  const [metrics, setMetrics] = useState<{ cpu: number[]; netIn: number[]; netOut: number[] } | null>(null);

  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [newVolSize, setNewVolSize] = useState(10);
  const [volPerGb, setVolPerGb] = useState(0); // KDV dahil TL/GB/ay
  const [vatRate, setVatRate] = useState(20);

  const [fwRules, setFwRules] = useState<FwRule[]>([]);
  const [fwExists, setFwExists] = useState(false);

  const [netInfo, setNetInfo] = useState<NetInfo | null>(null);
  const [floatingIps, setFloatingIps] = useState<FloatingIp[]>([]);
  const [fipPrice, setFipPrice] = useState(0);

  const flash = (m: string, isErr = false) => {
    if (isErr) setError(m);
    else setMsg(m);
    setTimeout(() => {
      setMsg('');
      setError('');
    }, 5000);
  };

  const loadService = () =>
    api
      .get(`/services/${id}`)
      .then((r) => {
        setService(r.data.data);
        setBackupsOn(r.data.data?.config?.backups === true);
      })
      .catch((e) => setError(getApiErrorMessage(e)));

  const loadServer = () =>
    api
      .get(`/hetzner/${id}`)
      .then((r) => setServer(r.data.data))
      .catch(() => setServer(null));

  useEffect(() => {
    void loadService();
    void loadServer();
    api
      .get('/public/vps/options')
      .then((r) => {
        setImages(r.data.data?.images ?? []);
        setServerTypes(r.data.data?.serverTypes ?? []);
        setVolPerGb(r.data.data?.volume?.perGbIncVat ?? 0);
        setFipPrice(r.data.data?.floatingIp?.monthlyIncVat ?? 0);
        setVatRate(r.data.data?.vatRate ?? 20);
      })
      .catch(() => {});
    api.get('/ssh-keys').then((r) => setSavedKeys(r.data.data ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === 'snapshot') void loadSnapshots();
    if (tab === 'grafik') void loadMetrics();
    if (tab === 'volume') void loadVolumes();
    if (tab === 'firewall') void loadFirewall();
    if (tab === 'networking') void loadNetworking();
    if (tab === 'yonetim' && isos.length === 0)
      api.get('/hetzner/catalog/isos').then((r) => setIsos((r.data.data ?? []).filter((i: IsoOpt) => i.name))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadCreds = async () => {
    setCredLoading(true);
    setError('');
    try {
      const r = await api.get(`/services/${id}/vps-credentials`);
      setCreds(r.data.data);
      setShowPass(true);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    } finally {
      setCredLoading(false);
    }
  };

  const loadSnapshots = async () => {
    try {
      const r = await api.get(`/hetzner/${id}/snapshots`);
      setSnapshots(r.data.data ?? []);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  const loadMetrics = async () => {
    try {
      const [cpuR, netR] = await Promise.all([
        api.get(`/hetzner/${id}/metrics`, { params: { type: 'cpu' } }),
        api.get(`/hetzner/${id}/metrics`, { params: { type: 'network' } }),
      ]);
      const ts = (obj: unknown, key: string): number[] => {
        const series = (obj as { time_series?: Record<string, { values: [number, string][] }> })?.time_series;
        const vals = series?.[key]?.values ?? [];
        return vals.map((v) => Number(v[1]));
      };
      setMetrics({
        cpu: ts(cpuR.data.data, 'cpu'),
        netIn: ts(netR.data.data, 'network.0.bandwidth.in'),
        netOut: ts(netR.data.data, 'network.0.bandwidth.out'),
      });
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  const loadVolumes = async () => {
    try {
      const r = await api.get(`/hetzner/${id}/volumes`);
      setVolumes(r.data.data ?? []);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  const loadFirewall = async () => {
    try {
      const r = await api.get(`/hetzner/${id}/firewall`);
      const fw = r.data.data as { id: number; rules: FwRule[] } | null;
      setFwExists(!!fw);
      setFwRules(fw?.rules ?? []);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  const loadNetworking = async () => {
    try {
      const [netR, fipR] = await Promise.all([
        api.get(`/hetzner/${id}/network`),
        api.get(`/hetzner/${id}/floating-ips`),
      ]);
      setNetInfo(netR.data.data);
      setFloatingIps(fipR.data.data ?? []);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    }
  };

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string, refreshServer = true) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      flash(okMsg);
      if (refreshServer) setTimeout(() => void loadServer(), 2500);
    } catch (e) {
      flash(getApiErrorMessage(e), true);
    } finally {
      setBusy(null);
    }
  };

  const power = (action: string, label: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    void run(action, () => api.post(`/hetzner/${id}/${action}`), `${label} komutu gönderildi`);
  };

  const resetPassword = () => {
    if (!confirm('Root parola sıfırlansın mı? Mevcut parola geçersiz olacak.')) return;
    void run(
      'reset-password',
      async () => {
        const r = await api.post(`/hetzner/${id}/reset-password`);
        const pw = r.data.data?.password as string | null;
        if (pw) {
          setCreds((c) => ({
            ipAddress: c?.ipAddress ?? service?.hetznerIp ?? null,
            ipv6: c?.ipv6 ?? service?.hetznerIpv6 ?? null,
            username: 'root',
            password: pw,
            sshKeyUsed: false,
          }));
          setShowPass(true);
        }
      },
      'Root parola sıfırlandı — Genel sekmesinde görebilirsiniz',
      false,
    );
  };

  const doRebuild = () => {
    if (!rebuildImage) return;
    if (!confirm(`DİKKAT: Sunucu "${rebuildImage}" ile sıfırdan kurulacak. TÜM VERİLER SİLİNECEK. Devam?`))
      return;
    void run(
      'rebuild',
      async () => {
        await api.post(`/hetzner/${id}/rebuild`, {
          image: rebuildImage,
          ...(rebuildKeyId ? { sshKeyId: rebuildKeyId } : {}),
        });
        setCreds(null); // parola/anahtar değişti → yeniden çekilsin
        await loadService();
      },
      'Yeniden kurulum başlatıldı',
    );
  };

  const doRescale = () => {
    if (!rescaleType) return;
    const loc = service?.hetznerLocation ?? 'nbg1';
    const p = serverTypes.find((t) => t.name === rescaleType)?.pricesByLocation[loc]?.monthlyIncVat;
    const priceMsg = p != null ? ` Yeni sunucu ücreti: ${fmtTL(p)} ₺/ay (KDV dahil).` : '';
    if (!confirm(`Sunucu "${rescaleType.toUpperCase()}" planına geçirilecek.${priceMsg} Sunucu kapalı olmalı. Devam?`))
      return;
    void run(
      'rescale',
      async () => {
        await api.post(`/hetzner/${id}/rescale`, { serverType: rescaleType, upgradeDisk: true });
        await loadService();
      },
      'Plan değiştirildi',
    );
  };

  const rescueEnable = () =>
    run(
      'rescue-enable',
      async () => {
        const r = await api.post(`/hetzner/${id}/rescue/enable`);
        setRescuePass(r.data.data?.password ?? null);
      },
      'Kurtarma modu açıldı — Reset atarak rescue sistemine girin',
      false,
    );
  const rescueDisable = () => run('rescue-disable', () => api.post(`/hetzner/${id}/rescue/disable`), 'Kurtarma modu kapatıldı', false);

  const attachIso = () => {
    if (!selectedIso) return;
    void run('iso', () => api.post(`/hetzner/${id}/iso/attach`, { iso: selectedIso }), 'ISO takıldı');
  };
  const detachIso = () => run('iso-detach', () => api.post(`/hetzner/${id}/iso/detach`), 'ISO çıkarıldı', false);

  const savePtr = () => {
    const ipToSet = netInfo?.ipv4 ?? service?.hetznerIp;
    if (!ipToSet) return;
    void run('ptr', () => api.post(`/hetzner/${id}/reverse-dns`, { ip: ipToSet, ptr: ptr.trim() || null }), 'Reverse DNS güncellendi', false);
  };

  const addFloatingIp = () => {
    if (!confirm(`Floating IP eklenecek. Aylık ek ücret: ${fmtTL(fipPrice)} ₺ (KDV dahil). Onaylıyor musunuz?`)) return;
    void run('fip', async () => {
      await api.post(`/hetzner/${id}/floating-ips`, { type: 'ipv4' });
      await loadNetworking();
      await loadService();
    }, 'Floating IP eklendi', false);
  };
  const deleteFloatingIp = (fipId: number) => {
    if (!confirm('Floating IP silinsin mi?')) return;
    void run(`fip-${fipId}`, async () => {
      await api.delete(`/hetzner/${id}/floating-ips/${fipId}`);
      await loadNetworking();
      await loadService();
    }, 'Floating IP silindi', false);
  };
  const addPrivateNet = () =>
    run('pnet', async () => {
      await api.post(`/hetzner/${id}/private-networks`);
      await loadNetworking();
    }, 'Özel ağ oluşturuldu ve bağlandı', false);
  const detachPrivateNet = (netId: number) => {
    if (!confirm('Özel ağ ayrılsın mı?')) return;
    void run(`pnet-${netId}`, async () => {
      await api.delete(`/hetzner/${id}/private-networks/${netId}`);
      await loadNetworking();
    }, 'Özel ağ ayrıldı', false);
  };

  const toggleBackup = () => {
    const enabling = !backupsOn;
    void run(
      'backup',
      async () => {
        await api.post(`/hetzner/${id}/backup/${enabling ? 'enable' : 'disable'}`);
        setBackupsOn(enabling);
      },
      enabling ? 'Yedekleme açıldı (+%20)' : 'Yedekleme kapatıldı',
      false,
    );
  };

  const createSnapshot = () =>
    run(
      'snapshot',
      async () => {
        await api.post(`/hetzner/${id}/snapshot`, { description: snapDesc || undefined });
        setSnapDesc('');
        await loadSnapshots();
      },
      'Snapshot oluşturuluyor',
      false,
    );
  const deleteSnapshot = (snapId: number) => {
    if (!confirm('Snapshot silinsin mi?')) return;
    void run(
      `snap-${snapId}`,
      async () => {
        await api.delete(`/hetzner/${id}/snapshots/${snapId}`);
        await loadSnapshots();
      },
      'Snapshot silindi',
      false,
    );
  };
  const restoreSnapshot = (snapId: number, label: string) => {
    if (
      !confirm(
        `DİKKAT: Sunucu "${label}" snapshot'ına geri yüklenecek.\n\n` +
          'Snapshot alındığı andan SONRAKİ TÜM VERİLER SİLİNECEK ve geri alınamaz. ' +
          'Sunucu bu işlem sırasında birkaç dakika kapalı kalır. Devam edilsin mi?',
      )
    )
      return;
    void run(
      `restore-${snapId}`,
      async () => {
        await api.post(`/hetzner/${id}/snapshots/${snapId}/restore`);
      },
      'Snapshot geri yükleniyor — sunucu birkaç dakika içinde hazır olur',
      true,
    );
  };

  const addVolume = () => {
    const monthly = newVolSize * volPerGb;
    if (!confirm(`${newVolSize} GB disk eklenecek. Aylık ek ücret: ${fmtTL(monthly)} ₺ (KDV dahil). Onaylıyor musunuz?`))
      return;
    void run(
      'volume',
      async () => {
        await api.post(`/hetzner/${id}/volumes`, { size: newVolSize });
        await loadVolumes();
        await loadService();
      },
      'Volume oluşturuldu ve bağlandı',
      false,
    );
  };
  const deleteVolume = (volId: number) => {
    if (!confirm('Volume kalıcı olarak silinsin mi? Üzerindeki veriler kaybolur.')) return;
    void run(
      `vol-${volId}`,
      async () => {
        await api.delete(`/hetzner/${id}/volumes/${volId}`);
        await loadVolumes();
        await loadService();
      },
      'Volume silindi',
      false,
    );
  };

  const saveFirewall = () =>
    run('fw-save', async () => {
      await api.put(`/hetzner/${id}/firewall`, { rules: fwRules });
      await loadFirewall();
    }, 'Firewall kuralları uygulandı', false);
  const deleteFirewall = () => {
    if (!confirm('Firewall kaldırılsın mı? Sunucu tüm trafiğe açık olur.')) return;
    void run('fw-del', async () => {
      await api.delete(`/hetzner/${id}/firewall`);
      setFwRules([]);
      setFwExists(false);
    }, 'Firewall kaldırıldı', false);
  };

  const terminate = () => {
    if (!confirm('Sunucu KALICI olarak silinecek ve tüm veriler yok olacak. Emin misiniz?')) return;
    if (!confirm('Son onay: Bu işlem GERİ ALINAMAZ. Sunucu ve ek kaynaklar (volume/firewall) silinsin mi?')) return;
    void run(
      'terminate',
      async () => {
        await api.delete(`/services/${id}`);
        navigate('/app/services');
      },
      'Sunucu sonlandırıldı',
      false,
    );
  };

  if (error && !service) return <div className="text-red-500">{error}</div>;
  if (!service) return <div className="text-slate-400">Yükleniyor…</div>;

  const locLabel = service.hetznerLocation ? FLAG[service.hetznerLocation] ?? service.hetznerLocation : '—';
  const ip = creds?.ipAddress ?? service.hetznerIp;
  const ipv6 = creds?.ipv6 ?? service.hetznerIpv6;
  const sshKeyUsed = creds?.sshKeyUsed ?? service.config?.sshKeyUsed ?? false;
  const st = server?.status
    ? STATUS_TR[server.status] ?? { label: server.status, cls: 'bg-slate-200 text-slate-600' }
    : null;
  const priceIncVat = Number(service.price) * (1 + vatRate / 100);
  // Sunucu Linux ise Windows ISO'larını (ve tersi) gizle — alakasız imajlarla listeyi doldurmayalım.
  const serverIsWindows = /windows|win-?(server|\d)/i.test(service.hetznerOs ?? '');
  const visibleIsos = isos.filter((i) => {
    const isWindowsIso = /windows|win-?(server|\d)/i.test(`${i.name} ${i.description}`);
    return serverIsWindows ? isWindowsIso : !isWindowsIso;
  });

  return (
    <div className="max-w-3xl space-y-5">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{service.name}</h1>
          <p className="text-sm text-slate-500">
            VPS{service.hetznerPlan && ` · ${service.hetznerPlan.toUpperCase()}`} · {locLabel} ·{' '}
            <span className="font-medium text-slate-600">{fmtTL(priceIncVat)} ₺/ay</span>{' '}
            <span className="text-xs text-slate-400">(KDV dahil)</span>
          </p>
        </div>
        <div className="text-right">
          {st ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
          ) : (
            <span className="text-xs text-slate-400">durum alınamadı</span>
          )}
          <button onClick={() => void loadServer()} className="ml-2 text-xs text-brand-600 hover:underline">
            Yenile
          </button>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Sekmeler */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['genel', 'Genel'],
            ['yonetim', 'Yönetim'],
            ['networking', 'Ağ'],
            ['grafik', 'Grafikler'],
            ['snapshot', 'Snapshot'],
            ['volume', 'Volume'],
            ['firewall', 'Firewall'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── GENEL ── */}
      {tab === 'genel' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Sunucu Bilgileri</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Info label="Plan" value={service.hetznerPlan?.toUpperCase() ?? '—'} />
              <Info label="Lokasyon" value={locLabel} />
              <Info label="İşletim Sistemi" value={service.hetznerOs ?? '—'} />
              <Info
                label="Kaynak"
                value={
                  service.config?.cores
                    ? `${service.config.cores} CPU · ${service.config.memory} GB · ${service.config.disk} GB SSD`
                    : '—'
                }
              />
              <Info label="Yedekleme" value={backupsOn ? 'Açık' : 'Kapalı'} />
              <Info label="Aylık Ücret" value={`${fmtTL(priceIncVat)} ₺`} />
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 font-semibold text-slate-800">Giriş Bilgileri</h2>
            <p className="mb-3 text-xs text-slate-500">
              SSH ile bağlanın: <code className="rounded bg-slate-100 px-1">ssh root@{ip ?? 'IP'}</code>
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center">
                <dt className="w-28 text-xs uppercase text-slate-400">IPv4</dt>
                <dd className="font-mono text-slate-700">{ip ?? '—'}</dd>
                {ip && <CopyBtn value={ip} />}
              </div>
              {ipv6 && (
                <div className="flex items-center">
                  <dt className="w-28 text-xs uppercase text-slate-400">IPv6</dt>
                  <dd className="truncate font-mono text-slate-700">{ipv6}</dd>
                  <CopyBtn value={ipv6} />
                </div>
              )}
              <div className="flex items-center">
                <dt className="w-28 text-xs uppercase text-slate-400">Kullanıcı</dt>
                <dd className="font-mono text-slate-700">root</dd>
              </div>
              <div className="flex items-center">
                <dt className="w-28 text-xs uppercase text-slate-400">Parola</dt>
                <dd className="font-mono text-slate-700">
                  {sshKeyUsed && !creds?.password ? (
                    <span className="text-slate-500">SSH anahtarı ile giriş</span>
                  ) : !creds ? (
                    <span className="text-slate-400">••••••••</span>
                  ) : creds.password ? (
                    showPass ? (
                      creds.password
                    ) : (
                      '••••••••'
                    )
                  ) : (
                    <span className="text-slate-500">Kayıtlı parola yok</span>
                  )}
                </dd>
                {creds?.password && (
                  <>
                    <button
                      onClick={() => setShowPass((s) => !s)}
                      className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
                    >
                      {showPass ? 'Gizle' : 'Göster'}
                    </button>
                    <CopyBtn value={creds.password} />
                  </>
                )}
              </div>
            </dl>
            {!creds && (
              <button
                onClick={loadCreds}
                disabled={credLoading}
                className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {credLoading ? 'Getiriliyor…' : 'Giriş Bilgilerini Göster'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── YÖNETİM ── */}
      {tab === 'yonetim' && (
        <div className="space-y-4">
          {/* Güç */}
          <Card title="Güç Kontrolü">
            <div className="flex flex-wrap gap-2">
              <ActBtn busy={busy === 'poweron'} onClick={() => power('poweron', 'Başlatma')}>▶ Başlat</ActBtn>
              <ActBtn busy={busy === 'reboot'} onClick={() => power('reboot', 'Yeniden başlatma')}>↻ Yeniden Başlat</ActBtn>
              <ActBtn busy={busy === 'shutdown'} onClick={() => power('shutdown', 'Kapatma')}>⏻ Kapat (nazik)</ActBtn>
              <ActBtn danger busy={busy === 'poweroff'} onClick={() => power('poweroff', 'Zorla kapatma', 'Zorla kapatılsın mı?')}>⏻ Zorla Kapat</ActBtn>
              <ActBtn danger busy={busy === 'reset'} onClick={() => power('reset', 'Reset', 'Donanımsal reset atılsın mı?')}>⚡ Reset</ActBtn>
            </div>
          </Card>

          {/* Konsol */}
          <Card title="VNC Konsol">
            <p className="mb-3 text-xs text-slate-500">Tarayıcı içinde sunucu ekranı. Ağ/SSH çalışmasa bile erişilir.</p>
            <ActBtn onClick={() => setVncOpen(true)}>Konsolu Aç</ActBtn>
          </Card>

          {/* Rescale */}
          <Card title="Plan Değiştir (Rescale)">
            <p className="mb-3 text-xs text-slate-500">Daha güçlü/zayıf plana geçin. Sunucu <b>kapalı</b> olmalı. Disk küçültülemez.</p>
            <div className="flex flex-wrap gap-2">
              <select value={rescaleType} onChange={(e) => setRescaleType(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Plan seçin…</option>
                {serverTypes.map((t) => {
                  const p = t.pricesByLocation[service.hetznerLocation ?? 'nbg1']?.monthlyIncVat;
                  return (
                    <option key={t.name} value={t.name}>
                      {t.name.toUpperCase()} — {t.cores} CPU · {t.memory} GB · {t.disk} GB{p != null ? ` — ${fmtTL(p)} ₺/ay` : ''}
                    </option>
                  );
                })}
              </select>
              <button onClick={doRescale} disabled={!rescaleType || busy === 'rescale'} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {busy === 'rescale' ? 'Uygulanıyor…' : 'Planı Değiştir'}
              </button>
            </div>
            {rescaleType && (() => {
              const p = serverTypes.find((t) => t.name === rescaleType)?.pricesByLocation[service.hetznerLocation ?? 'nbg1']?.monthlyIncVat;
              return p != null ? (
                <p className="mt-2 text-sm text-slate-600">
                  Yeni sunucu ücreti: <span className="font-semibold">{fmtTL(p)} ₺/ay</span>{' '}
                  <span className="text-xs text-slate-400">(KDV dahil)</span>
                </p>
              ) : null;
            })()}
          </Card>

          {/* Root parola */}
          <Card title="Root Parolası">
            <ActBtn busy={busy === 'reset-password'} onClick={resetPassword}>Root Parolayı Sıfırla</ActBtn>
          </Card>

          {/* Rescue */}
          <Card title="Kurtarma Modu (Rescue)">
            <p className="mb-3 text-xs text-slate-500">Sunucu açılmıyorsa kurtarma sistemine boot edin (etkinleştirdikten sonra Reset atın).</p>
            <div className="flex flex-wrap gap-2">
              <ActBtn busy={busy === 'rescue-enable'} onClick={rescueEnable}>Kurtarma Modunu Aç</ActBtn>
              <ActBtn busy={busy === 'rescue-disable'} onClick={rescueDisable}>Kapat</ActBtn>
            </div>
            {rescuePass && (
              <div className="mt-3 flex items-center rounded-lg bg-slate-50 p-2.5 text-xs">
                <span className="w-28 text-slate-400">Rescue parola</span>
                <code className="font-mono">{rescuePass}</code>
                <CopyBtn value={rescuePass} />
              </div>
            )}
          </Card>

          {/* ISO */}
          <Card title="ISO İmajı">
            <p className="mb-3 text-xs text-slate-500">Kendi işletim sistemini kurmak için ISO takın (boot için Reset gerekir).</p>
            <div className="flex flex-wrap gap-2">
              <select value={selectedIso} onChange={(e) => setSelectedIso(e.target.value)} className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">ISO seçin…</option>
                {visibleIsos.map((i) => (
                  <option key={i.id} value={i.name}>{i.description || i.name}</option>
                ))}
              </select>
              <ActBtn busy={busy === 'iso'} onClick={attachIso}>Tak</ActBtn>
              <ActBtn busy={busy === 'iso-detach'} onClick={detachIso}>Çıkar</ActBtn>
            </div>
          </Card>

          {/* Yedekleme */}
          <Card title="Otomatik Yedekleme">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Günlük otomatik yedek, sunucu ücretinin +%20'si.</p>
              <ActBtn danger={backupsOn} busy={busy === 'backup'} onClick={toggleBackup}>{backupsOn ? 'Kapat' : 'Aç (+%20)'}</ActBtn>
            </div>
          </Card>

          {/* Rebuild */}
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="mb-1 font-semibold text-red-800">Yeniden Kur (Rebuild)</h2>
            <p className="mb-3 text-xs text-red-700">Seçilen OS ile sıfırdan kurar. <strong>Tüm veriler silinir.</strong></p>
            <div className="flex flex-wrap gap-2">
              <select value={rebuildImage} onChange={(e) => setRebuildImage(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">OS seçin…</option>
                {images.map((i) => (<option key={i.name} value={i.name}>{i.description}</option>))}
              </select>
              {savedKeys.length > 0 && (
                <select value={rebuildKeyId} onChange={(e) => setRebuildKeyId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">SSH anahtarı (opsiyonel)</option>
                  {savedKeys.map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
                </select>
              )}
              <button onClick={doRebuild} disabled={!rebuildImage || busy === 'rebuild'} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {busy === 'rebuild' ? 'Başlatılıyor…' : 'Yeniden Kur'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-red-600">
              SSH anahtarı seçerseniz cloud-init ile kurulur; yönetmek için{' '}
              <a href="/app/ssh-keys" className="underline">SSH Anahtarları</a>.
            </p>
          </div>

          {/* Sonlandır */}
          <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
            <h2 className="mb-1 font-semibold text-red-800">Sunucuyu Sonlandır</h2>
            <p className="mb-3 text-xs text-red-700">Sunucu, volume'lar ve firewall kalıcı olarak silinir. Geri alınamaz.</p>
            <button onClick={terminate} disabled={busy === 'terminate'} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {busy === 'terminate' ? 'Sonlandırılıyor…' : 'Sunucuyu Kalıcı Sil'}
            </button>
          </div>
        </div>
      )}

      {/* ── AĞ (NETWORKING) ── */}
      {tab === 'networking' && (
        <div className="space-y-4">
          {/* Public Network */}
          <Card title="Genel Ağ (Public Network)">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center">
                <dt className="w-28 text-xs uppercase text-slate-400">IPv4</dt>
                <dd className="font-mono text-slate-700">{netInfo?.ipv4 ?? service.hetznerIp ?? '—'}</dd>
                {(netInfo?.ipv4 ?? service.hetznerIp) && <CopyBtn value={netInfo?.ipv4 ?? service.hetznerIp!} />}
              </div>
              {(netInfo?.ipv6 ?? service.hetznerIpv6) && (
                <div className="flex items-center">
                  <dt className="w-28 text-xs uppercase text-slate-400">IPv6</dt>
                  <dd className="truncate font-mono text-slate-700">{netInfo?.ipv6 ?? service.hetznerIpv6}</dd>
                  <CopyBtn value={netInfo?.ipv6 ?? service.hetznerIpv6!} />
                </div>
              )}
            </dl>
          </Card>

          {/* Reverse DNS */}
          <Card title="Reverse DNS (PTR)">
            <p className="mb-3 text-xs text-slate-500">
              IP → alan adı eşleşmesi. E-posta sunucuları için önemlidir.{' '}
              {netInfo?.ipv4Ptr && <>Mevcut: <code>{netInfo.ipv4Ptr}</code></>}
            </p>
            <div className="flex flex-wrap gap-2">
              <input value={ptr} onChange={(e) => setPtr(e.target.value)} placeholder="mail.orneksite.com" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <ActBtn busy={busy === 'ptr'} onClick={savePtr}>Kaydet</ActBtn>
            </div>
          </Card>

          {/* Floating IP */}
          <Card title="Floating IP">
            <p className="mb-3 text-xs text-slate-500">
              Sunucular arasında taşınabilen sabit ek IP.
              {fipPrice > 0 && ` Aylık ücret: ${fmtTL(fipPrice)} ₺ (KDV dahil).`}
            </p>
            <ActBtn busy={busy === 'fip'} onClick={addFloatingIp}>+ Floating IP Ekle (IPv4)</ActBtn>
            {floatingIps.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100">
                {floatingIps.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-2">
                    <span className="font-mono text-sm text-slate-700">{f.ip} <span className="text-xs text-slate-400">({f.type})</span></span>
                    <div className="flex items-center gap-2">
                      <CopyBtn value={f.ip} />
                      <button onClick={() => deleteFloatingIp(f.id)} disabled={busy === `fip-${f.id}`} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50">Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Private Networks */}
          <Card title="Özel Ağ (Private Network)">
            <p className="mb-3 text-xs text-slate-500">
              Sunucularınız arasında özel/izole ağ üzerinden iletişim (ücretsiz). Sunucu bu ağa otomatik bağlanır.
            </p>
            <ActBtn busy={busy === 'pnet'} onClick={addPrivateNet}>+ Özel Ağ Oluştur & Bağla</ActBtn>
            {(netInfo?.privateNetworks?.length ?? 0) > 0 && (
              <div className="mt-3 divide-y divide-slate-100">
                {netInfo!.privateNetworks.map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{n.name}</p>
                      <p className="font-mono text-xs text-slate-400">{n.ip}{n.ipRange ? ` · ${n.ipRange}` : ''}</p>
                    </div>
                    <button onClick={() => detachPrivateNet(n.id)} disabled={busy === `pnet-${n.id}`} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50">Ayır</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── GRAFİKLER ── */}
      {tab === 'grafik' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => void loadMetrics()} className="text-xs text-brand-600 hover:underline">Yenile</button>
          </div>
          <Card title="CPU Kullanımı (son 1 saat)">
            <Sparkline data={metrics?.cpu ?? []} color="#0ea5e9" />
          </Card>
          <Card title="Ağ — Gelen (son 1 saat)">
            <Sparkline data={metrics?.netIn ?? []} color="#22c55e" unit="bw" />
          </Card>
          <Card title="Ağ — Giden (son 1 saat)">
            <Sparkline data={metrics?.netOut ?? []} color="#f59e0b" unit="bw" />
          </Card>
        </div>
      )}

      {/* ── SNAPSHOT ── */}
      {tab === 'snapshot' && (
        <div className="space-y-4">
          <Card title="Yeni Snapshot">
            <div className="flex flex-wrap gap-2">
              <input value={snapDesc} onChange={(e) => setSnapDesc(e.target.value)} placeholder="Açıklama (opsiyonel)" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button onClick={createSnapshot} disabled={busy === 'snapshot'} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                {busy === 'snapshot' ? 'Oluşturuluyor…' : '+ Snapshot Al'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">Snapshot'lar Hetzner tarafında GB başına ücretlendirilir.</p>
          </Card>
          <Card title="Snapshot'larım">
            {snapshots.length === 0 ? (
              <p className="text-sm text-slate-400">Henüz snapshot yok.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {snapshots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.description || `snapshot-${s.id}`}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(s.created).toLocaleString('tr-TR')}
                        {s.image_size ? ` · ${s.image_size.toFixed(1)} GB` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => restoreSnapshot(s.id, s.description || `snapshot-${s.id}`)} disabled={busy === `restore-${s.id}`} className="rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50">
                        {busy === `restore-${s.id}` ? 'Geri yükleniyor…' : 'Geri Yükle'}
                      </button>
                      <button onClick={() => deleteSnapshot(s.id)} disabled={busy === `snap-${s.id}`} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50">Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── VOLUME ── */}
      {tab === 'volume' && (
        <div className="space-y-4">
          <Card title="Yeni Disk (Volume)">
            <p className="mb-3 text-xs text-slate-500">
              Ek blok depolama ekleyin. Aylık ücreti sunucu faturanıza yansır. Sunucuya otomatik bağlanır.
              {volPerGb > 0 && ` Fiyat: ${fmtTL(volPerGb)} ₺/GB/ay (KDV dahil).`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={10}
                max={1024}
                value={newVolSize}
                onChange={(e) => setNewVolSize(Math.min(1024, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="text-sm text-slate-500">GB</span>
              <button
                onClick={addVolume}
                disabled={busy === 'volume' || newVolSize < 10 || newVolSize > 1024}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === 'volume' ? 'Oluşturuluyor…' : '+ Disk Ekle'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">En az 10 GB, en fazla 1.024 GB (1 TB).</p>
            {volPerGb > 0 && newVolSize >= 10 && newVolSize <= 1024 && (
              <p className="mt-1 text-sm text-slate-600">
                Aylık ek ücret: <span className="font-semibold">{fmtTL(newVolSize * volPerGb)} ₺</span>{' '}
                <span className="text-xs text-slate-400">(KDV dahil)</span>
              </p>
            )}
          </Card>
          <Card title="Disklerim">
            {volumes.length === 0 ? (
              <p className="text-sm text-slate-400">Ek disk yok.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {volumes.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{v.name} · {v.size} GB</p>
                      <p className="text-xs text-slate-400">
                        {v.linux_device ?? '—'}
                        {volPerGb > 0 ? ` · ${fmtTL(v.size * volPerGb)} ₺/ay (KDV dahil)` : ''}
                      </p>
                    </div>
                    <button onClick={() => deleteVolume(v.id)} disabled={busy === `vol-${v.id}`} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50">Sil</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── FIREWALL ── */}
      {tab === 'firewall' && (
        <div className="space-y-4">
          <Card title="Güvenlik Duvarı Kuralları">
            <p className="mb-3 text-xs text-slate-500">
              Yalnızca izin verdiğiniz gelen (inbound) portlar açılır. Kural yoksa Hetzner varsayılanı geçerlidir.
            </p>
            <div className="space-y-2">
              {fwRules.length === 0 && <p className="text-sm text-slate-400">Kural yok.</p>}
              {fwRules.map((r, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">Gelen</span>
                  <select
                    value={r.protocol}
                    onChange={(e) => setFwRules((rs) => rs.map((x, i) => (i === idx ? { ...x, protocol: e.target.value as FwRule['protocol'] } : x)))}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  >
                    {['tcp', 'udp', 'icmp'].map((p) => (<option key={p} value={p}>{p.toUpperCase()}</option>))}
                  </select>
                  {r.protocol !== 'icmp' && (
                    <input
                      value={r.port ?? ''}
                      onChange={(e) => setFwRules((rs) => rs.map((x, i) => (i === idx ? { ...x, port: e.target.value } : x)))}
                      placeholder="port (örn 22 veya 80-443)"
                      className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  )}
                  <span className="text-xs text-slate-400">kaynak: her yer</span>
                  <button onClick={() => setFwRules((rs) => rs.filter((_, i) => i !== idx))} className="ml-auto rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">Kaldır</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setFwRules((rs) => [...rs, { direction: 'in', protocol: 'tcp', port: '22' }])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">+ Kural Ekle</button>
              <button onClick={() => setFwRules((rs) => [...rs, { direction: 'in', protocol: 'tcp', port: '80' }, { direction: 'in', protocol: 'tcp', port: '443' }])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">+ Web (80/443)</button>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={saveFirewall} disabled={busy === 'fw-save'} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                {busy === 'fw-save' ? 'Uygulanıyor…' : 'Kuralları Uygula'}
              </button>
              {fwExists && (
                <button onClick={deleteFirewall} disabled={busy === 'fw-del'} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Firewall'ı Kaldır</button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Not: SSH (22) kuralını kaldırırsanız sunucuya SSH erişiminiz kapanır.</p>
          </Card>
        </div>
      )}

      {vncOpen && <VncConsole serviceId={service.id} name={service.name} onClose={() => setVncOpen(false)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 font-semibold text-slate-800">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ActBtn({
  children,
  onClick,
  busy,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
        danger ? 'border border-red-300 text-red-600 hover:bg-red-50' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
      }`}
    >
      {busy ? '…' : children}
    </button>
  );
}
