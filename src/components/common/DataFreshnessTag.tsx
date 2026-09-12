export function DataFreshnessTag({ label = "Updated today", source }: { label?: string; source?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs font-medium text-ink-soft/70">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {label}
      {source ? ` · ${source}` : ""}
    </span>
  );
}
