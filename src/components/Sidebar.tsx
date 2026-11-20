import { MessageSquare, PanelLeftClose, Settings, SquarePen, Trash2 } from "lucide-react";

import type { Conversation } from "@/lib/storage";

interface Props {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  connected: boolean;
}

function groupLabel(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}

export function Sidebar(props: Props) {
  const { open, conversations, activeId, onSelect, onNew, onDelete, onClose, onOpenSettings, connected } =
    props;

  const groups = new Map<string, Conversation[]>();
  for (const c of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const label = groupLabel(c.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }

  return (
    <>
      {/* Mobile backdrop (fades in/out) */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/*
        Mobile: slides in over the chat.
        Desktop: the column's width animates 260px <-> 0 while the content inside
        keeps its 260px width, so it glides out instead of squashing.
      */}
      <aside
        inert={!open}
        className={`sidebar-motion fixed inset-y-0 left-0 z-40 w-[260px] overflow-hidden bg-[var(--sidebar)] md:relative md:z-auto md:translate-x-0 ${
          open ? "translate-x-0 md:w-[260px]" : "-translate-x-full md:w-0"
        }`}
      >
        <div
          className={`sidebar-motion flex h-full w-[260px] flex-col ${
            open ? "opacity-100" : "opacity-0 md:-translate-x-6"
          }`}
        >
          <div className="flex items-center justify-between px-3 pt-3">
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
            >
              <PanelLeftClose size={20} />
            </button>
            <button
              onClick={onNew}
              aria-label="New chat"
              className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
            >
              <SquarePen size={20} />
            </button>
          </div>

          <button
            onClick={onNew}
            className="mx-3 mt-3 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-[var(--hover)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--fg)] text-xs font-bold text-[var(--bg)]">
              AI
            </span>
            Chat AI
          </button>

          <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-3">
            {conversations.length === 0 && (
              <p className="px-2 text-xs text-[var(--muted)]">Your conversations will appear here.</p>
            )}
            {[...groups.entries()].map(([label, items]) => (
              <div key={label} className="mb-4">
                <h3 className="px-2 pb-1 text-xs font-medium text-[var(--muted)]">{label}</h3>
                {items.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center rounded-lg ${
                      c.id === activeId ? "bg-[var(--active)]" : "hover:bg-[var(--hover)]"
                    }`}
                  >
                    <button
                      onClick={() => onSelect(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                      title={c.title}
                    >
                      <MessageSquare size={14} className="shrink-0 text-[var(--muted)]" />
                      <span className="truncate">{c.title}</span>
                    </button>
                    <button
                      onClick={() => onDelete(c.id)}
                      aria-label={`Delete ${c.title}`}
                      className="mr-1 rounded p-1.5 text-[var(--muted)] opacity-0 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </nav>

          <div className="border-t border-[var(--border)] p-3">
            <button
              onClick={onOpenSettings}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--hover)]"
            >
              <Settings size={18} />
              <span className="flex-1 text-left">Settings</span>
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
                title={connected ? "API key set" : "No API key in this browser"}
              />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
