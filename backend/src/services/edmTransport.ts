import axios from 'axios';
import { logger } from '../config/logger';

/**
 * EDM Bilişim WCF SOAP düşük seviye taşıma katmanı.
 * node-soap WCF namespace'lerini doğru üretemediği için zarf elle kurulur:
 * operasyon sarmalayıcısı tempuri.org'da, alt elementler "unqualified" (namespace'siz).
 * IntegrationService bağımlılığı YOK (döngüsel import önlemek için).
 */
export interface EdmCreds {
  username: string;
  password: string;
  wsdlUrl?: string;
  testMode?: boolean;
}

const ENDPOINT_TEST = 'https://test.edmbilisim.com.tr/EFaturaEDM21ea/EFaturaEDM.svc';
const ENDPOINT_PROD = 'https://portal.edmbilisim.com.tr/EFaturaEDM/EFaturaEDM.svc';

export function edmEndpoint(creds: EdmCreds): string {
  if (creds.wsdlUrl && /\.svc/i.test(creds.wsdlUrl)) {
    return creds.wsdlUrl.replace(/\?.*$/, '');
  }
  return creds.testMode ? ENDPOINT_TEST : ENDPOINT_PROD;
}

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** REQUEST_HEADER (zorunlu alanlar: ACTION_DATE; oturum için SESSION_ID). */
function requestHeader(sessionId = '', reason = 'AdigeHost'): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, '');
  return (
    '<REQUEST_HEADER>' +
    `<SESSION_ID>${xmlEscape(sessionId)}</SESSION_ID>` +
    `<CLIENT_TXN_ID>${Date.now()}</CLIENT_TXN_ID>` +
    `<ACTION_DATE>${now}</ACTION_DATE>` +
    `<REASON>${xmlEscape(reason)}</REASON>` +
    '<APPLICATION_NAME>AdigeHost</APPLICATION_NAME>' +
    '<HOSTNAME>adigehost.tr</HOSTNAME>' +
    '<CHANNEL_NAME>AdigeHost</CHANNEL_NAME>' +
    '<COMPRESSED>N</COMPRESSED>' +
    '</REQUEST_HEADER>'
  );
}

/** Bir EDM SOAP işlemini çağırır. innerXml: operasyon gövdesi (REQUEST_HEADER hariç). */
export async function edmCall(
  creds: EdmCreds,
  operation: string,
  sessionId: string,
  innerXml: string,
): Promise<string> {
  const action = `${operation}Request`;
  const envelope =
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">' +
    '<soap:Body>' +
    `<tns:${action}>` +
    requestHeader(sessionId, operation) +
    innerXml +
    `</tns:${action}>` +
    '</soap:Body></soap:Envelope>';

  const { data } = await axios.post(edmEndpoint(creds), envelope, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${action}"` },
    timeout: 60000,
    responseType: 'text',
    // Fault'lar 500 ile gelir; metni okuyabilmek için hata sayma.
    validateStatus: () => true,
  });
  const xml = String(data);
  const fault = /<faultstring[^>]*>([^<]+)<\/faultstring>/i.exec(xml);
  if (fault) {
    logger.error(`EDM SOAP fault (${operation})`, { fault: fault[1] });
    throw new Error(fault[1]);
  }
  return xml;
}

/** Login → SESSION_ID döndürür. */
export async function edmLogin(creds: EdmCreds): Promise<string> {
  const inner = `<USER_NAME>${xmlEscape(creds.username)}</USER_NAME><PASSWORD>${xmlEscape(
    creds.password,
  )}</PASSWORD>`;
  const xml = await edmCall(creds, 'Login', '', inner);
  // Yanıt tag'leri xmlns="" gibi attribute içerebilir.
  const m = /<SESSION_ID[^>]*>([^<]+)<\/SESSION_ID>/i.exec(xml);
  if (!m) throw new Error('SESSION_ID alınamadı');
  return m[1];
}

/** Bir XML metninden tag içeriklerini (tümünü) çıkarır (attribute'lu tag'leri de). */
export function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
