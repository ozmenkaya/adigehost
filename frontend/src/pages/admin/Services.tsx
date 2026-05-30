import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Row {
  id: string;
  type: string;
  name: string;
  status: string;
  price: number;
  hetznerIp: string | null;
  user?: { firstName: string; lastName: string; email: string };
}

export default function AdminServices() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/services')
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Servisler</h1>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Servis</th>
              <th className="px-4 py-3">Tür</th>
              <th className="px-4 py-3">Müşteri</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">Fiyat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Henüz servis yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 uppercase text-slate-600">{r.type}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.user ? `${r.user.firstName} ${r.user.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.hetznerIp ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.status}</td>
                  <td className="px-4 py-3 text-right text-slate-800">{r.price} TL</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
