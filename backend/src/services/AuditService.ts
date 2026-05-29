import { ActivityLog } from '../models/ActivityLog';
import { logger } from '../config/logger';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * KVKK/BTK uyumlu denetim kaydı oluşturur.
 * Log yazımı asla ana iş akışını bozmamalı — hata durumunda yutulur (ama loglanır).
 */
export async function logActivity(entry: AuditEntry): Promise<void> {
  try {
    await ActivityLog.create({
      userId: entry.userId ?? null,
      action: entry.action,
      resource: entry.resource ?? null,
      resourceId: entry.resourceId ?? null,
      details: entry.details ?? null,
      ip: entry.ip ?? null,
    });
  } catch (err) {
    logger.error('Audit log yazılamadı', { action: entry.action, error: (err as Error).message });
  }
}
