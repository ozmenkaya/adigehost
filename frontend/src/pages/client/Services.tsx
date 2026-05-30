import { useEffect, useState } from 'react';
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

  useEffect(() => {
    api
      .get('/services')
      .then((res) => setServices(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Servislerim</h1>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          Henüz bir servisiniz yok.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {services.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                <div>Ücret: {s.price} TL / ay</div>
                {s.nextDue && (
                  <div>Sonraki ödeme: {new Date(s.nextDue).toLocaleDateString('tr-TR')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
