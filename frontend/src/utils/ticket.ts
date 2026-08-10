/** Destek talebi tipleri ve etiketleri — müşteri ve admin ekranları paylaşır. */

export type TicketStatus = 'open' | 'answered' | 'customer_reply' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketDepartment = 'sales' | 'support' | 'billing' | 'abuse';

export interface TicketReply {
  id: string;
  message: string;
  isAdmin: boolean;
  isAiSuggestion: boolean;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string; role: string } | null;
}

export interface Ticket {
  id: string;
  ticketNum: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  department: TicketDepartment;
  lastReply: string | null;
  createdAt: string;
  serviceId: string | null;
  service?: { id: string; name: string; type: string } | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    company?: string | null;
  } | null;
  replies?: TicketReply[];
}

/**
 * Durum etiketleri. Müşteri ile admin aynı duruma farklı açıdan bakar:
 * "answered" müşteri için "yanıtlandı", admin için "yanıt verildi, bekleniyor".
 */
export const STATUS_LABEL: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: 'Açık', cls: 'bg-amber-100 text-amber-700' },
  answered: { label: 'Yanıtlandı', cls: 'bg-green-100 text-green-700' },
  customer_reply: { label: 'Müşteri Yanıtı', cls: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Kapalı', cls: 'bg-slate-100 text-slate-500' },
};

export const PRIORITY_LABEL: Record<TicketPriority, { label: string; cls: string }> = {
  low: { label: 'Düşük', cls: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Normal', cls: 'bg-sky-100 text-sky-700' },
  high: { label: 'Yüksek', cls: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Acil', cls: 'bg-red-100 text-red-700' },
};

export const DEPARTMENT_LABEL: Record<TicketDepartment, string> = {
  support: 'Teknik Destek',
  billing: 'Faturalama',
  sales: 'Satış',
  abuse: 'Kötüye Kullanım',
};

/** Yazışmada tarih gösterimi — TR yerel saat. */
export function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Liste görünümünde "3 saat önce" tarzı kısa gösterim. */
export function fmtRelative(d: string | null): string {
  if (!d) return '—';
  const diffMin = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}
