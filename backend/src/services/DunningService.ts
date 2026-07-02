import { Op } from 'sequelize';
import { Invoice, InvoiceItem, Service, User } from '../models';
import { SettingsService } from './SettingsService';
import { NotificationService } from './NotificationService';
import { billingQueue } from '../jobs/queue';
import { logActivity } from './AuditService';
import { logger } from '../config/logger';

/**
 * Borç takip (dunning) durum makinesi — her gün çalışır.
 *
 * Mevcut ödenmemiş/gecikmiş faturalar üzerinden ilerler:
 *   1) Hatırlatma: vadeye `warning_days` (ör. 7,3,1) kala ve vade geçtikten sonra
 *      aynı eşiklerde ödeme hatırlatma e-postası.
 *   2) Gecikme: vadesi geçen `unpaid` fatura → `overdue` işaretlenir.
 *   3) Askıya alma: vade + `suspend_after` gün geçtiyse faturaya bağlı aktif
 *      servisler askıya alınır (bekleyen ilk siparişler iptal edilir).
 *   4) Sonlandırma: `suspend_after` sonrası `terminate_after` gün askıda kalan
 *      servisler kalıcı sonlandırılır — YALNIZCA `auto_terminate` ayarı açıksa.
 *      Kapalıyken (varsayılan) hiçbir sunucu otomatik silinmez; yalnızca
 *      "sonlandırmaya uygun" sayısı loglanır ve admin elle karar verir.
 *
 * Altyapı aksiyonları (suspend/terminate) billingQueue'ya alınır; böylece
 * Hetzner/WHM çağrıları hata alırsa yeniden denenir ve cron döngüsü bloklanmaz.
 *
 * Otomatik yenilemeli (autoRenew) servisler AutoRenewService tarafından ayrıca
 * yönetilir; başarısız tahsilatta oradaki fatura `cancelled` olduğundan bu akış
 * onları tekrar işlemez.
 */

/** İki tarihin UTC-gün farkı (a - b). Pozitif = a ileride. */
function daysBetweenUTC(a: Date, b: Date): number {
  const ad = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bd = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ad - bd) / 86400000);
}

export class DunningService {
  static async runDaily(): Promise<{
    reminded: number;
    markedOverdue: number;
    suspended: number;
    cancelledOrders: number;
    terminated: number;
    terminationPending: number;
  }> {
    const now = new Date();
    const warningDays = (await SettingsService.get('warning_days', '1,3,7'))
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const suspendAfter = Number(await SettingsService.get('suspend_after', '7'));
    const terminateAfter = Number(await SettingsService.get('terminate_after', '30'));
    // Otomatik sonlandırma varsayılan KAPALI — açık değilse sunucu silinmez.
    const autoTerminate = (await SettingsService.get('auto_terminate', 'false')) === 'true';

    let reminded = 0;
    let markedOverdue = 0;
    let suspended = 0;
    let cancelledOrders = 0;
    let terminated = 0;
    let terminationPending = 0; // sonlandırmaya uygun ama auto_terminate kapalı

    // ── 1–3) Ödenmemiş / gecikmiş faturalar ──────────────────────────────────
    const openInvoices = await Invoice.findAll({
      where: { status: { [Op.in]: ['unpaid', 'overdue'] } },
      include: [{ model: InvoiceItem, as: 'items' }],
      limit: 1000,
    });

    for (const invoice of openInvoices) {
      const dueDate = new Date(invoice.dueDate as unknown as string);
      const daysUntilDue = daysBetweenUTC(dueDate, now); // <0 => gecikmiş
      const daysOverdue = -daysUntilDue;

      // Gecikmeyi işaretle
      if (invoice.status === 'unpaid' && daysOverdue > 0) {
        invoice.status = 'overdue';
        await invoice.save();
        markedOverdue++;
      }

      // Askıya alma eşiği geçildi mi?
      if (daysOverdue >= suspendAfter) {
        const acted = await this.enforceSuspension(invoice);
        suspended += acted.suspended;
        cancelledOrders += acted.cancelledOrders;
        continue; // askıya alınan faturada ayrıca hatırlatma gönderme
      }

      // Hatırlatma: vadeye X gün kala veya X gün geçince (eşik gününde bir kez).
      if (warningDays.includes(daysUntilDue) || warningDays.includes(daysOverdue)) {
        const user = await User.findByPk(invoice.userId);
        if (user) {
          await NotificationService.sendPaymentReminder({
            to: user.email,
            firstName: user.firstName,
            invoiceNum: invoice.invoiceNum,
            total: Number(invoice.total),
            dueDate,
            daysUntilDue,
          }).catch(() => {});
          reminded++;
        }
      }
    }

    // ── 4) Askıda çok kalan servisleri sonlandır ─────────────────────────────
    const suspendedServices = await Service.findAll({
      where: { status: 'suspended' },
      limit: 1000,
    });
    for (const svc of suspendedServices) {
      const suspendedAtRaw = (svc.config as { suspendedAt?: string } | null)?.suspendedAt;
      if (!suspendedAtRaw) continue;
      const suspendedAt = new Date(suspendedAtRaw);
      if (daysBetweenUTC(now, suspendedAt) >= terminateAfter) {
        if (autoTerminate) {
          await billingQueue.add({
            type: 'terminate',
            serviceId: svc.id,
            reason: `${terminateAfter} gün askıda kaldıktan sonra otomatik sonlandırma`,
          });
          terminated++;
        } else {
          terminationPending++;
        }
      }
    }

    // ── 5) İptal edilmiş servislerde ödenen dönem sonuna gelinince sonlandır ──
    // Müşteri iptali dönem sonuna kadar aktif kalır; nextDue geçince kaynak silinir.
    const cancelledServices = await Service.findAll({
      where: { status: 'cancelled', nextDue: { [Op.ne]: null } },
      limit: 1000,
    });
    for (const svc of cancelledServices) {
      if (!svc.nextDue) continue;
      const nextDue = new Date(svc.nextDue as unknown as string);
      if (daysBetweenUTC(now, nextDue) >= 0) {
        if (autoTerminate) {
          await billingQueue.add({
            type: 'terminate',
            serviceId: svc.id,
            reason: 'İptal edilen hizmetin ödenen dönemi sona erdi',
          });
          terminated++;
        } else {
          terminationPending++;
        }
      }
    }

    if (terminationPending > 0) {
      logger.warn(
        `[dunning] ${terminationPending} servis sonlandırmaya uygun (auto_terminate kapalı — elle karar bekliyor)`,
      );
    }
    logger.info('[dunning] Tamamlandı', {
      reminded, markedOverdue, suspended, cancelledOrders, terminated, terminationPending,
    });
    return { reminded, markedOverdue, suspended, cancelledOrders, terminated, terminationPending };
  }

  /**
   * Vadesi çok geçmiş bir faturaya bağlı servisleri yaptırıma tabi tutar:
   *  - `active` servis → askıya alma kuyruğuna alınır.
   *  - `pending` servis (hiç ödenmemiş ilk sipariş) → sipariş iptal edilir,
   *    fatura `cancelled` yapılır (kurulacak altyapı yok).
   */
  private static async enforceSuspension(
    invoice: Invoice,
  ): Promise<{ suspended: number; cancelledOrders: number }> {
    const items = (invoice.get('items') as InvoiceItem[]) ?? [];
    const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((s): s is string => !!s))];
    if (serviceIds.length === 0) return { suspended: 0, cancelledOrders: 0 };

    let suspended = 0;
    let cancelledOrders = 0;
    let allPendingCancelled = true;

    for (const serviceId of serviceIds) {
      const service = await Service.findByPk(serviceId);
      if (!service) continue;

      if (service.status === 'active') {
        await billingQueue.add({
          type: 'suspend',
          serviceId: service.id,
          reason: `Ödenmemiş fatura: ${invoice.invoiceNum}`,
        });
        suspended++;
        allPendingCancelled = false;
      } else if (service.status === 'pending') {
        // Hiç ödenmemiş ilk sipariş — provision edilmedi, iptal et.
        service.status = 'cancelled';
        await service.save();
        await logActivity({
          userId: service.userId,
          action: 'service.order_cancelled_unpaid',
          resource: 'service',
          resourceId: service.id,
          details: { invoice: invoice.invoiceNum },
        });
        cancelledOrders++;
      } else {
        // suspended/cancelled/terminated → zaten pasif
        allPendingCancelled = allPendingCancelled && service.status !== 'suspended';
      }
    }

    // Faturaya bağlı tüm servisler yalnızca bekleyen sipariş idiyse, fatura da iptal.
    if (allPendingCancelled && suspended === 0 && cancelledOrders > 0) {
      invoice.status = 'cancelled';
      await invoice.save();
    }

    return { suspended, cancelledOrders };
  }
}
