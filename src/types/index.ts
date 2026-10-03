// Core domain types for the Buhle Farmers Academy Integrated Business Dashboard & EWS.
// NOTE: This models the MVP entity set only. See project docs for the full RFQ entity list.

// Board members are NOT application users (Sept 2026 discovery brief,
// Section 4) - Board reporting is generated from the Executive environment
// instead (see the Board Report template on the Reports page).
export type Role =
  | "executive"
  | "department_manager"
  | "finance"
  | "operations"
  | "farm"
  | "hr"
  | "marketing"
  | "alumni"
  | "admin";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: Department;
}

export type Department =
  | "Executive"
  | "Finance"
  | "Operations"
  | "Commercial Farming"
  | "Human Resources"
  | "Marketing"
  | "Alumni";

// "no_data" is distinct from "green": a KPI with nothing submitted for the
// current period must never read as on-target. See Section 24 of the brief -
// "a dashboard showing Green because no one entered data is unacceptable."
//
// The HR submission specification (Section 25) sharpens this further: missing
// data has several genuinely different causes and they must not be conflated,
// because each implies a different response from management.
//   no_data          - the department has a process but has not submitted yet
//   not_available    - no system/process capable of producing the figure exists
//                      (e.g. Staff Performance before a formal PMS is adopted)
//   threshold_unset  - data was supplied, but no approved threshold exists yet,
//                      so no Green/Amber/Red verdict can honestly be given
export type RagStatus = "green" | "amber" | "red" | "no_data" | "not_available" | "threshold_unset";

export type TrendDirection = "up" | "down" | "flat";

/** A single measured KPI, compared against a configurable target/threshold set. */
export interface Kpi {
  id: string;
  name: string;
  department: Department;
  unit: "currency" | "percent" | "count" | "ratio" | "days";
  currentValue: number;
  previousValue: number;
  target: number;
  // Nullable: a threshold that has not been approved yet must stay unset rather
  // than being silently defaulted to a number, and an unset threshold yields
  // "threshold_unset" - never a fabricated Green (HR spec Sections 5, 13, 16).
  greenThreshold: number | null; // value at/beyond which status is green (direction-aware)
  amberThreshold: number | null; // value at/beyond which status is amber
  // if true, lower values are better (e.g. dropout rate, mortality rate)
  lowerIsBetter?: boolean;
  history: { period: string; value: number }[];
  measurementFrequency: "weekly" | "monthly" | "termly" | "quarterly";
  owner: string;
  insight: string; // rule-based, plain-language explanation - NOT AI-generated
  // Set to false when the department has no system/process capable of
  // producing this figure yet (e.g. HR absenteeism - confirmed via the
  // Finance/HR discovery questionnaires, Sept 2026). Forces "no_data" status
  // regardless of thresholds, instead of a fabricated Green/Amber/Red.
  dataAvailable?: boolean;
  // Why the figure cannot be produced yet. Set alongside dataAvailable:false to
  // distinguish "no system exists" (Not Yet Available) from "not submitted yet".
  notAvailableReason?: string;
  // Section 20: every dashboard KPI states when it was last updated, so a
  // figure nobody has refreshed is visibly stale rather than quietly current.
  lastUpdated?: string; // ISO date
  // Where this figure actually comes from today - shown on the KPI card so
  // nobody mistakes a manually-typed demo number for a live feed.
  sourceSystem?: string;
  // Whether the target/threshold values are Board-approved or still a
  // proposed starting point (Section 19: "do not hard-code weights... label
  // it clearly as a management scoring mechanism").
  thresholdApproval?: "confirmed" | "proposed";
}

export type RiskCategory =
  | "Financial"
  | "Academic"
  | "Farming"
  | "HR"
  | "Marketing"
  | "Alumni";

export type RiskLevel = "green" | "amber" | "red";

export type ActionStatus = "Open" | "In Progress" | "Completed" | "Overdue" | "Cancelled";

export interface CorrectiveAction {
  id: string;
  riskId: string;
  description: string;
  owner: string;
  dueDate: string; // ISO date
  status: ActionStatus;
  createdDate: string;
  /**
   * Section 24: the context a manual action inherits from the risk it answers,
   * so the Corrective Actions page can show *why* the action exists without
   * the reader having to cross-reference the Risk Centre. Auto-staged actions
   * from the EWS leave this unset - the risk itself carries the evidence.
   */
  context?: CorrectiveActionContext;
}

export interface CorrectiveActionContext {
  department: Department;
  kpiName: string;
  currentValue: string;
  target: string;
  ragStatus: string;
  reportingPeriod: string;
  dateDetected: string;
  notes?: string;
}

/** What a person must supply when raising an action against a risk (Section 24). */
export interface CorrectiveActionDraft {
  description: string;
  owner: string;
  dueDate: string;
  notes?: string;
}

export interface Risk {
  id: string;
  category: RiskCategory;
  department: Department;
  name: string;
  description: string;
  kpiId: string;
  currentValue: number;
  target: number;
  threshold: number;
  level: RiskLevel;
  /** The reporting period the underlying figure covers, e.g. "September 2026".
   *  Distinct from dateDetected: a September risk detected in October is not an
   *  October risk, and a corrective action quoting the wrong period misdirects
   *  whoever has to act on it. */
  reportingPeriod?: string;
  /**
   * What kind of problem this risk records. A "data_gap" risk says a figure
   * cannot be produced at all; a "performance" risk says a figure was produced
   * and it is off target. They are not the same problem and must not be
   * updated in place as each other - a gap that has since been closed has to
   * be resolved and replaced, not escalated (HR spec Section 24).
   */
  origin?: "data_gap" | "performance";
  dateDetected: string;
  owner: string;
  recommendedAction: string;
  escalationLevel: "Monitor" | "Department Manager" | "Executive Management" | "Board";
  status: "Active" | "Monitoring" | "Resolved";
  resolutionDate?: string;
}

export interface DataFreshness {
  source: string;
  lastUpdated: string;
  frequency: string;
  status: "live" | "updated_today" | "updated_yesterday" | "needs_attention";
}

// ----------------------------------------------------------------------------
// Cyclical Departmental Data Collection (Sept 2026 discovery brief, Sections
// 47–49). The application must not depend on managers remembering what's
// due - every recurring dataset a department owns is modelled as a cycle
// with its own frequency, reporting period and status, so the system can
// proactively say "your next submission is due" instead of staying silent.
// ----------------------------------------------------------------------------

export type ReportingFrequency =
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Quarterly"
  | "Annually"
  | "Per Event"
  | "Per Cohort"
  | "Per Season"
  | "Per Campaign"
  | "Per Batch"
  | "Per Project Milestone"
  | "6 Months After Graduation"
  | "Annually After Graduation";

export type CycleStatus =
  | "Upcoming"
  | "Open"
  | "In Progress"
  | "Submitted"
  | "Validation Required"
  | "Accepted"
  | "Returned"
  | "Overdue"
  | "Closed";

export interface DataCollectionCycle {
  cycleId: string;
  department: Department;
  dataset: string; // what's being collected, e.g. "Budget Monitor (Actuals)"
  description: string; // what records/information this cycle actually needs
  frequency: ReportingFrequency;
  reportingPeriod: string; // e.g. "September 2026", "Q3 2026", "2026/27 Summer Season"
  startDate: string; // ISO date - when the cycle opens for entry
  dueDate: string; // ISO date
  status: CycleStatus; // manually-set baseline; overdue is derived at render time
  owner: string;
  completionPct: number; // 0-100
  submissionDate?: string;
  submittedBy?: string;
  validationStatus?: "Not Reviewed" | "Reviewed" | "Queried";
  notes?: string;
  // Section 52: the department/dataset-relevant KPI that acts as this
  // cycle's Early Warning Indicator - shown in the submission modal so the
  // manager sees exactly what will be evaluated from what they're about to
  // submit, not a generic list of every indicator in the system.
  primaryKpiId?: string;
  // Section 54: how many days before dueDate the submission EWS turns Amber
  // ("Due Soon"). Admin-configurable per cycle; defaults to 7 if unset.
  dueSoonDays?: number;
  // Section 51: true once an authorised user has manually overridden the
  // calculated next-submission date, so the UI can say so and audit it.
  nextDateOverridden?: boolean;
}

// Section 55: the two warning types must never be conflated. A submission
// warning ("you haven't sent us the data") and a performance warning
// ("the data you sent shows a problem") mean very different things to a
// manager and call for different responses.
export type EwsKind = "submission" | "performance";
