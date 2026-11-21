import type { AskDataDetails } from "./askdata";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  /** Table, SQL, insights and follow-ups of an Ask Data answer. */
  askData?: AskDataDetails;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  /** TWise Ask Data conversation, so follow-up questions keep their context. */
  askDataConversationId?: number;
}

const CONVERSATIONS_KEY = "chat-ai:conversations";
/** Old settings (API keys, Ask Data tokens). No longer used, so they're deleted. */
const OLD_SETTINGS_KEY = "chat-ai:settings";

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

export function loadConversations(): Conversation[] {
  try {
    window.localStorage.removeItem(OLD_SETTINGS_KEY);
  } catch {
    // Storage blocked.
  }
  return read<Conversation[]>(CONVERSATIONS_KEY, []);
}

/** Returns false if the chats couldn't be saved. */
export const saveConversations = (list: Conversation[]): boolean => write(CONVERSATIONS_KEY, list);

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
