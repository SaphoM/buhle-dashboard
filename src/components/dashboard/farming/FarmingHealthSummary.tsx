import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { getOpenFarmingCycle } from "../../../data/cycleEngine";
import { previewFarmingStatus } from "../../../data/farmingEngine";
import { formatValue as formatKpiValue } from "../../../data/kpiEngine";
import { KpiFigure } from "../KpiFigure";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import {
  FARMING_SECTION_KEYS,
  FARMING_SECTION_LABELS,
  type FarmingReport,
  type FarmingSectionKey,
} from "../../../types/farming";

/**
 * The Commercial Farming dashboard's own summary block.
 *
 * Three things the generic KPI grid cannot give somebody looking at Farming:
 *
 * 1. THE HEADLINE FIGURES AND WHICH REGISTER EACH CAME FROM. Every Farming
 *    number is a ratio of two physical quantities, so "mortality rate 4%" is
 *    meaningless without knowing it was deaths over stock on hand. The basis is
 *    a column here rather than a tooltip, because it is the thing a figure gets
 *    argued over on.
 *
 * 2. SECTION COVERAGE ACROSS SEVEN REGISTERS. Farming has more registers than
 *    any other department, and they are not independent: mortality and disease
 *    are read against the livestock count. So a dashboard where five registers
 *    hold rows and two do not is a materially different position from one where
 *    all seven do, and the block says which.
 *
 * 3. WHICH FIGURES ACTUALLY CARRY A VERDICT. This is the part that is easy to
 *    get wrong. Only two of the nine Farming figures carry limits today: farm
 *    revenue, whose target is still marked proposed rather than confirmed, and
 *    the mortality rate, whose limits survive a rebuild because a live Board
 *    escalation rests on them. The other seven have no approved limit at all, so
 *    this table says "no approved threshold" on those rows instead of showing a
 *    colour. Inventing targets to fill the Finance table shape would manufacture
 *    verdicts out of nothing, and a uniform badge column would imply that limits
 *    exist where none do.
 *
 * That is also why there are no target or variance columns: with seven of nine
 * unset, the column would be empty more often than not, and the number that
 * would fill it is exactly the number nobody has agreed.
 *
 * It also separates "the rate is 0%" from "no rows were recorded". An empty
 * mortality register and a mortality register showing no deaths are entirely
 * different claims, and a plain number cannot tell them apart.
 */
interface HeadlineRow {
  kpiId: string;
  label: string;
  basis: string;
}

const HEADLINE_ROWS: HeadlineRow[] = [
  { kpiId: "kpi-farmrevenue", label: "Farm revenue", basis: "Sales register" },
  { kpiId: "kpi-farm-sales-volume", label: "Sales volume", basis: "Sales register" },
  { kpiId: "kpi-farm-production", label: "Production", basis: "Production register" },
  { kpiId: "kpi-farm-livestock", label: "Livestock on hand", basis: "Livestock register" },
  { kpiId: "kpi-mortality", label: "Mortality rate", basis: "Mortality register over livestock register" },
  { kpiId: "kpi-farm-disease", label: "Disease incidence", basis: "Disease register over livestock register" },
  { kpiId: "kpi-farm-water", label: "Water use", basis: "Water register" },
  { kpiId: "kpi-farm-costs", label: "Total costs", basis: "Cost register" },
  { kpiId: "kpi-farm-feed-cost-ratio", label: "Feed cost ratio", basis: "Cost register against sales register" },
];

type QualityState = "complete" | "draft" | "not_submitted" | "rate_unevidenced";

interface DataQuality {
  state: QualityState;
  label: string;
  detail: string;
}

const QUALITY_STYLES: Record<QualityState, string> = {
  complete: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
  draft: "border-amber-200 bg-amber-50/60 text-amber-900",
  rate_unevidenced: "border-amber-200 bg-amber-50/60 text-amber-900",
  not_submitted: "border-ink/15 bg-ink/[0.03] text-ink-soft/70",
};

function formatDay(iso: string | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

export function FarmingHealthSummary() {
  const { kpis, cycles, farmingConfig, farmingReports } = useDataStore();

  const cycle = useMemo(() => getOpenFarmingCycle(cycles), [cycles]);

  const report = useMemo(() => {
    if (cycle) {
      const forCycle = farmingReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    // No open cycle: fall back to the most recent submitted report so the
    // dashboard still shows the last real position rather than an empty block.
    return [...farmingReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => (a.cycleId < b.cycleId ? 1 : -1))[0];
  }, [cycle, farmingReports]);

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
  const currencySymbol = farmingConfig.currencySymbol;
  const withThreshold = HEADLINE_ROWS.filter((row) => {
    const kpi = byId.get(row.kpiId);
    return kpi ? previewFarmingStatus(kpi, 0).status !== "threshold_unset" : false;
  }).length;

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Commercial Farming health</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Commercial Farming report submitted yet"}
        </p>
      </div>

      <div
        className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${QUALITY_STYLES[quality.state]}`}
        data-testid="farming-data-quality"
      >
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      <div
        className="mt-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-xs"
        data-testid="farming-section-coverage"
      >
        <p className="font-semibold text-ink">
          Section coverage: {coverage.reported} of {FARMING_SECTION_KEYS.length} sections reported
        </p>
        <p className="mt-0.5 text-ink-soft/60">
          {coverage.missing.length === 0
            ? "Every register holds rows for this submission."
            : `No data for ${coverage.missing.join(", ")}. Those figures are not derivable from this submission and are not counted as zero.`}
          {coverage.notApplicable.length > 0 &&
            ` ${coverage.notApplicable.join(", ")} marked not applicable, so deliberately excluded rather than missing.`}
        </p>
        <p className="mt-1 text-ink-soft/60">
          {withThreshold} of {HEADLINE_ROWS.length} figures carry a threshold and can be given a verdict. The rest are
          recorded and monitored without one, because no limit has been agreed for them.
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
              // previewFarmingStatus, not getStatus: a Farming KPI with no
              // approved threshold must say so rather than fall back to a colour.
              const { status, thresholdNote } = previewFarmingStatus(kpi, kpi.currentValue);
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
                    {kpi.dataAvailable === false ? (
                      "No data"
                    ) : (
                      <KpiFigure kpi={kpi} format={(k) => formatFarmingValue(k, currencySymbol)}>
                        {formatFarmingValue(kpi, currencySymbol)}
                      </KpiFigure>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-ink-soft/60">{row.basis}</td>
                  <td className="py-2.5 pr-3 text-right text-xs text-ink-soft/50">{formatDay(kpi.lastUpdated)}</td>
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
        Every figure above is calculated from a Commercial Farming register by the Farming engine. Rows marked No data
        are waiting on a submission, not reporting a result of zero. The mortality rate keeps its limits because a
        live Board escalation rests on it; farm revenue still carries a proposed target, so it is reported as a
        variance rather than a confirmed one.
      </p>
    </section>
  );
}

function formatFarmingValue(kpi: Kpi, currencySymbol: string): string {
  if (kpi.unit === "currency") return `${currencySymbol}${Math.round(kpi.currentValue).toLocaleString("en-ZA")}`;
  return formatKpiValue(kpi);
}

/**
 * Resolves the one data-quality state these figures represent.
 *
 * Farming's distinguishing gap is that its rates are all cross-register, so the
 * state worth calling out is when the rate's own register holds rows but the
 * register it is measured against does not. A mortality rate computed over an
 * empty livestock register is arithmetically real and evidentially worthless,
 * and it is the single most misleading thing this dashboard could show.
 */
function describeDataQuality({
  report,
  hasCycle,
}: {
  report: FarmingReport | undefined;
  hasCycle: boolean;
}): DataQuality {
  if (!report) {
    return {
      state: "not_submitted",
      label: "Not submitted",
      detail: hasCycle
        ? "The current Commercial Farming cycle has no submission yet. No KPI below reports a performance result."
        : "No open Commercial Farming cycle. The latest submitted position is shown.",
    };
  }

  if (report.status === "Draft") {
    return {
      state: "draft",
      label: "Draft in progress",
      detail: `A draft for ${report.reportingPeriod} exists but has not been submitted. Only submitted figures count towards the KPIs below.`,
    };
  }

  const mortality = report.mortality.records;
  const hasMortalityRows = mortality.length > 0;
  const hasStockRows = report.livestock.records.some((r) => r.headCount !== null);

  if (hasMortalityRows && !hasStockRows) {
    return {
      state: "rate_unevidenced",
      label: "Mortality rate has no stock to measure against",
      detail: `${mortality.length} mortality record(s) were entered for ${report.reportingPeriod}, but the livestock register holds no stock on hand. The mortality rate is a ratio of deaths to stock, so it is left uncalculated rather than reported against a denominator of zero.`,
    };
  }

  return {
    state: "complete",
    label: "Submitted",
    detail: `${report.reportingPeriod}, submitted manually. Submitted by ${
      report.submittedBy ?? "Commercial Farming"
    } on ${formatDay(report.submittedAt)}.`,
  };
}

/**
 * Which of the seven registers actually hold rows for this submission.
 *
 * A section explicitly marked not applicable counts as deliberately excluded
 * rather than missing, so a month where the farm genuinely had no disease is not
 * reported as a gap in the evidence.
 */
function sectionCoverage(report: FarmingReport | undefined) {
  const missing: string[] = [];
  const notApplicable: string[] = [];
  let reported = 0;

  for (const key of FARMING_SECTION_KEYS) {
    const data = sectionData(report, key);
    // With no report at all, every register is missing. Skipping them instead
    // would let the block claim "every register holds rows" on a dashboard where
    // nothing has ever been submitted.
    if (!data) {
      missing.push(FARMING_SECTION_LABELS[key]);
      continue;
    }
    if (data.notApplicable) {
      notApplicable.push(FARMING_SECTION_LABELS[key]);
      continue;
    }
    if (data.records.length > 0) reported += 1;
    else missing.push(FARMING_SECTION_LABELS[key]);
  }

  return { reported, missing, notApplicable };
}

function sectionData(report: FarmingReport | undefined, key: FarmingSectionKey) {
  if (!report) return undefined;
  switch (key) {
    case "production":
      return report.production;
    case "livestock":
      return report.livestock;
    case "mortality":
      return report.mortality;
    case "disease":
      return report.disease;
    case "water":
      return report.water;
    case "sales":
      return report.sales;
    case "costs":
      return report.costs;
  }
}