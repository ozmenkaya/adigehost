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

const EMPTY_CLIENT = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  identityType: 'individual' as 'individual' | 'corporate',
  company: '',
  taxNumber: '',
  taxOffice: '',
  address: '',
  city: '',
  district: '',
  postalCode: '',
};

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CLIENT });
  const [msg, setMsg] = useState('');

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

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const res = await api.post('/admin/clients', form);
      const pw = res.data.generatedPassword;
      setMsg(pw ? `Müşteri eklendi. Geçici şifre: ${pw}` : 'Müşteri eklendi.');
      setForm({ ...EMPTY_CLIENT });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const sf = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const corp = form.identityType === 'corporate';
  const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Müşteriler</h1>
        <div className="flex gap-2">
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
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              Ara
            </button>
          </form>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
          >
            {showAdd ? 'Kapat' : '+ Müşteri Ekle'}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}

      {showAdd && (
        <form
          onSubmit={createClient}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Ad"
              value={form.firstName}
              onChange={(e) => sf('firstName', e.target.value)}
              className={inp}
            />
            <input
              required
              placeholder="Soyad"
              value={form.lastName}
              onChange={(e) => sf('lastName', e.target.value)}
              className={inp}
            />
            <input
              required
              type="email"
              placeholder="E-posta"
              value={form.email}
              onChange={(e) => sf('email', e.target.value)}
              className={inp}
            />
            <input
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) => sf('phone', e.target.value)}
              className={inp}
            />
          </div>
          <div className="flex gap-4 text-sm">
            {(['individual', 'corporate'] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={form.identityType === t}
                  onChange={() => sf('identityType', t)}
                />
                {t === 'individual' ? 'Bireysel' : 'Kurumsal'}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {corp && (
              <input
                placeholder="Firma Ünvanı"
                value={form.company}
                onChange={(e) => sf('company', e.target.value)}
                className={inp}
              />
            )}
            <input
              placeholder={corp ? 'VKN' : 'TCKN'}
              value={form.taxNumber}
              onChange={(e) => sf('taxNumber', e.target.value.replace(/\D/g, ''))}
              className={inp}
            />
            {corp && (
              <input
                placeholder="Vergi Dairesi"
                value={form.taxOffice}
                onChange={(e) => sf('taxOffice', e.target.value)}
                className={inp}
              />
            )}
          </div>
          <input
            placeholder="Adres"
            value={form.address}
            onChange={(e) => sf('address', e.target.value)}
            className={`w-full ${inp}`}
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              placeholder="İl"
              value={form.city}
              onChange={(e) => sf('city', e.target.value)}
              className={inp}
            />
            <input
              placeholder="İlçe"
              value={form.district}
              onChange={(e) => sf('district', e.target.value)}
              className={inp}
            />
            <input
              placeholder="Posta Kodu"
              value={form.postalCode}
              onChange={(e) => sf('postalCode', e.target.value)}
              className={inp}
            />
          </div>
          <button className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Kaydet (geçici şifre üretilir)
          </button>
        </form>
      )}

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
