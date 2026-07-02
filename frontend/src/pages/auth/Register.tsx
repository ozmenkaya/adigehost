import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import PageBackdrop from '../../components/shop/PageBackdrop';

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
      <PageBackdrop>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-500/20 ring-1 ring-emerald-400/40">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12 5 5L20 6" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">Kaydınız alındı</h1>
            <p className="mt-2 text-sm text-slate-400">
              E-posta adresinize doğrulama linki gönderildi. Doğruladıktan sonra giriş yapabilirsiniz.
            </p>
            <button onClick={() => navigate('/login')} className="btn-neon mt-5">
              Giriş sayfasına dön
            </button>
          </div>
        </div>
      </PageBackdrop>
    );
  }

  const inp = 'field text-sm';

  return (
    <PageBackdrop>
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-xl animate-fade-up rounded-3xl p-8">
          <div className="mb-6">
            <Link to="/" className="text-sm text-slate-400 transition hover:text-white">
              ← Anasayfaya Dön
            </Link>
          </div>
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-neon-violet text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.9)]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 3 20h18L12 3Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">
              ADIGE<span className="font-light text-slate-400">HOST</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">Yeni Hesap Oluştur</p>
          </div>
          {error && (
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 text-sm font-medium text-slate-200">Fatura Bilgileri</div>
            <div className="mb-3 flex gap-4 text-sm text-slate-300">
              {(['individual', 'corporate'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    className="accent-brand-500"
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

          <button type="submit" disabled={loading} className="btn-neon w-full disabled:opacity-60">
            {loading ? 'Kaydediliyor…' : 'Hesap Oluştur'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          Zaten hesabınız var mı?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
            Giriş yapın
          </Link>
        </p>
        </div>
      </div>
    </PageBackdrop>
  );
}
