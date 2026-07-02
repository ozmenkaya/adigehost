import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/api';
import PageBackdrop from '../../components/shop/PageBackdrop';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Zaten girişliyse uygun yere yönlendir
  useEffect(() => {
    if (isAuthenticated) navigate(role === 'admin' ? '/admin' : '/app', { replace: true });
  }, [isAuthenticated, role, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      // login() sonrası state güncellenir, useEffect doğru yere yönlendirir
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  return (
    <PageBackdrop>
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8">
          {/* Anasayfaya dön */}
          <div className="mb-6">
            <Link to="/" className="text-sm text-slate-400 transition hover:text-white">
              ← Anasayfaya Dön
            </Link>
          </div>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-neon-violet text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.9)]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 3 20h18L12 3Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">
              ADIGE<span className="font-light text-slate-400">HOST</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">Müşteri Paneli Girişi</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">E-posta</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="ornek@adigehost.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Şifre</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-neon w-full disabled:opacity-60">
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-400">
            Hesabınız yok mu?{' '}
            <Link to="/register" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
              Kayıt olun
            </Link>
          </p>
        </div>
      </div>
    </PageBackdrop>
  );
}
