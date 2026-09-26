import { useState, type FormEvent } from "react";
import type { Department } from "../../types";
import { Modal } from "../common/Modal";
import { useDataStore } from "../../data/DataStoreContext";
import { useAuth } from "../../auth/AuthContext";
import { getEffectiveStatus } from "../../data/cycleEngine";

const unitSuffix: Record<string, string> = {
  currency: "R",
  percent: "%",
  days: "days",
  count: "",
  ratio: "",
};

export function SubmitDataModal({
  department,
  open,
  onClose,
}: {
  department: Department;
  open: boolean;
  onClose: () => void;
}) {
  const { kpis, cycles, submitKpiValue, submitCycle } = useDataStore();
  const { user } = useAuth();

  const deptKpis = kpis.filter((k) => k.department === department);
  const openCycles = cycles
    .filter((c) => c.department === department)
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const [cycleId, setCycleId] = useState(openCycles[0]?.cycleId ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(deptKpis.map((k) => [k.id, k.dataAvailable === false ? "" : String(k.currentValue)]))
  );
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    Object.entries(values).forEach(([kpiId, raw]) => {
      if (raw.trim() === "") return;
      const num = Number(raw);
      if (!Number.isNaN(num)) submitKpiValue(kpiId, num);
    });
    if (cycleId) submitCycle(cycleId, user?.name ?? "Unknown");
    setSubmitted(true);
  }

  function handleClose() {
    setSubmitted(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Submit ${department} Data`}
      subtitle="Recorded to this demo session only — no backend is connected yet."
    >
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
            ✓
          </div>
          <p className="text-sm font-medium text-ink">Submission recorded.</p>
          <p className="text-xs text-ink-soft/50">
            KPI values and the linked cycle have been updated across the dashboard.
          </p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {openCycles.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">This submission fulfils</span>
              <select
                className="h-[45px] w-full rounded-2xl bg-ink px-4 text-sm font-semibold text-butter hover:bg-ink-soft"
                value={cycleId}
                onChange={(e) => setCycleId(e.target.value)}
              >
                {openCycles.map((c) => (
                  <option key={c.cycleId} value={c.cycleId}>
                    {c.dataset} — {c.reportingPeriod}
                  </option>
                ))}
              </select>
            </label>
          )}

          {deptKpis.length === 0 ? (
            <p className="text-sm text-ink-soft/50">No KPIs are configured for this department yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {deptKpis.map((k) => (
                <label key={k.id} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink-soft/60">
                    {k.name}
                    {k.dataAvailable === false && (
                      <span className="ml-1.5 rounded-full bg-butter/40 px-2 py-0.5 text-[10px] font-semibold text-ink">
                        No data yet
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {unitSuffix[k.unit] && k.unit === "currency" && (
                      <span className="text-sm text-ink-soft/50">R</span>
                    )}
                    <input
                      type="number"
                      step="any"
                      placeholder={k.dataAvailable === false ? "Not yet submitted" : undefined}
                      className="w-full rounded-2xl border border-ink/10 bg-white/70 px-4 py-2 text-sm text-ink placeholder:text-ink-soft/30 outline-none focus:border-butter-dark"
                      value={values[k.id] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [k.id]: e.target.value }))}
                    />
                    {unitSuffix[k.unit] && k.unit !== "currency" && (
                      <span className="text-sm text-ink-soft/50">{unitSuffix[k.unit]}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
            >
              Submit
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
