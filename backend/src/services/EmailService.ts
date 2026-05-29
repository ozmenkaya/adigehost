import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * SMTP e-posta gönderimi (Nodemailer).
 * Şablonlar (hosgeldin, fatura, ödeme vb.) kodlama fazında templates/ altına eklenir.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (!env.SMTP_HOST) {
    throw new Error('SMTP yapılandırılmamış (SMTP_HOST boş)');
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer | string }[];
}

export class EmailService {
  static async send(options: MailOptions): Promise<void> {
    const tx = getTransporter();
    const info = await tx.sendMail({ from: env.SMTP_FROM, ...options });
    logger.info('E-posta gönderildi', {
      to: options.to,
      subject: options.subject,
      messageId: info.messageId,
    });
  }

  static async verify(): Promise<boolean> {
    try {
      await getTransporter().verify();
      return true;
    } catch (err) {
      logger.error('SMTP doğrulama hatası', { error: (err as Error).message });
      return false;
    }
  }
}
