import { ArrowUp, Square } from "lucide-react";
import type { RefObject } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

const PLACEHOLDER = "Ask a question about your data";

export function Composer({ value, onChange, onSubmit, onStop, streaming, textareaRef }: Props) {
  const canSend = !!value.trim();

  return (
    <div className="mx-auto max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend && !streaming) onSubmit();
        }}
        className="rounded-3xl border border-[var(--border)] bg-[var(--input)] py-2.5 pl-5 pr-3 shadow-sm transition-colors focus-within:border-[var(--muted)]"
      >
        <div className="flex items-end gap-2">
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
            placeholder={PLACEHOLDER}
            aria-label={PLACEHOLDER}
            className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-[var(--muted)]"
          />

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)]"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send question"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)] transition active:scale-90 disabled:opacity-30"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>

      <p className="mt-2 text-center text-xs text-[var(--muted)]">
        Chat AI can make mistakes. Check important numbers.
      </p>
    </div>
  );
}
