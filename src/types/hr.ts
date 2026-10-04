// ============================================================================
// HUMAN RESOURCES reporting domain.
//
// The HR submission is the HR department's monthly management process, not a
// single flat form (spec Section 28). It is modelled as six sections that all
// resolve to a small set of authoritative KPIs, so the HR manager captures the
// underlying records once and every KPI, warning, risk and action downstream is
// derived from that one submission.
//
// Design rules held throughout this file:
//  - Employee Code is the single employee identifier (Section 26). Employee
//    records are held once in the registry below; attendance, leave, training
//    and movement records reference a code rather than restating a person.
//  - Every captured figure is nullable. "Not supplied" and "zero" are
//    genuinely different and must never be collapsed (Section 25).
//  - Nothing here invents a threshold or a policy value. Configured thresholds
//    live on the KPI record, admin-editable in Administration.
// ============================================================================

import type { Department, ReportingFrequency } from "./index";

export const HR_DEPARTMENT = "Human Resources" as const satisfies Department;

// ---------------------------------------------------------------------------
// Section 6 of the submission: the six HR reporting areas.
// ---------------------------------------------------------------------------

export const HR_SECTION_KEYS = [
  "attendance",
  "leave",
  "performance",
  "turnover",
  "skills",
  "vacancies",
] as const;

export type HrSectionKey = (typeof HR_SECTION_KEYS)[number];

export const HR_SECTION_LABELS: Record<HrSectionKey, string> = {
  attendance: "Attendance",
  leave: "Leave",
  performance: "Performance",
  turnover: "Turnover",
  skills: "Skills",
  vacancies: "Vacancies",
};

/**
 * Per-section completion state shown in the modal's progress strip.
 *  complete        - every required field supplied and internally consistent
 *  incomplete      - at least one required field missing
 *  attention       - complete, but the derived KPI/warning needs attention
 *  not_available   - cannot be captured: no supporting system/process exists yet
 *  not_applicable  - explicitly marked N/A by the department for this period
 */
export type HrSectionState = "complete" | "incomplete" | "attention" | "not_available" | "not_applicable";

// ---------------------------------------------------------------------------
// Employee registry (Section 26)
// ---------------------------------------------------------------------------

export type EmploymentType = "Permanent" | "Contract" | "Part-time" | "Intern" | "Learner";

export interface Employee {
  employeeCode: string;
  fullName: string;
  department: Department;
  position: string;
  employmentType: EmploymentType;
  startDate: string; // ISO date
  exitDate?: string; // ISO date - set when the employee leaves
}

// ---------------------------------------------------------------------------
// Section 1 - Attendance
// ---------------------------------------------------------------------------

/**
 * Attendance is captured as raw day counts only. The absenteeism rate is
 * derived by hrEngine - HR never types the percentage (Section 4).
 */
export interface HrAttendanceData {
  // Workforce snapshot
  totalEmployees: number | null;
  activeEmployees: number | null;
  newEmployees: number | null;
  employeesLeft: number | null;
  // Attendance
  workingDays: number | null;
  expectedEmployeeDays: number | null;
  daysPresent: number | null;
  daysAbsent: number | null;
  daysAbsentApproved: number | null;
  daysAbsentUnapproved: number | null;
  sickLeaveDays: number | null;
  unauthorisedAbsenceDays: number | null;
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 2 - Leave
// ---------------------------------------------------------------------------

export const LEAVE_TYPES = [
  "Annual",
  "Sick",
  "Family Responsibility",
  "Maternity / Parental",
  "Study",
  "Unpaid",
  "Other Approved",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

export interface LeaveLine {
  employees: number | null;
  days: number | null;
  previousPeriodDays: number | null;
}

export interface HrLeaveData {
  lines: Record<LeaveType, LeaveLine>;
  requestsSubmitted: number | null;
  requestsApproved: number | null;
  requestsPending: number | null;
  requestsDeclined: number | null;
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 3 - Performance
// ---------------------------------------------------------------------------

/**
 * IMPORTANT (Sections 8, 9 and test 5): Staff Performance cannot be reported
 * until Buhle introduces a formal performance-management system. `systemActive`
 * is therefore an explicit, admin-set switch rather than an inference from
 * whether fields happen to be filled in. While it is false the engine reports
 * "Not Yet Available" and refuses to derive a performance KPI - it must never
 * show a fabricated Green.
 */
export interface HrPerformanceData {
  systemActive: boolean;
  dueForReview: number | null;
  reviewsCompleted: number | null;
  reviewsOutstanding: number | null;
  meetingExpectations: number | null;
  requiringDevelopment: number | null;
  requiringIntervention: number | null;
  reviewPeriod: string;
  reviewStatus: string;
  followUpRequired: boolean;
  commentary: string;
}

// ---------------------------------------------------------------------------
// Section 4 - Turnover / employee movements
// ---------------------------------------------------------------------------

export const EXIT_REASONS = [
  "Resignation",
  "Dismissal",
  "Retirement",
  "Contract Ended",
  "Other",
] as const;

export type ExitReason = (typeof EXIT_REASONS)[number];

export interface NewHire {
  employeeCode: string;
  department: Department;
  position: string;
  startDate: string; // ISO date
  employmentType: EmploymentType;
}

export interface ExitRecord {
  employeeCode: string;
  department: Department;
  position: string;
  exitDate: string; // ISO date
  reason: ExitReason;
  exitInterviewCompleted: boolean;
}

export interface HrTurnoverData {
  newHires: NewHire[];
  exits: ExitRecord[];
  /** Average headcount over the period - the denominator for turnover. */
  averageHeadcount: number | null;
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 5 - Skills & Training
// ---------------------------------------------------------------------------

export type TrainingStatus = "Planned" | "In Progress" | "Completed" | "Cancelled";

export interface TrainingProgramme {
  id: string;
  programme: string;
  provider: string;
  enrolled: number | null;
  completed: number | null;
  startDate: string;
  completionDate: string;
  status: TrainingStatus;
}

export type SkillPriority = "Low" | "Medium" | "High" | "Critical";

export interface SkillsGap {
  id: string;
  department: Department;
  role: string;
  requiredSkill: string;
  currentLevel: string;
  requiredLevel: string;
  priority: SkillPriority;
  developmentAction: string;
  owner: string;
  targetDate: string; // ISO date
}

export interface HrSkillsData {
  employeesRequiringTraining: number | null;
  programmes: TrainingProgramme[];
  gaps: SkillsGap[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 6 - Vacancies / Recruitment
// ---------------------------------------------------------------------------

export type VacancyStatus = "Open" | "Shortlisting" | "Interviewing" | "Offer Out" | "Filled" | "Closed";

export type VacancyPriority = "Low" | "Medium" | "High" | "Critical";

/**
 * One vacancy carries the whole recruitment pipeline and its own dates, so
 * Time to Fill is a date subtraction rather than a typed number (Section 15).
 */
export interface Vacancy {
  id: string;
  vacancyId: string;
  position: string;
  department: Department;
  location: string;
  hiringManager: string;
  dateOpened: string; // ISO date
  requiredStartDate: string; // ISO date
  employmentType: EmploymentType;
  status: VacancyStatus;
  priority: VacancyPriority;
  reasonForVacancy: string;
  budgetedSalary: number | null;
  // Pipeline
  applicationsReceived: number | null;
  candidatesShortlisted: number | null;
  interviewsConducted: number | null;
  offersMade: number | null;
  offersAccepted: number | null;
  offersDeclined: number | null;
  // Recruitment dates
  shortlistingDate: string;
  interviewDate: string;
  offerDate: string;
  acceptanceDate: string;
  filledDate: string;
  // Cost
  recruitmentCost: number | null;
  hiringRelatedCosts: number | null;
}

export interface HrVacancyData {
  vacancies: Vacancy[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Commentary (Section 23)
// ---------------------------------------------------------------------------

export interface HrCommentary {
  overall: string;
  keyIssue: string;
  keyAchievement: string;
  workforceConcern: string;
  actionRequired: string;
  supportRequired: string;
  /**
   * Per-KPI explanation, prompted whenever a KPI lands Amber or Red: "Why is
   * absenteeism above threshold?" keyed by KPI id.
   */
  kpiExplanations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

export type HrReportStatus = "Draft" | "Submitted";

export interface HrReport {
  id: string;
  cycleId: string;
  department: typeof HR_DEPARTMENT;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string; // ISO date
  dueDate: string; // ISO date
  attendance: HrAttendanceData;
  leave: HrLeaveData;
  performance: HrPerformanceData;
  turnover: HrTurnoverData;
  skills: HrSkillsData;
  vacancies: HrVacancyData;
  commentary: HrCommentary;
  status: HrReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  /** KPI values derived from this submission - the audit record of what was calculated. */
  computedKpis: Record<string, number | null>;
}

// ---------------------------------------------------------------------------
// Config (Section 2 - frequency must be configurable, never hard-coded)
// ---------------------------------------------------------------------------

export interface HrConfig {
  /** Cadence of the HR reporting cycle. Drives next-due-date calculation. */
  reportingFrequency: ReportingFrequency;
  /**
   * Whether a formal performance-management system is in place. Until this is
   * switched on (deliberately, by an administrator) the Performance section
   * reports "Not Yet Available" and no Staff Performance KPI is derived.
   */
  performanceManagementActive: boolean;
  /** Headcount used to prorate expected employee-days when HR omits the figure. */
  standardWorkingDaysPerMonth: number;
}

// ---------------------------------------------------------------------------
// Audit log (Section 19, step 12)
// ---------------------------------------------------------------------------

export type AuditAction =
  | "hr_draft_saved"
  | "hr_report_submitted"
  | "hr_config_updated"
  | "kpi_threshold_updated"
  | "cycle_due_date_overridden"
  | "action_created"
  | "action_status_advanced"
  | "finance_draft_saved"
  | "finance_report_submitted"
  | "finance_config_updated"
  | "finance_import_completed"
  | "finance_import_failed"
  | "operations_draft_saved"
  | "operations_report_submitted"
  | "operations_config_updated"
  | "operations_import_completed"
  | "operations_import_failed";

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO datetime
  actor: string;
  action: AuditAction;
  department: Department;
  summary: string;
  details?: Record<string, string | number | null>;
}