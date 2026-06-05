import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  checkoutFormContent: string; // İyzico'dan dönen HTML+script
  onClose: () => void;
}

/**
 * İyzico ödeme formunu sayfa içinde modal olarak gösterir.
 * checkoutFormContent: iyzico API'nin döndürdüğü HTML (içinde script tag'i var).
 * Script innerHTML ile çalışmaz; manuel olarak re-execute edilir.
 *
 * Ödeme tamamlandığında iyzico zaten callbackUrl'a yönlendirir
 * (parent sayfa /payment-result'a değişir, modal otomatik kapanır).
 */
export default function IyzicoPaymentModal({ open, checkoutFormContent, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !checkoutFormContent || !containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = checkoutFormContent;

    // innerHTML script tag'lerini çalıştırmaz — yeniden oluşturup ekle
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (oldScript.text) newScript.text = oldScript.text;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });

    return () => {
      // Kapanırken iyzico'nun eklediği overlay'leri temizle
      container.innerHTML = '';
      // İyzico'nun body'ye eklediği fixed overlay class'larını da temizleyebiliriz
      document.querySelectorAll('[id^="iyzipay-checkout"]').forEach((el) => {
        if (!container.contains(el)) el.remove();
      });
    };
  }, [open, checkoutFormContent]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-2 sm:p-4">
      <div className="relative w-full max-w-2xl max-h-[95vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="text-2xl">💳</div>
            <div>
              <div className="font-bold text-slate-800">Güvenli Ödeme</div>
              <div className="text-xs text-slate-500">iyzico altyapısı — 3D Secure</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl px-2"
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        {/* iyzico checkout form içeriği buraya enjekte edilir */}
        <div ref={containerRef} className="overflow-y-auto max-h-[calc(95vh-60px)] p-2" />
      </div>
    </div>
  );
}
