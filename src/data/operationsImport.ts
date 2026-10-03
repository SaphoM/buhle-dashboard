import {
  blankAssetRecord,
  blankAttendanceRecord,
  blankCompletionRecord,
  blankDropoutRecord,
  blankEnrolmentRecord,
  blankProjectRecord,
  blankTrainingRecord,
} from "./operationsSeed";
import { buildRows, readWorkbook, readWorkbookWithNames, suggestMapping } from "./workbookImport";
import type { ColumnMapping, FieldSpec, ParsedRow, RowIssue, WorkbookSheet } from "./workbookImport";
import {
  type AssetRecord,
  type AssetStatus,
  type AttendanceRecord,
  type CompletionOutcome,
  type CompletionRecord,
  type DeliveryMode,
  type DropoutReasonCategory,
  type DropoutRecord,
  type EnrolmentRecord,
  type EnrolmentStatus,
  type OperationsImportRun,
  type OperationsConfig,
  type OperationsReport,
  type OperationsSectionKey,
  type ProjectRecord,
  type ProjectStatus,
  type ProjectType,
  type TrainingRecord,
} from "../types/operations";

// The generic reading machinery lives in workbookImport because Finance uses the
// identical rules. These re-exports keep the Operations import module's public
// surface self-contained, so the wizard imports from one place as Finance does.
export { readWorkbook, readWorkbookWithNames, suggestMapping };
export type { WorkbookSheet, ColumnMapping, FieldSpec, RowIssue, ParsedRow };

export type OperationsImportTarget = OperationsSectionKey;

export interface OperationsImportPreview {
  target: OperationsImportTarget;
  sheetName: string;
  rows: ParsedRow[];
  acceptable: ParsedRow[];
  rejected: ParsedRow[];
  mapping: ColumnMapping;
  unmappedFields: string[];
  headers: string[];
}

const ENROLMENT_STATUS_VALUES: readonly EnrolmentStatus[] = [
  "Enrolled",
  "In Progress",
  "Waitlisted",
  "Withdrawn",
  "Completed",
];
const DELIVERY_MODE_VALUES: readonly DeliveryMode[] = ["Face to Face", "Online", "Blended", "Workplace"];
const COMPLETION_OUTCOME_VALUES: readonly CompletionOutcome[] = [
  "Completed",
  "Partially Completed",
  "Not Completed",
  "Withdrawn",
];
const DROPOUT_REASON_VALUES: readonly DropoutReasonCategory[] = [
  "Financial",
  "Employment",
  "Academic",
  "Relocation",
  "Health",
  "Family / caring",
  "Course not suitable",
  "Other",
];
const PROJECT_TYPE_VALUES: readonly ProjectType[] = ["Enterprise", "Partner", "Internal"];
const PROJECT_STATUS_VALUES: readonly ProjectStatus[] = [
  "Not Started",
  "On Track",
  "At Risk",
  "Delayed",
  "Completed",
];
const ASSET_STATUS_VALUES: readonly AssetStatus[] = [
  "In Use",
  "Idle",
  "Maintenance",
  "Disposed",
  "Not Yet In Service",
];

export const ENROLMENT_FIELDS: FieldSpec[] = [
  { key: "learner", label: "Learner", aliases: ["learner", "learner name", "name", "student"], required: true, kind: "text" },
  { key: "course", label: "Course", aliases: ["course", "programme", "program", "course name"], required: true, kind: "category" },
  { key: "cohort", label: "Cohort", aliases: ["cohort", "intake", "class"], kind: "text" },
  { key: "registrationDate", label: "Registration Date", aliases: ["registration date", "registrationdate", "date registered", "enrolment date", "start date"], required: true, kind: "date" },
  { key: "status", label: "Status", aliases: ["status", "enrolment status"], required: true, kind: "enum", options: ENROLMENT_STATUS_VALUES },
  { key: "fundingSource", label: "Funding Source", aliases: ["funding source", "funding", "funder"], kind: "text" },
  { key: "facilitator", label: "Facilitator", aliases: ["facilitator", "facilitator name", "trainer", "lecturer"], kind: "text" },
  { key: "isNewThisPeriod", label: "New This Period", aliases: ["new this period", "new", "is new", "new enrolment", "new enrollment"], kind: "boolean" },
];

export const ATTENDANCE_FIELDS: FieldSpec[] = [
  { key: "course", label: "Course", aliases: ["course", "programme", "course name"], required: true, kind: "category" },
  { key: "cohort", label: "Cohort", aliases: ["cohort", "intake", "class"], kind: "text" },
  { key: "sessionDate", label: "Session Date", aliases: ["session date", "date", "session"], required: true, kind: "date" },
  { key: "facilitator", label: "Facilitator", aliases: ["facilitator", "facilitator name", "trainer"], kind: "text" },
  { key: "venue", label: "Venue", aliases: ["venue", "location"], kind: "text" },
  { key: "registered", label: "Registered", aliases: ["registered", "on register", "expected", "learners registered"], required: true, kind: "number" },
  { key: "attended", label: "Attended", aliases: ["attended", "present", "actual", "learners attended"], required: true, kind: "number" },
  { key: "excusedAbsences", label: "Excused Absences", aliases: ["excused absences", "excused", "sanctioned absences"], kind: "number" },
  { key: "notes", label: "Notes", aliases: ["notes", "comment", "comments"], kind: "text" },
];

export const TRAINING_FIELDS: FieldSpec[] = [
  { key: "course", label: "Course", aliases: ["course", "programme", "course name"], required: true, kind: "category" },
  { key: "cohort", label: "Cohort", aliases: ["cohort", "intake", "class"], kind: "text" },
  { key: "deliveryMode", label: "Delivery Mode", aliases: ["delivery mode", "mode", "delivery"], required: true, kind: "enum", options: DELIVERY_MODE_VALUES },
  { key: "facilitator", label: "Facilitator", aliases: ["facilitator", "facilitator name", "trainer"], kind: "text" },
  { key: "startDate", label: "Start Date", aliases: ["start date", "start", "commencement"], required: true, kind: "date" },
  { key: "endDate", label: "End Date", aliases: ["end date", "end", "completion date"], kind: "date" },
  { key: "hours", label: "Hours", aliases: ["hours", "contact hours", "duration", "hours delivered"], required: true, kind: "number" },
  { key: "capacity", label: "Capacity", aliases: ["capacity", "planned", "planned capacity"], kind: "number" },
  { key: "learnersStarted", label: "Learners Started", aliases: ["learners started", "started", "enrolled"], kind: "number" },
  { key: "notes", label: "Notes", aliases: ["notes", "comment", "comments"], kind: "text" },
];

export const COMPLETION_FIELDS: FieldSpec[] = [
  { key: "learner", label: "Learner", aliases: ["learner", "learner name", "name", "student"], required: true, kind: "text" },
  { key: "course", label: "Course", aliases: ["course", "programme", "course name"], required: true, kind: "category" },
  { key: "cohort", label: "Cohort", aliases: ["cohort", "intake", "class"], kind: "text" },
  { key: "completionDate", label: "Completion Date", aliases: ["completion date", "date", "outcome date", "date completed"], required: true, kind: "date" },
  { key: "outcome", label: "Outcome", aliases: ["outcome", "completion outcome", "status"], required: true, kind: "enum", options: COMPLETION_OUTCOME_VALUES },
  { key: "assessmentResult", label: "Assessment Result", aliases: ["assessment result", "assessment", "result", "grade"], kind: "text" },
  { key: "certified", label: "Certified", aliases: ["certified", "certificate issued", "is certified"], kind: "boolean" },
  { key: "notes", label: "Notes", aliases: ["notes", "comment", "comments"], kind: "text" },
];

export const DROPOUT_FIELDS: FieldSpec[] = [
  { key: "learner", label: "Learner", aliases: ["learner", "learner name", "name", "student"], required: true, kind: "text" },
  { key: "course", label: "Course", aliases: ["course", "programme", "course name"], required: true, kind: "category" },
  { key: "cohort", label: "Cohort", aliases: ["cohort", "intake", "class"], kind: "text" },
  { key: "withdrawalDate", label: "Withdrawal Date", aliases: ["withdrawal date", "date", "date withdrawn", "exit date"], required: true, kind: "date" },
  { key: "reason", label: "Reason", aliases: ["reason", "reason category", "dropout reason", "withdrawal reason"], required: true, kind: "enum", options: DROPOUT_REASON_VALUES },
  { key: "reasonDetail", label: "Reason Detail", aliases: ["reason detail", "detail", "explanation", "notes"], kind: "text" },
  { key: "weeksCompleted", label: "Weeks Completed", aliases: ["weeks completed", "weeks"], kind: "number" },
  { key: "reEnrolled", label: "Re-enrolled", aliases: ["re-enrolled", "re enrolled", "reenrolled", "re-enrolment", "re-enrollment", "placed later"], kind: "boolean" },
];

export const PROJECT_FIELDS: FieldSpec[] = [
  { key: "projectName", label: "Project", aliases: ["project", "project name", "name"], required: true, kind: "text" },
  { key: "type", label: "Type", aliases: ["type", "project type"], required: true, kind: "enum", options: PROJECT_TYPE_VALUES },
  { key: "status", label: "Status", aliases: ["status", "project status"], required: true, kind: "enum", options: PROJECT_STATUS_VALUES },
  { key: "startDate", label: "Start Date", aliases: ["start date", "start", "launch"], required: true, kind: "date" },
  { key: "plannedEndDate", label: "Planned End Date", aliases: ["planned end date", "planned completion", "target date", "due date"], kind: "date" },
  { key: "actualEndDate", label: "Actual End Date", aliases: ["actual end date", "actual completion", "end date", "completion date"], kind: "date" },
  { key: "lastReviewed", label: "Last Reviewed", aliases: ["last reviewed", "reviewed", "review date", "status date"], required: true, kind: "date" },
  { key: "beneficiaries", label: "Beneficiaries", aliases: ["beneficiaries", "beneficiary", "learners reached", "target beneficiaries"], kind: "number" },
  { key: "lead", label: "Project Lead", aliases: ["lead", "project lead", "manager", "coordinator"], kind: "text" },
  { key: "notes", label: "Notes", aliases: ["notes", "comment", "comments"], kind: "text" },
];

export const ASSET_FIELDS: FieldSpec[] = [
  { key: "assetName", label: "Asset", aliases: ["asset", "asset name", "name", "item", "description"], required: true, kind: "text" },
  { key: "assetTag", label: "Asset Tag", aliases: ["asset tag", "tag", "serial", "serial number", "registration"], required: true, kind: "text" },
  { key: "category", label: "Category", aliases: ["category", "asset category", "type"], required: true, kind: "category" },
  { key: "location", label: "Location", aliases: ["location", "site", "venue", "room"], kind: "text" },
  { key: "acquisitionDate", label: "Acquisition Date", aliases: ["acquisition date", "date acquired", "purchase date", "date"], kind: "date" },
  { key: "replacementValue", label: "Replacement Value", aliases: ["replacement value", "value", "replacement cost", "cost"], kind: "currency" },
  { key: "condition", label: "Condition", aliases: ["condition", "asset condition"], kind: "text" },
  { key: "status", label: "Status", aliases: ["status", "asset status"], required: true, kind: "enum", options: ASSET_STATUS_VALUES },
  { key: "custodian", label: "Custodian", aliases: ["custodian", "responsible", "caretaker"], kind: "text" },
  { key: "disposalDate", label: "Disposal Date", aliases: ["disposal date", "date disposed", "disposed on"], kind: "date" },
  { key: "notes", label: "Notes", aliases: ["notes", "comment", "comments"], kind: "text" },
];

export const OPERATIONS_TARGET_FIELDS: Record<OperationsImportTarget, FieldSpec[]> = {
  enrolment: ENROLMENT_FIELDS,
  attendance: ATTENDANCE_FIELDS,
  training: TRAINING_FIELDS,
  completion: COMPLETION_FIELDS,
  dropouts: DROPOUT_FIELDS,
  projects: PROJECT_FIELDS,
  assets: ASSET_FIELDS,
};

export const OPERATIONS_TARGET_LABELS: Record<OperationsImportTarget, string> = {
  enrolment: "Enrolment",
  attendance: "Attendance",
  training: "Training Delivery",
  completion: "Completion",
  dropouts: "Dropouts",
  projects: "Projects",
  assets: "Assets",
};

/**
 * Resolves a controlled-vocabulary cell against the configured list.
 *
 * A course or category present in the workbook but absent from Administration is
 * refused rather than stored as free text: a figure that cannot be grouped with
 * the same figure next term is worse than a refused import, because it looks
 * importable.
 */
function vocabularyResolver(config: OperationsConfig) {
  const match = (key: string, text: string) => {
    const lists: Record<string, readonly string[]> = {
      course: config.programmes,
      category: config.assetCategories,
    };
    const list = lists[key];
    if (!list) return undefined;
    const found = list.find((v) => v.toLowerCase() === text.toLowerCase());
    if (found) return { value: found };
    return {
      error: `"${text}" is not an approved ${key === "course" ? "course" : "category"} - map it or add it in Administration`,
    };
  };
  return match;
}

/**
 * Parses a sheet against a mapping and produces a preview. Nothing is written
 * here - this is the "show the user what will be imported" step.
 */
export function buildOperationsPreview(
  sheet: WorkbookSheet,
  target: OperationsImportTarget,
  mapping: ColumnMapping,
  config: OperationsConfig
): OperationsImportPreview {
  const parsed = buildRows(sheet, OPERATIONS_TARGET_FIELDS[target], mapping, {
    resolveCategory: vocabularyResolver(config),
  });

  return {
    target,
    sheetName: sheet.name,
    rows: parsed.rows,
    acceptable: parsed.acceptable,
    rejected: parsed.rejected,
    mapping,
    unmappedFields: parsed.unmappedFields,
    headers: sheet.headers,
  };
}

let idCounter = 0;

/** Records imported rows need stable ids of their own so React keys and audit
 *  references survive a reload. Sequential within a session, suffixed with a
 *  random fragment so two imports in the same millisecond cannot collide. */
function importedId(): string {
  idCounter += 1;
  return `imp-rec-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

const text = (values: Record<string, unknown>, key: string): string => {
  const v = values[key];
  return v === undefined || v === null ? "" : String(v).trim();
};

const numberOrNull = (values: Record<string, unknown>, key: string): number | null => {
  const v = values[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

const bool = (values: Record<string, unknown>, key: string): boolean => values[key] === true;

function toEnrolment(rows: ParsedRow[]): EnrolmentRecord[] {
  return rows.map((row) => ({
    ...blankEnrolmentRecord(),
    id: importedId(),
    learner: text(row.values, "learner"),
    course: text(row.values, "course"),
    cohort: text(row.values, "cohort"),
    registrationDate: text(row.values, "registrationDate"),
    status: text(row.values, "status") as EnrolmentRecord["status"],
    fundingSource: text(row.values, "fundingSource"),
    facilitator: text(row.values, "facilitator"),
    isNewThisPeriod: bool(row.values, "isNewThisPeriod"),
  }));
}

function toAttendance(rows: ParsedRow[]): AttendanceRecord[] {
  return rows.map((row) => ({
    ...blankAttendanceRecord(),
    id: importedId(),
    course: text(row.values, "course"),
    cohort: text(row.values, "cohort"),
    sessionDate: text(row.values, "sessionDate"),
    facilitator: text(row.values, "facilitator"),
    venue: text(row.values, "venue"),
    registered: numberOrNull(row.values, "registered"),
    attended: numberOrNull(row.values, "attended"),
    excusedAbsences: numberOrNull(row.values, "excusedAbsences"),
    notes: text(row.values, "notes"),
  }));
}

function toTraining(rows: ParsedRow[]): TrainingRecord[] {
  return rows.map((row) => ({
    ...blankTrainingRecord(),
    id: importedId(),
    course: text(row.values, "course"),
    cohort: text(row.values, "cohort"),
    deliveryMode: text(row.values, "deliveryMode") as TrainingRecord["deliveryMode"],
    facilitator: text(row.values, "facilitator"),
    startDate: text(row.values, "startDate"),
    endDate: text(row.values, "endDate"),
    hours: numberOrNull(row.values, "hours"),
    capacity: numberOrNull(row.values, "capacity"),
    learnersStarted: numberOrNull(row.values, "learnersStarted"),
    notes: text(row.values, "notes"),
  }));
}

function toCompletion(rows: ParsedRow[]): CompletionRecord[] {
  return rows.map((row) => ({
    ...blankCompletionRecord(),
    id: importedId(),
    learner: text(row.values, "learner"),
    course: text(row.values, "course"),
    cohort: text(row.values, "cohort"),
    completionDate: text(row.values, "completionDate"),
    outcome: text(row.values, "outcome") as CompletionRecord["outcome"],
    assessmentResult: text(row.values, "assessmentResult"),
    certified: bool(row.values, "certified"),
    notes: text(row.values, "notes"),
  }));
}

function toDropouts(rows: ParsedRow[]): DropoutRecord[] {
  return rows.map((row) => ({
    ...blankDropoutRecord(),
    id: importedId(),
    learner: text(row.values, "learner"),
    course: text(row.values, "course"),
    cohort: text(row.values, "cohort"),
    withdrawalDate: text(row.values, "withdrawalDate"),
    reason: text(row.values, "reason") as DropoutRecord["reason"],
    reasonDetail: text(row.values, "reasonDetail"),
    weeksCompleted: numberOrNull(row.values, "weeksCompleted"),
    reEnrolled: bool(row.values, "reEnrolled"),
  }));
}

function toProjects(rows: ParsedRow[]): ProjectRecord[] {
  return rows.map((row) => ({
    ...blankProjectRecord(),
    id: importedId(),
    projectName: text(row.values, "projectName"),
    type: text(row.values, "type") as ProjectRecord["type"],
    status: text(row.values, "status") as ProjectRecord["status"],
    startDate: text(row.values, "startDate"),
    plannedEndDate: text(row.values, "plannedEndDate"),
    actualEndDate: text(row.values, "actualEndDate"),
    lastReviewed: text(row.values, "lastReviewed"),
    beneficiaries: numberOrNull(row.values, "beneficiaries"),
    lead: text(row.values, "lead"),
    notes: text(row.values, "notes"),
  }));
}

function toAssets(rows: ParsedRow[]): AssetRecord[] {
  return rows.map((row) => ({
    ...blankAssetRecord(),
    id: importedId(),
    assetName: text(row.values, "assetName"),
    assetTag: text(row.values, "assetTag"),
    category: text(row.values, "category"),
    location: text(row.values, "location"),
    acquisitionDate: text(row.values, "acquisitionDate"),
    replacementValue: numberOrNull(row.values, "replacementValue"),
    condition: text(row.values, "condition"),
    status: text(row.values, "status") as AssetRecord["status"],
    custodian: text(row.values, "custodian"),
    disposalDate: text(row.values, "disposalDate"),
    notes: text(row.values, "notes"),
  }));
}

export interface OperationsImportResult {
  report: OperationsReport;
  run: OperationsImportRun;
  replacedSections: OperationsImportTarget[];
  accepted: number;
  rejected: number;
}

/**
 * Writes a confirmed preview into the report.
 *
 * Rejected rows are never partially applied. A section is either replaced
 * wholesale or appended to, and the run records which, so a later reader can
 * tell an import from a correction rather than guessing from the data.
 */
export function applyOperationsImport(
  report: OperationsReport,
  preview: OperationsImportPreview,
  options: { mode: "append" | "replace"; fileName: string; actor: string; stamp?: string }
): OperationsImportResult {
  const rows = preview.acceptable;
  const replace = options.mode === "replace";
  const stamp = options.stamp ?? new Date().toISOString();
  const replacedSections: OperationsImportTarget[] = [];
  let next = report;

  const merge = <T>(existing: T[], incoming: T[]): T[] =>
    replace ? incoming : [...existing, ...incoming];

  switch (preview.target) {
    case "enrolment": {
      const records = toEnrolment(rows);
      if (replace && report.enrolment.records.length > 0) replacedSections.push("enrolment");
      next = { ...next, enrolment: { ...next.enrolment, records: merge(report.enrolment.records, records), notApplicable: false } };
      break;
    }
    case "attendance": {
      const records = toAttendance(rows);
      if (replace && report.attendance.records.length > 0) replacedSections.push("attendance");
      next = { ...next, attendance: { ...next.attendance, records: merge(report.attendance.records, records), notApplicable: false } };
      break;
    }
    case "training": {
      const records = toTraining(rows);
      if (replace && report.training.records.length > 0) replacedSections.push("training");
      next = { ...next, training: { ...next.training, records: merge(report.training.records, records), notApplicable: false } };
      break;
    }
    case "completion": {
      const records = toCompletion(rows);
      if (replace && report.completion.records.length > 0) replacedSections.push("completion");
      next = { ...next, completion: { ...next.completion, records: merge(report.completion.records, records), notApplicable: false } };
      break;
    }
    case "dropouts": {
      const records = toDropouts(rows);
      if (replace && report.dropouts.records.length > 0) replacedSections.push("dropouts");
      next = { ...next, dropouts: { ...next.dropouts, records: merge(report.dropouts.records, records), notApplicable: false } };
      break;
    }
    case "projects": {
      const records = toProjects(rows);
      if (replace && report.projects.records.length > 0) replacedSections.push("projects");
      next = { ...next, projects: { ...next.projects, records: merge(report.projects.records, records), notApplicable: false } };
      break;
    }
    case "assets": {
      const records = toAssets(rows);
      if (replace && report.assets.records.length > 0) replacedSections.push("assets");
      next = { ...next, assets: { ...next.assets, records: merge(report.assets.records, records), notApplicable: false } };
      break;
    }
  }

  const run: OperationsImportRun = {
    id: `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    target: preview.target,
    fileName: options.fileName,
    importedAt: stamp,
    importedBy: options.actor,
    sheetName: preview.sheetName,
    rowsRead: preview.rows.length,
    rowsAccepted: preview.acceptable.length,
    rowsRejected: preview.rejected.length,
    mapping: preview.mapping,
    status: preview.rejected.length > 0 ? "Validated" : "Imported",
    notes: replacedSections.length
      ? `Replaced existing ${replacedSections.join(", ")} records.`
      : "Appended to existing records.",
  };

  // After an import the section is no longer a manual entry and no longer
  // unsubmitted. Recording the file and sheet is what makes the figure traceable
  // back to the workbook it came from.
  next = {
    ...next,
    importRuns: [...next.importRuns, run],
    dataSource: {
      kind: "Workbook Import",
      fileName: options.fileName,
      sheetName: preview.sheetName,
      importedAt: stamp,
      importedBy: options.actor,
    },
  };

  return { report: next, run, replacedSections, accepted: preview.acceptable.length, rejected: preview.rejected.length };
}

/**
 * Records a failed import attempt on the report.
 *
 * A failed upload must not leave the section looking unsubmitted: the manager
 * needs to see that the numbers they sent were refused, and why, or they will
 * assume the dashboard is simply empty.
 */
export function recordOperationsImportFailure(
  report: OperationsReport,
  target: OperationsImportTarget,
  reason: string,
  options: { actor: string; fileName: string; stamp?: string }
): OperationsReport {
  const stamp = options.stamp ?? new Date().toISOString();
  return {
    ...report,
    importRuns: [
      ...report.importRuns,
      {
        id: `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        target,
        fileName: options.fileName,
        importedAt: stamp,
        importedBy: options.actor,
        sheetName: "(none)",
        rowsRead: 0,
        rowsAccepted: 0,
        rowsRejected: 0,
        mapping: {},
        status: "Failed",
        notes: reason,
      },
    ],
    dataSource: {
      kind: "Workbook Import",
      fileName: options.fileName,
      importedAt: stamp,
      importedBy: options.actor,
      failureReason: reason,
    },
  };
}