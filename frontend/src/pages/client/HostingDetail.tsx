import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface Service {
  id: string;
  type: string;
  name: string;
  status: string;
  domain: string | null;
  config: { cpanelUser?: string } | null;
  server?: { name: string } | null;
}

export default function HostingDetail() {
  const { id } = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [subdomains, setSubdomains] = useState<unknown[]>([]);
  const [newDb, setNewDb] = useState('');
  const [newPass, setNewPass] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const loadAll = async () => {
    try {
      const s = await api.get(`/services/${id}`);
      setService(s.data.data);
      const [db, sub] = await Promise.allSettled([
        api.get(`/whm/${id}/databases`),
        api.get(`/whm/${id}/subdomains`),
      ]);
      if (db.status === 'fulfilled') {
        const data = db.value.data.data;
        setDatabases(
          Array.isArray(data)
            ? data.map((x: { database?: string } | string) =>
                typeof x === 'string' ? x : (x.database ?? JSON.stringify(x)),
              )
            : [],
        );
      }
      if (sub.status === 'fulfilled') {
        const data = sub.value.data.data;
        setSubdomains(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api.post(`/whm/${id}/password`, { password: newPass });
      setNewPass('');
      setMsg('cPanel şifresi güncellendi');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const createDatabase = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api.post(`/whm/${id}/databases`, { name: newDb });
      setNewDb('');
      setMsg('Veritabanı oluşturuldu');
      void loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  if (!service) return <div className="text-slate-500">Yükleniyor…</div>;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{service.name}</h1>
        <p className="text-sm text-slate-500">
          Hosting · {service.status} · Sunucu: {service.server?.name ?? '—'}
        </p>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">cPanel Kullanıcısı</div>
            <div className="font-mono font-medium">{service.config?.cpanelUser ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Şifre değiştir */}
      <form onSubmit={changePassword} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-800">cPanel Şifresi Değiştir</h2>
        <div className="flex gap-2">
          <input
            type="password"
            required
            minLength={8}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="Yeni şifre (min 8)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            Güncelle
          </button>
        </div>
      </form>

      {/* Veritabanları */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Veritabanları ({databases.length})</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {databases.length === 0 ? (
            <li className="text-slate-400">Henüz veritabanı yok.</li>
          ) : (
            databases.map((d) => (
              <li key={d} className="font-mono text-slate-700">
                {d}
              </li>
            ))
          )}
        </ul>
        <form onSubmit={createDatabase} className="flex gap-2">
          <input
            value={newDb}
            onChange={(e) => setNewDb(e.target.value)}
            placeholder="yeni_veritabani"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-slate-300 px-4 text-sm hover:bg-slate-100">
            Oluştur
          </button>
        </form>
      </div>

      {/* Subdomainler */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 font-semibold text-slate-800">Subdomainler ({subdomains.length})</h2>
        {subdomains.length === 0 && <p className="text-sm text-slate-400">Subdomain bulunamadı.</p>}
      </div>
    </div>
  );
}
