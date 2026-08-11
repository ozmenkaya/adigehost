import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import PageBackdrop from '../../components/shop/PageBackdrop';
import AuthCard from '../../components/auth/AuthCard';
import AuthPanel from '../../components/auth/AuthPanel';

/**
 * Tek ekranlı giriş/kayıt — /login (ve /register aynı sayfaya yönlenir).
 * Müşteri e-posta + şifre girer; hesabı yoksa aynı ekrandan oluşturur.
 */
export default function Login() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);

  // Zaten girişliyse uygun yere yönlendir
  useEffect(() => {
    if (isAuthenticated) navigate(role === 'admin' ? '/admin' : '/app', { replace: true });
  }, [isAuthenticated, role, navigate]);

  return (
    <PageBackdrop>
      <AuthCard subtitle="Giriş Yapın veya Hesap Oluşturun">
        <AuthPanel submitLabel="Devam Et" />
      </AuthCard>
    </PageBackdrop>
  );
}
