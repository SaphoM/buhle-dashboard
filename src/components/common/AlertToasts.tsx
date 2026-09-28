import { useEffect, useRef, useState } from "react";
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
  // Tracks every alert id ever seen so a submission that raises two alerts
  // at once (e.g. a new risk + its auto-created action) shows both, not
  // just alerts[0] — a single "newest" pointer would silently drop the rest.
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const freshAlerts = alerts.filter((a) => !seenIds.current.has(a.id));
    if (freshAlerts.length === 0) return;
    freshAlerts.forEach((a) => seenIds.current.add(a.id));

    setVisibleIds((prev) => {
      const next = new Set(prev);
      freshAlerts.forEach((a) => next.add(a.id));
      return next;
    });

    const timers = freshAlerts.map((a) =>
      setTimeout(() => {
        setVisibleIds((prev) => {
          const next = new Set(prev);
          next.delete(a.id);
          return next;
        });
      }, 8000)
    );
    return () => timers.forEach(clearTimeout);
  }, [alerts]);

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
