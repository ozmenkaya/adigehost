import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Product {
  id: string;
  name: string;
  type: string;
  categoryId: string | null;
  whmPackage: string | null;
  priceMonthly: number;
  priceAnnually: number | null;
  isActive: boolean;
  specs: { serverType?: string; location?: string } | null;
  server?: { name: string } | null;
  category?: { id: string; name: string } | null;
}
interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}
interface ServerOpt {
  id: string;
  name: string;
}
interface Pkg {
  name: string;
  QUOTA?: string;
}
interface HetznerType {
  name: string;
  cores: number;
  memory: number;
  disk: number;
  priceMonthlyTRY: number | null;
}

const LOCATIONS = ['nbg1', 'fsn1', 'hel1', 'hil', 'ash', 'sin'];

const EMPTY = {
  type: 'hosting' as 'hosting' | 'vps',
  name: '',
  categoryId: '',
  serverId: '',
  whmPackage: '',
  serverType: '',
  location: 'nbg1',
  priceMonthly: '',
  priceAnnually: '',
  description: '',
  isActive: true,
};

const EMPTY_CAT = { name: '', description: '', sortOrder: '0', isActive: true };

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [hetznerTypes, setHetznerTypes] = useState<HetznerType[]>([]);
  const [show, setShow] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [catForm, setCatForm] = useState({ ...EMPTY_CAT });
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...EMPTY });

  const load = () => {
    api
      .get('/admin/products')
      .then((r) => setProducts(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  };
  const loadCategories = () => {
    api
      .get('/admin/categories')
      .then((r) => setCategories(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  };
  useEffect(() => {
    load();
    loadCategories();
    api
      .get('/servers')
      .then((r) => setServers(r.data.data))
      .catch(() => {});
  }, []);

  const submitCategory = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/categories', {
        name: catForm.name,
        description: catForm.description || null,
        sortOrder: Number(catForm.sortOrder) || 0,
        isActive: catForm.isActive,
      });
      setCatForm({ ...EMPTY_CAT });
      loadCategories();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };
  const toggleCategory = async (c: Category) => {
    await api.put(`/admin/categories/${c.id}`, { isActive: !c.isActive });
    loadCategories();
  };
  const removeCategory = async (id: string) => {
    if (!confirm('Kategori silinsin mi? Bağlı ürünler kategorisiz kalır.')) return;
    await api.delete(`/admin/categories/${id}`);
    loadCategories();
    load();
  };

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

  const loadHetznerTypes = async (location: string) => {
    try {
      const r = await api.get('/hetzner/catalog/server-types', { params: { location } });
      setHetznerTypes(r.data.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const switchType = (type: 'hosting' | 'vps') => {
    setForm((f) => ({ ...EMPTY, type, categoryId: f.categoryId }));
    setPackages([]);
    setHetznerTypes([]);
    if (type === 'vps') loadHetznerTypes('nbg1');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      categoryId: form.categoryId || null,
      priceMonthly: Number(form.priceMonthly),
      priceAnnually: form.priceAnnually ? Number(form.priceAnnually) : null,
      description: form.description || null,
      isActive: form.isActive,
    };
    if (form.type === 'hosting') {
      payload.serverId = form.serverId || null;
      payload.whmPackage = form.whmPackage || undefined;
    } else {
      payload.serverId = null;
      payload.specs = {
        serverType: form.serverType,
        location: form.location,
        image: 'ubuntu-22.04',
      };
    }
    try {
      await api.post('/admin/products', payload);
      setForm({ ...EMPTY });
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

  const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Ürünler / Paketler</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCat((v) => !v)}
            className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
          >
            {showCat ? 'Kategorileri Kapat' : 'Kategoriler'}
          </button>
          <button
            onClick={() => {
              setShow((v) => !v);
              if (!show) switchType('hosting');
            }}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
          >
            {show ? 'Kapat' : '+ Ürün Ekle'}
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showCat && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Kategoriler — ana sayfada ayrı bölüm başlıkları olarak görünür
          </h2>

          {/* Mevcut kategoriler */}
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400">Henüz kategori yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-6 text-center text-xs text-slate-400">{c.sortOrder}</span>
                  <div className="flex-1">
                    <div className="font-medium text-slate-800">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-slate-400">{c.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleCategory(c)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {c.isActive ? 'Görünür' : 'Gizli'}
                  </button>
                  <button
                    onClick={() => removeCategory(c.id)}
                    className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Yeni kategori */}
          <form onSubmit={submitCategory} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <input
              required
              placeholder="Kategori adı (örn. WordPress Hosting)"
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              className={`flex-1 min-w-[180px] ${inputCls}`}
            />
            <input
              placeholder="Açıklama (opsiyonel)"
              value={catForm.description}
              onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
              className={`flex-1 min-w-[180px] ${inputCls}`}
            />
            <input
              type="number"
              placeholder="Sıra"
              value={catForm.sortOrder}
              onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })}
              className={`w-20 ${inputCls}`}
            />
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Ekle
            </button>
          </form>
        </div>
      )}

      {show && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          {/* Tür seçimi */}
          <div className="flex gap-2">
            {(['hosting', 'vps'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                  form.type === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t === 'hosting' ? 'Hosting (WHM)' : 'VPS (Hetzner)'}
              </button>
            ))}
          </div>

          <input
            required
            placeholder="Ürün adı (Başlangıç Hosting / VPS Start)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`w-full ${inputCls}`}
          />

          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className={`w-full ${inputCls}`}
          >
            <option value="">Kategorisiz</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            {form.type === 'hosting' ? (
              <>
                <select
                  value={form.serverId}
                  onChange={(e) => pullPackages(e.target.value)}
                  className={inputCls}
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
                  className={inputCls}
                >
                  <option value="">WHM paketi seç</option>
                  {packages.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.QUOTA ? `(disk: ${p.QUOTA})` : ''}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <select
                  value={form.location}
                  onChange={(e) => {
                    setForm({ ...form, location: e.target.value, serverType: '' });
                    loadHetznerTypes(e.target.value);
                  }}
                  className={inputCls}
                >
                  {LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={form.serverType}
                  onChange={(e) => {
                    const t = hetznerTypes.find((x) => x.name === e.target.value);
                    setForm({
                      ...form,
                      serverType: e.target.value,
                      priceMonthly: t?.priceMonthlyTRY
                        ? String(t.priceMonthlyTRY)
                        : form.priceMonthly,
                    });
                  }}
                  className={inputCls}
                >
                  <option value="">Hetzner tipi seç</option>
                  {hetznerTypes.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} — {t.cores}vCPU {t.memory}GB {t.disk}GB (~{t.priceMonthlyTRY} TL)
                    </option>
                  ))}
                </select>
              </>
            )}
            <input
              required
              type="number"
              step="0.01"
              placeholder="Aylık fiyat (TL)"
              value={form.priceMonthly}
              onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
              className={inputCls}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Yıllık fiyat (TL, opsiyonel)"
              value={form.priceAnnually}
              onChange={(e) => setForm({ ...form, priceAnnually: e.target.value })}
              className={inputCls}
            />
          </div>

          <input
            placeholder="Açıklama"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={`w-full ${inputCls}`}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Satışa açık (müşteriler görebilir)
          </label>
          {form.type === 'vps' && (
            <p className="text-xs text-amber-600">
              Not: VPS siparişi ödeme onayında gerçek Hetzner sunucusu oluşturur (ücretli).
            </p>
          )}
          <button className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Kaydet
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3">Tür</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Paket / Tip</th>
              <th className="px-4 py-3">Aylık</th>
              <th className="px-4 py-3">Yıllık</th>
              <th className="px-4 py-3">Satışta</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Henüz ürün yok.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 uppercase text-slate-500">{p.type}</td>
                  <td className="px-4 py-3 text-slate-600">{p.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.type === 'hosting'
                      ? (p.whmPackage ?? '—')
                      : `${p.specs?.serverType ?? '—'} / ${p.specs?.location ?? ''}`}
                  </td>
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
