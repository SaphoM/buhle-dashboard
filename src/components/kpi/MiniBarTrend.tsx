import { TipRow, Tooltip } from "../common/Tooltip";

/**
 * The small bar trend shown under a headline figure.
 *
 * WHY EACH BAR CARRIES ITS OWN VALUE
 *
 * A bar chart states a shape, not a number: it shows that one period was higher
 * than another, and nothing about how much higher. The reader cannot recover the
 * figure behind a bar from its height, so the exact value has to be reachable by
 * pointing at the bar itself rather than by reading an axis, because a chart this
 * size has no room for one. Hovering a bar therefore reports that bar's period
 * and its figure, which is the only place either appears.
 *
 * The column (bar plus its period label) is the hit target rather than the bar
 * alone. The bars are narrow and the gaps between them are wide, so a bar-only
 * target would demand pixel-accurate pointing on a chart that is also the most
 * cramped element on a phone.
 *
 * Placement is chosen per bar so the bubble always grows toward the middle of
 * the chart: the first bars anchor left and the last anchor right, because a
 * centred bubble on an end bar would hang off the edge of its card.
 */
export function MiniBarTrend({
  data,
  format,
}: {
  data: { period: string; value: number }[];
  /** Renders a raw number for display. Passed in rather than derived, because
   *  the caller knows the unit: the same bar chart is used for rand amounts and
   *  for plain counts. */
  format?: (value: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const show = (value: number) => (format ? format(value) : value.toLocaleString("en-ZA"));

  return (
    // items-end (not the default stretch) leaves each column sized to its
    // content, so a bar's `height: X%` has no definite parent height to
    // resolve against and silently collapses to 0. Give each column an
    // explicit height (h-full) and let flex-col + justify-end anchor the
    // bar+label to a shared baseline instead.
    <div className="flex h-28 gap-2.5">
      {data.map((d, i) => {
        const heightPct = 20 + ((d.value - min) / range) * 80;
        const isLast = i === data.length - 1;
        // Grow the bubble inward from whichever end of the chart this bar sits on.
        const third = data.length / 3;
        const align = i < third ? "left" : i >= data.length - third ? "right" : "center";
        return (
          <Tooltip
            key={d.period}
            align={align}
            bubbleWidth="w-max"
            label={`${d.period}: ${show(d.value)}`}
            content={
              <span className="flex flex-col gap-0.5">
                <TipRow label={d.period} value={show(d.value)} />
                <TipRow
                  label={isLast ? "Latest" : "Change vs latest"}
                  value={
                    isLast
                      ? "current period"
                      : `${d.value >= max ? "+" : ""}${(((d.value - max) / (max || 1)) * 100).toFixed(1)}%`
                  }
                />
              </span>
            }
          >
            <div className="flex h-full w-full flex-col items-center justify-end gap-1.5">
              {/* group-hover on the column brightens the bar, so the pointer has
                  a visible target. Without it the reader cannot tell which bar
                  the bubble belongs to. */}
              <div
                className={`w-full rounded-full transition-colors group-hover/tip:bg-butter ${
                  isLast ? "bg-butter" : "bg-ink/15"
                }`}
                style={{ height: `${heightPct}%` }}
              />
              <span className={`text-[10px] ${isLast ? "font-semibold text-ink" : "text-ink-soft/40"}`}>
                {d.period}
              </span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}