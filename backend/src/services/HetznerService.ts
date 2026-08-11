import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';

/**
 * Hetzner Cloud API istemcisi (https://docs.hetzner.cloud).
 * VPS provisioning ve kontrol aksiyonları.
 *
 * Aksiyonların çoğu asenkrondur: Hetzner bir "action" nesnesi döner
 * (status: running|success|error). Burada action tetiklenir ve durumu döndürülür.
 */

export interface HetznerServerType {
  id: number;
  name: string;
  description?: string;
  cores: number;
  memory: number;
  disk: number;
  cpu_type?: string; // 'shared' | 'dedicated'
  architecture?: string; // 'x86' | 'arm'
  /** 'regular_purpose' (CPX) | 'cost_optimized' (CX/CAX) | 'general_purpose' (CCX) */
  category?: string;
  deprecated?: boolean;
  prices: Array<{
    location: string;
    price_monthly: { gross: string };
    price_hourly: { gross: string };
  }>;
}

export interface HetznerCreateOptions {
  name: string;
  serverType: string; // örn "cpx21"
  image: string; // örn "ubuntu-22.04"
  location?: string; // örn "nbg1" | "fsn1" | "hel1"
  sshKeys?: number[];
  userData?: string;
  enableIpv4?: boolean; // varsayılan true
  enableIpv6?: boolean; // varsayılan true
  startAfterCreate?: boolean;
}

let client: AxiosInstance | null = null;
let clientToken: string | null = null;

/**
 * Token önceliği: varsayılan 'hetzner' entegrasyonu → env (geriye uyumluluk).
 * Token değişirse istemci yeniden kurulur.
 */
async function getClient(): Promise<AxiosInstance> {
  const creds = await IntegrationService.getCredentials('hetzner');
  const token = (creds?.apiToken as string | undefined) || env.HETZNER_API_TOKEN;
  if (!token) {
    throw ApiError.internal('Hetzner API token yapılandırılmamış (Entegrasyonlar veya .env)');
  }
  if (client && clientToken === token) return client;
  clientToken = token;
  client = axios.create({
    baseURL: 'https://api.hetzner.cloud/v1',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });
  return client;
}

/** Hetzner hata yanıtını ApiError'a çevirir. */
function toApiError(err: unknown, context: string): ApiError {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 502;
    const hz = err.response?.data?.error as { code?: string; message?: string } | undefined;
    const message = hz?.message ?? err.message;
    logger.error(`Hetzner API hatası (${context})`, { status, code: hz?.code, message });
    if (status === 404) return ApiError.notFound(`Hetzner: ${message}`);
    if (status === 422 || status === 400) return ApiError.badRequest(`Hetzner: ${message}`);
    return new ApiError(502, `Hetzner servis hatası: ${message}`, 'HETZNER_ERROR');
  }
  logger.error(`Hetzner beklenmeyen hata (${context})`, { error: String(err) });
  return ApiError.internal('Hetzner işlemi başarısız');
}

export class HetznerService {
  // --- Katalog ---
  static async listServerTypes(): Promise<HetznerServerType[]> {
    try {
      const { data } = await (
        await getClient()
      ).get('/server_types', { params: { per_page: 100 } });
      return (data.server_types as HetznerServerType[]).filter((t) => !t.deprecated);
    } catch (err) {
      throw toApiError(err, 'listServerTypes');
    }
  }

  /**
   * Lokasyon bazında "şu an sipariş edilebilir" server type id'leri.
   *
   * Hetzner'da bir tip fiyat listesinde göründüğü halde ilgili datacenter'da
   * stokta olmayabilir (tükendiğinde `available` listesinden düşer). Sipariş
   * ekranında yalnızca gerçekten kurulabilen tipleri göstermek için kullanılır.
   *
   * Aynı lokasyonda birden çok datacenter olabilir → birleşim alınır.
   */
  static async getAvailabilityByLocation(): Promise<Record<string, number[]>> {
    try {
      const { data } = await (await getClient()).get('/datacenters', { params: { per_page: 50 } });
      const dcs = data.datacenters as Array<{
        location: { name: string };
        server_types: { available: number[] };
      }>;
      const byLocation: Record<string, Set<number>> = {};
      for (const dc of dcs) {
        const loc = dc.location?.name;
        if (!loc) continue;
        const set = (byLocation[loc] ??= new Set());
        for (const id of dc.server_types?.available ?? []) set.add(id);
      }
      return Object.fromEntries(Object.entries(byLocation).map(([k, v]) => [k, [...v]]));
    } catch (err) {
      throw toApiError(err, 'getAvailabilityByLocation');
    }
  }

  static async listLocations(): Promise<unknown[]> {
    try {
      const { data } = await (await getClient()).get('/locations');
      return data.locations;
    } catch (err) {
      throw toApiError(err, 'listLocations');
    }
  }

  static async listImages(): Promise<unknown[]> {
    try {
      const { data } = await (
        await getClient()
      ).get('/images', {
        params: { type: 'system', per_page: 100, status: 'available' },
      });
      return data.images;
    } catch (err) {
      throw toApiError(err, 'listImages');
    }
  }

  // --- SSH anahtarları ---
  /**
   * Verilen public key'i Hetzner hesabında bulur, yoksa oluşturur ve id döner.
   * Aynı anahtar tekrar tekrar yüklenmez (public_key ile eşleştirilir).
   */
  static async ensureSshKey(publicKey: string, name: string): Promise<number> {
    const trimmed = publicKey.trim();
    try {
      const client = await getClient();
      const { data: list } = await client.get('/ssh_keys', { params: { per_page: 100 } });
      const existing = (list.ssh_keys as Array<{ id: number; public_key: string }>).find(
        (k) => k.public_key.trim() === trimmed,
      );
      if (existing) return existing.id;
      const { data } = await client.post('/ssh_keys', {
        name,
        public_key: trimmed,
        labels: { managed_by: 'adigehost' },
      });
      return data.ssh_key.id as number;
    } catch (err) {
      // İsim çakışması vb. → yeniden listeleyip anahtarı bul
      try {
        const { data: retry } = await (await getClient()).get('/ssh_keys', {
          params: { per_page: 100 },
        });
        const again = (retry.ssh_keys as Array<{ id: number; public_key: string }>).find(
          (k) => k.public_key.trim() === trimmed,
        );
        if (again) return again.id;
      } catch {
        /* yut */
      }
      throw toApiError(err, 'ensureSshKey');
    }
  }

  // --- Provisioning ---
  static async createServer(opts: HetznerCreateOptions) {
    try {
      const { data } = await (
        await getClient()
      ).post('/servers', {
        name: opts.name,
        server_type: opts.serverType,
        image: opts.image,
        location: opts.location,
        ssh_keys: opts.sshKeys,
        user_data: opts.userData,
        start_after_create: opts.startAfterCreate ?? true,
        public_net: {
          enable_ipv4: opts.enableIpv4 ?? true,
          enable_ipv6: opts.enableIpv6 ?? true,
        },
        labels: { managed_by: 'adigehost' },
      });
      logger.info('Hetzner sunucu oluşturuldu', { id: data.server?.id, name: opts.name });
      // root_password yalnızca ssh_keys verilmediğinde döner.
      return {
        server: data.server,
        rootPassword: (data.root_password as string | null) ?? null,
        action: data.action,
      };
    } catch (err) {
      throw toApiError(err, 'createServer');
    }
  }

  static async getServer(serverId: number) {
    try {
      const { data } = await (await getClient()).get(`/servers/${serverId}`);
      return data.server;
    } catch (err) {
      throw toApiError(err, 'getServer');
    }
  }

  static async deleteServer(serverId: number) {
    try {
      const { data } = await (await getClient()).delete(`/servers/${serverId}`);
      logger.info('Hetzner sunucu silindi', { id: serverId });
      return data.action;
    } catch (err) {
      throw toApiError(err, 'deleteServer');
    }
  }

  // --- Güç aksiyonları ---
  private static async action(serverId: number, name: string, body?: unknown) {
    try {
      const { data } = await (
        await getClient()
      ).post(`/servers/${serverId}/actions/${name}`, body ?? {});
      return data;
    } catch (err) {
      throw toApiError(err, `action:${name}`);
    }
  }

  static powerOn(id: number) {
    return this.action(id, 'poweron');
  }
  static powerOff(id: number) {
    return this.action(id, 'poweroff');
  }
  static reboot(id: number) {
    return this.action(id, 'reboot');
  }
  static reset(id: number) {
    return this.action(id, 'reset');
  }
  static shutdown(id: number) {
    return this.action(id, 'shutdown');
  }
  /** Sunucuyu imajdan yeniden kurar. userData (cloud-init) ile SSH anahtarı vb. enjekte edilebilir. */
  static async rebuild(
    id: number,
    image: string,
    userData?: string,
  ): Promise<{ action: unknown; rootPassword: string | null }> {
    const data = await this.action(id, 'rebuild', {
      image,
      ...(userData ? { user_data: userData } : {}),
    });
    return { action: data.action, rootPassword: (data.root_password as string | null) ?? null };
  }
  /** Root parolayı sıfırlar — Hetzner yeni parolayı yalnızca bu yanıtta döner. */
  static async resetPassword(id: number): Promise<{ rootPassword: string | null; action: unknown }> {
    const data = await this.action(id, 'reset_password');
    return { rootPassword: (data.root_password as string | null) ?? null, action: data.action };
  }
  static enableBackup(id: number) {
    return this.action(id, 'enable_backup');
  }
  static disableBackup(id: number) {
    return this.action(id, 'disable_backup');
  }

  static async requestConsole(id: number) {
    const data = await this.action(id, 'request_console');
    return { wssUrl: data.wss_url as string, password: data.password as string };
  }

  // --- Snapshot (image) ---
  static async createSnapshot(serverId: number, description: string) {
    try {
      const { data } = await (
        await getClient()
      ).post(`/servers/${serverId}/actions/create_image`, {
        type: 'snapshot',
        description,
      });
      return { action: data.action, image: data.image };
    } catch (err) {
      throw toApiError(err, 'createSnapshot');
    }
  }

  static async listSnapshots() {
    try {
      const { data } = await (
        await getClient()
      ).get('/images', {
        params: { type: 'snapshot', per_page: 100 },
      });
      return data.images;
    } catch (err) {
      throw toApiError(err, 'listSnapshots');
    }
  }

  static async deleteImage(imageId: number) {
    try {
      await (await getClient()).delete(`/images/${imageId}`);
      return true;
    } catch (err) {
      throw toApiError(err, 'deleteImage');
    }
  }

  // --- Metrikler ---
  static async getMetrics(serverId: number, type: 'cpu' | 'disk' | 'network' = 'cpu') {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 60 * 60 * 1000); // son 1 saat
      const { data } = await (
        await getClient()
      ).get(`/servers/${serverId}/metrics`, {
        params: { type, start: start.toISOString(), end: end.toISOString(), step: 60 },
      });
      return data.metrics;
    } catch (err) {
      throw toApiError(err, 'getMetrics');
    }
  }

  // --- Rescale (plan değiştir) ---
  /** Sunucu tipini değiştirir. Sunucu KAPALI olmalı. upgradeDisk=true diskteki büyümeyi de uygular (geri alınamaz). */
  static async changeType(id: number, serverType: string, upgradeDisk = false) {
    return this.action(id, 'change_type', { server_type: serverType, upgrade_disk: upgradeDisk });
  }

  // --- Rescue (kurtarma modu) ---
  /** Kurtarma sistemini etkinleştirir; dönen root_password ile reset sonrası rescue'ya boot edilir. */
  static async enableRescue(id: number, sshKeys?: number[]): Promise<{ rootPassword: string | null }> {
    const data = await this.action(id, 'enable_rescue', {
      type: 'linux64',
      ...(sshKeys && sshKeys.length ? { ssh_keys: sshKeys } : {}),
    });
    return { rootPassword: (data.root_password as string | null) ?? null };
  }
  static disableRescue(id: number) {
    return this.action(id, 'disable_rescue');
  }

  // --- ISO ---
  static async listIsos(): Promise<unknown[]> {
    try {
      const { data } = await (await getClient()).get('/isos', { params: { per_page: 100 } });
      return data.isos;
    } catch (err) {
      throw toApiError(err, 'listIsos');
    }
  }
  static attachIso(id: number, iso: string) {
    return this.action(id, 'attach_iso', { iso });
  }
  static detachIso(id: number) {
    return this.action(id, 'detach_iso');
  }

  // --- Reverse DNS (PTR) ---
  static changeReverseDns(id: number, ip: string, dnsPtr: string | null) {
    return this.action(id, 'change_dns_ptr', { ip, dns_ptr: dnsPtr });
  }

  // --- Volumes (blok depolama) ---
  static async createVolume(opts: {
    name: string;
    size: number; // GB (min 10)
    location: string;
    serverId?: number;
    format?: string; // 'ext4' | 'xfs'
  }) {
    try {
      const { data } = await (await getClient()).post('/volumes', {
        name: opts.name,
        size: opts.size,
        ...(opts.serverId ? { server: opts.serverId, automount: true } : { location: opts.location }),
        ...(opts.format ? { format: opts.format } : {}),
        labels: { managed_by: 'adigehost' },
      });
      return { volume: data.volume, action: data.action };
    } catch (err) {
      throw toApiError(err, 'createVolume');
    }
  }
  static async listVolumes(serverId?: number) {
    try {
      const { data } = await (await getClient()).get('/volumes', { params: { per_page: 100 } });
      const vols = data.volumes as Array<{ server: number | null }>;
      return serverId ? vols.filter((v) => v.server === serverId) : vols;
    } catch (err) {
      throw toApiError(err, 'listVolumes');
    }
  }
  static async detachVolume(volumeId: number) {
    try {
      const { data } = await (await getClient()).post(`/volumes/${volumeId}/actions/detach`, {});
      return data.action;
    } catch (err) {
      throw toApiError(err, 'detachVolume');
    }
  }
  static async deleteVolume(volumeId: number) {
    try {
      await (await getClient()).delete(`/volumes/${volumeId}`);
      return true;
    } catch (err) {
      throw toApiError(err, 'deleteVolume');
    }
  }

  // --- Firewall ---
  static async listFirewalls(): Promise<Array<{ id: number; name: string; labels?: Record<string, string>; rules: unknown[]; applied_to?: unknown[] }>> {
    try {
      const { data } = await (await getClient()).get('/firewalls', { params: { per_page: 100 } });
      return data.firewalls;
    } catch (err) {
      throw toApiError(err, 'listFirewalls');
    }
  }
  static async createFirewall(name: string, rules: unknown[], serverId: number, serviceId: string) {
    try {
      const { data } = await (await getClient()).post('/firewalls', {
        name,
        rules,
        apply_to: [{ type: 'server', server: { id: serverId } }],
        labels: { managed_by: 'adigehost', service: serviceId },
      });
      return data.firewall;
    } catch (err) {
      throw toApiError(err, 'createFirewall');
    }
  }
  static async setFirewallRules(firewallId: number, rules: unknown[]) {
    try {
      const { data } = await (await getClient()).post(`/firewalls/${firewallId}/actions/set_rules`, { rules });
      return data.actions;
    } catch (err) {
      throw toApiError(err, 'setFirewallRules');
    }
  }
  static async applyFirewall(firewallId: number, serverId: number) {
    try {
      const { data } = await (await getClient()).post(`/firewalls/${firewallId}/actions/apply_to_resources`, {
        apply_to: [{ type: 'server', server: { id: serverId } }],
      });
      return data.actions;
    } catch (err) {
      throw toApiError(err, 'applyFirewall');
    }
  }
  static async deleteFirewall(firewallId: number) {
    try {
      await (await getClient()).delete(`/firewalls/${firewallId}`);
      return true;
    } catch (err) {
      throw toApiError(err, 'deleteFirewall');
    }
  }

  // --- Private Networks ---
  static async createNetwork(name: string, ipRange = '10.0.0.0/16', serviceId?: string) {
    try {
      const { data } = await (await getClient()).post('/networks', {
        name,
        ip_range: ipRange,
        labels: { managed_by: 'adigehost', ...(serviceId ? { service: serviceId } : {}) },
      });
      return data.network as { id: number; name: string; ip_range: string };
    } catch (err) {
      throw toApiError(err, 'createNetwork');
    }
  }
  static async deleteNetwork(networkId: number) {
    try {
      await (await getClient()).delete(`/networks/${networkId}`);
      return true;
    } catch (err) {
      throw toApiError(err, 'deleteNetwork');
    }
  }
  static async getNetwork(networkId: number) {
    try {
      const { data } = await (await getClient()).get(`/networks/${networkId}`);
      return data.network as { id: number; name: string; ip_range: string };
    } catch (err) {
      throw toApiError(err, 'getNetwork');
    }
  }
  static attachToNetwork(serverId: number, networkId: number) {
    return this.action(serverId, 'attach_to_network', { network: networkId });
  }
  static detachFromNetwork(serverId: number, networkId: number) {
    return this.action(serverId, 'detach_from_network', { network: networkId });
  }

  // --- Floating IPs ---
  static async createFloatingIp(type: 'ipv4' | 'ipv6', serverId: number, description: string, serviceId: string) {
    try {
      const { data } = await (await getClient()).post('/floating_ips', {
        type,
        server: serverId,
        description,
        labels: { managed_by: 'adigehost', service: serviceId },
      });
      return data.floating_ip as { id: number; ip: string; type: string };
    } catch (err) {
      throw toApiError(err, 'createFloatingIp');
    }
  }
  static async listFloatingIps(serverId?: number) {
    try {
      const { data } = await (await getClient()).get('/floating_ips', { params: { per_page: 100 } });
      const ips = data.floating_ips as Array<{ id: number; ip: string; type: string; server: number | null; labels?: Record<string, string> }>;
      return serverId ? ips.filter((f) => f.server === serverId) : ips;
    } catch (err) {
      throw toApiError(err, 'listFloatingIps');
    }
  }
  static async deleteFloatingIp(fipId: number) {
    try {
      await (await getClient()).delete(`/floating_ips/${fipId}`);
      return true;
    } catch (err) {
      throw toApiError(err, 'deleteFloatingIp');
    }
  }

  static async healthcheck(): Promise<boolean> {
    try {
      await (await getClient()).get('/locations');
      return true;
    } catch {
      return false;
    }
  }
}
