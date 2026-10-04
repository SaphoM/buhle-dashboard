import type { ReactNode } from "react";
import type { Risk } from "../types";
import { useDataStore } from "../data/DataStoreContext";
import type { Department, Kpi } from "../types";
import { KpiCard } from "../components/kpi/KpiCard";
import { StatusBadge } from "../components/kpi/StatusBadge";
import { CircularRing } from "../components/kpi/CircularRing";
import { MiniBarTrend } from "../components/kpi/MiniBarTrend";
import { formatTarget, formatValue, getStatus } from "../data/kpiEngine";
import { daysUntilDue, getEffectiveStatus, getSubmissionEwsStatus } from "../data/cycleEngine";
import { DataFreshnessTag } from "../components/common/DataFreshnessTag";
import { TipRow, Tooltip } from "../components/common/Tooltip";
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

function generateExecutiveInsight(kpis: Kpi[]): string[] {
  // Rule-based summary generation - NOT AI-generated. Picks the most material
  // red/amber KPIs and states variance in plain language. KPIs with nothing
  // submitted are excluded here (variance is meaningless) and surfaced
  // separately as a data-quality gap instead.
  // Only a genuine Amber/Red judgement is a performance statement. "no_data",
  // "not_available" and "threshold_unset" are all statements about what we
  // don't know, so they are excluded here and surfaced as data-quality notes
  // instead of being dressed up as performance (HR spec Sections 8, 24, 25).
  const flagged = kpis
    .filter((k) => {
      const s = getStatus(k);
      return s === "amber" || s === "red";
    })
    .sort(
      (a, b) => Math.abs(b.currentValue - b.target) / b.target - Math.abs(a.currentValue - a.target) / a.target
    );
  return flagged.slice(0, 4).map((k) => k.insight);
}

function generateDataQualityNotes(kpis: Kpi[]): string[] {
  // A KPI that cannot be judged is stated in its own terms: either it is
  // unavailable by design, or it is simply waiting on someone to submit it.
  const unavailable = kpis
    .filter((k) => getStatus(k) === "not_available")
    .map((k) => `${k.department}: "${k.name}" is not yet available - ${k.notAvailableReason ?? k.insight}`);
  const notSubmitted = kpis
    .filter((k) => getStatus(k) === "no_data")
    .map((k) => `${k.department}: "${k.name}" has not been submitted this period - ${k.insight}`);
  const noThreshold = kpis
    .filter((k) => getStatus(k) === "threshold_unset")
    .map((k) => `${k.department}: "${k.name}" has a reported value but no approved threshold yet - ${k.insight}`);
  return [...unavailable, ...notSubmitted, ...noThreshold];
}

export function ExecutiveOverview() {
  const { user } = useAuth();
  const { kpis: allKpis, cycles: allCycles, risks: allRisks, actions: allActions } = useDataStore();

  // Section 57 - one row per department: the soonest-due cycle that isn't
  // closed, so the Executive can see at a glance who has submitted, who's
  // due soon, and who's overdue, without opening each department.
  const departmentsWithCycles = Array.from(new Set(allCycles.map((c) => c.department)));
  const submissionRows = departmentsWithCycles
    .map((dept) => {
      const deptCycles = allCycles
        .filter((c) => c.department === dept)
        .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c)))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      return deptCycles[0] ? { department: dept, cycle: deptCycles[0] } : null;
    })
    .filter((row): row is { department: Department; cycle: (typeof allCycles)[number] } => row !== null);
  const strategicKpis = STRATEGIC_KPI_IDS.map((id) => allKpis.find((k) => k.id === id)!).filter(Boolean);
  const counts = { green: 0, amber: 0, red: 0, no_data: 0, not_available: 0, threshold_unset: 0 };
  allKpis.forEach((k) => counts[getStatus(k)]++);
  const total = allKpis.length;
  // Organisational health is scored only over KPIs that actually carry a
  // verdict. A missing figure, an unavailable-by-design KPI, or a value with no
  // approved threshold is a data-quality problem, not evidence of good or bad
  // performance, so none of them may silently inflate or deflate the score.
  const reportingTotal = total - counts.no_data - counts.not_available - counts.threshold_unset;
  const score = reportingTotal === 0
    ? 0
    : Math.round(((counts.green * 100 + counts.amber * 55 + counts.red * 10) / (reportingTotal * 100)) * 100);

  const criticalRisks = allRisks.filter((r) => r.level === "red" && r.status !== "Resolved");
  const emergingRisks = allRisks.filter((r) => r.level === "amber" && r.status !== "Resolved");
  const resolvedRisks = allRisks.filter((r) => r.status === "Resolved").slice(0, 3);

  const today = new Date("2026-09-12");
  const overdue = allActions.filter((a) => a.status === "Overdue");
  const upcoming = allActions.filter((a) => {
    const due = new Date(a.dueDate);
    const days = (due.getTime() - today.getTime()) / 86400000;
    return a.status !== "Completed" && a.status !== "Overdue" && days >= 0 && days <= 14;
  });
  const completedCount = allActions.filter((a) => a.status === "Completed").length;

  const insights = generateExecutiveInsight(allKpis);
  const dataQualityNotes = generateDataQualityNotes(allKpis);
  const revenueKpi = allKpis.find((k) => k.id === "kpi-revenue")!;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-ink">Welcome back, {user?.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-soft/60">
            Buhle Farmers Academy - organisational health for September 2026.
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
          {counts.no_data > 0 && (
            <span className="rounded-full border border-dashed border-ink/20 bg-white px-4 py-1.5 text-sm font-semibold text-ink-soft/50">
              {counts.no_data} No Data
            </span>
          )}
        </div>
        <div className="flex items-center gap-8">
          {/* Each headline count hides its own composition: a reader cannot tell
              from "3/14 KPIs reporting" whether the missing eleven failed to
              report or are not reportable at all, and those are opposite
              problems. The tip spells the split out. */}
          <BigStat
            value={`${reportingTotal}/${total}`}
            label="KPIs reporting"
            detail={
              <span className="flex flex-col gap-1">
                <TipRow label="Reporting" value={reportingTotal} />
                <TipRow label="Not submitted" value={counts.no_data} />
                <TipRow label="Not available" value={counts.not_available} />
                <TipRow label="No threshold" value={counts.threshold_unset} />
              </span>
            }
          />
          <BigStat
            value={criticalRisks.length + emergingRisks.length}
            label="Active risks"
            detail={
              <span className="flex flex-col gap-1">
                <TipRow label="Critical" value={criticalRisks.length} />
                <TipRow label="Emerging" value={emergingRisks.length} />
                <TipRow label="Resolved" value={allRisks.filter((r) => r.status === "Resolved").length} />
              </span>
            }
          />
          <BigStat
            value={overdue.length + upcoming.length}
            label="Actions due"
            detail={
              <span className="flex flex-col gap-1">
                <TipRow label="Overdue" value={overdue.length} />
                <TipRow label="Due within 14 days" value={upcoming.length} />
                <TipRow label="Completed" value={completedCount} />
                <TipRow label="Total actions" value={allActions.length} />
              </span>
            }
          />
        </div>
      </div>

      {/* Widget row: score ring / revenue trend / risk pulse / action pulse */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-ink p-6 text-center shadow-sm">
          <Tooltip
            align="right"
            label={`Organisational Health: ${score} out of 100`}
            content={
              <span className="flex flex-col gap-1">
                <TipRow label="Score" value={`${score} / 100`} />
                <TipRow label="Scored KPIs" value={reportingTotal} />
                <TipRow label="On target" value={counts.green} />
                <TipRow label="Emerging" value={counts.amber} />
                <TipRow label="Critical" value={counts.red} />
                <span className="mt-1 block opacity-70">
                  Weighted 100 / 55 / 10. A KPI with no approved threshold or no
                  submission is excluded, not scored as zero.
                </span>
              </span>
            }
          >
            <CircularRing value={score} label={`${score}`} sublabel="/ 100" />
          </Tooltip>
          <div>
            <p className="text-sm font-semibold text-white">Organisational Health</p>
            <p className="text-xs text-white/50">{score >= 75 ? "Healthy" : score >= 55 ? "Needs Attention" : "Critical - Act Now"}</p>
          </div>
        </div>

        <div className="card-surface flex flex-col justify-between rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink-soft/60">Revenue Trend</p>
              {/* The one figure on this page shown in a rounded form: R100.00m
                  stands for a rand amount. The tip carries the exact figure and
                  the history behind the bars below it. */}
              <Tooltip
                align="right"
                label={`Revenue Trend: ${formatValue(revenueKpi)}`}
                content={
                  <span className="flex flex-col gap-1">
                    <TipRow label="Exact" value={formatValue(revenueKpi)} />
                    <TipRow
                      label="Previous"
                      value={formatValue({ ...revenueKpi, currentValue: revenueKpi.previousValue })}
                    />
                    <TipRow label="Target" value={formatTarget(revenueKpi)} />
                    {revenueKpi.history.map((h) => (
                      <TipRow key={h.period} label={h.period} value={`R${h.value.toLocaleString("en-ZA")}`} />
                    ))}
                  </span>
                }
              >
                <p className="mt-1 text-2xl font-bold text-ink">
                  R{(revenueKpi.currentValue / 1000000).toFixed(2)}m
                </p>
              </Tooltip>
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
            <span className="text-xs text-white/50">{allRisks.filter((r) => r.status !== "Resolved").length} active</span>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
            <div className="bg-rose-400" style={{ width: `${(criticalRisks.length / total) * 100}%` }} />
            <div className="bg-butter" style={{ width: `${(emergingRisks.length / total) * 100}%` }} />
            <div className="bg-emerald-400" style={{ width: `${(counts.green / total) * 100}%` }} />
          </div>
          <div className="mt-4 flex justify-between text-xs text-white/60">
            <Tooltip
              align="center"
              label={`${criticalRisks.length} critical risks`}
              content={
                <span className="flex flex-col gap-1">
                  <TipRow label="Level" value="Critical (red)" />
                  <TipRow label="Open" value={criticalRisks.length} />
                </span>
              }
            >
              <span>{criticalRisks.length} Critical</span>
            </Tooltip>
            <Tooltip
              align="center"
              label={`${emergingRisks.length} emerging risks`}
              content={
                <span className="flex flex-col gap-1">
                  <TipRow label="Level" value="Emerging (amber)" />
                  <TipRow label="Open" value={emergingRisks.length} />
                </span>
              }
            >
              <span>{emergingRisks.length} Emerging</span>
            </Tooltip>
            <Tooltip
              align="center"
              label={`${counts.green} KPIs on target`}
              content={
                <span className="flex flex-col gap-1">
                  <TipRow label="Meaning" value="KPIs on target" />
                  <TipRow label="Count" value={counts.green} />
                </span>
              }
            >
              {/* The bar's first two segments count risks but its third counts
                  on-target KPIs, so sitting in a row of risk levels the word
                  "Stable" reads as a risk level and is not one. */}
              <span>{counts.green} on target</span>
            </Tooltip>
          </div>
        </div>

        <div className="card-surface flex flex-col justify-between rounded-3xl border border-ink/10 p-6 shadow-sm">
          <p className="text-sm font-medium text-ink-soft/60">Corrective Actions</p>
          <div className="mt-2 flex items-baseline gap-2">
            <Tooltip
              align="right"
              label={`${completedCount} of ${allActions.length} actions completed`}
              content={
                <span className="flex flex-col gap-1">
                  <TipRow label="Completed" value={completedCount} />
                  <TipRow label="Overdue" value={overdue.length} />
                  <TipRow label="Due within 14 days" value={upcoming.length} />
                  <TipRow label="Total" value={allActions.length} />
                </span>
              }
            >
              <span className="text-2xl font-bold text-ink">{completedCount}</span>
            </Tooltip>
            <span className="text-xs text-ink-soft/50">/ {allActions.length} completed</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full bg-butter" style={{ width: `${(completedCount / allActions.length) * 100}%` }} />
          </div>
          <Link to="/actions" className="mt-3 text-xs font-semibold text-ink-soft/50 hover:text-ink">
            Open Corrective Actions →
          </Link>
        </div>
      </div>

      {/* Section 57: consolidated view of departmental submission status */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Departmental Submission Status <span className="normal-case text-ink-soft/40">- is the data current?</span>
        </h2>
        <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Department</th>
                <th className="px-4 py-2.5 font-medium">Current Period</th>
                <th className="px-4 py-2.5 font-medium">Submission Status</th>
                <th className="px-4 py-2.5 font-medium">Next Submission</th>
                <th className="px-4 py-2.5 font-medium">Submission EWS</th>
              </tr>
            </thead>
            <tbody>
              {submissionRows.map(({ department, cycle }) => {
                const status = getEffectiveStatus(cycle);
                const days = daysUntilDue(cycle);
                return (
                  <tr key={department} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{department}</td>
                    <td className="px-4 py-3 text-ink-soft/70">{cycle.reportingPeriod}</td>
                    <td className="px-4 py-3 text-ink-soft/70">{status}</td>
                    <td className="px-4 py-3 text-ink-soft/70">
                      {new Date(cycle.dueDate).toLocaleDateString("en-ZA")}
                      <span className="ml-1 text-xs text-ink-soft/40">
                        ({status === "Overdue" ? `${Math.abs(days)}d overdue` : `${days}d left`})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={getSubmissionEwsStatus(cycle)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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
          Executive Insight <span className="font-normal normal-case text-ink-soft/40">(rule-based, calculated from KPI variance - not AI-generated)</span>
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

      {dataQualityNotes.length > 0 && (
        <section className="rounded-3xl border border-dashed border-ink/20 bg-white/40 p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
            Data Quality - Not Submitted
          </h2>
          <ul className="flex flex-col gap-2">
            {dataQualityNotes.map((text, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-soft/60">
                <span className="text-ink-soft/30">•</span>
                {text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BigStat({
  value,
  label,
  detail,
}: {
  value: number | string;
  label: string;
  detail?: ReactNode;
}) {
  return (
    <div className="text-right">
      <div className="text-3xl font-bold text-ink">
        {detail ? (
          <Tooltip align="right" label={`${label}: ${value}`} content={detail}>
            {value}
          </Tooltip>
        ) : (
          value
        )}
      </div>
      <div className="text-xs text-ink-soft/50">{label}</div>
    </div>
  );
}

function DarkRiskGroup({ title, items, level }: { title: string; items: Risk[]; level: "red" | "amber" | "green" }) {
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
