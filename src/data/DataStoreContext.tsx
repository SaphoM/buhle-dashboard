import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Kpi, DataCollectionCycle } from "../types";
import { DEMO_KPIS } from "./demoData";
import { DEMO_CYCLES } from "./cyclesData";

// Lifts the KPI and Cycle demo arrays into React state so a department
// manager's submission (via the Input Modal — Section 47) actually flows
// through: SUBMISSION -> KPI CALCULATION -> dashboards/EWS re-render.
// In-memory only, same as the rest of this demo — no backend yet.

interface DataStoreValue {
  kpis: Kpi[];
  cycles: DataCollectionCycle[];
  /** Records a value for a KPI — clears "no data" and shifts history forward. */
  submitKpiValue: (kpiId: string, newValue: number) => void;
  /** Marks a cycle as submitted by the given user, right now. */
  submitCycle: (cycleId: string, submittedBy: string) => void;
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
      submitCycle: (cycleId, submittedBy) => {
        setCycles((prev) =>
          prev.map((c) =>
            c.cycleId === cycleId
              ? {
                  ...c,
                  status: "Submitted",
                  completionPct: 100,
                  submissionDate: new Date().toISOString().slice(0, 10),
                  submittedBy,
                  validationStatus: "Not Reviewed",
                }
              : c
          )
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
