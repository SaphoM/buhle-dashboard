import type { Kpi } from "../types";
import { getStatusForValue } from "./kpiEngine";
import {
  LEAVE_TYPES,
  type HrAttendanceData,
  type HrCommentary,
  type HrLeaveData,
  type HrPerformanceData,
  type HrReport,
  type HrSkillsData,
  type HrTurnoverData,
  type HrVacancyData,
} from "../types/hr";

/**
 * ============================================================================
 * HR KPI ENGINE - the single authoritative source of every HR figure.
 * ============================================================================
 *
 * Sections 10/11/15 are explicit that HR must not type the finished percentage:
 *   "Do not require HR to manually enter the final turnover percentage if the
 *    underlying employee movement data exists."
 *   "The KPI engine must contain one authoritative calculation."
 *
 * So every function here derives its result from the underlying records, and
 * this module is the only place any of these formulas are written. Nothing in
 * the UI layer recalculates them.
 *
 * Every function returns `number | null`. `null` means "this cannot be derived
 * from what was submitted" - a genuinely different outcome from zero, and the
 * caller must not silently substitute a number for it (Section 15: where cost
 * data is unavailable, show "Data not available", not an invented value).
 */

// ---------------------------------------------------------------------------
// Section 1 - Attendance
// ---------------------------------------------------------------------------

/**
 * Absenteeism Rate = Total absence days ÷ Total expected working days × 100
 * (Section 4). Expected employee-days are used as captured; if HR omitted them
 * it is derived from active employees × working days, since that is exactly
 * what the figure represents and asking for it twice would be redundant.
 */
export function calculateAbsenteeismRate(
  data: HrAttendanceData,
  standardWorkingDays: number
): number | null {
  if (data.notApplicable) return null;

  // Prefer the single "days absent" total; fall back to summing its components
  // so HR isn't forced to enter the same number twice.
  const absent = deriveTotalAbsenceDays(data);
  if (absent === null) return null;

  const expected =
    data.expectedEmployeeDays ??
    (data.activeEmployees !== null
      ? (data.workingDays ?? standardWorkingDays) * data.activeEmployees
      : null);

  if (expected === null || expected <= 0) return null;
  return round((absent / expected) * 100, 2);
}

/** Total absence days = approved + unapproved + sick + unauthorised. Used when
 *  HR gives the components but not the single "days absent" total. */
export function deriveTotalAbsenceDays(data: HrAttendanceData): number | null {
  if (data.daysAbsent !== null) return data.daysAbsent;
  const parts = [data.daysAbsentApproved, data.daysAbsentUnapproved, data.sickLeaveDays, data.unauthorisedAbsenceDays];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Section 2 - Leave
// ---------------------------------------------------------------------------

export interface LeaveUtilisation {
  totalDays: number;
  annualLeaveDays: number;
  sickLeaveDays: number;
  /** Sick leave as a share of all leave days - the input to the sick-leave trend warning. */
  sickSharePct: number;
  /** Percentage change in total leave days vs the previous period. */
  periodChangePct: number | null;
  pendingRequests: number;
}

/**
 * Leave is a set of counts, not a single rate, so utilisation is summarised
 * rather than reduced to one invented percentage (Section 6: "calculate
 * relevant utilisation indicators from the underlying leave data").
 */
export function calculateLeaveUtilisation(data: HrLeaveData): LeaveUtilisation | null {
  if (data.notApplicable) return null;

  const lines = LEAVE_TYPES.map((type) => data.lines[type]);
  if (lines.every((l) => l.days === null)) return null;

  const totalDays = lines.reduce((sum, l) => sum + (l.days ?? 0), 0);
  const previousDays = lines.reduce((sum, l) => sum + (l.previousPeriodDays ?? 0), 0);
  const annual = data.lines["Annual"].days ?? 0;
  const sick = data.lines["Sick"].days ?? 0;

  return {
    totalDays,
    annualLeaveDays: annual,
    sickLeaveDays: sick,
    sickSharePct: totalDays > 0 ? round((sick / totalDays) * 100, 1) : 0,
    periodChangePct:
      previousDays > 0 ? round(((totalDays - previousDays) / previousDays) * 100, 1) : null,
    pendingRequests: data.requestsPending ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Section 3 - Performance - deliberately derives nothing while inactive
// ---------------------------------------------------------------------------

/**
 * Sections 8/9 and test 5: Staff Performance must not be reported until a
 * formal performance-management system is in place. There is no partial credit
 * here - if the system is not active this returns null and the caller reports
 * "Not Yet Available". It never falls back to counting review fields, because
 * doing so would present a self-reported proxy as an approved performance KPI.
 */
export function calculatePerformanceMetrics(data: HrPerformanceData): number | null {
  if (!data.systemActive) return null;
  const due = data.dueForReview;
  const completed = data.reviewsCompleted;
  if (due === null || completed === null || due <= 0) return null;
  return round((completed / due) * 100, 1);
}

export function performanceReviewCompletionPct(data: HrPerformanceData): number | null {
  return calculatePerformanceMetrics(data);
}

// ---------------------------------------------------------------------------
// Section 4 - Turnover
// ---------------------------------------------------------------------------

/**
 * Staff Turnover Rate = Exits ÷ Average headcount × 100
 *
 * This matches the formula already documented on the KPI record ("Exits ÷ Avg
 * Headcount", from Buhle's HR KPI Calc workbook), so the submission-derived
 * figure and the workbook-derived figure are directly comparable.
 *
 * A negative or zero denominator yields null: a turnover rate against no
 * headcount is undefined, not zero.
 */
export function calculateTurnoverRate(data: HrTurnoverData, averageHeadcount: number | null): number | null {
  if (data.notApplicable) return null;
  const headcount = averageHeadcount ?? data.averageHeadcount;
  if (headcount === null || headcount <= 0) return null;
  return round((data.exits.length / headcount) * 100, 2);
}

/** Voluntary vs involuntary split - context the HR manager needs when turnover breaches. */
export function summariseExits(data: HrTurnoverData) {
  const byReason = data.exits.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: data.exits.length,
    newHires: data.newHires.length,
    netChange: data.newHires.length - data.exits.length,
    voluntary: (byReason["Resignation"] ?? 0) + (byReason["Retirement"] ?? 0),
    involuntary: (byReason["Dismissal"] ?? 0) + (byReason["Contract Ended"] ?? 0),
    exitInterviewsCompleted: data.exits.filter((e) => e.exitInterviewCompleted).length,
    byReason,
  };
}

// ---------------------------------------------------------------------------
// Section 5 - Skills & Training
// ---------------------------------------------------------------------------

export interface TrainingCompletion {
  totalEnrolled: number;
  totalCompleted: number;
  completionPct: number;
  inProgress: number;
  overdueProgrammes: TrainingProgrammeSummary[];
  gapsWithoutPlan: number;
  criticalGaps: number;
}

export interface TrainingProgrammeSummary {
  programme: string;
  status: string;
  detail: string;
}

/**
 * Training completion = completed ÷ enrolled across every programme in the
 * period (Section 12). Programmes that were never enrolled into contribute
 * nothing rather than counting as zero-completion.
 */
export function calculateTrainingCompletion(data: HrSkillsData, today: Date = new Date()): TrainingCompletion | null {
  if (data.notApplicable) return null;
  const enrolled = data.programmes.reduce((sum, p) => sum + (p.enrolled ?? 0), 0);
  if (enrolled === 0) return null;
  const totalCompleted = data.programmes.reduce((sum, p) => sum + (p.completed ?? 0), 0);

  const overdueProgrammes = data.programmes
    .filter((p) => p.status !== "Completed" && p.status !== "Cancelled")
    .filter((p) => p.completionDate !== "" && new Date(p.completionDate) < today)
    .map((p) => ({
      programme: p.programme,
      status: p.status,
      detail: `Was due ${formatShortDate(p.completionDate)} and is still ${p.status.toLowerCase()}`,
    }));

  return {
    totalEnrolled: enrolled,
    totalCompleted,
    completionPct: round((totalCompleted / enrolled) * 100, 1),
    inProgress: data.programmes.filter((p) => p.status === "In Progress").length,
    overdueProgrammes,
    // A gap with no development action is a different problem to a gap with a
    // plan that is running late, and the EWS distinguishes them.
    gapsWithoutPlan: data.gaps.filter((g) => g.developmentAction.trim() === "").length,
    criticalGaps: data.gaps.filter((g) => g.priority === "Critical").length,
  };
}

// ---------------------------------------------------------------------------
// Section 6 - Vacancies / Recruitment
// ---------------------------------------------------------------------------

export interface RecruitmentSummary {
  openVacancies: number;
  filledVacancies: number;
  criticalOpen: number;
  timeToFillDays: number | null;
  timeToFillByVacancy: { vacancyId: string; position: string; days: number }[];
  costPerHire: number | null;
  offerAcceptancePct: number | null;
  offersMade: number;
  offersAccepted: number;
  /** Vacancies past their required start date and still not filled. */
  pastRequiredStart: { vacancyId: string; position: string; requiredStartDate: string }[];
  repeatedRejections: { vacancyId: string; position: string; declined: number }[];
}

const FILLED_STATUSES = new Set(["Filled", "Closed"]);

/**
 * Time to Fill = Filled date − Opened date, averaged across vacancies actually
 * filled in the period (Section 15). Still-open vacancies have no fill date, so
 * they cannot contribute a duration - but they are reported separately as
 * ageing open positions so an unfilled critical role is never invisible.
 */
export function summariseRecruitment(data: HrVacancyData, today: Date = new Date()): RecruitmentSummary | null {
  if (data.notApplicable) return null;
  if (data.vacancies.length === 0) return null;

  const vacancies = data.vacancies;
  const filled = vacancies.filter((v) => FILLED_STATUSES.has(v.status));
  const open = vacancies.filter((v) => !FILLED_STATUSES.has(v.status));

  const durations = filled
    .filter((v) => v.dateOpened && v.filledDate)
    .map((v) => ({
      vacancyId: v.vacancyId,
      position: v.position,
      days: daysBetween(v.dateOpened, v.filledDate),
    }))
    .filter((d) => d.days !== null) as { vacancyId: string; position: string; days: number }[];

  const timeToFillDays =
    durations.length > 0 ? round(durations.reduce((s, d) => s + d.days, 0) / durations.length, 1) : null;

  // Cost per Hire = (recruitment cost + hiring-related costs) ÷ hires.
  // Returns null when no cost was captured, so the KPI shows "Data not
  // available" rather than a fabricated R0 (Section 15).
  const hires = filled.length;
  const totalCost = vacancies.reduce(
    (sum, v) => sum + (v.recruitmentCost ?? 0) + (v.hiringRelatedCosts ?? 0),
    0
  );
  const anyCostCaptured = vacancies.some((v) => v.recruitmentCost !== null || v.hiringRelatedCosts !== null);
  const costPerHire = hires > 0 && anyCostCaptured ? round(totalCost / hires, 0) : null;

  const offersMade = vacancies.reduce((sum, v) => sum + (v.offersMade ?? 0), 0);
  const offersAccepted = vacancies.reduce((sum, v) => sum + (v.offersAccepted ?? 0), 0);
  const offerAcceptancePct = offersMade > 0 ? round((offersAccepted / offersMade) * 100, 1) : null;

  return {
    openVacancies: open.length,
    filledVacancies: filled.length,
    criticalOpen: open.filter((v) => v.priority === "Critical").length,
    timeToFillDays,
    timeToFillByVacancy: durations,
    costPerHire,
    offerAcceptancePct,
    offersMade,
    offersAccepted,
    pastRequiredStart: open
      .filter((v) => v.requiredStartDate && new Date(v.requiredStartDate) < today)
      .map((v) => ({ vacancyId: v.vacancyId, position: v.position, requiredStartDate: v.requiredStartDate })),
    repeatedRejections: vacancies
      .filter((v) => (v.offersDeclined ?? 0) >= 2)
      .map((v) => ({ vacancyId: v.vacancyId, position: v.position, declined: v.offersDeclined ?? 0 })),
  };
}

// ---------------------------------------------------------------------------
// KPI binding - report -> KPI values
// ---------------------------------------------------------------------------

/** A KPI that could not be derived from this submission, with the reason why. */
export interface SkippedKpi {
  kpiId: string;
  reason: "no_data" | "not_available" | "threshold_unset";
  detail: string;
}

export interface HrKpiComputation {
  /** Values to push through the shared KPI/EWS pipeline. */
  entries: { kpiId: string; value: number }[];
  /** KPIs deliberately not given a value, and why. */
  skipped: SkippedKpi[];
  /** Every KPI the report touched, keyed by id - the audit record. */
  audit: Record<string, number | null>;
}

/**
 * The one wording used wherever Staff Performance is unavailable. Held here
 * because this module owns the reason, and re-exported so the HR modal, the
 * store and the Executive data-quality notes cannot drift apart
 * (HR spec Sections 8 and 9).
 */
export const PERFORMANCE_UNAVAILABLE_REASON =
  "Performance Management System not yet active - no Staff Performance figure can be reported.";

/** KPI ids the HR submission is responsible for. Order matches Section 20. */
export const HR_KPI_IDS = {
  absenteeism: "kpi-absenteeism",
  leaveUtilisation: "kpi-leave-utilisation",
  performance: "kpi-staff-performance",
  turnover: "kpi-turnover",
  trainingCompletion: "kpi-training-completion",
  openVacancies: "kpi-open-vacancies",
  timeToFill: "kpi-time-to-fill",
  costPerHire: "kpi-cost-per-hire",
  offerAcceptance: "kpi-offer-acceptance",
} as const;

/**
 * Derives every HR KPI value from one report. This is the only bridge between
 * the HR submission and the shared KPI/EWS pipeline - it returns plain numbers
 * and lets DataStoreContext drive risks, actions and alerts from there, so the
 * HR workflow and every other department's submission share one engine.
 */
export function computeHrKpis(report: HrReport, kpis: Kpi[], standardWorkingDays: number): HrKpiComputation {
  const entries: HrKpiComputation["entries"] = [];
  const skipped: SkippedKpi[] = [];
  const audit: HrKpiComputation["audit"] = {};

  const push = (kpiId: string, value: number | null) => {
    audit[kpiId] = value;
    if (value === null) return;
    entries.push({ kpiId, value });
  };

  push(HR_KPI_IDS.absenteeism, calculateAbsenteeismRate(report.attendance, standardWorkingDays));

  const leave = calculateLeaveUtilisation(report.leave);
  // Leave is reported as total days taken rather than a synthetic rate: there
  // is no approved denominator for "leave utilisation" as a percentage.
  push(HR_KPI_IDS.leaveUtilisation, leave?.totalDays ?? null);

  push(HR_KPI_IDS.performance, calculatePerformanceMetrics(report.performance));

  push(HR_KPI_IDS.turnover, calculateTurnoverRate(report.turnover, null));

  const training = calculateTrainingCompletion(report.skills);
  push(HR_KPI_IDS.trainingCompletion, training?.completionPct ?? null);

  const recruitment = summariseRecruitment(report.vacancies);
  push(HR_KPI_IDS.openVacancies, recruitment?.openVacancies ?? null);
  push(HR_KPI_IDS.timeToFill, recruitment?.timeToFillDays ?? null);
  push(HR_KPI_IDS.costPerHire, recruitment?.costPerHire ?? null);
  push(HR_KPI_IDS.offerAcceptance, recruitment?.offerAcceptancePct ?? null);

  // Record why each absent KPI is absent, so the review page can say
  // "Not Yet Available" or "No data submitted" instead of showing a gap.
  const nameOf = (id: string) => kpis.find((k) => k.id === id)?.name ?? id;
  for (const kpiId of Object.values(HR_KPI_IDS)) {
    if (audit[kpiId] !== null && audit[kpiId] !== undefined) continue;
    if (kpiId === HR_KPI_IDS.performance && !report.performance.systemActive) {
      skipped.push({
        kpiId,
        reason: "not_available",
        detail: PERFORMANCE_UNAVAILABLE_REASON,
      });
    } else {
      skipped.push({
        kpiId,
        reason: "no_data",
        detail: `${nameOf(kpiId)} could not be derived - the underlying records were not supplied.`,
      });
    }
  }

  return { entries, skipped, audit };
}

/**
 * Live RAG for a candidate value, used by the modal to show the warning a
 * submission is about to trigger before it is saved (Sections 5, 7, 13, 16).
 * Delegates to the shared engine so the modal can never disagree with what
 * submission actually does.
 */
export function previewStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) return { status: "no_data" as const, thresholdNote: "" };

  // A KPI with no system behind it stays Not Yet Available even if a stale
  // value is lying around in the record.
  if (kpi.dataAvailable === false) {
    return { status: "not_available" as const, thresholdNote: kpi.notAvailableReason ?? "" };
  }
  const status = getStatusForValue(kpi, value);
  if (status === "threshold_unset") {
    return {
      status,
      thresholdNote: "No approved threshold is configured for this KPI - it will be recorded and monitored, but no Green/Amber/Red verdict is issued.",
    };
  }
  return { status, thresholdNote: "" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** Every Amber/Red KPI the manager is expected to explain (Section 23). */
export function kpisNeedingExplanation(
  computation: HrKpiComputation,
  kpis: Kpi[],
  commentary: HrCommentary
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries
    .map(({ kpiId, value }) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi) return null;
      const status = getStatusForValue(kpi, value);
      if (status !== "amber" && status !== "red") return null;
      return { kpiId, name: kpi.name, value, status };
    })
    .filter((x): x is { kpiId: string; name: string; value: number; status: "amber" | "red" } => x !== null)
    .filter(({ kpiId }) => (commentary.kpiExplanations[kpiId] ?? "").trim() === "");
}