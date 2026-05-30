import { Op } from 'sequelize';
import { Server } from '../models/Server';
import { WHMService } from './WHMService';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

/**
 * Çok-sunucu yönetimi — yeni hosting hesabı için uygun sunucu seçimi ve
 * kapasite senkronizasyonu.
 */
export class ServerManager {
  /**
   * Yeni hosting hesabı için en uygun sunucuyu seçer:
   *  - status=active, acceptsNew=true
   *  - purpose hosting | mixed
   *  - disk kullanımı eşik altında
   *  - hesap sayısı limit altında
   *  - en az dolu olanı tercih eder (account_count'a göre)
   */
  static async getAvailableServer(): Promise<Server> {
    const candidates = await Server.findAll({
      where: {
        status: 'active',
        acceptsNew: true,
        purpose: { [Op.in]: ['hosting', 'mixed'] },
      },
      order: [['accountCount', 'ASC']],
    });

    const usable = candidates.filter((s) => {
      const diskOk = s.diskTotal === 0 || (s.diskUsed / s.diskTotal) * 100 < s.diskThreshold;
      const acctOk = s.accountLimit === 0 || s.accountCount < s.accountLimit;
      return diskOk && acctOk;
    });

    if (usable.length === 0) {
      logger.error('Uygun hosting sunucusu yok — admin müdahalesi gerekli');
      throw new ApiError(
        503,
        'Şu an uygun hosting sunucusu yok, lütfen daha sonra deneyin',
        'NO_SERVER',
      );
    }
    return usable[0];
  }

  /**
   * Tek bir sunucunun WHM metriklerini çeker ve DB'yi günceller.
   * (Cron: her gece 03:00 — jobs/scheduler.ts)
   */
  static async syncServer(server: Server): Promise<void> {
    try {
      const whm = WHMService.forServer(server);
      const accounts = (await whm.listAccounts()) as { acct?: unknown[] } | unknown[];
      const list = Array.isArray(accounts) ? accounts : (accounts.acct ?? []);
      server.accountCount = Array.isArray(list) ? list.length : server.accountCount;
      server.lastSync = new Date();
      await server.save();
      logger.info('Sunucu senkronize edildi', {
        server: server.name,
        accounts: server.accountCount,
      });
    } catch (err) {
      logger.error('Sunucu senkron hatası', { server: server.name, error: (err as Error).message });
    }
  }

  static async syncAll(): Promise<void> {
    const servers = await Server.findAll({ where: { status: 'active' } });
    for (const s of servers) {
      if (s.whmHost && s.whmToken) await this.syncServer(s);
    }
  }
}
