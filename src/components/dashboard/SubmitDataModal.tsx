import { useMemo, useRef, useState, type FormEvent } from "react";
import type { Department } from "../../types";
import { Modal } from "../common/Modal";
import { SelectChevron } from "../common/SelectChevron";
import { StatusBadge } from "../kpi/StatusBadge";
import { useDataStore } from "../../data/DataStoreContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../common/ToastContext";
import { computeNextDueDate, getEffectiveStatus } from "../../data/cycleEngine";
import { formatTarget, getStatusForValue } from "../../data/kpiEngine";

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
  const { kpis, cycles, submitKpiValues, submitCycle } = useDataStore();
  const { user } = useAuth();
  const toast = useToast();
  const canOverrideDate = user?.role === "admin" || user?.role === "executive";

  const deptKpis = kpis.filter((k) => k.department === department);
  const openCycles = cycles
    .filter((c) => c.department === department)
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const [cycleId, setCycleId] = useState(openCycles[0]?.cycleId ?? "");
  const selectedCycle = openCycles.find((c) => c.cycleId === cycleId);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(deptKpis.map((k) => [k.id, k.dataAvailable === false ? "" : String(k.currentValue)]))
  );
  const [submitted, setSubmitted] = useState(false);
  // Staged here on Submit, but not written to the store (and so no EWS
  // alert/toast is raised) until the user acknowledges the confirmation
  // screen by closing it - the toast is meant to fire on Done, not on Submit.
  const pendingSubmission = useRef<{
    entries: { kpiId: string; value: number }[];
    cycleId: string;
    nextDate?: string;
  } | null>(null);

  const calculatedNextDate = useMemo(
    () => (selectedCycle ? computeNextDueDate(selectedCycle) : ""),
    [selectedCycle]
  );
  const [nextDateOverride, setNextDateOverride] = useState<string | null>(null);
  const effectiveNextDate = nextDateOverride ?? calculatedNextDate;

  // Section 52/53: the one EWS indicator relevant to this department/dataset,
  // evaluated live from what's currently typed - not a generic list of every
  // indicator in the system, and never asks the user to pick Green/Amber/Red.
  const primaryKpi = deptKpis.find((k) => k.id === selectedCycle?.primaryKpiId);
  const primaryRaw = primaryKpi ? values[primaryKpi.id] : undefined;
  const primaryValue = primaryRaw !== undefined && primaryRaw.trim() !== "" ? Number(primaryRaw) : NaN;
  const primaryStatus =
    primaryKpi && !Number.isNaN(primaryValue) ? getStatusForValue(primaryKpi, primaryValue) : "no_data";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const entries = Object.entries(values)
      .filter(([, raw]) => raw.trim() !== "")
      .map(([kpiId, raw]) => ({ kpiId, value: Number(raw) }))
      .filter(({ value }) => !Number.isNaN(value));
    pendingSubmission.current = { entries, cycleId, nextDate: nextDateOverride ?? undefined };
    setSubmitted(true);
  }

  function handleClose() {
    const pending = pendingSubmission.current;
    if (pending) {
      try {
        const newAlerts = pending.entries.length > 0 ? submitKpiValues(pending.entries) : [];
        if (pending.cycleId) submitCycle(pending.cycleId, user?.name ?? "Unknown", pending.nextDate);
        // One toast for the whole submission - fold in the worst EWS outcome
        // it triggered rather than firing a second, separate risk toast.
        if (newAlerts.some((a) => a.level === "red")) {
          toast.error(`${department} submission saved - Red warning detected`);
        } else if (newAlerts.some((a) => a.level === "amber")) {
          toast.warning(`${department} submission saved - Amber warning detected`);
        } else {
          toast.success(`${department} submission saved successfully`);
        }
      } catch {
        toast.error(`Unable to save ${department} submission`);
      }
      pendingSubmission.current = null;
    }
    setSubmitted(false);
    setNextDateOverride(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Submit ${department} Data`}
      subtitle="Recorded to this demo session only - no backend is connected yet."
    >
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
            ✓
          </div>
          <p className="text-sm font-medium text-ink">Submission recorded.</p>
          <p className="text-xs text-ink-soft/50">
            KPI values, the Early Warning status and the next submission date have all been updated across the
            dashboard - no manual refresh needed.
          </p>
          <button
            onClick={handleClose}
            className="mt-2 min-w-[160px] whitespace-nowrap rounded-full bg-ink px-7 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {selectedCycle && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-ink/[0.04] p-4">
              <MiniField label="Reporting period" value={selectedCycle.reportingPeriod} />
              <MiniField
                label="Next submission"
                value={
                  <div className="flex items-center gap-1.5">
                    <span>{new Date(effectiveNextDate).toLocaleDateString("en-ZA")}</span>
                    {nextDateOverride && (
                      <span className="rounded-full bg-butter/40 px-1.5 py-0.5 text-[9px] font-semibold text-ink">
                        overridden
                      </span>
                    )}
                  </div>
                }
              />
              {canOverrideDate && (
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-ink-soft/40">
                    Override next submission date (optional)
                  </span>
                  <input
                    type="date"
                    value={nextDateOverride ?? calculatedNextDate}
                    onChange={(e) => setNextDateOverride(e.target.value)}
                    className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink"
                  />
                </label>
              )}
            </div>
          )}

          {openCycles.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">This submission fulfils</span>
              <div className="relative">
                <select
                  className="h-[35px] w-full appearance-none rounded-full bg-ink pl-4 pr-9 text-sm font-semibold text-butter hover:bg-ink-soft"
                  value={cycleId}
                  onChange={(e) => setCycleId(e.target.value)}
                >
                  {openCycles.map((c) => (
                    <option key={c.cycleId} value={c.cycleId}>
                      {c.dataset} - {c.reportingPeriod}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </label>
          )}

          {deptKpis.length === 0 ? (
            <p className="text-sm text-ink-soft/50">No KPIs are configured for this department yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Required information</span>
              <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/50 p-3">
                {deptKpis.map((k) => (
                  <label key={k.id} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-soft/60">
                      {k.name}
                      {k.id === selectedCycle?.primaryKpiId && (
                        <span className="ml-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-butter">
                          Early Warning Indicator
                        </span>
                      )}
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
                        className="w-full rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-sm text-ink placeholder:text-ink-soft/30 outline-none focus:border-butter-dark"
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
            </div>
          )}

          {primaryKpi && (
            <div className="rounded-2xl bg-ink p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Early Warning</p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/90">{primaryKpi.name}</p>
                  <p className="text-xs text-white/50">
                    Target {formatTarget(primaryKpi)} · Amber threshold {primaryKpi.amberThreshold}
                    {unitSuffix[primaryKpi.unit]}
                  </p>
                </div>
                <StatusBadge status={primaryStatus} />
              </div>
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
              Submit {department} Data
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MiniField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
