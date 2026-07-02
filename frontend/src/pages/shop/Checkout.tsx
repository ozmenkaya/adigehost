import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import { useCartStore, type CartItem } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import IyzicoPaymentModal from '../../components/shared/IyzicoPaymentModal';
import PageBackdrop from '../../components/shop/PageBackdrop';
import ShopHeader from '../../components/shop/ShopHeader';

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
        items: items.map((i) => {
          const base: Record<string, unknown> = {
            type: i.type,
            productId: i.productId,
            domain: i.type === 'hosting' ? hostingDomains[i.id] : i.domain,
            billingCycle: i.billingCycle,
            period: i.period,
          };
          if (i.type === 'vps' && i.meta) {
            base.vpsServerType = i.meta.serverType;
            base.vpsLocation = i.meta.location;
            base.vpsImage = i.meta.image;
            base.vpsWithIpv4 = i.meta.withIpv4;
            base.vpsHostname = i.domain; // hostname domain alanında tutuluyor
            base.vpsSshKey = i.meta.sshKey;
            base.vpsBackups = i.meta.backups;
            base.vpsUserData = i.meta.userData;
          }
          return base;
        }),
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
      <PageBackdrop>
        <div className="px-4 py-16">
          <div className="mx-auto max-w-2xl">
            <div className="glass animate-fade-up rounded-3xl p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-500/20 ring-1 ring-emerald-400/40">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m4 12 5 5L20 6" />
                </svg>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-white">Siparişiniz Alındı!</h1>
              <p className="mb-6 text-slate-400">
                <b className="text-slate-200">{result.invoice.invoiceNum}</b> · Toplam{' '}
                <b className="text-brand-300">{tr(Number(result.invoice.total))} ₺</b>
              </p>

              <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5 text-left">
                <div className="mb-3 font-bold text-amber-200">Havale / EFT Bilgileri</div>
                <div className="space-y-1 text-sm text-amber-100/90">
                  {result.bank.bank_name && (
                    <div><b>Banka:</b> {result.bank.bank_name}</div>
                  )}
                  {result.bank.bank_account_holder && (
                    <div><b>Hesap Sahibi:</b> {result.bank.bank_account_holder}</div>
                  )}
                  {result.bank.bank_iban && (
                    <div className="font-mono"><b>IBAN:</b> {result.bank.bank_iban}</div>
                  )}
                </div>
                <div className="mt-3 border-t border-amber-400/20 pt-3 text-xs text-amber-200/80">
                  Açıklamaya <b>{result.invoice.invoiceNum}</b> yazın. Ödemeniz onaylandığında
                  hizmetiniz otomatik aktive edilecek.
                </div>
              </div>

              <button onClick={() => navigate('/app')} className="btn-neon">
                Panelime Git →
              </button>
            </div>
          </div>
        </div>
      </PageBackdrop>
    );
  }

  return (
    <PageBackdrop>
      <ShopHeader back={{ label: '← Alışverişe Devam Et', to: '/' }} />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-3">
        {/* SOL: Sepet + Hosting domain */}
        <div className="space-y-4 lg:col-span-2">
          <h1 className="text-2xl font-bold text-white">Sipariş Özeti</h1>

          <div className="glass divide-y divide-white/10 rounded-2xl">
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
            <div className="rounded-xl border border-brand-400/25 bg-brand-500/[0.08] p-3 text-sm text-brand-100">
              ℹ Hosting paketleri için kuracağınız <b>alan adını</b> yukarıda belirtin. Henüz
              domain'iniz yoksa, sepete domain ekleyebilirsiniz.
            </div>
          )}
        </div>

        {/* SAĞ: Auth + Toplam */}
        <div className="space-y-4">
          {/* Toplam */}
          <div className="glass sticky top-24 rounded-2xl p-5">
            <h2 className="mb-4 font-bold text-white">Ödeme</h2>

            <div className="space-y-2 border-b border-white/10 pb-4 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Ara toplam ({items.length} kalem)</span>
                <span>{tr(totalExVat())} ₺</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>KDV %20</span>
                <span>{tr(vat)} ₺</span>
              </div>
            </div>

            <div className="flex items-baseline justify-between py-4">
              <span className="font-bold text-white">Toplam</span>
              <span className="text-2xl font-extrabold text-brand-300">{tr(total())} ₺</span>
            </div>

            {/* Auth gate */}
            {!isLoggedIn ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex gap-1 rounded-lg bg-night-900/60 p-1">
                  <button
                    onClick={() => setMode('login')}
                    className={`flex-1 rounded py-1.5 text-xs font-medium transition ${
                      mode === 'login' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Giriş Yap
                  </button>
                  <button
                    onClick={() => setMode('register')}
                    className={`flex-1 rounded py-1.5 text-xs font-medium transition ${
                      mode === 'register' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
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
                          className="field text-sm"
                        />
                        <input
                          required
                          placeholder="Soyad"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="field text-sm"
                        />
                      </div>
                      <input
                        placeholder="Telefon"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="field text-sm"
                      />
                    </>
                  )}
                  <input
                    required
                    type="email"
                    placeholder="E-posta"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field text-sm"
                  />
                  <input
                    required
                    type="password"
                    placeholder="Şifre (en az 8 karakter)"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field text-sm"
                  />
                  {authError && <div className="text-xs text-red-300">{authError}</div>}
                  <button disabled={authBusy} className="btn-neon w-full text-sm disabled:opacity-60">
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
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  <b>
                    {user?.firstName} {user?.lastName}
                  </b>{' '}
                  olarak giriş yaptınız
                </div>
                {placeError && (
                  <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-300">
                    {placeError}
                  </div>
                )}

                <div className="mb-1 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Ödeme Yöntemi Seçin
                </div>

                {/* Kart ile öde (iyzico) */}
                <button
                  onClick={() => placeOrder('iyzico')}
                  disabled={placing || items.length === 0}
                  className="btn-neon flex w-full items-center justify-center gap-2 text-base disabled:opacity-60"
                >
                  {placing ? '…' : <>Kredi Kartı ile Öde</>}
                </button>
                <p className="-mt-1 text-center text-xs text-slate-500">
                  iyzico güvencesiyle • 3D Secure • Anında aktivasyon
                </p>

                <div className="my-1 flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-slate-500">VEYA</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                {/* Havale ile öde */}
                <button
                  onClick={() => placeOrder('havale')}
                  disabled={placing || items.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-base font-bold text-slate-900 shadow-[0_10px_30px_-10px_rgba(251,191,36,0.7)] transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {placing ? '…' : 'Havale / EFT ile Öde'}
                </button>
                <p className="-mt-1 text-center text-xs text-slate-500">
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
    </PageBackdrop>
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
          <div className="font-medium text-white">{item.name}</div>
          {item.billingCycle && (
            <div className="mt-0.5 text-xs text-slate-400">
              Periyot: {item.billingCycle === 'annually' ? 'Yıllık' : 'Aylık'}
            </div>
          )}
          <div className="mt-0.5 text-xs text-slate-500">KDV hariç {tr(item.priceExVat)} ₺</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-white">{tr(item.price)} ₺</div>
          <button onClick={onRemove} className="mt-1 text-xs text-red-400 hover:text-red-300">
            Kaldır
          </button>
        </div>
      </div>

      {/* Hosting için domain alanı */}
      {item.type === 'hosting' && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Hosting alan adı<span className="text-red-400">*</span>
          </label>
          <input
            value={domainValue}
            onChange={(e) => onDomainChange(e.target.value.toLowerCase().trim())}
            placeholder="ornek.com"
            className="field text-sm"
            required
          />
        </div>
      )}
    </div>
  );
}
