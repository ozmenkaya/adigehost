import { Op, UniqueConstraintError } from 'sequelize';
import { Ticket, TicketReply, User } from '../models';
import type { TicketDepartment, TicketPriority } from '../models/Ticket';
import { sequelize } from '../config/database';
import { SettingsService } from './SettingsService';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface CreateTicketInput {
  userId: string;
  subject: string;
  message: string;
  department: TicketDepartment;
  priority: TicketPriority;
  serviceId?: string | null;
}

/**
 * Destek talebi iş mantığı — numara üretimi, oluşturma ve bildirim alıcıları.
 * Route'lar (tickets.ts / adminTickets.ts) buradaki yardımcıları paylaşır.
 */
export class TicketService {
  /**
   * Yıl bazlı sıradaki talep numarasını hesaplar: `TKT-2026-00001`.
   * Sabit genişlikte olduğu için sözlük sıralaması = sayısal sıralama.
   */
  private static async peekNextNum(year: number): Promise<string> {
    const prefix = `TKT-${year}-`;
    const last = await Ticket.findOne({
      where: { ticketNum: { [Op.like]: `${prefix}%` } },
      order: [['ticketNum', 'DESC']],
      attributes: ['ticketNum'],
    });
    const seq = last ? Number(last.ticketNum.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  /**
   * Talebi ilk mesajıyla birlikte oluşturur.
   * `ticketNum` unique olduğundan eşzamanlı iki talep çakışabilir — birkaç kez denenir.
   */
  static async create(input: CreateTicketInput): Promise<Ticket> {
    const year = new Date().getUTCFullYear();

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // Talep ve ilk mesaj birlikte yazılır — mesajsız boş talep kalmasın.
        return await sequelize.transaction(async (tx) => {
          const ticket = await Ticket.create(
            {
              userId: input.userId,
              serviceId: input.serviceId ?? null,
              ticketNum: await this.peekNextNum(year),
              subject: input.subject,
              department: input.department,
              priority: input.priority,
              status: 'open',
              lastReply: new Date(),
            },
            { transaction: tx },
          );

          await TicketReply.create(
            {
              ticketId: ticket.id,
              userId: input.userId,
              message: input.message,
              isAdmin: false,
            },
            { transaction: tx },
          );

          return ticket;
        });
      } catch (err) {
        if (err instanceof UniqueConstraintError && attempt < 4) {
          logger.warn('Talep numarası çakıştı, yeniden deneniyor', { attempt: attempt + 1 });
          continue;
        }
        throw err;
      }
    }

    // Döngü her zaman return veya throw ile biter; tip daraltma için.
    throw new Error('Talep numarası üretilemedi');
  }

  /**
   * Yeni talep/müşteri yanıtı bildirimi gidecek adresler.
   * Öncelik: ayarlardaki şirket e-postası → aktif admin kullanıcıları → env.ADMIN_EMAIL.
   */
  static async adminRecipients(): Promise<string[]> {
    const companyEmail = await SettingsService.get('company_email');
    if (companyEmail) return [companyEmail];

    const admins = await User.findAll({
      where: { role: 'admin', status: 'active' },
      attributes: ['email'],
    });
    if (admins.length > 0) return admins.map((a) => a.email);

    return env.ADMIN_EMAIL ? [env.ADMIN_EMAIL] : [];
  }
}
