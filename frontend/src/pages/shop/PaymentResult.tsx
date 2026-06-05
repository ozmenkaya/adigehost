import { useSearchParams, Link } from 'react-router-dom';

export default function PaymentResult() {
  const [params] = useSearchParams();
  const status = params.get('status'); // ok | failed | error
  const invoiceNum = params.get('invoice');
  const msg = params.get('msg');

  if (status === 'ok') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl bg-white shadow-xl p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ödeme Başarılı</h1>
          {invoiceNum && (
            <p className="text-slate-600 mb-1">
              Fatura: <b className="font-mono">{invoiceNum}</b>
            </p>
          )}
          <p className="text-sm text-slate-500 mb-6">
            Ödemeniz alındı. Hizmetiniz dakikalar içinde aktive edilecek ve e-fatura kesilecektir.
          </p>
          <Link
            to="/app"
            className="inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Panelime Git →
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl bg-white shadow-xl p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ödeme Başarısız</h1>
          <p className="text-sm text-red-600 mb-2">{msg ?? 'Bilinmeyen hata'}</p>
          <p className="text-sm text-slate-500 mb-6">
            Ödemeniz alınamadı. Tekrar deneyebilir veya havale/EFT ile ödeme yapabilirsiniz.
          </p>
          <div className="flex gap-2 justify-center">
            <Link
              to="/app"
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Panele Git
            </Link>
            <Link
              to="/"
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Ana Sayfa
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-500">Yönlendiriliyor…</p>
    </div>
  );
}
