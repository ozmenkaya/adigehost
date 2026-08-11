import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import PageBackdrop from '../../components/shop/PageBackdrop';
import AuthCard from '../../components/auth/AuthCard';

/**
 * Şifre sıfırlama talebi — /forgot-password
 * Backend e-posta varlığını sızdırmamak için her durumda aynı yanıtı döner,
 * arayüz de aynı şekilde davranır.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <PageBackdrop>
        <AuthCard subtitle="Şifre Sıfırlama">
          <p className="text-center text-sm leading-relaxed text-slate-300">
            E-posta adresiniz kayıtlıysa şifre sıfırlama linki gönderildi. Gelen kutunuzu ve spam
            klasörünüzü kontrol edin.
          </p>
          <Link to="/login" className="btn-neon mt-6 block text-center">
            Giriş sayfasına dön
          </Link>
        </AuthCard>
      </PageBackdrop>
    );
  }

  return (
    <PageBackdrop>
      <AuthCard subtitle="Şifre Sıfırlama">
        <p className="mb-5 text-center text-sm leading-relaxed text-slate-400">
          Hesabınızın e-posta adresini girin, sıfırlama linkini gönderelim.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="E-posta"
          />
          <button type="submit" disabled={busy} className="btn-neon w-full disabled:opacity-60">
            {busy ? 'Gönderiliyor…' : 'Sıfırlama Linki Gönder'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
            ← Giriş sayfasına dön
          </Link>
        </p>
      </AuthCard>
    </PageBackdrop>
  );
}
