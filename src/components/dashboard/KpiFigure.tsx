import type { ReactNode } from "react";
import type { Kpi } from "../../types";
import { TipRow, Tooltip } from "../common/Tooltip";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A headline figure in a department summary table, with its full breakdown on
 * hover.
 *
 * WHY THIS EXISTS ALONGSIDE THE COLUMNS BESIDE IT
 *
 * These tables already print target and variance in their own columns, so the
 * obvious question is why the figure needs a tooltip at all. Three things the
 * row does not show:
 *
 *  1. THE PREVIOUS PERIOD. A single figure with a target says nothing about
 *     direction, and the direction is the part an executive is reading for.
 *  2. WHERE THE NUMBER CAME FROM. The `basis` column explains how a figure is
 *     derived, but not whether anyone has refreshed it. A figure whose source
 *     is three months old and one refreshed this morning are rendered
 *     identically here.
 *  3. THE EXACT VALUE. Currency is rounded for the column; the tip does not.
 *
 * `format` is passed in rather than imported because each department formats
 * currency with its own configured symbol, and a figure rendered with the
 * wrong symbol would be worse than no figure.
 */
export function KpiFigure({
  kpi,
  format,
  children,
}: {
  kpi: Kpi;
  format: (kpi: Kpi) => string;
  children: ReactNode;
}) {
  return (
    <Tooltip
      align="left"
      label={`${kpi.name}: ${format(kpi)}`}
      bubbleWidth="w-72"
      content={
        <span className="flex flex-col gap-1">
          <TipRow label="Current" value={format(kpi)} />
          <TipRow label="Previous" value={format({ ...kpi, currentValue: kpi.previousValue })} />
          {kpi.dataAvailable === false ? <TipRow label="Data available" value="No" /> : null}
          {kpi.sourceSystem ? <TipRow label="Source" value={kpi.sourceSystem} /> : null}
          {kpi.lastUpdated ? <TipRow label="Updated" value={formatTimestamp(kpi.lastUpdated)} /> : null}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}