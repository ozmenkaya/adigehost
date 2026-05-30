import { type FormEvent, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  city: string | null;
  taxNumber: string | null;
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
        company: p.company,
        city: p.city,
        taxNumber: p.taxNumber,
      });
      setMsg('Profil güncellendi');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  if (!p) return <div className="text-slate-500">Yükleniyor…</div>;

  const field = (label: string, key: keyof Profile, disabled = false) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        disabled={disabled}
        value={p[key] ?? ''}
        onChange={(e) => setP({ ...p, [key]: e.target.value })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Profil</h1>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <form
        onSubmit={save}
        className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        {field('Ad', 'firstName')}
        {field('Soyad', 'lastName')}
        {field('E-posta', 'email', true)}
        {field('Telefon', 'phone')}
        {field('Firma', 'company')}
        {field('Şehir', 'city')}
        {field('Vergi No / TCKN', 'taxNumber')}
        <div className="col-span-2">
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
