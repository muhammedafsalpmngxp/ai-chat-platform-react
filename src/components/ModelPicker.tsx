import { Check, ChevronDown, Settings2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { availableModels, MODEL_INFO, modelLabel, PROVIDERS, type ChatSettings } from "@/lib/providers";

interface Props {
  settings: ChatSettings;
  onSelect: (model: string) => void;
  onOpenSettings: () => void;
}

/** ChatGPT-style model switcher shown in the chat header. */
export function ModelPicker({ settings, onSelect, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const models = availableModels(settings);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the selected model when the menu opens.
  useEffect(() => {
    if (!open) return;
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (selected ?? listRef.current?.querySelector<HTMLElement>("[role=menuitemradio]"))?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-lg hover:bg-[var(--hover)]"
      >
        <span className="font-semibold">Chat AI</span>
        <span className="max-w-[40vw] truncate text-[var(--muted)]">{modelLabel(settings.model)}</span>
        <ChevronDown size={16} className={`text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label="Choose a model"
          onKeyDown={onMenuKey}
          className="absolute left-0 top-full z-30 mt-1 w-[min(340px,calc(100vw-24px))] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-xl"
        >
          <div className="px-3 pb-1 pt-2 text-xs text-[var(--muted)]">
            {PROVIDERS[settings.provider].label}
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            {models.map((id) => {
              const info = MODEL_INFO[id];
              const selected = id === settings.model;
              return (
                <button
                  key={id}
                  role="menuitemradio"
                  aria-checked={selected}
                  data-menu-item
                  onClick={() => {
                    onSelect(id);
                    close();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{info?.label ?? id}</div>
                    {info && <div className="truncate text-xs text-[var(--muted)]">{info.description}</div>}
                  </div>
                  {selected && <Check size={16} className="shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="my-1 border-t border-[var(--border)]" />
          <button
            role="menuitem"
            data-menu-item
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
          >
            <Settings2 size={16} className="text-[var(--muted)]" />
            Change provider, API key or model list…
          </button>
        </div>
      )}
    </div>
  );
}
