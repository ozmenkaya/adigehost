import { Router } from "express";
import { Op, Sequelize } from "sequelize";
import { User } from "../models/User";
import { Reservation } from "../models/Reservation";
import { Job } from "../models/Job";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

const RECENT_JOBS_FOR_HEALTH = 10;

router.get(
  "/customers",
  asyncHandler(async (_req, res) => {
    const customers = await User.findAll({ where: { role: "customer" }, order: [["name", "ASC"]] });

    const out = [];
    for (const customer of customers) {
      const reservations = await Reservation.findAll({ where: { userId: customer.id } });
      const reservationIds = reservations.map((r) => r.id);

      // payload ve result dışarıda bırakılıyor — img2img payload'ı birkaç MB'a çıkabiliyor,
      // eski görsel işlerinde result de yüzlerce KB base64 taşıyordu (bkz. adminJobs.ts);
      // ikisi birden ORDER BY ile seçilince MySQL "Out of sort memory"ye düşüyordu
      // (2026-08-30'da canlıda gerçekleşti). Token istatistikleri için gereken
      // eval_count/prompt_eval_count aşağıda ayrı, sıralamasız bir sorguyla çekiliyor.
      const jobs = reservationIds.length
        ? await Job.findAll({
            attributes: { exclude: ["payload", "result"] },
            where: { reservationId: { [Op.in]: reservationIds } },
            order: [["createdAt", "DESC"]],
          })
        : [];

      const completedJobIds = jobs.filter((j) => j.status === "completed").map((j) => j.id);
      const tokenRows = completedJobIds.length
        ? ((await Job.findAll({
            attributes: [
              "id",
              [Sequelize.literal("CAST(JSON_EXTRACT(result, '$.eval_count') AS UNSIGNED)"), "evalCount"],
              [Sequelize.literal("CAST(JSON_EXTRACT(result, '$.prompt_eval_count') AS UNSIGNED)"), "promptEvalCount"],
            ],
            where: { id: { [Op.in]: completedJobIds } },
            raw: true,
          })) as unknown as Array<{ id: number; evalCount: number | null; promptEvalCount: number | null }>)
        : [];
      const tokensByJobId = new Map(
        tokenRows.map((r) => [r.id, (r.evalCount ?? 0) + (r.promptEvalCount ?? 0)]),
      );

      const totalTokensUsed = reservations.reduce((sum, r) => sum + r.tokensUsed, 0);

      const modelStats = new Map<string, { tokens: number; requests: number; failed: number }>();
      let computeTokens = 0;
      for (const job of jobs) {
        const entry = modelStats.get(job.model) ?? { tokens: 0, requests: 0, failed: 0 };
        entry.requests += 1;
        if (job.status === "failed") entry.failed += 1;
        if (job.status === "completed") {
          const tokens = tokensByJobId.get(job.id) ?? 0;
          entry.tokens += tokens;
          computeTokens += tokens;
        }
        modelStats.set(job.model, entry);
      }

      const openaiTokens = Math.max(0, totalTokensUsed - computeTokens);
      const models = [...modelStats.entries()].map(([model, s]) => ({
        model,
        tokens: s.tokens,
        requests: s.requests,
        failed: s.failed,
      }));
      if (openaiTokens > 0) {
        models.push({ model: "gpt-4o-mini (OpenAI)", tokens: openaiTokens, requests: 0, failed: 0 });
      }
      models.sort((a, b) => b.tokens - a.tokens);

      const lastReservationActivity = reservations.reduce<Date | null>(
        (max, r) => (!max || r.updatedAt > max ? r.updatedAt : max),
        null,
      );
      const lastJobActivity = jobs.length ? jobs[0].createdAt : null;
      const lastActivityAt =
        lastReservationActivity && lastJobActivity
          ? lastReservationActivity > lastJobActivity
            ? lastReservationActivity
            : lastJobActivity
          : (lastReservationActivity ?? lastJobActivity);

      let health: "no_activity" | "healthy" | "issues" = "no_activity";
      if (jobs.length > 0) {
        const recent = jobs.slice(0, RECENT_JOBS_FOR_HEALTH);
        const failedCount = recent.filter((j) => j.status === "failed").length;
        health = failedCount > recent.length / 2 ? "issues" : "healthy";
      } else if (totalTokensUsed > 0) {
        health = "healthy";
      }

      out.push({
        userId: customer.id,
        name: customer.name,
        email: customer.email,
        totalTokensUsed,
        activeKeys: reservations.filter((r) => r.status !== "cancelled").length,
        totalKeys: reservations.length,
        lastActivityAt,
        health,
        models,
      });
    }

    res.json(out);
  }),
);

export default router;
