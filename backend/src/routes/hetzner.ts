import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import { Service, SshKey } from '../models';
import { HetznerService } from '../services/HetznerService';
import { PricingService } from '../services/PricingService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService } from '../services/SettingsService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { encryptNullable } from '../security/encryption';
import { round2 } from '../utils/helpers';

/** EUR tutarını canlı kur + vps_markup ile TRY (KDV hariç) satış fiyatına çevirir. */
async function eurToVpsTRY(eur: number): Promise<number> {
  const [eurTry, markupStr] = await Promise.all([
    ExchangeRateService.getEurToTry(),
    SettingsService.get('vps_markup', '1.4'),
  ]);
  const markup = Math.max(1, Number(markupStr) || 1.4);
  return round2(eur * eurTry * markup);
}

interface VolumeRec {
  id: number;
  name: string;
  size: number;
  priceTRY: number;
}

/**
 * Hetzner VPS kontrol aksiyonları.
 * `:id` = AdigeHost servis id'si (Hetzner sunucu id'si değil) — güvenlik için
 * her aksiyon önce servis sahipliği doğrulanır, sonra service.hetznerId kullanılır.
 */
export const hetznerRouter = Router();

/** Servisi bulur, sahiplik + VPS + hetznerId kontrolü yapar. */
async function resolveVps(req: Request): Promise<{ service: Service; hetznerId: number }> {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw ApiError.notFound('Servis bulunamadı');
  if (req.user!.role !== 'admin' && service.userId !== req.user!.sub) throw ApiError.forbidden();
  if (service.type !== 'vps' || !service.hetznerId) {
    throw ApiError.badRequest('Bu servis bir Hetzner VPS değil veya henüz hazırlanmadı');
  }
  return { service, hetznerId: service.hetznerId };
}

async function audit(req: Request, action: string, serviceId: string) {
  await logActivity({
    userId: req.user!.sub,
    action,
    resource: 'service',
    resourceId: serviceId,
    ip: req.ip,
  });
}

// ============ Katalog (provisioning için) ============

hetznerRouter.get(
  '/catalog/server-types',
  asyncHandler(async (req, res) => {
    const location = (req.query.location as string) || 'nbg1';
    const types = await HetznerService.listServerTypes();
    const data = await Promise.all(
      types.map(async (t) => {
        const price = t.prices.find((p) => p.location === location) ?? t.prices[0];
        const eurMonthly = price ? Number(price.price_monthly.gross) : 0;
        return {
          name: t.name,
          cores: t.cores,
          memory: t.memory,
          disk: t.disk,
          priceMonthlyTRY: price ? await PricingService.eurToSalePriceTRY(eurMonthly) : null,
        };
      }),
    );
    res.json({ success: true, data });
  }),
);

hetznerRouter.get(
  '/catalog/locations',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await HetznerService.listLocations() });
  }),
);

hetznerRouter.get(
  '/catalog/images',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await HetznerService.listImages() });
  }),
);

// ============ Sunucu durumu ============

hetznerRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    const server = await HetznerService.getServer(hetznerId);
    res.json({ success: true, data: server });
  }),
);

hetznerRouter.get(
  '/:id/metrics',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    const type = (req.query.type as 'cpu' | 'disk' | 'network') ?? 'cpu';
    res.json({ success: true, data: await HetznerService.getMetrics(hetznerId, type) });
  }),
);

// ============ Güç aksiyonları ============

const powerActions: Array<{ path: string; fn: (id: number) => Promise<unknown>; action: string }> =
  [
    { path: 'poweron', fn: (id) => HetznerService.powerOn(id), action: 'hetzner.poweron' },
    { path: 'poweroff', fn: (id) => HetznerService.powerOff(id), action: 'hetzner.poweroff' },
    { path: 'reboot', fn: (id) => HetznerService.reboot(id), action: 'hetzner.reboot' },
    { path: 'reset', fn: (id) => HetznerService.reset(id), action: 'hetzner.reset' },
    { path: 'shutdown', fn: (id) => HetznerService.shutdown(id), action: 'hetzner.shutdown' },
  ];

for (const { path, fn, action } of powerActions) {
  hetznerRouter.post(
    `/:id/${path}`,
    asyncHandler(async (req, res) => {
      const { service, hetznerId } = await resolveVps(req);
      const result = await fn(hetznerId);
      await audit(req, action, service.id);
      res.json({ success: true, data: result });
    }),
  );
}

// ============ Rebuild (OS yeniden kur) ============
const rebuildSchema = z.object({
  body: z.object({ image: z.string().min(2), sshKeyId: z.string().uuid().optional() }),
});
hetznerRouter.post(
  '/:id/rebuild',
  validate(rebuildSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const { image, sshKeyId } = req.body as { image: string; sshKeyId?: string };

    // Seçili SSH anahtarını cloud-init ile enjekte et (rebuild ssh_keys almaz, user_data alır).
    let userData: string | undefined;
    let usedKey = false;
    if (sshKeyId) {
      const key = await SshKey.findByPk(sshKeyId);
      if (!key || key.userId !== req.user!.sub) throw ApiError.badRequest('Geçersiz SSH anahtarı');
      userData = `#cloud-config\nssh_authorized_keys:\n  - ${key.publicKey.trim()}\n`;
      usedKey = true;
    }

    const { action, rootPassword } = await HetznerService.rebuild(hetznerId, image, userData);

    // Yeni root parolayı (varsa) şifreli sakla; anahtar enjekte edildiyse işaretle.
    service.hetznerOs = image;
    service.config = {
      ...((service.config ?? {}) as Record<string, unknown>),
      rootPasswordEnc: encryptNullable(rootPassword),
      sshKeyUsed: usedKey,
    };
    service.changed('config', true);
    await service.save();

    await audit(req, 'hetzner.rebuild', service.id);
    res.json({ success: true, data: { action, sshKeyUsed: usedKey } });
  }),
);

// ============ Snapshot ============
const snapshotSchema = z.object({
  body: z.object({ description: z.string().max(100).optional() }),
});
hetznerRouter.post(
  '/:id/snapshot',
  validate(snapshotSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const desc = req.body.description ?? `${service.name} - ${new Date().toISOString()}`;
    const result = await HetznerService.createSnapshot(hetznerId, desc);
    await audit(req, 'hetzner.snapshot_create', service.id);
    res.status(201).json({ success: true, data: result });
  }),
);

hetznerRouter.get(
  '/:id/snapshots',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    const all = (await HetznerService.listSnapshots()) as Array<{
      id: number;
      created_from?: { id: number };
    }>;
    const own = all.filter((img) => img.created_from?.id === hetznerId);
    res.json({ success: true, data: own });
  }),
);

hetznerRouter.delete(
  '/:id/snapshots/:snapshotId',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const snapshotId = Number(req.params.snapshotId);
    if (!Number.isInteger(snapshotId)) throw ApiError.badRequest('Geçersiz snapshot');

    // Sahiplik: yalnızca bu sunucudan alınmış snapshot silinebilir. Aksi halde
    // bir müşteri başka müşterinin snapshot id'siyle silme yapabilirdi (IDOR).
    const all = (await HetznerService.listSnapshots()) as Array<{
      id: number;
      created_from?: { id: number };
    }>;
    const own = all.find((img) => img.id === snapshotId && img.created_from?.id === hetznerId);
    if (!own) throw ApiError.badRequest('Bu sunucuya ait bir snapshot bulunamadı');

    await HetznerService.deleteImage(snapshotId);
    await audit(req, 'hetzner.snapshot_delete', service.id);
    res.json({ success: true, message: 'Snapshot silindi' });
  }),
);

// Snapshot geri yükleme (restore = snapshot imajıyla rebuild).
hetznerRouter.post(
  '/:id/snapshots/:snapshotId/restore',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const snapshotId = Number(req.params.snapshotId);
    if (!Number.isInteger(snapshotId)) throw ApiError.badRequest('Geçersiz snapshot');

    // Güvenlik: yalnızca bu sunucudan alınmış bir snapshot geri yüklenebilir
    // (aksi halde başka bir kullanıcının imaj id'siyle rebuild denenebilirdi).
    const all = (await HetznerService.listSnapshots()) as Array<{
      id: number;
      created_from?: { id: number };
    }>;
    const own = all.find((img) => img.id === snapshotId && img.created_from?.id === hetznerId);
    if (!own) throw ApiError.badRequest('Bu sunucuya ait bir snapshot bulunamadı');

    // Restore = snapshot imajıyla rebuild. Snapshot'tan geri yüklemede Hetzner
    // yeni root parola ÜRETMEZ; snapshot anındaki kimlik bilgileri korunur.
    const { action, rootPassword } = await HetznerService.rebuild(hetznerId, String(snapshotId));
    if (rootPassword) {
      service.config = {
        ...((service.config ?? {}) as Record<string, unknown>),
        rootPasswordEnc: encryptNullable(rootPassword),
      };
      service.changed('config', true);
      await service.save();
    }

    await audit(req, 'hetzner.snapshot_restore', service.id);
    res.json({ success: true, data: { action }, message: 'Snapshot geri yükleniyor' });
  }),
);

// ============ Root parola sıfırlama ============
hetznerRouter.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const { rootPassword } = await HetznerService.resetPassword(hetznerId);
    // Panelde tekrar gösterebilmek için yeni parolayı şifreli sakla.
    if (rootPassword) {
      service.config = {
        ...((service.config ?? {}) as Record<string, unknown>),
        rootPasswordEnc: encryptNullable(rootPassword),
        sshKeyUsed: false,
      };
      service.changed('config', true);
      await service.save();
    }
    await audit(req, 'hetzner.reset_password', service.id);
    res.json({ success: true, data: { password: rootPassword } });
  }),
);

// ============ Konsol & Yedekleme ============
hetznerRouter.post(
  '/:id/console',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.requestConsole(hetznerId);
    await audit(req, 'hetzner.console', service.id);
    res.json({ success: true, data: result });
  }),
);

hetznerRouter.post(
  '/:id/backup/enable',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.enableBackup(hetznerId);
    await audit(req, 'hetzner.backup_enable', service.id);
    res.json({ success: true, data: result });
  }),
);

hetznerRouter.post(
  '/:id/backup/disable',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.disableBackup(hetznerId);
    await audit(req, 'hetzner.backup_disable', service.id);
    res.json({ success: true, data: result });
  }),
);

// ============ Rescale (plan değiştir) ============
const rescaleSchema = z.object({
  body: z.object({ serverType: z.string().min(2).max(20), upgradeDisk: z.boolean().optional() }),
});
hetznerRouter.post(
  '/:id/rescale',
  validate(rescaleSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const { serverType, upgradeDisk } = req.body as { serverType: string; upgradeDisk?: boolean };
    const types = await HetznerService.listServerTypes();
    const nt = types.find((t) => t.name === serverType);
    if (!nt) throw ApiError.badRequest(`Geçersiz sunucu tipi: ${serverType}`);
    const loc = service.hetznerLocation ?? 'nbg1';
    const newRow = nt.prices.find((p) => p.location === loc) ?? nt.prices[0];
    if (!newRow) throw ApiError.badRequest('Bu lokasyonda bu plan yok');

    // Fiyat delta'sı (KDV hariç): yeni plan − eski plan
    const ot = types.find((t) => t.name === service.hetznerPlan);
    const oldRow = ot?.prices.find((p) => p.location === loc) ?? ot?.prices[0];
    const oldPrice = oldRow ? await eurToVpsTRY(Number(oldRow.price_monthly.gross)) : 0;
    const newPrice = await eurToVpsTRY(Number(newRow.price_monthly.gross));

    await HetznerService.changeType(hetznerId, serverType, upgradeDisk === true);

    service.hetznerPlan = serverType;
    service.price = round2(Number(service.price) + (newPrice - oldPrice));
    service.config = {
      ...((service.config ?? {}) as Record<string, unknown>),
      cores: nt.cores,
      memory: nt.memory,
      disk: nt.disk,
    };
    service.changed('config', true);
    await service.save();
    await audit(req, 'hetzner.rescale', service.id);
    res.json({
      success: true,
      data: { serverType, cores: nt.cores, memory: nt.memory, disk: nt.disk, price: service.price },
    });
  }),
);

// ============ Rescue (kurtarma modu) ============
hetznerRouter.post(
  '/:id/rescue/enable',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const { rootPassword } = await HetznerService.enableRescue(hetznerId);
    await audit(req, 'hetzner.rescue_enable', service.id);
    res.json({ success: true, data: { password: rootPassword } });
  }),
);
hetznerRouter.post(
  '/:id/rescue/disable',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    await HetznerService.disableRescue(hetznerId);
    await audit(req, 'hetzner.rescue_disable', service.id);
    res.json({ success: true, message: 'Kurtarma modu kapatıldı' });
  }),
);

// ============ ISO ============
hetznerRouter.get(
  '/catalog/isos',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await HetznerService.listIsos() });
  }),
);
const isoSchema = z.object({ body: z.object({ iso: z.string().min(1) }) });
hetznerRouter.post(
  '/:id/iso/attach',
  validate(isoSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.attachIso(hetznerId, req.body.iso);
    await audit(req, 'hetzner.iso_attach', service.id);
    res.json({ success: true, data: result });
  }),
);
hetznerRouter.post(
  '/:id/iso/detach',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.detachIso(hetznerId);
    await audit(req, 'hetzner.iso_detach', service.id);
    res.json({ success: true, data: result });
  }),
);

// ============ Reverse DNS (PTR) ============
const ptrSchema = z.object({
  body: z.object({ ip: z.string().min(3), ptr: z.string().max(253).nullable().optional() }),
});
hetznerRouter.post(
  '/:id/reverse-dns',
  validate(ptrSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const { ip, ptr } = req.body as { ip: string; ptr?: string | null };
    const result = await HetznerService.changeReverseDns(hetznerId, ip, ptr ?? null);
    await audit(req, 'hetzner.reverse_dns', service.id);
    res.json({ success: true, data: result });
  }),
);

// ============ Volumes (blok depolama) ============
hetznerRouter.get(
  '/:id/volumes',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    res.json({ success: true, data: await HetznerService.listVolumes(hetznerId) });
  }),
);
const volumeSchema = z.object({
  body: z.object({
    size: z.coerce.number().int().min(10).max(1024),
    format: z.enum(['ext4', 'xfs']).optional(),
  }),
});
hetznerRouter.post(
  '/:id/volumes',
  validate(volumeSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const { size, format } = req.body as { size: number; format?: 'ext4' | 'xfs' };
    const perGbEur = Number(await SettingsService.get('vps_volume_eur_per_gb', '0.0572')) || 0.0572;
    const priceTRY = await eurToVpsTRY(perGbEur * size);
    const name = `adigehost-${service.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const { volume } = await HetznerService.createVolume({
      name,
      size,
      location: service.hetznerLocation ?? 'nbg1',
      serverId: hetznerId,
      format,
    });
    const cfg = (service.config ?? {}) as Record<string, unknown>;
    const volumes = (cfg.volumes as VolumeRec[] | undefined) ?? [];
    volumes.push({ id: volume.id, name, size, priceTRY });
    service.config = { ...cfg, volumes };
    service.price = round2(Number(service.price) + priceTRY);
    service.changed('config', true);
    await service.save();
    await audit(req, 'hetzner.volume_create', service.id);
    res.status(201).json({ success: true, data: { volume, priceTRY, monthlyPrice: service.price } });
  }),
);
hetznerRouter.delete(
  '/:id/volumes/:volumeId',
  asyncHandler(async (req, res) => {
    const { service } = await resolveVps(req);
    const volumeId = Number(req.params.volumeId);
    try {
      await HetznerService.detachVolume(volumeId);
    } catch {
      /* zaten ayrık olabilir */
    }
    await HetznerService.deleteVolume(volumeId);
    const cfg = (service.config ?? {}) as Record<string, unknown>;
    const volumes = (cfg.volumes as VolumeRec[] | undefined) ?? [];
    const removed = volumes.find((v) => v.id === volumeId);
    service.config = { ...cfg, volumes: volumes.filter((v) => v.id !== volumeId) };
    if (removed) service.price = round2(Math.max(0, Number(service.price) - removed.priceTRY));
    service.changed('config', true);
    await service.save();
    await audit(req, 'hetzner.volume_delete', service.id);
    res.json({ success: true, message: 'Volume silindi', data: { monthlyPrice: service.price } });
  }),
);

// ============ Firewall ============
/** Bu servise ait (managed_by=adigehost etiketli) firewall'u bulur. */
async function findServiceFirewall(serviceId: string) {
  const all = await HetznerService.listFirewalls();
  return all.find((f) => f.labels?.managed_by === 'adigehost' && f.labels?.service === serviceId) ?? null;
}

hetznerRouter.get(
  '/:id/firewall',
  asyncHandler(async (req, res) => {
    const { service } = await resolveVps(req);
    const fw = await findServiceFirewall(service.id);
    res.json({ success: true, data: fw ? { id: fw.id, rules: fw.rules } : null });
  }),
);

const fwRuleSchema = z.object({
  direction: z.enum(['in', 'out']),
  protocol: z.enum(['tcp', 'udp', 'icmp', 'esp', 'gre']),
  port: z.string().max(11).optional(),
  source_ips: z.array(z.string()).optional(),
  destination_ips: z.array(z.string()).optional(),
  description: z.string().max(255).optional(),
});
const fwSchema = z.object({ body: z.object({ rules: z.array(fwRuleSchema).max(50) }) });

hetznerRouter.put(
  '/:id/firewall',
  validate(fwSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const rules = (req.body.rules as unknown[]).map((r) => {
      const rule = r as Record<string, unknown>;
      // Hetzner: in kuralları source_ips, out kuralları destination_ips ister; boşsa herkes.
      if (rule.direction === 'in' && !rule.source_ips) rule.source_ips = ['0.0.0.0/0', '::/0'];
      if (rule.direction === 'out' && !rule.destination_ips)
        rule.destination_ips = ['0.0.0.0/0', '::/0'];
      return rule;
    });
    const existing = await findServiceFirewall(service.id);
    let fwId: number;
    if (!existing) {
      const created = await HetznerService.createFirewall(
        `adigehost-${service.id.slice(0, 8)}`,
        rules,
        hetznerId,
        service.id,
      );
      fwId = created.id;
    } else {
      fwId = existing.id;
      await HetznerService.setFirewallRules(fwId, rules);
      await HetznerService.applyFirewall(fwId, hetznerId);
    }
    await audit(req, 'hetzner.firewall_set', service.id);
    res.json({ success: true, data: { id: fwId, rules } });
  }),
);

hetznerRouter.delete(
  '/:id/firewall',
  asyncHandler(async (req, res) => {
    const { service } = await resolveVps(req);
    const fw = await findServiceFirewall(service.id);
    if (fw) await HetznerService.deleteFirewall(fw.id);
    await audit(req, 'hetzner.firewall_delete', service.id);
    res.json({ success: true, message: 'Firewall kaldırıldı' });
  }),
);

// ============ Networking: Public (IP + reverse DNS) ============
hetznerRouter.get(
  '/:id/network',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const srv = (await HetznerService.getServer(hetznerId)) as {
      public_net?: { ipv4?: { ip?: string; dns_ptr?: string }; ipv6?: { ip?: string } };
      private_net?: Array<{ network: number; ip: string }>;
    };
    // Private network isimlerini zenginleştir
    const priv = await Promise.all(
      (srv.private_net ?? []).map(async (p) => {
        const net = await HetznerService.getNetwork(p.network).catch(() => null);
        return { id: p.network, ip: p.ip, name: net?.name ?? `net-${p.network}`, ipRange: net?.ip_range };
      }),
    );
    res.json({
      success: true,
      data: {
        ipv4: srv.public_net?.ipv4?.ip ?? service.hetznerIp,
        ipv4Ptr: srv.public_net?.ipv4?.dns_ptr ?? null,
        ipv6: srv.public_net?.ipv6?.ip ?? service.hetznerIpv6,
        privateNetworks: priv,
      },
    });
  }),
);

// ============ Networking: Private Networks ============
hetznerRouter.post(
  '/:id/private-networks',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const name = `adigehost-${service.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const net = await HetznerService.createNetwork(name, '10.0.0.0/16', service.id);
    await HetznerService.attachToNetwork(hetznerId, net.id);
    await audit(req, 'hetzner.network_attach', service.id);
    res.status(201).json({ success: true, data: net });
  }),
);
hetznerRouter.delete(
  '/:id/private-networks/:networkId',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const networkId = Number(req.params.networkId);
    try {
      await HetznerService.detachFromNetwork(hetznerId, networkId);
    } catch {
      /* zaten ayrık olabilir */
    }
    // Sadece bu servise ait (adigehost yönetimli) ağı sil
    const net = await HetznerService.getNetwork(networkId).catch(() => null);
    const labels = (net as unknown as { labels?: Record<string, string> })?.labels;
    if (labels?.managed_by === 'adigehost' && labels?.service === service.id) {
      await HetznerService.deleteNetwork(networkId).catch(() => {});
    }
    await audit(req, 'hetzner.network_detach', service.id);
    res.json({ success: true, message: 'Özel ağ ayrıldı' });
  }),
);

// ============ Networking: Floating IPs ============
interface FipRec {
  id: number;
  ip: string;
  priceTRY: number;
}
hetznerRouter.get(
  '/:id/floating-ips',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    res.json({ success: true, data: await HetznerService.listFloatingIps(hetznerId) });
  }),
);
const fipSchema = z.object({ body: z.object({ type: z.enum(['ipv4', 'ipv6']).default('ipv4') }) });
hetznerRouter.post(
  '/:id/floating-ips',
  validate(fipSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const type = (req.body.type as 'ipv4' | 'ipv6') ?? 'ipv4';
    const eur = Number(await SettingsService.get('vps_floating_ip_eur', '1.19')) || 1.19;
    const priceTRY = await eurToVpsTRY(eur);
    const fip = await HetznerService.createFloatingIp(type, hetznerId, `adigehost ${service.id.slice(0, 8)}`, service.id);
    const cfg = (service.config ?? {}) as Record<string, unknown>;
    const fips = (cfg.floatingIps as FipRec[] | undefined) ?? [];
    fips.push({ id: fip.id, ip: fip.ip, priceTRY });
    service.config = { ...cfg, floatingIps: fips };
    service.price = round2(Number(service.price) + priceTRY);
    service.changed('config', true);
    await service.save();
    await audit(req, 'hetzner.floating_ip_create', service.id);
    res.status(201).json({ success: true, data: { floatingIp: fip, priceTRY, monthlyPrice: service.price } });
  }),
);
hetznerRouter.delete(
  '/:id/floating-ips/:fipId',
  asyncHandler(async (req, res) => {
    const { service } = await resolveVps(req);
    const fipId = Number(req.params.fipId);
    await HetznerService.deleteFloatingIp(fipId);
    const cfg = (service.config ?? {}) as Record<string, unknown>;
    const fips = (cfg.floatingIps as FipRec[] | undefined) ?? [];
    const removed = fips.find((f) => f.id === fipId);
    service.config = { ...cfg, floatingIps: fips.filter((f) => f.id !== fipId) };
    if (removed) service.price = round2(Math.max(0, Number(service.price) - removed.priceTRY));
    service.changed('config', true);
    await service.save();
    await audit(req, 'hetzner.floating_ip_delete', service.id);
    res.json({ success: true, message: 'Floating IP silindi', data: { monthlyPrice: service.price } });
  }),
);
