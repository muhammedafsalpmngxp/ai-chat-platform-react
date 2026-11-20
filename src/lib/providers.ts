// Shared between the browser (settings UI) and the server (graph / API routes).

export type Provider = "anthropic" | "openai";

export interface ChatSettings {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  /** Models the key can use, saved after "Test" in Settings (per provider). */
  fetchedModels?: Partial<Record<Provider, string[]>>;
}

/** Friendly names for the header model dropdown. Unknown IDs show as-is. */
export const MODEL_INFO: Record<string, { label: string; description: string }> = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", description: "Great for most tasks" },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", description: "Fast and capable for everyday work" },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", description: "Fastest, lowest cost" },
  "claude-fable-5-2": { label: "Claude Fable 5.2", description: "Most capable, for the hardest problems" },
  "gpt-5.6-luna": { label: "GPT-5.6 Luna", description: "OpenAI" },
};

export const modelLabel = (id: string) => MODEL_INFO[id]?.label ?? id;

/** Models to offer for the current provider: the curated list plus any fetched by "Test". */
export function availableModels(settings: ChatSettings): string[] {
  const curated = PROVIDERS[settings.provider].models;
  const fetched = settings.fetchedModels?.[settings.provider];
  if (!fetched?.length) return Array.from(new Set([...curated, settings.model].filter(Boolean)));
  // Curated models the key can actually use first, then everything else it can use.
  return Array.from(
    new Set([...curated.filter((m) => fetched.includes(m)), ...fetched, settings.model].filter(Boolean)),
  );
}

export const PROVIDERS: Record<
  Provider,
  { label: string; keyPrefix: string; keyUrl: string; defaultModel: string; models: string[] }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyPrefix: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"],
  },
  openai: {
    label: "OpenAI",
    keyPrefix: "sk-",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5.6-luna",
    models: ["gpt-5.6-luna"],
  },
};

export const DEFAULT_SYSTEM_PROMPT =
  "You are Chat AI, a helpful, friendly assistant. Answer clearly and use Markdown (headings, lists, code blocks) when it helps readability.";

export const DEFAULT_SETTINGS: ChatSettings = {
  provider: "anthropic",
  apiKey: "",
  model: PROVIDERS.anthropic.defaultModel,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};
