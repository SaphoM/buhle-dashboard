import { useState } from "react";
import { Link } from "react-router-dom";
import type { Department } from "../../types";
import { DEMO_RISKS, DEMO_ACTIONS } from "../../data/demoData";
import { useDataStore } from "../../data/DataStoreContext";
import { cycleBadgeStyle, daysUntilDue, getEffectiveStatus } from "../../data/cycleEngine";
import { KpiCard } from "../kpi/KpiCard";
import { StatusBadge } from "../kpi/StatusBadge";
import { DataFreshnessTag } from "../common/DataFreshnessTag";
import { getStatus } from "../../data/kpiEngine";
import { SubmitDataModal } from "./SubmitDataModal";

export function DepartmentDashboard({
  department,
  description,
}: {
  department: Department;
  description: string;
}) {
  const { kpis: allKpis, cycles: allCycles } = useDataStore();
  const [modalOpen, setModalOpen] = useState(false);
  const kpis = allKpis.filter((k) => k.department === department);
  const risks = DEMO_RISKS.filter((r) => r.department === department && r.status !== "Resolved");
  const actionMap = new Map(DEMO_ACTIONS.map((a) => [a.riskId, a]));

  // Section 47: proactively tell the manager what's due next, rather than
  // relying on them to remember. Overdue first, then the soonest due date.
  const deptCycles = allCycles
    .filter((c) => c.department === department)
    .map((c) => ({ cycle: c, status: getEffectiveStatus(c) }))
    .filter(({ status }) => status !== "Accepted" && status !== "Closed")
    .sort((a, b) => new Date(a.cycle.dueDate).getTime() - new Date(b.cycle.dueDate).getTime());
  const nextCycle = deptCycles[0];

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
            className="whitespace-nowrap rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-butter hover:bg-ink-soft"
          >
            Submit Data
          </button>
        </div>
      </div>

      {nextCycle && (
        <div className="card-surface flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-ink/10 p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
              {nextCycle.status === "Overdue"
                ? "Overdue submission"
                : nextCycle.status === "Submitted" || nextCycle.status === "Validation Required"
                ? "Awaiting review"
                : "Your next data submission is due"}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {nextCycle.cycle.dataset} — {nextCycle.cycle.reportingPeriod}
            </p>
            <p className="text-xs text-ink-soft/50">
              {nextCycle.cycle.description} Due {new Date(nextCycle.cycle.dueDate).toLocaleDateString("en-ZA")}
              {nextCycle.status !== "Overdue" &&
                nextCycle.status !== "Submitted" &&
                nextCycle.status !== "Validation Required" &&
                ` (${daysUntilDue(nextCycle.cycle)} days left)`}
              .
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cycleBadgeStyle(nextCycle.status)}`}>
              {nextCycle.status}
            </span>
            <Link to="/data" className="text-xs font-semibold text-ink hover:underline">
              View all submissions →
            </Link>
          </div>
        </div>
      )}

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
                        {action ? `${action.description} (${action.status})` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <SubmitDataModal department={department} open={modalOpen} onClose={() => setModalOpen(false)} />
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
