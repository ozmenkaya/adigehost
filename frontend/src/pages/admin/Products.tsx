import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Product {
  id: string;
  name: string;
  type: string;
  whmPackage: string | null;
  priceMonthly: number;
  priceAnnually: number | null;
  isActive: boolean;
  server?: { name: string } | null;
}
interface ServerOpt {
  id: string;
  name: string;
}
interface Pkg {
  name: string;
  QUOTA?: string;
  BWLIMIT?: string;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    serverId: '',
    whmPackage: '',
    priceMonthly: '',
    priceAnnually: '',
    description: '',
    isActive: true,
  });

  const load = () => {
    api
      .get('/admin/products')
      .then((r) => setProducts(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  };
  useEffect(() => {
    load();
    api
      .get('/servers')
      .then((r) => setServers(r.data.data))
      .catch(() => {});
  }, []);

  const pullPackages = async (serverId: string) => {
    setForm((f) => ({ ...f, serverId, whmPackage: '' }));
    setPackages([]);
    if (!serverId) return;
    try {
      const r = await api.get(`/servers/${serverId}/packages`);
      setPackages(r.data.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/products', {
        name: form.name,
        type: 'hosting',
        serverId: form.serverId || null,
        whmPackage: form.whmPackage || undefined,
        priceMonthly: Number(form.priceMonthly),
        priceAnnually: form.priceAnnually ? Number(form.priceAnnually) : null,
        description: form.description || null,
        isActive: form.isActive,
      });
      setForm({
        name: '',
        serverId: '',
        whmPackage: '',
        priceMonthly: '',
        priceAnnually: '',
        description: '',
        isActive: true,
      });
      setShow(false);
      load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const toggle = async (p: Product) => {
    await api.put(`/admin/products/${p.id}`, { isActive: !p.isActive });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm('Ürün silinsin mi?')) return;
    await api.delete(`/admin/products/${id}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Ürünler / Paketler</h1>
        <button
          onClick={() => setShow((v) => !v)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
        >
          {show ? 'Kapat' : '+ Ürün Ekle'}
        </button>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {show && (
        <form
          onSubmit={submit}
          className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <input
            required
            placeholder="Ürün adı (Başlangıç Hosting)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={form.serverId}
            onChange={(e) => pullPackages(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sunucu seç (paketleri çek)</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={form.whmPackage}
            onChange={(e) => setForm({ ...form, whmPackage: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">WHM paketi seç</option>
            {packages.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} {p.QUOTA ? `(disk: ${p.QUOTA})` : ''}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            step="0.01"
            placeholder="Aylık fiyat (TL)"
            value={form.priceMonthly}
            onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Yıllık fiyat (TL, opsiyonel)"
            value={form.priceAnnually}
            onChange={(e) => setForm({ ...form, priceAnnually: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Açıklama"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Satışa açık (müşteriler görebilir)
          </label>
          <button className="col-span-2 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Kaydet
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3">WHM Paketi</th>
              <th className="px-4 py-3">Sunucu</th>
              <th className="px-4 py-3">Aylık</th>
              <th className="px-4 py-3">Yıllık</th>
              <th className="px-4 py-3">Satışta</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Henüz ürün yok.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.whmPackage ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.server?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{p.priceMonthly} TL</td>
                  <td className="px-4 py-3 text-slate-700">{p.priceAnnually ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(p)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {p.isActive ? 'Açık' : 'Kapalı'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(p.id)}
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
