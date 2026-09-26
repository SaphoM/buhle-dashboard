import type { CycleStatus, DataCollectionCycle } from "../types";

/**
 * Data Collection Cycle engine (Sections 47-49 of the discovery brief).
 * A cycle's stored `status` is the last known state; "Overdue" is derived
 * here rather than hand-maintained, so a cycle that simply falls past its
 * due date without being submitted is caught automatically.
 */
const CLOSED_STATUSES: CycleStatus[] = ["Accepted", "Closed"];
const IN_FLIGHT_STATUSES: CycleStatus[] = ["Submitted", "Validation Required", "Returned"];

export function getEffectiveStatus(cycle: DataCollectionCycle, now: Date = new Date()): CycleStatus {
  if (CLOSED_STATUSES.includes(cycle.status)) return cycle.status;
  if (IN_FLIGHT_STATUSES.includes(cycle.status)) return cycle.status;
  const due = new Date(cycle.dueDate);
  if (now.getTime() > due.getTime()) return "Overdue";
  return cycle.status;
}

export function daysUntilDue(cycle: DataCollectionCycle, now: Date = new Date()): number {
  const due = new Date(cycle.dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
}

export const cycleStatusMeaning: Record<CycleStatus, string> = {
  Upcoming: "Not yet open for entry.",
  Open: "Open for entry — not yet started.",
  "In Progress": "Entry has started but is not yet complete.",
  Submitted: "Submitted — awaiting review.",
  "Validation Required": "Submitted but flagged for review before acceptance.",
  Accepted: "Reviewed and accepted into the central data model.",
  Returned: "Sent back to the department for correction.",
  Overdue: "Past its due date and not yet submitted.",
  Closed: "Cycle closed.",
};

const badgeStyles: Record<CycleStatus, string> = {
  Upcoming: "bg-white text-ink-soft/50 border-ink/10",
  Open: "bg-white text-ink-soft border-ink/15",
  "In Progress": "bg-butter/30 text-ink border-butter-dark/40",
  Submitted: "bg-butter/30 text-ink border-butter-dark/40",
  "Validation Required": "bg-butter text-ink border-butter-dark",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Returned: "bg-ink text-butter border-ink",
  Overdue: "bg-ink text-butter border-ink",
  Closed: "bg-white text-ink-soft/40 border-ink/10",
};

export function cycleBadgeStyle(status: CycleStatus): string {
  return badgeStyles[status];
}
