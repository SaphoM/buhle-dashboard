import { useDataStore } from "../data/DataStoreContext";
import type { ActionStatus } from "../types";

const statusStyles: Record<ActionStatus, string> = {
  Open: "bg-ink/5 text-ink-soft/70",
  "In Progress": "bg-butter/40 text-ink",
  Completed: "bg-emerald-100 text-emerald-700",
  Overdue: "bg-ink text-butter",
  Cancelled: "bg-ink/5 text-ink-soft/30 line-through",
};

export function CorrectiveActions() {
  const { risks, actions, advanceActionStatus } = useDataStore();
  const riskMap = new Map(risks.map((r) => [r.id, r]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Corrective Actions</h1>
        <p className="text-sm text-ink-soft/60">
          Actions raised against Amber/Red risks, tracked to resolution - including ones the Early Warning System
          staged automatically when a new risk appeared.
        </p>
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
                  <td className="px-4 py-3 text-ink-soft/80">
                    {risk?.name ?? "-"}
                    {a.id.startsWith("act-auto-") && (
                      <span className="ml-1.5 rounded-full bg-butter/40 px-2 py-0.5 text-[10px] font-semibold text-ink">
                        Auto-created
                      </span>
                    )}
                  </td>
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
                        onClick={() => advanceActionStatus(a.id)}
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
