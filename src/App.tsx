import { AlertTriangle, PanelLeftOpen, RotateCw, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AskDataDetails as AskDataPanel } from "@/components/AskDataDetails";
import { Composer } from "@/components/Composer";
import { Markdown } from "@/components/Markdown";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  fetchAskDataStatus,
  fetchStarters,
  type AskDataDetails,
  type AskDataResult,
  type AskDataStatus,
} from "@/lib/askdata";
import { readNdjson } from "@/lib/stream";
import { loadConversations, newId, saveConversations, type ChatMessage, type Conversation } from "@/lib/storage";

const NO_MESSAGES: ChatMessage[] = [];

/** The server's Ask Data connection, plus suggested questions when it's connected. */
async function loadConnection(): Promise<{ status: AskDataStatus; starters: string[] }> {
  const status = await fetchAskDataStatus();
  return { status, starters: status.connected ? await fetchStarters() : [] };
}

export default function App() {
  // Chats are read from localStorage on first render.
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [storageFailed, setStorageFailed] = useState(false);
  /** The server signs in to Ask Data itself; null while checking. */
  const [status, setStatus] = useState<AskDataStatus | null>(null);
  const [starters, setStarters] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Follow new tokens only while the user is at (or near) the bottom of the chat.
  const stickToBottom = useRef(true);
  const latestConversations = useRef(conversations);
  const savePending = useRef(false);

  // Save chats. While an answer streams, wait until it pauses (or ends)
  // instead of rewriting all of localStorage on every token.
  useEffect(() => {
    latestConversations.current = conversations;
    savePending.current = true;
    const timer = window.setTimeout(
      () => {
        savePending.current = false;
        setStorageFailed(!saveConversations(conversations));
      },
      streaming ? 1000 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [conversations, streaming]);

  // Don't lose a pending save when the tab is closed mid-answer. Only write if a save is
  // actually pending, so closing an idle tab never overwrites chats saved by another tab.
  useEffect(() => {
    const flush = () => {
      if (!savePending.current) return;
      savePending.current = false;
      saveConversations(latestConversations.current);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // Check the Ask Data connection when the app opens.
  useEffect(() => {
    let cancelled = false;
    loadConnection().then((c) => {
      if (cancelled) return;
      setStatus(c.status);
      setStarters(c.starters);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retryConnection = async () => {
    setStatus(null);
    const c = await loadConnection();
    setStatus(c.status);
    setStarters(c.starters);
  };

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? NO_MESSAGES;

  // Opening a chat starts at its newest message.
  useEffect(() => {
    stickToBottom.current = true;
  }, [activeId]);

  // Keep the view pinned to the bottom while the answer streams in, unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-grow the composer: on every edit, and whenever its width changes
  // (first layout, sidebar toggle, window resize) since that changes line wrapping.
  const fitComposer = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, []);

  useEffect(fitComposer, [input, fitComposer]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        fitComposer();
      }
    });
    observer.observe(ta);
    return () => observer.disconnect();
  }, [fitComposer]);

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
    const askDataConversationId = activeId && active ? active.askDataConversationId : undefined;
    if (!convId || !active) {
      convId = newId();
      const title = content.length > 40 ? content.slice(0, 40) + "…" : content;
      setConversations((list) => [
        { id: convId!, title, messages: [userMsg, assistantMsg], updatedAt: Date.now() },
        ...list,
      ]);
      setActiveId(convId);
    } else {
      updateConversation(convId, (c) => ({
        ...c,
        messages: [...c.messages, userMsg, assistantMsg],
        updatedAt: Date.now(),
      }));
    }
    setInput("");
    setStreaming(true);
    stickToBottom.current = true;

    const setAssistant = (patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
      updateConversation(convId!, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m,
        ),
      }));
    const setDetails = (patch: Partial<AskDataDetails>) =>
      setAssistant((m) => ({ askData: { ...m.askData, ...patch } }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/askdata/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ question: content, conversationId: askDataConversationId ?? null }),
      });
      await readNdjson(res, (event) => {
        switch (event.type) {
          case "status":
            setDetails({ status: String(event.text) });
            break;
          case "token":
            setAssistant((m) => ({ content: m.content + String(event.text) }));
            break;
          case "sql":
            setDetails({ sql: String(event.sql) });
            break;
          case "result":
            setDetails({ result: event as unknown as AskDataResult });
            break;
          case "insights":
            setDetails({ insights: event.items as string[] });
            break;
          case "followups":
            setDetails({ followups: event.items as string[] });
            break;
          case "done":
            if (typeof event.conversationId === "number") {
              const id = event.conversationId;
              updateConversation(convId!, (c) => ({ ...c, askDataConversationId: id }));
            }
            break;
          case "error":
            throw new Error(String(event.message));
        }
      });
      // An answer came back, so the server is signed in.
      setStatus({ connected: true });
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setAssistant((m) => ({ content: m.content ? `${m.content}\n\n${message}` : message, error: true }));
      }
    } finally {
      // Stopped before anything arrived: drop the empty answer. Also clear the progress text.
      updateConversation(convId!, (c) => ({
        ...c,
        messages: c.messages
          .filter((m) => m.id !== assistantMsg.id || m.content || m.error || m.askData?.result)
          .map((m) => (m.id === assistantMsg.id && m.askData ? { ...m, askData: { ...m.askData, status: undefined } } : m)),
      }));
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

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
        status={status}
        onRetry={retryConnection}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-1 px-3">
          {/* Open-sidebar / new-chat buttons slide in as the sidebar slides out. */}
          <div
            inert={sidebarOpen}
            className={`sidebar-motion flex shrink-0 items-center gap-1 overflow-hidden ${
              sidebarOpen ? "max-w-0 -translate-x-2 opacity-0" : "max-w-24 translate-x-0 opacity-100"
            }`}
          >
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
          </div>
          <span className="px-2 text-lg font-semibold">Ask Data</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 pb-10">
              <h1 className="mb-2 text-3xl font-semibold">What do you want to know?</h1>
              <p className="mb-8 text-sm text-[var(--muted)]">Answers from your live TWise data</p>
              {status && !status.connected && (
                <div
                  role="alert"
                  className="mb-8 flex max-w-xl items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <span className="flex-1">{status.error ?? "Couldn't connect to Ask Data."}</span>
                  <button
                    onClick={retryConnection}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 font-medium hover:bg-amber-500/20"
                  >
                    <RotateCw size={13} /> Try again
                  </button>
                </div>
              )}
              {starters.length > 0 && (
                <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                  {starters.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-sm hover:bg-[var(--hover)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  m.content && (
                    <div key={m.id} className="mb-6 flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[var(--user-bubble)] px-5 py-2.5">
                        {m.content}
                      </div>
                    </div>
                  )
                ) : (
                  <div key={m.id} className="mb-8 flex gap-4">
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-bold">
                      AI
                    </div>
                    <div className={`min-w-0 flex-1 ${m.error ? "text-red-500" : ""}`}>
                      {m.content ? (
                        <Markdown content={m.content} />
                      ) : (
                        streaming &&
                        m.id === lastMsg?.id &&
                        (m.askData?.status ? (
                          <p className="flex items-center gap-3 pt-1 text-sm text-[var(--muted)]">
                            <span className="typing-dot !mt-0" aria-hidden />
                            {m.askData.status}
                          </p>
                        ) : (
                          <span className="typing-dot" aria-label="Thinking" />
                        ))
                      )}
                      {m.askData && <AskDataPanel details={m.askData} busy={streaming} onAsk={send} />}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 pb-4">
          {storageFailed && (
            <p role="status" className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle size={15} className="shrink-0 text-amber-500" />
              Chats can't be saved in this browser (storage is full or blocked). Delete old chats to free space.
            </p>
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => send(input)}
            onStop={stop}
            streaming={streaming}
            textareaRef={textareaRef}
          />
        </div>
      </main>
    </div>
  );
}
