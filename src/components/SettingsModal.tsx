import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  availableModels,
  DEFAULT_SYSTEM_PROMPT,
  PROVIDERS,
  type ChatSettings,
  type Provider,
} from "@/lib/providers";

// Mounted only while open, so the form starts fresh from `settings` each time.
interface Props {
  settings: ChatSettings;
  onClose: () => void;
  onSave: (s: ChatSettings) => void;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; count: number; usingServerKey: boolean }
  | { status: "error"; message: string };

export function SettingsModal({ settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const models = availableModels(draft);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = PROVIDERS[draft.provider];

  const changeProvider = (provider: Provider) => {
    setDraft((d) => ({ ...d, provider, apiKey: "", model: PROVIDERS[provider].defaultModel }));
    setTest({ status: "idle" });
  };

  const testConnection = async () => {
    setTest({ status: "testing" });
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: draft.provider, apiKey: draft.apiKey }),
      });
      const data = await res.json();
      if (!data.ok) return setTest({ status: "error", message: data.error });
      const list: string[] = data.models;
      setDraft((d) => {
        const fetchedModels = { ...d.fetchedModels, [d.provider]: list };
        // Keep the current model if the key can use it, else the first curated one it can.
        const model =
          !list.length || list.includes(d.model)
            ? d.model
            : (meta.models.find((m) => list.includes(m)) ?? list[0]);
        return { ...d, fetchedModels, model };
      });
      setTest({ status: "ok", count: data.models.length, usingServerKey: data.usingServerKey });
    } catch {
      setTest({ status: "error", message: "Couldn't reach the server." });
    }
  };

  const keyLooksWrong = draft.apiKey && !draft.apiKey.trim().startsWith(meta.keyPrefix);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 id="settings-title" className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} aria-label="Close settings" className="rounded-lg p-1.5 hover:bg-[var(--hover)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* Provider */}
          <section>
            <label className="mb-2 block text-sm font-medium">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => changeProvider(p)}
                  className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                    draft.provider === p
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium"
                      : "border-[var(--border)] hover:bg-[var(--hover)]"
                  }`}
                >
                  {PROVIDERS[p].label}
                </button>
              ))}
            </div>
          </section>

          {/* API key */}
          <section>
            <label htmlFor="api-key" className="mb-2 flex items-center gap-2 text-sm font-medium">
              <KeyRound size={15} /> API key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`${meta.keyPrefix}...`}
                  onChange={(e) => {
                    setDraft({ ...draft, apiKey: e.target.value });
                    setTest({ status: "idle" });
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 pr-10 font-mono text-sm outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted)] hover:text-[var(--fg)]"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={testConnection}
                disabled={test.status === "testing"}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--border)] px-3 text-sm hover:bg-[var(--hover)] disabled:opacity-60"
              >
                {test.status === "testing" && <Loader2 size={14} className="animate-spin" />}
                Test
              </button>
            </div>

            <div className="mt-2 min-h-5 text-xs">
              {test.status === "ok" && (
                <p className="flex items-center gap-1.5 text-emerald-500">
                  <CheckCircle2 size={14} />
                  Connected{test.usingServerKey ? " using the server's key from .env" : ""} —{" "}
                  {test.count} models available.
                </p>
              )}
              {test.status === "error" && (
                <p className="flex items-center gap-1.5 text-red-500">
                  <XCircle size={14} /> {test.message}
                </p>
              )}
              {test.status === "idle" && keyLooksWrong && (
                <p className="text-amber-500">
                  {meta.label} keys usually start with “{meta.keyPrefix}”.
                </p>
              )}
              {test.status === "idle" && !keyLooksWrong && (
                <p className="text-[var(--muted)]">
                  Get a key at{" "}
                  <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="underline">
                    {new URL(meta.keyUrl).host}
                  </a>
                  . Stored only in this browser.
                </p>
              )}
            </div>
          </section>

          {/* Model */}
          <section>
            <label htmlFor="model" className="mb-2 block text-sm font-medium">Model</label>
            <input
              id="model"
              list="model-options"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 font-mono text-sm outline-none focus:border-[var(--accent)]"
            />
            <datalist id="model-options">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Pick from the list or type any model ID. Press Test to load the models your key can use.
            </p>
          </section>

          {/* System prompt */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="system-prompt" className="text-sm font-medium">System prompt</label>
              <button
                onClick={() => setDraft({ ...draft, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
              >
                Reset
              </button>
            </div>
            <textarea
              id="system-prompt"
              rows={4}
              value={draft.systemPrompt}
              onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={() => setDraft({ ...draft, apiKey: "" })}
            className="text-sm text-red-500 hover:underline disabled:opacity-40"
            disabled={!draft.apiKey}
          >
            Remove key
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm hover:bg-[var(--hover)]">
              Cancel
            </button>
            <button
              onClick={() => onSave({ ...draft, apiKey: draft.apiKey.trim(), model: draft.model.trim() })}
              className="rounded-xl bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
