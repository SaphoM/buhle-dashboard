import type { Kpi, RagStatus, TrendDirection } from "../types";

/**
 * KPI & Rules Engine (MVP)
 * ------------------------
 * Pure, configurable, rule-based evaluation - no ML, no external calls.
 * Thresholds live on the KPI record itself so they can move to an admin-editable
 * config/table without changing this logic (see Section 9 of the brief).
 */
export function getStatus(kpi: Kpi): RagStatus {
  if (kpi.dataAvailable === false) return "no_data";
  return getStatusForValue(kpi, kpi.currentValue);
}

/**
 * Section 53: "the application must calculate the resulting RAG status" -
 * evaluates an arbitrary candidate value against a KPI's own thresholds,
 * so the submission modal can show a live status as the manager types,
 * before that value has actually been saved as the KPI's currentValue.
 */
export function getStatusForValue(kpi: Kpi, value: number): RagStatus {
  const { greenThreshold, amberThreshold, lowerIsBetter } = kpi;
  if (lowerIsBetter) {
    if (value <= greenThreshold) return "green";
    if (value <= amberThreshold) return "amber";
    return "red";
  }
  if (value >= greenThreshold) return "green";
  if (value >= amberThreshold) return "amber";
  return "red";
}

export function getTrend(kpi: Kpi): TrendDirection {
  const diff = kpi.currentValue - kpi.previousValue;
  const materialChange = Math.abs(diff) / Math.max(Math.abs(kpi.previousValue), 1) > 0.005;
  if (!materialChange) return "flat";
  return diff > 0 ? "up" : "down";
}

export function getVariancePct(kpi: Kpi): number {
  if (kpi.target === 0) return 0;
  return ((kpi.currentValue - kpi.target) / Math.abs(kpi.target)) * 100;
}

export function formatValue(kpi: Kpi): string {
  switch (kpi.unit) {
    case "currency":
      return `R${kpi.currentValue.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${kpi.currentValue.toFixed(1)}%`;
    case "days":
      return `${kpi.currentValue.toFixed(0)} days`;
    case "ratio":
      return kpi.currentValue.toFixed(2);
    default:
      return kpi.currentValue.toLocaleString("en-ZA");
  }
}

export function formatTarget(kpi: Kpi): string {
  switch (kpi.unit) {
    case "currency":
      return `R${kpi.target.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${kpi.target.toFixed(1)}%`;
    case "days":
      return `${kpi.target.toFixed(0)} days`;
    default:
      return kpi.target.toLocaleString("en-ZA");
  }
}

export const statusLabel: Record<RagStatus, string> = {
  green: "On Target",
  amber: "Emerging Risk",
  red: "Critical",
  no_data: "No Data",
};

export const statusMeaning: Record<RagStatus, string> = {
  green: "Continue monitoring and continuous improvement.",
  amber: "Develop a corrective action plan and monitor closely.",
  red: "Escalate to Executive Management / Board - immediate intervention required.",
  no_data: "No figure submitted for this department/period yet - this is a data-quality gap, not a performance result.",
};
