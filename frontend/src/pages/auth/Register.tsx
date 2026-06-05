import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  identityType: 'individual' as 'individual' | 'corporate',
  taxNumber: '',
  taxOffice: '',
  company: '',
  address: '',
  city: '',
  district: '',
  postalCode: '',
};

export default function Register() {
  const navigate = useNavigate();
  const [f, setF] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const corporate = f.identityType === 'corporate';
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', f);
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-bold text-green-700">Kaydınız alındı</h1>
          <p className="mt-2 text-sm text-slate-600">
            E-posta adresinize doğrulama linki gönderildi. Doğruladıktan sonra giriş yapabilirsiniz.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Giriş sayfasına dön
          </button>
        </div>
      </div>
    );
  }

  const inp =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-4">
          <Link to="/" className="text-sm text-slate-500 hover:text-brand-600">
            ← Anasayfaya Dön
          </Link>
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-700">AdigeHost</h1>
          <p className="mt-1 text-sm text-slate-500">Yeni Hesap Oluştur</p>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Ad"
              value={f.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              className={inp}
            />
            <input
              required
              placeholder="Soyad"
              value={f.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              className={inp}
            />
          </div>
          <input
            required
            type="email"
            placeholder="E-posta"
            value={f.email}
            onChange={(e) => set('email', e.target.value)}
            className={inp}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="password"
              placeholder="Şifre (min 8)"
              value={f.password}
              onChange={(e) => set('password', e.target.value)}
              className={inp}
            />
            <input
              placeholder="Telefon"
              value={f.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={inp}
            />
          </div>

          {/* Fatura bilgileri */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-sm font-medium text-slate-700">Fatura Bilgileri</div>
            <div className="mb-3 flex gap-4 text-sm">
              {(['individual', 'corporate'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={f.identityType === t}
                    onChange={() => set('identityType', t)}
                  />
                  {t === 'individual' ? 'Bireysel' : 'Kurumsal'}
                </label>
              ))}
            </div>
            <div className="space-y-3">
              {corporate && (
                <input
                  placeholder="Firma Ünvanı"
                  value={f.company}
                  onChange={(e) => set('company', e.target.value)}
                  className={inp}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder={corporate ? 'VKN (10 hane)' : 'TCKN (11 hane)'}
                  value={f.taxNumber}
                  onChange={(e) => set('taxNumber', e.target.value.replace(/\D/g, ''))}
                  className={inp}
                />
                {corporate && (
                  <input
                    placeholder="Vergi Dairesi"
                    value={f.taxOffice}
                    onChange={(e) => set('taxOffice', e.target.value)}
                    className={inp}
                  />
                )}
              </div>
              <input
                placeholder="Adres"
                value={f.address}
                onChange={(e) => set('address', e.target.value)}
                className={inp}
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  placeholder="İl"
                  value={f.city}
                  onChange={(e) => set('city', e.target.value)}
                  className={inp}
                />
                <input
                  placeholder="İlçe"
                  value={f.district}
                  onChange={(e) => set('district', e.target.value)}
                  className={inp}
                />
                <input
                  placeholder="Posta Kodu"
                  value={f.postalCode}
                  onChange={(e) => set('postalCode', e.target.value)}
                  className={inp}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? 'Kaydediliyor…' : 'Hesap Oluştur'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Zaten hesabınız var mı?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Giriş yapın
          </Link>
        </p>
      </div>
    </div>
  );
}
