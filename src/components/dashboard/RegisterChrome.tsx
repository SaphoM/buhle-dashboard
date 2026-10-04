import { StatusBadge } from "../kpi/StatusBadge";
import type { Kpi, RagStatus } from "../../types";
import { formatTarget } from "../../data/kpiEngine";

/**
 * Chrome shared by every register-based submission section: the live Early
 * Warning strip, the Not Applicable switch, the data-source tag and the
 * no-data notes.
 *
 * It lives here rather than inside the Operations folder because Commercial
 * Farming needs the same four things for the same reasons, and because the
 * strip must be driven by the department's own status preview: Operations and
 * Commercial Farming both treat a stored "no data" differently from a live
 * preview with no value, and only each department's engine knows that rule.
 */

/** The shape both `previewOperationsStatus` and `previewFarmingStatus` return. */
export type StatusPreview = { status: RagStatus; thresholdNote?: string };

/** The live Early Warning strip shown at the foot of a register section.
 *
 *  Built on the same shared engine HR and Finance use, so the preview can never
 *  disagree with what submission actually does.
 *
 *  A KPI whose thresholds are not configured produces a visible "Threshold not
 *  configured" note rather than a Green badge. A farm with no approved mortality
 *  limit must not be able to display a green mortality light just because nobody
 *  has decided what good looks like. */
export function WarningPreview({
  items,
  previewStatus,
  currencySymbol = "R",
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string; label?: string }[];
  /** The department's own status rule, so the preview cannot diverge from it. */
  previewStatus: (kpi: Kpi | undefined, value: number | null) => StatusPreview;
  currencySymbol?: string;
}) {
  const rows = items.filter((i) => i.kpi);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl bg-ink p-4 text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Early Warning preview</p>
      <div className="mt-3 flex flex-col gap-3">
        {rows.map(({ kpi, value, emptyNote, label }) => {
          if (!kpi) return null;
          const { status, thresholdNote } = previewStatus(kpi, value);
          const derived = value !== null;
          return (
            <div key={kpi.id} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white/90">{label ?? kpi.name}</p>
                  <p className="text-xs text-white/50">
                    {derived ? (
                      <>
                        {formatPreviewValue(kpi, value!, currencySymbol)}
                        {kpi.target !== 0 && <> · Target {formatTarget(kpi)}</>}
                        {kpi.greenThreshold !== null && kpi.amberThreshold !== null ? (
                          <> · Amber at {kpi.greenThreshold.toLocaleString("en-ZA")}</>
                        ) : null}
                      </>
                    ) : (
                      emptyNote
                    )}
                  </p>
                </div>
                <StatusBadge status={status} />
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

function formatPreviewValue(kpi: Kpi, value: number, symbol: string): string {
  switch (kpi.unit) {
    case "currency":
      return `${symbol}${Math.round(value).toLocaleString("en-ZA")}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "days":
      return `${value.toFixed(0)} days`;
    default:
      return value.toLocaleString("en-ZA");
  }
}

/** N/A toggle. Every register section can legitimately be skipped for a season
 *  that did not happen - no livestock bought in, no herd on the books - and
 *  saying so is not the same as leaving it empty: an empty section blocks
 *  submission, a marked one does not. */
export function NotApplicableToggle({
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

/** Where the numbers in this submission came from, on every section.
 *
 *  A register submission works from manual entry rather than a live system, so
 *  a reader who assumes the mortality figure is live will draw different
 *  conclusions from one that is a season old. The source is stated rather than
 *  assumed. */
export function SourceTag({
  kind,
  period,
  detail,
  footnote,
}: {
  kind: string;
  period: string;
  /** Optional file/failure provenance, rendered when the source carries any. */
  detail?: string;
  footnote?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2 text-[11px] ${
        kind === "Import failed" ? "bg-rose-50 text-rose-700" : "bg-ink/[0.04] text-ink-soft/60"
      }`}
    >
      <span className="font-semibold uppercase tracking-wide">Data source</span>
      <span>{kind === "Import failed" ? detail : kind}</span>
      {kind !== "Import failed" && detail && <span>{detail}</span>}
      <span>Reporting period: {period}</span>
      {footnote && <span className="text-ink-soft/40">{footnote}</span>}
    </div>
  );
}

/** The data-quality states a register submission must be able to distinguish,
 *  rendered wherever a figure could be absent so "no data" is never shown as
 *  "fine". */
export function DataQualityNote({ state, detail }: { state: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-ink/20 bg-white/40 px-3 py-2">
      <span className="mt-0.5 text-xs text-ink-soft/30">◻</span>
      <div>
        <p className="text-xs font-semibold text-ink-soft/70">{state}</p>
        {detail && <p className="text-[11px] text-ink-soft/40">{detail}</p>}
      </div>
    </div>
  );
}

/** A count or rate that could not be derived, with the reason it is missing.
 *
 *  Used wherever a figure is absent, because "0" and "not known" are different
 *  claims and an empty register must never be read as a good result. */
export function NoDataNote({ what, reason }: { what: string; reason: string }) {
  return <DataQualityNote state={`${what}: no data`} detail={reason} />;
}