import { ChevronRight, Database, Lightbulb } from "lucide-react";

import type { AskDataDetails as Details } from "@/lib/askdata";

interface Props {
  details: Details;
  /** Follow-up buttons are disabled while another answer is streaming. */
  busy: boolean;
  onAsk: (question: string) => void;
}

const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** Insights, the result table, the SQL and follow-up questions of an Ask Data answer. */
export function AskDataDetails({ details: d, busy, onAsk }: Props) {
  return (
    <div className="mt-3 space-y-3 text-sm">
      {d.insights && d.insights.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--code-bg)] px-4 py-3">
          {d.insights.map((text) => (
            <li key={text} className="flex gap-2">
              <Lightbulb size={14} className="mt-1 shrink-0 text-amber-500" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}

      {d.result && d.result.columns.length > 0 && (
        <details className="group rounded-xl border border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[var(--muted)] hover:text-[var(--fg)]">
            <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
            <Database size={14} />
            Data · {d.result.totalRows} {d.result.totalRows === 1 ? "row" : "rows"}
            {d.result.rows.length < d.result.totalRows && ` (first ${d.result.rows.length} shown)`}
          </summary>
          <div className="max-h-80 overflow-auto border-t border-[var(--border)]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 bg-[var(--code-bg)]">
                <tr>
                  {d.result.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.result.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    {d.result!.columns.map((c) => (
                      <td key={c} className="whitespace-nowrap px-3 py-1.5">
                        {cell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {d.sql && (
        <details className="group rounded-xl border border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[var(--muted)] hover:text-[var(--fg)]">
            <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
            SQL query
          </summary>
          <pre className="overflow-x-auto border-t border-[var(--border)] bg-[var(--code-bg)] px-4 py-3 font-mono text-[12.5px] leading-relaxed">
            {d.sql}
          </pre>
        </details>
      )}

      {d.followups && d.followups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {d.followups.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => onAsk(q)}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-left text-[13px] hover:bg-[var(--hover)] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
