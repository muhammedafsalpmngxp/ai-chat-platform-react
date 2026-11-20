import { AlertCircle, ArrowUp, Paperclip, Square } from "lucide-react";
import { useRef, type RefObject } from "react";

import { AttachmentChip } from "@/components/AttachmentChip";
import type { PendingAttachment } from "@/hooks/useAttachments";
import { ACCEPT, formatBytes, UPLOAD_LIMITS } from "@/lib/attachment-limits";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  attachments: PendingAttachment[];
  attachmentErrors: string[];
  attachmentsLoading: boolean;
  attachmentsFull: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export function Composer(props: Props) {
  const { value, onChange, onSubmit, onStop, streaming, textareaRef, attachments } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = (value.trim() || attachments.length > 0) && !props.attachmentsLoading;
  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Limit errors */}
      {props.attachmentErrors.length > 0 && (
        <div role="alert" className="upload-error mb-2 space-y-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {props.attachmentErrors.map((e) => (
            <p key={e} className="flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSubmit();
        }}
        className="rounded-3xl border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 shadow-sm transition-colors focus-within:border-[var(--muted)]"
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1.5">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                loading={a.loading}
                onRemove={() => props.onRemoveAttachment(a.id)}
              />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              props.onAddFiles(Array.from(e.target.files ?? []));
              e.target.value = ""; // allow picking the same file again
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={props.attachmentsFull}
            aria-label="Attach files"
            title={
              props.attachmentsFull
                ? `Limit reached: ${UPLOAD_LIMITS.maxFiles} files per message`
                : `Attach images, PDFs or text files (up to ${UPLOAD_LIMITS.maxFiles})`
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--fg)] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Paperclip size={19} />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend && !streaming) onSubmit();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                props.onAddFiles(files);
              }
            }}
            placeholder="Message Chat AI"
            aria-label="Message Chat AI"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-[var(--muted)]"
          />

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)]"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)] transition active:scale-90 disabled:opacity-30"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>

      <p className="mt-2 text-center text-xs text-[var(--muted)]">
        {attachments.length > 0 ? (
          <>
            {attachments.length} of {UPLOAD_LIMITS.maxFiles} files · {formatBytes(totalBytes)} of{" "}
            {formatBytes(UPLOAD_LIMITS.maxMessageBytes)}
          </>
        ) : (
          "Chat AI can make mistakes. Check important info."
        )}
      </p>
    </div>
  );
}
