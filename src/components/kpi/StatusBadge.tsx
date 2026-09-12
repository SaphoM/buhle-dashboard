import type { RagStatus } from "../../types";
import { statusLabel } from "../../data/kpiEngine";

// Pill styling echoes the "15% / 60% / 10%" stat pills in the reference UI —
// filled dark for critical, filled butter-yellow for emerging risk, soft
// outline for on-target — while keeping green/amber/red legible via the dot.
const styles: Record<RagStatus, string> = {
  green: "bg-white text-ink-soft border-ink/15",
  amber: "bg-butter text-ink border-butter-dark",
  red: "bg-ink text-butter border-ink",
};

const dot: Record<RagStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-ink",
  red: "bg-rose-400",
};

export function StatusBadge({ status, compact }: { status: RagStatus; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status]}`} />
      {!compact && statusLabel[status]}
    </span>
  );
}
