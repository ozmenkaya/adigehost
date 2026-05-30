import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';
import { edmCall, edmLogin, extractAll, type EdmCreds } from './edmTransport';

/**
 * EDM Bilişim e-Fatura/e-Arşiv entegrasyonu (WCF SOAP, elle zarf — bkz. edmTransport).
 *
 * Akış: Login → SESSION_ID → CheckUser(VKN) ile e-fatura mükellefi mi belirle →
 *       SendInvoice (e-fatura) | ArchiveInvoice (e-arşiv) [UBL-TR XML ile].
 *
 * Doküman: https://docs.edmbilisim.com.tr/api/api-documentation/
 */
let session: { id: string; expires: number } | null = null;

async function getCreds(): Promise<EdmCreds> {
  const raw = await IntegrationService.getCredentials('edm');
  if (!raw?.username || !raw?.password) {
    throw ApiError.internal('EDM yapılandırılmamış (Entegrasyonlar → EDM Bilişim)');
  }
  return raw as unknown as EdmCreds;
}

export class EDMService {
  /** Oturum açar (cache'li SESSION_ID varsa onu döndürür). */
  static async login(): Promise<string> {
    if (session && session.expires > Date.now()) return session.id;
    const creds = await getCreds();
    try {
      const id = await edmLogin(creds);
      session = { id, expires: Date.now() + 25 * 60 * 1000 };
      logger.info('EDM oturumu açıldı');
      return id;
    } catch (err) {
      throw new ApiError(502, `EDM oturum hatası: ${(err as Error).message}`, 'EDM_AUTH');
    }
  }

  /**
   * VKN/TCKN e-fatura mükellefi mi? registered=true → e-fatura, false → e-arşiv.
   */
  static async checkUser(identifier: string): Promise<{ registered: boolean; aliases: string[] }> {
    const creds = await getCreds();
    const sessionId = await this.login();
    const inner =
      '<USER>' +
      `<IDENTIFIER>${identifier}</IDENTIFIER>` +
      '<DOCUMENTTYPE>INVOICE</DOCUMENTTYPE>' +
      '</USER>';
    try {
      const xml = await edmCall(creds, 'CheckUser', sessionId, inner);
      const aliases = extractAll(xml, 'ALIAS');
      // Yanıtta kullanıcı/alias varsa e-fatura mükellefidir.
      return { registered: aliases.length > 0, aliases };
    } catch (err) {
      throw new ApiError(
        502,
        `EDM kullanıcı sorgulama hatası: ${(err as Error).message}`,
        'EDM_ERROR',
      );
    }
  }

  static async healthcheck(): Promise<boolean> {
    try {
      await this.login();
      return true;
    } catch {
      return false;
    }
  }

  // TODO (sonraki adım): SendInvoice / ArchiveInvoice — UBL-TR 1.2 XML üretimi + gönderim.
}
