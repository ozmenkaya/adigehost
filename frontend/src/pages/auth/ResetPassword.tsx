import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import PageBackdrop from '../../components/shop/PageBackdrop';
import AuthCard from '../../components/auth/AuthCard';

/**
 * Şifre sıfırlama — /reset-password?token=…
 * Token, NotificationService'in gönderdiği e-posta linkinden gelir.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <PageBackdrop>
        <AuthCard subtitle="Şifre Sıfırlama">
          <p className="text-center text-sm leading-relaxed text-slate-300">
            Sıfırlama linki geçersiz görünüyor. Lütfen yeni bir link talep edin.
          </p>
          <Link to="/forgot-password" className="btn-neon mt-6 block text-center">
            Yeni link iste
          </Link>
        </AuthCard>
      </PageBackdrop>
    );
  }

  if (done) {
    return (
      <PageBackdrop>
        <AuthCard subtitle="Şifre Sıfırlama">
          <p className="text-center text-sm leading-relaxed text-slate-300">
            Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
          </p>
          <button onClick={() => navigate('/login')} className="btn-neon mt-6 w-full">
            Giriş Yap
          </button>
        </AuthCard>
      </PageBackdrop>
    );
  }

  return (
    <PageBackdrop>
      <AuthCard subtitle="Yeni Şifre Belirleyin">
        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Yeni şifre</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="En az 8 karakter"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Yeni şifre (tekrar)
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="field"
              placeholder="Şifrenizi tekrar girin"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-neon w-full disabled:opacity-60">
            {busy ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
          </button>
        </form>
      </AuthCard>
    </PageBackdrop>
  );
}
