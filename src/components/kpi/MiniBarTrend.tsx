export function MiniBarTrend({ data }: { data: { period: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  return (
    <div className="flex h-28 items-end gap-2.5">
      {data.map((d, i) => {
        const heightPct = 20 + ((d.value - min) / range) * 80;
        const isLast = i === data.length - 1;
        return (
          <div key={d.period} className="flex flex-1 flex-col items-center gap-1.5">
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
