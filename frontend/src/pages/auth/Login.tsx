import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/api';

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        {/* Anasayfaya dön */}
        <div className="mb-4">
          <Link to="/" className="text-sm text-slate-500 hover:text-brand-600">
            ← Anasayfaya Dön
          </Link>
        </div>
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-700">AdigeHost</h1>
          <p className="mt-1 text-sm text-slate-500">Müşteri Paneli Girişi</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-posta</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="ornek@adigehost.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Şifre</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Hesabınız yok mu?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Kayıt olun
          </Link>
        </p>
      </div>
    </div>
  );
}
