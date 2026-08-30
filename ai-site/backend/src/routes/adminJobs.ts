import { Router } from "express";
import { Job } from "../models/Job";
import { Resource } from "../models/Resource";
import { Reservation } from "../models/Reservation";
import { User } from "../models/User";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/jobs",
  asyncHandler(async (_req, res) => {
    const jobs = await Job.findAll({
      // payload/result hiç kullanılmıyor (aşağıdaki response map'i sadece meta alanları
      // dönüyor) ama görsel işlerinde result yüzlerce KB base64 veri taşıyor —
      // dahil edilirse bu JOIN+ORDER BY sorgusu MySQL'i "Out of sort memory"ye
      // düşürüyor (2026-08-30'da canlıda gerçekleşti, doğrulandı).
      attributes: { exclude: ["payload", "result"] },
      order: [["createdAt", "DESC"]],
      limit: 100,
      include: [
        { model: Resource, attributes: ["id", "name", "type"] },
        {
          model: Reservation,
          attributes: ["id", "label"],
          include: [{ model: User, attributes: ["id", "name", "email"] }],
        },
      ],
    });

    res.json(
      jobs.map((j) => {
        const resource = (j as unknown as { Resource?: Resource }).Resource;
        const reservation = (j as unknown as { Reservation?: Reservation & { User?: User } }).Reservation;
        const user = reservation?.User;

        const now = Date.now();
        const waitedMs = j.startedAt
          ? j.startedAt.getTime() - j.createdAt.getTime()
          : j.status === "queued"
            ? now - j.createdAt.getTime()
            : null;
        const durationMs =
          j.startedAt && j.completedAt
            ? j.completedAt.getTime() - j.startedAt.getTime()
            : j.startedAt && j.status === "running"
              ? now - j.startedAt.getTime()
              : null;

        return {
          id: j.id,
          model: j.model,
          kind: j.kind,
          status: j.status,
          resourceName: resource?.name ?? "—",
          resourceType: resource?.type ?? null,
          customerName: user?.name ?? "—",
          customerEmail: user?.email ?? null,
          reservationLabel: reservation?.label ?? null,
          createdAt: j.createdAt,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          waitedMs,
          durationMs,
          errorMessage: j.errorMessage,
        };
      }),
    );
  }),
);

export default router;
