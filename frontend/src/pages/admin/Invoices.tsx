import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../utils/api';

interface Invoice {
  id: string;
  invoiceNum: string;
  status: string;
  total: number;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
}

const STATUS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  unpaid: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-500',
  draft: 'bg-slate-100 text-slate-500',
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    api
      .get('/admin/invoices')
      .then((r) => setInvoices(r.data.data))
      .catch((e) => setError(getApiErrorMessage(e)));
  };
  useEffect(() => load(), []);

  const approve = async (inv: Invoice) => {
    if (!confirm(`${inv.invoiceNum} ödendi olarak işaretlenip servis(ler) aktive edilsin mi?`))
      return;
    setBusy(inv.id);
    setMsg('');
    setError('');
    try {
      const r = await api.post(`/admin/invoices/${inv.id}/approve`);
      const prov = r.data.data.provisioned ?? [];
      setMsg(
        prov.length
          ? `${inv.invoiceNum} onaylandı. ${prov.length} servis aktive edildi (cPanel: ${prov.map((p: { cpanelUser: string }) => p.cpanelUser).join(', ')}).`
          : `${inv.invoiceNum} ödendi olarak işaretlendi.`,
      );
      load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Faturalar</h1>
      {msg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Fatura No</th>
              <th className="px-4 py-3">Müşteri</th>
              <th className="px-4 py-3">Tarih</th>
              <th className="px-4 py-3">Tutar</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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
