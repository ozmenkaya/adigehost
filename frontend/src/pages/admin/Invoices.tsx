import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Invoice {
  id: string;
  invoiceNum: string;
  status: string;
  total: number;
  createdAt: string;
  edmInvoiceId?: string | null;
  edmType?: 'efatura' | 'earsiv' | null;
  user?: { firstName: string; lastName: string; email: string };
}

const STATUS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  unpaid: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-500',
  draft: 'bg-slate-100 text-slate-500',
};

interface ClientOpt {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
}
type LineItem = { description: string; quantity: number; unitPrice: number };
const EMPTY_LINE: LineItem = { description: '', quantity: 1, unitPrice: 0 };

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [cUserId, setCUserId] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cItems, setCItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api
      .get('/admin/invoices')
      .then((r) => setInvoices(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  };
  useEffect(() => {
    load();
    api
      .get('/admin/clients', { params: { limit: 100 } })
      .then((r) => setClients(r.data.data))
      .catch(() => {});
  }, []);

  const approve = async (inv: Invoice) => {
    if (!confirm(`${inv.invoiceNum} ödendi olarak işaretlenip servis(ler) aktive edilsin mi?`))
      return;
    setBusy(inv.id);
    setMsg('');
    setError('');
    try {
      const r = await api.post(`/admin/invoices/${inv.id}/approve`);
      const prov = r.data.data.provisioned ?? [];
      const ei = r.data.data.einvoice as
        | { type?: string; uuid?: string; error?: string }
        | null;
      const eiMsg = ei?.type
        ? ` ${ei.type === 'efatura' ? 'e-Fatura' : 'e-Arşiv'} kesildi.`
        : ei?.error
          ? ` (e-belge kesilemedi: ${ei.error})`
          : '';
      const provMsg = prov.length
        ? ` ${prov.length} servis aktive edildi.`
        : '';
      setMsg(`${inv.invoiceNum} ödendi olarak işaretlendi.${provMsg}${eiMsg}`);
      load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setCItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setCItems((arr) => [...arr, { ...EMPTY_LINE }]);
  const removeItem = (i: number) => setCItems((arr) => arr.filter((_, idx) => idx !== i));

  const subtotal = cItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const vat = subtotal * 0.2;

  const resetCreate = () => {
    setCUserId('');
    setCNotes('');
    setCItems([{ ...EMPTY_LINE }]);
    setShowCreate(false);
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (!cUserId) {
      setError('Lütfen bir müşteri seçin');
      return;
    }
    setCreating(true);
    try {
      const r = await api.post('/admin/invoices', {
        userId: cUserId,
        items: cItems
          .filter((it) => it.description.trim())
          .map((it) => ({
            description: it.description.trim(),
            quantity: Number(it.quantity) || 1,
            unitPrice: Number(it.unitPrice) || 0,
          })),
        notes: cNotes || undefined,
      });
      setMsg(
        `Fatura oluşturuldu: ${r.data.data.invoiceNum} (${r.data.data.total} TL). ` +
          '"Ödemeyi Onayla" ile e-fatura/e-arşiv otomatik kesilir.',
      );
      resetCreate();
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Faturalar</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
        >
          {showCreate ? 'Kapat' : '+ Fatura Oluştur'}
        </button>
      </div>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showCreate && (
        <form
          onSubmit={createInvoice}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <select
              required
              value={cUserId}
              onChange={(e) => setCUserId(e.target.value)}
              className={inp}
            >
              <option value="">— Müşteri seçin —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.company ? ` — ${c.company}` : ''}
                </option>
              ))}
            </select>
            <input
              placeholder="Not (opsiyonel)"
              value={cNotes}
              onChange={(e) => setCNotes(e.target.value)}
              className={inp}
            />
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium uppercase text-slate-500">
              <span className="col-span-6">Açıklama</span>
              <span className="col-span-2 text-right">Adet</span>
              <span className="col-span-3 text-right">Birim Fiyat (KDV hariç)</span>
              <span className="col-span-1" />
            </div>
            {cItems.map((it, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <input
                  placeholder="Hizmet / ürün açıklaması"
                  value={it.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                  className={`col-span-6 ${inp}`}
                  required={i === 0}
                />
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => setItem(i, { quantity: Number(e.target.value) })}
                  className={`col-span-2 text-right ${inp}`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })}
                  className={`col-span-3 text-right ${inp}`}
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={cItems.length === 1}
                  className="col-span-1 rounded-lg border border-slate-300 py-2 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              + Kalem ekle
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
            <div className="text-slate-500">
              Ara toplam: <b className="text-slate-700">{subtotal.toFixed(2)} TL</b> · KDV %20:{' '}
              <b className="text-slate-700">{vat.toFixed(2)} TL</b> · Genel toplam:{' '}
              <b className="text-slate-900">{(subtotal + vat).toFixed(2)} TL</b>
            </div>
            <button
              disabled={creating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {creating ? 'Oluşturuluyor…' : 'Fatura Oluştur (ödenmemiş)'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Fatura No</th>
              <th className="px-4 py-3">Müşteri</th>
              <th className="px-4 py-3">Tarih</th>
              <th className="px-4 py-3">Tutar</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">e-Belge</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Henüz fatura yok.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-800">{inv.invoiceNum}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {inv.user ? `${inv.user.firstName} ${inv.user.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(inv.createdAt).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{inv.total} TL</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[inv.status] ?? ''}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {inv.edmType ? (
                      <span className="flex flex-col">
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                            inv.edmType === 'efatura'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-cyan-100 text-cyan-700'
                          }`}
                        >
                          {inv.edmType === 'efatura' ? 'e-Fatura' : 'e-Arşiv'}
                        </span>
                        {inv.edmInvoiceId && (
                          <span className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {inv.edmInvoiceId}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <button
                        disabled={busy === inv.id}
                        onClick={() => approve(inv)}
                        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        {busy === inv.id ? 'İşleniyor…' : 'Ödemeyi Onayla'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
