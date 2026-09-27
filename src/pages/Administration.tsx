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
          <div key={item.code} className="flex items-center justify-between gap-2 rounded-xl bg-ink/[0.03] px-3 py-2">
            <span className="text-sm text-ink-soft/80">{item.label}</span>
            <EvidenceBadge status={item.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Administration() {
  const { kpis, updateKpiThresholds } = useDataStore();

  function updateThreshold(id: string, field: "greenThreshold" | "amberThreshold" | "target", value: number) {
    updateKpiThresholds(id, { [field]: value });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Administration</h1>
        <p className="text-sm text-ink-soft/60">
          System configuration — master data, KPI thresholds, users and escalation rules. Changes here do not
          require a code change.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Master Data <span className="normal-case text-ink-soft/40">— shared reference codes, governed centrally rather than hard-coded per department</span>
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
        <div className="card-surface overflow-x-auto rounded-3xl border border-ink/10 shadow-sm">
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
              {kpis.map((k) => (
                <tr key={k.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">{k.name}</td>
                  <td className="px-4 py-2 text-ink-soft/70">{k.owner}</td>
                  <td className="px-4 py-2 text-xs text-ink-soft/50">{k.sourceSystem ?? "TO CONFIRM"}</td>
                  <td className="px-4 py-2">
                    <EvidenceBadge status={k.thresholdApproval === "confirmed" ? "confirmed" : "proposed"} />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.target}
                      onChange={(e) => updateThreshold(k.id, "target", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.greenThreshold}
                      onChange={(e) => updateThreshold(k.id, "greenThreshold", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.amberThreshold}
                      onChange={(e) => updateThreshold(k.id, "amberThreshold", Number(e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft/40">
          "Confirmed" means the target/threshold comes from a real Buhle document supplied during discovery (e.g.
          the HR KPI Calc workbook's own 2026 goals). "Proposed" means it is a starting point from the discovery
          brief, not yet Board-approved — see Section 19 of the brief.
        </p>
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
                  <td className="px-4 py-2 text-ink-soft/70">{u.department ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft/40">
          Board members are not application users — Board reporting is generated from the Executive environment
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
          To Confirm Register <span className="normal-case text-ink-soft/40">— open items, not silently resolved with guesses</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {TO_CONFIRM_REGISTER.map((item, i) => (
            <li key={i} className="text-sm text-ink-soft/70">
              <span className="font-medium text-ink-soft/90">{item.item}</span>
              {item.note && <span className="text-ink-soft/50"> — {item.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
