import { Check, Copy } from "lucide-react";
import { useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const [copied, setCopied] = useState(false);
  const child = children as { props?: { className?: string; children?: unknown } };
  const lang = /language-(\w+)/.exec(child?.props?.className ?? "")?.[1] ?? "code";
  const text = String(child?.props?.children ?? "").replace(/\n$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — nothing to do.
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-[var(--muted)]">
        <span>{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-[var(--fg)]">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre {...props} className="overflow-x-auto px-4 pb-4 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: CodeBlock,
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
