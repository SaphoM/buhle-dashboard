import { DEMO_ACTIONS, DEMO_KPIS, DEMO_RISKS } from "../data/demoData";
import { KpiCard } from "../components/kpi/KpiCard";
import { StatusBadge } from "../components/kpi/StatusBadge";
import { CircularRing } from "../components/kpi/CircularRing";
import { MiniBarTrend } from "../components/kpi/MiniBarTrend";
import { getStatus } from "../data/kpiEngine";
import { DataFreshnessTag } from "../components/common/DataFreshnessTag";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const STRATEGIC_KPI_IDS = [
  "kpi-revenue",
  "kpi-surplus",
  "kpi-enrolment",
  "kpi-farmrevenue",
  "kpi-funding",
  "kpi-completion",
];

function generateExecutiveInsight(): string[] {
  // Rule-based summary generation — NOT AI-generated. Picks the most material
  // red/amber KPIs and states variance in plain language.
  const flagged = DEMO_KPIS.filter((k) => getStatus(k) !== "green").sort(
    (a, b) => Math.abs(b.currentValue - b.target) / b.target - Math.abs(a.currentValue - a.target) / a.target
  );
  return flagged.slice(0, 4).map((k) => k.insight);
}

export function ExecutiveOverview() {
  const { user } = useAuth();
  const strategicKpis = STRATEGIC_KPI_IDS.map((id) => DEMO_KPIS.find((k) => k.id === id)!).filter(Boolean);
  const counts = { green: 0, amber: 0, red: 0 };
  DEMO_KPIS.forEach((k) => counts[getStatus(k)]++);
  const total = DEMO_KPIS.length;
  const score = Math.round(((counts.green * 100 + counts.amber * 55 + counts.red * 10) / (total * 100)) * 100);

  const criticalRisks = DEMO_RISKS.filter((r) => r.level === "red" && r.status !== "Resolved");
  const emergingRisks = DEMO_RISKS.filter((r) => r.level === "amber" && r.status !== "Resolved");
  const resolvedRisks = DEMO_RISKS.filter((r) => r.status === "Resolved").slice(0, 3);

  const today = new Date("2026-09-12");
  const overdue = DEMO_ACTIONS.filter((a) => a.status === "Overdue");
  const upcoming = DEMO_ACTIONS.filter((a) => {
    const due = new Date(a.dueDate);
    const days = (due.getTime() - today.getTime()) / 86400000;
    return a.status !== "Completed" && a.status !== "Overdue" && days >= 0 && days <= 14;
  });
  const completedCount = DEMO_ACTIONS.filter((a) => a.status === "Completed").length;

  const insights = generateExecutiveInsight();
  const revenueKpi = DEMO_KPIS.find((k) => k.id === "kpi-revenue")!;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-ink">Welcome back, {user?.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-soft/60">
            Buhle Farmers Academy — organisational health for September 2026.
          </p>
        </div>
        <DataFreshnessTag label="Updated today" source="Demo dataset" />
      </div>

      {/* Stat pills + big numbers row */}
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-ink/10 bg-white/60 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft/50">KPI status</span>
          <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-butter">{counts.red} Critical</span>
          <span className="rounded-full bg-butter px-4 py-1.5 text-sm font-semibold text-ink">{counts.amber} Emerging</span>
          <span className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm font-semibold text-ink-soft">
            {counts.green} On Target
          </span>
        </div>
        <div className="flex items-center gap-8">
          <BigStat value={total} label="KPIs tracked" />
          <BigStat value={criticalRisks.length + emergingRisks.length} label="Active risks" />
          <BigStat value={overdue.length + upcoming.length} label="Actions due" />
        </div>
      </div>

      {/* Widget row: score ring / revenue trend / risk pulse / action pulse */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-ink p-6 text-center shadow-sm">
          <CircularRing value={score} label={`${score}`} sublabel="/ 100" />
          <div>
            <p className="text-sm font-semibold text-white">Organisational Health</p>
            <p className="text-xs text-white/50">{score >= 75 ? "Healthy" : score >= 55 ? "Needs Attention" : "Critical — Act Now"}</p>
          </div>
        </div>

        <div className="card-surface flex flex-col justify-between rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink-soft/60">Revenue Trend</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                R{(revenueKpi.currentValue / 1000000).toFixed(2)}m
              </p>
            </div>
            <Link to="/finance" className="text-xs font-semibold text-ink-soft/50 hover:text-ink">
              View →
            </Link>
          </div>
          <div className="mt-3">
            <MiniBarTrend data={revenueKpi.history} />
          </div>
        </div>

        <div className="rounded-3xl bg-ink p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Risk Pulse</p>
            <span className="text-xs text-white/50">{DEMO_RISKS.filter((r) => r.status !== "Resolved").length} active</span>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
            <div className="bg-rose-400" style={{ width: `${(criticalRisks.length / total) * 100}%` }} />
            <div className="bg-butter" style={{ width: `${(emergingRisks.length / total) * 100}%` }} />
            <div className="bg-emerald-400" style={{ width: `${(counts.green / total) * 100}%` }} />
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
            <span className="text-2xl font-bold text-ink">{completedCount}</span>
            <span className="text-xs text-ink-soft/50">/ {DEMO_ACTIONS.length} completed</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full bg-butter" style={{ width: `${(completedCount / DEMO_ACTIONS.length) * 100}%` }} />
          </div>
          <Link to="/actions" className="mt-3 text-xs font-semibold text-ink-soft/50 hover:text-ink">
            Open Corrective Actions →
          </Link>
        </div>
      </div>

      {/* Strategic KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Strategic KPIs</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strategicKpis.map((k) => (
            <KpiCard key={k.id} kpi={k} linkTo={`/${k.department === "Commercial Farming" ? "farming" : k.department.toLowerCase()}`} />
          ))}
        </div>
      </section>

      {/* Dark task-list style risk/action panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-ink p-6 text-white shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Risk Summary</h2>
            <Link to="/risk-centre" className="text-xs font-semibold text-butter hover:underline">
              Open Risk Centre →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <DarkRiskGroup title="Critical" items={criticalRisks} level="red" />
            <DarkRiskGroup title="Emerging" items={emergingRisks} level="amber" />
            <DarkRiskGroup title="Recently Resolved" items={resolvedRisks} level="green" />
          </div>
        </div>

        <div className="card-surface rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Actions Requiring Attention</h2>
            <Link to="/actions" className="text-xs font-semibold text-ink hover:underline">
              Open Corrective Actions →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-rose-500">Overdue ({overdue.length})</p>
            {overdue.map((a) => (
              <ActionRow key={a.id} description={a.description} owner={a.owner} due={a.dueDate} />
            ))}
            <p className="mt-2 text-xs font-semibold text-ink-soft/60">Due within 14 days ({upcoming.length})</p>
            {upcoming.map((a) => (
              <ActionRow key={a.id} description={a.description} owner={a.owner} due={a.dueDate} />
            ))}
            {overdue.length === 0 && upcoming.length === 0 && (
              <p className="text-sm text-ink-soft/40">No urgent actions at this time.</p>
            )}
          </div>
        </div>
      </div>

      <section className="card-surface rounded-3xl border border-ink/10 p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Executive Insight <span className="font-normal normal-case text-ink-soft/40">(rule-based, calculated from KPI variance — not AI-generated)</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {insights.map((text, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-soft/80">
              <span className="text-ink-soft/30">•</span>
              {text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BigStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-right">
      <div className="text-3xl font-bold text-ink">{value}</div>
      <div className="text-xs text-ink-soft/50">{label}</div>
    </div>
  );
}

function DarkRiskGroup({ title, items, level }: { title: string; items: typeof DEMO_RISKS; level: "red" | "amber" | "green" }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-white/50">
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-white/30">None currently.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
              <span className="text-white/90">{r.name}</span>
              <StatusBadge status={level} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionRow({ description, owner, due }: { description: string; owner: string; due: string }) {
  return (
    <div className="rounded-xl bg-ink/5 px-3 py-2 text-sm">
      <div className="text-ink-soft/80">{description}</div>
      <div className="text-xs text-ink-soft/40">
        {owner} · Due {new Date(due).toLocaleDateString("en-ZA")}
      </div>
    </div>
  );
}
