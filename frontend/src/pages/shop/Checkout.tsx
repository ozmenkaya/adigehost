import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore, type CartItem } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import IyzicoPaymentModal from '../../components/shared/IyzicoPaymentModal';

type Mode = 'login' | 'register';

function tr(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface OrderResult {
  invoice: { invoiceNum: string; total: number; dueDate: string };
  bank: Record<string, string>;
}

export default function Checkout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, login, register } = useAuthStore();
  const { items, total, totalExVat, clear, remove } = useCartStore();
  void user; // user dropdown'da kullanılıyor

  const [mode, setMode] = useState<Mode>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  // Auth form alanları
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Hosting domain alanları (her hosting item için domain sor)
  const [hostingDomains, setHostingDomains] = useState<Record<string, string>>({});

  // Checkout
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const [result, setResult] = useState<OrderResult | null>(null);
  const [iyzicoForm, setIyzicoForm] = useState<string | null>(null);

  // Sepet boşsa anasayfaya
  useEffect(() => {
    if (items.length === 0 && !result) {
      navigate('/');
    }
  }, [items.length, result, navigate]);

  const vat = total() - totalExVat();
  const isLoggedIn = isAuthenticated;

  // Hosting item'ları için domain alanı
  const hostingItems = items.filter((i) => i.type === 'hosting');
  const allHostingDomainsFilled = hostingItems.every(
    (h) => (hostingDomains[h.id] ?? h.domain ?? '').trim().length > 3,
  );

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ firstName, lastName, email, password, phone });
      }
    } catch (err) {
      setAuthError(getApiErrorMessage(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const placeOrder = async (method: 'havale' | 'iyzico') => {
    if (!isLoggedIn) return;
    if (!allHostingDomainsFilled) {
      setPlaceError('Lütfen her hosting paketi için domain adı girin');
      return;
    }
    setPlacing(true);
    setPlaceError('');
    try {
      // 1) Sipariş oluştur (her iki yöntem için ortak)
      const payload = {
        items: items.map((i) => ({
          type: i.type,
          productId: i.productId,
          domain: i.type === 'hosting' ? hostingDomains[i.id] : i.domain,
          billingCycle: i.billingCycle,
          period: i.period,
        })),
      };
      const r = await api.post('/cart/checkout', payload);
      const orderData = r.data.data;
      clear();

      if (method === 'iyzico') {
        // 2a) İyzico checkout form başlat → sayfa içinde modal aç
        const initRes = await api.post('/payments/iyzico/init', {
          invoiceId: orderData.invoice.id,
        });
        const formContent = initRes.data.data?.checkoutFormContent as string | undefined;
        if (!formContent) {
          // Fallback: yine de URL'e yönlendir
          const url = initRes.data.data?.paymentPageUrl as string | undefined;
          if (url) {
            window.location.href = url;
            return;
          }
          setPlaceError('İyzico ödeme sayfası alınamadı, lütfen havale ile deneyin');
          return;
        }
        setIyzicoForm(formContent);
        return;
      }

      // 2b) Havale: sonuç ekranı göster
      setResult(orderData);
    } catch (err) {
      setPlaceError(getApiErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  };

  // Sipariş tamamlandı ekranı
  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-3xl bg-white shadow-xl p-8 text-center">
            <div className="text-5xl mb-3"></div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Siparişiniz Alındı!</h1>
            <p className="text-slate-600 mb-6">
              <b>{result.invoice.invoiceNum}</b>· Toplam
              <b className="text-brand-700">{tr(Number(result.invoice.total))} ₺</b>
            </p>

            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-left mb-6">
              <div className="font-bold text-amber-900 mb-3">Havale / EFT Bilgileri</div>
              <div className="text-sm text-amber-800 space-y-1">
                {result.bank.bank_name && (
                  <div>
                    <b>Banka:</b>
                    {result.bank.bank_name}
                  </div>
                )}
                {result.bank.bank_account_holder && (
                  <div>
                    <b>Hesap Sahibi:</b>
                    {result.bank.bank_account_holder}
                  </div>
                )}
                {result.bank.bank_iban && (
                  <div className="font-mono">
                    <b>IBAN:</b>
                    {result.bank.bank_iban}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-amber-200 text-xs text-amber-700">
                Açıklamaya<b>{result.invoice.invoiceNum}</b>yazın. Ödemeniz onaylandığında
                hizmetiniz otomatik aktive edilecek.
              </div>
            </div>

            <button
              onClick={() => navigate('/app')}
              className="rounded-xl bg-brand-600 px-8 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Panelime Git →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <a href="/" className="text-2xl font-bold text-brand-700">
            AdigeHost
          </a>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-700">
            ← Alışverişe Devam Et
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 grid lg:grid-cols-3 gap-6">
        {/* SOL: Sepet + Hosting domain */}
        <div className="lg:col-span-2 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Sipariş Özeti</h1>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-100 divide-y">
            {items.map((item) => (
              <CheckoutItem
                key={item.id}
                item={item}
                domainValue={hostingDomains[item.id] ?? ''}
                onDomainChange={(v) => setHostingDomains((m) => ({ ...m, [item.id]: v }))}
                onRemove={() => remove(item.id)}
              />
            ))}
          </div>

          {/* Hosting için bilgi */}
          {hostingItems.length > 0 && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              ℹ Hosting paketleri için kuracağınız<b>alan adını</b>yukarıda belirtin. Henüz
              domain'iniz yoksa, sepete domain ekleyebilirsiniz.
            </div>
          )}
        </div>

        {/* SAĞ: Auth + Toplam */}
        <div className="space-y-4">
          {/* Toplam */}
          <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-5 sticky top-4">
            <h2 className="font-bold text-slate-800 mb-4">Ödeme</h2>

            <div className="space-y-2 text-sm pb-4 border-b border-slate-100">
              <div className="flex justify-between text-slate-600">
                <span>Ara toplam ({items.length} kalem)</span>
                <span>{tr(totalExVat())} ₺</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>KDV %20</span>
                <span>{tr(vat)} ₺</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline py-4">
              <span className="font-bold text-slate-900">Toplam</span>
              <span className="text-2xl font-extrabold text-brand-700">{tr(total())} ₺</span>
            </div>

            {/* Auth gate */}
            {!isLoggedIn ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="flex gap-1 mb-4 rounded-lg bg-white p-1">
                  <button
                    onClick={() => setMode('login')}
                    className={`flex-1 rounded py-1.5 text-xs font-medium ${
                      mode === 'login' ? 'bg-brand-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Giriş Yap
                  </button>
                  <button
                    onClick={() => setMode('register')}
                    className={`flex-1 rounded py-1.5 text-xs font-medium ${
                      mode === 'register' ? 'bg-brand-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Kayıt Ol
                  </button>
                </div>

                <form onSubmit={handleAuth} className="space-y-2">
                  {mode === 'register' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          placeholder="Ad"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
                        />
                        <input
                          required
                          placeholder="Soyad"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
                        />
                      </div>
                      <input
                        placeholder="Telefon"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
                      />
                    </>
                  )}
                  <input
                    required
                    type="email"
                    placeholder="E-posta"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
                  />
                  <input
                    required
                    type="password"
                    placeholder="Şifre (en az 8 karakter)"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
                  />
                  {authError && <div className="text-xs text-red-600">{authError}</div>}
                  <button
                    disabled={authBusy}
                    className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {authBusy
                      ? '…'
                      : mode === 'login'
                        ? 'Giriş Yap ve Devam Et'
                        : 'Kayıt Ol ve Devam Et'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  <b>
                    {user?.firstName} {user?.lastName}
                  </b>
                  olarak giriş yaptınız
                </div>
                {placeError && (
                  <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{placeError}</div>
                )}

                <div className="text-xs font-medium text-slate-600 uppercase tracking-wider text-center mb-1">
                  Ödeme Yöntemi Seçin
                </div>

                {/* Kart ile öde (iyzico) */}
                <button
                  onClick={() => placeOrder('iyzico')}
                  disabled={placing || items.length === 0}
                  className="w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {placing ? '…' : <>Kredi Kartı ile Öde</>}
                </button>
                <p className="text-xs text-center text-slate-500 -mt-1">
                  iyzico güvencesiyle • 3D Secure • Anında aktivasyon
                </p>

                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">VEYA</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Havale ile öde */}
                <button
                  onClick={() => placeOrder('havale')}
                  disabled={placing || items.length === 0}
                  className="w-full rounded-xl bg-amber-500 py-3 text-base font-bold text-white hover:bg-amber-600 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {placing ? '…' : 'Havale / EFT ile Öde'}
                </button>
                <p className="text-xs text-center text-slate-500 -mt-1">
                  IBAN bilgilerini göreceksiniz • Ödeme onayı sonrası aktivasyon
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* İyzico ödeme modalı */}
      <IyzicoPaymentModal
        open={iyzicoForm !== null}
        checkoutFormContent={iyzicoForm ?? ''}
        onClose={() => setIyzicoForm(null)}
      />
    </div>
  );
}

function CheckoutItem({
  item,
  domainValue,
  onDomainChange,
  onRemove,
}: {
  item: CartItem;
  domainValue: string;
  onDomainChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-slate-800">{item.name}</div>
          {item.billingCycle && (
            <div className="text-xs text-slate-500 mt-0.5">
              Periyot: {item.billingCycle === 'annually' ? 'Yıllık' : 'Aylık'}
            </div>
          )}
          <div className="text-xs text-slate-400 mt-0.5">KDV hariç {tr(item.priceExVat)} ₺</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-slate-900">{tr(item.price)} ₺</div>
          <button onClick={onRemove} className="mt-1 text-xs text-red-500 hover:text-red-700">
            Kaldır
          </button>
        </div>
      </div>

      {/* Hosting için domain alanı */}
      {item.type === 'hosting' && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Hosting alan adı<span className="text-red-500">*</span>
          </label>
          <input
            value={domainValue}
            onChange={(e) => onDomainChange(e.target.value.toLowerCase().trim())}
            placeholder="ornek.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>
      )}
    </div>
  );
}
