import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface ServerRow {
  id: string;
  name: string;
  type: string;
  provider: string;
  purpose: string;
  whmHost: string | null;
  status: string;
  accountCount: number;
  accountLimit: number;
  acceptsNew: boolean;
}

const EMPTY = {
  name: '',
  type: 'dedicated',
  provider: 'hetzner_dedicated',
  purpose: 'hosting',
  whmHost: '',
  whmToken: '',
  accountLimit: 100,
};

export default function Servers() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api
      .get('/servers')
      .then((res) => setServers(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  };
  useEffect(() => load(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/servers', {
        ...form,
        accountLimit: Number(form.accountLimit),
        whmToken: form.whmToken || undefined,
      });
      setForm({ ...EMPTY });
      setShowForm(false);
      setMsg('Sunucu eklendi');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const test = async (id: string) => {
    setMsg('');
    try {
      const res = await api.post(`/servers/${id}/test`);
      setMsg(res.data.data.connected ? '✅ Bağlantı başarılı' : '❌ Bağlanılamadı');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Sunucu silinsin mi?')) return;
    await api.delete(`/servers/${id}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Sunucular</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
        >
          {showForm ? 'Kapat' : '+ Sunucu Ekle'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}

      {showForm && (
        <form
          onSubmit={submit}
          className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <input
            required
            placeholder="Ad (TR-Node-01)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="hosting">hosting</option>
            <option value="vps">vps</option>
            <option value="mixed">mixed</option>
          </select>
          <input
            placeholder="WHM Host (IP/hostname)"
            value={form.whmHost}
            onChange={(e) => setForm({ ...form, whmHost: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="WHM API Token"
            value={form.whmToken}
            onChange={(e) => setForm({ ...form, whmToken: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Hesap limiti"
            value={form.accountLimit}
            onChange={(e) => setForm({ ...form, accountLimit: Number(e.target.value) })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="col-span-2 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Kaydet
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ad</th>
              <th className="px-4 py-3">Amaç</th>
              <th className="px-4 py-3">WHM Host</th>
              <th className="px-4 py-3">Hesap</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {servers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Henüz sunucu eklenmemiş.
                </td>
              </tr>
            ) : (
              servers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.purpose}</td>
                  <td className="px-4 py-3 text-slate-600">{s.whmHost ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.accountCount}/{s.accountLimit || '∞'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.status}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => test(s.id)}
                      className="mr-2 rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Sil
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
