import { DEMO_ACTIONS, DEMO_KPIS, DEMO_RISKS } from "../data/demoData";
import { getStatus } from "../data/kpiEngine";

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const reports = [
  {
    id: "weekly",
    name: "Weekly Management Report",
    description: "KPI status, active risks, corrective actions and department highlights for the past week.",
  },
  {
    id: "monthly",
    name: "Monthly Executive Report",
    description: "Full cross-functional performance: finance, academic, farming, HR, marketing, alumni, risks.",
  },
  {
    id: "board",
    name: "Board Report",
    description: "High-level strategic summary for Board members — organisational health and material risks only.",
  },
];

export function Reports() {
  function exportKpis() {
    const rows = [["KPI", "Department", "Current", "Target", "Status"]];
    DEMO_KPIS.forEach((k) =>
      rows.push([k.name, k.department, String(k.currentValue), String(k.target), getStatus(k)])
    );
    download("buhle-kpi-export.csv", toCsv(rows));
  }
  function exportRisks() {
    const rows = [["Risk", "Category", "Department", "Level", "Owner", "Status"]];
    DEMO_RISKS.forEach((r) => rows.push([r.name, r.category, r.department, r.level, r.owner, r.status]));
    download("buhle-risk-export.csv", toCsv(rows));
  }
  function exportActions() {
    const rows = [["Action", "Owner", "Due Date", "Status"]];
    DEMO_ACTIONS.forEach((a) => rows.push([a.description, a.owner, a.dueDate, a.status]));
    download("buhle-actions-export.csv", toCsv(rows));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Reports</h1>
        <p className="text-sm text-ink-soft/60">Standard reporting templates. PDF/Excel export is planned for Phase 2.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {reports.map((r) => (
          <div key={r.id} className="card-surface rounded-3xl border border-ink/10 p-5 shadow-sm">
            <h3 className="font-semibold text-ink">{r.name}</h3>
            <p className="mt-1 text-sm text-ink-soft/60">{r.description}</p>
            <span className="mt-3 inline-block rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink-soft/50">
              PDF export — Phase 2
            </span>
          </div>
        ))}
      </div>

      <section className="card-surface rounded-3xl border border-ink/10 p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">CSV Data Export (available now)</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportKpis} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-butter hover:bg-ink-soft">
            Export KPIs
          </button>
          <button onClick={exportRisks} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-butter hover:bg-ink-soft">
            Export Risks
          </button>
          <button onClick={exportActions} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-butter hover:bg-ink-soft">
            Export Corrective Actions
          </button>
        </div>
      </section>
    </div>
  );
}
