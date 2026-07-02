import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { SshKey } from '../models';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * Müşteri SSH public anahtar yönetimi.
 * Anahtarlar bizim DB'mizde kullanıcı bazlı tutulur (Hetzner hesabı tek olduğu
 * için Hetzner ssh_keys listesi müşteriye gösterilmez).
 */
export const sshKeysRouter = Router();

const KEY_RE = /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-[a-z0-9-]+|ssh-dss)\s+[A-Za-z0-9+/=]+(\s+.*)?$/;

/** OpenSSH public key'inden SHA256 parmak izi üretir (SHA256:… formatı). */
function fingerprint(publicKey: string): string | null {
  const parts = publicKey.trim().split(/\s+/);
  const b64 = parts[1];
  if (!b64) return null;
  try {
    const hash = createHash('sha256').update(Buffer.from(b64, 'base64')).digest('base64').replace(/=+$/, '');
    return `SHA256:${hash}`;
  } catch {
    return null;
  }
}

// GET /ssh-keys — kendi anahtarlarım
sshKeysRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const keys = await SshKey.findAll({
      where: { userId: req.user!.sub },
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, data: keys });
  }),
);

// POST /ssh-keys — yeni anahtar ekle
const addSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    publicKey: z.string().min(20).max(4096),
  }),
});
sshKeysRouter.post(
  '/',
  validate(addSchema),
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name: string };
    const publicKey = (req.body.publicKey as string).trim();
    if (!KEY_RE.test(publicKey)) {
      throw ApiError.badRequest('Geçersiz SSH public anahtarı (ssh-rsa / ssh-ed25519 ile başlamalı)');
    }
    const fp = fingerprint(publicKey);
    // Aynı anahtar tekrar eklenmesin
    const existing = await SshKey.findAll({ where: { userId: req.user!.sub } });
    if (existing.some((k) => k.publicKey.trim() === publicKey)) {
      throw ApiError.conflict('Bu anahtar zaten kayıtlı');
    }
    const key = await SshKey.create({ userId: req.user!.sub, name, publicKey, fingerprint: fp });
    await logActivity({
      userId: req.user!.sub,
      action: 'ssh_key.create',
      resource: 'ssh_key',
      resourceId: key.id,
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: key });
  }),
);

// DELETE /ssh-keys/:id — anahtarı sil
sshKeysRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const key = await SshKey.findByPk(req.params.id);
    if (!key || key.userId !== req.user!.sub) throw ApiError.notFound('Anahtar bulunamadı');
    await key.destroy();
    await logActivity({
      userId: req.user!.sub,
      action: 'ssh_key.delete',
      resource: 'ssh_key',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Anahtar silindi' });
  }),
);
