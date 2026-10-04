import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { getOpenMarketingCycle } from "../../../data/cycleEngine";
import { previewMarketingStatus } from "../../../data/marketingEngine";
import { formatValue as formatKpiValue } from "../../../data/kpiEngine";
import { KpiFigure } from "../KpiFigure";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import {
  MARKETING_SECTION_KEYS,
  MARKETING_SECTION_LABELS,
  type MarketingReport,
  type MarketingSectionKey,
} from "../../../types/marketing";

/**
 * The Marketing dashboard's own summary block.
 *
 * Two things the generic KPI grid cannot give somebody looking at Marketing:
 *
 * 1. THE HEADLINE FIGURES AND WHICH REGISTER EACH CAME FROM. Marketing's most
 *    quoted number is the conversion rate, and a conversion rate with no visible
 *    basis is the figure most easily argued with in a board meeting. So the
 *    basis is a column here rather than a tooltip.
 *
 * 2. SECTION COVERAGE, AND WHETHER THE RATE IS ACTUALLY EVIDENCED. All eight
 *    Marketing KPIs are derived, so "the conversion rate is 0%" and "no outcomes
 *    were recorded" are entirely different states that a plain number cannot
 *    distinguish. The coverage block says how many of the five registers hold
 *    rows, and a gap is shown as a gap rather than as a good result.
 *
 * There are deliberately NO target or variance columns. Six of the eight
 * Marketing KPIs ship with unset thresholds because no limit has been approved
 * for them yet, and inventing targets to fill the same table shape as Finance
 * would manufacture verdicts out of nothing. The two pre-existing KPIs
 * (enquiries and conversion) do carry approved thresholds and are judged on them.
 */
interface HeadlineRow {
  kpiId: string;
  label: string;
  basis: string;
}

const HEADLINE_ROWS: HeadlineRow[] = [
  { kpiId: "kpi-enquiries", label: "Student enquiries", basis: "Enquiry register" },
  { kpiId: "kpi-conversion", label: "Enquiry to enrolment conversion", basis: "Enquiry register outcomes" },
  { kpiId: "kpi-campaigns-delivered", label: "Campaigns delivered", basis: "Campaign register" },
  { kpiId: "kpi-leads-generated", label: "Leads generated", basis: "Lead register" },
  { kpiId: "kpi-lead-conversion-rate", label: "Lead conversion rate", basis: "Lead register funnel" },
  { kpiId: "kpi-active-partnerships", label: "Active partnerships", basis: "Partnership register" },
  { kpiId: "kpi-website-sessions", label: "Website sessions", basis: "Website analytics register" },
  { kpiId: "kpi-website-enquiry-rate", label: "Website enquiry rate", basis: "Website analytics register" },
];

type QualityState = "complete" | "draft" | "not_submitted" | "rate_unevidenced";

interface DataQuality {
  state: QualityState;
  label: string;
  detail: string;
}

export function MarketingHealthSummary() {
  const { kpis, cycles, marketingConfig, marketingReports } = useDataStore();

  const cycle = useMemo(() => getOpenMarketingCycle(cycles), [cycles]);

  const report = useMemo(() => {
    if (cycle) {
      const forCycle = marketingReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    // No open cycle: fall back to the most recent submitted report so the
    // dashboard still shows the last real position rather than an empty block.
    return [...marketingReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => (a.cycleId < b.cycleId ? 1 : -1))[0];
  }, [cycle, marketingReports]);

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
  const currencySymbol = marketingConfig.currencySymbol;

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Marketing health</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Marketing report submitted yet"}
        </p>
      </div>

      <div
        className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${QUALITY_STYLES[quality.state]}`}
        data-testid="marketing-data-quality"
      >
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      <div
        className="mt-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-xs"
        data-testid="marketing-section-coverage"
      >
        <p className="font-semibold text-ink">
          Section coverage: {coverage.reported} of {MARKETING_SECTION_KEYS.length} sections reported
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
              // previewMarketingStatus, not getStatus: a Marketing KPI with no
              // approved threshold must say so rather than fall back to a colour.
              const { status, thresholdNote } = previewMarketingStatus(kpi, kpi.currentValue);
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
                      <KpiFigure kpi={kpi} format={(k) => formatMarketingValue(k, currencySymbol)}>
                        {formatMarketingValue(kpi, currencySymbol)}
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
        Every figure above is calculated from a Marketing register by the Marketing engine. Rows marked No data are
        waiting on a submission, not reporting a result of zero. Six of the eight carry no approved threshold yet and
        are monitored without a Green/Amber/Red verdict; only Student Enquiries and Enquiry to Enrolment Conversion
        have approved limits.
      </p>
    </section>
  );
}

const QUALITY_STYLES: Record<QualityState, string> = {
  complete: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
  draft: "border-amber-200 bg-amber-50/60 text-amber-900",
  rate_unevidenced: "border-amber-200 bg-amber-50/60 text-amber-900",
  not_submitted: "border-ink/15 bg-ink/[0.03] text-ink-soft/70",
};

/**
 * Which of the five registers actually hold rows for this submission.
 *
 * A section explicitly marked not applicable counts as deliberately excluded
 * rather than missing, but it is still reported separately so nobody mistakes an
 * intentional exclusion for data that was simply never entered.
 */
function sectionCoverage(report: MarketingReport | undefined) {
  const missing: string[] = [];
  const notApplicable: string[] = [];
  let reported = 0;

  for (const key of MARKETING_SECTION_KEYS) {
    const data = sectionData(report, key);
    // With no report at all, every register is missing. Skipping them instead
    // would let the block claim "every register holds rows" on a dashboard where
    // nothing has ever been submitted.
    if (!data) {
      missing.push(MARKETING_SECTION_LABELS[key]);
      continue;
    }
    if (data.notApplicable) {
      notApplicable.push(MARKETING_SECTION_LABELS[key]);
      continue;
    }
    if (data.records.length > 0) reported += 1;
    else missing.push(MARKETING_SECTION_LABELS[key]);
  }

  return { reported, missing, notApplicable };
}

function sectionData(report: MarketingReport | undefined, key: MarketingSectionKey) {
  if (!report) return undefined;
  switch (key) {
    case "enquiries":
      return report.enquiries;
    case "campaigns":
      return report.campaigns;
    case "leads":
      return report.leads;
    case "partnerships":
      return report.partnerships;
    case "website":
      return report.website;
  }
}

/**
 * Resolves the one data-quality state these figures represent.
 *
 * Marketing has a state the other register departments do not: a submitted
 * report where the enquiry outcomes were never recorded. The enquiry count is
 * then perfectly real, but the conversion rate has no evidence behind it, and
 * the two must not be presented with the same confidence. That case is called
 * out here rather than left for a reader to infer from a 0% on the dashboard.
 */
function describeDataQuality({
  report,
  hasCycle,
}: {
  report: MarketingReport | undefined;
  hasCycle: boolean;
}): DataQuality {
  if (!report) {
    return {
      state: "not_submitted",
      label: "Not submitted",
      detail: hasCycle
        ? "The current Marketing cycle has no submission yet. No KPI below reports a performance result."
        : "No open Marketing cycle. The latest submitted position is shown.",
    };
  }

  if (report.status === "Draft") {
    return {
      state: "draft",
      label: "Draft in progress",
      detail: `A draft for ${report.reportingPeriod} exists but has not been submitted. Only submitted figures count towards the KPIs below.`,
    };
  }

  const enquiries = report.enquiries.records.filter((r) => r.outcome !== "Duplicate");
  const outcomesRecorded = enquiries.filter((r) => r.outcome !== "" && r.outcome !== undefined).length;

  if (enquiries.length > 0 && outcomesRecorded === 0) {
    return {
      state: "rate_unevidenced",
      label: "Conversion rate has no recorded outcomes",
      detail: `${enquiries.length} enquiries were recorded for ${report.reportingPeriod}, but no outcome was recorded for any of them. The enquiry volume above is real; the conversion rate is not derivable and has been left uncalculated rather than reported as 0%.`,
    };
  }

  return {
    state: "complete",
    label: "Submitted",
    detail: `${report.reportingPeriod}, submitted manually. Submitted by ${
      report.submittedBy ?? "Marketing"
    } on ${formatDay(report.submittedAt)}.`,
  };
}

function formatMarketingValue(kpi: Kpi, currencySymbol: string): string {
  if (kpi.unit === "currency") return `${currencySymbol}${Math.round(kpi.currentValue).toLocaleString("en-ZA")}`;
  return formatKpiValue(kpi);
}

function formatDay(iso: string | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}