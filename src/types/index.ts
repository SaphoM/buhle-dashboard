// Core domain types for the Buhle Farmers Academy Integrated Business Dashboard & EWS.
// NOTE: This models the MVP entity set only. See project docs for the full RFQ entity list.

export type Role =
  | "board"
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

export type RagStatus = "green" | "amber" | "red";

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
