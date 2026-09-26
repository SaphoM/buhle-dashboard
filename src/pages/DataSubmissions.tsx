import { useMemo, useState } from "react";
import { useDataStore } from "../data/DataStoreContext";
import { cycleBadgeStyle, cycleStatusMeaning, daysUntilDue, getEffectiveStatus } from "../data/cycleEngine";
import { SelectChevron } from "../components/common/SelectChevron";
import type { CycleStatus, Department } from "../types";

const STATUS_ORDER: CycleStatus[] = [
  "Overdue",
  "Open",
  "In Progress",
  "Validation Required",
  "Submitted",
  "Upcoming",
  "Returned",
  "Accepted",
  "Closed",
];

export function DataSubmissions() {
  const { cycles: allCycles } = useDataStore();
  const [department, setDepartment] = useState<Department | "all">("all");
  const departments = useMemo(
    () => Array.from(new Set(allCycles.map((c) => c.department))) as Department[],
    [allCycles]
  );

  const cycles = allCycles.filter((c) => department === "all" || c.department === department).sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(getEffectiveStatus(a));
    const sb = STATUS_ORDER.indexOf(getEffectiveStatus(b));
    return sa - sb;
  });

  const overdueCount = allCycles.filter((c) => getEffectiveStatus(c) === "Overdue").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Data / Submissions</h1>
        <p className="text-sm text-ink-soft/60">
          Every recurring dataset each department owns, with its own frequency and due date — so nobody has to
          remember what's due next.
        </p>
      </div>

      {overdueCount > 0 && (
        <div className="rounded-3xl border border-dashed border-ink/20 bg-white/40 px-5 py-3 text-sm text-ink-soft/70">
          <span className="font-semibold text-ink">{overdueCount} submission{overdueCount === 1 ? "" : "s"} overdue</span>
          {" "}across departments that have not yet engaged with discovery — see the To Confirm Register in Administration.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <select
            className="whitespace-nowrap appearance-none rounded-full bg-ink py-2 pl-7 pr-10 text-sm font-semibold text-butter hover:bg-ink-soft"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department | "all")}
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <SelectChevron />
        </div>
      </div>

      <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
            <tr>
              <th className="px-4 py-2.5 font-medium">Dataset</th>
              <th className="px-4 py-2.5 font-medium">Department</th>
              <th className="px-4 py-2.5 font-medium">Frequency</th>
              <th className="px-4 py-2.5 font-medium">Period</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Progress</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => {
              const status = getEffectiveStatus(c);
              const days = daysUntilDue(c);
              return (
                <tr key={c.cycleId} className="border-b border-ink/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{c.dataset}</div>
                    <div className="text-xs text-ink-soft/40">{c.description}</div>
                    {c.notes && <div className="mt-1 text-xs italic text-ink-soft/40">{c.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft/70">{c.department}</td>
                  <td className="px-4 py-3 text-ink-soft/70">{c.frequency}</td>
                  <td className="px-4 py-3 text-ink-soft/70">{c.reportingPeriod}</td>
                  <td className="px-4 py-3 text-ink-soft/70">
                    {new Date(c.dueDate).toLocaleDateString("en-ZA")}
                    <div className="text-xs text-ink-soft/40">
                      {status === "Overdue"
                        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
                        : days >= 0
                        ? `${days} day${days === 1 ? "" : "s"} left`
                        : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft/70">{c.owner}</td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full bg-butter" style={{ width: `${c.completionPct}%` }} />
                    </div>
                    <span className="text-xs text-ink-soft/40">{c.completionPct}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cycleBadgeStyle(status)}`}
                      title={cycleStatusMeaning[status]}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
