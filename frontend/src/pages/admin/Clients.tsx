import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
}

const STATUS_BADGE: Record<Client['status'], string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = (q = '') => {
    setLoading(true);
    api
      .get('/admin/clients', { params: q ? { search: q } : {} })
      .then((res) => setClients(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const toggleSuspend = async (c: Client) => {
    const suspend = c.status !== 'suspended';
    try {
      await api.put(`/admin/clients/${c.id}/suspend`, { suspend });
      load(search);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Müşteriler</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(search);
          }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: ad, e-posta, firma"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
            Ara
          </button>
        </form>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ad Soyad</th>
              <th className="px-4 py-3">E-posta</th>
              <th className="px-4 py-3">Firma</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Yükleniyor…
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Henüz müşteri yok.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.company ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleSuspend(c)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100"
                    >
                      {c.status === 'suspended' ? 'Aktifleştir' : 'Askıya Al'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
