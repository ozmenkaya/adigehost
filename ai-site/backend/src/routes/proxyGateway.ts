import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { Resource } from "../models/Resource";
import { Job } from "../models/Job";
import { Reservation } from "../models/Reservation";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { reservationFromRequest, assertReservationAllowsModel } from "../security/reservationAuth";
import { chatCompletion, listModels } from "../services/LlmApiService";
import { resolveThink, type ThinkValue } from "../services/OllamaOptions";

const router = Router();

const JOB_POLL_MS = 1000;
const JOB_WAIT_TIMEOUT_MS = 120_000;

const chatSchema = z
  .object({
    model: z.string().trim().min(1).max(120),
    messages: z.array(z.record(z.unknown())).min(1),
    think: z.boolean().optional(),
    reasoning_effort: z.enum(["none", "minimal", "low", "medium", "high"]).optional(),
    max_tokens: z.number().int().positive().max(200_000).optional(),
  })
  .passthrough(); // OpenAI istemcileri temperature vb. ekstra alanlar gönderebilir — sessizce yok sayılır

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

interface ImageModelInfo {
  id: string;
  label: string;
  kind: "checkpoint" | "lora";
  vramGB: number | null;
}

interface ChatOutcome {
  content: string;
  thinking?: string;
  promptTokens: number;
  completionTokens: number;
  finishReason: string;
}

async function ollamaModels(vpnIp: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`http://${vpnIp}:11434/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string; capabilities?: string[] }> };
    return (data.models ?? [])
      .filter((m) => !m.capabilities || m.capabilities.includes("completion"))
      .map((m) => m.name);
  } catch {
    return [];
  }
}

async function findTarget(model: string): Promise<{ resource: Resource } | null> {
  const resources = await Resource.findAll({ where: { status: "active" } });

  const llmResources = resources.filter((r) => r.type === "llm_api");
  for (const r of llmResources) {
    const models = await listModels(r);
    if (models.includes(model)) return { resource: r };
  }

  const computeResources = resources.filter((r) => r.type === "compute");
  const candidates: Resource[] = [];
  for (const r of computeResources) {
    const meta = r.meta as Record<string, unknown> | null;
    const vpnIp = meta?.vpnIp as string | undefined;
    if (!vpnIp) continue;
    const models = await ollamaModels(vpnIp);
    if (models.includes(model)) candidates.push(r);
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { resource: candidates[0] };

  const loads = await Promise.all(
    candidates.map(async (r) => ({
      resource: r,
      load: await Job.count({ where: { resourceId: r.id, status: ["queued", "running"] } }),
    })),
  );
  loads.sort((a, b) => a.load - b.load);
  return { resource: loads[0].resource };
}

async function findImageTarget(checkpoint: string): Promise<{ resource: Resource; imageModels: ImageModelInfo[] } | null> {
  const resources = await Resource.findAll({ where: { status: "active", type: "compute" } });

  const candidates: Array<{ resource: Resource; imageModels: ImageModelInfo[] }> = [];
  for (const r of resources) {
    const meta = r.meta as Record<string, unknown> | null;
    if (!meta?.imageGenApi) continue;
    const imageModels = Array.isArray(meta.imageModels) ? (meta.imageModels as ImageModelInfo[]) : [];
    if (imageModels.some((m) => m.id === checkpoint && m.kind === "checkpoint")) {
      candidates.push({ resource: r, imageModels });
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const loads = await Promise.all(
    candidates.map(async (c) => ({
      c,
      load: await Job.count({ where: { resourceId: c.resource.id, status: ["queued", "running"], kind: "image" } }),
    })),
  );
  loads.sort((a, b) => a.load - b.load);
  return loads[0].c;
}

async function callLlmApi(
  resource: Resource,
  model: string,
  messages: unknown[],
  extra: { reasoning_effort?: string; max_tokens?: number },
): Promise<ChatOutcome> {
  const { status, data } = await chatCompletion(resource, model, { messages, ...extra });
  const body = data as {
    error?: { message?: string } | string;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (status < 200 || status >= 300) {
    const message = typeof body?.error === "string" ? body.error : body?.error?.message;
    throw new ApiError(status, message ?? "LLM API hatası");
  }

  return {
    content: body.choices?.[0]?.message?.content ?? "",
    promptTokens: typeof body?.usage?.prompt_tokens === "number" ? body.usage.prompt_tokens : 0,
    completionTokens: typeof body?.usage?.completion_tokens === "number" ? body.usage.completion_tokens : 0,
    finishReason: body.choices?.[0]?.finish_reason ?? "stop",
  };
}

async function runComputeJob(
  resource: Resource,
  reservationId: number,
  model: string,
  messages: unknown[],
  think?: ThinkValue,
  numPredict?: number,
): Promise<ChatOutcome> {
  const job = await Job.create({
    resourceId: resource.id,
    reservationId,
    model,
    payload: { messages, think, numPredict },
  });

  const deadline = Date.now() + JOB_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, JOB_POLL_MS));
    await job.reload();
    if (job.status === "completed") {
      const result = job.result as {
        message?: { content?: string; thinking?: string };
        eval_count?: number;
        prompt_eval_count?: number;
        done_reason?: string;
      };
      return {
        content: result?.message?.content ?? "",
        thinking: result?.message?.thinking,
        promptTokens: result?.prompt_eval_count ?? 0,
        completionTokens: result?.eval_count ?? 0,
        finishReason: result?.done_reason === "length" ? "length" : "stop",
      };
    }
    if (job.status === "failed") throw new ApiError(502, job.errorMessage ?? "İş başarısız oldu");
  }
  throw new ApiError(504, "İş zaman aşımına uğradı");
}

async function runImageJob(
  resource: Resource,
  reservationId: number,
  checkpoint: string,
  params: Record<string, unknown>,
): Promise<{ images: Array<{ b64_json: string }>; seed: number }> {
  const job = await Job.create({
    resourceId: resource.id,
    reservationId,
    kind: "image",
    model: checkpoint,
    payload: params,
  });

  const deadline = Date.now() + IMAGE_JOB_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, JOB_POLL_MS));
    await job.reload();
    if (job.status === "completed") {
      const result = job.result as { images: Array<{ b64_json: string }>; seed: number };
      const images = result.images;
      const seed = result.seed;
      // base64 görseli jobs.result'ta süresiz tutmak admin listeleme sorgularını
      // (JOIN + ORDER BY) "Out of sort memory"ye düşürüyor (proxyCompute.ts'te
      // canlıda doğrulandı) — çağırana döndürdükten sonra küçültülüyor.
      job.result = { seed, imageCount: images.length };
      job.save().catch((err) => console.error("gateway image job result küçültme hatası:", err));
      return { images, seed };
    }
    if (job.status === "failed") throw new ApiError(502, job.errorMessage ?? "Görsel üretimi başarısız oldu");
  }
  throw new ApiError(504, "Görsel üretimi zaman aşımına uğradı");
}

router.get(
  "/models",
  asyncHandler(async (_req, res) => {
    const resources = await Resource.findAll({ where: { status: "active" } });
    const out: Array<{ model: string; resourceId: number; resourceName: string; type: string }> = [];

    for (const r of resources) {
      if (r.type === "llm_api") {
        const models = await listModels(r);
        for (const model of models) out.push({ model, resourceId: r.id, resourceName: r.name, type: r.type });
      } else {
        const meta = r.meta as Record<string, unknown> | null;
        const vpnIp = meta?.vpnIp as string | undefined;
        if (!vpnIp) continue;
        const models = await ollamaModels(vpnIp);
        for (const model of models) out.push({ model, resourceId: r.id, resourceName: r.name, type: r.type });
      }
    }

    res.json({ models: out });
  }),
);

// Görsel üretim model kataloğu — chat'in kullandığı /models ile KARIŞTIRILMASIN diye
// ayrı bir uç (dashboard'daki sohbet model dropdown'ı /models'i kullanıyor; checkpoint/
// LoRA id'leri oraya karışırsa seçilince chat isteği gönderip 404 alır).
router.get(
  "/images/models",
  asyncHandler(async (_req, res) => {
    const resources = await Resource.findAll({ where: { status: "active", type: "compute" } });
    const out: Array<ImageModelInfo & { resourceId: number; resourceName: string }> = [];

    for (const r of resources) {
      const meta = r.meta as Record<string, unknown> | null;
      if (!meta?.imageGenApi) continue;
      const imageModels = Array.isArray(meta.imageModels) ? (meta.imageModels as ImageModelInfo[]) : [];
      for (const m of imageModels) out.push({ ...m, resourceId: r.id, resourceName: r.name });
    }

    res.json({ models: out });
  }),
);

// OpenAI SDK uyumlu model listesi: GET /v1/models
router.get(
  "/v1/models",
  asyncHandler(async (_req, res) => {
    const resources = await Resource.findAll({ where: { status: "active" } });
    const seen = new Set<string>();
    const data: Array<{ id: string; object: string; created: number; owned_by: string }> = [];

    for (const r of resources) {
      if (r.type === "llm_api") {
        const models = await listModels(r);
        for (const model of models) {
          if (!seen.has(model)) {
            seen.add(model);
            data.push({ id: model, object: "model", created: 0, owned_by: r.provider ?? "llm_api" });
          }
        }
      } else {
        const meta = r.meta as Record<string, unknown> | null;
        const vpnIp = meta?.vpnIp as string | undefined;
        if (!vpnIp) continue;
        const models = await ollamaModels(vpnIp);
        for (const model of models) {
          if (!seen.has(model)) {
            seen.add(model);
            data.push({ id: model, object: "model", created: 0, owned_by: "adigehost" });
          }
        }
      }
    }

    res.json({ object: "list", data });
  }),
);

const chatCompletionsHandler = asyncHandler(async (req, res) => {
  const reservation = await reservationFromRequest(req);

  const body = chatSchema.parse(req.body);

  assertReservationAllowsModel(reservation, body.model);

  const target = await findTarget(body.model);
  if (!target) throw new ApiError(404, `Model bulunamadı: ${body.model}. Kullanılabilir modeller için GET /v1/models`);

  const { resource } = target;
  const think = resolveThink(body.think, body.reasoning_effort);
  const outcome =
    resource.type === "llm_api"
      ? await callLlmApi(resource, body.model, body.messages, {
          reasoning_effort: body.reasoning_effort,
          max_tokens: body.max_tokens,
        })
      : await runComputeJob(resource, reservation.id, body.model, body.messages, think, body.max_tokens);

  const totalTokens = outcome.promptTokens + outcome.completionTokens;
  if (totalTokens > 0) {
    await Reservation.increment("tokensUsed", { by: totalTokens, where: { id: reservation.id } });
  }
  if (reservation.status === "scheduled") {
    reservation.status = "active";
    await reservation.save();
  }

  res.json({
    id: `chatcmpl-${crypto.randomBytes(12).toString("hex")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: outcome.content,
          ...(outcome.thinking ? { thinking: outcome.thinking } : {}),
        },
        finish_reason: outcome.finishReason,
      },
    ],
    usage: {
      prompt_tokens: outcome.promptTokens,
      completion_tokens: outcome.completionTokens,
      total_tokens: totalTokens,
    },
    servedBy: { resourceId: resource.id, resourceName: resource.name, resourceType: resource.type },
  });
});

router.post("/chat/completions", chatCompletionsHandler);
router.post("/v1/chat/completions", chatCompletionsHandler);

const imageGenerationsHandler = asyncHandler(async (req, res) => {
  const reservation = await reservationFromRequest(req);

  const body = imageSchema.parse(req.body);
  assertReservationAllowsModel(reservation, body.model);
  if (body.lora) assertReservationAllowsModel(reservation, body.lora);

  const target = await findImageTarget(body.model);
  if (!target) throw new ApiError(404, `Checkpoint bulunamadı: ${body.model}`);

  const { resource, imageModels } = target;
  if (body.lora && !imageModels.some((m) => m.id === body.lora && m.kind === "lora")) {
    throw new ApiError(400, `Kaynakta bulunmayan LoRA: ${body.lora}`);
  }

  const outcome = await runImageJob(resource, reservation.id, body.model, {
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
  });

  if (reservation.status === "scheduled") {
    reservation.status = "active";
    await reservation.save();
  }

  res.json({
    created: Math.floor(Date.now() / 1000),
    data: outcome.images,
    seed: outcome.seed,
    servedBy: { resourceId: resource.id, resourceName: resource.name, resourceType: resource.type },
  });
});

router.post("/images/generations", imageGenerationsHandler);
router.post("/v1/images/generations", imageGenerationsHandler);

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
