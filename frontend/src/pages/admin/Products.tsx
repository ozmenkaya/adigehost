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
  description: string | null;
  isActive: boolean;
  setupFee: number | null;
  specs: Record<string, string> | null;
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

type ProductType = 'hosting' | 'vps' | 'website';

const TYPE_LABELS: Record<ProductType, string> = {
  hosting: 'Hosting (WHM)',
  vps: 'VPS (Hetzner)',
  website: 'Web Sitesi Yapımı',
};

const EMPTY = {
  type: 'hosting' as ProductType,
  name: '',
  categoryId: '',
  serverId: '',
  whmPackage: '',
  serverType: '',
  location: 'nbg1',
  priceMonthly: '',
  priceAnnually: '',
  setupFee: '',
  /** Web sitesi paketi kapsamı — satır başına "Anahtar: Değer". */
  specsText: '',
  description: '',
  isActive: true,
};

/** "Anahtar: Değer" satırlarını specs nesnesine çevirir. */
function parseSpecs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

/** specs nesnesini düzenlenebilir "Anahtar: Değer" metnine çevirir. */
function specsToText(specs: Record<string, unknown> | null | undefined): string {
  if (!specs) return '';
  return Object.entries(specs)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n');
}

const EMPTY_CAT = { name: '', description: '', sortOrder: '0', isActive: true };

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [servers, setServers] = useState<ServerOpt[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [hetznerTypes, setHetznerTypes] = useState<HetznerType[]>([]);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCat, setShowCat] = useState(false);
  const [catForm, setCatForm] = useState({ ...EMPTY_CAT });
  const [catEditId, setCatEditId] = useState<string | null>(null);
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
    const body = {
      name: catForm.name,
      description: catForm.description || null,
      sortOrder: Number(catForm.sortOrder) || 0,
      isActive: catForm.isActive,
    };
    try {
      if (catEditId) {
        await api.put(`/admin/categories/${catEditId}`, body);
      } else {
        await api.post('/admin/categories', body);
      }
      setCatForm({ ...EMPTY_CAT });
      setCatEditId(null);
      loadCategories();
      load(); // ürün tablosundaki kategori adları güncellensin
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };
  const startEditCategory = (c: Category) => {
    setCatEditId(c.id);
    setCatForm({
      name: c.name,
      description: c.description ?? '',
      sortOrder: String(c.sortOrder),
      isActive: c.isActive,
    });
  };
  const cancelEditCategory = () => {
    setCatEditId(null);
    setCatForm({ ...EMPTY_CAT });
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

  const switchType = (type: ProductType) => {
    // Tür değişince yalnızca türe özgü alanları sıfırla; ad/fiyat/açıklama gibi
    // türden bağımsız alanlar korunur (aksi halde girilen ad sessizce silinir).
    setForm((f) => ({
      ...f,
      type,
      serverId: '',
      whmPackage: '',
      serverType: '',
      location: 'nbg1',
    }));
    setPackages([]);
    setHetznerTypes([]);
    if (type === 'vps') loadHetznerTypes('nbg1');
  };

  const closeForm = () => {
    setForm({ ...EMPTY });
    setEditId(null);
    setShow(false);
  };

  const openAdd = () => {
    setEditId(null);
    setError('');
    setForm({ ...EMPTY });
    switchType('hosting');
    setShow(true);
  };

  // Mevcut ürünü forma yükle (düzenleme modu).
  const startEdit = (p: Product) => {
    setEditId(p.id);
    setShow(true);
    setShowCat(false);
    setError('');
    setForm({
      type: (p.type as ProductType) ?? 'hosting',
      name: p.name,
      categoryId: p.categoryId ?? '',
      serverId: '',
      whmPackage: p.whmPackage ?? '',
      serverType: p.specs?.serverType ?? '',
      location: p.specs?.location ?? 'nbg1',
      priceMonthly: String(p.priceMonthly ?? ''),
      priceAnnually: p.priceAnnually != null ? String(p.priceAnnually) : '',
      setupFee: p.setupFee != null ? String(p.setupFee) : '',
      specsText: p.type === 'website' ? specsToText(p.specs) : '',
      description: p.description ?? '',
      isActive: p.isActive,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        // Düzenleme: yalnızca değiştirilebilir alanlar (tür/paket/spec kuruluşta sabit)
        const patch: Record<string, unknown> = {
          name: form.name,
          categoryId: form.categoryId || null,
          priceMonthly: Number(form.priceMonthly),
          priceAnnually: form.priceAnnually ? Number(form.priceAnnually) : null,
          description: form.description || null,
          isActive: form.isActive,
        };
        // Web sitesi paketinde kurulum bedeli ve kapsam metni sonradan da düzenlenir —
        // fiyat/kapsam değişikliği bu iş modelinde normaldir.
        if (form.type === 'website') {
          patch.setupFee = Number(form.setupFee || 0);
          patch.specs = parseSpecs(form.specsText);
        }
        await api.put(`/admin/products/${editId}`, patch);
      } else {
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
        } else if (form.type === 'website') {
          // Web sitesi paketi bir sunucuya bağlı değil; teslim elle yapılır.
          payload.serverId = null;
          payload.setupFee = Number(form.setupFee || 0);
          payload.specs = parseSpecs(form.specsText);
        } else {
          payload.serverId = null;
          payload.specs = {
            serverType: form.serverType,
            location: form.location,
            image: 'ubuntu-22.04',
          };
        }
        await api.post('/admin/products', payload);
      }
      closeForm();
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
            onClick={() => (show ? closeForm() : openAdd())}
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
                <li
                  key={c.id}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${
                    catEditId === c.id ? 'bg-brand-50' : ''
                  }`}
                >
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
                    onClick={() => startEditCategory(c)}
                    className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-50"
                  >
                    Düzenle
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

          {/* Yeni / düzenle kategori */}
          <form onSubmit={submitCategory} className="space-y-2 border-t border-slate-100 pt-3">
            {catEditId && (
              <div className="text-xs font-semibold text-brand-700">Kategoriyi düzenle</div>
            )}
            <div className="flex flex-wrap items-end gap-2">
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
                {catEditId ? 'Güncelle' : 'Ekle'}
              </button>
              {catEditId && (
                <button
                  type="button"
                  onClick={cancelEditCategory}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  İptal
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {show && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          {editId ? (
            <div className="text-sm font-semibold text-slate-700">
              Ürünü Düzenle <span className="font-normal text-slate-400">({form.type.toUpperCase()})</span>
            </div>
          ) : (
            /* Tür seçimi */
            <div className="flex flex-wrap gap-2">
              {(['hosting', 'vps', 'website'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                    form.type === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}

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

          {editId && form.type !== 'website' && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {form.type === 'hosting'
                ? `WHM paketi: ${form.whmPackage || '—'}`
                : `VPS: ${form.serverType || '—'} / ${form.location}`}{' '}
              <span className="text-slate-400">(kuruluşta belirlendi, değiştirilemez)</span>
            </div>
          )}

          {/* Web sitesi paketi — kurulum bedeli + kapsam maddeleri */}
          {form.type === 'website' && (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <div className="text-xs font-semibold text-brand-800">
                Web sitesi yapım paketi — otomatik kurulum yoktur, teslim elle yapılır.
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Tek seferlik kurulum / tasarım bedeli (KDV hariç ₺)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="7500"
                  value={form.setupFee}
                  onChange={(e) => setForm({ ...form, setupFee: e.target.value })}
                  className={`w-full ${inputCls}`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Paket kapsamı — her satıra bir madde, <code>Anahtar: Değer</code> biçiminde
                </span>
                <textarea
                  rows={7}
                  placeholder={'Sayfa sayısı: 8 sayfaya kadar\nTeslim süresi: 15 iş günü\nDahil: Hosting + SSL'}
                  value={form.specsText}
                  onChange={(e) => setForm({ ...form, specsText: e.target.value })}
                  className={`w-full font-mono text-xs ${inputCls}`}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Bu maddeler satış sayfasındaki paket kartında listelenir.
                </span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!editId && form.type === 'website' ? null : !editId &&
              (form.type === 'hosting' ? (
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
              ))}
            <input
              required
              type="number"
              step="0.01"
              placeholder={
                form.type === 'website' ? 'Aylık bakım bedeli (TL)' : 'Aylık fiyat (TL)'
              }
              value={form.priceMonthly}
              onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
              className={inputCls}
            />
            <input
              type="number"
              step="0.01"
              placeholder={
                form.type === 'website'
                  ? 'Yıllık bakım bedeli (TL, opsiyonel)'
                  : 'Yıllık fiyat (TL, opsiyonel)'
              }
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
          {form.type === 'vps' && !editId && (
            <p className="text-xs text-amber-600">
              Not: VPS siparişi ödeme onayında gerçek Hetzner sunucusu oluşturur (ücretli).
            </p>
          )}
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {editId ? 'Güncelle' : 'Kaydet'}
            </button>
            {editId && (
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                İptal
              </button>
            )}
          </div>
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
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => startEdit(p)}
                        className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-50"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
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
