import { Service, Server, User } from '../models';
import { HetznerService } from './HetznerService';
import { WHMService } from './WHMService';
import { NotificationService } from './NotificationService';
import { logActivity } from './AuditService';
import { logger } from '../config/logger';

/**
 * Servis yaşam döngüsü — askıya alma / yeniden aktive / sonlandırma.
 *
 * Bu servis, altyapı kaynaklarına (Hetzner sunucusu, WHM/cPanel hesabı) dokunan
 * TEK yetkili yerdir. Hem cron (DunningService/AutoRenewService) hem de
 * route'lar (admin, müşteri) buradan geçer; böylece "DB'de suspended ama sunucu
 * çalışmaya devam ediyor" (para sızıntısı) durumu oluşmaz.
 *
 * Tüm metotlar idempotenttir: mevcut duruma göre gereksiz aksiyonu atlar,
 * altyapı hatalarını yutar (DB durumu yine de tutarlı bırakılır) ve loglar.
 */
export class ServiceLifecycleService {
  /** Servisin cPanel kullanıcı adını config'ten okur. */
  private static cpanelUser(service: Service): string | null {
    return (service.config as { cpanelUser?: string } | null)?.cpanelUser ?? null;
  }

  private static async getUser(service: Service): Promise<User | null> {
    return User.findByPk(service.userId);
  }

  // ── Askıya alma ────────────────────────────────────────────────────────────
  /**
   * Servisi askıya alır: VPS'i kapatır / cPanel hesabını suspend eder, durumu
   * `suspended` yapar ve askıya alınma zamanını (`config.suspendedAt`) işler
   * (terminate zamanlaması için gerekli).
   *
   * @returns işlem yapıldıysa true, atlandıysa false
   */
  static async suspend(serviceId: string, reason: string): Promise<boolean> {
    const service = await Service.findByPk(serviceId);
    if (!service) {
      logger.warn('[lifecycle] suspend: servis yok', { serviceId });
      return false;
    }
    if (['suspended', 'cancelled', 'terminated'].includes(service.status)) {
      // Zaten pasif — yalnızca suspendedAt işaretini garanti et.
      if (service.status === 'suspended' && !(service.config as { suspendedAt?: string } | null)?.suspendedAt) {
        service.config = { ...(service.config ?? {}), suspendedAt: new Date().toISOString() };
        await service.save();
      }
      return false;
    }

    // Altyapı aksiyonu — başarısızlık DB tutarlılığını bozmamalı.
    try {
      if (service.type === 'vps' && service.hetznerId) {
        await HetznerService.powerOff(service.hetznerId);
      } else if (service.type === 'hosting' && service.serverId) {
        const cpanelUser = this.cpanelUser(service);
        const server = await Server.findByPk(service.serverId);
        if (cpanelUser && server) {
          await WHMService.forServer(server).suspendAccount(cpanelUser, reason);
        }
      }
      // Domain: altyapı aksiyonu yok (kayıt bitiş tarihinde sona erer).
    } catch (e) {
      logger.error('[lifecycle] suspend altyapı hatası', {
        service: service.id,
        type: service.type,
        error: (e as Error).message,
      });
    }

    service.status = 'suspended';
    service.config = { ...(service.config ?? {}), suspendedAt: new Date().toISOString(), suspendReason: reason };
    await service.save();

    await logActivity({
      userId: service.userId,
      action: 'service.suspend',
      resource: 'service',
      resourceId: service.id,
      details: { reason, type: service.type },
    });

    const user = await this.getUser(service);
    if (user) {
      void NotificationService.sendServiceSuspended({
        to: user.email,
        firstName: user.firstName,
        serviceName: service.name,
        reason,
      }).catch(() => {});
    }

    logger.info('[lifecycle] servis askıya alındı', { service: service.id, reason });
    return true;
  }

  // ── Yeniden aktive ─────────────────────────────────────────────────────────
  /**
   * Askıya alınmış servisi yeniden aktive eder: VPS'i açar / cPanel hesabını
   * unsuspend eder, durumu `active` yapar. Yalnızca `suspended` servislerde çalışır.
   */
  static async unsuspend(serviceId: string): Promise<boolean> {
    const service = await Service.findByPk(serviceId);
    if (!service) {
      logger.warn('[lifecycle] unsuspend: servis yok', { serviceId });
      return false;
    }
    if (service.status !== 'suspended') return false;

    try {
      if (service.type === 'vps' && service.hetznerId) {
        await HetznerService.powerOn(service.hetznerId);
      } else if (service.type === 'hosting' && service.serverId) {
        const cpanelUser = this.cpanelUser(service);
        const server = await Server.findByPk(service.serverId);
        if (cpanelUser && server) {
          await WHMService.forServer(server).unsuspendAccount(cpanelUser);
        }
      }
    } catch (e) {
      logger.error('[lifecycle] unsuspend altyapı hatası', {
        service: service.id,
        type: service.type,
        error: (e as Error).message,
      });
    }

    const { suspendedAt: _a, suspendReason: _b, ...restCfg } = (service.config ?? {}) as Record<string, unknown>;
    service.status = 'active';
    service.config = restCfg;
    await service.save();

    await logActivity({
      userId: service.userId,
      action: 'service.unsuspend',
      resource: 'service',
      resourceId: service.id,
      details: { type: service.type },
    });

    const user = await this.getUser(service);
    if (user) {
      void NotificationService.sendServiceReactivated({
        to: user.email,
        firstName: user.firstName,
        serviceName: service.name,
      }).catch(() => {});
    }

    logger.info('[lifecycle] servis yeniden aktive edildi', { service: service.id });
    return true;
  }

  // ── Sonlandırma ────────────────────────────────────────────────────────────
  /**
   * Servisi kalıcı sonlandırır: Hetzner sunucusu + ek kaynakları (volume,
   * floating IP, firewall) siler / cPanel hesabını kaldırır, durumu `terminated`
   * yapar. Idempotent — zaten sonlandırılmışsa altyapıya tekrar dokunmaz.
   *
   * @param notify  müşteriye sonlandırma e-postası gönderilsin mi (varsayılan true)
   */
  static async terminate(serviceId: string, reason: string, notify = true): Promise<boolean> {
    const service = await Service.findByPk(serviceId);
    if (!service) {
      logger.warn('[lifecycle] terminate: servis yok', { serviceId });
      return false;
    }
    if (service.status === 'terminated') return false;

    try {
      if (service.type === 'vps' && service.hetznerId) {
        await this.teardownVps(service);
      } else if (service.type === 'hosting' && service.serverId) {
        const cpanelUser = this.cpanelUser(service);
        const server = await Server.findByPk(service.serverId);
        if (cpanelUser && server) {
          await WHMService.forServer(server).terminateAccount(cpanelUser);
          server.accountCount = Math.max(0, server.accountCount - 1);
          await server.save();
        }
      }
      // Domain: sağlayıcıda kayıt silinmez; süresi dolunca düşer.
    } catch (e) {
      logger.error('[lifecycle] terminate altyapı hatası', {
        service: service.id,
        type: service.type,
        error: (e as Error).message,
      });
    }

    service.status = 'terminated';
    service.autoRenew = false;
    await service.save();

    await logActivity({
      userId: service.userId,
      action: 'service.terminate',
      resource: 'service',
      resourceId: service.id,
      details: { reason, hetznerId: service.hetznerId, type: service.type },
    });

    if (notify) {
      const user = await this.getUser(service);
      if (user) {
        void NotificationService.sendServiceTerminated({
          to: user.email,
          firstName: user.firstName,
          serviceName: service.name,
          reason,
        }).catch(() => {});
      }
    }

    logger.info('[lifecycle] servis sonlandırıldı', { service: service.id, reason });
    return true;
  }

  /**
   * VPS'e ait tüm Hetzner kaynaklarını temizler. Ek kaynaklar (volume, floating
   * IP, firewall) sunucudan önce silinmezse Hetzner faturalamaya devam eder.
   */
  private static async teardownVps(service: Service): Promise<void> {
    const cfg = (service.config ?? {}) as {
      volumes?: Array<{ id: number }>;
      floatingIps?: Array<{ id: number }>;
    };
    for (const vol of cfg.volumes ?? []) {
      try {
        await HetznerService.detachVolume(vol.id).catch(() => {});
        await HetznerService.deleteVolume(vol.id);
      } catch (e) {
        logger.error('[lifecycle] terminate: volume silinemedi', { volume: vol.id, error: (e as Error).message });
      }
    }
    for (const fip of cfg.floatingIps ?? []) {
      try {
        await HetznerService.deleteFloatingIp(fip.id);
      } catch (e) {
        logger.error('[lifecycle] terminate: floating IP silinemedi', { fip: fip.id, error: (e as Error).message });
      }
    }
    try {
      const fws = await HetznerService.listFirewalls();
      const own = fws.find((f) => f.labels?.managed_by === 'adigehost' && f.labels?.service === service.id);
      if (own) await HetznerService.deleteFirewall(own.id);
    } catch (e) {
      logger.error('[lifecycle] terminate: firewall silinemedi', { service: service.id, error: (e as Error).message });
    }
    if (service.hetznerId) await HetznerService.deleteServer(service.hetznerId);
  }
}
