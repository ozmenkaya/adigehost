import { Router } from "express";
import { z } from "zod";
import { Op } from "sequelize";
import { Reservation } from "../models/Reservation";
import { Resource } from "../models/Resource";
import { User } from "../models/User";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { generateAccessToken, hashAccessToken } from "../security/tokens";

const router = Router();
router.use(requireAuth, requireAdmin);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const UNLIMITED_QUOTA = 4_000_000_000;

const createSchema = z
  .object({
    resourceId: z.number().int().positive(),
    userId: z.number().int().positive(),
    label: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    quotaTokens: z.number().int().positive().max(UNLIMITED_QUOTA).optional(),
    allowedModels: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    timeStart: z.string().regex(timePattern, "HH:MM formatında olmalı").optional(),
    timeEnd: z.string().regex(timePattern, "HH:MM formatında olmalı").optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "Bitiş tarihi başlangıçtan sonra olmalı",
    path: ["endsAt"],
  })
  .refine((v) => Boolean(v.timeStart) === Boolean(v.timeEnd), {
    message: "Saat başlangıç ve bitişi birlikte verilmeli",
    path: ["timeEnd"],
  })
  .refine((v) => !v.timeStart || !v.timeEnd || v.timeEnd > v.timeStart, {
    message: "Bitiş saati başlangıç saatinden sonra olmalı",
    path: ["timeEnd"],
  });

// Gün/saat kısıtlı rezervasyonların, örtüşmeyen zaman dilimlerinde aynı kaynağı
// paylaşabilmesi için basit bir çakışma kontrolü: tarih aralığı + gün + saat kesişimi.
function overlaps(a: Reservation, b: { daysOfWeek: number[] | null; timeStart: string | null; timeEnd: string | null }) {
  if (a.daysOfWeek && b.daysOfWeek) {
    const shared = a.daysOfWeek.some((d) => b.daysOfWeek!.includes(d));
    if (!shared) return false;
  }
  if (a.timeStart && a.timeEnd && b.timeStart && b.timeEnd) {
    if (!(a.timeStart < b.timeEnd && b.timeStart < a.timeEnd)) return false;
  }
  return true;
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const reservations = await Reservation.findAll({
      attributes: { exclude: ["accessTokenHash"] },
      include: [
        { model: Resource, attributes: ["id", "name", "type"] },
        { model: User, attributes: ["id", "name", "email"] },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json(reservations);
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    const resource = await Resource.findByPk(body.resourceId);
    if (!resource || resource.status !== "active") throw new ApiError(404, "Kaynak bulunamadı veya pasif");

    const customer = await User.findByPk(body.userId);
    if (!customer) throw new ApiError(404, "Müşteri bulunamadı");

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const daysOfWeek = body.daysOfWeek && body.daysOfWeek.length ? body.daysOfWeek : null;
    const timeStart = body.timeStart ?? null;
    const timeEnd = body.timeEnd ?? null;

    const candidates = await Reservation.findAll({
      where: {
        resourceId: body.resourceId,
        status: { [Op.in]: ["scheduled", "active"] },
        startsAt: { [Op.lt]: endsAt },
        endsAt: { [Op.gt]: startsAt },
      },
    });
    const conflict = candidates.find((c) => overlaps(c, { daysOfWeek, timeStart, timeEnd }));
    if (conflict) throw new ApiError(409, "Bu kaynak seçilen gün/saat için başka bir rezervasyonla çakışıyor");

    const accessToken = generateAccessToken();
    const accessTokenHash = hashAccessToken(accessToken);

    const reservation = await Reservation.create({
      resourceId: body.resourceId,
      userId: body.userId,
      startsAt,
      endsAt,
      label: body.label ?? null,
      notes: body.notes ?? null,
      accessTokenHash,
      quotaTokens: body.quotaTokens ?? UNLIMITED_QUOTA,
      allowedModels: body.allowedModels && body.allowedModels.length ? body.allowedModels : null,
      daysOfWeek,
      timeStart,
      timeEnd,
    });

    const payload = reservation.toJSON() as Record<string, unknown>;
    delete payload.accessTokenHash;
    payload.accessToken = accessToken;
    payload.customer = { id: customer.id, name: customer.name, email: customer.email };
    payload.resource = { id: resource.id, name: resource.name, type: resource.type };

    res.status(201).json(payload);
  }),
);

router.patch(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const reservation = await Reservation.findByPk(id);
    if (!reservation) throw new ApiError(404, "Rezervasyon bulunamadı");
    if (reservation.status === "cancelled") throw new ApiError(409, "Zaten iptal edilmiş");

    reservation.status = "cancelled";
    await reservation.save();
    res.json(reservation);
  }),
);

export default router;
