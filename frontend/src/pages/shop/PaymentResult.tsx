import { useSearchParams, Link } from 'react-router-dom';
import PageBackdrop from '../../components/shop/PageBackdrop';

export default function PaymentResult() {
  const [params] = useSearchParams();
  const status = params.get('status'); // ok | failed | error
  const invoiceNum = params.get('invoice');
  const msg = params.get('msg');

  if (status === 'ok') {
    return (
      <PageBackdrop>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-500/20 ring-1 ring-emerald-400/40">
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12 5 5L20 6" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Ödeme Başarılı</h1>
            {invoiceNum && (
              <p className="mb-1 text-slate-400">
                Fatura: <b className="font-mono text-slate-200">{invoiceNum}</b>
              </p>
            )}
            <p className="mb-6 text-sm text-slate-400">
              Ödemeniz alındı. Hizmetiniz dakikalar içinde aktive edilecek ve e-fatura kesilecektir.
            </p>
            <Link to="/app" className="btn-neon">
              Panelime Git →
            </Link>
          </div>
        </div>
      </PageBackdrop>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <PageBackdrop>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-400/30 to-rose-500/20 ring-1 ring-red-400/40">
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-red-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Ödeme Başarısız</h1>
            <p className="mb-2 text-sm text-red-300">{msg ?? 'Bilinmeyen hata'}</p>
            <p className="mb-6 text-sm text-slate-400">
              Ödemeniz alınamadı. Tekrar deneyebilir veya havale/EFT ile ödeme yapabilirsiniz.
            </p>
            <div className="flex justify-center gap-2">
              <Link
                to="/app"
                className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/5"
              >
                Panele Git
              </Link>
              <Link to="/" className="btn-neon px-5 py-2.5 text-sm">
                Ana Sayfa
              </Link>
            </div>
          </div>
        </div>
      </PageBackdrop>
    );
  }

  return (
    <PageBackdrop>
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-slate-400">Yönlendiriliyor…</p>
      </div>
    </PageBackdrop>
  );
}
