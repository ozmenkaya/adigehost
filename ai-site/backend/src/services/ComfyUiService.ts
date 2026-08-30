import crypto from "node:crypto";

export interface ImageGenRequest {
  checkpoint: string;
  lora?: string | null;
  loraStrength?: number;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  /** img2img: base64 (data: URL öneki varsa temizlenir) init görsel. Verilirse width/height yok sayılır. */
  initImageB64?: string;
  /** img2img denoising strength, 0-1 (düşük = orijinale daha sadık). Varsayılan 0.75. */
  strength?: number;
}

export interface ImageGenResult {
  images: Array<{ b64Json: string }>;
  seed: number;
}

const SUBMIT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 1000;
const GENERATION_TIMEOUT_MS = 120_000;

type ComfyGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

function isLcmLora(lora: string | null | undefined): boolean {
  return Boolean(lora && lora.toLowerCase().includes("lcm"));
}

function buildWorkflow(params: ImageGenRequest, seed: number, initImageFilename?: string): ComfyGraph {
  const isXl = params.checkpoint.toLowerCase().includes("xl");
  const width = params.width ?? (isXl ? 1024 : 512);
  const height = params.height ?? (isXl ? 1024 : 512);
  const lcm = isLcmLora(params.lora);
  const steps = params.steps ?? (lcm ? 6 : 20);
  const cfg = params.cfgScale ?? (lcm ? 1.5 : 7);
  const samplerName = lcm ? "lcm" : "euler";
  const scheduler = lcm ? "sgm_uniform" : "normal";
  const isImg2Img = Boolean(initImageFilename);
  const denoise = isImg2Img ? (params.strength ?? 0.75) : 1;

  const graph: ComfyGraph = {
    checkpoint: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: params.checkpoint } },
  };

  let modelRef: [string, number] = ["checkpoint", 0];
  let clipRef: [string, number] = ["checkpoint", 1];
  if (params.lora) {
    graph.lora = {
      class_type: "LoraLoader",
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: params.lora,
        strength_model: params.loraStrength ?? 1,
        strength_clip: params.loraStrength ?? 1,
      },
    };
    modelRef = ["lora", 0];
    clipRef = ["lora", 1];
  }

  graph.positive = { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: params.prompt } };
  graph.negative = { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: params.negativePrompt ?? "" } };
  if (isImg2Img) {
    graph.loadimage = { class_type: "LoadImage", inputs: { image: initImageFilename } };
    graph.latent = { class_type: "VAEEncode", inputs: { pixels: ["loadimage", 0], vae: ["checkpoint", 2] } };
  } else {
    graph.latent = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };
  }
  graph.sampler = {
    class_type: "KSampler",
    inputs: {
      model: modelRef,
      positive: ["positive", 0],
      negative: ["negative", 0],
      latent_image: ["latent", 0],
      seed,
      steps,
      cfg,
      sampler_name: samplerName,
      scheduler,
      denoise,
    },
  };
  graph.decode = { class_type: "VAEDecode", inputs: { samples: ["sampler", 0], vae: ["checkpoint", 2] } };
  graph.save = {
    class_type: "SaveImage",
    inputs: { images: ["decode", 0], filename_prefix: "adigehost" },
  };

  return graph;
}

async function comfyFetch(vpnIp: string, port: number, path: string, init?: RequestInit, timeoutMs = SUBMIT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`http://${vpnIp}:${port}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadInitImage(vpnIp: string, port: number, base64: string): Promise<string> {
  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 0) throw new Error("init görsel çözümlenemedi (geçersiz base64)");

  const form = new FormData();
  form.append("image", new Blob([buf]), `init-${crypto.randomUUID()}.png`);
  form.append("overwrite", "true");

  const res = await comfyFetch(vpnIp, port, "/upload/image", { method: "POST", body: form }, 20_000);
  if (!res.ok) throw new Error(`ComfyUI /upload/image HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { name?: string };
  if (!data.name) throw new Error("ComfyUI init görsel yüklemesi beklenmeyen yanıt döndü");
  return data.name;
}

export async function generateImage(vpnIp: string, port: number, params: ImageGenRequest): Promise<ImageGenResult> {
  const seed = params.seed ?? crypto.randomInt(0, 2 ** 31);
  const initImageFilename = params.initImageB64 ? await uploadInitImage(vpnIp, port, params.initImageB64) : undefined;
  const workflow = buildWorkflow(params, seed, initImageFilename);
  const clientId = crypto.randomUUID();

  const submitRes = await comfyFetch(vpnIp, port, "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`ComfyUI /prompt HTTP ${submitRes.status}: ${text}`);
  }
  const submitData = (await submitRes.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!submitData.prompt_id) {
    throw new Error(`ComfyUI iş kabul etmedi: ${JSON.stringify(submitData.error ?? submitData.node_errors ?? submitData)}`);
  }
  const promptId = submitData.prompt_id;

  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const historyRes = await comfyFetch(vpnIp, port, `/history/${promptId}`, undefined, 8000);
    if (!historyRes.ok) continue;
    const history = (await historyRes.json()) as Record<
      string,
      { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }> }
    >;
    const entry = history[promptId];
    if (!entry) continue;
    const images = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
    if (images.length === 0) continue;

    const fetched = await Promise.all(
      images.map(async (img) => {
        const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
        const viewRes = await comfyFetch(vpnIp, port, `/view?${q}`, undefined, 15000);
        if (!viewRes.ok) throw new Error(`ComfyUI /view HTTP ${viewRes.status}`);
        const buf = Buffer.from(await viewRes.arrayBuffer());
        return { b64Json: buf.toString("base64") };
      }),
    );
    return { images: fetched, seed };
  }

  throw new Error("ComfyUI görsel üretimi zaman aşımına uğradı");
}
