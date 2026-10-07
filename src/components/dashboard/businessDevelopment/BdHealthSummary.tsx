import { useMemo } from "react";
import { useDataStore } from "../../../data/DataStoreContext";
import { getOpenBdCycle } from "../../../data/cycleEngine";
import { previewBdStatus } from "../../../data/businessDevelopmentEngine";
import { formatValue } from "../../../data/kpiEngine";
import { KpiFigure } from "../KpiFigure";
import { StatusBadge } from "../../kpi/StatusBadge";
import type { Kpi } from "../../../types";
import { BD_KPI_IDS, BD_SECTION_KEYS, BD_SECTION_LABELS, type BdReport } from "../../../types/businessDevelopment";

/**
 * The Business Development dashboard's own summary block: the headline
 * figures with the register each one is derived from, and how many of the six
 * registers hold rows, so an empty pipeline is shown as a gap rather than
 * read as a healthy zero.
 */
const HEADLINE_ROWS: { kpiId: string; label: string; basis: string }[] = [
  { kpiId: BD_KPI_IDS.activeOpportunities, label: "Active opportunities", basis: "Opportunity register" },
  { kpiId: BD_KPI_IDS.pipelineValue, label: "Pipeline value", basis: "Opportunity register" },
  { kpiId: BD_KPI_IDS.weightedPipelineValue, label: "Weighted pipeline", basis: "Opportunity register" },
  { kpiId: BD_KPI_IDS.opportunitiesStalled, label: "Stalled opportunities", basis: "Opportunity register" },
  { kpiId: BD_KPI_IDS.proposalWinRate, label: "Proposal win rate (decided)", basis: "Proposal register" },
  { kpiId: BD_KPI_IDS.newBusinessWon, label: "New business won", basis: "New business register" },
  { kpiId: BD_KPI_IDS.newClients, label: "New clients", basis: "Client register" },
  { kpiId: BD_KPI_IDS.leadToOpportunityConversion, label: "Lead conversion", basis: "Lead register" },
];

/** Registers whose row count decides section coverage. The commentary is prose
 *  rather than a register, so it is not counted here. */
const COUNTED_SECTIONS = BD_SECTION_KEYS.filter((k) => k !== "commentary");

export function BdHealthSummary() {
  const { kpis, cycles, bdReports } = useDataStore();
  const cycle = useMemo(() => getOpenBdCycle(cycles), [cycles]);

  const report = useMemo<BdReport | undefined>(() => {
    if (cycle) {
      const forCycle = bdReports.find((r) => r.cycleId === cycle.cycleId);
      if (forCycle) return forCycle;
    }
    return [...bdReports]
      .filter((r) => r.status === "Submitted")
      .sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1))[0];
  }, [cycle, bdReports]);

  const byId = useMemo(() => new Map<string, Kpi>(kpis.map((k) => [k.id, k])), [kpis]);

  const coverage = useMemo(() => {
    const missing: string[] = [];
    const notApplicable: string[] = [];
    let reported = 0;
    for (const key of COUNTED_SECTIONS) {
      const data = report?.[key];
      const rows = data ? (data as unknown as Record<string, unknown>)[key] : null;
      if (!data) missing.push(BD_SECTION_LABELS[key]);
      else if (data.notApplicable) notApplicable.push(BD_SECTION_LABELS[key]);
      else if (Array.isArray(rows) && rows.length > 0) reported += 1;
      else missing.push(BD_SECTION_LABELS[key]);
    }
    return { reported, missing, notApplicable };
  }, [report]);

  const quality = !report
    ? {
        style: "border-ink/15 bg-ink/[0.03] text-ink-soft/70",
        label: "Not submitted",
        detail: "The current Business Development cycle has no submission yet. The figures below are the last reported position.",
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
          detail: `${report.reportingPeriod}, submitted by ${report.submittedBy ?? "Business Development"} on ${
            report.submittedAt ? new Date(report.submittedAt).toLocaleDateString("en-ZA") : "-"
          }.`,
        };

  return (
    <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Business Development health</h2>
        <p className="text-xs text-ink-soft/50">
          {report ? `Reporting period: ${report.reportingPeriod}` : "No Business Development report yet"}
        </p>
      </div>

      <div className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${quality.style}`} data-testid="bd-data-quality">
        <p className="font-semibold">{quality.label}</p>
        <p className="mt-0.5 opacity-80">{quality.detail}</p>
      </div>

      <div
        className="mt-3 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 text-xs"
        data-testid="bd-section-coverage"
      >
        <p className="font-semibold text-ink">
          Section coverage: {coverage.reported} of {COUNTED_SECTIONS.length} registers hold rows
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
                  : previewBdStatus(kpi, kpi.currentValue);
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
        Every figure above is calculated from a Business Development register. Rates with no approved target report
        "threshold not set" rather than a colour, because no Board-approved win-rate or turnaround target exists yet.
      </p>
    </section>
  );
}
