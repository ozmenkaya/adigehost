import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  identityType: 'individual' | 'corporate';
  taxNumber: string | null;
  taxOffice: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
}

const STATUS_BADGE: Record<Client['status'], string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};

type ClientForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identityType: 'individual' | 'corporate';
  company: string;
  taxNumber: string;
  taxOffice: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
};

const EMPTY_CLIENT: ClientForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  identityType: 'individual',
  company: '',
  taxNumber: '',
  taxOffice: '',
  address: '',
  city: '',
  district: '',
  postalCode: '',
};

function toForm(c: Client): ClientForm {
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    identityType: c.identityType ?? 'individual',
    company: c.company ?? '',
    taxNumber: c.taxNumber ?? '',
    taxOffice: c.taxOffice ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    district: c.district ?? '',
    postalCode: c.postalCode ?? '',
  };
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<ClientForm>({ ...EMPTY_CLIENT });

  const [editing, setEditing] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState<ClientForm>({ ...EMPTY_CLIENT });
  const [viewing, setViewing] = useState<Client | null>(null);

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

  const openEdit = (c: Client) => {
    setError('');
    setMsg('');
    setEditing(c);
    setEditForm(toForm(c));
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError('');
    try {
      await api.put(`/admin/clients/${editing.id}`, editForm);
      setMsg('Müşteri güncellendi.');
      setEditing(null);
      load(search);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const removeClient = async (c: Client) => {
    if (!window.confirm(`${c.firstName} ${c.lastName} kalıcı olarak silinsin mi?`)) return;
    setError('');
    setMsg('');
    try {
      await api.delete(`/admin/clients/${c.id}`);
      setMsg('Müşteri silindi.');
      load(search);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const sf = (k: keyof ClientForm, v: string) => setForm((s) => ({ ...s, [k]: v }));
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
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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
            <input
              placeholder="Vergi Dairesi"
              value={form.taxOffice}
              onChange={(e) => sf('taxOffice', e.target.value)}
              className={inp}
            />
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
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setViewing(c)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100"
                      >
                        Gör
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => toggleSuspend(c)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100"
                      >
                        {c.status === 'suspended' ? 'Aktifleştir' : 'Askıya Al'}
                      </button>
                      <button
                        onClick={() => removeClient(c)}
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

      {/* Görüntüleme modalı */}
      {viewing && (
        <Modal title="Müşteri Detayı" onClose={() => setViewing(null)}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="Ad Soyad" value={`${viewing.firstName} ${viewing.lastName}`} />
            <Row label="E-posta" value={viewing.email} />
            <Row label="Telefon" value={viewing.phone} />
            <Row
              label="Tip"
              value={viewing.identityType === 'corporate' ? 'Kurumsal' : 'Bireysel'}
            />
            {viewing.identityType === 'corporate' && <Row label="Firma" value={viewing.company} />}
            <Row
              label={viewing.identityType === 'corporate' ? 'VKN' : 'TCKN'}
              value={viewing.taxNumber}
            />
            <Row label="Vergi Dairesi" value={viewing.taxOffice} />
            <Row label="Adres" value={viewing.address} full />
            <Row
              label="İl / İlçe"
              value={[viewing.city, viewing.district].filter(Boolean).join(' / ')}
            />
            <Row label="Posta Kodu" value={viewing.postalCode} />
            <Row label="Durum" value={viewing.status} />
            <Row label="Kayıt" value={new Date(viewing.createdAt).toLocaleString('tr-TR')} />
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                const c = viewing;
                setViewing(null);
                openEdit(c);
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              Düzenle
            </button>
            <button
              onClick={() => setViewing(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Kapat
            </button>
          </div>
        </Modal>
      )}

      {/* Düzenleme modalı */}
      {editing && (
        <Modal title="Müşteriyi Düzenle" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Ad"
                value={editForm.firstName}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                className={inp}
              />
              <input
                required
                placeholder="Soyad"
                value={editForm.lastName}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                className={inp}
              />
              <input
                required
                type="email"
                placeholder="E-posta"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className={inp}
              />
              <input
                placeholder="Telefon"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className={inp}
              />
            </div>
            <div className="flex gap-4 text-sm">
              {(['individual', 'corporate'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={editForm.identityType === t}
                    onChange={() => setEditForm({ ...editForm, identityType: t })}
                  />
                  {t === 'individual' ? 'Bireysel' : 'Kurumsal'}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editForm.identityType === 'corporate' && (
                <input
                  placeholder="Firma Ünvanı"
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  className={inp}
                />
              )}
              <input
                placeholder={editForm.identityType === 'corporate' ? 'VKN' : 'TCKN'}
                value={editForm.taxNumber}
                onChange={(e) =>
                  setEditForm({ ...editForm, taxNumber: e.target.value.replace(/\D/g, '') })
                }
                className={inp}
              />
              <input
                placeholder="Vergi Dairesi"
                value={editForm.taxOffice}
                onChange={(e) => setEditForm({ ...editForm, taxOffice: e.target.value })}
                className={inp}
              />
            </div>
            <input
              placeholder="Adres"
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              className={`w-full ${inp}`}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                placeholder="İl"
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                className={inp}
              />
              <input
                placeholder="İlçe"
                value={editForm.district}
                onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}
                className={inp}
              />
              <input
                placeholder="Posta Kodu"
                value={editForm.postalCode}
                onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                className={inp}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                Kaydet
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-xs uppercase text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value || '—'}</dd>
    </div>
  );
}
