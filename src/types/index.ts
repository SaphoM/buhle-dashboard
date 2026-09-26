// Core domain types for the Buhle Farmers Academy Integrated Business Dashboard & EWS.
// NOTE: This models the MVP entity set only. See project docs for the full RFQ entity list.

// Board members are NOT application users (Sept 2026 discovery brief,
// Section 4) — Board reporting is generated from the Executive environment
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
// current period must never read as on-target. See Section 24 of the brief —
// "a dashboard showing Green because no one entered data is unacceptable."
export type RagStatus = "green" | "amber" | "red" | "no_data";

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
  greenThreshold: number; // value at/beyond which status is green (direction-aware)
  amberThreshold: number; // value at/beyond which status is amber
  // if true, lower values are better (e.g. dropout rate, mortality rate)
  lowerIsBetter?: boolean;
  history: { period: string; value: number }[];
  measurementFrequency: "weekly" | "monthly" | "termly" | "quarterly";
  owner: string;
  insight: string; // rule-based, plain-language explanation — NOT AI-generated
  // Set to false when the department has no system/process capable of
  // producing this figure yet (e.g. HR absenteeism — confirmed via the
  // Finance/HR discovery questionnaires, Sept 2026). Forces "no_data" status
  // regardless of thresholds, instead of a fabricated Green/Amber/Red.
  dataAvailable?: boolean;
  // Where this figure actually comes from today — shown on the KPI card so
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
