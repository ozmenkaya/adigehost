import { randomBytes } from 'node:crypto';
import { Service } from '../models/Service';
import { Server } from '../models/Server';
import { Product } from '../models/Product';
import { WHMService } from './WHMService';
import { HetznerService } from './HetznerService';
import { DomainService, type DomainContact } from './DomainService';
import { AlantronService } from './AlantronService';
import { IntegrationService } from './IntegrationService';
import { ServerManager } from './ServerManager';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { slugify } from '../utils/helpers';
import { encryptNullable } from '../security/encryption';

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

  /**
   * Bir VPS servisini Hetzner'da oluşturur.
   * serverType/location/image bilgisi ürünün specs alanından okunur.
   */
  static async provisionVps(service: Service): Promise<{
    ipAddress: string | null;
    ipv6: string | null;
    rootPassword: string | null;
    sshKeyUsed: boolean;
  }> {
    if (service.type !== 'vps') throw ApiError.badRequest('Servis VPS türünde değil');

    // Yapılandırma iki kaynaktan gelebilir:
    //  1) Configurator/sepet siparişi → service.hetznerPlan/Location/Os + service.config
    //  2) Eski ürün-tabanlı sipariş → Product.specs
    const product = service.productId ? await Product.findByPk(service.productId) : null;
    const specs = (product?.specs ?? {}) as {
      serverType?: string;
      location?: string;
      image?: string;
    };
    const cfg = (service.config ?? {}) as {
      withIpv4?: boolean;
      sshKey?: string;
      backups?: boolean;
      userData?: string;
    };
    const serverType = service.hetznerPlan ?? specs.serverType;
    const location = service.hetznerLocation ?? specs.location ?? 'nbg1';
    const image = service.hetznerOs ?? specs.image ?? 'ubuntu-22.04';
    if (!serverType) throw ApiError.badRequest('VPS yapılandırması (serverType) eksik');

    // SSH anahtarı (opsiyonel) — başarısız olursa root parola ile devam
    let sshKeys: number[] | undefined;
    if (cfg.sshKey && cfg.sshKey.trim()) {
      try {
        sshKeys = [await HetznerService.ensureSshKey(cfg.sshKey, `adigehost-${service.id}`)];
      } catch (e) {
        logger.warn('SSH anahtarı eklenemedi, root parola ile devam ediliyor', {
          service: service.id,
          error: (e as Error).message,
        });
      }
    }

    const name = `${slugify(service.name)}-${Date.now().toString(36)}`;
    const { server, rootPassword } = await HetznerService.createServer({
      name,
      serverType,
      image,
      location,
      enableIpv4: cfg.withIpv4 !== false,
      sshKeys,
      userData: cfg.userData?.trim() ? cfg.userData : undefined,
      startAfterCreate: true,
    });

    // Otomatik yedekleme (opsiyonel, +%20) — başarısız olursa sunucu yine de aktif
    if (cfg.backups) {
      try {
        await HetznerService.enableBackup(server.id);
      } catch (e) {
        logger.warn('Yedekleme etkinleştirilemedi', {
          service: service.id,
          error: (e as Error).message,
        });
      }
    }

    const sshKeyUsed = !!(sshKeys && sshKeys.length);

    service.status = 'active';
    service.hetznerId = server.id;
    service.hetznerIp = server.public_net?.ipv4?.ip ?? null;
    service.hetznerIpv6 = server.public_net?.ipv6?.ip ?? null;
    service.hetznerPlan = serverType;
    service.hetznerLocation = location;
    service.hetznerOs = image;
    // Root parolayı panelde tekrar gösterebilmek için AES-256-GCM ile şifreli sakla.
    // (Hetzner API'de root_password yalnızca oluşturmada bir kez döner.)
    service.config = {
      ...(cfg as Record<string, unknown>),
      rootPasswordEnc: encryptNullable(rootPassword),
      sshKeyUsed,
    };
    service.changed('config', true);
    await service.save();

    logger.info('VPS provision edildi', { service: service.id, hetznerId: server.id, sshKeyUsed });
    return { ipAddress: service.hetznerIp, ipv6: service.hetznerIpv6, rootPassword, sshKeyUsed };
  }

  /**
   * Bir domain servisini uygun sağlayıcıyla kaydeder.
   * Öncelik: 1) config.provider 2) aktif entegrasyon kontrolü (alantron > domainnameapi)
   * İletişim bilgisi müşteri profilinden kurulur (eksikse hata).
   */
  static async provisionDomain(service: Service): Promise<{ domain: string; provider: string }> {
    if (service.type !== 'domain' || !service.domain) {
      throw ApiError.badRequest('Geçersiz domain servisi');
    }
    const user = await User.findByPk(service.userId);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');

    const cfg = service.config as { period?: number; provider?: string } | null;
    const period = Number(cfg?.period ?? 1);

    // Hangi sağlayıcıyı kullanacağız?
    const preferredProvider =
      cfg?.provider ??
      ((await IntegrationService.getCredentials('alantron').catch(() => null))?.resellerno
        ? 'alantron'
        : 'domainnameapi');

    if (preferredProvider === 'alantron') {
      // Alantron: alan adı, yetkilisinin kullanıcı adı altında panelde görünür.
      // Müşteri başına yeni contact üretilirse alan adı bayi panelimizde
      // görünmez olur — bu yüzden bayi yetkilisi kullanılır. Müşteri sahipliği
      // panelimizdeki Service kaydıyla takip edilir.
      const contactId = await AlantronService.getOwnerContactId();
      const dotIdx = service.domain.indexOf('.');
      const sld = service.domain.slice(0, dotIdx);
      const tld = service.domain.slice(dotIdx + 1);
      const result = await AlantronService.register(sld, tld, period, contactId);
      // registrycode → config'e sakla (yenileme için).
      service.config = { ...(cfg ?? {}), registrycode: result.registrycode };
      service.status = 'active';
      await service.save();
      logger.info('Alantron: domain provision edildi', {
        service: service.id,
        domain: service.domain,
        registrycode: result.registrycode,
      });
      return { domain: service.domain, provider: 'alantron' };
    }

    // DomainNameAPI (varsayılan) — müşteri iletişim bilgisi zorunlu.
    if (!user.address || !user.city || !user.phone) {
      throw ApiError.badRequest(
        'Domain kaydı için müşteri profili eksik (adres, şehir, telefon gerekli)',
      );
    }
    const phoneDigits = user.phone.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    const contact: DomainContact = {
      contactType: 'Registrant',
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.company ?? '',
      eMail: user.email,
      address: user.address,
      city: user.city,
      country: 'TR',
      phoneCountryCode: '90',
      phone: phoneDigits,
    };
    await DomainService.register(service.domain, period, contact);
    service.status = 'active';
    await service.save();
    logger.info('DomainNameAPI: domain provision edildi', {
      service: service.id,
      domain: service.domain,
    });
    return { domain: service.domain, provider: 'domainnameapi' };
  }

  /**
   * Dışarıdan domain transferini başlatır (Alantron transferdomain).
   * Service.config.authCode kullanılarak çağrı yapılır.
   * Transfer 5-7 gün sürer, sonra durumu polling ile güncellenir.
   * Bu çağrı sadece transfer talebini başlatır.
   */
  static async transferDomain(
    service: Service,
    years: number,
  ): Promise<{ domain: string; registrycode: number; pending: true }> {
    if (service.type !== 'domain' || !service.domain) {
      throw ApiError.badRequest('Geçersiz domain servisi');
    }
    const cfg = (service.config ?? {}) as { authCode?: string; transfer?: boolean };
    if (!cfg.authCode) throw ApiError.badRequest('Transfer auth code yok');

    const user = await User.findByPk(service.userId);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');

    // Kayıtta olduğu gibi bayi yetkilisi kullanılır (panelde görünürlük).
    const contactId = await AlantronService.getOwnerContactId();

    const result = await AlantronService.transferDomain({
      domain: service.domain,
      authCode: cfg.authCode,
      year: years,
      contactId,
    });

    // registrycode'u config'e kaydet — status pending kalır, transfer tamamlanınca admin active yapacak
    service.config = {
      ...(service.config ?? {}),
      registrycode: result.registrycode,
      authCode: undefined, // güvenlik: artık saklamayalım
    };
    await service.save();

    logger.info('Alantron: transfer talebi başlatıldı', {
      service: service.id, domain: service.domain, registrycode: result.registrycode,
    });
    return { domain: service.domain, registrycode: result.registrycode, pending: true };
  }

  /**
   * Bir domain servisini Alantron üzerinde yeniler (renewdomain).
   * years: 1-10. nextDue ileri alınır.
   */
  static async renewDomain(
    service: Service,
    years: number,
  ): Promise<{ domain: string; provider: string; newExpiry: Date }> {
    if (service.type !== 'domain' || !service.domain) {
      throw ApiError.badRequest('Geçersiz domain servisi');
    }
    const cfg = (service.config ?? {}) as { registrycode?: number; provider?: string };
    if (!cfg.registrycode) {
      throw ApiError.badRequest('Bu domain için Alantron registrycode kaydedilmemiş');
    }

    const currentExpiry = service.nextDue ?? new Date();
    const expEpoch = Math.floor(new Date(currentExpiry).getTime() / 1000);

    await AlantronService.renew(cfg.registrycode, years, expEpoch);

    // nextDue ileri al
    const newExpiry = new Date(currentExpiry);
    newExpiry.setFullYear(newExpiry.getFullYear() + years);
    service.nextDue = newExpiry;
    if (service.status === 'suspended') service.status = 'active';
    await service.save();

    logger.info('Alantron: domain yenilendi', {
      service: service.id, domain: service.domain, years, newExpiry,
    });
    return { domain: service.domain, provider: 'alantron', newExpiry };
  }
}
