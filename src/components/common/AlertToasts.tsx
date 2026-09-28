import { useEffect, useState } from "react";
import { useDataStore } from "../../data/DataStoreContext";

// The visible half of "alert and react" (Section 62, step 7 — "Create
// alerts where necessary"). A risk being created/escalated/resolved by the
// EWS engine is silent unless something actually surfaces it — this renders
// each new alert as a dismissible toast, auto-clearing after a few seconds,
// stacked bottom-left (the "Built by X Spark" badge already owns bottom-right).

const levelStyles: Record<string, string> = {
  red: "bg-ink text-butter border-ink",
  amber: "bg-butter text-ink border-butter-dark",
  green: "bg-emerald-600 text-white border-emerald-700",
  no_data: "bg-white text-ink-soft border-ink/15",
};

const levelIcon: Record<string, string> = {
  red: "⚠",
  amber: "⚠",
  green: "✓",
  no_data: "•",
};

export function AlertToasts() {
  const { alerts, dismissAlert } = useDataStore();
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (alerts.length === 0) return;
    const newest = alerts[0];
    setVisibleIds((prev) => new Set(prev).add(newest.id));
    const timer = setTimeout(() => {
      setVisibleIds((prev) => {
        const next = new Set(prev);
        next.delete(newest.id);
        return next;
      });
    }, 8000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts[0]?.id]);

  const shown = alerts.filter((a) => visibleIds.has(a.id)).slice(0, 4);
  if (shown.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2">
      {shown.map((a) => (
        <div
          key={a.id}
          className={`flex max-w-sm items-start gap-2 rounded-2xl border px-4 py-3 shadow-lg ${levelStyles[a.level]}`}
        >
          <span className="text-sm">{levelIcon[a.level]}</span>
          <p className="text-xs font-medium leading-snug">{a.message}</p>
          <button
            onClick={() => {
              setVisibleIds((prev) => {
                const next = new Set(prev);
                next.delete(a.id);
                return next;
              });
              dismissAlert(a.id);
            }}
            className="ml-1 shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
