import { Job, type JobKind } from "../models/Job";
import { Resource } from "../models/Resource";
import { Reservation } from "../models/Reservation";
import type { ThinkValue } from "../services/OllamaOptions";
import { generateImage, type ImageGenRequest } from "../services/ComfyUiService";

const IDLE_POLL_MS = 1000;
const STARVATION_MS = 60_000;
const REQUEST_TIMEOUT_MS = 180_000;
// Ölçüm (2026-08-30): kolserver 20 eş zamanlı isteği hatasız kaldırdı, ama süre
// doğrusal arttı (gerçek paralellik yok, Ollama içeride sıraya koyuyor) — bu yüzden
// yüksek bir sınır yerine ölçülü bir değer seçildi. Sadece AYNI model için geçerli;
// farklı model gelirse mevcut batch bitmeden model değişimi tetiklenmiyor (donanımı
// gereksiz model swap'ından korumak için).
const MAX_CONCURRENT_PER_RESOURCE = 3;
// Ölçüm (2026-08-30): kolserver 11dk boşta kaldıktan sonra 3 eş zamanlı istek
// gelince her biri modeli AYRI AYRI yüklemeye çalıştı (~6.6sn'lik load_duration x3,
// birbiriyle disk/GPU için yarışarak), tek istekte bu süre normalde çok daha kısa.
// Bu yüzden kaynak soğukken (bu pencereden uzun süredir hiç iş bitmemişse) tek işle
// "ısındırıp" model kesin yüklendikten sonra paralelliği açıyoruz. Ollama'nın
// varsayılan keep_alive'ı 5dk; altında güvenli bir pencere seçildi.
const WARM_WINDOW_MS = 4 * 60_000;

interface ResourceRunState {
  activeCount: number;
  activeModel: string | null; // şu an çalışan chat işlerinin ortak modeli (activeCount>0 iken dolu)
  activeKind: JobKind | null; // şu an çalışan işin türü — image işi GPU'yu chat ile paylaşmasın diye
  lastActivityAt: number; // son tamamlanan işin zamanı — modelin sıcak olup olmadığının tahmini
  warming: boolean; // ısınma turu süren tek iş bitene kadar true — bu sürede yeni iş başlatılmaz
}

const currentModelByResource = new Map<number, string | null>();
const runStateByResource = new Map<number, ResourceRunState>();

function getRunState(resourceId: number): ResourceRunState {
  let state = runStateByResource.get(resourceId);
  if (!state) {
    state = { activeCount: 0, activeModel: null, activeKind: null, lastActivityAt: 0, warming: false };
    runStateByResource.set(resourceId, state);
  }
  return state;
}

// image işleri (ComfyUI) ile chat işleri (Ollama) aynı paylaşımlı GPU'da VRAM için
// yarışabileceğinden asla eşzamanlı çalışmazlar — bir image işi tek başına, kendi
// turunda çalışır (bkz. runResourceLoop'taki `job.kind === "image" ? break`).
async function pickNextJob(resourceId: number, restrictToModel: string | null, activeKind: JobKind | null) {
  if (activeKind === "image") return null;

  if (restrictToModel) {
    return Job.findOne({
      where: { resourceId, status: "queued", kind: "chat", model: restrictToModel },
      order: [["createdAt", "ASC"]],
    });
  }

  const oldestImage = await Job.findOne({
    where: { resourceId, status: "queued", kind: "image" },
    order: [["createdAt", "ASC"]],
  });
  const oldestChat = await Job.findOne({
    where: { resourceId, status: "queued", kind: "chat" },
    order: [["createdAt", "ASC"]],
  });
  if (!oldestImage && !oldestChat) return null;
  if (oldestImage && (!oldestChat || oldestImage.createdAt <= oldestChat.createdAt)) return oldestImage;
  if (!oldestChat) return null;

  const currentModel = currentModelByResource.get(resourceId) ?? null;
  if (!currentModel) return oldestChat;

  const sameModel = await Job.findOne({
    where: { resourceId, status: "queued", kind: "chat", model: currentModel },
    order: [["createdAt", "ASC"]],
  });
  if (!sameModel) return oldestChat;
  if (sameModel.id === oldestChat.id) return sameModel;

  const waitedMs = Date.now() - oldestChat.createdAt.getTime();
  if (waitedMs < STARVATION_MS) return sameModel;
  return oldestChat;
}

async function callOllama(
  vpnIp: string,
  model: string,
  messages: unknown[],
  think?: ThinkValue,
  numPredict?: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = { model, messages, stream: false };
    if (think !== undefined) body.think = think;
    if (numPredict !== undefined) body.options = { num_predict: numPredict };

    const res = await fetch(`http://${vpnIp}:11434/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Job'u "queued" durumundayken atomik olarak "running"e çeker. Etkilenen satır 0 ise
 * başka bir worker (ör. PM2 reload sırasındaki eski/yeni instance çakışması) işi
 * önce almış demektir — bu durumda null döner ve çağıran işi atlar.
 */
async function claimJob(jobId: number): Promise<Job | null> {
  const [affected] = await Job.update(
    { status: "running", startedAt: new Date() },
    { where: { id: jobId, status: "queued" } },
  );
  if (affected === 0) return null;
  return Job.findByPk(jobId);
}

async function processImageJob(resource: Resource, job: Job, vpnIp: string) {
  const meta = resource.meta as Record<string, unknown> | null;
  const port = ((meta?.imageGenApi as { port?: number } | undefined)?.port ?? 8188) as number;
  const payload = job.payload as unknown as Omit<ImageGenRequest, "checkpoint">;

  const result = await generateImage(vpnIp, port, { ...payload, checkpoint: job.model });
  job.status = "completed";
  job.result = { images: result.images.map((i) => ({ b64_json: i.b64Json })), seed: result.seed };
  job.completedAt = new Date();
  // img2img'de payload.initImageB64 birkaç MB'a kadar çıkabiliyor — ComfyUI'ye
  // yüklendi, artık gerek yok. Kalıcı tutulursa result için düzeltilen aynı
  // "Out of sort memory" hatasını payload üzerinden yeniden üretir.
  if ("initImageB64" in payload) job.payload = { ...payload, initImageB64: undefined };
  await job.save();
}

async function processChatJob(resource: Resource, job: Job, vpnIp: string) {
  const payload = job.payload as { messages: unknown[]; think?: ThinkValue; numPredict?: number };
  const data = (await callOllama(vpnIp, job.model, payload.messages, payload.think, payload.numPredict)) as {
    eval_count?: number;
    prompt_eval_count?: number;
  };

  job.status = "completed";
  job.result = data as Record<string, unknown>;
  job.completedAt = new Date();
  await job.save();

  const usedTokens = (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0);
  if (usedTokens > 0) {
    await Reservation.increment("tokensUsed", { by: usedTokens, where: { id: job.reservationId } });
  }

  currentModelByResource.set(resource.id, job.model);
  const meta = { ...(resource.meta as Record<string, unknown> | null), currentModel: job.model };
  resource.meta = meta;
  await resource.save();
}

async function processJob(resource: Resource, job: Job) {
  const vpnIp = (resource.meta as Record<string, unknown> | null)?.vpnIp as string | undefined;
  if (!vpnIp) {
    job.status = "failed";
    job.errorMessage = "Kaynağın VPN adresi tanımlı değil";
    job.completedAt = new Date();
    await job.save();
    return;
  }

  try {
    if (job.kind === "image") {
      await processImageJob(resource, job, vpnIp);
    } else {
      await processChatJob(resource, job, vpnIp);
    }
  } catch (err) {
    job.status = "failed";
    job.errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
    job.completedAt = new Date();
    // Başarısız img2img işlerinde de payload.initImageB64 (birkaç MB) kalıcı
    // kalmasın — bkz. processImageJob'daki aynı gerekçe.
    if (job.kind === "image" && job.payload && "initImageB64" in job.payload) {
      job.payload = { ...job.payload, initImageB64: undefined };
    }
    await job.save();
  }
}

async function runResourceLoop(resourceId: number) {
  const state = getRunState(resourceId);

  for (;;) {
    try {
      const resource = await Resource.findOne({ where: { id: resourceId, type: "compute", status: "active" } });
      if (!resource) {
        await sleep(IDLE_POLL_MS * 5);
        continue;
      }

      while (state.activeCount < (state.activeKind === "image" ? 1 : MAX_CONCURRENT_PER_RESOURCE)) {
        // Işınma turu sürüyorsa (tek iş modeli yüklüyor) o bitene kadar başka iş
        // başlatma — aksi halde ikinci iş de aynı anda soğuk yükleme başlatıp
        // birbirleriyle yarışır (bkz. yukarıdaki ölçüm notu).
        if (state.warming) break;

        // Kaynak soğuksa (uzun süredir iş bitmemişse) tek işle "ısındırıp" model
        // kesin yüklendikten sonra paralelliği açıyoruz.
        const isCold = state.activeCount === 0 && Date.now() - state.lastActivityAt > WARM_WINDOW_MS;

        // Zaten çalışan chat işi varsa yeni iş sadece AYNI modelden olabilir — aksi
        // halde batch bitmeden model değişimi tetiklenip donanım gereksiz yere
        // zorlanır. image işi zaten pickNextJob içinde tek başına ele alınıyor.
        const restrictToModel = state.activeCount > 0 && state.activeKind === "chat" ? state.activeModel : null;
        const candidate = await pickNextJob(resourceId, restrictToModel, state.activeCount > 0 ? state.activeKind : null);
        if (!candidate) break;

        const job = await claimJob(candidate.id);
        if (!job) continue; // başka bir worker önce aldı, hemen tekrar dene

        if (state.activeCount === 0) {
          state.activeModel = job.kind === "chat" ? job.model : null;
          state.activeKind = job.kind;
        }
        state.activeCount++;
        if (isCold) state.warming = true;

        processJob(resource, job)
          .catch((err) => console.error(`compute worker (resource ${resourceId}) iş hatası:`, err))
          .finally(() => {
            state.activeCount--;
            state.lastActivityAt = Date.now();
            if (isCold) state.warming = false; // ısınma turu bitti, paralellik tekrar açılabilir
            if (state.activeCount === 0) {
              state.activeModel = null;
              state.activeKind = null;
            }
          });

        if (isCold) break; // ısınma turu bitene kadar başka iş başlatma
        if (job.kind === "image") break; // image işi GPU'yu tek başına kullanır, aynı turda başka iş ekleme
      }

      // Kapasite dolu (işler sürüyor) ya da bekleyen iş yok — her iki durumda da
      // kısa süre beklemek yeterli; sürekli DB'yi yoklayan bir busy-loop'a girmez.
      await sleep(IDLE_POLL_MS);
    } catch (err) {
      console.error(`compute worker (resource ${resourceId}) hata:`, err);
      await sleep(IDLE_POLL_MS * 5);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startComputeWorkers() {
  const resources = await Resource.findAll({ where: { type: "compute", status: "active" } });
  for (const resource of resources) {
    const meta = resource.meta as Record<string, unknown> | null;
    currentModelByResource.set(resource.id, (meta?.currentModel as string | undefined) ?? null);
    runResourceLoop(resource.id).catch((err) => console.error("compute worker döngüsü çöktü:", err));
    console.log(`compute worker başlatıldı: kaynak #${resource.id} (${resource.name})`);
  }
}
