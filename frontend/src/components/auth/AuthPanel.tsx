import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

/**
 * Tek ekranlı giriş/kayıt paneli.
 *
 * Akış: e-posta + şifre girilir → doğrudan /auth/login denenir.
 *  - Başarılı → onSuccess()
 *  - 401      → "hesabınız yoksa oluşturun" teklifi açılır (Ad/Soyad istenir)
 *
 * Sunucuya "bu e-posta kayıtlı mı?" diye ayrı bir soru sorulmaz; bu yüzden
 * e-posta enumerasyonu sızıntısı oluşmaz. Fatura bilgileri kayıt anında
 * istenmez — satın alma sırasında checkout'ta toplanır.
 */
export default function AuthPanel({
  onSuccess,
  compact = false,
  submitLabel = 'Devam Et',
}: {
  onSuccess?: () => void;
  /** Checkout kenar çubuğu gibi dar alanlar için küçültülmüş yerleşim. */
  compact?: boolean;
  submitLabel?: string;
}) {
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<'credentials' | 'newAccount'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** 401 sonrası "hesap oluştur" teklifini göster. */
  const [offerSignup, setOfferSignup] = useState(false);

  const inp = compact ? 'field text-sm' : 'field';

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOfferSignup(false);
    setBusy(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        // Şifre yanlış da olabilir, hesap hiç olmayabilir de — ayırt etmiyoruz.
        setError('E-posta veya şifre hatalı.');
        setOfferSignup(true);
      } else {
        setError(getApiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitNewAccount = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/register', { firstName, lastName, email, password });
      // Kayıt uç noktası oturum açmaz; hemen ardından giriş yapıyoruz.
      await login(email, password);
      onSuccess?.();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        setError('Bu e-posta zaten kayıtlı. Şifrenizi kontrol edin veya sıfırlayın.');
        setStep('credentials');
        setOfferSignup(false);
      } else {
        setError(getApiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  if (step === 'newAccount') {
    return (
      <form onSubmit={submitNewAccount} className={compact ? 'space-y-2' : 'space-y-4'}>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
          Yeni hesap: <span className="font-medium text-slate-200">{email}</span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3'}>
          <input
            required
            minLength={2}
            placeholder="Ad"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inp}
          />
          <input
            required
            minLength={2}
            placeholder="Soyad"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inp}
          />
        </div>

        <button type="submit" disabled={busy} className="btn-neon w-full disabled:opacity-60">
          {busy ? 'Hesap oluşturuluyor…' : 'Hesabı Oluştur ve Devam Et'}
        </button>

        <button
          type="button"
          onClick={() => {
            setStep('credentials');
            setError('');
          }}
          className="w-full text-center text-xs text-slate-400 transition hover:text-white"
        >
          ← Farklı bir e-posta ile devam et
        </button>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          Fatura bilgilerinizi (TCKN/VKN, adres) satın alma sırasında isteyeceğiz.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className={compact ? 'space-y-2' : 'space-y-4'}>
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div>
        {!compact && (
          <label className="mb-1.5 block text-sm font-medium text-slate-300">E-posta</label>
        )}
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inp}
          placeholder="E-posta"
        />
      </div>

      <div>
        {!compact && (
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Şifre</label>
        )}
        <input
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inp}
          placeholder="Şifre (en az 8 karakter)"
        />
      </div>

      <button type="submit" disabled={busy} className="btn-neon w-full disabled:opacity-60">
        {busy ? 'Kontrol ediliyor…' : submitLabel}
      </button>

      {offerSignup ? (
        <div className="rounded-xl border border-brand-400/25 bg-brand-500/10 p-3">
          <p className="text-xs leading-relaxed text-slate-300">
            Henüz hesabınız yok mu? Girdiğiniz e-posta ve şifre ile hemen oluşturabilirsiniz.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep('newAccount');
              setError('');
            }}
            className="mt-2 w-full rounded-lg border border-brand-400/40 px-3 py-2 text-sm font-semibold text-brand-200 transition hover:bg-brand-500/15"
          >
            Bu e-posta ile hesap oluştur
          </button>
          <Link
            to="/forgot-password"
            className="mt-2 block text-center text-xs text-slate-400 transition hover:text-white"
          >
            Şifremi unuttum
          </Link>
        </div>
      ) : (
        <div className="text-center">
          <Link to="/forgot-password" className="text-xs text-slate-400 transition hover:text-white">
            Şifremi unuttum
          </Link>
        </div>
      )}
    </form>
  );
}
