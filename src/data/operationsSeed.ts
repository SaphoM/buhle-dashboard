import type { Kpi, ReportingFrequency } from "../types";
import type {
  AssetRecord,
  AttendanceRecord,
  CompletionRecord,
  DropoutRecord,
  EnrolmentRecord,
  OperationsCommentary,
  OperationsConfig,
  OperationsReport,
  ProjectRecord,
  TrainingRecord,
} from "../types/operations";
import { OPERATIONS_DEPARTMENT } from "../types/operations";

/**
 * Operations defaults.
 *
 * Every list here is CONFIGURATION, not a domain constant. Buhle's approved
 * course list, asset categories and dropout reasons have not been confirmed, so
 * what follows is a defensible starting set an administrator edits in
 * Administration -> Operations Configuration. Nothing here is presented to an
 * executive as Buhle's approved structure.
 *
 * The starting programme list deliberately describes training Buhle actually
 * runs (per the discovery discussion) rather than a generic course catalogue.
 */

export const DEFAULT_PROGRAMMES = [
  "Learner Training",
  "Learner Enterprise",
  "Farming Enterprise",
  "Internship",
  "Graduate Programme",
  "Bursary Programme",
  "Short Course: Bookkeeping",
  "Short Course: Computer Skills",
  "Short Course: Business Skills",
] as const;

export const DEFAULT_DELIVERY_MODES = ["Face to Face", "Online", "Blended", "Workplace"] as const;

export const DEFAULT_COMPLETION_OUTCOMES = [
  "Completed",
  "Partially Completed",
  "Not Completed",
  "Withdrawn",
] as const;

export const DEFAULT_DROPOUT_REASONS = [
  "Financial",
  "Employment",
  "Academic",
  "Family / caring",
  "Health",
  "Relocation",
  "Course not suitable",
  "Other",
] as const;

export const DEFAULT_PROJECT_TYPES = ["Enterprise", "Partner", "Internal"] as const;

export const DEFAULT_ASSET_CATEGORIES = [
  "Training venue equipment",
  "Computers and IT",
  "Furniture",
  "Vehicles",
  "Farming equipment",
  "Office equipment",
  "Sports and recreation",
] as const;

/**
 * Attendance bands for reporting the register. The banded percentages are
 * PRESENTATION ONLY: the attendance rate itself is derived from the attended and
 * registered counts, so a typed figure can never disagree with the register
 * behind it.
 */
export const DEFAULT_ATTENDANCE_BANDS = [
  { label: "90% and above", minPct: 90 },
  { label: "80% to 89%", minPct: 80 },
  { label: "70% to 79%", minPct: 70 },
  { label: "Below 70%", minPct: 0 },
];

/**
 * Per cohort by default, and the reasoning is worth stating because it is not
 * obvious: enrolment, completion and dropout are COHORT facts. A monthly cycle
 * would report the same cohort four times, and a completion rate that never
 * moved would look like a series with four identical readings. The cadence is
 * config, so a monthly cycle is one administrator setting away if Buhle wants
 * it, and it matches the Operations cycle already in the demo data.
 */
export const DEFAULT_OPERATIONS_CONFIG: OperationsConfig = {
  reportingFrequency: "Per Cohort",
  currencySymbol: "R",
  programmes: [...DEFAULT_PROGRAMMES],
  deliveryModes: [...DEFAULT_DELIVERY_MODES],
  completionOutcomes: [...DEFAULT_COMPLETION_OUTCOMES],
  dropoutReasons: [...DEFAULT_DROPOUT_REASONS],
  projectTypes: [...DEFAULT_PROJECT_TYPES],
  assetCategories: [...DEFAULT_ASSET_CATEGORIES],
  attendanceBands: DEFAULT_ATTENDANCE_BANDS,
  // A learner who drops out and re-enrols on a later cohort is a retention
  // problem to solve, not a lost learner to count. Defaulting to NOT counting
  // them keeps the dropout rate about learners who left Buhle training
  // altogether. This is a policy switch, admin-editable, because the opposite
  // convention is defensible too.
  reEnrolmentCountsAsDropout: false,
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankEnrolmentRecord(): EnrolmentRecord {
  return {
    id: newId("enr"),
    learner: "",
    course: "",
    cohort: "",
    registrationDate: "",
    status: "",
    fundingSource: "",
    facilitator: "",
    isNewThisPeriod: false,
    notes: "",
  };
}

export function blankAttendanceRecord(): AttendanceRecord {
  return {
    id: newId("att"),
    course: "",
    cohort: "",
    sessionDate: "",
    facilitator: "",
    venue: "",
    registered: null,
    attended: null,
    excusedAbsences: null,
    notes: "",
  };
}

export function blankTrainingRecord(): TrainingRecord {
  return {
    id: newId("trn"),
    course: "",
    cohort: "",
    deliveryMode: "",
    facilitator: "",
    startDate: "",
    endDate: "",
    hours: null,
    capacity: null,
    learnersStarted: null,
    notes: "",
  };
}

export function blankCompletionRecord(): CompletionRecord {
  return {
    id: newId("cmp"),
    learner: "",
    course: "",
    cohort: "",
    completionDate: "",
    outcome: "",
    assessmentResult: "",
    certified: false,
    notes: "",
  };
}

export function blankDropoutRecord(): DropoutRecord {
  return {
    id: newId("dro"),
    learner: "",
    course: "",
    cohort: "",
    withdrawalDate: "",
    reason: "",
    reasonDetail: "",
    weeksCompleted: null,
    reEnrolled: false,
    followUpOwner: "",
    notes: "",
  };
}

export function blankProjectRecord(): ProjectRecord {
  return {
    id: newId("prj"),
    projectName: "",
    type: "",
    status: "",
    startDate: "",
    plannedEndDate: "",
    actualEndDate: "",
    lastReviewed: "",
    beneficiaries: null,
    linkedCourse: "",
    lead: "",
    notes: "",
  };
}

export function blankAssetRecord(): AssetRecord {
  return {
    id: newId("ast"),
    assetName: "",
    assetTag: "",
    category: "",
    location: "",
    acquisitionDate: "",
    replacementValue: null,
    condition: "",
    status: "",
    custodian: "",
    disposalDate: "",
    notes: "",
  };
}

export function blankCommentary(): OperationsCommentary {
  return {
    overall: "",
    keyIssue: "",
    keyAchievement: "",
    enrolmentCommentary: "",
    attendanceCommentary: "",
    trainingCommentary: "",
    completionCommentary: "",
    dropoutsCommentary: "",
    projectsCommentary: "",
    assetsCommentary: "",
    kpiExplanations: {},
  };
}

export function createBlankOperationsReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  config: OperationsConfig;
}): OperationsReport {
  return {
    id: `ops-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: OPERATIONS_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    enrolment: { records: [], commentary: "", notApplicable: false },
    attendance: { records: [], commentary: "", notApplicable: false },
    training: { records: [], commentary: "", notApplicable: false },
    completion: { records: [], commentary: "", notApplicable: false },
    dropouts: { records: [], commentary: "", notApplicable: false },
    projects: { records: [], commentary: "", notApplicable: false },
    assets: { records: [], commentary: "", notApplicable: false },
    commentary: blankCommentary(),
    dataSource: { kind: "Not Submitted" },
    importRuns: [],
    status: "Draft",
    computedKpis: {},
  };
}

/**
 * The KPI ids the Operations submission is responsible for.
 *
 * `kpi-enrolment` and `kpi-completion` keep the ids and names already in the
 * demo data, because Executive risks and reports reference them by id. Their
 * shape changes: they become derived from records rather than typed by hand,
 * and their thresholds become null until Buhle confirms the targets that are
 * still recorded as outstanding.
 */
export const OPERATIONS_KPI_IDS = {
  enrolment: "kpi-enrolment",
  newEnrolments: "kpi-new-enrolments",
  attendanceRate: "kpi-attendance-rate",
  sessionsDelivered: "kpi-sessions-delivered",
  trainingHours: "kpi-training-hours",
  completion: "kpi-completion",
  dropouts: "kpi-dropouts",
  dropoutRate: "kpi-dropout-rate",
  activeProjects: "kpi-active-projects",
  projectsOnSchedule: "kpi-projects-on-schedule",
  assetsInService: "kpi-assets-in-service",
  assetsIdle: "kpi-assets-idle",
} as const;

/**
 * Operations KPIs.
 *
 * Every threshold here is null, and that is the honest starting position rather
 * than an omission. Buhle's Operations and Training targets have not been
 * confirmed, and the demo figures that carried proposed thresholds were typed
 * by hand rather than derived from any register. A KPI with no approved limit
 * reports `threshold_unset`: recorded, displayed, monitored, and issuing no
 * Green/Amber/Red verdict. The moment an administrator sets a limit in
 * Administration, the Early Warning System starts working with no code change.
 */
export const OPERATIONS_SUBMISSION_KPIS: Kpi[] = [
  {
    id: OPERATIONS_KPI_IDS.enrolment,
    name: "Student Enrolment",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Learners currently on the register who are enrolled or in progress. Derived from the enrolment records in this submission; no approved enrolment target has been confirmed yet.",
    sourceSystem: "Operations submission - enrolment records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.newEnrolments,
    name: "New Enrolments",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Registrations started during the reporting period, as opposed to the standing total. Growth in training is the difference between a rising number and the same learners every term.",
    sourceSystem: "Operations submission - enrolment records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.attendanceRate,
    name: "Learner Attendance Rate",
    department: OPERATIONS_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Attended learner-sessions as a share of registered learner-sessions, across every session delivered in the period. Derived from the attendance register, never typed as a rate.",
    sourceSystem: "Operations submission - attendance records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.sessionsDelivered,
    name: "Training Sessions Delivered",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Sessions recorded as delivered in the period. Counts what actually happened, so a planned programme with nothing delivered cannot read as delivery.",
    sourceSystem: "Operations submission - training delivery records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.trainingHours,
    name: "Training Hours Delivered",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Contact hours delivered across the period. Hours rather than sessions, because a half-day and a full day are not the same amount of training.",
    sourceSystem: "Operations submission - training delivery records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.completion,
    name: "Learner Training Completion Rate",
    department: OPERATIONS_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Learners recorded as completed, as a share of learners whose outcome was recorded in the period. Deliberately named 'Learner...' to distinguish it from HR's Staff Training Completion Rate. No approved completion target has been confirmed yet.",
    sourceSystem: "Operations submission - completion records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.dropouts,
    name: "Learner Dropouts",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Learners who withdrew from a course in the period. A count, not a rate: a term with few learners can have few dropouts and still be losing people, which is why the rate is reported beside it.",
    sourceSystem: "Operations submission - dropout records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.dropoutRate,
    name: "Learner Dropout Rate",
    department: OPERATIONS_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Dropouts as a share of learners active in the period. A learner who re-enrolled on a later cohort is excluded, following the configured retention convention.",
    sourceSystem: "Operations submission - enrolment and dropout records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.activeProjects,
    name: "Active Projects",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Projects recorded as started, on track, at risk or delayed. A project marked completed is no longer active work.",
    sourceSystem: "Operations submission - project records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.projectsOnSchedule,
    name: "Projects Delivered On Schedule",
    department: OPERATIONS_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Live projects recorded as on track, as a share of live projects. A project marked 'on track' that was last reviewed a term ago is reported as on track - the review date is shown beside it so the age of the status is visible.",
    sourceSystem: "Operations submission - project records",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.assetsInService,
    name: "Assets In Service",
    department: OPERATIONS_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Assets recorded as in use, as a share of assets on the register. Assets not yet in service are excluded from the base rather than counted against the rate, because a newly purchased asset is not a failure.",
    sourceSystem: "Operations submission - asset register",
    thresholdApproval: "proposed",
  },
  {
    id: OPERATIONS_KPI_IDS.assetsIdle,
    name: "Assets Idle",
    department: OPERATIONS_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "termly",
    owner: "Head of Training",
    dataAvailable: false,
    insight:
      "Assets on the register recorded as idle. An asset nobody is using is money already spent producing nothing, so it is reported on its own rather than only inside the in-service rate.",
    sourceSystem: "Operations submission - asset register",
    thresholdApproval: "proposed",
  },
];