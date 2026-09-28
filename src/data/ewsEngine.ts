import type { CorrectiveAction, Department, Kpi, RagStatus, Risk, RiskCategory } from "../types";

/**
 * EWS reaction engine (Section 62, steps 5-7 — "Create/update risks if
 * necessary. Create alerts where necessary."). Until now, crossing a
 * threshold only recoloured a badge; nothing was actually created. This is
 * what turns a submitted value into a real Risk record that shows up in the
 * Risk Centre, dashboards and (eventually) Corrective Actions — the
 * "alert and react" half of the loop, not just the "detect" half.
 */

const RISK_CATEGORY_BY_DEPARTMENT: Record<Department, RiskCategory> = {
  Executive: "Financial",
  Finance: "Financial",
  Operations: "Academic",
  "Commercial Farming": "Farming",
  "Human Resources": "HR",
  Marketing: "Marketing",
  Alumni: "Alumni",
};

/** A risk auto-raised by the EWS engine always uses this id, one per KPI, so
 * a later submission updates the same record instead of duplicating it. */
export function autoRiskId(kpiId: string): string {
  return `risk-auto-${kpiId}`;
}

export interface EwsAlert {
  id: string;
  kind: "created" | "escalated" | "deescalated" | "resolved";
  level: RagStatus;
  message: string;
  timestamp: string;
}

/**
 * Given a KPI's new status, reconciles the risk list: creates a risk on
 * Amber/Red, updates it in place if already open (so escalation Amber->Red
 * is visible, not a silent duplicate), and auto-resolves it if the KPI
 * recovers to Green. Returns the updated risk list plus an alert describing
 * what changed, if anything did.
 */
export function reconcileRiskForKpi(
  kpi: Kpi,
  newStatus: RagStatus,
  prevRisks: Risk[]
): { risks: Risk[]; alert: EwsAlert | null; createdRisk?: Risk } {
  const today = new Date().toISOString().slice(0, 10);
  // Match on kpiId, not a fixed id — several demo risks were hand-authored
  // (risk-5, risk-6, ...) before this engine existed. Matching only the
  // risk-auto-<kpiId> convention would miss those and create a duplicate
  // risk for the same KPI instead of updating the one already there.
  const existing = prevRisks.find((r) => r.kpiId === kpi.id && r.status !== "Resolved");

  if (newStatus === "green" || newStatus === "no_data") {
    if (existing) {
      const resolved: Risk = { ...existing, level: "green", status: "Resolved", resolutionDate: today };
      return {
        risks: prevRisks.map((r) => (r.id === existing.id ? resolved : r)),
        alert: {
          id: `alert-${existing.id}-${Date.now()}`,
          kind: "resolved",
          level: "green",
          message: `Resolved: "${kpi.name}" is back on target — ${kpi.department}.`,
          timestamp: today,
        },
      };
    }
    return { risks: prevRisks, alert: null };
  }

  // Amber or Red.
  const escalationLevel = newStatus === "red" ? "Executive Management" : "Department Manager";
  const description = kpi.insight;
  const recommendedAction = `Review "${kpi.name}" with ${kpi.owner} and agree corrective action.`;

  if (existing) {
    const escalating = existing.level !== newStatus;
    const updated: Risk = {
      ...existing,
      currentValue: kpi.currentValue,
      target: kpi.target,
      threshold: newStatus === "red" ? kpi.amberThreshold : kpi.greenThreshold,
      level: newStatus,
      description,
      escalationLevel,
      status: "Active",
      ...(escalating ? { dateDetected: today } : {}),
    };
    return {
      risks: prevRisks.map((r) => (r.id === existing.id ? updated : r)),
      alert: escalating
        ? {
            id: `alert-${existing.id}-${Date.now()}`,
            kind: "escalated",
            level: newStatus,
            message: `${newStatus === "red" ? "Escalated to Critical" : "Downgraded to Emerging"}: "${kpi.name}" — ${kpi.department}.`,
            timestamp: today,
          }
        : null,
    };
  }

  const id = autoRiskId(kpi.id);
  const created: Risk = {
    id,
    category: RISK_CATEGORY_BY_DEPARTMENT[kpi.department],
    department: kpi.department,
    name: kpi.name,
    description,
    kpiId: kpi.id,
    currentValue: kpi.currentValue,
    target: kpi.target,
    threshold: newStatus === "red" ? kpi.amberThreshold : kpi.greenThreshold,
    level: newStatus,
    dateDetected: today,
    owner: kpi.owner,
    recommendedAction,
    escalationLevel,
    status: "Active",
  };
  return {
    risks: [...prevRisks, created],
    createdRisk: created,
    alert: {
      id: `alert-${id}-${Date.now()}`,
      kind: "created",
      level: newStatus,
      message: `${newStatus === "red" ? "New Critical risk" : "New Emerging risk"}: "${kpi.name}" — ${kpi.department}.`,
      timestamp: today,
    },
  };
}

/**
 * Section 22/62: when a risk is newly raised, don't just leave it sitting
 * there — stage a corrective action automatically so there's always
 * something owned and due, not just a coloured record. Due date follows the
 * same escalation urgency as the risk itself: Red gets 5 working days
 * (~7 calendar days), Amber gets 14.
 */
export function createActionForRisk(risk: Risk): CorrectiveAction {
  const due = new Date(risk.dateDetected);
  due.setDate(due.getDate() + (risk.level === "red" ? 7 : 14));
  return {
    id: `act-auto-${risk.id}`,
    riskId: risk.id,
    description: risk.recommendedAction,
    owner: risk.owner,
    dueDate: due.toISOString().slice(0, 10),
    status: "Open",
    createdDate: risk.dateDetected,
  };
}
