import type { ReactNode } from "react";

export function BdPlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-6">
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      <div className="text-sm text-ink-soft/70">{children || "Business Development data capture to be implemented."}</div>
    </div>
  );
}
