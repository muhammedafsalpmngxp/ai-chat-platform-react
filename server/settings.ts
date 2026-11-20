import type { Provider } from "../src/lib/providers";

/** Key from the request (set in the Settings modal), else from the server env. */
export function resolveApiKey(provider: Provider, fromClient?: string): string | undefined {
  const key = fromClient?.trim();
  if (key) return key;
  return provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
}

export function isProvider(value: unknown): value is Provider {
  return value === "anthropic" || value === "openai";
}

/** Turn provider SDK errors into a short message that is safe to show in the UI. */
export function describeError(err: unknown): string {
  const e = err as { status?: number; message?: string; name?: string };
  if (e?.name === "AbortError") return "Request cancelled.";
  if (e?.status === 401) return "Invalid API key. Check it in Settings.";
  if (e?.status === 403) return "This API key doesn't have access to that model.";
  if (e?.status === 404) return "Model not found. Pick another model in Settings.";
  if (e?.status === 429) return "Rate limited by the provider. Wait a moment and try again.";
  if (typeof e?.status === "number" && e.status >= 500) return "The provider is having trouble. Try again shortly.";
  return e?.message || "Something went wrong.";
}
