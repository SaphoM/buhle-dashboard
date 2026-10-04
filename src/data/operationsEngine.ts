import { OPERATIONS_SECTION_KEYS, type OperationsConfig, type OperationsReport, type OperationsSectionKey } from "../types/operations";
import { OPERATIONS_KPI_IDS } from "./operationsSeed";
import { getStatusForValue } from "./kpiEngine";
import type { Kpi } from "../types";

// ============================================================================
// OPERATIONS calculations.
//
// Every Operations figure the application shows is derived HERE, from the
// records in the seven reporting sections. Nothing is typed as a rate, a
// percentage or a count-of-recordings by a manager, because a typed summary
// cannot be reconciled with the register behind it and the moment the two
// disagree nobody can say which is true.
//
// The rules that matter most:
//
//  - ATTENDANCE is a ratio of learner-sessions, not a mean of session
//    percentages. Averaging 90% and 30% gives 60%, which describes no session
//    at all. The register counts attendances against registrations instead, so a
//    session of 2 and a session of 60 carry their real weight.
//
//  - COMPLETION counts learners recorded as completed against learners whose
//    outcome was recorded. Withdrawing learners are in the base, not the
//    numerator: a learner who left is a real outcome, and a completion rate that
//    quietly excluded them would improve as training failed.
//
//  - DROPOUTS are reported both as a count and as a rate, because they answer
//    different questions. A small programme can lose very few learners and still
//    be losing a third of them.
//
//  - A learner who re-enrolled is excluded from the dropout rate, following the
//    configured retention convention, and the count still shows them. Both
//    figures are shown so the convention is visible rather than buried.
//
//  - NOT SUBMITTED is not zero. Each section returns null rather than 0 when it
//    has no records, so a KPI reads "no data" instead of reporting that nothing
//    happened.
// ============================================================================

/** Sums numbers, returning null when there is nothing to sum. */
function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** A percentage, or null when the denominator is missing or zero. */
function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return round((numerator / denominator) * 100, 1);
}

function dayOf(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

export interface EnrolmentSummary {
  /** Learners on the register who are enrolled or in progress. Waitlisted,
   *  withdrawn and completed learners are excluded: they are not training. */
  active: number | null;
  /** Registrations started inside the reporting period. */
  newThisPeriod: number | null;
  /** Everyone on the register, whatever their state. */
  totalOnRegister: number | null;
  waitlisted: number | null;
  withdrawn: number | null;
  completed: number | null;
  byCourse: { course: string; active: number }[];
  byStatus: Record<string, number>;
  /** True when a learner appears more than once, which the modal flags. */
  duplicateLearners: string[];
}

/** Statuses that mean "this learner is on the register and not yet finished".
 *  A blank status is deliberately NOT here. An unstated status is missing data,
 *  and counting it as an active learner would inflate the headline enrolment
 *  figure with registrations nobody has classified. */
const ACTIVE_STATUSES = new Set(["Enrolled", "In Progress"]);

/** Statuses that mean "this learner actually began study", which is the
 *  population a dropout rate is measured against. Waitlisted learners never
 *  started, so a dropout among people who were only waiting is not a dropout. */
const STARTED_STATUSES = new Set(["Enrolled", "In Progress", "Withdrawn", "Completed"]);

export function summariseEnrolment(report: OperationsReport): EnrolmentSummary | null {
  const records = report.enrolment.records;
  if (report.enrolment.notApplicable || records.length === 0) return null;

  const byStatus: Record<string, number> = {};
  const byCourse = new Map<string, number>();
  const seen = new Map<string, number>();
  let active = 0;
  let newThisPeriod = 0;

  for (const r of records) {
    const status = r.status || "Unspecified";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (ACTIVE_STATUSES.has(r.status)) {
      active += 1;
      const course = r.course || "Unspecified";
      byCourse.set(course, (byCourse.get(course) ?? 0) + 1);
    }
    if (r.isNewThisPeriod) newThisPeriod += 1;
    const key = `${(r.learner || "").trim().toLowerCase()}|${(r.course || "").trim().toLowerCase()}`;
    if ((r.learner || "").trim() !== "") seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  const duplicateLearners = [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key.split("|")[0]);

  return {
    active: active > 0 ? active : null,
    newThisPeriod,
    totalOnRegister: records.length,
    waitlisted: byStatus["Waitlisted"] ?? 0,
    withdrawn: byStatus["Withdrawn"] ?? 0,
    completed: byStatus["Completed"] ?? 0,
    byCourse: [...byCourse.entries()]
      .map(([course, count]) => ({ course, active: count }))
      .sort((a, b) => b.active - a.active),
    byStatus,
    duplicateLearners: [...new Set(duplicateLearners)],
  };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface AttendanceSummary {
  /** Attended learner-sessions. */
  attended: number | null;
  /** Registered learner-sessions. */
  registered: number | null;
  /** Sanctioned absences, reported separately so they are not read as
   *  non-attendance. */
  excusedAbsences: number | null;
  /** Attended / registered, across the whole period. */
  ratePct: number | null;
  sessions: number | null;
  /** Sessions whose own attendance rate fell below the lowest configured band. */
  sessionsBelowBand: number | null;
  /** The lowest band with a real threshold in config, e.g. 70. Sessions under
   *  this are counted as below band. */
  bandFloorPct: number;
  /** What a below-floor session is called, e.g. "Below 70%". Taken from the band
   *  underneath the floor so the wording matches the report. */
  bandFloorLabel: string;
  /** Sessions delivered after the reporting period started, i.e. data that
   *  belongs to a later period. Surfaced rather than silently counted. */
  sessionsOutsidePeriod: number | null;
  byCourse: { course: string; ratePct: number | null; attended: number; registered: number }[];
}

export function summariseAttendance(
  report: OperationsReport,
  config: OperationsConfig
): AttendanceSummary | null {
  const records = report.attendance.records;
  if (report.attendance.notApplicable || records.length === 0) return null;

  // The floor is the lowest band with a real threshold, not the minimum of every
  // band. Bands end in a catch-all entry ("Below 70%", minPct 0) that describes
  // what happens once a session has already fallen through, and taking the
  // minimum including it would put the floor at zero and mean nothing could ever
  // count as below band.
  const thresholds = config.attendanceBands.map((b) => b.minPct).filter((p) => p > 0);
  const bandFloor = thresholds.length > 0 ? Math.min(...thresholds) : 0;

  let attended = 0;
  let registered = 0;
  let excused = 0;
  let hasAttended = false;
  let hasRegistered = false;
  let belowBand = 0;
  let outsidePeriod = 0;
  const perCourse = new Map<string, { attended: number; registered: number }>();

  for (const r of records) {
    const att = typeof r.attended === "number" ? r.attended : 0;
    const reg = typeof r.registered === "number" ? r.registered : 0;
    if (typeof r.attended === "number") {
      attended += att;
      hasAttended = true;
    }
    if (typeof r.registered === "number") {
      registered += reg;
      hasRegistered = true;
    }
    if (typeof r.excusedAbsences === "number") excused += r.excusedAbsences;

    if (typeof r.attended === "number" && typeof r.registered === "number" && r.registered > 0) {
      if ((att / r.registered) * 100 < bandFloor) belowBand += 1;
      const course = r.course || "Unspecified";
      const bucket = perCourse.get(course) ?? { attended: 0, registered: 0 };
      bucket.attended += att;
      bucket.registered += reg;
      perCourse.set(course, bucket);
    }

    const d = dayOf(r.sessionDate);
    const start = dayOf(report.startDate);
    if (!Number.isNaN(d) && !Number.isNaN(start) && d < start) outsidePeriod += 1;
  }

  return {
    attended: hasAttended ? attended : null,
    registered: hasRegistered ? registered : null,
    excusedAbsences: excused > 0 ? excused : null,
    ratePct: pct(hasAttended ? attended : null, hasRegistered ? registered : null),
    sessions: records.length,
    sessionsBelowBand: belowBand > 0 ? belowBand : null,
    bandFloorPct: bandFloor,
    bandFloorLabel:
      config.attendanceBands.find((b) => b.minPct < bandFloor)?.label ?? `Below ${bandFloor}%`,
    sessionsOutsidePeriod: outsidePeriod > 0 ? outsidePeriod : null,
    byCourse: [...perCourse.entries()]
      .map(([course, b]) => ({
        course,
        ratePct: pct(b.attended, b.registered),
        attended: b.attended,
        registered: b.registered,
      }))
      .sort((a, b) => (a.ratePct ?? 101) - (b.ratePct ?? 101)),
  };
}

// ---------------------------------------------------------------------------
// Training delivery
// ---------------------------------------------------------------------------

export interface TrainingSummary {
  courses: number | null;
  sessions: number | null;
  hours: number | null;
  capacity: number | null;
  learnersStarted: number | null;
  /** Started as a share of capacity - a cohort filling only half its places is
   *  a programme problem, not a full one. */
  fillRatePct: number | null;
  byDeliveryMode: Record<string, number>;
  byCourse: { course: string; hours: number; learnersStarted: number }[];
}

export function summariseTraining(report: OperationsReport): TrainingSummary | null {
  const records = report.training.records;
  if (report.training.notApplicable || records.length === 0) return null;

  const hours = sumOrNull(records.map((r) => r.hours));
  const capacity = sumOrNull(records.map((r) => r.capacity));
  const started = sumOrNull(records.map((r) => r.learnersStarted));
  const byMode: Record<string, number> = {};
  const perCourse = new Map<string, { hours: number; learnersStarted: number }>();

  for (const r of records) {
    const mode = r.deliveryMode || "Unspecified";
    byMode[mode] = (byMode[mode] ?? 0) + 1;
    const course = r.course || "Unspecified";
    const bucket = perCourse.get(course) ?? { hours: 0, learnersStarted: 0 };
    bucket.hours += typeof r.hours === "number" ? r.hours : 0;
    bucket.learnersStarted += typeof r.learnersStarted === "number" ? r.learnersStarted : 0;
    perCourse.set(course, bucket);
  }

  return {
    courses: new Set(records.map((r) => r.course || "Unspecified")).size,
    sessions: records.length,
    hours,
    capacity,
    learnersStarted: started,
    fillRatePct: pct(started, capacity),
    byDeliveryMode: byMode,
    byCourse: [...perCourse.entries()]
      .map(([course, b]) => ({ course, ...b }))
      .sort((a, b) => b.hours - a.hours),
  };
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

export interface CompletionSummary {
  /** Learners recorded as completed. */
  completed: number | null;
  /** Learners whose outcome was recorded at all. Withdrawn learners sit here,
   *  because a learner who left is a real outcome of the course. */
  outcomesRecorded: number | null;
  completionRatePct: number | null;
  certified: number | null;
  byOutcome: Record<string, number>;
  byCourse: { course: string; completed: number; outcomesRecorded: number; ratePct: number | null }[];
}

export function summariseCompletion(report: OperationsReport): CompletionSummary | null {
  const records = report.completion.records;
  if (report.completion.notApplicable || records.length === 0) return null;

  const byOutcome: Record<string, number> = {};
  const perCourse = new Map<string, { completed: number; outcomes: number }>();
  let completed = 0;
  let certified = 0;

  for (const r of records) {
    const outcome = r.outcome || "Unspecified";
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    if (r.outcome === "Completed") completed += 1;
    if (r.certified) certified += 1;
    const course = r.course || "Unspecified";
    const bucket = perCourse.get(course) ?? { completed: 0, outcomes: 0 };
    bucket.outcomes += 1;
    if (r.outcome === "Completed") bucket.completed += 1;
    perCourse.set(course, bucket);
  }

  return {
    completed: records.length > 0 ? completed : null,
    outcomesRecorded: records.length,
    completionRatePct: pct(completed, records.length),
    certified: certified > 0 ? certified : null,
    byOutcome,
    byCourse: [...perCourse.entries()]
      .map(([course, b]) => ({
        course,
        completed: b.completed,
        outcomesRecorded: b.outcomes,
        ratePct: pct(b.completed, b.outcomes),
      }))
      .sort((a, b) => (a.ratePct ?? 101) - (b.ratePct ?? 101)),
  };
}

// ---------------------------------------------------------------------------
// Dropouts
// ---------------------------------------------------------------------------

export interface DropoutSummary {
  /** Every dropout recorded, including learners who later re-enrolled. */
  total: number | null;
  /** Dropouts counted under the configured retention convention. */
  counted: number | null;
  /** Learners who left and were offered or took another place. */
  reEnrolled: number | null;
  /** Counted dropouts as a share of learners active in the period. */
  dropoutRatePct: number | null;
  byReason: { reason: string; count: number }[];
  /** Mean weeks completed when learners left. Short courses and long courses
   *  are only comparable once this is alongside the count. */
  meanWeeksCompleted: number | null;
  /** Learners who left early, defined as under half the length of the course in
   *  the training records. Null when course lengths are unknown. */
  earlyDropouts: number | null;
  /** Dropouts with no matching registration on this submission's enrolment
   *  register. Not an error - the register may be a partial extract - but the
   *  dropout rate is built from the register, so a learner who was never counted
   *  as enrolled makes that rate a rate of nothing. Surfaced, not hidden. */
  unmatchedDropouts: string[];
}

export function summariseDropouts(
  report: OperationsReport,
  config: OperationsConfig
): DropoutSummary | null {
  const records = report.dropouts.records;
  if (report.dropouts.notApplicable || records.length === 0) return null;

  const byReason = new Map<string, number>();
  let reEnrolled = 0;
  let counted = 0;
  let early = 0;

  // The training records give the length of the courses being dropped out of,
  // which is the only fair way to call a dropout "early".
  const courseWeeks = new Map<string, number>();
  for (const t of report.training.records) {
    if (!t.course || !t.startDate || !t.endDate) continue;
    const days = (dayOf(t.endDate) - dayOf(t.startDate)) / 86400000;
    if (Number.isFinite(days) && days > 0) courseWeeks.set(t.course, Math.max(courseWeeks.get(t.course) ?? 0, days / 7));
  }

  for (const r of records) {
    const reason = r.reason || "Unspecified";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    if (r.reEnrolled) reEnrolled += 1;
    if (config.reEnrolmentCountsAsDropout || !r.reEnrolled) counted += 1;

    const weeks = courseWeeks.get(r.course);
    if (weeks !== undefined && typeof r.weeksCompleted === "number" && r.weeksCompleted < weeks / 2) early += 1;
  }

  const enrolledKeys = new Set(
    report.enrolment.records
      .filter((r) => r.learner.trim() !== "" && r.course.trim() !== "")
      .map((r) => `${r.learner.trim().toLowerCase()}|${r.course.trim().toLowerCase()}`)
  );
  const unmatchedDropouts = records
    .filter((r) => r.learner.trim() !== "" && r.course.trim() !== "")
    .filter((r) => !enrolledKeys.has(`${r.learner.trim().toLowerCase()}|${r.course.trim().toLowerCase()}`))
    .map((r) => `${r.learner} (${r.course})`);

  // The denominator is everyone who BEGAN the course, not the learners still on
  // the register. Learners who dropped out are, by definition, no longer active,
  // so measuring dropouts against the active count would produce a rate that
  // falls every time a programme fails, which is exactly backwards.
  const beganStudy = report.enrolment.records.filter((r) => STARTED_STATUSES.has(r.status)).length;
  // A re-enrolled learner excluded from the numerator leaves the denominator too,
  // otherwise the same withdrawal would still count against the programme.
  const excludedRetained = config.reEnrolmentCountsAsDropout ? 0 : reEnrolled;
  const denominator = beganStudy > 0 ? Math.max(beganStudy - excludedRetained, 0) : null;

  return {
    total: records.length,
    counted,
    reEnrolled: reEnrolled > 0 ? reEnrolled : null,
    dropoutRatePct: pct(counted, denominator),
    byReason: [...byReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    meanWeeksCompleted: (() => {
      const weeks = sumOrNull(records.map((r) => r.weeksCompleted));
      return weeks === null || records.length === 0 ? null : round(weeks / records.length, 1);
    })(),
    earlyDropouts: courseWeeks.size > 0 ? early : null,
    unmatchedDropouts: [...new Set(unmatchedDropouts)],
  };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectsSummary {
  total: number | null;
  active: number | null;
  byStatus: Record<string, number>;
  /** Live projects (not completed) recorded as on track. */
  onSchedule: number | null;
  /** Live projects on track, as a share of live projects. */
  onSchedulePct: number | null;
  atRiskOrDelayed: number | null;
  beneficiaries: number | null;
  byType: Record<string, number>;
  /** Live projects whose last review is older than the review staleness window,
   *  expressed in days. A status nobody has refreshed is not a current status. */
  staleReviews: { projectName: string; daysSinceReview: number }[];
}

/** How old a project review may get before it is reported as stale. */
export const PROJECT_REVIEW_STALE_DAYS = 60;

export function summariseProjects(report: OperationsReport, today: Date = new Date()): ProjectsSummary | null {
  const records = report.projects.records;
  if (report.projects.notApplicable || records.length === 0) return null;

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const staleReviews: ProjectsSummary["staleReviews"] = [];
  let live = 0;
  let onSchedule = 0;
  let troubled = 0;

  for (const r of records) {
    const status = r.status || "Unspecified";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const type = r.type || "Unspecified";
    byType[type] = (byType[type] ?? 0) + 1;

    // An unstated status is treated as live, not as finished: a project nobody
    // has closed is still running, and defaulting it to Completed would quietly
    // improve the on-schedule percentage.
    const isLive = r.status !== "Completed";
    if (isLive) {
      live += 1;
      if (r.status === "On Track") onSchedule += 1;
      if (r.status === "At Risk" || r.status === "Delayed") troubled += 1;
    }

    const reviewed = dayOf(r.lastReviewed);
    if (!Number.isNaN(reviewed)) {
      const days = Math.floor((today.getTime() - reviewed) / 86400000);
      if (days > PROJECT_REVIEW_STALE_DAYS) {
        staleReviews.push({ projectName: r.projectName, daysSinceReview: days });
      }
    }
  }

  staleReviews.sort((a, b) => b.daysSinceReview - a.daysSinceReview);

  return {
    total: records.length,
    active: live > 0 ? live : null,
    byStatus,
    onSchedule: live > 0 ? onSchedule : null,
    onSchedulePct: pct(live > 0 ? onSchedule : null, live > 0 ? live : null),
    atRiskOrDelayed: troubled > 0 ? troubled : null,
    beneficiaries: sumOrNull(records.map((r) => r.beneficiaries)),
    byType,
    staleReviews,
  };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface AssetsSummary {
  total: number | null;
  inUse: number | null;
  idle: number | null;
  maintenance: number | null;
  disposed: number | null;
  notYetInService: number | null;
  /** In use as a share of assets actually in service, i.e. excluding assets
   *  that have not arrived yet and assets already disposed of. A newly purchased
   *  asset is not a service failure. */
  inServiceRatePct: number | null;
  replacementValue: number | null;
  /** Replacement value of assets sitting idle. Capital already spent producing
   *  nothing. */
  idleValue: number | null;
  byCategory: { category: string; total: number; idle: number }[];
}

export function summariseAssets(report: OperationsReport): AssetsSummary | null {
  const records = report.assets.records;
  if (report.assets.notApplicable || records.length === 0) return null;

  const byCategory = new Map<string, { total: number; idle: number }>();
  let inUse = 0;
  let idle = 0;
  let maintenance = 0;
  let disposed = 0;
  let notYet = 0;
  let idleValue = 0;
  let hasIdleValue = false;

  for (const r of records) {
    if (r.status === "In Use") inUse += 1;
    else if (r.status === "Idle") {
      idle += 1;
      if (typeof r.replacementValue === "number") {
        idleValue += r.replacementValue;
        hasIdleValue = true;
      }
    } else if (r.status === "Maintenance") maintenance += 1;
    else if (r.status === "Disposed") disposed += 1;
    else if (r.status === "Not Yet In Service") notYet += 1;

    const category = r.category || "Unspecified";
    const bucket = byCategory.get(category) ?? { total: 0, idle: 0 };
    bucket.total += 1;
    if (r.status === "Idle") bucket.idle += 1;
    byCategory.set(category, bucket);
  }

  // The base excludes assets already disposed of AND assets that have not
  // arrived yet. A newly purchased machine nobody has switched on is not a
  // service failure, and counting it as one would drag the in-service rate down
  // for the wrong reason every time a procurement lands.
  const inServiceBase = records.length - disposed - notYet;

  return {
    total: records.length,
    inUse: inUse > 0 ? inUse : null,
    idle: idle > 0 ? idle : null,
    maintenance: maintenance > 0 ? maintenance : null,
    disposed: disposed > 0 ? disposed : null,
    notYetInService: notYet > 0 ? notYet : null,
    inServiceRatePct: pct(inUse > 0 ? inUse : null, inServiceBase > 0 ? inServiceBase : null),
    replacementValue: sumOrNull(records.map((r) => r.replacementValue)),
    idleValue: hasIdleValue ? idleValue : null,
    byCategory: [...byCategory.entries()]
      .map(([category, b]) => ({ category, ...b }))
      .sort((a, b) => b.idle - a.idle || b.total - a.total),
  };
}

// ---------------------------------------------------------------------------
// Section -> KPI binding
// ---------------------------------------------------------------------------

/** A KPI this submission could not derive, with the reason. The modal lists
 *  these so an executive can see what was NOT reported, instead of the figure
 *  being quietly absent. */
export interface SkippedOperationsKpi {
  kpiId: string;
  reason: "no_data" | "not_available" | "threshold_unset";
  detail: string;
}

export interface OperationsComputation {
  enrolment: EnrolmentSummary | null;
  attendance: AttendanceSummary | null;
  training: TrainingSummary | null;
  completion: CompletionSummary | null;
  dropouts: DropoutSummary | null;
  projects: ProjectsSummary | null;
  assets: AssetsSummary | null;
  entries: { kpiId: string; value: number }[];
  skipped: SkippedOperationsKpi[];
}

/**
 * The one place the Operations submission meets the shared KPI/EWS pipeline.
 *
 * Returns plain numbers. The store drives RAG, risks, actions and the Executive
 * roll-up from them, so no Operations figure is ever computed twice.
 */
export function computeOperationsKpis(
  report: OperationsReport,
  kpis: { id: string; name: string }[],
  config: OperationsConfig
): OperationsComputation {
  const enrolment = summariseEnrolment(report);
  const attendance = summariseAttendance(report, config);
  const training = summariseTraining(report);
  const completion = summariseCompletion(report);
  const dropouts = summariseDropouts(report, config);
  const projects = summariseProjects(report);
  const assets = summariseAssets(report);

  const values: Record<string, number | null> = {
    [OPERATIONS_KPI_IDS.enrolment]: enrolment?.active ?? null,
    [OPERATIONS_KPI_IDS.newEnrolments]: enrolment?.newThisPeriod ?? null,
    [OPERATIONS_KPI_IDS.attendanceRate]: attendance?.ratePct ?? null,
    [OPERATIONS_KPI_IDS.sessionsDelivered]: attendance?.sessions ?? null,
    [OPERATIONS_KPI_IDS.trainingHours]: training?.hours ?? null,
    [OPERATIONS_KPI_IDS.completion]: completion?.completionRatePct ?? null,
    [OPERATIONS_KPI_IDS.dropouts]: dropouts?.counted ?? null,
    [OPERATIONS_KPI_IDS.dropoutRate]: dropouts?.dropoutRatePct ?? null,
    [OPERATIONS_KPI_IDS.activeProjects]: projects?.active ?? null,
    [OPERATIONS_KPI_IDS.projectsOnSchedule]: projects?.onSchedulePct ?? null,
    [OPERATIONS_KPI_IDS.assetsInService]: assets?.inServiceRatePct ?? null,
    [OPERATIONS_KPI_IDS.assetsIdle]: assets?.idle ?? null,
  };

  const entries: { kpiId: string; value: number }[] = [];
  const skipped: SkippedOperationsKpi[] = [];
  const nameOf = (id: string) => kpis.find((k) => k.id === id)?.name ?? id;

  for (const [kpiId, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      skipped.push({
        kpiId,
        reason: "no_data",
        detail: `${nameOf(kpiId)} could not be derived: this submission contains no ${sectionForKpi(kpiId).toLowerCase()} records to calculate it from.`,
      });
      continue;
    }
    entries.push({ kpiId, value });
  }

  return { enrolment, attendance, training, completion, dropouts, projects, assets, entries, skipped };
}

/** Which reporting area feeds a KPI, for the "not reported from this
 *  submission" list. */
export function sectionForKpi(kpiId: string): OperationsSectionKey {
  switch (kpiId) {
    case OPERATIONS_KPI_IDS.enrolment:
    case OPERATIONS_KPI_IDS.newEnrolments:
      return "enrolment";
    case OPERATIONS_KPI_IDS.attendanceRate:
    case OPERATIONS_KPI_IDS.sessionsDelivered:
      return "attendance";
    case OPERATIONS_KPI_IDS.trainingHours:
      return "training";
    case OPERATIONS_KPI_IDS.completion:
      return "completion";
    case OPERATIONS_KPI_IDS.dropouts:
    case OPERATIONS_KPI_IDS.dropoutRate:
      return "dropouts";
    case OPERATIONS_KPI_IDS.activeProjects:
    case OPERATIONS_KPI_IDS.projectsOnSchedule:
      return "projects";
    case OPERATIONS_KPI_IDS.assetsInService:
    case OPERATIONS_KPI_IDS.assetsIdle:
      return "assets";
    default:
      return OPERATIONS_SECTION_KEYS[0];
  }
}

/**
 * The verdict a single Operations KPI would receive right now.
 *
 * Separated from computation so the section previews and the submission path
 * cannot disagree. A KPI with no approved threshold returns `threshold_unset`
 * rather than a colour: nobody has decided what a good attendance rate is, and
 * a green light on an undecided target would be a claim the dashboard cannot
 * support.
 */
export function previewOperationsStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) {
    // Same convention as getStatus: a KPI flagged unavailable WITH a reason says
    // so, and anything else is simply no data yet. Returning not_available for
    // every empty figure would call every untouched KPI "Not Yet Available",
    // which is a different and much stronger claim than "nothing recorded".
    if (kpi && kpi.dataAvailable === false && kpi.notAvailableReason) {
      return { status: "not_available" as const, thresholdNote: kpi.notAvailableReason };
    }
    return { status: "no_data" as const, thresholdNote: "" };
  }
  // A value is in hand, so the value is judged.
  //
  // `dataAvailable` describes the STORED KPI, not this live preview: every
  // Operations KPI ships with dataAvailable false and stays false until a
  // submission lands, so letting that flag win here would show "Not Yet
  // Available" for a figure the manager has just typed in, and would suppress the
  // threshold warning on the very preview that exists to warn them.
  const status = getStatusForValue(kpi, value);
  if (status === "threshold_unset") {
    return {
      status,
      thresholdNote:
        "Threshold not configured - no approved limit has been set for this KPI, so no Green/Amber/Red verdict can be given. The figure will be recorded and monitored only.",
    };
  }
  return { status, thresholdNote: "" };
}

/** Every Amber/Red Operations KPI that is expected to need an explanation. */
export function operationsKpisNeedingExplanation(
  computation: OperationsComputation,
  kpis: Kpi[]
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries
    .map(({ kpiId, value }) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi) return null;
      const status = getStatusForValue(kpi, value);
      if (status !== "amber" && status !== "red") return null;
      return { kpiId, name: kpi.name, value, status };
    })
    .filter((x): x is { kpiId: string; name: string; value: number; status: "amber" | "red" } => x !== null);
}

export { round as roundOperations, pct as operationsPct };