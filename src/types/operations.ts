// ============================================================================
// OPERATIONS reporting domain.
//
// Operations is the department that delivers Buhle's training: who is
// enrolled, who actually turns up, what was delivered, who finished, who left,
// the projects training feeds, and the assets that training runs on.
//
// Design rules held throughout this file, mirroring the Finance module:
//
//  - Underlying RECORDS are captured, not summary percentages. A manager typing
//    "78.4% completion" into a box is asserting a number nobody can trace.
//    Every rate on this dashboard is DERIVED from the records in these seven
//    sections, so it can be explained, audited and recalculated.
//
//  - Every captured figure is nullable. "Not supplied" and "zero" are different
//    facts. A missing figure surfaces as no-data, never as a fabricated Green.
//
//  - Nothing invents a target or a threshold. Those live on the KPI record and
//    are admin-editable. The Operations targets are still TO BE CONFIRMED by
//    Buhle, so this file encodes none of them as constants.
//
//  - Section 5 requires each section to be explicitly markable Not
//    Applicable, for periods in which the activity genuinely did not occur. A
//    term with no projects must not read as a term where every project failed.
//
//  - There is NO approved Operations source system yet. Buhle has no PMS or
//    asset system feeding this data, so provenance matters: every record says
//    whether it was typed or imported, and an import records the file, sheet
//    and mapping used.
//
// Structure note: seven sections, one per reporting area, in submission order.
// They are deliberately NOT grouped. Enrolment, attendance, delivery,
// completion, dropouts, projects and assets are captured by different people on
// different days, and merging them would mean a single incomplete section hides
// five complete ones.
// ============================================================================

import type { Department, ReportingFrequency } from "./index";

export const OPERATIONS_DEPARTMENT = "Operations" as const satisfies Department;

// ---------------------------------------------------------------------------
// Section 5 - the seven Operations reporting areas, in submission order.
// ---------------------------------------------------------------------------

export const OPERATIONS_SECTION_KEYS = [
  "enrolment",
  "attendance",
  "training",
  "completion",
  "dropouts",
  "projects",
  "assets",
] as const;

export type OperationsSectionKey = (typeof OPERATIONS_SECTION_KEYS)[number];

export const OPERATIONS_SECTION_LABELS: Record<OperationsSectionKey, string> = {
  enrolment: "Enrolment",
  attendance: "Attendance",
  training: "Training Delivery",
  completion: "Completion",
  dropouts: "Dropouts",
  projects: "Projects",
  assets: "Assets",
};

/**
 * Per-section completion state in the modal's progress strip.
 *
 * Deliberately there is no "not_available" state. Operations CAN report all
 * seven areas today from its own registers, so a genuinely missing figure is
 * `incomplete` - a data gap - and must not hide behind a capability message.
 */
export type OperationsSectionState =
  | "complete"
  | "incomplete"
  | "attention"
  | "not_applicable"
  | "imported";

/** Shared section envelope: records, commentary, and the explicit N/A switch. */
export interface OperationsSectionEnvelope {
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 6 - Enrolment
// ---------------------------------------------------------------------------

/**
 * Where a learner stands on their course.
 *
 * "Waitlisted" is a real state that is neither enrolled nor dropped out, so it
 * gets its own value rather than being forced into Enrolled or Withdrawn.
 */
export type EnrolmentStatus = "Enrolled" | "In Progress" | "Waitlisted" | "Withdrawn" | "Completed";

export interface EnrolmentRecord {
  id: string;
  /** Learner name or learner number. Free text: Buhle has no learner ID
   *  scheme confirmed yet, so this is whatever the register actually holds. */
  learner: string;
  /** Course or programme, matched against the configured programme list. */
  course: string;
  /** Cohort, intake or term the learner joined in, e.g. "2026 Intake A". */
  cohort: string;
  registrationDate: string;
  status: EnrolmentStatus | "";
  fundingSource: string;
  facilitator: string;
  /** True when this registration arrived during the reporting period rather
   *  than carrying over. Distinguishing a new enrolment from the standing
   *  total is the difference between growth and a static number. */
  isNewThisPeriod: boolean;
  notes: string;
}

export interface OperationsEnrolmentData extends OperationsSectionEnvelope {
  records: EnrolmentRecord[];
}

// ---------------------------------------------------------------------------
// Section 7 - Attendance
// ---------------------------------------------------------------------------

export interface AttendanceRecord {
  id: string;
  course: string;
  cohort: string;
  /** ISO date the session was delivered. */
  sessionDate: string;
  facilitator: string;
  venue: string;
  /** Learners on the register for this session. */
  registered: number | null;
  /** Learners who actually attended. Never typed as a rate: the rate is derived,
   *  because a typed percentage and the register behind it can disagree. */
  attended: number | null;
  /** Sessions a learner cannot attend for a sanctioned reason are recorded
   *  here so they are not counted as non-attendance. */
  excusedAbsences: number | null;
  notes: string;
}

export interface OperationsAttendanceData extends OperationsSectionEnvelope {
  records: AttendanceRecord[];
}

// ---------------------------------------------------------------------------
// Section 8 - Training delivery
// ---------------------------------------------------------------------------

/** How a session was delivered. Affects nothing arithmetically, but is the
 *  first thing an executive asks about a training programme. */
export type DeliveryMode = "Face to Face" | "Online" | "Blended" | "Workplace";

export interface TrainingRecord {
  id: string;
  course: string;
  cohort: string;
  /** Delivery mode, from the configured vocabulary. */
  deliveryMode: DeliveryMode | "";
  facilitator: string;
  startDate: string;
  endDate: string;
  /** Contact hours delivered. Hours, not "sessions": a half-day and a full day
   *  are not the same amount of training. */
  hours: number | null;
  /** Planned learner capacity for the cohort. */
  capacity: number | null;
  /** Learners who started. */
  learnersStarted: number | null;
  notes: string;
}

export interface OperationsTrainingData extends OperationsSectionEnvelope {
  records: TrainingRecord[];
}

// ---------------------------------------------------------------------------
// Section 9 - Completion
// ---------------------------------------------------------------------------

export type CompletionOutcome = "Completed" | "Partially Completed" | "Not Completed" | "Withdrawn";

export interface CompletionRecord {
  id: string;
  learner: string;
  course: string;
  cohort: string;
  /** ISO date the outcome was recorded. */
  completionDate: string;
  outcome: CompletionOutcome | "";
  /** Assessment outcome where one exists, e.g. "Pass", "Distinction", "C". */
  assessmentResult: string;
  /** Whether the learner was certified. */
  certified: boolean;
  notes: string;
}

export interface OperationsCompletionData extends OperationsSectionEnvelope {
  records: CompletionRecord[];
}

// ---------------------------------------------------------------------------
// Section 10 - Dropouts
// ---------------------------------------------------------------------------

/**
 * Why a learner left.
 *
 * A configured vocabulary rather than free text, because the whole point of
 * tracking dropouts is comparing reasons across terms. Free text would produce
 * "left because of work", "work" and "Employment" as three different reasons.
 */
export type DropoutReasonCategory =
  | "Financial"
  | "Employment"
  | "Academic"
  | "Family / caring"
  | "Health"
  | "Relocation"
  | "Course not suitable"
  | "Other";

export interface DropoutRecord {
  id: string;
  learner: string;
  course: string;
  cohort: string;
  /** ISO date the learner withdrew. */
  withdrawalDate: string;
  /** Configured reason category. */
  reason: DropoutReasonCategory | "";
  /** Free-text detail behind the category. */
  reasonDetail: string;
  /** Weeks of the course the learner had completed when they left. Lets a
   *  short course and a long course be compared fairly. */
  weeksCompleted: number | null;
  /** Whether the learner was offered and accepted a place on a later cohort.
   *  A dropout that became a re-enrolment is a programme problem, not a lost
   *  learner, and the two must not be counted alike. */
  reEnrolled: boolean;
  followUpOwner: string;
  notes: string;
}

export interface OperationsDropoutsData extends OperationsSectionEnvelope {
  records: DropoutRecord[];
}

// ---------------------------------------------------------------------------
// Section 11 - Projects
// ---------------------------------------------------------------------------

export type ProjectType = "Enterprise" | "Partner" | "Internal";

/** Delivery health of a project. Drives the on-schedule rate. */
export type ProjectStatus = "Not Started" | "On Track" | "At Risk" | "Delayed" | "Completed";

export interface ProjectRecord {
  id: string;
  projectName: string;
  type: ProjectType | "";
  status: ProjectStatus | "";
  startDate: string;
  /** Planned completion. Compared with actualCompletionDate to see slippage. */
  plannedEndDate: string;
  actualEndDate: string;
  /** ISO date the status was last reviewed, so "On Track" has an age. */
  lastReviewed: string;
  /** How many learners the project is expected to reach. */
  beneficiaries: number | null;
  /** Course or programme the project delivers, linking it to the training
   *  sections. Blank when the project is not a training project. */
  linkedCourse: string;
  lead: string;
  notes: string;
}

export interface OperationsProjectsData extends OperationsSectionEnvelope {
  records: ProjectRecord[];
}

// ---------------------------------------------------------------------------
// Section 12 - Assets
// ---------------------------------------------------------------------------

export type AssetStatus = "In Use" | "Idle" | "Maintenance" | "Disposed" | "Not Yet In Service";

export interface AssetRecord {
  id: string;
  assetName: string;
  /** Serial, tag or registration number. The thing that identifies the physical
   *  item on a Buhle register. */
  assetTag: string;
  /** Configured asset category. */
  category: string;
  location: string;
  /** ISO acquisition date. Drives age and the depreciation conversation. */
  acquisitionDate: string;
  /** Replacement value in rand. Null when the register does not carry a value;
   *  the application never assumes one. */
  replacementValue: number | null;
  condition: string;
  status: AssetStatus | "";
  /** Person or cost centre responsible for the asset. */
  custodian: string;
  /** ISO disposal date. Required whenever status is Disposed. */
  disposalDate: string;
  notes: string;
}

export interface OperationsAssetsData extends OperationsSectionEnvelope {
  records: AssetRecord[];
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

export type OperationsReportStatus = "Draft" | "Submitted";

export interface OperationsReport {
  id: string;
  cycleId: string;
  department: typeof OPERATIONS_DEPARTMENT;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  enrolment: OperationsEnrolmentData;
  attendance: OperationsAttendanceData;
  training: OperationsTrainingData;
  completion: OperationsCompletionData;
  dropouts: OperationsDropoutsData;
  projects: OperationsProjectsData;
  assets: OperationsAssetsData;
  commentary: OperationsCommentary;
  dataSource: OperationsDataSource;
  /** Provenance for each import run that fed this report. */
  importRuns: OperationsImportRun[];
  status: OperationsReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  /** KPI values derived from this submission - the audit record of what was
   *  calculated. */
  computedKpis: Record<string, number | null>;
}

/**
 * Commentary, with a slot per reporting area so a Head of Training can explain
 * each section rather than one overall paragraph that hides the problem area.
 */
export interface OperationsCommentary {
  overall: string;
  keyIssue: string;
  keyAchievement: string;
  enrolmentCommentary: string;
  attendanceCommentary: string;
  trainingCommentary: string;
  completionCommentary: string;
  dropoutsCommentary: string;
  projectsCommentary: string;
  assetsCommentary: string;
  /** Per-KPI explanation, keyed by KPI id, for Amber/Red figures. */
  kpiExplanations: Record<string, string>;
}

/**
 * "Not Submitted" is the honest initial state. A report that has never been
 * typed or imported must not present as a manual entry, because a reader would
 * assume somebody entered the figures deliberately.
 */
export type OperationsSourceKind = "Manual Entry" | "Workbook Import" | "Not Submitted";

// ---------------------------------------------------------------------------
// Provenance and import
// ---------------------------------------------------------------------------

export interface OperationsDataSource {
  kind: OperationsSourceKind;
  /** Original filename for imported figures. */
  fileName?: string;
  /** Which sheet of that file the figures came from. */
  sheetName?: string;
  importedAt?: string;
  importedBy?: string;
  /** Set when an import was attempted and failed. The section then reports the
   *  failure rather than reading as empty-and-fine. */
  failedAt?: string;
  failureReason?: string;
}

export type OperationsImportStatus = "Validated" | "Imported" | "Failed";

export interface OperationsImportRun {
  id: string;
  /** The section this run filled. Without it, importing Attendance would appear
   *  to vouch for Enrolment too. */
  target: OperationsSectionKey;
  fileName: string;
  importedAt: string;
  importedBy: string;
  sheetName: string;
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  /** Column mapping actually used, so a later re-import can be reproduced. */
  mapping: Record<string, string>;
  status: OperationsImportStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Config - cadence and vocabularies are configuration, never constants
// ---------------------------------------------------------------------------

export interface OperationsConfig {
  /** Cadence of the Operations reporting cycle. Operations reports per TERM by
   *  default rather than per month, because enrolment, completion and dropout
   *  are term-level facts; a monthly cycle would report the same term four
   *  times and make a completion rate look like it moved when it did not. */
  reportingFrequency: ReportingFrequency;
  /** Currency symbol for asset values. Comes from configuration. */
  currencySymbol: string;
  /** The approved course / programme list. */
  programmes: string[];
  /** Approved delivery modes. */
  deliveryModes: DeliveryMode[];
  /** Approved completion outcomes. */
  completionOutcomes: CompletionOutcome[];
  /** Approved dropout reason categories. */
  dropoutReasons: DropoutReasonCategory[];
  /** Approved project types. */
  projectTypes: ProjectType[];
  /** Approved asset categories. */
  assetCategories: string[];
  /** Attendance bands, as a present / absent count, for reporting only. The
   *  rate itself is derived, never typed. */
  attendanceBands: { label: string; minPct: number }[];
  /** Whether a dropout who later re-enrols counts against the dropout rate.
   *  Held here because the two conventions produce materially different rates
   *  and this is a policy decision, not an arithmetic one. */
  reEnrolmentCountsAsDropout: boolean;
}