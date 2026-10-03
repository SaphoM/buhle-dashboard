import type { Kpi } from "../../types";
import { formatTarget, formatValue, getStatus, getTrend, getVariancePct } from "../../data/kpiEngine";
import { StatusBadge } from "./StatusBadge";
import { Sparkline } from "./Sparkline";
import { Link } from "react-router-dom";

const trendArrow = { up: "▲", down: "▼", flat: "→" };

export function KpiCard({ kpi, linkTo }: { kpi: Kpi; linkTo?: string }) {
  const status = getStatus(kpi);
  const trend = getTrend(kpi);
  const variance = getVariancePct(kpi);
  const trendGood = kpi.lowerIsBetter ? trend === "down" : trend === "up";

  // Three states carry no performance meaning, and must never be rendered as if
  // they did (HR spec Sections 8, 9 and 24).
  const notSubmitted = status === "no_data";
  const unavailable = status === "not_available";
  const thresholdUnset = status === "threshold_unset";
  // A reported value with no agreed threshold still shows its figure - the data
  // exists - but must not imply pass/fail.
  const noVerdict = notSubmitted || unavailable;

  const placeholderLabel = unavailable
    ? kpi.notAvailableReason ?? "Not yet available"
    : "Not submitted this period";

  const content = (
    <div
      className={`card-surface flex h-full flex-col justify-between rounded-3xl border p-5 shadow-[0_4px_20px_rgba(23,20,15,0.05)] transition hover:shadow-[0_8px_28px_rgba(23,20,15,0.10)] ${
        noVerdict || thresholdUnset ? "border-dashed border-ink/20" : "border-ink/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-ink-soft/70">{kpi.name}</h3>
        <StatusBadge status={status} compact />
      </div>

      {noVerdict ? (
        // Section 24: a KPI with nothing submitted must never imply a
        // performance result - no fabricated number, no trend, no target line.
        <div className="mt-3 flex flex-1 flex-col justify-center py-2">
          <p className="text-sm font-semibold text-ink-soft/50">{placeholderLabel}</p>
          <p className="mt-1 text-xs text-ink-soft/40">{kpi.insight}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-ink">{formatValue(kpi)}</span>
            <span
              className={`text-xs font-semibold ${
                trend === "flat" ? "text-ink-soft/40" : trendGood ? "text-emerald-600" : "text-rose-500"
              }`}
            >
              {trendArrow[trend]} {Math.abs(((kpi.currentValue - kpi.previousValue) / (kpi.previousValue || 1)) * 100).toFixed(1)}%
            </span>
          </div>
          {thresholdUnset ? (
            // Data was reported, but no approved threshold exists yet, so there
            // is no target to compare against and no verdict to give.
            <div className="mt-1 text-xs text-ink-soft/50">
              No threshold set yet. Set one in Administration
            </div>
          ) : (
            <div className="mt-1 text-xs text-ink-soft/50">
              Target: {formatTarget(kpi)} &middot; Variance: {variance > 0 ? "+" : ""}
              {variance.toFixed(1)}%
            </div>
          )}
          <div className="mt-3">
            <Sparkline data={kpi.history} status={status} />
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-ink-soft/60">{kpi.insight}</p>
        </>
      )}

      {kpi.sourceSystem && (
        <p className="mt-2 truncate text-[10px] text-ink-soft/30" title={kpi.sourceSystem}>
          Source: {kpi.sourceSystem}
        </p>
      )}
    </div>
  );

  return linkTo ? (
    <Link to={linkTo} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}
