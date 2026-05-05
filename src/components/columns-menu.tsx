"use client";
import * as React from "react";
import { Columns3 } from "lucide-react";

export type ColumnDef = { key: string; label: string };

/**
 * Persisted "show/hide columns" state per page. The storageKey scopes the
 * preference so e.g. hiding "Centre" on the Students table doesn't also
 * hide it on the Leaderboard.
 */
export function useHiddenColumns(storageKey: string) {
  const [hidden, setHidden] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore parse errors */
    }
    return new Set();
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(hidden)));
  }, [storageKey, hidden]);

  const toggle = React.useCallback((key: string) => {
    setHidden((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => setHidden(new Set()), []);

  const isVisible = React.useCallback((key: string) => !hidden.has(key), [hidden]);

  return { hidden, toggle, reset, isVisible, set: setHidden };
}

/**
 * Compact "Columns" dropdown — same shape across every table on the site.
 * Pass it the columns the table COULD show, plus the hidden Set + toggle
 * callback from useHiddenColumns().
 */
export function ColumnsMenu({
  columns,
  hidden,
  onToggle,
  onResetAll,
  buttonLabel = "Columns",
}: {
  columns: ColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onResetAll: () => void;
  buttonLabel?: string;
}) {
  return (
    <details className="relative">
      <summary className="h-9 px-3 rounded-md border border-[#E8E3D7] bg-white text-[12.5px] flex items-center gap-1.5 cursor-pointer hover:border-[#D9D2BE] list-none select-none">
        <Columns3 className="w-3.5 h-3.5 text-[#7A7770]" />
        <span className="hidden sm:inline">{buttonLabel}</span>
        {hidden.size > 0 && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 rounded bg-[#F4F1E8] text-[#1B3A6B]">
            {hidden.size} hidden
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-[#E8E3D7] rounded-md shadow-lg p-1.5">
        <div className="flex justify-between items-center px-2 py-1 border-b border-[#F0EDE5] mb-1">
          <span className="text-[10px] uppercase tracking-wider text-[#7A7770]">
            Show columns
          </span>
          {hidden.size > 0 && (
            <button
              onClick={onResetAll}
              className="text-[11px] text-[#1B3A6B] hover:underline"
            >
              Show all
            </button>
          )}
        </div>
        {columns.map((c) => (
          <label
            key={c.key}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F4F1E8] rounded cursor-pointer text-[13px]"
          >
            <input
              type="checkbox"
              className="accent-[#1B3A6B]"
              checked={!hidden.has(c.key)}
              onChange={() => onToggle(c.key)}
            />
            <span className="truncate">{c.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
