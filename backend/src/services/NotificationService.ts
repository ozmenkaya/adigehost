import { env } from '../config/env';
import { logger } from '../config/logger';
import { EmailService } from './EmailService';
import { SettingsService, BANK_KEYS } from './SettingsService';

/**
 * Uygulama bildirim e-postaları.
 * SMTP yapılandırılmamışsa hata fırlatmaz — linki/konuyu log'a yazar.
 */

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tr(n: number): string {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function wrapHtml(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">${esc(cta.label)}</a></p>
       <p style="color:#64748b;font-size:12px">Buton çalışmazsa tarayıcıya yapıştırın:<br><a href="${esc(cta.url)}">${esc(cta.url)}</a></p>`
    : '';
  return `<!DOCTYPE html><html lang="tr"><body>
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <span style="font-size:20px;font-weight:700;color:#2563eb">${esc(env.APP_NAME)}</span>
  </div>
  <h2 style="margin-top:0;color:#0f172a;font-size:18px">${title}</h2>
  ${body}
  ${button}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0">
  <p style="color:#94a3b8;font-size:11px;margin:0">${esc(env.APP_NAME)} · panel.adigehost.tr<br>
  Bu iletiyi beklemiyor iseniz görmezden gelebilirsiniz.</p>
</div></body></html>`;
}

async function deliver(to: string, subject: string, html: string, devNote?: string): Promise<void> {
  if (!(await EmailService.isConfigured())) {
    logger.warn(`[SMTP yapılandırılmamış] "${subject}" → ${to}${devNote ? ' | ' + devNote : ''}`);
    return;
  }
  try {
    await EmailService.send({ to, subject, html });
  } catch (err) {
    // Bildirim hatası kritik değil — ana işlem bozulmasın.
    logger.error('Bildirim e-postası gönderilemedi', {
      to,
      subject,
      error: (err as Error).message,
    });
  }
}

// ─── Banka bilgilerini satır satır getir ────────────────────────────────────
async function bankHtml(): Promise<string> {
  const b = await SettingsService.getMany(BANK_KEYS);
  if (!b.bank_iban) return '<p style="color:#ef4444">Banka bilgileri henüz girilmemiş.</p>';
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">
    ${b.bank_name ? `<tr><td style="padding:4px 8px;color:#64748b">Banka</td><td style="padding:4px 8px;font-weight:500">${esc(b.bank_name)}</td></tr>` : ''}
    ${b.bank_account_holder ? `<tr><td style="padding:4px 8px;color:#64748b">Hesap Sahibi</td><td style="padding:4px 8px;font-weight:500">${esc(b.bank_account_holder)}</td></tr>` : ''}
    <tr><td style="padding:4px 8px;color:#64748b">IBAN</td><td style="padding:4px 8px;font-weight:600;letter-spacing:.04em">${esc(b.bank_iban)}</td></tr>
    ${b.bank_branch ? `<tr><td style="padding:4px 8px;color:#64748b">Şube</td><td style="padding:4px 8px">${esc(b.bank_branch)}</td></tr>` : ''}
  </table>`;
}

// ─── Kalem tablosu ──────────────────────────────────────────────────────────
function itemsHtml(
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  subtotal: number,
  tax: number,
  total: number,
): string {
  const rows = items
    .map(
      (it) =>
        `<tr>
      <td style="padding:8px;border-bottom:1px solid #f1f5f9">${esc(it.description)}</td>
      <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${it.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right">${tr(it.unitPrice)} ₺</td>
      <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:500">${tr(it.total)} ₺</td>
    </tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:12px 0">
    <thead><tr style="background:#f8fafc;color:#64748b;font-size:11px;text-transform:uppercase">
      <th style="padding:8px;text-align:left">Açıklama</th>
      <th style="padding:8px;text-align:center">Adet</th>
      <th style="padding:8px;text-align:right">Birim Fiyat</th>
      <th style="padding:8px;text-align:right">Tutar</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#64748b">Ara Toplam</td><td style="padding:6px 8px;text-align:right">${tr(subtotal)} ₺</td></tr>
      <tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#64748b">KDV (%20)</td><td style="padding:6px 8px;text-align:right">${tr(tax)} ₺</td></tr>
      <tr style="background:#eff6ff"><td colspan="3" style="padding:8px;text-align:right;font-weight:700">Genel Toplam</td><td style="padding:8px;text-align:right;font-weight:700;color:#2563eb">${tr(total)} ₺</td></tr>
    </tfoot>
  </table>`;
}

// ─── Destek talebi başlık kutusu ────────────────────────────────────────────
const PRIORITY_TR: Record<string, string> = {
  low: 'Düşük',
  medium: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil',
};

function ticketMetaHtml(ticketNum: string, subject: string, priority?: string): string {
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;background:#f8fafc;border-radius:8px">
    <tr><td style="padding:8px 12px;color:#64748b">Talep No</td><td style="padding:8px 12px;font-weight:600">${esc(ticketNum)}</td></tr>
    <tr><td style="padding:8px 12px;color:#64748b">Konu</td><td style="padding:8px 12px;font-weight:500">${esc(subject)}</td></tr>
    ${priority ? `<tr><td style="padding:8px 12px;color:#64748b">Öncelik</td><td style="padding:8px 12px">${esc(PRIORITY_TR[priority] ?? priority)}</td></tr>` : ''}
  </table>`;
}

/** Mesaj gövdesini alıntı bloğu olarak gösterir. Ham metin — `esc()` ile kaçışlanır. */
function quoteHtml(message: string): string {
  return `<div style="border-left:3px solid #cbd5e1;padding:4px 0 4px 14px;margin:12px 0;color:#334155;font-size:14px;white-space:pre-wrap">${esc(message)}</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
export class NotificationService {
  // ── Auth ──────────────────────────────────────────────────────────────────

  /** E-posta doğrulama linki gönderir. */
  static async sendEmailVerification(to: string, token: string): Promise<void> {
    const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    const html = wrapHtml(
      'E-posta Adresinizi Doğrulayın',
      '<p>Hesabınızı etkinleştirmek için aşağıdaki butona tıklayın. Link 24 saat geçerlidir.</p>',
      { label: 'E-postamı Doğrula', url },
    );
    await deliver(to, 'E-posta Doğrulama — ' + env.APP_NAME, html, `verify: ${url}`);
  }

  /** Şifre sıfırlama linki gönderir. */
  static async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    const html = wrapHtml(
      'Şifre Sıfırlama',
      '<p>Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Link 1 saat geçerlidir.<br>Bu isteği siz yapmadıysanız hiçbir şey değişmez.</p>',
      { label: 'Şifremi Sıfırla', url },
    );
    await deliver(to, 'Şifre Sıfırlama — ' + env.APP_NAME, html, `reset: ${url}`);
  }

  // ── Fatura Oluşturuldu (ödeme bekleniyor) ────────────────────────────────

  static async sendInvoiceCreated(opts: {
    to: string;
    firstName: string;
    invoiceNum: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    subtotal: number;
    tax: number;
    total: number;
    dueDate: Date;
  }): Promise<void> {
    const due = opts.dueDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const bank = await bankHtml();
    const items = itemsHtml(opts.items, opts.subtotal, opts.tax, opts.total);
    const panelUrl = `${env.FRONTEND_URL}/invoices`;

    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <p>Aşağıdaki fatura hesabınıza tanımlandı. Son ödeme tarihi: <strong>${esc(due)}</strong>.</p>
      ${items}
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-weight:600;color:#854d0e">💳 Havale / EFT Bilgileri</p>
        <p style="margin:0 0 4px;font-size:13px;color:#78350f">Açıklama kısmına <strong>${esc(opts.invoiceNum)}</strong> fatura numarasını yazın.</p>
        ${bank}
      </div>
      <p style="font-size:13px;color:#64748b">Ödemeniz sistemimize ulaştığında hizmetiniz otomatik olarak aktive edilecek ve e-posta ile bilgilendirileceksiniz.</p>`;

    const html = wrapHtml(`Fatura ${esc(opts.invoiceNum)} — Ödeme Bekleniyor`, body, {
      label: 'Panele Git',
      url: panelUrl,
    });
    await deliver(
      opts.to,
      `Fatura ${opts.invoiceNum} — ${tr(opts.total)} ₺ ödeme bekleniyor`,
      html,
    );
  }

  // ── Ödeme Onaylandı + Servis Aktive + E-Belge ────────────────────────────

  static async sendInvoicePaid(opts: {
    to: string;
    firstName: string;
    invoiceNum: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    subtotal: number;
    tax: number;
    total: number;
    paidAt: Date;
    einvoice?: { type: 'efatura' | 'earsiv'; id?: string } | null;
    provisioned?: Array<{
      type: string;
      domain?: string;
      cpanelUser?: string;
      cpanelUrl?: string;
      ipAddress?: string;
      ipv6?: string;
      password?: string;
      sshKeyUsed?: boolean;
    }>;
  }): Promise<void> {
    const paidDate = opts.paidAt.toLocaleString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const items = itemsHtml(opts.items, opts.subtotal, opts.tax, opts.total);
    const panelUrl = `${env.FRONTEND_URL}/services`;

    // E-belge satırı
    let ebelgeHtml = '';
    if (opts.einvoice?.type) {
      const tip = opts.einvoice.type === 'efatura' ? 'e-Fatura' : 'e-Arşiv Fatura';
      ebelgeHtml = `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin:12px 0">
          <p style="margin:0;font-size:14px">✅ <strong>${tip}</strong> kesildi${opts.einvoice.id ? ` — <span style="font-family:monospace">${esc(opts.einvoice.id)}</span>` : ''}.<br>
          <span style="font-size:12px;color:#16a34a">GİB'e iletildi; e-posta kutunuza veya e-Arşiv görüntüleyicisine yüklenecektir.</span></p>
        </div>`;
    }

    // Aktive edilen servisler
    let servicesHtml = '';
    if (opts.provisioned && opts.provisioned.length > 0) {
      const rows = opts.provisioned
        .map((p) => {
          if (p.type === 'hosting') {
            return `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:8px 0">
              <p style="margin:0 0 6px;font-weight:600">🌐 Hosting Hesabı — ${esc(p.domain ?? '')}</p>
              ${p.cpanelUser ? `<p style="margin:2px 0;font-size:13px">Kullanıcı: <code>${esc(p.cpanelUser)}</code></p>` : ''}
              ${p.cpanelUrl ? `<p style="margin:2px 0;font-size:13px">cPanel: <a href="${esc(p.cpanelUrl)}">${esc(p.cpanelUrl)}</a></p>` : ''}
            </div>`;
          }
          if (p.type === 'vps') {
            return `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:8px 0">
              <p style="margin:0 0 6px;font-weight:600">🖥 VPS Sunucu — Giriş Bilgileri</p>
              ${p.ipAddress ? `<p style="margin:2px 0;font-size:13px">IPv4: <code>${esc(p.ipAddress)}</code></p>` : ''}
              ${p.ipv6 ? `<p style="margin:2px 0;font-size:13px">IPv6: <code>${esc(p.ipv6)}</code></p>` : ''}
              <p style="margin:2px 0;font-size:13px">Kullanıcı: <code>root</code></p>
              ${
                p.sshKeyUsed
                  ? `<p style="margin:2px 0;font-size:13px">Giriş: <strong>SSH anahtarınızla</strong> bağlanın (parola oluşturulmadı).</p>`
                  : p.password
                    ? `<p style="margin:2px 0;font-size:13px">Root parola: <code>${esc(p.password)}</code></p>
              <p style="margin:6px 0 0;font-size:12px;color:#b45309">⚠ Güvenlik için ilk girişte parolanızı değiştirin. Bağlanmak için: <code>ssh root@${esc(p.ipAddress ?? 'SUNUCU_IP')}</code></p>`
                    : ''
              }
            </div>`;
          }
          if (p.type === 'domain') {
            return `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:8px 0">
              <p style="margin:0;font-weight:600">🔗 Domain Kaydedildi — ${esc(p.domain ?? '')}</p>
            </div>`;
          }
          return '';
        })
        .join('');
      servicesHtml = `<p style="font-weight:600;margin:16px 0 4px">Aktive Edilen Hizmetler</p>${rows}`;
    }

    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <p>✅ <strong>${esc(opts.invoiceNum)}</strong> numaralı faturanızın ödemesi <strong>${esc(paidDate)}</strong> tarihinde alındı. Teşekkür ederiz.</p>
      ${items}
      ${ebelgeHtml}
      ${servicesHtml}
      <p style="font-size:13px;color:#64748b">Tüm faturalarınızı ve hizmetlerinizi müşteri panelinden takip edebilirsiniz.</p>`;

    const html = wrapHtml(`Ödeme Alındı — ${esc(opts.invoiceNum)}`, body, {
      label: 'Panelime Git',
      url: panelUrl,
    });
    await deliver(
      opts.to,
      `Ödeme Alındı — ${opts.invoiceNum} (${tr(opts.total)} ₺)`,
      html,
    );
  }

  // ── Ödeme Hatırlatma (vade yaklaşıyor / geçti) ───────────────────────────

  static async sendPaymentReminder(opts: {
    to: string;
    firstName: string;
    invoiceNum: string;
    total: number;
    dueDate: Date;
    daysUntilDue: number; // negatif ise vade geçmiş
  }): Promise<void> {
    const due = opts.dueDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const bank = await bankHtml();
    const overdue = opts.daysUntilDue < 0;
    const when = overdue
      ? `Son ödeme tarihi <strong>${Math.abs(opts.daysUntilDue)} gün</strong> önce doldu`
      : opts.daysUntilDue === 0
        ? 'Son ödeme tarihi <strong>bugün</strong>'
        : `Son ödeme tarihine <strong>${opts.daysUntilDue} gün</strong> kaldı`;
    const box = overdue
      ? 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b'
      : 'background:#fefce8;border:1px solid #fde047;color:#854d0e';
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <div style="${box};border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:600">${when}.</p>
        <p style="margin:0;font-size:14px"><strong>${esc(opts.invoiceNum)}</strong> — ${tr(opts.total)} ₺ · Vade: ${esc(due)}</p>
      </div>
      ${overdue ? '<p style="font-size:13px;color:#991b1b">Ödeme yapılmazsa hizmetiniz kısa süre içinde askıya alınacaktır. Kesintiyi önlemek için lütfen ödemenizi tamamlayın.</p>' : ''}
      <p style="font-weight:600;margin:16px 0 4px">Havale / EFT Bilgileri</p>
      <p style="margin:0 0 4px;font-size:13px;color:#64748b">Açıklama kısmına <strong>${esc(opts.invoiceNum)}</strong> yazın.</p>
      ${bank}`;
    const html = wrapHtml(
      overdue ? `Ödemeniz Gecikti — ${esc(opts.invoiceNum)}` : `Ödeme Hatırlatması — ${esc(opts.invoiceNum)}`,
      body,
      { label: 'Öde / Panele Git', url: `${env.FRONTEND_URL}/invoices` },
    );
    await deliver(
      opts.to,
      `${overdue ? 'Ödemeniz gecikti' : 'Ödeme hatırlatması'} — ${opts.invoiceNum} (${tr(opts.total)} ₺)`,
      html,
    );
  }

  // ── Servis Askıya Alındı ─────────────────────────────────────────────────

  static async sendServiceSuspended(opts: {
    to: string;
    firstName: string;
    serviceName: string;
    reason: string;
  }): Promise<void> {
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:600;color:#991b1b">⏸ Hizmetiniz askıya alındı</p>
        <p style="margin:0;font-size:14px;color:#7f1d1d"><strong>${esc(opts.serviceName)}</strong></p>
        <p style="margin:6px 0 0;font-size:13px;color:#b91c1c">Neden: ${esc(opts.reason)}</p>
      </div>
      <p style="font-size:14px">Ödemenizi tamamladığınızda hizmetiniz <strong>otomatik olarak</strong> yeniden aktive edilir. Verileriniz belirli bir süre korunur; bu süre sonunda hizmet kalıcı olarak sonlandırılabilir.</p>`;
    const html = wrapHtml('Hizmet Askıya Alındı', body, {
      label: 'Ödeme Yap',
      url: `${env.FRONTEND_URL}/invoices`,
    });
    await deliver(opts.to, `Hizmetiniz askıya alındı — ${opts.serviceName}`, html);
  }

  // ── Servis Yeniden Aktive ────────────────────────────────────────────────

  static async sendServiceReactivated(opts: {
    to: string;
    firstName: string;
    serviceName: string;
  }): Promise<void> {
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:600;color:#166534">✅ Hizmetiniz yeniden aktif</p>
        <p style="margin:0;font-size:14px;color:#15803d"><strong>${esc(opts.serviceName)}</strong></p>
      </div>
      <p style="font-size:14px">Ödemeniz alındı ve hizmetiniz yeniden çalışır duruma getirildi. İlginiz için teşekkür ederiz.</p>`;
    const html = wrapHtml('Hizmet Yeniden Aktif', body, {
      label: 'Panelime Git',
      url: `${env.FRONTEND_URL}/services`,
    });
    await deliver(opts.to, `Hizmetiniz yeniden aktif — ${opts.serviceName}`, html);
  }

  // ── Servis Sonlandırıldı ─────────────────────────────────────────────────

  static async sendServiceTerminated(opts: {
    to: string;
    firstName: string;
    serviceName: string;
    reason: string;
  }): Promise<void> {
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:600;color:#334155">Hizmetiniz sonlandırıldı</p>
        <p style="margin:0;font-size:14px;color:#475569"><strong>${esc(opts.serviceName)}</strong></p>
        <p style="margin:6px 0 0;font-size:13px;color:#64748b">Neden: ${esc(opts.reason)}</p>
      </div>
      <p style="font-size:13px;color:#64748b">Bu hizmete ait sunucu/hesap ve veriler kaldırılmıştır. Yeni bir hizmet almak isterseniz panelimizden sipariş verebilirsiniz.</p>`;
    const html = wrapHtml('Hizmet Sonlandırıldı', body, {
      label: 'Yeni Sipariş',
      url: `${env.FRONTEND_URL}`,
    });
    await deliver(opts.to, `Hizmetiniz sonlandırıldı — ${opts.serviceName}`, html);
  }

  // ── Yeni Sipariş Alındı (self-servis) ────────────────────────────────────

  static async sendOrderReceived(opts: {
    to: string;
    firstName: string;
    invoiceNum: string;
    description: string;
    total: number;
    dueDate: Date;
  }): Promise<void> {
    const due = opts.dueDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const bank = await bankHtml();
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <p>Siparişiniz alındı: <strong>${esc(opts.description)}</strong></p>
      <p>Fatura tutarı: <strong>${tr(opts.total)} ₺</strong> — Son ödeme: <strong>${esc(due)}</strong></p>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-weight:600;color:#854d0e">💳 Havale / EFT Bilgileri</p>
        <p style="margin:0 0 4px;font-size:13px;color:#78350f">Açıklama: <strong>${esc(opts.invoiceNum)}</strong></p>
        ${bank}
      </div>
      <p style="font-size:13px;color:#64748b">Ödemeniz onaylandığında hizmetiniz aktive edilip e-posta ile bilgilendirileceksiniz.</p>`;
    const html = wrapHtml('Siparişiniz Alındı', body, {
      label: 'Panelime Git',
      url: `${env.FRONTEND_URL}/invoices`,
    });
    await deliver(
      opts.to,
      `Sipariş Alındı — ${opts.invoiceNum} (${tr(opts.total)} ₺)`,
      html,
    );
  }

  // ── Destek Talepleri ──────────────────────────────────────────────────────

  /** Müşteriye "talebiniz alındı" bilgisi. */
  static async sendTicketCreated(opts: {
    to: string;
    firstName: string;
    ticketId: string;
    ticketNum: string;
    subject: string;
  }): Promise<void> {
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <p>Destek talebiniz kaydedildi. Ekibimiz en kısa sürede yanıtlayacak.</p>
      ${ticketMetaHtml(opts.ticketNum, opts.subject)}
      <p style="font-size:13px;color:#64748b">Bu e-postayı yanıtlamayın; ek bilgi için talebi panelden açıp yazın.</p>`;
    const html = wrapHtml('Destek Talebiniz Alındı', body, {
      label: 'Talebi Görüntüle',
      url: `${env.FRONTEND_URL}/app/tickets/${opts.ticketId}`,
    });
    await deliver(opts.to, `[${opts.ticketNum}] Talebiniz alındı — ${opts.subject}`, html);
  }

  /** Destek ekibi yanıtladığında müşteriye bildirim. */
  static async sendTicketReplied(opts: {
    to: string;
    firstName: string;
    ticketId: string;
    ticketNum: string;
    subject: string;
    message: string;
    closed?: boolean;
  }): Promise<void> {
    const body = `
      <p>Sayın <strong>${esc(opts.firstName)}</strong>,</p>
      <p>Destek talebinize yanıt verildi.</p>
      ${ticketMetaHtml(opts.ticketNum, opts.subject)}
      ${quoteHtml(opts.message)}
      ${
        opts.closed
          ? '<p style="font-size:13px;color:#64748b">Talep kapatıldı. Konu devam ediyorsa panelden yeniden yazabilirsiniz.</p>'
          : ''
      }`;
    const html = wrapHtml('Talebinize Yanıt Verildi', body, {
      label: 'Yanıtı Görüntüle',
      url: `${env.FRONTEND_URL}/app/tickets/${opts.ticketId}`,
    });
    await deliver(opts.to, `[${opts.ticketNum}] Yanıt — ${opts.subject}`, html);
  }

  /** Yeni talep veya müşteri yanıtı geldiğinde destek ekibine bildirim. */
  static async sendTicketToStaff(opts: {
    to: string[];
    ticketId: string;
    ticketNum: string;
    subject: string;
    message: string;
    customerName: string;
    customerEmail: string;
    isNew: boolean;
    priority: string;
  }): Promise<void> {
    if (opts.to.length === 0) {
      logger.warn('Destek bildirimi gönderilemedi: alıcı adresi yok', { ticket: opts.ticketNum });
      return;
    }
    const body = `
      <p><strong>${esc(opts.customerName)}</strong> (${esc(opts.customerEmail)})
         ${opts.isNew ? 'yeni bir destek talebi açtı' : 'talebine yanıt yazdı'}.</p>
      ${ticketMetaHtml(opts.ticketNum, opts.subject, opts.priority)}
      ${quoteHtml(opts.message)}`;
    const html = wrapHtml(
      opts.isNew ? 'Yeni Destek Talebi' : 'Müşteri Yanıtı',
      body,
      { label: 'Talebi Aç', url: `${env.FRONTEND_URL}/admin/tickets/${opts.ticketId}` },
    );
    const subject = `[${opts.ticketNum}] ${opts.isNew ? 'Yeni talep' : 'Müşteri yanıtı'} — ${opts.subject}`;
    await Promise.all(opts.to.map((addr) => deliver(addr, subject, html)));
  }
}
