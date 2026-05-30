import { env } from '../config/env';
import { logger } from '../config/logger';
import { EmailService } from './EmailService';

/**
 * Uygulama bildirim e-postaları (doğrulama, şifre sıfırlama vb.).
 * SMTP yapılandırılmamışsa hata fırlatmaz — linki log'a yazar (geliştirme/test
 * sırasında akışın çalışmaya devam etmesi için). Production'da SMTP zorunlu.
 *
 * NOT: Zengin HTML şablonlar Faz 3'te templates/ altına taşınacak.
 */
function wrapHtml(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">${cta.label}</a></p>
       <p style="color:#64748b;font-size:13px">Buton çalışmazsa bu adresi tarayıcıya yapıştırın:<br>${cta.url}</p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#1d4ed8">${env.APP_NAME}</h2>
    <h3>${title}</h3>
    ${body}
    ${button}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="color:#94a3b8;font-size:12px">Bu e-postayı beklemiyorsanız dikkate almayın.</p>
  </div>`;
}

async function deliver(to: string, subject: string, html: string, devNote: string): Promise<void> {
  if (!EmailService.isConfigured()) {
    logger.warn(`[SMTP yapılandırılmamış] ${subject} → ${to} | ${devNote}`);
    return;
  }
  await EmailService.send({ to, subject, html });
}

export class NotificationService {
  /** E-posta doğrulama linki gönderir. */
  static async sendEmailVerification(to: string, token: string): Promise<void> {
    const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    const html = wrapHtml(
      'E-posta Adresinizi Doğrulayın',
      '<p>Hesabınızı etkinleştirmek için aşağıdaki butona tıklayın. Link 24 saat geçerlidir.</p>',
      { label: 'E-postamı Doğrula', url },
    );
    await deliver(to, 'E-posta Doğrulama', html, `verify-url: ${url}`);
  }

  /** Şifre sıfırlama linki gönderir. */
  static async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    const html = wrapHtml(
      'Şifre Sıfırlama',
      '<p>Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Link 1 saat geçerlidir. Bu isteği siz yapmadıysanız şifreniz değişmez.</p>',
      { label: 'Şifremi Sıfırla', url },
    );
    await deliver(to, 'Şifre Sıfırlama', html, `reset-url: ${url}`);
  }
}
