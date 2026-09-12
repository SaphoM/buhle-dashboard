import { useMemo, useState } from "react";
import { DEMO_RISKS } from "../data/demoData";
import { StatusBadge } from "../components/kpi/StatusBadge";
import type { Department, RiskCategory, RiskLevel } from "../types";

const LEVELS: RiskLevel[] = ["red", "amber", "green"];
const levelTitle: Record<RiskLevel, string> = { red: "Critical Risks", amber: "Emerging Risks", green: "Monitoring / Resolved" };

export function RiskCentre() {
  const [department, setDepartment] = useState<Department | "all">("all");
  const [category, setCategory] = useState<RiskCategory | "all">("all");

  const departments = useMemo(
    () => Array.from(new Set(DEMO_RISKS.map((r) => r.department))) as Department[],
    []
  );
  const categories = useMemo(
    () => Array.from(new Set(DEMO_RISKS.map((r) => r.category))) as RiskCategory[],
    []
  );

  const filtered = DEMO_RISKS.filter(
    (r) => (department === "all" || r.department === department) && (category === "all" || r.category === category)
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Early Warning / Risk Centre</h1>
        <p className="text-sm text-ink-soft/60">
          Risk detection → classification → explanation → notification → escalation → corrective action.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm text-ink"
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
        <select
          className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm text-ink"
          value={category}
          onChange={(e) => setCategory(e.target.value as RiskCategory | "all")}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {LEVELS.map((level) => {
        const items = filtered.filter((r) => (level === "green" ? r.level === "green" || r.status === "Resolved" : r.level === level && r.status !== "Resolved"));
        return (
          <section key={level}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
              {levelTitle[level]} ({items.length})
            </h2>
            <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
              {items.length === 0 ? (
                <p className="p-4 text-sm text-ink-soft/40">None in this category.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Risk</th>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 font-medium">Department</th>
                      <th className="px-4 py-2.5 font-medium">Owner</th>
                      <th className="px-4 py-2.5 font-medium">Detected</th>
                      <th className="px-4 py-2.5 font-medium">Escalation</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.id} className="border-b border-ink/5 last:border-0 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{r.name}</div>
                          <div className="text-xs text-ink-soft/40">{r.description}</div>
                          <div className="mt-1 text-xs italic text-ink-soft/40">Recommended: {r.recommendedAction}</div>
                        </td>
                        <td className="px-4 py-3 text-ink-soft/70">{r.category}</td>
                        <td className="px-4 py-3 text-ink-soft/70">{r.department}</td>
                        <td className="px-4 py-3 text-ink-soft/70">{r.owner}</td>
                        <td className="px-4 py-3 text-ink-soft/70">{new Date(r.dateDetected).toLocaleDateString("en-ZA")}</td>
                        <td className="px-4 py-3 text-ink-soft/70">{r.escalationLevel}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.level} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
