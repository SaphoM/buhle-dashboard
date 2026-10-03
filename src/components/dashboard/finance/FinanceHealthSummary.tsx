import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { FINANCE_KPI_IDS } from "../../../data/financeEngine";
import { getOpenFinanceCycle } from "../../../data/cycleEngine";
import { formatTarget, formatValue, getStatus, getVariancePct } from "../../../data/kpiEngine";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import type { FinanceReport, ImportRun } from "../../../types/finance";

/**
 * The Finance dashboard's own summary block (spec Sections 23, 33 and 38).
 *
 * Two things the generic KPI grid cannot give an executive looking at Finance:
 *
 * 1. A single place where the six headline numbers sit side by side with their
 *    targets, variances and statuses. The grid shows all sixteen Finance KPIs;
 *    this shows the six that decide whether the department is on track.
 * 2. A DATA QUALITY line, because a status badge alone cannot distinguish "Green
 *    because the number is good" from "Green because we have a number and no
 *    threshold yet". Section 33 requires import failure, validation failure and
 *    not-yet-submitted to be visibly different states, and none of them may
 *    present as a performance result.
 *
 * It reads the same KPIs the rest of the application reads. No figure is
 * recalculated here: Finance's engine is the only place a Finance number is
 * allowed to be produced.
 */

interface HealthRow {
  kpiId: string;
  label: string;
}

const HEADLINE_ROWS: HealthRow[] = [
  { kpiId: FINANCE_KPI_IDS.revenue, label: "Revenue" },
  { kpiId: FINANCE_KPI_IDS.cashBalance, label: "Cash balance" },
  { kpiId: FINANCE_KPI_IDS.budgetUtilisation, label: "Budget utilisation" },
  { kpiId: FINANCE_KPI_IDS.debtors90Plus, label: "Debtors 90+ days" },
  { kpiId: FINANCE_KPI_IDS.creditors90Plus, label: "Creditors 90+ days" },
  { kpiId: FINANCE_KPI_IDS.operatingSurplus, label: "Operating surplus / (deficit)" },
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

export function FinanceHealthSummary() {
  const { kpis, cycles, financeReports } = useDataStore();

  const cycle = useMemo(() => getOpenFinanceCycle(cycles), [cycles]);

  const report = useMemo(() => {
    if (cycle) {
      const forCycle = financeReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    // No open cycle: fall back to the most recent submitted report so the
    // dashboard still shows the last real position rather than an empty block.
    return [...financeReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => (a.cycleId < b.cycleId ? 1 : -1))[0];
  }, [cycle, financeReports]);

  const byId = useMemo(() => {
    const map = new Map<string, Kpi>();
    for (const kpi of kpis) map.set(kpi.id, kpi);
    return map;
  }, [kpis]);

  const quality = useMemo<DataQuality>(
    () => describeDataQuality({ report, runs: report?.importRuns ?? [], hasCycle: Boolean(cycle) }),
    [report, cycle]
  );

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Finance health</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Finance report submitted yet"}
        </p>
      </div>

      <div
        className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${QUALITY_STYLES[quality.state]}`}
        data-testid="finance-data-quality"
      >
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-wide text-ink-soft/50">
              <th scope="col" className="py-2 pr-3 font-medium">Metric</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Current</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Target</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Variance</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Last updated</th>
              <th scope="col" className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {HEADLINE_ROWS.map((row) => {
              const kpi = byId.get(row.kpiId);
              if (!kpi) return null;
              const status = getStatus(kpi);
              const variance = getVariancePct(kpi);
              return (
                <tr key={row.kpiId} className="border-b border-ink/5 last:border-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                    {row.label}
                  </th>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{formatValue(kpi)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft/70">
                    {formatTarget(kpi)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink-soft/70">
                    {variance > 0 ? "+" : ""}
                    {variance.toFixed(1)}%
                  </td>
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
        Figures come from the Finance submission and are recalculated only by the Finance engine. Rows marked
        No data are waiting on a submission, not reporting a result of zero.
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
 * Resolves the one data-quality state the Finance figures represent.
 *
 * A failed import outranks a draft, and a draft outranks nothing submitted: if
 * the workbook did not load, the figures on the dashboard are not provisional
 * versions of the truth, they are the previous period's figures still being
 * displayed, and that has to be said plainly.
 */
function describeDataQuality({
  report,
  runs,
  hasCycle,
}: {
  report: FinanceReport | undefined;
  runs: ImportRun[];
  hasCycle: boolean;
}): DataQuality {
  // A recorded failure outranks everything else: if the workbook did not load,
  // the numbers below are last period's numbers still on screen, not a
  // provisional version of the truth.
  if (report?.dataSource.failureReason) {
    return {
      state: "import_failed",
      label: "Data import failed",
      detail: `${report.dataSource.failureReason} The figures below are not a refreshed position.`,
    };
  }

  const latestRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
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
        ? "The current Finance cycle has no submission yet. No KPI below reports a performance result."
        : "No open Finance cycle. The latest submitted position is shown.",
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
      ? `Imported from ${report.dataSource.fileName ?? "the Budget Monitor workbook"}${
          report.dataSource.sheetName ? ` (sheet: ${report.dataSource.sheetName})` : ""
        }`
      : "Submitted manually";

  return {
    state: "complete",
    label: "Submitted",
    detail: `${report.reportingPeriod}, ${provenance}. Submitted by ${report.submittedBy ?? "Finance"} on ${formatDay(report.submittedAt)}.`,
  };
}

function formatDay(iso: string | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}