export function MiniBarTrend({ data }: { data: { period: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

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
        return (
          <div key={d.period} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              className={`w-full rounded-full ${isLast ? "bg-butter" : "bg-ink/15"}`}
              style={{ height: `${heightPct}%` }}
            />
            <span className={`text-[10px] ${isLast ? "font-semibold text-ink" : "text-ink-soft/40"}`}>{d.period}</span>
          </div>
        );
      })}
    </div>
  );
}
