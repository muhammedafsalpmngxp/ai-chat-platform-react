import type { Attachment } from "./attachments";
import { DEFAULT_SETTINGS, type ChatSettings } from "./providers";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
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

/** Returns false if the value couldn't be saved (storage full or blocked). The app still works for this tab. */
function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSettings = (): ChatSettings => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) });
export const saveSettings = (s: ChatSettings) => write(SETTINGS_KEY, s);

export const loadConversations = (): Conversation[] => read<Conversation[]>(CONVERSATIONS_KEY, []);
/**
 * File contents are too big for localStorage, so only names, sizes and image thumbnails are saved.
 * Returns false if the chats couldn't be saved.
 */
export const saveConversations = (list: Conversation[]): boolean =>
  write(
    CONVERSATIONS_KEY,
    list.map((c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.attachments ? { ...m, attachments: m.attachments.map(({ data: _data, ...rest }) => rest) } : m,
      ),
    })),
  );

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
