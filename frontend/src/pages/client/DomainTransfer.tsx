import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';
import IyzicoPaymentModal from '../../components/shared/IyzicoPaymentModal';

interface TransferCheck {
  domain: string;
  transferable: boolean;
  message: string;
  yearlyExVat: number | null;
  yearlyIncVat: number | null;
  vatRate: number;
}

export default function DomainTransfer() {
  const navigate = useNavigate();
  const [domain, setDomain] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [years, setYears] = useState(1);
  const [check, setCheck] = useState<TransferCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ invoiceNum: string; total: number } | null>(null);
  const [iyzicoForm, setIyzicoForm] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);

  const submitCheck = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/public/domains/transfer-check', {
        domain: domain.trim().toLowerCase(),
      });
      setCheck(r.data.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createOrder = async (payMethod: 'iyzico' | 'havale') => {
    if (!authCode || authCode.length < 6) {
      setError('Lütfen geçerli bir EPP/Auth kodu girin');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/domains/transfer-order', {
        domain: domain.trim().toLowerCase(),
        authCode,
        year: years,
      });
      const invoice = r.data.data.invoice;

      if (payMethod === 'iyzico') {
        const initRes = await api.post('/payments/iyzico/init', {
          invoiceId: invoice.id,
          saveCard,
        });
        const formContent = initRes.data.data?.checkoutFormContent;
        if (formContent) {
          setIyzicoForm(formContent);
          return;
        }
        // Fallback redirect
        const url = initRes.data.data?.paymentPageUrl;
        if (url) {
          window.location.href = url;
          return;
        }
        setError('İyzico ödeme sayfası alınamadı');
      } else {
        setSuccess({
          invoiceNum: invoice.invoiceNum,
          total: Number(invoice.total),
        });
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCheck(null);
    setDomain('');
    setAuthCode('');
    setError('');
    setSuccess(null);
  };

  // Başarı ekranı (havale)
  if (success) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Transfer Talebi Alındı</h1>
          <p className="text-slate-600 mb-2">
            Fatura: <b className="font-mono">{success.invoiceNum}</b>
          </p>
          <p className="text-slate-700 mb-6">
            Toplam: <b className="text-brand-700 text-xl">
              {success.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </b>
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Havale/EFT ile ödeme sonrası transfer otomatik başlatılır. Transfer süreci
            yaklaşık 5-7 gün sürer.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={reset}
              className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Başka Domain Transfer Et
            </button>
            <button
              onClick={() => navigate('/app')}
              className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700"
            >
              Panele Dön
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Domain Transfer Et</h1>
        <p className="text-sm text-slate-500 mt-1">
          Başka bir registrar'da kayıtlı domaininizi AdigeHost'a taşıyın. 1 yıllık uzatma dahildir.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {!check && (
          <form onSubmit={submitCheck} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Domain Adı
              </label>
              <input
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value.replace(/\s/g, '').toLowerCase())}
                placeholder="ornek.com"
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-brand-500"
              />
            </div>
            <button
              disabled={busy}
              className="w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Kontrol Ediliyor…' : 'Transfer Edilebilir mi? Sorgula'}
            </button>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
              <p className="font-semibold mb-1">Transfer için ön hazırlık:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>
                  Mevcut registrar'da domain <b>kilidini açın</b>
                </li>
                <li>
                  <b>EPP/Auth kodu</b>nu alın
                </li>
                <li>
                  Privacy WHOIS varsa <b>geçici olarak kapatın</b>
                </li>
                <li>
                  Domain'in son <b>60 gün içinde transfer edilmemiş</b> olması gerekir
                </li>
              </ol>
            </div>
          </form>
        )}

        {check && !iyzicoForm && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="font-bold text-slate-800 text-lg">{check.domain}</div>
              {check.transferable ? (
                <div className="text-green-600 text-sm font-semibold mt-1">
                  Transfer edilebilir
                </div>
              ) : (
                <div className="text-red-600 text-sm font-semibold mt-1">{check.message}</div>
              )}
            </div>

            {check.transferable && check.yearlyIncVat && (
              <>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 text-center">
                  Yıllık fiyat:{' '}
                  <b>
                    {check.yearlyIncVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </b>{' '}
                  (KDV dahil)
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    EPP / Auth Kodu
                  </label>
                  <input
                    required
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Mevcut registrar'dan alın"
                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-mono outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Süre
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 5, 10].map((y) => (
                      <button
                        key={y}
                        onClick={() => setYears(y)}
                        type="button"
                        className={`rounded-lg py-2 text-sm font-semibold border-2 ${
                          years === y
                            ? 'border-brand-600 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {y} yıl
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toplam */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>
                      {years} yıl × {check.yearlyIncVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                    <span className="font-bold text-slate-900">
                      {(check.yearlyIncVat * years).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Kartımı sonraki ödemeler için kaydet (otomatik yenileme için gerekli)
                  </label>
                  <button
                    onClick={() => createOrder('iyzico')}
                    disabled={busy || !authCode}
                    className="w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {busy ? 'İşleniyor…' : 'Kredi Kartı ile Transfer Et'}
                  </button>
                  <button
                    onClick={() => createOrder('havale')}
                    disabled={busy || !authCode}
                    className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
                  >
                    Havale / EFT ile Transfer Et
                  </button>
                </div>
              </>
            )}

            <button
              onClick={reset}
              type="button"
              className="w-full text-sm text-slate-500 hover:text-slate-700 pt-2"
            >
              Başka domain sorgula
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
        <p className="font-semibold mb-1">Transfer Süreci</p>
        <p>
          Ödeme onaylandığı anda Alantron üzerinde transfer talebi başlatılır. Süreç
          yaklaşık 5-7 gün sürer. Tamamlandığında size e-posta gönderilir ve domain
          paneline eklenir.
        </p>
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
