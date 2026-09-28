import type { CycleStatus, DataCollectionCycle, RagStatus, ReportingFrequency } from "../types";

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

export const DEFAULT_DUE_SOON_DAYS = 7;

const CLOSED_OR_IN_FLIGHT: CycleStatus[] = [...CLOSED_STATUSES, ...IN_FLIGHT_STATUSES];

/**
 * Section 55A - Data Submission Early Warning. Deliberately separate from
 * KPI/business-performance status (RagStatus): this answers "did the
 * department send us the data", not "is the number they sent good or bad".
 * Upcoming -> Due Soon -> Due -> Overdue, collapsed to green/amber/red so it
 * reads the same way as everything else on the dashboard.
 */
export function getSubmissionEwsStatus(cycle: DataCollectionCycle, now: Date = new Date()): RagStatus {
  const status = getEffectiveStatus(cycle, now);
  if (status === "Overdue" || status === "Returned") return "red";
  if (CLOSED_OR_IN_FLIGHT.includes(status)) return "green";
  const dueSoonDays = cycle.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS;
  return daysUntilDue(cycle, now) <= dueSoonDays ? "amber" : "green";
}

// Approximate day-lengths for auto-calculating the next submission date
// (Section 51: "calculate the next expected date automatically"). The
// per-learner/per-event frequencies don't have a fixed calendar length, so
// for those we fall back to repeating the same interval as the cycle just
// submitted - an honest approximation, not a real calendar rule.
const FREQUENCY_DAYS: Partial<Record<ReportingFrequency, number>> = {
  Daily: 1,
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
  Annually: 365,
  "6 Months After Graduation": 182,
  "Annually After Graduation": 365,
};

export function computeNextDueDate(cycle: DataCollectionCycle): string {
  const due = new Date(cycle.dueDate);
  const start = new Date(cycle.startDate);
  const intervalDays = FREQUENCY_DAYS[cycle.frequency] ?? Math.max(1, Math.round((due.getTime() - start.getTime()) / 86400000));
  const next = new Date(due.getTime() + intervalDays * 86400000);
  return next.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Best-effort label for the next reporting period - not a real calendar engine. */
export function deriveNextReportingPeriod(cycle: DataCollectionCycle, nextDueIso: string): string {
  const nextDue = new Date(nextDueIso);
  switch (cycle.frequency) {
    case "Monthly":
    case "Weekly":
    case "Daily": {
      const d = new Date(nextDue);
      d.setDate(1);
      return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }
    case "Quarterly": {
      const q = Math.floor(nextDue.getMonth() / 3) + 1;
      return `Q${q} ${nextDue.getFullYear()}`;
    }
    case "Annually":
    case "Annually After Graduation":
      return `${nextDue.getFullYear()}`;
    default: {
      const match = cycle.reportingPeriod.match(/^(.*?)(\d{4})$/);
      if (match) return `${match[1]}${Number(match[2]) + (cycle.frequency === "Per Season" ? 1 : 0)}`;
      return `${cycle.reportingPeriod} (Next)`;
    }
  }
}

export const cycleStatusMeaning: Record<CycleStatus, string> = {
  Upcoming: "Not yet open for entry.",
  Open: "Open for entry - not yet started.",
  "In Progress": "Entry has started but is not yet complete.",
  Submitted: "Submitted - awaiting review.",
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
