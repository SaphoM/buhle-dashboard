import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { getOpenOperationsCycle } from "../../../data/cycleEngine";
import { previewOperationsStatus } from "../../../data/operationsEngine";
import { formatValue as formatKpiValue } from "../../../data/kpiEngine";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import {
  OPERATIONS_SECTION_KEYS,
  OPERATIONS_SECTION_LABELS,
  type OperationsReport,
  type OperationsSectionKey,
} from "../../../types/operations";

/**
 * The Operations dashboard's own summary block.
 *
 * Two things the generic KPI grid cannot give somebody looking at Operations:
 *
 * 1. THE HEADLINE FIGURES AND WHERE THEY CAME FROM. The grid lists every
 *    Operations KPI; this lists the ones that describe the cohort's health, each
 *    next to the register it was derived from. A figure without its basis is not
 *    defensible in front of a board, so the basis is part of the row rather than
 *    a tooltip.
 *
 * 2. A DATA QUALITY line, plus SECTION COVERAGE. Operations is register-based
 *    and manual: seven sections, each of which can be empty. "Attendance is
 *    0%" and "attendance was never submitted" are different claims, so the
 *    coverage line says how many of the seven registers actually hold rows for
 *    this submission, and a gap is shown as a gap rather than as a good result.
 *
 * There are deliberately NO target and variance columns here. No Operations
 * threshold has been approved, so there is nothing to compare a figure against.
 * The Finance summary shows targets and variances because Finance has approved
 * ones; inventing an Operations target to fill the same table shape would
 * manufacture a verdict out of nothing.
 */
interface HeadlineRow {
  kpiId: string;
  label: string;
  basis: string;
}

const HEADLINE_ROWS: HeadlineRow[] = [
  { kpiId: "kpi-enrolment", label: "Learners enrolled", basis: "Enrolment register" },
  { kpiId: "kpi-new-enrolments", label: "New enrolments this cohort", basis: "Enrolment register" },
  { kpiId: "kpi-attendance-rate", label: "Average attendance rate", basis: "Session attendance register" },
  { kpiId: "kpi-completion", label: "Completion rate", basis: "Completion register" },
  { kpiId: "kpi-dropout-rate", label: "Learner dropout rate", basis: "Dropout register" },
  { kpiId: "kpi-projects-on-schedule", label: "Projects on schedule", basis: "Project register" },
  { kpiId: "kpi-assets-in-service", label: "Assets in service", basis: "Asset register" },
];

type QualityState =
  | "complete"
  | "draft"
  | "import_failed"
  | "validation_required"
  | "not_submitted";

interface DataQuality {
  state: QualityState;
  label: string;
  detail: string;
}

export function OperationsHealthSummary() {
  const { kpis, cycles, operationsConfig, operationsReports } = useDataStore();

  const cycle = useMemo(() => getOpenOperationsCycle(cycles), [cycles]);

  const report = useMemo(() => {
    if (cycle) {
      const forCycle = operationsReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    // No open cycle: fall back to the most recent submitted report so the
    // dashboard still shows the last real position rather than an empty block.
    return [...operationsReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => (a.cycleId < b.cycleId ? 1 : -1))[0];
  }, [cycle, operationsReports]);

  const byId = useMemo(() => {
    const map = new Map<string, Kpi>();
    for (const kpi of kpis) map.set(kpi.id, kpi);
    return map;
  }, [kpis]);

  const quality = useMemo<DataQuality>(
    () => describeDataQuality({ report, hasCycle: Boolean(cycle) }),
    [report, cycle]
  );

  const coverage = useMemo(() => sectionCoverage(report), [report]);
  const currencySymbol = operationsConfig.currencySymbol;

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Operations health</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Operations report submitted yet"}
        </p>
      </div>

      <div
        className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${QUALITY_STYLES[quality.state]}`}
        data-testid="operations-data-quality"
      >
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      <div
        className="mt-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-xs"
        data-testid="operations-section-coverage"
      >
        <p className="font-semibold text-ink">
          Section coverage: {coverage.reported} of {OPERATIONS_SECTION_KEYS.length} sections reported
        </p>
        <p className="mt-0.5 text-ink-soft/60">
          {coverage.missing.length === 0
            ? "Every register holds rows for this submission."
            : `No data for ${coverage.missing.join(", ")}. Those figures are not derivable from this submission and are not counted as zero.`}
          {coverage.notApplicable.length > 0 &&
            ` ${coverage.notApplicable.join(", ")} marked not applicable, so it is deliberately excluded rather than missing.`}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-wide text-ink-soft/50">
              <th scope="col" className="py-2 pr-3 font-medium">Metric</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Current</th>
              <th scope="col" className="py-2 pr-3 font-medium">Derived from</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Last updated</th>
              <th scope="col" className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {HEADLINE_ROWS.map((row) => {
              const kpi = byId.get(row.kpiId);
              if (!kpi) return null;
              // previewOperationsStatus, not getStatus: an Operations KPI with no
              // approved threshold must say so rather than fall back to a colour.
              const { status, thresholdNote } = previewOperationsStatus(kpi, kpi.currentValue);
              return (
                <tr key={row.kpiId} className="border-b border-ink/5 last:border-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                    {row.label}
                    {thresholdNote && (
                      <span className="mt-0.5 block text-[10px] font-normal text-ink-soft/45">
                        No approved threshold
                      </span>
                    )}
                  </th>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink">
                    {kpi.dataAvailable === false
                      ? "No data"
                      : formatOperationsValue(kpi, currencySymbol)}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-ink-soft/60">{row.basis}</td>
                  <td className="py-2.5 pr-3 text-right text-xs text-ink-soft/50">
                    {formatDay(kpi.lastUpdated)}
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-ink-soft/40">
        Figures come from the Operations submission and are calculated only by the Operations engine, from the
        registers listed above. Rows marked No data are waiting on a submission, not reporting a result of zero, and
        no figure here carries a Green/Amber/Red verdict until an administrator approves a threshold.
      </p>
    </section>
  );
}

const QUALITY_STYLES: Record<QualityState, string> = {
  complete: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
  draft: "border-amber-200 bg-amber-50/60 text-amber-900",
  import_failed: "border-rose-200 bg-rose-50/70 text-rose-900",
  validation_required: "border-rose-200 bg-rose-50/70 text-rose-900",
  not_submitted: "border-ink/15 bg-ink/[0.03] text-ink-soft/70",
};

/**
 * Which of the seven registers actually hold rows for this submission.
 *
 * A section explicitly marked not applicable counts as deliberately excluded
 * rather than missing, but it is still reported separately so nobody mistakes an
 * intentional exclusion for data that was simply never entered.
 */
function sectionCoverage(report: OperationsReport | undefined) {
  const missing: string[] = [];
  const notApplicable: string[] = [];
  let reported = 0;

  for (const key of OPERATIONS_SECTION_KEYS) {
    if (isSectionNotApplicable(report, key)) {
      notApplicable.push(OPERATIONS_SECTION_LABELS[key]);
      continue;
    }
    if (sectionRowCount(report, key) > 0) reported += 1;
    else missing.push(OPERATIONS_SECTION_LABELS[key]);
  }

  return { reported, missing, notApplicable };
}

function isSectionNotApplicable(report: OperationsReport | undefined, key: OperationsSectionKey): boolean {
  if (!report) return false;
  switch (key) {
    case "enrolment":
      return report.enrolment.notApplicable;
    case "attendance":
      return report.attendance.notApplicable;
    case "training":
      return report.training.notApplicable;
    case "completion":
      return report.completion.notApplicable;
    case "dropouts":
      return report.dropouts.notApplicable;
    case "projects":
      return report.projects.notApplicable;
    case "assets":
      return report.assets.notApplicable;
  }
}

function sectionRowCount(report: OperationsReport | undefined, key: OperationsSectionKey): number {
  if (!report) return 0;
  switch (key) {
    case "enrolment":
      return report.enrolment.records.length;
    case "attendance":
      return report.attendance.records.length;
    case "training":
      return report.training.records.length;
    case "completion":
      return report.completion.records.length;
    case "dropouts":
      return report.dropouts.records.length;
    case "projects":
      return report.projects.records.length;
    case "assets":
      return report.assets.records.length;
  }
}

/**
 * Resolves the one data-quality state the Operations figures represent.
 *
 * A failed import outranks a draft, and a draft outranks nothing submitted: if
 * the workbook did not load, the figures on the dashboard are not provisional
 * versions of the truth, they are the previous cohort's figures still being
 * displayed, and that has to be said plainly.
 */
function describeDataQuality({
  report,
  hasCycle,
}: {
  report: OperationsReport | undefined;
  hasCycle: boolean;
}): DataQuality {
  // A recorded failure outranks everything else: if the workbook did not load,
  // the numbers below are last cohort's numbers still on screen, not a
  // provisional version of the truth.
  if (report?.dataSource.failureReason) {
    return {
      state: "import_failed",
      label: "Data import failed",
      detail: `${report.dataSource.failureReason} The figures below are not a refreshed position.`,
    };
  }

  const latestRun = report && report.importRuns.length > 0 ? report.importRuns[report.importRuns.length - 1] : undefined;
  if (latestRun && latestRun.status === "Failed") {
    return {
      state: "import_failed",
      label: "Data import failed",
      detail: `The last ${latestRun.target} import from ${latestRun.fileName} did not complete${
        latestRun.notes ? `: ${latestRun.notes}` : ""
      }. The figures below are not a refreshed position.`,
    };
  }

  if (!report) {
    return {
      state: "not_submitted",
      label: "Not submitted",
      detail: hasCycle
        ? "The current Operations cycle has no submission yet. No KPI below reports a performance result."
        : "No open Operations cycle. The latest submitted position is shown.",
    };
  }

  if (report.status === "Draft") {
    return {
      state: "draft",
      label: "Draft in progress",
      detail: `A draft for ${report.reportingPeriod} exists but has not been submitted. Only submitted figures count towards the KPIs below.`,
    };
  }

  const provenance =
    report.dataSource.kind === "Workbook Import"
      ? `imported from ${report.dataSource.fileName ?? "the Operations workbook"}${
          report.dataSource.sheetName ? ` (sheet: ${report.dataSource.sheetName})` : ""
        }`
      : "submitted manually";

  return {
    state: "complete",
    label: "Submitted",
    detail: `${report.reportingPeriod}, ${provenance}. Submitted by ${
      report.submittedBy ?? "Operations"
    } on ${formatDay(report.submittedAt)}.`,
  };
}

function formatOperationsValue(kpi: Kpi, currencySymbol: string): string {
  if (kpi.unit === "currency") return `${currencySymbol}${Math.round(kpi.currentValue).toLocaleString("en-ZA")}`;
  return formatKpiValue(kpi);
}

function formatDay(iso: string | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}