import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi, RagStatus } from "../../../types";
import { formatTarget } from "../../../data/kpiEngine";
import { previewStatus } from "../../../data/hrEngine";

/**
 * The live Early Warning strip shown at the foot of each section.
 *
 * It answers the question the specification cares about most: "what is this
 * submission about to trigger?" - using the same engine and the same configured
 * thresholds submission will use, so the preview and the outcome cannot
 * disagree. Where no threshold is approved it says so rather than inventing a
 * verdict (Sections 5, 7, 13, 25).
 */
export function HrWarningPreview({
  items,
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string }[];
}) {
  const rows = items.filter((i) => i.kpi);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl bg-ink p-4 text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Early Warning preview</p>
      <div className="mt-3 flex flex-col gap-3">
        {rows.map(({ kpi, value, emptyNote }) => {
          if (!kpi) return null;
          const { status, thresholdNote } = previewStatus(kpi, value);
          const derived = value !== null;
          return (
            <div key={kpi.id} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white/90">{kpi.name}</p>
                  <p className="text-xs text-white/50">
                    {derived ? (
                      <>
                        {formatPreviewValue(kpi, value!)}
                        {kpi.target !== 0 && <> · Target {formatTarget(kpi)}</>}
                        {kpi.greenThreshold !== null && kpi.amberThreshold !== null ? (
                          <> · Amber at {kpi.amberThreshold}</>
                        ) : null}
                      </>
                    ) : (
                      emptyNote
                    )}
                  </p>
                </div>
                <StatusBadge status={status as RagStatus} />
              </div>
              {thresholdNote && <p className="text-[11px] leading-snug text-butter/80">{thresholdNote}</p>}
              {(status === "amber" || status === "red") && (
                <p className="text-[11px] leading-snug text-white/60">
                  This will raise an Early Warning, create a Risk record and stage a Corrective Action on
                  submission.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatPreviewValue(kpi: Kpi, value: number): string {
  switch (kpi.unit) {
    case "currency":
      return `R${value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "days":
      return `${value.toFixed(0)} days`;
    default:
      return value.toLocaleString("en-ZA");
  }
}

/** Banner used by sections that cannot report at all (Performance, Section 8). */
export function HrNotAvailableNotice({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg text-ink-soft/30">◻</span>
        <div>
          <p className="text-sm font-semibold text-ink-soft/70">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">{reason}</p>
        </div>
      </div>
    </div>
  );
}

/** N/A toggle shared by the sections a department can legitimately skip. */
export function HrNotApplicableToggle({
  checked,
  onChange,
  what,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  what: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-ink/[0.03] px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-ink/20 accent-ink"
      />
      <span className="text-xs text-ink-soft/60">
        {what} does not apply this period
        <span className="block text-[11px] text-ink-soft/40">
          Marks the section Not Applicable so submission is not blocked. This is recorded, not hidden.
        </span>
      </span>
    </label>
  );
}