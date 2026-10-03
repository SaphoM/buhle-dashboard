import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import type { FinanceDataSource, WorkbookDependency } from "../../../types/finance";
import { formatTarget } from "../../../data/kpiEngine";
import { previewFinanceStatus } from "../../../data/financeEngine";

/**
 * The live Early Warning strip shown at the foot of each Finance section.
 *
 * Identical in purpose to the HR one and driven by the same shared engine, so a
 * Finance manager sees the same language on every section and the preview can
 * never disagree with what submission actually does.
 *
 * Sections 8, 11, 14, 17, 20 and 22 all make the same demand: a figure with no
 * approved threshold must NOT read as Green. `previewFinanceStatus` returns
 * `threshold_unset` in that case and this component says "Threshold not
 * configured" rather than inventing a verdict.
 */
export function FinanceWarningPreview({
  items,
  currencySymbol = "R",
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string; label?: string }[];
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
          const { status, thresholdNote } = previewFinanceStatus(kpi, value);
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

/** N/A toggle shared by the sections Finance can legitimately skip. */
export function FinanceNotApplicableToggle({
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

/** A calculated figure. Finance never types these, so they are rendered
 *  read-only and labelled as derived. */
export function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-[11px] text-ink-soft/45">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

/** A per-line derived note, or the reason a figure cannot be derived yet. */
export function LineReadout({ label, text }: { label: string; text: string }) {
  return (
    <p className="rounded-xl bg-ink/[0.04] px-3 py-2 text-[11px] text-ink-soft/60">
      <span className="font-semibold">{label}: </span>
      {text}
    </p>
  );
}

/**
 * Section 27 - where the figures in this submission came from.
 *
 * Section 38 is explicit that because Finance works from manual entry and
 * workbook import rather than a live accounting integration, the dashboard must
 * say so. A reader who assumes the cash figure is live will draw different
 * conclusions from one that is a month old, so this is shown on every section
 * rather than only in a settings screen.
 */
export function FinanceSourceTag({
  source,
  reportingPeriod,
}: {
  source: FinanceDataSource;
  reportingPeriod: string;
}) {
  const failed = Boolean(source.failureReason);
  const imported = source.kind === "Workbook Import";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2 text-[11px] ${
        failed ? "bg-rose-50 text-rose-700" : "bg-ink/[0.04] text-ink-soft/60"
      }`}
    >
      <span className="font-semibold uppercase tracking-wide">Data source</span>
      <span>
        {failed
          ? `Import failed: ${source.failureReason}`
          : imported
            ? `Workbook import - ${source.fileName ?? "file unknown"}${source.sheetName ? ` / ${source.sheetName}` : ""}`
            : source.kind === "Manual Entry"
              ? "Manual entry"
              : "Not submitted yet"}
      </span>
      <span>Reporting period: {reportingPeriod}</span>
      {imported && source.importedAt && (
        <span>
          Imported {new Date(source.importedAt).toLocaleDateString("en-ZA")}
          {source.importedBy ? ` by ${source.importedBy}` : ""}
        </span>
      )}
      <span className="text-ink-soft/40">Not a live accounting feed</span>
    </div>
  );
}

/**
 * Section 33 - the data-quality states Finance must be able to distinguish.
 *
 * Rendered wherever a figure could be absent, so "no data" is never silently
 * presented as "fine". Kept as a small vocabulary rather than free text so the
 * same six meanings appear identically on every section.
 */
export function FinanceDataQualityNote({ state, detail }: { state: string; detail?: string }) {
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

/**
 * Section 2 - the workbook dependency, stated plainly.
 *
 * The Finance Budget Monitor workbook is not in the repository, and Section 2
 * forbids recreating its formulas from assumptions. This panel makes that an
 * explicit, visible state for Finance and for an administrator, instead of
 * leaving a codebase that looks finished while quietly omitting the source of
 * truth it was meant to reproduce.
 */
export function FinanceWorkbookDependencyNotice({ dependency }: { dependency: WorkbookDependency }) {
  if (dependency.status === "Supplied") return null;
  return (
    <div className="rounded-2xl border border-dashed border-butter-dark/50 bg-butter/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/60">
        Workbook dependency outstanding
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft/70">
        The <strong>{dependency.name}</strong> has not been supplied to the application yet. Nothing in this
        submission has been derived from it, and its formulas have deliberately <strong>not</strong> been
        recreated from assumptions - doing so would silently diverge from Buhle&apos;s approved figures.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          What is needed before mapping can be finalised
        </summary>
        <ul className="mt-1.5 flex flex-col gap-1">
          {dependency.requiredContent.map((c) => (
            <li key={c} className="text-[11px] text-ink-soft/60">
              • {c}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-soft/50">{dependency.impact}</p>
    </div>
  );
}
