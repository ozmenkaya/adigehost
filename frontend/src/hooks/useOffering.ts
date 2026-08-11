import { useEffect, useState } from 'react';
import { api } from '../utils/api';

export interface OfferingLine {
  key: 'website' | 'hosting' | 'email' | 'vps' | 'domain';
  /** Hizmetin müşteri diliyle adı. */
  label: string;
  /** Katalogdaki gerçek paket adları; katalogdan gelmeyen hizmetlerde boş. */
  items: string[];
}

/** `/public/products` yalnızca satıştaki ürünleri döndürür — ayrıca filtre gerekmiyor. */
interface PublicProduct {
  name: string;
  type: 'hosting' | 'vps' | 'website' | 'email';
}

type CatalogKey = 'website' | 'hosting' | 'email';

/** Vitrindeki sıra: önce "siteyi biz yaparız", sonra altyapı. */
const CATALOG_ORDER: CatalogKey[] = ['website', 'hosting', 'email'];

const CATALOG_LABELS: Record<CatalogKey, string> = {
  website: 'Web sitesi tasarımı ve kurulumu',
  hosting: 'Paylaşımlı hosting paketleri',
  email: 'Alan adınıza özel kurumsal e-posta',
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

        const byType = new Map<CatalogKey, string[]>();
        for (const p of products ?? []) {
          if (!CATALOG_ORDER.includes(p.type as CatalogKey)) continue;
          const key = p.type as CatalogKey;
          byType.set(key, [...(byType.get(key) ?? []), p.name]);
        }

        const derived: OfferingLine[] = [];
        for (const key of CATALOG_ORDER) {
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
