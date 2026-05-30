import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { IntegrationService } from './IntegrationService';

/**
 * SMTP e-posta gönderimi (Nodemailer).
 * Yapılandırma önceliği: Entegrasyonlar (provider: smtp) → .env (geriye uyumluluk).
 */
interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

let transporter: Transporter | null = null;
let transporterKey: string | null = null;

/** Aktif SMTP yapılandırmasını (entegrasyon ya da env) döndürür. */
async function resolveConfig(): Promise<SmtpConfig | null> {
  const integ = await IntegrationService.getCredentials('smtp');
  if (integ?.host) {
    return {
      host: String(integ.host),
      port: Number(integ.port) || 587,
      secure: Boolean(integ.secure),
      user: integ.user ? String(integ.user) : undefined,
      pass: integ.pass ? String(integ.pass) : undefined,
      from: String(integ.from || env.SMTP_FROM),
    };
  }
  if (env.SMTP_HOST) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    };
  }
  return null;
}

async function getTransporter(): Promise<{ tx: Transporter; from: string }> {
  const cfg = await resolveConfig();
  if (!cfg) throw new Error('SMTP yapılandırılmamış (Entegrasyonlar → SMTP veya .env)');
  const key = `${cfg.host}:${cfg.port}:${cfg.user ?? ''}`;
  if (!transporter || transporterKey !== key) {
    transporterKey = key;
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      tls: { rejectUnauthorized: false }, // yerel/self-signed relay için
    });
  }
  return { tx: transporter, from: cfg.from };
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer | string }[];
}

export class EmailService {
  /** SMTP yapılandırılmış mı? (entegrasyon ya da env) */
  static async isConfigured(): Promise<boolean> {
    return (await resolveConfig()) !== null;
  }

  static async send(options: MailOptions): Promise<void> {
    const { tx, from } = await getTransporter();
    const info = await tx.sendMail({ from, ...options });
    logger.info('E-posta gönderildi', {
      to: options.to,
      subject: options.subject,
      messageId: info.messageId,
    });
  }

  static async verify(): Promise<boolean> {
    try {
      const { tx } = await getTransporter();
      await tx.verify();
      return true;
    } catch (err) {
      logger.error('SMTP doğrulama hatası', { error: (err as Error).message });
      return false;
    }
  }
}
