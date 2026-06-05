import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface Service {
  id: string;
  type: string;
  name: string;
  status: string;
  price: number;
  hetznerIp: string | null;
  domain: string | null;
  nextDue: string | null;
  autoRenew: boolean;
  billingCycle: string;
}

const STATUS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
  terminated: 'bg-slate-200 text-slate-600',
};

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api
      .get('/services')
      .then((res) => setServices(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  };
  useEffect(() => load(), []);

  const toggleAutoRenew = async (e: React.MouseEvent, id: string, current: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.put(`/users/me/services/${id}/auto-renew`, { autoRenew: !current });
      setMsg(!current ? 'Otomatik yenileme açıldı' : 'Otomatik yenileme kapatıldı');
      setTimeout(() => setMsg(''), 3000);
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Servislerim</h1>
        <Link
          to="/app/order/hosting"
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Hosting Sipariş Et
        </Link>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          Henüz bir servisiniz yok.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {services.map((s) => (
            <Link
              key={s.id}
              to={`/app/services/${s.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{s.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[s.status] ?? ''}`}
                >
                  {s.status}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-500">
                <div>
                  Tür: <span className="uppercase">{s.type}</span>
                </div>
                {s.hetznerIp && <div>IP: {s.hetznerIp}</div>}
                {s.domain && <div>Alan adı: {s.domain}</div>}
                <div>
                  Ücret: {s.price} TL / {s.billingCycle === 'annually' ? 'yıl' : s.billingCycle === 'quarterly' ? '3 ay' : 'ay'}
                </div>
                {s.nextDue && (
                  <div>Sonraki ödeme: {new Date(s.nextDue).toLocaleDateString('tr-TR')}</div>
                )}
              </div>

              {/* Otomatik yenileme toggle */}
              <div
                className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <div>
                  <div className="text-xs font-medium text-slate-700">Otomatik Yenileme</div>
                  <div className="text-[11px] text-slate-400">
                    {s.autoRenew ? 'Kayıtlı kartınızdan otomatik çekilir' : 'Manuel ödeme'}
                  </div>
                </div>
                <button
                  onClick={(e) => toggleAutoRenew(e, s.id, s.autoRenew)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    s.autoRenew ? 'bg-brand-600' : 'bg-slate-300'
                  }`}
                  aria-label="Otomatik yenileme"
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      s.autoRenew ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
