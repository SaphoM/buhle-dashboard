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

/**
 * Calendar-based frequencies advance by whole months rather than by a fixed
 * number of days. A monthly cycle due on the 5th is next due on the 5th; adding
 * 30 days instead lands on the 4th and then the 3rd, so the date Finance is
 * told to work to quietly drifts earlier every month.
 */
const CALENDAR_MONTHS: Partial<Record<ReportingFrequency, number>> = {
  Monthly: 1,
  Quarterly: 3,
  Annually: 12,
  "Annually After Graduation": 12,
};

/**
 * Reads a stored YYYY-MM-DD as a LOCAL calendar date. `new Date("2026-10-05")`
 * is UTC midnight, which is the 4th anywhere west of Greenwich - so reading the
 * day back out of local parts, or adding a month to it, can shift the date.
 */
function parseIsoDate(iso: string): Date {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!parts) return new Date(iso);
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function computeNextDueDate(cycle: DataCollectionCycle): string {
  const due = parseIsoDate(cycle.dueDate);
  const start = parseIsoDate(cycle.startDate);
  const months = CALENDAR_MONTHS[cycle.frequency];

  if (months !== undefined) {
    const day = due.getDate();
    const next = new Date(due.getTime());
    next.setMonth(next.getMonth() + months);
    // setMonth overflows past the end of a short month (31 January + 1 month =
    // 3 March), so clamp to the last day of the month actually reached.
    if (next.getDate() < day) next.setDate(0);
    return toIsoDate(next);
  }

  const intervalDays = FREQUENCY_DAYS[cycle.frequency] ?? Math.max(1, Math.round((due.getTime() - start.getTime()) / 86400000));
  const next = new Date(due.getTime() + intervalDays * 86400000);
  return toIsoDate(next);
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

/**
 * The Finance cycle a submission is being written against: the soonest-due cycle
 * that is still open.
 *
 * "Open" excludes everything already finished (Accepted, Closed), everything
 * submitted (Submitted) and everything bounced back for rework (Validation
 * Required) - a report being corrected is a different cycle's problem, and
 * attaching the next period's figures to it would misstate both. The Finance
 * dashboard and the submission modal both resolve their cycle through here, so
 * the figures a manager reads and the figures Finance is editing cannot come
 * from two different cycles.
 */
export function getOpenFinanceCycle(
  cycles: DataCollectionCycle[],
  now: Date = new Date()
): DataCollectionCycle | undefined {
  return cycles
    .filter((c) => c.department === "Finance")
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c, now)))
    .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c, now)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

/**
 * The Operations cycle a submission is being written against: the soonest-due
 * cycle that is still open. Same definition as Finance, so the Operations
 * dashboard and the Operations modal can never read figures from two different
 * cycles.
 */
export function getOpenOperationsCycle(
  cycles: DataCollectionCycle[],
  now: Date = new Date()
): DataCollectionCycle | undefined {
  return cycles
    .filter((c) => c.department === "Operations")
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c, now)))
    .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c, now)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function getOpenMarketingCycle(
  cycles: DataCollectionCycle[],
  now: Date = new Date()
): DataCollectionCycle | undefined {
  return cycles
    .filter((c) => c.department === "Marketing")
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c, now)))
    .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c, now)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function getOpenFarmingCycle(
  cycles: DataCollectionCycle[],
  now: Date = new Date()
): DataCollectionCycle | undefined {
  return cycles
    .filter((c) => c.department === "Commercial Farming")
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c, now)))
    .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c, now)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function getOpenAlumniCycle(
  cycles: DataCollectionCycle[],
  now: Date = new Date()
): DataCollectionCycle | undefined {
  return cycles
    .filter((c) => c.department === "Alumni")
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c, now)))
    .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c, now)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function getOpenAcademyCycle(
  cycles: DataCollectionCycle[],
  now: Date = new Date()
): DataCollectionCycle | undefined {
  return cycles
    .filter((c) => c.department === "Academy")
    .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c, now)))
    .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c, now)))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
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
