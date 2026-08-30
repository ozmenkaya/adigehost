import { Router } from "express";
import { z } from "zod";
import { Resource } from "../models/Resource";
import { Job } from "../models/Job";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { reservationFromRequest, assertReservationAllowsModel } from "../security/reservationAuth";
import { resolveThink } from "../services/OllamaOptions";

const router = Router();

const submitSchema = z.object({
  model: z.string().trim().min(1).max(120),
  messages: z.array(z.record(z.unknown())).min(1),
  think: z.boolean().optional(),
  reasoning_effort: z.enum(["none", "minimal", "low", "medium", "high"]).optional(),
  max_tokens: z.number().int().positive().max(200_000).optional(),
});

const IMAGE_JOB_POLL_MS = 1000;
const IMAGE_JOB_WAIT_TIMEOUT_MS = 150_000;

const imageSchema = z.object({
  model: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(4000),
  negative_prompt: z.string().trim().max(4000).optional(),
  lora: z.string().trim().min(1).max(120).optional(),
  lora_strength: z.number().min(-100).max(100).optional(),
  width: z.number().int().positive().max(2048).optional(),
  height: z.number().int().positive().max(2048).optional(),
  steps: z.number().int().positive().max(150).optional(),
  cfg_scale: z.number().positive().max(30).optional(),
  seed: z.number().int().min(0).optional(),
  image: z.string().trim().min(1).max(12_000_000).optional(),
  strength: z.number().min(0).max(1).optional(),
});

router.post(
  "/jobs",
  asyncHandler(async (req, res) => {
    const reservation = await reservationFromRequest(req);

    if (reservation.resourceId === null) throw new ApiError(400, "Bu bir gateway rezervasyonu, /api/proxy/gateway kullanın");

    const resource = await Resource.findOne({ where: { id: reservation.resourceId, type: "compute" } });
    if (!resource || resource.status !== "active") throw new ApiError(404, "Kaynak bulunamadı veya pasif");

    const body = submitSchema.parse(req.body);
    assertReservationAllowsModel(reservation, body.model);
    const think = resolveThink(body.think, body.reasoning_effort);

    const job = await Job.create({
      resourceId: resource.id,
      reservationId: reservation.id,
      model: body.model,
      payload: { messages: body.messages, think, numPredict: body.max_tokens },
    });

    if (reservation.status === "scheduled") {
      reservation.status = "active";
      await reservation.save();
    }

    res.status(202).json({ jobId: job.id, status: job.status });
  }),
);

router.post(
  "/images/generations",
  asyncHandler(async (req, res) => {
    const reservation = await reservationFromRequest(req);

    if (reservation.resourceId === null) throw new ApiError(400, "Bu bir gateway rezervasyonu, görsel üretim yalnızca belirli bir kaynağa bağlı rezervasyonlarda desteklenir");

    const resource = await Resource.findOne({ where: { id: reservation.resourceId, type: "compute" } });
    if (!resource || resource.status !== "active") throw new ApiError(404, "Kaynak bulunamadı veya pasif");

    const meta = resource.meta as Record<string, unknown> | null;
    if (!meta?.imageGenApi) throw new ApiError(400, "Bu kaynak görsel üretim desteklemiyor");

    const body = imageSchema.parse(req.body);
    assertReservationAllowsModel(reservation, body.model);
    if (body.lora) assertReservationAllowsModel(reservation, body.lora);

    const imageModels = Array.isArray(meta.imageModels) ? (meta.imageModels as Array<{ id: string; kind: string }>) : [];
    if (!imageModels.some((m) => m.id === body.model && m.kind === "checkpoint")) {
      throw new ApiError(400, `Kaynakta bulunmayan checkpoint: ${body.model}`);
    }
    if (body.lora && !imageModels.some((m) => m.id === body.lora && m.kind === "lora")) {
      throw new ApiError(400, `Kaynakta bulunmayan LoRA: ${body.lora}`);
    }

    const job = await Job.create({
      resourceId: resource.id,
      reservationId: reservation.id,
      kind: "image",
      model: body.model,
      payload: {
        prompt: body.prompt,
        negativePrompt: body.negative_prompt,
        lora: body.lora,
        loraStrength: body.lora_strength,
        width: body.width,
        height: body.height,
        steps: body.steps,
        cfgScale: body.cfg_scale,
        seed: body.seed,
        initImageB64: body.image,
        strength: body.strength,
      },
    });

    if (reservation.status === "scheduled") {
      reservation.status = "active";
      await reservation.save();
    }

    const deadline = Date.now() + IMAGE_JOB_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, IMAGE_JOB_POLL_MS));
      await job.reload();
      if (job.status === "completed") {
        const result = job.result as { images: Array<{ b64_json: string }>; seed: number };
        res.json({ created: Math.floor(Date.now() / 1000), data: result.images, seed: result.seed });
        // Yanıt zaten gönderildi — base64 görseli jobs.result'ta süresiz tutmak
        // (yüzlerce KB/iş) admin listeleme sorgularını (JOIN + ORDER BY) "Out of
        // sort memory"ye düşürüyor (2026-08-30'da canlıda doğrulandı). Teslimden
        // sonra küçültülüyor, kimse bu satırı tekrar okumuyor.
        job.result = { seed: result.seed, imageCount: result.images.length };
        job.save().catch((err) => console.error("image job result küçültme hatası:", err));
        return;
      }
      if (job.status === "failed") throw new ApiError(502, job.errorMessage ?? "Görsel üretimi başarısız oldu");
    }
    throw new ApiError(504, "Görsel üretimi zaman aşımına uğradı");
  }),
);

router.get(
  "/jobs/:id",
  asyncHandler(async (req, res) => {
    const reservation = await reservationFromRequest(req);

    const job = await Job.findOne({ where: { id: Number(req.params.id), reservationId: reservation.id } });
    if (!job) throw new ApiError(404, "İş bulunamadı");

    res.json({
      jobId: job.id,
      status: job.status,
      model: job.model,
      result: job.result,
      error: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  }),
);

router.get(
  "/quota",
  asyncHandler(async (req, res) => {
    const reservation = await reservationFromRequest(req);
    res.json({
      status: reservation.status,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      tokensUsed: reservation.tokensUsed,
    });
  }),
);

export default router;
