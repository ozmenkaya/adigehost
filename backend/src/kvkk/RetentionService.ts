import { logger } from '../config/logger';

/**
 * Otomatik veri saklama/silme politikaları (BTK 5651, VUK)
 * İskelet — KVKK akışları kodlama fazında HOSTPANEL_PROJECT.md'ye göre tamamlanacak.
 */
export class RetentionService {
  static async noop(): Promise<void> {
    logger.debug('RetentionService iskelet');
  }
}
