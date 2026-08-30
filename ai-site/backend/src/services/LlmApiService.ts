import { Resource } from "../models/Resource";
import { ResourceCredential } from "../models/ResourceCredential";
import { decrypt } from "../security/encryption";
import { ApiError } from "../middleware/errors";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const FETCH_TIMEOUT_MS = 8000;
const MODELS_CACHE_MS = 60_000;

const modelsCache = new Map<number, { models: string[]; expiresAt: number }>();

export function getBaseUrl(resource: Resource): string {
  const meta = resource.meta as Record<string, unknown> | null;
  return typeof meta?.baseUrl === "string" && meta.baseUrl ? meta.baseUrl : DEFAULT_BASE_URL;
}

export function getDefaultModel(resource: Resource): string | null {
  const meta = resource.meta as Record<string, unknown> | null;
  return typeof meta?.model === "string" ? meta.model : null;
}

/**
 * meta.modelFilter: model id'si bu alt diziyi içermeyenler elenir (örn. openrouter için ":free").
 * meta.allowedModels: sadece bu tam id'lere izin ver (varsa modelFilter ile birlikte de uygulanır).
 */
function applyModelCatalog(resource: Resource, models: string[]): string[] {
  const meta = resource.meta as Record<string, unknown> | null;
  let filtered = models;

  const substring = typeof meta?.modelFilter === "string" ? meta.modelFilter : null;
  if (substring) filtered = filtered.filter((m) => m.includes(substring));

  const allowed = Array.isArray(meta?.allowedModels)
    ? (meta.allowedModels as unknown[]).filter((m): m is string => typeof m === "string")
    : null;
  if (allowed) filtered = filtered.filter((m) => allowed.includes(m));

  return filtered;
}

async function getApiKey(resourceId: number): Promise<string> {
  const credential = await ResourceCredential.findOne({ where: { resourceId } });
  if (!credential) throw new ApiError(500, "Kaynak için kimlik bilgisi yok");
  return decrypt(credential.secretEncrypted);
}

/** Sağlayıcının gerçek model listesini çeker (OpenAI uyumlu GET /models). Başarısız olursa meta.model'e düşer. */
export async function listModels(resource: Resource): Promise<string[]> {
  const cached = modelsCache.get(resource.id);
  if (cached && cached.expiresAt > Date.now()) return cached.models;

  const baseUrl = getBaseUrl(resource);
  try {
    const apiKey = await getApiKey(resource.id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const upstream = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    const data = (await upstream.json()) as { data?: Array<{ id: string }> };
    const allModels = (data.data ?? []).map((m) => m.id).filter(Boolean).sort();
    const models = applyModelCatalog(resource, allModels);
    if (models.length > 0) {
      modelsCache.set(resource.id, { models, expiresAt: Date.now() + MODELS_CACHE_MS });
      return models;
    }
  } catch {
    // sağlayıcıya ulaşılamadı — meta.model'e düş
  }
  const fallback = getDefaultModel(resource);
  return fallback ? [fallback] : [];
}

/** OpenAI uyumlu POST /chat/completions çağrısı yapar; sağlayıcıya göre doğru baseUrl + kimlik bilgisini kullanır. */
export async function chatCompletion(
  resource: Resource,
  model: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const baseUrl = getBaseUrl(resource);
  const apiKey = await getApiKey(resource.id);

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...body, model }),
  });
  const data = await upstream.json();
  return { status: upstream.status, data };
}
