export type ThinkValue = boolean | "low" | "medium" | "high";

/**
 * OpenAI istemcileri "reasoning_effort" gönderir, bizim kendi arayüzümüz "think" boolean'ı kullanır.
 * `think` açıkça verilmişse o kazanır; yoksa reasoning_effort'tan türetilir.
 * "none"/"minimal" -> düşünmeyi kapat; "low"/"medium"/"high" Ollama'ya (qwen3) doğrudan iletilir.
 */
export function resolveThink(think: boolean | undefined, reasoningEffort: string | undefined): ThinkValue | undefined {
  if (think !== undefined) return think;
  if (!reasoningEffort) return undefined;
  if (reasoningEffort === "none" || reasoningEffort === "minimal") return false;
  if (reasoningEffort === "low" || reasoningEffort === "medium" || reasoningEffort === "high") return reasoningEffort;
  return undefined;
}
