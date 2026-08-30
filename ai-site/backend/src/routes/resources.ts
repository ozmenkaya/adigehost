import { Router } from "express";
import { z } from "zod";
import { Resource } from "../models/Resource";
import { ResourceCredential } from "../models/ResourceCredential";
import { User } from "../models/User";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth";
import { encrypt } from "../security/encryption";
import { listModels } from "../services/LlmApiService";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  type: z.enum(["llm_api", "compute"]),
  name: z.string().trim().min(2).max(120),
  provider: z.string().trim().max(60).optional(),
  meta: z.record(z.unknown()).optional(),
  secret: z.string().trim().min(1).max(10000).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  meta: z.record(z.unknown()).optional(),
  secret: z.string().trim().min(1).max(10000).optional(),
});

router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await User.findByPk(req.userId);
    const isAdmin = user?.role === "admin";

    const resources = await Resource.findAll({
      where: isAdmin ? {} : { status: "active" },
      include: [{ model: ResourceCredential, as: "credential", attributes: ["id"] }],
      order: [["createdAt", "DESC"]],
    });
    res.json(
      resources.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        provider: r.provider,
        status: r.status,
        meta: isAdmin ? r.meta : null,
        hasCredential: isAdmin ? Boolean((r as unknown as { credential?: unknown }).credential) : undefined,
        createdAt: r.createdAt,
      })),
    );
  }),
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const resource = await Resource.create({
      type: body.type,
      name: body.name,
      provider: body.provider ?? null,
      meta: body.meta ?? null,
    });

    if (body.secret) {
      await ResourceCredential.create({
        resourceId: resource.id,
        secretEncrypted: encrypt(body.secret),
      });
    }

    res.status(201).json({ id: resource.id, type: resource.type, name: resource.name });
  }),
);

type ModelInfo = { id: string; label: string; kind: "llm" | "checkpoint" | "lora"; vramGB: number | null };

router.get(
  "/:id/models",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const resource = await Resource.findByPk(id);
    if (!resource) throw new ApiError(404, "Kaynak bulunamadı");

    if (resource.type === "llm_api") {
      const models = await listModels(resource);
      res.json({ models, modelInfo: models.map((m): ModelInfo => ({ id: m, label: m, kind: "llm", vramGB: null })) });
      return;
    }

    const meta = resource.meta as Record<string, unknown> | null;
    const vpnIp = meta?.vpnIp as string | undefined;
    if (!vpnIp) throw new ApiError(400, "Kaynağın VPN adresi tanımlı değil");

    let models: string[];
    const llmInfo: ModelInfo[] = [];
    let reservedVramGB = 0;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const upstream = await fetch(`http://${vpnIp}:11434/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!upstream.ok) throw new Error(`Ollama HTTP ${upstream.status}`);
      const data = (await upstream.json()) as {
        models?: Array<{ name: string; size?: number; capabilities?: string[] }>;
      };
      const filtered = (data.models ?? []).filter((m) => !m.capabilities || m.capabilities.includes("completion"));
      models = filtered.map((m) => m.name);
      for (const m of filtered) {
        llmInfo.push({ id: m.name, label: m.name, kind: "llm", vramGB: m.size ? m.size / 1024 ** 3 : null });
      }

      // O an fiilen VRAM'de yüklü olan model(ler) — kapasite hesabı için gerçek zamanlı rezerve miktar.
      try {
        const psController = new AbortController();
        const psTimeout = setTimeout(() => psController.abort(), 5000);
        const psRes = await fetch(`http://${vpnIp}:11434/api/ps`, { signal: psController.signal });
        clearTimeout(psTimeout);
        if (psRes.ok) {
          const psData = (await psRes.json()) as { models?: Array<{ size_vram?: number }> };
          reservedVramGB = (psData.models ?? []).reduce((sum, m) => sum + (m.size_vram ?? 0), 0) / 1024 ** 3;
        }
      } catch {
        // /api/ps alınamazsa kapasite hesabı sadece toplam VRAM üzerinden yapılır (rezerve=0)
      }
    } catch (err) {
      throw new ApiError(502, `Kaynağa ulaşılamadı: ${err instanceof Error ? err.message : "bilinmeyen hata"}`);
    }

    const imageModels = Array.isArray(meta?.imageModels) ? (meta.imageModels as ModelInfo[]) : [];
    const modelInfo = [...llmInfo, ...imageModels];

    const totalVramGB = typeof meta?.vramGB === "number" ? meta.vramGB : null;
    const capacityGB = totalVramGB !== null ? Math.max(0, totalVramGB - reservedVramGB) : null;

    res.json({ models, modelInfo, capacityGB });
  }),
);

router.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const resource = await Resource.findByPk(id);
    if (!resource) throw new ApiError(404, "Kaynak bulunamadı");

    const body = updateSchema.parse(req.body);
    if (body.name !== undefined) resource.name = body.name;
    if (body.status !== undefined) resource.status = body.status;
    if (body.meta !== undefined) resource.meta = body.meta;
    await resource.save();

    if (body.secret) {
      const existing = await ResourceCredential.findOne({ where: { resourceId: id } });
      const secretEncrypted = encrypt(body.secret);
      if (existing) {
        existing.secretEncrypted = secretEncrypted;
        await existing.save();
      } else {
        await ResourceCredential.create({ resourceId: id, secretEncrypted });
      }
    }

    res.json({ id: resource.id, name: resource.name, status: resource.status });
  }),
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const resource = await Resource.findByPk(id);
    if (!resource) throw new ApiError(404, "Kaynak bulunamadı");
    await ResourceCredential.destroy({ where: { resourceId: id } });
    await resource.destroy();
    res.status(204).end();
  }),
);

export default router;
