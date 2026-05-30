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
  cores: number;
  memory: number;
  disk: number;
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
        public_net: { enable_ipv4: true, enable_ipv6: true },
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
  static rebuild(id: number, image: string) {
    return this.action(id, 'rebuild', { image });
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

  static async healthcheck(): Promise<boolean> {
    try {
      await (await getClient()).get('/locations');
      return true;
    } catch {
      return false;
    }
  }
}
