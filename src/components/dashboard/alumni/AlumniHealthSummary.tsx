import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { getOpenAlumniCycle } from "../../../data/cycleEngine";
import { previewAlumniStatus, summariseCohort } from "../../../data/alumniEngine";
import { formatValue as formatKpiValue } from "../../../data/kpiEngine";
import { KpiFigure } from "../KpiFigure";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import {
  ALUMNI_SECTION_KEYS,
  ALUMNI_SECTION_LABELS,
  type AlumniReport,
  type AlumniSectionKey,
} from "../../../types/alumni";

/**
 * The Alumni dashboard's own summary block.
 *
 * Three things the generic KPI grid cannot give somebody reading a tracer study:
 *
 * 1. HOW MANY PEOPLE THE RATES DESCRIBE, BEFORE THE RATES. Every Alumni figure is
 *    a rate over the graduates who answered, and the sample is chosen by who was
 *    reached rather than by who is in the cohort. So the cohort block leads this
 *    block rather than sitting at the bottom: a rate from twelve people out of two
 *    hundred is a different claim from a rate from a hundred and twenty, and a
 *    reader who only looks at the percentages cannot tell the difference.
 *
 * 2. THE HEADLINE FIGURES AND WHICH REGISTER EACH CAME FROM. A yield per hectare
 *    with no visible crop or area behind it is the figure most easily argued
 *    with, so the basis is a column rather than a tooltip.
 *
 * 3. WHICH FIGURES CAN CARRY A VERDICT. Only kpi-alumni has approved limits,
 *    because it was already on the dashboard before this tracer study existed.
 *    The other twelve report "no approved threshold" rather than a colour, and the
 *    block states the count rather than letting a uniform badge column imply that
 *    targets exist where none do.
 *
 * There are deliberately no target or variance columns: with twelve of thirteen
 * unset, such a column would be empty more often than not, and the number that
 * would fill it is exactly the number nobody has agreed.
 *
 * It also separates "the rate is 0%" from "nobody was traced". Those are entirely
 * different claims and a plain number cannot tell them apart.
 */
interface HeadlineRow {
  kpiId: string;
  label: string;
  basis: string;
}

const HEADLINE_ROWS: HeadlineRow[] = [
  { kpiId: "kpi-alumni", label: "Economically active", basis: "Employment register, against cohort" },
  { kpiId: "kpi-alumni-employment-rate", label: "Employment rate", basis: "Employment register, against cohort" },
  { kpiId: "kpi-alumni-response-rate", label: "Response rate", basis: "Cohort block" },
  { kpiId: "kpi-business-survival-rate", label: "Business survival rate", basis: "Business register" },
  { kpiId: "kpi-business-survival-months", label: "Average survival months", basis: "Business register" },
  { kpiId: "kpi-farm-yield-per-ha", label: "Yield per hectare", basis: "Farm productivity register" },
  { kpiId: "kpi-loan-repayment-rate", label: "Loan repayment rate", basis: "Loan register" },
  { kpiId: "kpi-loan-arrears-value", label: "Loans in arrears", basis: "Loan register" },
  { kpiId: "kpi-referrals-received", label: "Referrals received", basis: "Referral register" },
  { kpiId: "kpi-referral-conversion-rate", label: "Referral conversion rate", basis: "Referral register funnel" },
  { kpiId: "kpi-market-participation-rate", label: "Market participation rate", basis: "Market register, against cohort" },
  { kpiId: "kpi-market-revenue", label: "Market revenue", basis: "Market register" },
  { kpiId: "kpi-alumni-engagement-rate", label: "Engagement rate", basis: "Engagement register, against cohort" },
];

type QualityState = "complete" | "draft" | "not_submitted" | "thin_sample";

interface DataQuality {
  state: QualityState;
  label: string;
  detail: string;
}

const QUALITY_STYLES: Record<QualityState, string> = {
  complete: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
  draft: "border-amber-200 bg-amber-50/60 text-amber-900",
  thin_sample: "border-amber-200 bg-amber-50/60 text-amber-900",
  not_submitted: "border-ink/15 bg-ink/[0.03] text-ink-soft/70",
};

function formatDay(iso: string | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

export function AlumniHealthSummary() {
  const { kpis, cycles, alumniConfig, alumniReports } = useDataStore();

  const cycle = useMemo(() => getOpenAlumniCycle(cycles), [cycles]);

  const report = useMemo(() => {
    if (cycle) {
      const forCycle = alumniReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    // No open cycle: fall back to the most recent submitted report so the
    // dashboard still shows the last real position rather than an empty block.
    return [...alumniReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => (a.cycleId < b.cycleId ? 1 : -1))[0];
  }, [cycle, alumniReports]);

  const byId = useMemo(() => {
    const map = new Map<string, Kpi>();
    for (const kpi of kpis) map.set(kpi.id, kpi);
    return map;
  }, [kpis]);

  const quality = useMemo<DataQuality>(
    () => describeDataQuality({ report, hasCycle: Boolean(cycle) }),
    [report, cycle]
  );

  // No report at all means no cohort either, and summariseCohort reads the cohort
  // straight off the report, so the guard has to be here rather than inside it.
  const cohort = useMemo(() => (report ? summariseCohort(report, alumniConfig) : null), [report, alumniConfig]);
  const coverage = useMemo(() => sectionCoverage(report), [report]);
  const currencySymbol = alumniConfig.currencySymbol;

  const withThreshold = HEADLINE_ROWS.filter((row) => {
    const kpi = byId.get(row.kpiId);
    return kpi ? previewAlumniStatus(kpi, 0).status !== "threshold_unset" : false;
  }).length;

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Alumni tracer study</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Alumni tracer study submitted yet"}
        </p>
      </div>

      <div
        className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${QUALITY_STYLES[quality.state]}`}
        data-testid="alumni-data-quality"
      >
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      {/*
        The cohort leads deliberately. Everything below is a proportion of this
        group, so a reader has to see its size before the percentages.
      */}
      <div
        className="mt-3 rounded-2xl border border-amber-300/50 bg-amber-50/50 px-4 py-3 text-xs"
        data-testid="alumni-cohort-coverage"
      >
        {cohort ? (
          <>
            <p className="font-semibold text-amber-900">
              {cohort.traced} of {cohort.graduatesInCohort} graduates traced
              {cohort.responseRatePct !== null && ` (${cohort.responseRatePct.toFixed(1)}% response rate)`}
            </p>
            <p className="mt-0.5 text-amber-900/75">
              {cohort.untraceable > 0
                ? `${cohort.untraceable} recorded as untraceable. `
                : ""}
              Every rate below describes only the graduates who answered, not the whole cohort.
              {cohort.tracingMethod && ` Reached by ${cohort.tracingMethod.toLowerCase()}.`}
            </p>
            {cohort.belowMinimumResponse && (
              <p className="mt-1 font-medium text-amber-900">
                Below the {cohort.minimumResponseRatePct}% minimum response rate the department set for itself. The
                figures are reported, but they should not be quoted without that caveat.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-semibold text-amber-900">No cohort recorded yet</p>
            <p className="mt-0.5 text-amber-900/75">
              Every Alumni rate is a proportion of the graduates who were traced, so without a cohort size and a traced
              count none of the percentages below can be read as a share of the cohort.
            </p>
          </>
        )}
      </div>

      <div
        className="mt-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-xs"
        data-testid="alumni-section-coverage"
      >
        <p className="font-semibold text-ink">
          Section coverage: {coverage.reported} of {ALUMNI_SECTION_KEYS.length} sections reported
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
        <table className="w-full min-w-[42rem] border-collapse text-sm">
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
              // previewAlumniStatus, not getStatus: a KPI with no approved
              // threshold must say so rather than fall back to a colour.
              const { status, thresholdNote } = previewAlumniStatus(kpi, kpi.currentValue);
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
                      <KpiFigure kpi={kpi} format={(k) => formatAlumniValue(k, currencySymbol)}>
                        {formatAlumniValue(kpi, currencySymbol)}
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
        Every figure above is calculated from an Alumni register by the Alumni engine. Rows marked No data are waiting on
        a submission, not reporting a result of zero. Only the economically active rate carries approved limits, because
        it was already on the dashboard before this tracer study existed.
      </p>
    </section>
  );
}

function formatAlumniValue(kpi: Kpi, currencySymbol: string): string {
  if (kpi.unit === "currency") return `${currencySymbol}${Math.round(kpi.currentValue).toLocaleString("en-ZA")}`;
  return formatKpiValue(kpi);
}

/**
 * Resolves the one data-quality state these figures represent.
 *
 * A tracer study's distinguishing gap is the sample, so the state worth calling
 * out is a study that was submitted but reached too few graduates for the rates
 * to carry the weight they appear to. Those are still reported, because the
 * department's whole job is to report on the graduates it did reach, but they are
 * flagged rather than presented as if they described the cohort.
 */
function describeDataQuality({
  report,
  hasCycle,
}: {
  report: AlumniReport | undefined;
  hasCycle: boolean;
}): DataQuality {
  if (!report) {
    return {
      state: "not_submitted",
      label: "Not submitted",
      detail: hasCycle
        ? "The current Alumni cycle has no tracer study yet. No KPI below reports a result."
        : "No open Alumni cycle. The latest submitted study is shown.",
    };
  }

  if (report.status === "Draft") {
    return {
      state: "draft",
      label: "Draft in progress",
      detail: `A draft for ${report.reportingPeriod} exists but has not been submitted. Only submitted figures count towards the KPIs below.`,
    };
  }

  const traced = report.cohort.tracedThisPeriod;
  const cohortSize = report.cohort.graduatesInCohort;

  if (traced !== null && cohortSize !== null && cohortSize > 0 && traced === 0) {
    return {
      state: "thin_sample",
      label: "Nobody was traced in this cycle",
      detail: `${cohortSize} graduates were in the ${report.reportingPeriod} cohort and none were reached, so every rate below describes nobody. That is a real position and it is not the same as a rate of zero.`,
    };
  }

  return {
    state: "complete",
    label: "Submitted",
    detail: `${report.reportingPeriod}, submitted manually. Submitted by ${
      report.submittedBy ?? "Alumni Coordinator"
    } on ${formatDay(report.submittedAt)}.`,
  };
}

/**
 * Which of the seven registers actually hold rows for this submission.
 *
 * A section explicitly marked not applicable counts as deliberately excluded
 * rather than missing, so a cohort with no loans issued is not reported as a gap
 * in the evidence.
 */
function sectionCoverage(report: AlumniReport | undefined) {
  const missing: string[] = [];
  const notApplicable: string[] = [];
  let reported = 0;

  for (const key of ALUMNI_SECTION_KEYS) {
    const data = report?.[key];
    // With no report at all, every register is missing. Skipping them instead
    // would let the block claim "every register holds rows" on a dashboard where
    // nothing has ever been submitted.
    if (!data) {
      missing.push(ALUMNI_SECTION_LABELS[key]);
      continue;
    }
    if (data.notApplicable) {
      notApplicable.push(ALUMNI_SECTION_LABELS[key]);
      continue;
    }
    if (data.records.length > 0) reported += 1;
    else missing.push(ALUMNI_SECTION_LABELS[key]);
  }

  return { reported, missing, notApplicable };
}

export type { AlumniSectionKey };