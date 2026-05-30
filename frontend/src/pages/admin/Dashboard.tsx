import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Stats {
  totalClients: number;
  activeServices: number;
  pendingServices: number;
  openTickets: number;
  servers: number;
  unpaidTotal: number;
  monthlyRevenue: number;
  servicesByType: Array<{ type: string; count: number }>;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/dashboard')
      .then((res) => setStats(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!stats) return <div className="text-slate-500">Yükleniyor…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Genel Bakış</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Toplam Müşteri" value={String(stats.totalClients)} />
        <StatCard
          label="Aktif Servis"
          value={String(stats.activeServices)}
          accent="text-green-600"
        />
        <StatCard
          label="Bekleyen Servis"
          value={String(stats.pendingServices)}
          accent="text-amber-600"
        />
        <StatCard label="Açık Talep" value={String(stats.openTickets)} accent="text-blue-600" />
        <StatCard label="Sunucu" value={String(stats.servers)} />
        <StatCard label="Ödenmemiş" value={fmt(stats.unpaidTotal)} accent="text-red-600" />
        <StatCard label="Bu Ay Gelir" value={fmt(stats.monthlyRevenue)} accent="text-green-700" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Aktif Servisler (tür bazında)</h2>
        {stats.servicesByType.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz aktif servis yok.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {stats.servicesByType.map((s) => (
              <li key={s.type} className="flex justify-between">
                <span className="capitalize text-slate-600">{s.type}</span>
                <span className="font-medium">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
