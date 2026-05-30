import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  identityType: 'individual' | 'corporate';
  company: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
}

export default function Profile() {
  const [p, setP] = useState<Profile | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/users/me')
      .then((res) => setP(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!p) return;
    setMsg('');
    setError('');
    try {
      await api.put('/users/me', {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        identityType: p.identityType,
        company: p.company,
        taxNumber: p.taxNumber,
        taxOffice: p.taxOffice,
        address: p.address,
        city: p.city,
        district: p.district,
        postalCode: p.postalCode,
      });
      setMsg('Profil güncellendi');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  if (!p) return <div className="text-slate-500">Yükleniyor…</div>;
  const corp = p.identityType === 'corporate';
  const set = (k: keyof Profile, v: string) => setP({ ...p, [k]: v });

  const field = (label: string, key: keyof Profile, disabled = false) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        disabled={disabled}
        value={(p[key] as string) ?? ''}
        onChange={(e) => set(key, e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Profil & Fatura Bilgileri</h1>
      <p className="text-sm text-slate-500">
        Fatura bilgileriniz e-fatura/e-arşiv kesiminde kullanılır. Eksiksiz olması önemlidir.
      </p>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          {field('Ad', 'firstName')}
          {field('Soyad', 'lastName')}
          {field('E-posta', 'email', true)}
          {field('Telefon', 'phone')}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-3 flex gap-4 text-sm">
            {(['individual', 'corporate'] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={p.identityType === t}
                  onChange={() => set('identityType', t)}
                />
                {t === 'individual' ? 'Bireysel' : 'Kurumsal'}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {corp && field('Firma Ünvanı', 'company')}
            {field(corp ? 'VKN' : 'TCKN', 'taxNumber')}
            {corp && field('Vergi Dairesi', 'taxOffice')}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          {field('Adres', 'address')}
          <div className="mt-4 grid grid-cols-3 gap-4">
            {field('İl', 'city')}
            {field('İlçe', 'district')}
            {field('Posta Kodu', 'postalCode')}
          </div>
        </div>

        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Kaydet
        </button>
      </form>
    </div>
  );
}
