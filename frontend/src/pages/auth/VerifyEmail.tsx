import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import PageBackdrop from '../../components/shop/PageBackdrop';
import AuthCard from '../../components/auth/AuthCard';

/**
 * E-posta doğrulama — /verify-email?token=…
 * Kayıt sonrası gönderilen linkin açtığı sayfa. Hesap zaten aktif olduğu için
 * doğrulama giriş/satın alma için zorunlu değildir; bu sayfa yalnızca
 * e-postayı "doğrulanmış" olarak işaretler.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'busy' | 'ok' | 'fail'>(token ? 'busy' : 'fail');
  const [error, setError] = useState('Doğrulama linki geçersiz görünüyor.');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // StrictMode'da iki kez tetiklenmesin — token tek kullanımlık
    api
      .post('/auth/verify-email', { token })
      .then(() => setState('ok'))
      .catch((err) => {
        setError(getApiErrorMessage(err));
        setState('fail');
      });
  }, [token]);

  return (
    <PageBackdrop>
      <AuthCard subtitle="E-posta Doğrulama">
        {state === 'busy' && (
          <p className="text-center text-sm text-slate-300">E-postanız doğrulanıyor…</p>
        )}

        {state === 'ok' && (
          <>
            <p className="text-center text-sm leading-relaxed text-slate-300">
              E-posta adresiniz doğrulandı. Teşekkürler!
            </p>
            <Link to="/app" className="btn-neon mt-6 block text-center">
              Panele git
            </Link>
          </>
        )}

        {state === 'fail' && (
          <>
            <p className="text-center text-sm leading-relaxed text-red-300">{error}</p>
            <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
              Hesabınız yine de aktiftir — doğrulama giriş yapmak için zorunlu değildir.
            </p>
            <Link to="/login" className="btn-neon mt-6 block text-center">
              Giriş sayfasına dön
            </Link>
          </>
        )}
      </AuthCard>
    </PageBackdrop>
  );
}
