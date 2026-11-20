// Shared between the browser (settings UI) and the server (graph / API routes).

export type Provider = "anthropic" | "openai";

export interface ChatSettings {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPrompt: string;
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
