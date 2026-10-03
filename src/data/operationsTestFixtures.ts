import { createBlankOperationsReport, DEFAULT_OPERATIONS_CONFIG } from "./operationsSeed";
import type { OperationsReport } from "../types/operations";

export const OPS_CONFIG = DEFAULT_OPERATIONS_CONFIG;

export function blankOperationsReport(): OperationsReport {
  return createBlankOperationsReport({
    cycleId: "cyc-operations-2026-t3",
    reportingPeriod: "Term 3 2026",
    frequency: OPS_CONFIG.reportingFrequency,
    startDate: "2026-07-01",
    dueDate: "2026-09-30",
    config: OPS_CONFIG,
  });
}
