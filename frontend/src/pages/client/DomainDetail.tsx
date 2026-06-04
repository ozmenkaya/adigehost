import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface Service {
  id: string;
  type: string;
  name: string;
  domain: string | null;
  status: string;
  nextDue: string | null;
  config: { registrycode?: number; provider?: string } | null;
}

interface DomainInfo {
  domain: string;
  registrationDate?: string;
  expiryDate?: string;
  nameServers: string[];
  locked: boolean;
  childNameServers: Array<{ ns: string; ip: string }>;
}

type Tab = 'nameservers' | 'dns' | 'security' | 'info';

export default function DomainDetail() {
  const { id } = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [info, setInfo] = useState<DomainInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('nameservers');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const flash = (m: string, isErr = false) => {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setMsg(''); setError(''); }, 5000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const s = await api.get(`/services/${id}`);
      setService(s.data.data);
      // Alantron bilgileri
      const di = await api.get(`/services/${id}/domain`);
      setInfo(di.data.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;
  if (!service) return <div className="text-red-500">Servis bulunamadı</div>;

  const domain = service.domain ?? service.name;
  const expiry = info?.expiryDate || service.nextDue;
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null;
  const isExpiring = daysLeft !== null && daysLeft < 30;

  const tabs: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'nameservers', label: 'Nameserver', icon: '🌐' },
    { key: 'dns', label: 'Child DNS', icon: '🔗' },
    { key: 'security', label: 'Güvenlik', icon: '🔒' },
    { key: 'info', label: 'Bilgiler', icon: 'ℹ️' },
  ];

  return (
    <div className="max-w-4xl space-y-5">
      {/* Başlık */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{domain}</h1>
            <p className="text-sm text-slate-500">
              Domain ·{' '}
              <span className={service.status === 'active' ? 'text-green-600' : 'text-amber-500'}>
                {service.status}
              </span>
              {info?.locked && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🔒 Kilitli</span>}
              {expiry && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${isExpiring ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                  Bitiş: {new Date(expiry).toLocaleDateString('tr-TR')}
                  {daysLeft !== null && ` (${daysLeft} gün)`}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Sekmeler */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-[110px] rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── NAMESERVER ─────────────────────────────────────────── */}
      {tab === 'nameservers' && info && (
        <NameserversTab
          currentNameServers={info.nameServers}
          serviceId={id!}
          onSaved={() => { flash('Nameserver\'lar güncellendi'); void loadAll(); }}
          onError={(e) => flash(e, true)}
        />
      )}

      {/* ── CHILD DNS ──────────────────────────────────────────── */}
      {tab === 'dns' && info && (
        <ChildDnsTab
          childNs={info.childNameServers}
          serviceId={id!}
          onChanged={() => { flash('İşlem tamamlandı'); void loadAll(); }}
          onError={(e) => flash(e, true)}
        />
      )}

      {/* ── GÜVENLİK ───────────────────────────────────────────── */}
      {tab === 'security' && info && (
        <SecurityTab
          locked={info.locked}
          serviceId={id!}
          onChanged={() => { flash('İşlem tamamlandı'); void loadAll(); }}
          onError={(e) => flash(e, true)}
        />
      )}

      {/* ── BİLGİLER ───────────────────────────────────────────── */}
      {tab === 'info' && info && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-bold text-slate-800 mb-3">Domain Bilgileri</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Alan Adı" value={info.domain || domain} />
            <Row label="Sağlayıcı" value="Alantron" />
            <Row label="Kayıt Tarihi" value={info.registrationDate ? new Date(info.registrationDate).toLocaleDateString('tr-TR') : '—'} />
            <Row label="Bitiş Tarihi" value={info.expiryDate ? new Date(info.expiryDate).toLocaleDateString('tr-TR') : '—'} />
            <Row label="Registrycode" value={String(service.config?.registrycode ?? '—')} mono />
            <Row label="Kilit Durumu" value={info.locked ? '🔒 Kilitli' : '🔓 Açık'} />
          </dl>
        </div>
      )}
    </div>
  );
}

// ── NS sekmesi ───────────────────────────────────────────────────────────────
function NameserversTab({
  currentNameServers, serviceId, onSaved, onError,
}: {
  currentNameServers: string[];
  serviceId: string;
  onSaved: () => void;
  onError: (e: string) => void;
}) {
  const [ns, setNs] = useState<string[]>(() => {
    const base = [...currentNameServers];
    while (base.length < 2) base.push('');
    return base;
  });
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const clean = ns.map((n) => n.trim().toLowerCase()).filter(Boolean);
    if (clean.length < 2) { onError('En az 2 nameserver gerekli'); return; }
    setSaving(true);
    try {
      await api.put(`/services/${serviceId}/domain/nameservers`, { nameServers: clean });
      onSaved();
    } catch (err) {
      onError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setOne = (i: number, v: string) => setNs((arr) => arr.map((x, idx) => idx === i ? v : x));
  const addRow = () => setNs((arr) => arr.length < 5 ? [...arr, ''] : arr);
  const removeRow = (i: number) => setNs((arr) => arr.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-800 mb-1">Nameserver Yönetimi</h2>
      <p className="text-xs text-slate-500 mb-4">
        Domain'iniz hangi DNS sunucularını kullansın? En az 2, en fazla 5 NS girin.
      </p>

      <form onSubmit={save} className="space-y-2">
        {ns.map((n, i) => (
          <div key={i} className="flex gap-2">
            <span className="w-12 text-xs font-medium text-slate-500 self-center">NS{i + 1}</span>
            <input
              value={n}
              onChange={(e) => setOne(i, e.target.value)}
              placeholder={i < 2 ? `ns${i + 1}.example.com (zorunlu)` : `ns${i + 1}.example.com (opsiyonel)`}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            {ns.length > 2 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-red-400 hover:text-red-600 text-xs px-2"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={addRow}
            disabled={ns.length >= 5}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40"
          >
            + Nameserver Ekle
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>

        {/* Önerilen presetler */}
        <div className="border-t pt-3 mt-3 space-y-1">
          <div className="text-xs font-medium text-slate-600 mb-2">Hızlı seçenekler:</div>
          <button
            type="button"
            onClick={() => setNs(['ns1.adigehost.com', 'ns2.adigehost.com'])}
            className="block text-xs text-brand-600 hover:underline"
          >
            → AdigeHost (ns1.adigehost.com / ns2.adigehost.com)
          </button>
          <button
            type="button"
            onClick={() => setNs(['mptr02.alantron.com', 'mptr04.alantron.com'])}
            className="block text-xs text-brand-600 hover:underline"
          >
            → Alantron parking (mptr02 / mptr04)
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Child DNS sekmesi ────────────────────────────────────────────────────────
function ChildDnsTab({
  childNs, serviceId, onChanged, onError,
}: {
  childNs: Array<{ ns: string; ip: string }>;
  serviceId: string;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [newNs, setNewNs] = useState('');
  const [newIp, setNewIp] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/services/${serviceId}/domain/child-ns`, {
        nameserver: newNs.trim().toLowerCase(),
        ipAddress: newIp.trim(),
      });
      setNewNs(''); setNewIp('');
      onChanged();
    } catch (err) {
      onError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const del = async (ns: string) => {
    if (!confirm(`${ns} silinsin mi?`)) return;
    try {
      await api.delete(`/services/${serviceId}/domain/child-ns/${encodeURIComponent(ns)}`);
      onChanged();
    } catch (err) {
      onError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-slate-800 mb-1">Child Nameserver Kayıtları</h2>
        <p className="text-xs text-slate-500 mb-4">
          Kendi domain'inize bağlı nameserver kayıtları (örn. <code className="bg-slate-100 px-1.5 rounded">ns1.{`<domain>`}</code> → IP).
          Sadece kendi domain'iniz altındaki NS host'larını yönetebilirsiniz.
        </p>

        {childNs.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">Henüz child nameserver tanımı yok.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {childNs.map((cn) => (
              <li key={cn.ns} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-mono text-sm text-slate-800">{cn.ns}</div>
                  <div className="text-xs text-slate-500">{cn.ip}</div>
                </div>
                <button
                  onClick={() => del(cn.ns)}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Yeni Child NS Ekle</h3>
        <form onSubmit={add} className="space-y-2">
          <input
            required
            value={newNs}
            onChange={(e) => setNewNs(e.target.value)}
            placeholder="ns1.alan-adim.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <input
            required
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="91.99.186.98"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <button
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? '…' : 'Ekle'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Güvenlik sekmesi ─────────────────────────────────────────────────────────
function SecurityTab({
  locked, serviceId, onChanged, onError,
}: {
  locked: boolean;
  serviceId: string;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [authCode, setAuthCode] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleLock = async () => {
    if (!confirm(locked ? 'Domain kilidi açılsın mı? (transfer için gerekli)' : 'Domain kilitlensin mi? (transfer korumalı olur)')) return;
    setBusy(true);
    try {
      await api.put(`/services/${serviceId}/domain/lock`, { locked: !locked });
      onChanged();
    } catch (err) {
      onError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (authCode.length < 6) { onError('Auth kodu en az 6 karakter olmalı'); return; }
    setBusy(true);
    try {
      await api.put(`/services/${serviceId}/domain/auth-code`, { authCode });
      setAuthCode('');
      onChanged();
    } catch (err) {
      onError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Transfer Lock */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-slate-800 mb-1">
              {locked ? '🔒 Domain Kilitli' : '🔓 Domain Açık'}
            </h2>
            <p className="text-sm text-slate-500">
              Kilitli olduğunda domain başka bir kayıtçıya transfer edilemez (yetkisiz transfer koruması).
            </p>
          </div>
          <button
            onClick={toggleLock}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
              locked
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {locked ? 'Kilidi Aç' : 'Kilitle'}
          </button>
        </div>
      </div>

      {/* Auth Code */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-slate-800 mb-1">Transfer Onay Kodu (EPP)</h2>
        <p className="text-sm text-slate-500 mb-4">
          Başka bir kayıtçıya transfer için kullanılır. 6-32 karakter. Mevcut kodun üzerine yazar.
        </p>
        <form onSubmit={saveAuth} className="flex gap-2">
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="Yeni transfer kodu (en az 6 karakter)"
            minLength={6}
            maxLength={32}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <button
            disabled={busy || authCode.length < 6}
            className="rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-400">{label}</dt>
      <dd className={mono ? 'font-mono text-slate-800' : 'font-medium text-slate-800'}>{value}</dd>
    </div>
  );
}
