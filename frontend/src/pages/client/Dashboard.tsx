import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

interface Invoice {
  id: string;
  invoiceNum: string;
  status: 'unpaid' | 'paid' | 'overdue' | 'cancelled' | 'draft';
  total: number;
  dueDate: string;
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState({ services: 0, unpaidInvoices: 0 });
  const [bank, setBank] = useState<Record<string, string>>({});
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([]);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    api
      .get('/services')
      .then((res) => setCounts((c) => ({ ...c, services: res.data.data.length })))
      .catch(() => {});
    api
      .get('/invoices')
      .then((res) => {
        const invoices = res.data.data ?? [];
        const unpaid = invoices.filter(
          (i: Invoice) => i.status === 'unpaid' || i.status === 'overdue',
        );
        setUnpaidInvoices(unpaid);
        setCounts((c) => ({ ...c, unpaidInvoices: unpaid.length }));
      })
      .catch(() => {});
    api
      .get('/public/bank')
      .then((r) => setBank(r.data.data ?? {}))
      .catch(() => {});
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const hasBank = bank.bank_iban || bank.bank_name;
  const totalUnpaid = unpaidInvoices.reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Hoş geldiniz, {user?.firstName}</h1>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Link
          to="/app/services"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400"
        >
          <div className="text-sm text-slate-500">Servislerim</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{counts.services}</div>
        </Link>
        <Link
          to="/app/profile"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400"
        >
          <div className="text-sm text-slate-500">Bekleyen Ödeme</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{counts.unpaidInvoices}</div>
          {totalUnpaid > 0 && (
            <div className="text-xs text-slate-500 mt-0.5">
              Toplam: {totalUnpaid.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
          )}
        </Link>
        <Link
          to="/app/profile"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400"
        >
          <div className="text-sm text-slate-500">Profil</div>
          <div className="mt-1 text-lg font-semibold text-brand-700">Hesabımı Yönet</div>
        </Link>
      </div>

      {/* Ödenmemiş Faturalar */}
      {unpaidInvoices.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl"></span>
            <h2 className="font-bold text-amber-900">Ödeme Bekleyen Faturalarınız</h2>
          </div>
          <div className="space-y-2">
            {unpaidInvoices.slice(0, 5).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-3 border border-amber-200"
              >
                <div>
                  <div className="font-mono font-bold text-slate-800">{inv.invoiceNum}</div>
                  <div className="text-xs text-slate-500">
                    Son ödeme: {new Date(inv.dueDate).toLocaleDateString('tr-TR')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-amber-700">
                    {Number(inv.total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </div>
                  <button
                    onClick={() => copy(inv.invoiceNum, `inv-${inv.id}`)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {copied === `inv-${inv.id}` ? 'Kopyalandı' : "No'yu Kopyala"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Havale / EFT Bilgileri */}
      {hasBank && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl"></span>
            <h2 className="font-bold text-slate-800">Havale / EFT Bilgileri</h2>
          </div>

          <div className="space-y-3">
            {bank.bank_name && (
              <Row
                label="Banka"
                value={bank.bank_name}
                onCopy={copy}
                copied={copied === 'bank'}
                copyKey="bank"
              />
            )}
            {bank.bank_account_holder && (
              <Row
                label="Hesap Sahibi"
                value={bank.bank_account_holder}
                onCopy={copy}
                copied={copied === 'holder'}
                copyKey="holder"
              />
            )}
            {bank.bank_iban && (
              <Row
                label="IBAN"
                value={bank.bank_iban}
                onCopy={copy}
                copied={copied === 'iban'}
                copyKey="iban"
                mono
              />
            )}
            {bank.bank_branch && (
              <Row
                label="Şube"
                value={bank.bank_branch}
                onCopy={copy}
                copied={copied === 'branch'}
                copyKey="branch"
              />
            )}
          </div>

          {/* Önemli uyarı */}
          <div className="mt-5 rounded-xl bg-amber-50 border border-amber-300 p-4">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg"></span>
              <div className="flex-1">
                <p className="font-semibold text-amber-900 mb-1">Önemli: Açıklama Alanı</p>
                <p className="text-sm text-amber-800">
                  Havale/EFT açıklamasına mutlaka<b>fatura/sipariş numaranızı</b>yazın. Aksi
                  takdirde ödemeniz hesabınızla eşleştirilemez ve hizmetiniz aktive edilemez.
                </p>
                {unpaidInvoices.length > 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    Bekleyen fatura no(ları):{' '}
                    {unpaidInvoices.map((i) => (
                      <code
                        key={i.id}
                        className="inline-block mx-1 px-2 py-0.5 bg-white rounded font-bold"
                      >
                        {i.invoiceNum}
                      </code>
                    ))}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasBank && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-500 text-sm">
            Havale/EFT bilgileri henüz girilmemiş. Yönetici ile iletişime geçin.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
  copyKey,
  mono,
}: {
  label: string;
  value: string;
  onCopy: (v: string, k: string) => void;
  copied: boolean;
  copyKey: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <div className="text-sm text-slate-500 w-32 shrink-0">{label}</div>
      <div className="flex-1 text-right">
        <span
          className={
            mono
              ? 'font-mono font-semibold text-slate-800 tracking-wide'
              : 'font-medium text-slate-800'
          }
        >
          {value}
        </span>
      </div>
      <button
        onClick={() => onCopy(value, copyKey)}
        className="ml-3 text-xs text-brand-600 hover:text-brand-800 shrink-0"
      >
        {copied ? '' : 'Kopyala'}
      </button>
    </div>
  );
}
