import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Log {
  id: string;
  action: string;
  resource: string | null;
  ip: string | null;
  createdAt: string;
  user?: { email: string } | null;
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/logs', { params: { limit: 100 } })
      .then((res) => setLogs(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">İşlem Logları</h1>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Tarih</th>
              <th className="px-4 py-3">İşlem</th>
              <th className="px-4 py-3">Kaynak</th>
              <th className="px-4 py-3">Kullanıcı</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {new Date(l.createdAt).toLocaleString('tr-TR')}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{l.action}</td>
                <td className="px-4 py-2 text-slate-600">{l.resource ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600">{l.user?.email ?? '—'}</td>
                <td className="px-4 py-2 text-slate-500">{l.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
