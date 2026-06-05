import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface Service {
  id: string;
  type: 'hosting' | 'domain' | 'vps';
  name: string;
  status: string;
  price: number;
  hetznerIp: string | null;
  domain: string | null;
  nextDue: string | null;
  autoRenew: boolean;
  billingCycle: string;
  config?: { cpanelUser?: string; registrycode?: number; provider?: string } | null;
}

const STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'bg-green-100 text-green-700', label: 'Aktif' },
  pending: { cls: 'bg-amber-100 text-amber-700', label: 'Bekliyor' },
  suspended: { cls: 'bg-red-100 text-red-700', label: 'Askıda' },
  cancelled: { cls: 'bg-slate-200 text-slate-600', label: 'İptal' },
  terminated: { cls: 'bg-slate-200 text-slate-600', label: 'Sonlandı' },
};

type Tab = 'hosting' | 'domain' | 'vps';

function fmtTL(n: number) {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<Tab>('hosting');

  const load = () => {
    api.get('/services')
      .then((res) => setServices(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  };
  useEffect(() => load(), []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const toggleAutoRenew = async (e: React.MouseEvent, id: string, current: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.put(`/users/me/services/${id}/auto-renew`, { autoRenew: !current });
      flash(!current ? 'Otomatik yenileme açıldı' : 'Otomatik yenileme kapatıldı');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const grouped = useMemo(() => {
    const g = { hosting: [] as Service[], domain: [] as Service[], vps: [] as Service[] };
    services.forEach((s) => {
      if (s.type === 'hosting') g.hosting.push(s);
      else if (s.type === 'domain') g.domain.push(s);
      else if (s.type === 'vps') g.vps.push(s);
    });
    return g;
  }, [services]);

  // İlk yüklemede en çok hangi tip varsa onu varsayılan tab yap
  useEffect(() => {
    if (services.length === 0) return;
    if (grouped.hosting.length === 0 && grouped.domain.length > 0) setTab('domain');
    else if (grouped.hosting.length === 0 && grouped.domain.length === 0 && grouped.vps.length > 0) setTab('vps');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.length]);

  const tabs: Array<{ key: Tab; label: string; icon: string; count: number; visible: boolean }> = [
    { key: 'hosting', label: 'Hosting', icon: '🌐', count: grouped.hosting.length, visible: true },
    { key: 'domain', label: 'Domain', icon: '🔗', count: grouped.domain.length, visible: true },
    { key: 'vps', label: 'VPS', icon: '🖥️', count: grouped.vps.length, visible: grouped.vps.length > 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Başlık + CTA'lar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Servislerim</h1>
        <div className="flex gap-2">
          <Link
            to="/app/order/hosting"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Hosting Sipariş
          </Link>
          <Link
            to="/"
            className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            + Domain
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}

      {/* Sekmeler */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 max-w-md">
        {tabs.filter((t) => t.visible).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon} {t.label}{' '}
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${
              tab === t.key ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-500'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── HOSTING TABLOSU ───────────────────────────────────────── */}
      {tab === 'hosting' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">cPanel Kullanıcı</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Sonraki Ödeme</th>
                <th className="px-4 py-3 text-right">Ücret</th>
                <th className="px-4 py-3 text-center">Oto. Yen.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grouped.hosting.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Henüz hosting hizmetiniz yok.
                    <Link to="/app/order/hosting" className="block mt-2 text-brand-600 hover:underline">
                      + Hosting paketi seç
                    </Link>
                  </td>
                </tr>
              ) : (
                grouped.hosting.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/app/services/${s.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {s.domain ?? s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {s.config?.cpanelUser ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[s.status]?.cls ?? ''}`}>
                        {STATUS[s.status]?.label ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(s.nextDue)}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className="font-semibold">{fmtTL(s.price)}</span>{' '}
                      <span className="text-xs text-slate-400">
                        ₺/{s.billingCycle === 'annually' ? 'yıl' : s.billingCycle === 'quarterly' ? '3 ay' : 'ay'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <AutoRenewToggle
                        active={s.autoRenew}
                        onClick={(e) => toggleAutoRenew(e, s.id, s.autoRenew)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── DOMAIN TABLOSU ────────────────────────────────────────── */}
      {tab === 'domain' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Alan Adı</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Bitiş Tarihi</th>
                <th className="px-4 py-3 text-center">Oto. Yen.</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grouped.domain.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    Henüz domaininiz yok.
                    <Link to="/" className="block mt-2 text-brand-600 hover:underline">
                      + Domain ara veya transfer et
                    </Link>
                  </td>
                </tr>
              ) : (
                grouped.domain.map((s) => {
                  const expiry = s.nextDue ? new Date(s.nextDue) : null;
                  const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null;
                  const isExpiring = daysLeft !== null && daysLeft < 60;
                  const isExpired = daysLeft !== null && daysLeft < 0;
                  return (
                    <tr key={s.id} className={`hover:bg-slate-50 ${isExpiring ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <Link to={`/app/services/${s.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                          {s.domain ?? s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[s.status]?.cls ?? ''}`}>
                          {STATUS[s.status]?.label ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-600">{fmtDate(s.nextDue)}</div>
                        {daysLeft !== null && (
                          <div className={`text-[11px] ${
                            isExpired ? 'text-red-600 font-semibold' :
                            isExpiring ? 'text-amber-600 font-medium' :
                            'text-slate-400'
                          }`}>
                            {isExpired ? `${Math.abs(daysLeft)} gün önce sona erdi` : `${daysLeft} gün kaldı`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <AutoRenewToggle
                          active={s.autoRenew}
                          onClick={(e) => toggleAutoRenew(e, s.id, s.autoRenew)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/app/services/${s.id}`}
                          className={`inline-block rounded-lg px-3 py-1 text-xs font-semibold ${
                            isExpiring
                              ? 'bg-brand-600 text-white hover:bg-brand-700'
                              : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          ↻ Yenile
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VPS TABLOSU ───────────────────────────────────────────── */}
      {tab === 'vps' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Ad</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Sonraki Ödeme</th>
                <th className="px-4 py-3 text-right">Ücret</th>
                <th className="px-4 py-3 text-center">Oto. Yen.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grouped.vps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    VPS hizmetiniz yok.
                  </td>
                </tr>
              ) : (
                grouped.vps.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/app/services/${s.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.hetznerIp ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[s.status]?.cls ?? ''}`}>
                        {STATUS[s.status]?.label ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(s.nextDue)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold">{fmtTL(s.price)}</span>{' '}
                      <span className="text-xs text-slate-400">
                        ₺/{s.billingCycle === 'annually' ? 'yıl' : 'ay'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <AutoRenewToggle
                        active={s.autoRenew}
                        onClick={(e) => toggleAutoRenew(e, s.id, s.autoRenew)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AutoRenewToggle({
  active, onClick,
}: { active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? 'Otomatik yenileme açık' : 'Otomatik yenileme kapalı'}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        active ? 'bg-brand-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          active ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
