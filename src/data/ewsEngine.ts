import type { CorrectiveAction, Department, Kpi, RagStatus, Risk, RiskCategory, RiskLevel } from "../types";

/**
 * EWS reaction engine (Section 62, steps 5-7 - "Create/update risks if
 * necessary. Create alerts where necessary."). Until now, crossing a
 * threshold only recoloured a badge; nothing was actually created. This is
 * what turns a submitted value into a real Risk record that shows up in the
 * Risk Centre, dashboards and (eventually) Corrective Actions - the
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

/**
 * The threshold the KPI actually breached, recorded on the risk as evidence.
 * getStatusForValue only ever returns amber/red once both thresholds are set,
 * so this is non-null in practice; the target fallback keeps the type honest
 * without inventing a limit of its own.
 */
function breachedThreshold(kpi: Kpi, level: RiskLevel): number {
  return (level === "red" ? kpi.amberThreshold : kpi.greenThreshold) ?? kpi.target;
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
  prevRisks: Risk[],
  /** The period the submitted figure covers, when the submission knows it. */
  reportingPeriod?: string
): { risks: Risk[]; alert: EwsAlert | null; createdRisk?: Risk } {
  const today = new Date().toISOString().slice(0, 10);
  // Match on kpiId, not a fixed id - several demo risks were hand-authored
  // (risk-5, risk-6, ...) before this engine existed. Matching only the
  // risk-auto-<kpiId> convention would miss those and create a duplicate
  // risk for the same KPI instead of updating the one already there.
  const existing = prevRisks.find((r) => r.kpiId === kpi.id && r.status !== "Resolved");

  // Only a genuine Amber/Red verdict is a risk. "no_data", "not_available" and
  // "threshold_unset" are all statements about what we *don't* know, not about
  // performance, so none of them may raise or keep a risk alive - and if a KPI
  // previously did breach a threshold, any of these states resolves it rather
  // than leaving a stale risk on the board (HR spec Section 25).
  if (newStatus !== "amber" && newStatus !== "red") {
    // A data-gap risk is not a performance risk that has recovered: the figure
    // still cannot be produced. Closing it here would assert a recovery that
    // never happened, so it is left open and untouched.
    if (existing?.origin === "data_gap") return { risks: prevRisks, alert: null };
    if (existing) {
      const resolved: Risk = { ...existing, level: "green", status: "Resolved", resolutionDate: today };
      // Wording matters: the risk only closes as "back on target" when the KPI
      // actually returned to green. If it closed because the figure became
      // unavailable or the threshold was removed, say that instead - otherwise
      // the audit trail claims a performance recovery that never happened.
      const message =
        newStatus === "green"
          ? `Resolved: "${kpi.name}" is back on target - ${kpi.department}.`
          : `Closed: "${kpi.name}" no longer has an assessable status (${newStatus.replace("_", " ")}) - ${kpi.department}.`;
      return {
        risks: prevRisks.map((r) => (r.id === existing.id ? resolved : r)),
        alert: {
          id: `alert-${existing.id}-${Date.now()}`,
          kind: "resolved",
          level: "green",
          message,
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

  if (existing && existing.origin !== "data_gap") {
    const escalating = existing.level !== newStatus;
    const updated: Risk = {
      ...existing,
      currentValue: kpi.currentValue,
      target: kpi.target,
      threshold: breachedThreshold(kpi, newStatus),
      level: newStatus,
      description,
      escalationLevel,
      status: "Active",
      // A risk that keeps the period of the figure it is about cannot drift
      // out of step with the KPI it tracks.
      reportingPeriod: reportingPeriod ?? existing.reportingPeriod,
      ...(escalating ? { dateDetected: today } : {}),
    };
    return {
      risks: prevRisks.map((r) => (r.id === existing.id ? updated : r)),
      alert: escalating
        ? {
            id: `alert-${existing.id}-${Date.now()}`,
            kind: "escalated",
            level: newStatus,
            message: `${newStatus === "red" ? "Escalated to Critical" : "Downgraded to Emerging"}: "${kpi.name}" - ${kpi.department}.`,
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
    threshold: breachedThreshold(kpi, newStatus),
    level: newStatus,
    origin: "performance",
    reportingPeriod,
    dateDetected: today,
    owner: kpi.owner,
    recommendedAction,
    escalationLevel,
    status: "Active",
  };
  // The gap has been closed by this very submission, so the data-gap risk is
  // superseded: it is resolved as "closed" rather than as "recovered", because
  // no figure ever existed to recover. Escalating it in place would leave the
  // Risk Centre claiming absenteeism is untracked on the same screen that
  // shows the figure that proves it is tracked.
  const superseded = existing?.origin === "data_gap";
  const resolvedList = superseded
    ? prevRisks.map((r) =>
        r.id === existing.id
          ? {
              ...r,
              status: "Resolved" as const,
              resolutionDate: today,
              level: "green" as const,
              notes: `Closed: "${kpi.name}" is now reported by the ${kpi.department} submission, so the data gap this risk recorded no longer applies.`,
            }
          : r
      )
    : prevRisks;
  return {
    risks: [...resolvedList, created],
    createdRisk: created,
    alert: {
      id: `alert-${id}-${Date.now()}`,
      kind: "created",
      level: newStatus,
      message: `${newStatus === "red" ? "New Critical risk" : "New Emerging risk"}: "${kpi.name}" - ${kpi.department}.`,
      timestamp: today,
    },
  };
}

/**
 * Section 22/62: when a risk is newly raised, don't just leave it sitting
 * there - stage a corrective action automatically so there's always
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
    // Section 19/24: the action has to explain itself without anyone having to
    // go and look the risk up, so the KPI, value, verdict and period travel
    // with it. An automatically staged action carries exactly as much context
    // as one an executive raises by hand.
    context: {
      department: risk.department,
      kpiName: risk.name,
      currentValue: String(risk.currentValue),
      target: String(risk.target),
      ragStatus: risk.level,
      // Falls back to the detection month only when nothing recorded the period.
      reportingPeriod:
        risk.reportingPeriod ??
        new Date(risk.dateDetected).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
      dateDetected: risk.dateDetected,
    },
  };
}
