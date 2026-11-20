import { DEFAULT_SETTINGS, type ChatSettings } from "./providers";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const SETTINGS_KEY = "chat-ai:settings";
const CONVERSATIONS_KEY = "chat-ai:conversations";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — the app still works for this tab.
  }
}

export const loadSettings = (): ChatSettings => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) });
export const saveSettings = (s: ChatSettings) => write(SETTINGS_KEY, s);

export const loadConversations = (): Conversation[] => read<Conversation[]>(CONVERSATIONS_KEY, []);
export const saveConversations = (c: Conversation[]) => write(CONVERSATIONS_KEY, c);

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
