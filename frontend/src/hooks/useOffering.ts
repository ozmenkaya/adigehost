import { useEffect, useState } from 'react';
import { api } from '../utils/api';

export interface OfferingLine {
  key: 'website' | 'hosting' | 'vps' | 'domain';
  /** Hizmetin müşteri diliyle adı. */
  label: string;
  /** Katalogdaki gerçek paket adları; katalogdan gelmeyen hizmetlerde boş. */
  items: string[];
}

/** `/public/products` yalnızca satıştaki ürünleri döndürür — ayrıca filtre gerekmiyor. */
interface PublicProduct {
  name: string;
  type: 'hosting' | 'vps' | 'website';
}

// Katalogdan türetilen satırlar. `hosting` tipi hem barındırma hem e-posta
// paketlerini kapsıyor (Kurumsal E-Posta da bu tiple kayıtlı), etiket bunu yansıtır.
const CATALOG_LABELS: Record<'website' | 'hosting', string> = {
  website: 'Web sitesi tasarımı ve kurulumu',
  hosting: 'Hosting ve kurumsal e-posta paketleri',
};

/**
 * Satıştaki hizmetleri gerçek kaynaklarından türetir:
 *   - web sitesi / hosting → `/public/products` (admin > Ürünler)
 *   - VPS                  → `/public/vps/options` (Hetzner'dan canlı)
 *   - alan adı             → kendi arama/kayıt akışı, kataloğa girmiyor
 *
 * NEDEN: Hakkımızda/SSS gibi sayfalarda hizmet listesi elle yazılıydı; admin'den
 * paket eklenip çıkarıldığında bu metinler olduğu yerde kalıp katalogla çelişiyordu.
 */
export function useOffering() {
  const [lines, setLines] = useState<OfferingLine[]>([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.get('/public/products').then((r) => r.data.data as PublicProduct[]),
      api
        .get('/public/vps/options')
        .then((r) => ((r.data.data?.serverTypes?.length ?? 0) > 0))
        .catch(() => false),
    ])
      .then(([products, hasVps]) => {
        if (cancelled) return;

        const byType = new Map<'website' | 'hosting', string[]>();
        for (const p of products ?? []) {
          if (p.type !== 'website' && p.type !== 'hosting') continue;
          byType.set(p.type, [...(byType.get(p.type) ?? []), p.name]);
        }

        const derived: OfferingLine[] = [];
        for (const key of ['website', 'hosting'] as const) {
          const items = byType.get(key);
          if (items?.length) derived.push({ key, label: CATALOG_LABELS[key], items });
        }
        if (hasVps) {
          derived.push({ key: 'vps', label: 'Bulut VPS sunucuları', items: [] });
        }
        derived.push({ key: 'domain', label: 'Alan adı kayıt, yenileme ve transfer', items: [] });

        setLines(derived);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return lines;
}
