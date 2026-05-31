import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';
import { edmCall, edmLogin, extractAll, extractAttr, assertEdmOk, type EdmCreds } from './edmTransport';

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
  static async checkUser(
    identifier: string,
  ): Promise<{ registered: boolean; aliases: string[]; pkAlias?: string; title?: string }> {
    const creds = await getCreds();
    const sessionId = await this.login();
    // DİKKAT: DOCUMENTTYPE gönderilmemeli — gönderilirse EDM boş yanıt döner.
    const inner = `<USER><IDENTIFIER>${identifier}</IDENTIFIER></USER>`;
    try {
      const xml = await edmCall(creds, 'CheckUser', sessionId, inner);
      const aliases = extractAll(xml, 'ALIAS');
      const title = extractAll(xml, 'TITLE')[0];
      // PK (Posta Kutusu) = alıcının e-fatura gelen-kutusu etiketi.
      const pkAlias = aliases.find((a) => /pk@/i.test(a)) ?? aliases[0];
      return { registered: aliases.length > 0, aliases, pkAlias, title };
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

  /**
   * E-fatura gönderir. İKİ ADIM:
   *  1) LoadInvoice — UBL'i taslak olarak yükler; EDM bir UUID atar (INVOICE UUID="..." attribute).
   *  2) SendInvoice — taslağı UUID ile GİB'e gönderir (<INVOICE UUID="..."/>).
   * senderVkn/senderAlias: satıcı VKN + GB etiketi. receiverVkn/receiverAlias: alıcı VKN + PK etiketi.
   */
  static async sendInvoice(
    senderVkn: string,
    senderAlias: string,
    receiverVkn: string,
    receiverAlias: string,
    ublXml: string,
    fileName: string,
    simulation = false,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const sessionId = await this.login();
    const content = Buffer.from(ublXml, 'utf8').toString('base64');

    // 1) Taslağı yükle.
    const loadInner =
      '<INVOICE>' +
      `<CONTENT>${content}</CONTENT>` +
      `<FILENAME>${fileName}</FILENAME>` +
      '</INVOICE>' +
      `<SENDER vkn="${senderVkn}" alias="${senderAlias}"/>` +
      `<RECEIVER vkn="${receiverVkn}" alias="${receiverAlias}"/>`;
    const loadXml = await edmCall(creds, 'LoadInvoice', sessionId, loadInner, simulation);
    assertEdmOk(loadXml, 'LoadInvoice');
    const uuid = extractAttr(loadXml, 'INVOICE', 'UUID');
    if (!uuid) throw new ApiError(502, 'EDM LoadInvoice UUID döndürmedi', 'EDM_ERROR');

    // 2) Taslağı gönder (UUID attribute olarak).
    const sendInner =
      `<SENDER vkn="${senderVkn}" alias="${senderAlias}"/>` + `<INVOICE UUID="${uuid}"/>`;
    const sendXml = await edmCall(creds, 'SendInvoice', sessionId, sendInner, simulation);
    assertEdmOk(sendXml, 'SendInvoice');

    return {
      uuid,
      status: extractAll(sendXml, 'STATUS')[0],
      raw: sendXml.slice(0, 500),
    };
  }

  /**
   * E-arşiv faturası gönderir (ArchiveInvoice). content = UBL-TR XML.
   */
  static async archiveInvoice(
    senderVkn: string,
    ublXml: string,
    fileName: string,
    simulation = false,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const sessionId = await this.login();
    void senderVkn; // e-arşivde gönderici oturumdan belirlenir
    const content = Buffer.from(ublXml, 'utf8').toString('base64');
    // E-arşiv kesimi: SetArchiveInvoice → <INVOICE><CONTENT>...</CONTENT><FILENAME>...</FILENAME></INVOICE>
    // (ArchiveInvoice ARCHIVE/DEARCHIVE = var olan faturayı arşivler, kesmez.)
    const inner =
      '<INVOICE>' +
      `<CONTENT>${content}</CONTENT>` +
      `<FILENAME>${fileName}</FILENAME>` +
      '</INVOICE>';
    const xml = await edmCall(creds, 'SetArchiveInvoice', sessionId, inner, simulation);
    assertEdmOk(xml, 'SetArchiveInvoice');
    return {
      uuid: extractAttr(xml, 'INVOICE', 'UUID') ?? extractAll(xml, 'UUID')[0],
      status: extractAll(xml, 'STATUS')[0],
      raw: xml.slice(0, 500),
    };
  }
}
