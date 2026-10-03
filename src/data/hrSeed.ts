import type { Kpi, ReportingFrequency } from "../types";
import { PERFORMANCE_UNAVAILABLE_REASON } from "./hrEngine";
import {
  HR_DEPARTMENT,
  LEAVE_TYPES,
  type HrCommentary,
  type HrConfig,
  type HrReport,
} from "../types/hr";

/**
 * HR configuration and blank-report factory.
 *
 * Deliberately contains NO sample employees, movements or vacancies. The
 * specification is explicit - "Do not create fake HR data" - and the existing
 * demo dataset is careful to mark its own figures as demo data. A fabricated
 * HR record here would be indistinguishable from a real submission once it
 * reached the KPI engine, so every record arrives from the HR manager instead.
 */

/**
 * Monthly is the proposed default cadence (Section 2), but it lives in config
 * rather than being hard-coded into the cycle logic, so an administrator can
 * change it and the next-due-date calculation follows.
 */
export const DEFAULT_HR_CONFIG: HrConfig = {
  reportingFrequency: "Monthly" as ReportingFrequency,
  performanceManagementActive: false,
  standardWorkingDaysPerMonth: 22,
};

export function blankLeaveLines(): Record<(typeof LEAVE_TYPES)[number], { employees: number | null; days: number | null; previousPeriodDays: number | null }> {
  return Object.fromEntries(LEAVE_TYPES.map((t) => [t, { employees: null, days: null, previousPeriodDays: null }])) as Record<
    (typeof LEAVE_TYPES)[number],
    { employees: number | null; days: number | null; previousPeriodDays: number | null }
  >;
}

export function blankCommentary(): HrCommentary {
  return {
    overall: "",
    keyIssue: "",
    keyAchievement: "",
    workforceConcern: "",
    actionRequired: "",
    supportRequired: "",
    kpiExplanations: {},
  };
}

/** A blank HR report for one cycle, ready for the manager to complete. */
export function createBlankHrReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  performanceManagementActive: boolean;
}): HrReport {
  return {
    id: `hr-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: HR_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    attendance: {
      totalEmployees: null,
      activeEmployees: null,
      newEmployees: null,
      employeesLeft: null,
      workingDays: null,
      expectedEmployeeDays: null,
      daysPresent: null,
      daysAbsent: null,
      daysAbsentApproved: null,
      daysAbsentUnapproved: null,
      sickLeaveDays: null,
      unauthorisedAbsenceDays: null,
      commentary: "",
      notApplicable: false,
    },
    leave: {
      lines: blankLeaveLines(),
      requestsSubmitted: null,
      requestsApproved: null,
      requestsPending: null,
      requestsDeclined: null,
      commentary: "",
      notApplicable: false,
    },
    // `systemActive` comes from configuration, never from whether the manager
    // happened to fill the fields in.
    performance: {
      systemActive: params.performanceManagementActive,
      dueForReview: null,
      reviewsCompleted: null,
      reviewsOutstanding: null,
      meetingExpectations: null,
      requiringDevelopment: null,
      requiringIntervention: null,
      reviewPeriod: "",
      reviewStatus: "",
      followUpRequired: false,
      commentary: "",
    },
    turnover: {
      newHires: [],
      exits: [],
      averageHeadcount: null,
      commentary: "",
      notApplicable: false,
    },
    skills: {
      employeesRequiringTraining: null,
      programmes: [],
      gaps: [],
      commentary: "",
      notApplicable: false,
    },
    vacancies: {
      vacancies: [],
      commentary: "",
      notApplicable: false,
    },
    commentary: blankCommentary(),
    status: "Draft",
    computedKpis: {},
  };
}

/**
 * HR KPIs introduced by the six-section submission. Turnover, Time to Fill,
 * Cost per Hire and Offer Acceptance already existed (confirmed against Buhle's
 * HR KPI Calc workbook) - these are the additional measures the submission can
 * now derive, plus the explicit placeholder for Staff Performance.
 */
export const HR_SUBMISSION_KPIS: Kpi[] = [
  {
    id: "kpi-leave-utilisation",
    name: "Leave Days Taken",
    department: HR_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    // No approved limit exists for total leave days, so no threshold is set.
    // The KPI then reports "threshold_unset" - recorded and monitored, but with
    // no invented Green (Section 7).
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "HR Manager",
    dataAvailable: false,
    insight:
      "Total leave days across all leave types. Derived from the HR submission's leave records; no approved threshold yet, so this is monitored rather than scored.",
    sourceSystem: "HR submission - leave records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-training-completion",
    name: "Training Completion Rate",
    department: HR_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 80,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "HR Manager",
    dataAvailable: false,
    insight:
      "Completed ÷ enrolled across training programmes in the period. No completion target has been approved by the Board yet.",
    sourceSystem: "HR submission - training records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-open-vacancies",
    name: "Open Vacancies",
    department: HR_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "monthly",
    owner: "HR Manager",
    dataAvailable: false,
    insight: "Vacancies open and not yet filled at the end of the reporting period.",
    sourceSystem: "HR submission - vacancy records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-staff-performance",
    name: "Staff Performance",
    department: HR_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "HR Manager",
    // Sections 8/9 and test 5: this KPI exists so the gap is visible and
    // reportable everywhere - including on the Executive Dashboard - rather
    // than silently absent. It reports "Not Yet Available" and can never show a
    // fabricated Green until a formal performance-management system is adopted
    // and switched on in Administration.
    dataAvailable: false,
    notAvailableReason: PERFORMANCE_UNAVAILABLE_REASON,
    insight:
      "Awaiting a formal performance-management system. Until one is in place, no Staff Performance figure is reported - the absence is a capability gap, not a performance result.",
    sourceSystem: "None - no performance-management system in place",
    thresholdApproval: "proposed",
  },
];