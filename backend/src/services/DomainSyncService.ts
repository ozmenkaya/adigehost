import { Service } from '../models/Service';
import { AlantronService } from './AlantronService';
import { logger } from '../config/logger';

/**
 * Alantron domain senkronizasyonu.
 *
 * Alantron'un toplu liste API'si olmadığı için, panele kayıtlı (Service type=domain)
 * her domainin güncel bitiş tarihi / kilit / NS bilgisi tek tek `getdomain` ile çekilir
 * ve DB güncellenir. Hem admin'in "Alantron'dan Güncelle" butonu hem de gecelik cron
 * bu servisi kullanır.
 */

export interface AlantronSyncSummary {
  total: number; // registrycode'u olan domain sayısı
  updated: number; // bitiş tarihi değişip güncellenen
  unchanged: number; // zaten güncel
  noRegistrycode: number; // registrycode'u olmayan (atlanan)
  notManaged: string[]; // Alantron hesabında yönetilmeyen (yanlış rc)
  errors: Array<{ domain: string; message: string }>;
  syncedAt: string;
}

const CONCURRENCY = 5;

function ymd(d: Date | string | null): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

export class DomainSyncService {
  /**
   * Panele kayıtlı tüm Alantron domainlerini Alantron API'sinden tazeler.
   * nextDue (bitiş tarihi) + config.nameservers/locked/lastSyncedAt günceller.
   */
  static async syncAlantron(): Promise<AlantronSyncSummary> {
    const domains = (await Service.findAll({
      where: { type: 'domain' },
      order: [['domain', 'ASC']],
    })) as Service[];

    const summary: AlantronSyncSummary = {
      total: 0,
      updated: 0,
      unchanged: 0,
      noRegistrycode: 0,
      notManaged: [],
      errors: [],
      syncedAt: new Date().toISOString(),
    };

    // Alantron sağlayıcılı + registrycode'u olanları işle
    const targets = domains.filter((d) => {
      const cfg = (d.config ?? {}) as { provider?: string; registrycode?: number };
      if (cfg.registrycode) return true;
      if (cfg.provider === 'alantron' || !cfg.provider) summary.noRegistrycode += 1;
      return false;
    });
    summary.total = targets.length;

    // CONCURRENCY kadar paralel işle (Alantron API'sini boğmamak için)
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((svc) => this.syncOne(svc, summary)));
    }

    logger.info('[alantron-sync] tamamlandı', {
      total: summary.total,
      updated: summary.updated,
      unchanged: summary.unchanged,
      notManaged: summary.notManaged.length,
      errors: summary.errors.length,
    });
    return summary;
  }

  /** Tek bir domaini Alantron'dan tazeler ve DB'yi günceller. */
  private static async syncOne(svc: Service, summary: AlantronSyncSummary): Promise<void> {
    const cfg = (svc.config ?? {}) as Record<string, unknown>;
    const rc = Number(cfg.registrycode);
    const domain = svc.domain ?? svc.name;
    try {
      const full = await AlantronService.getDomainFull(rc);
      const newConfig: Record<string, unknown> = {
        ...cfg,
        alantronManaged: true,
        nameservers: full.nameServers,
        locked: full.locked,
        lastSyncedAt: summary.syncedAt,
      };

      const oldDue = ymd(svc.nextDue ?? null);
      const newDue = full.expiryDate ? ymd(full.expiryDate) : oldDue;

      if (full.expiryDate && newDue && newDue !== oldDue) {
        svc.set('nextDue', full.expiryDate);
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }
      svc.set('config', newConfig);
      await svc.save();
    } catch (err) {
      const message = (err as Error)?.message ?? 'bilinmeyen hata';
      // "alan adi sizin tarafinizdan yonetilmiyor" → yanlış registrycode
      if (/yonetilmiyor|4625|not managed|ALANTRON_NOT_FOUND/i.test(message) ||
        (err as { statusCode?: number })?.statusCode === 404) {
        summary.notManaged.push(domain ?? String(rc));
        // Yönetilmiyor olarak işaretle (tarihe dokunma)
        svc.set('config', { ...cfg, alantronManaged: false, lastSyncedAt: summary.syncedAt });
        await svc.save().catch(() => {});
      } else {
        summary.errors.push({ domain: domain ?? String(rc), message });
      }
    }
  }
}
