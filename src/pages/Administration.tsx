import { useRef, useState } from "react";
import { DEMO_USERS } from "../data/demoData";
import { useDataStore } from "../data/DataStoreContext";
import {
  COST_CENTRES,
  DEPARTMENTS,
  ENTERPRISE_CODES,
  FUNDER_CODES,
  TO_CONFIRM_REGISTER,
  type EvidenceStatus,
  type MasterRecord,
} from "../data/masterData";
import type { Department, ReportingFrequency } from "../types";
import { Tooltip } from "../components/common/Tooltip";
import { useToast } from "../components/common/ToastContext";

const APPROVAL_NOTE: Record<"confirmed" | "proposed", string> = {
  confirmed:
    "Confirmed - this target/threshold comes from a real Buhle document supplied during discovery (e.g. the HR KPI Calc workbook's own 2026 goals).",
  proposed:
    "Proposed - a starting point from the discovery brief, not yet Board-approved (see Section 19 of the brief).",
};

// Same short labels the top nav already uses per department (permissions.ts
// NAV_ITEMS) - reused here rather than inventing new department wording.
const KPI_DEPARTMENT_TABS: { label: string; department: Department | "all" }[] = [
  { label: "All", department: "all" },
  { label: "Finance", department: "Finance" },
  { label: "Operations", department: "Operations" },
  { label: "Farming", department: "Commercial Farming" },
  { label: "HR", department: "Human Resources" },
  { label: "Marketing", department: "Marketing" },
  { label: "Alumni", department: "Alumni" },
];

const evidenceStyles: Record<EvidenceStatus, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  proposed: "bg-butter/30 text-ink border-butter-dark/40",
  to_confirm: "bg-rose-50 text-rose-700 border-rose-200",
};

const evidenceLabel: Record<EvidenceStatus, string> = {
  confirmed: "Confirmed",
  proposed: "Proposed",
  to_confirm: "To Confirm",
};

function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${evidenceStyles[status]}`}>
      {evidenceLabel[status]}
    </span>
  );
}

function MasterDataList({ title, items }: { title: string; items: MasterRecord[] }) {
  return (
    <div className="card-surface rounded-3xl border border-ink/10 p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.code}
            tabIndex={item.note ? 0 : undefined}
            className="group relative flex items-center justify-between gap-2 rounded-xl bg-ink/[0.03] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-butter-dark"
          >
            <span className="text-sm text-ink-soft/80">{item.label}</span>
            <EvidenceBadge status={item.status} />
            {item.note && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-2xl bg-ink px-3 py-2 text-xs leading-snug text-butter opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                {item.note}
                <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-ink" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Cadences an HR reporting cycle can realistically run at. Held here rather
// than in the cycle engine so the option set is configuration, not a constant.
const HR_FREQUENCY_OPTIONS = [
  "Weekly",
  "Monthly",
  "Quarterly",
  "Annually",
  "Per Cohort",
  "Per Season",
] as const satisfies readonly ReportingFrequency[];

export function Administration() {
  const { kpis, updateKpiThresholds, hrConfig, updateHrConfig, auditLog } = useDataStore();
  const [kpiDeptFilter, setKpiDeptFilter] = useState<Department | "all">("all");
  const toast = useToast();
  // Threshold inputs fire onChange per keystroke (so live cross-role display
  // stays in sync as before) but the confirmation toast should only fire
  // once, when the user actually finishes editing a field - tracked here and
  // fired on blur, not on every keystroke.
  const dirtyThresholds = useRef<Set<string>>(new Set());

  function updateThreshold(
    id: string,
    field: "greenThreshold" | "amberThreshold" | "target",
    value: number | null
  ) {
    dirtyThresholds.current.add(`${id}-${field}`);
    updateKpiThresholds(id, { [field]: value });
  }

  function confirmThresholdEdit(id: string, field: string) {
    const key = `${id}-${field}`;
    if (!dirtyThresholds.current.has(key)) return;
    dirtyThresholds.current.delete(key);
    toast.success("KPI threshold updated successfully");
  }

  const filteredKpis = kpiDeptFilter === "all" ? kpis : kpis.filter((k) => k.department === kpiDeptFilter);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Administration</h1>
        <p className="text-sm text-ink-soft/60">
          System configuration - master data, KPI thresholds, users and escalation rules. Changes here do not
          require a code change.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Master Data <span className="normal-case text-ink-soft/40">- shared reference codes, governed centrally rather than hard-coded per department</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MasterDataList title="Departments" items={DEPARTMENTS} />
          <MasterDataList title="Cost Centres" items={COST_CENTRES} />
          <MasterDataList title="Funder / Project Codes" items={FUNDER_CODES} />
          <MasterDataList title="Enterprise Codes" items={ENTERPRISE_CODES} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">KPI Thresholds</h2>

        <div className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto rounded-full border border-ink/10 bg-white/80 p-1.5 shadow-sm">
          {KPI_DEPARTMENT_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setKpiDeptFilter(tab.department)}
              aria-pressed={kpiDeptFilter === tab.department}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                kpiDeptFilter === tab.department
                  ? "bg-ink text-white shadow-sm"
                  : "text-ink-soft/70 hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="card-surface overflow-x-auto rounded-3xl border border-ink/10 shadow-sm">
          {filteredKpis.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft/40">No KPI thresholds configured for this department.</p>
          ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">KPI</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Approval</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Green ≥</th>
                <th className="px-4 py-2.5 font-medium">Amber ≥</th>
              </tr>
            </thead>
            <tbody>
              {filteredKpis.map((k) => (
                <tr key={k.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">
                    <Tooltip text={k.insight}>{k.name}</Tooltip>
                  </td>
                  <td className="px-4 py-2 text-ink-soft/70">{k.owner}</td>
                  <td className="px-4 py-2 text-xs text-ink-soft/50">{k.sourceSystem ?? "TO CONFIRM"}</td>
                  <td className="px-4 py-2">
                    <Tooltip
                      text={APPROVAL_NOTE[k.thresholdApproval === "confirmed" ? "confirmed" : "proposed"]}
                    >
                      <EvidenceBadge status={k.thresholdApproval === "confirmed" ? "confirmed" : "proposed"} />
                    </Tooltip>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.target}
                      onChange={(e) => updateThreshold(k.id, "target", Number(e.target.value))}
                      onBlur={() => confirmThresholdEdit(k.id, "target")}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.greenThreshold ?? ""}
                      placeholder="Not set"
                      onChange={(e) => updateThreshold(k.id, "greenThreshold", e.target.value === "" ? null : Number(e.target.value))}
                      onBlur={() => confirmThresholdEdit(k.id, "greenThreshold")}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.amberThreshold ?? ""}
                      placeholder="Not set"
                      onChange={(e) => updateThreshold(k.id, "amberThreshold", e.target.value === "" ? null : Number(e.target.value))}
                      onBlur={() => confirmThresholdEdit(k.id, "amberThreshold")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-soft/40">
          "Confirmed" means the target/threshold comes from a real Buhle document supplied during discovery (e.g.
          the HR KPI Calc workbook's own 2026 goals). "Proposed" means it is a starting point from the discovery
          brief, not yet Board-approved - see Section 19 of the brief.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          HR Configuration{" "}
          <span className="normal-case text-ink-soft/40">
            - the switches that govern what HR can report at all
          </span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <label className="flex max-w-sm flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">HR reporting frequency</span>
            <select
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
              value={hrConfig.reportingFrequency}
              onChange={(e) =>
                updateHrConfig({ reportingFrequency: e.target.value as typeof hrConfig.reportingFrequency })
              }
            >
              {HR_FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-soft/40">
              Drives the calculated next submission date for every HR cycle. Monthly is the proposed default
              (HR spec Section 2).
            </span>
          </label>

          <label className="flex max-w-sm flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">Standard working days per month</span>
            <input
              type="number"
              min={1}
              className="w-32 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
              value={hrConfig.standardWorkingDaysPerMonth}
              onChange={(e) => updateHrConfig({ standardWorkingDaysPerMonth: Number(e.target.value) })}
            />
            <span className="text-[11px] text-ink-soft/40">
              Used to derive expected employee-days when HR leaves that field blank.
            </span>
          </label>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={hrConfig.performanceManagementActive}
                onChange={(e) => updateHrConfig({ performanceManagementActive: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-ink/20 accent-ink"
              />
              <span>
                <span className="text-sm font-semibold text-ink">
                  Formal performance-management system is active
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft/50">
                  Leave this <strong>off</strong> until Buhle adopts a formal performance-management process. While
                  it is off, the HR Performance section reports &quot;Performance Management System Not Yet
                  Active&quot; and the Staff Performance KPI shows &quot;Not Yet Available&quot; everywhere, including
                  the Executive Dashboard. No figure is fabricated (HR spec Sections 8, 9 and test 5).
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Audit Log <span className="normal-case text-ink-soft/40">- who changed what, and when</span>
        </h2>
        <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
          {auditLog.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft/40">
              Nothing recorded yet. Submissions, threshold changes and due-date overrides are logged here.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Who</th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {[...auditLog].reverse().map((a) => (
                  <tr key={a.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2 text-xs text-ink-soft/50">
                      {new Date(a.timestamp).toLocaleString("en-ZA")}
                    </td>
                    <td className="px-4 py-2 text-ink-soft/70">{a.actor}</td>
                    <td className="px-4 py-2 text-ink-soft/70">{a.department}</td>
                    <td className="px-4 py-2 text-ink-soft/80">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Users &amp; Roles</h2>
        <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_USERS.map((u) => (
                <tr key={u.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2 text-ink">{u.name}</td>
                  <td className="px-4 py-2 text-ink-soft/50">{u.email}</td>
                  <td className="px-4 py-2 capitalize text-ink-soft/70">{u.role.replace("_", " ")}</td>
                  <td className="px-4 py-2 text-ink-soft/70">{u.department ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft/40">
          Board members are not application users - Board reporting is generated from the Executive environment
          instead (see Section 4 of the discovery brief). The Board persona shown elsewhere in this demo predates
          that clarification and is kept only for demonstration purposes.
        </p>
      </section>

      <section className="card-surface rounded-3xl border border-ink/10 p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Escalation Rules</h2>
        <p className="text-sm text-ink-soft/70">Green → Monitor. Amber → Department Manager + Corrective Action. Red → Executive Management → Board → Immediate Intervention.</p>
        <p className="mt-2 text-xs text-ink-soft/40">
          Escalation recipients are configurable per department in a production build; this demo uses fixed
          role-based routing shown above.
        </p>
      </section>

      <section className="rounded-3xl border border-dashed border-ink/20 bg-white/40 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          To Confirm Register <span className="normal-case text-ink-soft/40">- open items, not silently resolved with guesses</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {TO_CONFIRM_REGISTER.map((item, i) => (
            <li key={i} className="text-sm text-ink-soft/70">
              <span className="font-medium text-ink-soft/90">{item.item}</span>
              {item.note && <span className="text-ink-soft/50"> - {item.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
