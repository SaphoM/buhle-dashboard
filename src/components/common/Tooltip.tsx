import type { ReactNode } from "react";

// Shared hover/focus explainer bubble — same visual language as the Master
// Data tooltips on the Administration page, but wraps inline content (a
// table cell's text or badge) instead of a block-level row.
export function Tooltip({ text, children }: { text?: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <span
      tabIndex={0}
      className="group relative inline-flex rounded outline-none focus-visible:ring-2 focus-visible:ring-butter-dark"
    >
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-2xl bg-ink px-3 py-2 text-xs leading-snug text-butter opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
        <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-ink" />
      </span>
    </span>
  );
}
