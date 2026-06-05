import { type FormEvent, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Result {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
  priceTRY: number | null; // KDV dahil
  priceExVat: number | null; // KDV hariç
  vatRate: number;
  period: number;
  provider?: string;
}
interface OrderResult {
  invoice: { invoiceNum: string; total: number; dueDate: string };
  bank: Record<string, string>;
}

export default function Domains() {
  const [name, setName] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ordering, setOrdering] = useState('');
  const [order, setOrder] = useState<{ domain: string; res: OrderResult } | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOrder(null);
    setLoading(true);
    setResults(null);
    try {
      const r = await api.post('/domains/check', {
        name: name.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      });
      setResults(r.data.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const orderDomain = async (domain: string) => {
    if (!confirm(`${domain} için sipariş oluşturulsun mu? (1 yıl)`)) return;
    setOrdering(domain);
    setError('');
    try {
      const r = await api.post('/domains/order', { domain, period: 1 });
      setOrder({ domain, res: r.data.data });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setOrdering('');
    }
  };

  if (order) {
    const { invoice, bank } = order.res;
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-800">Siparişiniz alındı</h1>
          <p className="mt-1 text-sm text-amber-700">
            <strong>{order.domain}</strong>için havale/EFT ile ödeme yapın. Ödeme onaylandığında
            alan adı adınıza kaydedilecektir.
          </p>
          <div className="mt-4 space-y-2 rounded-xl bg-white p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Fatura No</span>
              <span className="font-medium">{invoice.invoiceNum}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tutar</span>
              <span className="font-bold">{invoice.total} TL</span>
            </div>
            <hr className="my-2" />
            <div className="flex justify-between">
              <span className="text-slate-500">Banka</span>
              <span className="font-medium">{bank.bank_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">IBAN</span>
              <span className="font-mono font-medium">{bank.bank_iban || '—'}</span>
            </div>
            <p className="pt-2 text-xs text-slate-500">
              Açıklamaya fatura numaranızı ({invoice.invoiceNum}) yazın.
            </p>
          </div>
        </div>
        <button
          onClick={() => setOrder(null)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          Yeni Arama
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Domain Kaydı</h1>
      <form onSubmit={search} className="flex gap-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alan adı (örn: sirketadi)"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500"
        />
        <button
          disabled={loading}
          className="rounded-lg bg-brand-600 px-6 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'Aranıyor…' : 'Ara'}
        </button>
      </form>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {results && (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.domain}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                r.available ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
              }`}
            >
              <div>
                <div className="font-semibold text-slate-800">{r.domain}</div>
                <div className="text-xs">
                  {r.available ? (
                    <span className="text-green-600">Müsait{r.isPremium ? '· Premium' : ''}</span>
                  ) : (
                    <span className="text-slate-400">Dolu</span>
                  )}
                </div>
              </div>
              {r.available && (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-semibold text-slate-800">
                      {r.priceTRY != null
                        ? `${r.priceTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺/yıl`
                        : '—'}
                    </div>
                    {r.priceExVat != null && (
                      <div className="text-xs text-slate-400">
                        KDV hariç{' '}
                        {r.priceExVat.toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        ₺ · KDV %{r.vatRate}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={ordering === r.domain || r.priceTRY == null}
                    onClick={() => orderDomain(r.domain)}
                    className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {ordering === r.domain ? '…' : 'Sipariş Ver'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
