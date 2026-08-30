import { Router } from "express";
import { z } from "zod";
import { Op } from "sequelize";
import { Reservation } from "../models/Reservation";
import { Resource } from "../models/Resource";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { generateAccessToken, hashAccessToken } from "../security/tokens";

const router = Router();
router.use(requireAuth);

const createSchema = z
  .object({
    resourceId: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(120).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    message: "Bitiş zamanı başlangıçtan sonra olmalı",
    path: ["endsAt"],
  });

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const UNLIMITED_QUOTA = 4_000_000_000; // sınır yok, sadece kullanım takibi için

router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const reservations = await Reservation.findAll({
      where: { userId: req.userId! },
      attributes: { exclude: ["accessTokenHash"] },
      include: [{ model: Resource, attributes: ["id", "name", "type"] }],
      order: [["startsAt", "DESC"]],
    });
    res.json(reservations);
  }),
);

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSchema.parse(req.body);

    let resource: Resource | null = null;
    let startsAt: Date;
    let endsAt: Date;

    if (body.resourceId !== undefined) {
      if (!body.startsAt || !body.endsAt) throw new ApiError(400, "Belirli bir kaynak seçildiğinde başlangıç/bitiş zamanı gerekli");
      startsAt = new Date(body.startsAt);
      endsAt = new Date(body.endsAt);

      resource = await Resource.findByPk(body.resourceId);
      if (!resource || resource.status !== "active") throw new ApiError(404, "Kaynak bulunamadı veya pasif");

      const conflict = await Reservation.findOne({
        where: {
          resourceId: body.resourceId,
          status: { [Op.in]: ["scheduled", "active"] },
          startsAt: { [Op.lt]: endsAt },
          endsAt: { [Op.gt]: startsAt },
        },
      });
      if (conflict) throw new ApiError(409, "Bu kaynak seçilen zaman diliminde rezerve edilmiş");
    } else {
      // Kaynak belirtilmezse "API anahtarı" (gateway): tüm sisteme erişim, tarih verilmezse uzun ömürlü.
      startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
      endsAt = body.endsAt ? new Date(body.endsAt) : new Date(Date.now() + TEN_YEARS_MS);
    }

    const accessToken = generateAccessToken();
    const accessTokenHash = hashAccessToken(accessToken);

    const reservation = await Reservation.create({
      resourceId: body.resourceId ?? null,
      userId: req.userId!,
      startsAt,
      endsAt,
      notes: body.notes ?? null,
      label: body.label ?? null,
      accessTokenHash,
      quotaTokens: UNLIMITED_QUOTA,
    });

    const payload = reservation.toJSON() as Record<string, unknown>;
    delete payload.accessTokenHash;
    if (accessToken) payload.accessToken = accessToken;

    res.status(201).json(payload);
  }),
);

router.patch(
  "/:id/cancel",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const reservation = await Reservation.findOne({ where: { id, userId: req.userId! } });
    if (!reservation) throw new ApiError(404, "Rezervasyon bulunamadı");
    if (reservation.status === "cancelled") throw new ApiError(409, "Zaten iptal edilmiş");

    reservation.status = "cancelled";
    await reservation.save();
    res.json(reservation);
  }),
);

export default router;
