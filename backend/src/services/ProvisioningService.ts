import { randomBytes } from 'node:crypto';
import { Service } from '../models/Service';
import { Server } from '../models/Server';
import { Product } from '../models/Product';
import { WHMService } from './WHMService';
import { ServerManager } from './ServerManager';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';

/** Alan adından geçerli cPanel kullanıcı adı üretir (≤16, harfle başlar, [a-z0-9]). */
export function generateCpanelUser(domain: string): string {
  const base = domain
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  // cPanel rezerve kelimelerinden kaçın (test, root, cpanel vb.) → harf öneki ekle.
  const reserved = /^(test|root|cpanel|mysql|admin|www|ftp|mail)/;
  const safe = reserved.test(base) || !/^[a-z]/.test(base) ? `a${base}` : base;
  const suffix = randomBytes(2).toString('hex');
  return `${safe}${suffix}`.slice(0, 16);
}

export interface ProvisionResult {
  cpanelUser: string;
  password: string;
  cpanelUrl: string;
}

export class ProvisioningService {
  /**
   * Bir hosting servisini gerçekten WHM'de oluşturur (cPanel hesabı).
   * Sunucu önceliği: service.serverId → product.serverId → ServerManager (otomatik).
   * Servisi günceller (serverId, config.cpanelUser, status=active).
   */
  static async provisionHosting(service: Service): Promise<ProvisionResult> {
    if (service.type !== 'hosting') throw ApiError.badRequest('Servis hosting türünde değil');
    if (!service.domain) throw ApiError.badRequest('Servis için alan adı tanımlı değil');

    const product = service.productId ? await Product.findByPk(service.productId) : null;

    // Sunucu seç.
    let server: Server | null = null;
    if (service.serverId) server = await Server.findByPk(service.serverId);
    else if (product?.serverId) server = await Server.findByPk(product.serverId);
    if (!server) server = await ServerManager.getAvailableServer();

    const cpanelUser = generateCpanelUser(service.domain);
    const password = randomBytes(12).toString('base64url');
    const whm = WHMService.forServer(server);

    await whm.createAccount({
      username: cpanelUser,
      domain: service.domain,
      password,
      plan: product?.whmPackage ?? undefined,
    });

    service.serverId = server.id;
    service.status = 'active';
    service.config = { ...(service.config ?? {}), cpanelUser, plan: product?.whmPackage ?? null };
    await service.save();

    server.accountCount += 1;
    await server.save();

    logger.info('Hosting provision edildi', {
      service: service.id,
      server: server.name,
      cpanelUser,
    });
    return { cpanelUser, password, cpanelUrl: `https://${server.whmHost}:2083` };
  }
}
