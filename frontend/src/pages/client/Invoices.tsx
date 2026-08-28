import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: string;
  invoiceNum: string;
  status: 'draft' | 'unpaid' | 'paid' | 'overdue' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
  items?: InvoiceItem[];
  edmInvoiceId?: string | null;
}

const STATUS: Record<Invoice['status'], { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600' },
  unpaid: { label: 'Ödeme Bekliyor', cls: 'bg-amber-100 text-amber-700' },
  overdue: { label: 'Gecikti', cls: 'bg-red-100 text-red-700' },
  paid: { label: 'Ödendi', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'İptal', cls: 'bg-slate-100 text-slate-500' },
};

function tl(n: number): string {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saveCardMap, setSaveCardMap] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/invoices');
      setInvoices(r.data.data ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pay = async (id: string) => {
    setPaying(id);
    setError('');
    try {
      const r = await api.post('/payments/iyzico/init', {
        invoiceId: id,
        saveCard: saveCardMap[id] ?? false,
      });
      const url = r.data.data?.paymentPageUrl as string | undefined;
      if (url) {
        window.location.href = url;
        return;
      }
      setError('Ödeme sayfası alınamadı. Lütfen havale/EFT ile ödeyin veya daha sonra tekrar deneyin.');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setPaying(null);
    }
  };

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;

  const openCount = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue').length;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Faturalarım</h1>
        <p className="text-sm text-slate-500">
          {openCount > 0
            ? `${openCount} ödenmemiş faturanız var.`
            : 'Ödenmemiş faturanız bulunmuyor.'}
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Henüz faturanız yok.
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const st = STATUS[inv.status];
            const payable = inv.status === 'unpaid' || inv.status === 'overdue';
            const isOpen = expanded === inv.id;
            return (
              <div key={inv.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{inv.invoiceNum}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {fmtDate(inv.createdAt)}
                      {payable && ` · Son ödeme: ${fmtDate(inv.dueDate)}`}
                      {inv.status === 'paid' && inv.paidAt && ` · Ödendi: ${fmtDate(inv.paidAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-900">{tl(inv.total)} ₺</span>
                    {inv.edmInvoiceId && (
                      <a
                        href={`/api/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        PDF
                      </a>
                    )}
                    {payable && (
                      <button
                        onClick={() => pay(inv.id)}
                        disabled={paying === inv.id}
                        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {paying === inv.id ? 'Yönlendiriliyor…' : 'Öde'}
                      </button>
                    )}
                  </div>
                </div>

                {payable && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={saveCardMap[inv.id] ?? false}
                      onChange={(e) =>
                        setSaveCardMap((m) => ({ ...m, [inv.id]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Kartımı sonraki ödemeler için kaydet (otomatik yenileme için gerekli)
                  </label>
                )}

                {inv.items && inv.items.length > 0 && (
                  <>
                    <button
                      onClick={() => setExpanded(isOpen ? null : inv.id)}
                      className="mt-2 text-xs text-brand-600 hover:text-brand-700"
                    >
                      {isOpen ? 'Kalemleri gizle' : 'Kalemleri göster'}
                    </button>
                    {isOpen && (
                      <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100 pt-2">
                        {inv.items.map((it) => (
                          <div key={it.id} className="flex justify-between py-1.5 text-sm">
                            <span className="text-slate-600">
                              {it.description}
                              {it.quantity > 1 && <span className="text-slate-400"> × {it.quantity}</span>}
                            </span>
                            <span className="font-medium text-slate-700">{tl(it.total)} ₺</span>
                          </div>
                        ))}
                        <div className="flex justify-between py-1.5 text-xs text-slate-400">
                          <span>KDV dahil toplam</span>
                          <span>{tl(inv.total)} ₺</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
