import { KeyRound, PanelLeftOpen, SquarePen, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AttachmentChip } from "@/components/AttachmentChip";
import { Composer } from "@/components/Composer";
import { Markdown } from "@/components/Markdown";
import { ModelPicker } from "@/components/ModelPicker";
import { SettingsModal } from "@/components/SettingsModal";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAttachments } from "@/hooks/useAttachments";
import { formatBytes, UPLOAD_LIMITS } from "@/lib/attachment-limits";
import { toWireMessages } from "@/lib/attachments";
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

export default function App() {
  // Chats and settings are read from localStorage on first render.
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const uploads = useAttachments();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

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
    const files = uploads.attachments.map(({ loading: _loading, ...a }) => a);
    if ((!content && !files.length) || streaming || uploads.loading) return;

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content,
      ...(files.length && { attachments: files }),
    };
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "" };

    let convId = activeId;
    let history: ChatMessage[];
    if (!convId || !active) {
      convId = newId();
      history = [userMsg];
      const label = content || files.map((f) => f.name).join(", ");
      const title = label.length > 40 ? label.slice(0, 40) + "…" : label;
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
    uploads.clear();
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
          messages: toWireMessages(history),
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

  const updateSettings = (s: ChatSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  const saveAndClose = (s: ChatSettings) => {
    updateSettings(s);
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

      <main
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          uploads.addFiles(Array.from(e.dataTransfer.files));
        }}
      >
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
          <ModelPicker
            settings={settings}
            onSelect={(model) => updateSettings({ ...settings, model })}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
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
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="mb-6 flex flex-col items-end gap-2">
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
                        {m.attachments.map((a) => (
                          <AttachmentChip key={a.id} attachment={a} />
                        ))}
                      </div>
                    )}
                    {m.content && (
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[var(--user-bubble)] px-5 py-2.5">
                        {m.content}
                      </div>
                    )}
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
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => send(input)}
            onStop={stop}
            streaming={streaming}
            textareaRef={textareaRef}
            attachments={uploads.attachments}
            attachmentErrors={uploads.errors}
            attachmentsLoading={uploads.loading}
            attachmentsFull={uploads.full}
            onAddFiles={uploads.addFiles}
            onRemoveAttachment={uploads.remove}
          />
        </div>

        {/* Drag-and-drop overlay */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-sm transition-opacity duration-200 ${
            dragging ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[var(--accent)] px-12 py-10 text-center transition-transform duration-200 ${
              dragging ? "scale-100" : "scale-95"
            }`}
          >
            <Upload size={32} className="text-[var(--accent)]" />
            <div className="text-lg font-semibold">Drop files to attach</div>
            <div className="text-sm text-[var(--muted)]">
              Images up to {formatBytes(UPLOAD_LIMITS.maxImageBytes)}, PDFs up to{" "}
              {formatBytes(UPLOAD_LIMITS.maxPdfBytes)}, text files up to {formatBytes(UPLOAD_LIMITS.maxTextBytes)}
              <br />
              Max {UPLOAD_LIMITS.maxFiles} files per message
            </div>
          </div>
        </div>
      </main>

      {settingsOpen && (
        <SettingsModal settings={settings} onClose={closeSettings} onSave={saveAndClose} />
      )}
    </div>
  );
}
