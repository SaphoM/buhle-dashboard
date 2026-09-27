import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Kpi, DataCollectionCycle } from "../types";
import { DEMO_KPIS } from "./demoData";
import { DEMO_CYCLES } from "./cyclesData";
import { computeNextDueDate, deriveNextReportingPeriod } from "./cycleEngine";

// Lifts the KPI and Cycle demo arrays into React state so a department
// manager's submission (via the Input Modal — Section 47) actually flows
// through: SUBMISSION -> KPI CALCULATION -> dashboards/EWS re-render.
// In-memory only, same as the rest of this demo — no backend yet.

interface DataStoreValue {
  kpis: Kpi[];
  cycles: DataCollectionCycle[];
  /** Records a value for a KPI — clears "no data" and shifts history forward. */
  submitKpiValue: (kpiId: string, newValue: number) => void;
  /**
   * Marks a cycle as submitted, then re-evaluates the cycle engine (Section
   * 62): calculates the next submission date and opens the next cycle
   * automatically, so nobody has to manually schedule it.
   */
  submitCycle: (cycleId: string, submittedBy: string, nextDueDateOverride?: string) => void;
  /** Section 51: an authorised user manually overrides a calculated due date. */
  overrideCycleDueDate: (cycleId: string, newDueDate: string) => void;
  /**
   * Section 60 (Early Warning Configuration): admin edits a KPI's own
   * target/threshold — this is the one place "the trigger and limits" are
   * actually set. Marks the KPI's thresholdApproval as "confirmed" since an
   * administrator just explicitly set the value.
   */
  updateKpiThresholds: (
    kpiId: string,
    updates: Partial<Pick<Kpi, "target" | "greenThreshold" | "amberThreshold">>
  ) => void;
}

const DataStoreContext = createContext<DataStoreValue | undefined>(undefined);

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [kpis, setKpis] = useState<Kpi[]>(DEMO_KPIS);
  const [cycles, setCycles] = useState<DataCollectionCycle[]>(DEMO_CYCLES);

  const value = useMemo<DataStoreValue>(
    () => ({
      kpis,
      cycles,
      submitKpiValue: (kpiId, newValue) => {
        setKpis((prev) =>
          prev.map((k) => {
            if (k.id !== kpiId) return k;
            // The submission modal resubmits every field it shows, including
            // ones the user never touched — a no-op re-submit must not shift
            // previousValue/history, or every untouched KPI's trend would
            // flatten to 0% just because it shared a form with an edited one.
            const changed = k.dataAvailable === false || newValue !== k.currentValue;
            if (!changed) return k;
            return {
              ...k,
              previousValue: k.currentValue,
              currentValue: newValue,
              dataAvailable: true,
              history: [...k.history.slice(-5), { period: "Latest", value: newValue }],
            };
          })
        );
      },
      submitCycle: (cycleId, submittedBy, nextDueDateOverride) => {
        setCycles((prev) => {
          const submitted = prev.find((c) => c.cycleId === cycleId);
          const updated = prev.map((c) =>
            c.cycleId === cycleId
              ? {
                  ...c,
                  status: "Submitted" as const,
                  completionPct: 100,
                  submissionDate: new Date().toISOString().slice(0, 10),
                  submittedBy,
                  validationStatus: "Not Reviewed" as const,
                }
              : c
          );
          const alreadySubmitted = ["Submitted", "Validation Required", "Accepted", "Closed"].includes(
            submitted?.status ?? ""
          );
          if (!submitted || alreadySubmitted) return updated;
          // Section 62, steps 10-11: calculate the next submission date and
          // open the next cycle automatically — the manager should never
          // have to schedule their own next submission. Section 51: an
          // authorised user may override that calculated date instead.
          const nextDueDate = nextDueDateOverride || computeNextDueDate(submitted);
          const nextPeriod = deriveNextReportingPeriod(submitted, nextDueDate);
          const nextCycle: DataCollectionCycle = {
            ...submitted,
            cycleId: `${submitted.cycleId}__next-${nextDueDate}`,
            reportingPeriod: nextPeriod,
            startDate: submitted.dueDate,
            dueDate: nextDueDate,
            status: "Upcoming",
            completionPct: 0,
            submissionDate: undefined,
            submittedBy: undefined,
            validationStatus: undefined,
            nextDateOverridden: Boolean(nextDueDateOverride),
          };
          return [...updated, nextCycle];
        });
      },
      overrideCycleDueDate: (cycleId, newDueDate) => {
        setCycles((prev) =>
          prev.map((c) => (c.cycleId === cycleId ? { ...c, dueDate: newDueDate, nextDateOverridden: true } : c))
        );
      },
      updateKpiThresholds: (kpiId, updates) => {
        setKpis((prev) =>
          prev.map((k) => (k.id === kpiId ? { ...k, ...updates, thresholdApproval: "confirmed" } : k))
        );
      },
    }),
    [kpis, cycles]
  );

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}

export function useDataStore() {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore must be used within DataStoreProvider");
  return ctx;
}
