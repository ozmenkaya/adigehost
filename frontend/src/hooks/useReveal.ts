import { useEffect, useRef, useState } from 'react';

/**
 * Scroll ile ortaya çıkma (reveal) kancası.
 * Element görünüme girdiğinde `visible=true` olur; bir kez tetiklenir.
 * Kullanım:
 *   const { ref, visible } = useReveal<HTMLDivElement>();
 *   <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''}`}>
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // IntersectionObserver yoksa (çok eski tarayıcı) doğrudan göster
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold: options?.threshold ?? 0.15,
        rootMargin: options?.rootMargin ?? '0px 0px -60px 0px',
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return { ref, visible };
}
