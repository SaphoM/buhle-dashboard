import { useState } from "react";
import { Link } from "react-router-dom";
import type { Department } from "../../types";
import { useDataStore } from "../../data/DataStoreContext";
import { daysUntilDue, getEffectiveStatus, getSubmissionEwsStatus } from "../../data/cycleEngine";
import { KpiCard } from "../kpi/KpiCard";
import { FinanceHealthSummary } from "./finance/FinanceHealthSummary";
import { StatusBadge } from "../kpi/StatusBadge";
import { CircularRing } from "../kpi/CircularRing";
import { MiniBarTrend } from "../kpi/MiniBarTrend";
import { DataFreshnessTag } from "../common/DataFreshnessTag";
import { formatValue, getStatus } from "../../data/kpiEngine";
import { SubmitDataModal } from "./SubmitDataModal";
import { HrSubmitDataModal } from "./HrSubmitDataModal";
import { FinanceSubmitDataModal } from "./FinanceSubmitDataModal";
import { OperationsSubmitDataModal } from "./OperationsSubmitDataModal";
import { OperationsHealthSummary } from "./operations/OperationsHealthSummary";
import { MarketingSubmitDataModal } from "./MarketingSubmitDataModal";
import { MarketingHealthSummary } from "./marketing/MarketingHealthSummary";

export function DepartmentDashboard({
  department,
  description,
}: {
  department: Department;
  description: string;
}) {
  const { kpis: allKpis, cycles: allCycles, risks: allRisks, actions: allActions } = useDataStore();
  const [modalOpen, setModalOpen] = useState(false);
  // HR reports through its own six-section cycle rather than the flat KPI form:
  // its KPIs are derived from underlying records, so typing the percentages
  // directly would bypass the engine entirely (HR spec Sections 1, 10, 11).
  const usesHrSubmission = department === "Human Resources";
  // Finance reports the same way HR does, and for the same structural reason:
  // its KPIs are derived from underlying records (revenue lines, cash flows,
  // budget lines, debtor and creditor invoices), so typing the percentages
  // directly would bypass the engine and create a second, divergent set of
  // financial rules (Finance spec Sections 5, 39).
  const usesFinanceSubmission = department === "Finance";
  // Operations reports the same way HR and Finance do, and for the same
  // structural reason: all twelve of its KPIs are derived from the seven
  // registers in the submission, so the flat KPI form would bypass the engine
  // and let someone type a completion rate that no register supports.
  const usesOperationsSubmission = department === "Operations";
  // Marketing reports the same way, and for the sharpest version of the same
  // structural reason: its conversion rate is the figure everybody quotes and
  // the easiest one to type directly, so the flat KPI form would let someone
  // report a rate that no enquiry record supports.
  const usesMarketingSubmission = department === "Marketing";
  const kpis = allKpis.filter((k) => k.department === department);
  const allDeptRisks = allRisks.filter((r) => r.department === department);
  const risks = allDeptRisks.filter((r) => r.status !== "Resolved");
  const actionMap = new Map(allActions.map((a) => [a.riskId, a]));
  const riskIds = new Set(allDeptRisks.map((r) => r.id));
  const deptActions = allActions.filter((a) => riskIds.has(a.riskId));

  // Section 47: proactively tell the manager what's due next, rather than
  // relying on them to remember. Overdue first, then the soonest due date.
  const deptCycles = allCycles
    .filter((c) => c.department === department)
    .map((c) => ({ cycle: c, status: getEffectiveStatus(c) }))
    .filter(({ status }) => status !== "Accepted" && status !== "Closed")
    .sort((a, b) => new Date(a.cycle.dueDate).getTime() - new Date(b.cycle.dueDate).getTime());
  const nextCycle = deptCycles[0];

  // Department health widgets - same language as the Executive Overview,
  // scoped to this department, so managers get the same at-a-glance read.
  const counts = { green: 0, amber: 0, red: 0, no_data: 0, not_available: 0, threshold_unset: 0 };
  kpis.forEach((k) => counts[getStatus(k)]++);
  const total = kpis.length;
  const reportingTotal = total - counts.no_data;
  const score =
    reportingTotal === 0
      ? 0
      : Math.round(((counts.green * 100 + counts.amber * 55 + counts.red * 10) / (reportingTotal * 100)) * 100);

  const criticalRisks = risks.filter((r) => r.level === "red");
  const emergingRisks = risks.filter((r) => r.level === "amber");

  const spotlightKpi = kpis.find((k) => k.dataAvailable !== false) ?? kpis[0];
  const completedActions = deptActions.filter((a) => a.status === "Completed").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{department}</h1>
          <p className="text-sm text-ink-soft/60">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <DataFreshnessTag label="Updated today" source="Demo dataset" />
          <button
            onClick={() => setModalOpen(true)}
            className="whitespace-nowrap rounded-full bg-ink px-7 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
          >
            {usesHrSubmission
              ? "Submit HR Data"
              : usesFinanceSubmission
                ? "Submit Finance Data"
                : "Submit Data"}
          </button>
        </div>
      </div>

      {nextCycle && (
        <section className="card-surface rounded-3xl border border-ink/10 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
              Data Submission <span className="normal-case text-ink-soft/40">- is the department reporting on time?</span>
            </h2>
            <Link to="/data" className="text-xs font-semibold text-ink hover:underline">
              View all submissions →
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <Field label="Current period" value={nextCycle.cycle.reportingPeriod} />
              <Field label="Status" value={nextCycle.status} />
              <Field
                label="Next submission"
                value={new Date(nextCycle.cycle.dueDate).toLocaleDateString("en-ZA")}
              />
              <Field
                label={nextCycle.status === "Overdue" ? "Overdue by" : "Due in"}
                value={`${Math.abs(daysUntilDue(nextCycle.cycle))} day${Math.abs(daysUntilDue(nextCycle.cycle)) === 1 ? "" : "s"}`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-soft/50">Submission Early Warning</span>
              <StatusBadge status={getSubmissionEwsStatus(nextCycle.cycle)} />
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-soft/40">{nextCycle.cycle.description}</p>
        </section>
      )}

      {total > 0 && (
        <>
          <h2 className="-mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
            Business Performance <span className="normal-case text-ink-soft/40">- is what was submitted actually on target?</span>
          </h2>
          {/* Stat pills row - same read as the Executive Overview, scoped to this department */}
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-ink/10 bg-white/60 px-6 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft/50">KPI status</span>
              <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-butter">{counts.red} Critical</span>
              <span className="rounded-full bg-butter px-4 py-1.5 text-sm font-semibold text-ink">{counts.amber} Emerging</span>
              <span className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm font-semibold text-ink-soft">
                {counts.green} On Target
              </span>
              {counts.no_data > 0 && (
                <span className="rounded-full border border-dashed border-ink/20 bg-white px-4 py-1.5 text-sm font-semibold text-ink-soft/50">
                  {counts.no_data} No Data
                </span>
              )}
            </div>
            <div className="flex items-center gap-8">
              <BigStat value={`${reportingTotal}/${total}`} label="KPIs reporting" />
              <BigStat value={criticalRisks.length + emergingRisks.length} label="Active risks" />
            </div>
          </div>

          {/* Widget row - health ring / primary KPI trend / risk pulse / actions */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-ink p-6 text-center shadow-sm">
              <CircularRing value={score} size={120} stroke={10} label={`${score}`} sublabel="/ 100" />
              <div>
                <p className="text-sm font-semibold text-white">Department Health</p>
                <p className="text-xs text-white/50">
                  {score >= 75 ? "Healthy" : score >= 55 ? "Needs Attention" : "Critical - Act Now"}
                </p>
              </div>
            </div>

            {spotlightKpi && (
              <div className="card-surface flex flex-col justify-between rounded-3xl border border-ink/10 p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-soft/60">{spotlightKpi.name}</p>
                    <p className="mt-1 text-2xl font-bold text-ink">
                      {spotlightKpi.dataAvailable === false ? "No data" : formatValue(spotlightKpi)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <MiniBarTrend data={spotlightKpi.history.length > 0 ? spotlightKpi.history : [{ period: "-", value: 0 }]} />
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-ink p-6 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Risk Pulse</p>
                <span className="text-xs text-white/50">{risks.length} active</span>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
                <div className="bg-rose-400" style={{ width: `${total ? (criticalRisks.length / total) * 100 : 0}%` }} />
                <div className="bg-butter" style={{ width: `${total ? (emergingRisks.length / total) * 100 : 0}%` }} />
                <div className="bg-emerald-400" style={{ width: `${total ? (counts.green / total) * 100 : 0}%` }} />
              </div>
              <div className="mt-4 flex justify-between text-xs text-white/60">
                <span>{criticalRisks.length} Critical</span>
                <span>{emergingRisks.length} Emerging</span>
                <span>{counts.green} Stable</span>
              </div>
            </div>

            <div className="card-surface flex flex-col justify-between rounded-3xl border border-ink/10 p-6 shadow-sm">
              <p className="text-sm font-medium text-ink-soft/60">Corrective Actions</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink">{completedActions}</span>
                <span className="text-xs text-ink-soft/50">/ {deptActions.length || 0} completed</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full bg-butter"
                  style={{ width: `${deptActions.length ? (completedActions / deptActions.length) * 100 : 0}%` }}
                />
              </div>
              <Link to="/actions" className="mt-3 text-xs font-semibold text-ink-soft/50 hover:text-ink">
                Open Corrective Actions →
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Sections 23 and 38: Finance states its own headline position and data
          quality, because the generic KPI grid below cannot distinguish a good
          result from a result nobody has reported yet. */}
      {department === "Finance" && <FinanceHealthSummary />}

      {/* Operations states its own headline figures, the register each was
          derived from, and how many of the seven registers actually hold
          rows, because an empty section is not the same claim as a zero. */}
      {department === "Operations" && <OperationsHealthSummary />}

      {/* Marketing states its own headline figures, the register each was
          derived from, and how many of the five registers hold rows. It also
          separates "the rate is 0%" from "no outcome was ever recorded", which
          the generic KPI grid cannot tell apart. */}
      {department === "Marketing" && <MarketingHealthSummary />}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => (
            <KpiCard key={k.id} kpi={k} />
          ))}
          {kpis.length === 0 && (
            <p className="text-sm text-ink-soft/40">No KPIs configured yet for this department.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Risks &amp; Exceptions</h2>
        <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
          {risks.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft/40">No active risks for this department.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Linked Action</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => {
                  const action = actionMap.get(r.id);
                  return (
                    <tr key={r.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{r.name}</div>
                        <div className="text-xs text-ink-soft/40">{r.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.level} />
                      </td>
                      <td className="px-4 py-3 text-ink-soft/70">{r.owner}</td>
                      <td className="px-4 py-3 text-ink-soft/70">
                        {action ? `${action.description} (${action.status})` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Only one modal is mounted per department: the flat KPI form must never
          be reachable for a department whose KPIs are derived, or Finance
          figures could be typed straight into the KPIs and bypass the engine. */}
      {usesHrSubmission ? (
        <HrSubmitDataModal open={modalOpen} onClose={() => setModalOpen(false)} />
      ) : usesFinanceSubmission ? (
        <FinanceSubmitDataModal open={modalOpen} onClose={() => setModalOpen(false)} />
      ) : usesOperationsSubmission ? (
        <OperationsSubmitDataModal open={modalOpen} onClose={() => setModalOpen(false)} />
      ) : usesMarketingSubmission ? (
        <MarketingSubmitDataModal open={modalOpen} onClose={() => setModalOpen(false)} />
      ) : (
        <SubmitDataModal department={department} open={modalOpen} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function BigStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-right">
      <div className="text-3xl font-bold text-ink">{value}</div>
      <div className="text-xs text-ink-soft/50">{label}</div>
    </div>
  );
}

export function departmentHealthCounts(department: Department, kpis: ReturnType<typeof useDataStore>["kpis"]) {
  const deptKpis = kpis.filter((k) => k.department === department);
  return {
    green: deptKpis.filter((k) => getStatus(k) === "green").length,
    amber: deptKpis.filter((k) => getStatus(k) === "amber").length,
    red: deptKpis.filter((k) => getStatus(k) === "red").length,
  };
}
