import type { Department } from "../../types";
import { DEMO_KPIS, DEMO_RISKS, DEMO_ACTIONS } from "../../data/demoData";
import { KpiCard } from "../kpi/KpiCard";
import { StatusBadge } from "../kpi/StatusBadge";
import { DataFreshnessTag } from "../common/DataFreshnessTag";
import { getStatus } from "../../data/kpiEngine";

export function DepartmentDashboard({
  department,
  description,
}: {
  department: Department;
  description: string;
}) {
  const kpis = DEMO_KPIS.filter((k) => k.department === department);
  const risks = DEMO_RISKS.filter((r) => r.department === department && r.status !== "Resolved");
  const actionMap = new Map(DEMO_ACTIONS.map((a) => [a.riskId, a]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{department}</h1>
          <p className="text-sm text-ink-soft/60">{description}</p>
        </div>
        <DataFreshnessTag label="Updated today" source="Demo dataset" />
      </div>

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
    </div>
  );
}

export function departmentHealthCounts(department: Department) {
  const kpis = DEMO_KPIS.filter((k) => k.department === department);
  return {
    green: kpis.filter((k) => getStatus(k) === "green").length,
    amber: kpis.filter((k) => getStatus(k) === "amber").length,
    red: kpis.filter((k) => getStatus(k) === "red").length,
  };
}
