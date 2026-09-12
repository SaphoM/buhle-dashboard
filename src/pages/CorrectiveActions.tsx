import { useState } from "react";
import { DEMO_ACTIONS, DEMO_RISKS } from "../data/demoData";
import type { ActionStatus } from "../types";

const statusStyles: Record<ActionStatus, string> = {
  Open: "bg-ink/5 text-ink-soft/70",
  "In Progress": "bg-butter/40 text-ink",
  Completed: "bg-emerald-100 text-emerald-700",
  Overdue: "bg-ink text-butter",
  Cancelled: "bg-ink/5 text-ink-soft/30 line-through",
};

export function CorrectiveActions() {
  const [actions, setActions] = useState(DEMO_ACTIONS);
  const riskMap = new Map(DEMO_RISKS.map((r) => [r.id, r]));

  function advanceStatus(id: string) {
    setActions((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const order: ActionStatus[] = ["Open", "In Progress", "Completed"];
        const idx = order.indexOf(a.status);
        if (idx === -1 || idx === order.length - 1) return a;
        return { ...a, status: order[idx + 1] };
      })
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Corrective Actions</h1>
        <p className="text-sm text-ink-soft/60">Actions raised against Amber/Red risks, tracked to resolution.</p>
      </div>

      <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
            <tr>
              <th className="px-4 py-2.5 font-medium">Linked Risk</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => {
              const risk = riskMap.get(a.riskId);
              return (
                <tr key={a.id} className="border-b border-ink/5 last:border-0 align-top">
                  <td className="px-4 py-3 text-ink-soft/80">{risk?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft/80">{a.description}</td>
                  <td className="px-4 py-3 text-ink-soft/60">{a.owner}</td>
                  <td className="px-4 py-3 text-ink-soft/60">{new Date(a.dueDate).toLocaleDateString("en-ZA")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.status !== "Completed" && a.status !== "Cancelled" && (
                      <button
                        onClick={() => advanceStatus(a.id)}
                        className="text-xs font-semibold text-ink hover:underline"
                      >
                        Advance →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft/40">
        MVP note: status changes here are in-memory for demonstration. Production build persists to the database
        with a full audit trail (who changed what, when).
      </p>
    </div>
  );
}
