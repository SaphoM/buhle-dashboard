import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { getOpenAcademyCycle } from "../../../data/cycleEngine";
import { previewAcademyStatus } from "../../../data/academyEngine";
import { formatValue } from "../../../data/kpiEngine";
import { KpiFigure } from "../KpiFigure";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import { ACADEMY_KPI_IDS, ACADEMY_SECTION_KEYS, ACADEMY_SECTION_LABELS, type AcademyReport } from "../../../types/academy";

/**
 * The Academy dashboard's own summary block: the headline figures with the
 * register each one is derived from, and how many of the four registers hold
 * rows for the current submission, so an empty register is shown as a gap
 * rather than read as a good result.
 */
const HEADLINE_ROWS: { kpiId: string; label: string; basis: string }[] = [
  { kpiId: ACADEMY_KPI_IDS.accreditedProgrammes, label: "Accredited programme rate", basis: "Programme register" },
  { kpiId: ACADEMY_KPI_IDS.applicationAcceptance, label: "Application acceptance rate", basis: "Intake register" },
  { kpiId: ACADEMY_KPI_IDS.intakeFillRate, label: "Intake fill rate", basis: "Intake register" },
  { kpiId: ACADEMY_KPI_IDS.competencyRate, label: "Assessment competency rate", basis: "Assessment register" },
  { kpiId: ACADEMY_KPI_IDS.moderationCoverage, label: "Moderation coverage", basis: "Assessment register" },
  { kpiId: ACADEMY_KPI_IDS.certificationRate, label: "Certification rate", basis: "Certification register" },
  { kpiId: ACADEMY_KPI_IDS.graduates, label: "Graduates (to Alumni)", basis: "Certification register" },
];

export function AcademyHealthSummary() {
  const { kpis, cycles, academyReports } = useDataStore();
  const cycle = useMemo(() => getOpenAcademyCycle(cycles), [cycles]);

  const report = useMemo<AcademyReport | undefined>(() => {
    if (cycle) {
      const forCycle = academyReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    return [...academyReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1))[0];
  }, [cycle, academyReports]);

  const byId = useMemo(() => new Map<string, Kpi>(kpis.map((k) => [k.id, k])), [kpis]);

  const coverage = useMemo(() => {
    const missing: string[] = [];
    const notApplicable: string[] = [];
    let reported = 0;
    for (const key of ACADEMY_SECTION_KEYS) {
      const data = report?.[key];
      if (!data) missing.push(ACADEMY_SECTION_LABELS[key]);
      else if (data.notApplicable) notApplicable.push(ACADEMY_SECTION_LABELS[key]);
      else if (data.records.length > 0) reported += 1;
      else missing.push(ACADEMY_SECTION_LABELS[key]);
    }
    return { reported, missing, notApplicable };
  }, [report]);

  const quality = !report
    ? {
        style: "border-ink/15 bg-ink/[0.03] text-ink-soft/70",
        label: "Not submitted",
        detail: "The current Academy cycle has no submission yet. The figures below are the last reported position.",
      }
    : report.status !== "Submitted"
      ? {
          style: "border-amber-200 bg-amber-50/60 text-amber-900",
          label: "Draft in progress",
          detail: `A draft for ${report.reportingPeriod} exists but has not been submitted. Only submitted figures count towards the KPIs below.`,
        }
      : {
          style: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
          label: "Submitted",
          detail: `${report.reportingPeriod}, submitted by ${report.submittedBy ?? "Academy"} on ${
            report.submittedAt ? new Date(report.submittedAt).toLocaleDateString("en-ZA") : "-"
          }.`,
        };

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Academy health</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Academy report yet"}
        </p>
      </div>

      <div className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${quality.style}`} data-testid="academy-data-quality">
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      <div
        className="mt-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-xs"
        data-testid="academy-section-coverage"
      >
        <p className="font-semibold text-ink">
          Section coverage: {coverage.reported} of {ACADEMY_SECTION_KEYS.length} registers hold rows
        </p>
        <p className="mt-0.5 text-ink-soft/60">
          {coverage.missing.length === 0
            ? "Every register holds rows for this submission."
            : `No data for ${coverage.missing.join(", ")}. Those figures are not derivable and are not counted as zero.`}
          {coverage.notApplicable.length > 0 && ` ${coverage.notApplicable.join(", ")} marked not applicable.`}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-wide text-ink-soft/50">
              <th scope="col" className="py-2 pr-3 font-medium">Metric</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Current</th>
              <th scope="col" className="py-2 pr-3 font-medium">Derived from</th>
              <th scope="col" className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {HEADLINE_ROWS.map((row) => {
              const kpi = byId.get(row.kpiId);
              if (!kpi) return null;
              const { status, thresholdNote } =
                kpi.dataAvailable === false
                  ? { status: "no_data" as const, thresholdNote: "" }
                  : previewAcademyStatus(kpi, kpi.currentValue);
              return (
                <tr key={row.kpiId} className="border-b border-ink/5 last:border-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                    {row.label}
                    {thresholdNote && (
                      <span className="mt-0.5 block text-[10px] font-normal text-ink-soft/45">No approved threshold</span>
                    )}
                  </th>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink">
                    {kpi.dataAvailable === false ? (
                      "No data"
                    ) : (
                      <KpiFigure kpi={kpi} format={formatValue}>
                        {formatValue(kpi)}
                      </KpiFigure>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-ink-soft/60">{row.basis}</td>
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
        Every figure above is calculated from an Academy register. Graduates recorded here become the population the
        Alumni tracer study reaches six months later.
      </p>
    </section>
  );
}
