import { FileCode2, FileText, ImageIcon, Loader2, X } from "lucide-react";

import { formatBytes } from "@/lib/attachment-limits";
import type { Attachment } from "@/lib/attachments";

interface Props {
  attachment: Pick<Attachment, "name" | "size" | "kind" | "thumbnail" | "data">;
  /** Still being read from disk. */
  loading?: boolean;
  onRemove?: () => void;
}

const KIND_STYLE = {
  pdf: { icon: FileText, color: "bg-red-500", label: "PDF" },
  text: { icon: FileCode2, color: "bg-sky-500", label: "Text" },
  image: { icon: ImageIcon, color: "bg-violet-500", label: "Image" },
} as const;

export function AttachmentChip({ attachment: a, loading, onRemove }: Props) {
  const removeButton = onRemove && (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${a.name}`}
      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] opacity-100 shadow-sm transition hover:text-[var(--fg)] md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
    >
      <X size={12} />
    </button>
  );

  // Image: square thumbnail.
  if (a.kind === "image" && a.thumbnail) {
    return (
      <div className="attachment-in group relative h-14 w-14 shrink-0" title={`${a.name} · ${formatBytes(a.size)}`}>
        <img src={a.thumbnail} alt={a.name} className="h-full w-full rounded-xl border border-[var(--border)] object-cover" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
            <Loader2 size={16} className="animate-spin text-white" />
          </div>
        )}
        {removeButton}
      </div>
    );
  }

  const { icon: Icon, color, label } = KIND_STYLE[a.kind];
  const unavailable = !loading && a.data === undefined && !onRemove;

  return (
    <div
      className="attachment-in group relative flex h-14 w-56 max-w-full shrink-0 items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2.5"
      title={unavailable ? `${a.name} (not kept after reload)` : a.name}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${color}`}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={18} />}
      </div>
      <div className="min-w-0 text-left">
        <div className="truncate text-sm font-medium">{a.name}</div>
        <div className="text-xs text-[var(--muted)]">
          {label} · {formatBytes(a.size)}
        </div>
      </div>
      {removeButton}
    </div>
  );
}
