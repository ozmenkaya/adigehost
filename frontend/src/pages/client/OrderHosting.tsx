import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../utils/api';

interface Product {
  id: string;
  name: string;
  type: string;
  priceMonthly: number;
  priceAnnually: number | null;
  description: string | null;
}
interface OrderResult {
  invoice: { invoiceNum: string; total: number; dueDate: string };
  bank: Record<string, string>;
}

export default function OrderHosting() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [domain, setDomain] = useState('');
  const [vpsName, setVpsName] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'annually'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderResult | null>(null);

  useEffect(() => {
    api
      .get('/products')
      .then((r) => setProducts(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  }, []);

  const isHosting = selected?.type === 'hosting';
  const canSubmit = selected && (isHosting ? !!domain : true);

  const submit = async () => {
    if (!selected || !canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.post('/services/order', {
        productId: selected.id,
        billingCycle: cycle,
        ...(isHosting ? { domain } : { name: vpsName || selected.name }),
      });
      setOrder(r.data.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // Sipariş sonrası: havale bilgileri
  if (order) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-800">Siparişiniz alındı</h1>
          <p className="mt-1 text-sm text-amber-700">
            Aşağıdaki hesaba<strong>havale/EFT</strong>ile ödeme yapın. Ödemeniz onaylandığında
            hosting hesabınız otomatik olarak açılacaktır.
          </p>
          <div className="mt-4 space-y-2 rounded-xl bg-white p-4 text-sm">
            <Row label="Fatura No" value={order.invoice.invoiceNum} />
            <Row label="Tutar" value={`${order.invoice.total} TL`} strong />
            <Row
              label="Son Ödeme"
              value={new Date(order.invoice.dueDate).toLocaleDateString('tr-TR')}
            />
            <hr className="my-2" />
            <Row label="Banka" value={order.bank.bank_name || '—'} />
            <Row label="Hesap Sahibi" value={order.bank.bank_account_holder || '—'} />
            <Row label="IBAN" value={order.bank.bank_iban || '—'} mono />
            <p className="pt-2 text-xs text-slate-500">
              Açıklamaya fatura numaranızı ({order.invoice.invoiceNum}) yazmayı unutmayın.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/app/services')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Servislerime Git
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Paketler</h1>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
          Şu an satışta paket yok.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={`rounded-2xl border-2 bg-white p-5 text-left shadow-sm transition ${
                selected?.id === p.id
                  ? 'border-brand-600'
                  : 'border-slate-200 hover:border-brand-300'
              }`}
            >
              <span
                className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  p.type === 'vps' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}
              >
                {p.type === 'vps' ? 'VPS' : 'HOSTING'}
              </span>
              <div className="font-semibold text-slate-800">{p.name}</div>
              <div className="mt-2 text-2xl font-bold text-brand-700">
                {p.priceMonthly}
                <span className="text-sm font-normal text-slate-500">TL/ay</span>
              </div>
              {p.priceAnnually && (
                <div className="text-xs text-slate-400">veya {p.priceAnnually} TL/yıl</div>
              )}
              {p.description && <p className="mt-2 text-sm text-slate-500">{p.description}</p>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800">Sipariş: {selected.name}</h2>
          {isHosting ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Alan adı</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
                placeholder="orneksite.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sunucu adı</label>
              <input
                value={vpsName}
                onChange={(e) => setVpsName(e.target.value)}
                placeholder="web-sunucum (opsiyonel)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Faturalama</label>
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value as 'monthly' | 'annually')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="monthly">Aylık — {selected.priceMonthly} TL</option>
              {selected.priceAnnually && (
                <option value="annually">Yıllık — {selected.priceAnnually} TL</option>
              )}
            </select>
          </div>
          <button
            disabled={loading || !canSubmit}
            onClick={submit}
            className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? 'Sipariş oluşturuluyor…' : 'Sipariş Ver (Havale/EFT)'}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
