import { ArrowUp, KeyRound, PanelLeftOpen, Square, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { SettingsModal } from "@/components/SettingsModal";
import { Sidebar } from "@/components/Sidebar";
import { PROVIDERS, type ChatSettings } from "@/lib/providers";
import {
  loadConversations,
  loadSettings,
  newId,
  saveConversations,
  saveSettings,
  type ChatMessage,
  type Conversation,
} from "@/lib/storage";

const NO_MESSAGES: ChatMessage[] = [];

const SUGGESTIONS = [
  { title: "Explain a concept", prompt: "Explain how LangGraph state graphs work, with a small example." },
  { title: "Write some code", prompt: "Write a TypeScript function that debounces another function." },
  { title: "Brainstorm ideas", prompt: "Give me 5 creative names for a productivity app." },
  { title: "Summarize text", prompt: "Summarize the key ideas of clean architecture in a few bullet points." },
];

export default function App() {
  // Chats and settings are read from localStorage on first render.
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? NO_MESSAGES;

  // Keep the view pinned to the bottom while the answer streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-grow the composer.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const updateConversation = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const newChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setInput("");
    if (window.innerWidth < 768) setSidebarOpen(false);
    textareaRef.current?.focus();
  };

  const deleteChat = (id: string) => {
    if (id === activeId) newChat();
    setConversations((list) => list.filter((c) => c.id !== id));
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", content };
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "" };

    let convId = activeId;
    let history: ChatMessage[];
    if (!convId || !active) {
      convId = newId();
      history = [userMsg];
      const title = content.length > 40 ? content.slice(0, 40) + "…" : content;
      setConversations((list) => [
        { id: convId!, title, messages: [userMsg, assistantMsg], updatedAt: Date.now() },
        ...list,
      ]);
      setActiveId(convId);
    } else {
      history = [...active.messages.filter((m) => !m.error), userMsg];
      updateConversation(convId, (c) => ({
        ...c,
        messages: [...c.messages, userMsg, assistantMsg],
        updatedAt: Date.now(),
      }));
    }
    setInput("");
    setStreaming(true);

    const setAssistant = (patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
      updateConversation(convId!, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m,
        ),
      }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          provider: settings.provider,
          model: settings.model,
          apiKey: settings.apiKey,
          systemPrompt: settings.systemPrompt,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "token") setAssistant((m) => ({ content: m.content + event.text }));
          if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setAssistant((m) => ({ content: m.content ? `${m.content}\n\n${message}` : message, error: true }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const saveAndClose = (s: ChatSettings) => {
    setSettings(s);
    saveSettings(s);
    setSettingsOpen(false);
  };

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const connected = !!settings.apiKey;
  const lastMsg = messages[messages.length - 1];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          if (window.innerWidth < 768) setSidebarOpen(false);
        }}
        onNew={newChat}
        onDelete={deleteChat}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        connected={connected}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-1 px-3">
          {!sidebarOpen && (
            <>
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
              >
                <PanelLeftOpen size={20} />
              </button>
              <button
                onClick={newChat}
                aria-label="New chat"
                className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
              >
                <SquarePen size={20} />
              </button>
            </>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-semibold hover:bg-[var(--hover)]"
            title="Change model in Settings"
          >
            Chat AI
            <span className="font-mono text-xs font-normal text-[var(--muted)]">{settings.model}</span>
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 pb-10">
              <h1 className="mb-2 text-3xl font-semibold">What can I help with?</h1>
              <p className="mb-8 text-sm text-[var(--muted)]">
                Chat AI · {PROVIDERS[settings.provider].label}
              </p>
              {!connected && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="mb-8 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm hover:bg-amber-500/20"
                >
                  <KeyRound size={16} /> Connect your API key in Settings to start chatting
                </button>
              )}
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => send(s.prompt)}
                    className="rounded-xl border border-[var(--border)] px-4 py-3 text-left text-sm hover:bg-[var(--hover)]"
                  >
                    <div className="font-medium">{s.title}</div>
                    <div className="truncate text-[var(--muted)]">{s.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="mb-6 flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[var(--user-bubble)] px-5 py-2.5">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="mb-8 flex gap-4">
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-bold">
                      AI
                    </div>
                    <div className={`min-w-0 flex-1 ${m.error ? "text-red-500" : ""}`}>
                      {m.content ? (
                        <Markdown content={m.content} />
                      ) : (
                        streaming && m.id === lastMsg?.id && <span className="typing-dot" aria-label="Thinking" />
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-[var(--border)] bg-[var(--input)] px-4 py-3 shadow-sm focus-within:border-[var(--muted)]"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Message Chat AI"
              aria-label="Message Chat AI"
              className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-[var(--muted)]"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)]"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)] disabled:opacity-30"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </form>
          <p className="mt-2 text-center text-xs text-[var(--muted)]">
            Chat AI can make mistakes. Check important info.
          </p>
        </div>
      </main>

      {settingsOpen && (
        <SettingsModal settings={settings} onClose={closeSettings} onSave={saveAndClose} />
      )}
    </div>
  );
}
