import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { RagStatus } from "../../types";

const stroke: Record<RagStatus, string> = {
  green: "#059669",
  amber: "#d97706",
  red: "#e11d48",
};

export function Sparkline({ data, status }: { data: { period: string; value: number }[]; status: RagStatus }) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={["auto", "auto"]} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke[status]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
