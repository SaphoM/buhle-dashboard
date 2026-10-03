import {
  OPERATIONS_SECTION_KEYS,
  OPERATIONS_SECTION_LABELS,
  type OperationsConfig,
  type OperationsReport,
  type OperationsSectionKey,
} from "../types/operations";

/**
 * ============================================================================
 * Operations submission validation.
 * ============================================================================
 *
 * The governing rule is the same one Finance applies: an Operations submission
 * either carries what the configured rules require, or it is refused with a
 * precise list naming the section and the field.
 *
 * What makes Operations validation distinctive is that the conflicts that matter
 * are usually BETWEEN sections, not within one:
 *
 *  - A learner recorded as both Completed and Withdrawn from the same course.
 *    Both records look fine on their own; together they are impossible, and the
 *    completion rate would silently take whichever one loaded last.
 *
 *  - A dropout dated before the learner's registration, or a completion dated
 *    before it. A register that says a learner finished a course three weeks
 *    before they joined it is not a register.
 *
 *  - Attendance above the number registered, which would push the attendance
 *    rate above 100% and quietly make the programme look better than it is.
 *
 *  - A course, delivery mode, outcome, reason or asset category that is no
 *    longer approved, because the approved list is configuration and a report
 *    that has drifted from it cannot be aggregated across terms.
 *
 * Required fields are deliberately limited to what a calculation actually
 * consumes. Requiring a note or a cost centre that nothing reads would train
 * managers to type junk to get past the gate.
 */

export interface OperationsValidationIssue {
  section: OperationsSectionKey;
  field: string;
  message: string;
  kind?: "missing" | "inconsistent";
}

export interface OperationsSectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: OperationsValidationIssue[];
}

export interface OperationsValidationResult {
  valid: boolean;
  issues: OperationsValidationIssue[];
  bySection: Record<OperationsSectionKey, OperationsSectionValidation>;
}

export interface ValidateOperationsOptions {
  config: OperationsConfig;
  today?: Date;
}

/** The approved enrolment statuses, mirrored from the type so validation and the
 *  engine cannot drift apart. */
const ENROLMENT_STATUSES = new Set(["Enrolled", "In Progress", "Waitlisted", "Withdrawn", "Completed"]);

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function missing(section: OperationsSectionKey, field: string): OperationsValidationIssue {
  return { section, field, message: `${field} is required`, kind: "missing" };
}

function inconsistent(section: OperationsSectionKey, field: string, message: string): OperationsValidationIssue {
  return { section, field, message, kind: "inconsistent" };
}

/**
 * The approved vocabulary has drifted from the record. Named rather than
 * silently accepted, because a course or reason that exists only in this
 * submission cannot be aggregated against the same category in the next term.
 */
function notApproved(section: OperationsSectionKey, field: string, value: string): OperationsValidationIssue {
  return {
    section,
    field,
    message: `"${value}" is not an approved ${field.toLowerCase()} - add it in Administration or correct the record`,
    kind: "inconsistent",
  };
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

function validateEnrolment(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationIssue[] {
  const data = report.enrolment;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("enrolment", "At least one enrolment record (or mark the section Not Applicable)"));
    return issues;
  }

  const seen = new Set<string>();
  data.records.forEach((r, i) => {
    const label = `Enrolment ${i + 1}`;
    if (isBlank(r.learner)) issues.push(missing("enrolment", `${label} - Learner`));
    if (isBlank(r.course)) issues.push(missing("enrolment", `${label} - Course`));
    if (isBlank(r.registrationDate)) issues.push(missing("enrolment", `${label} - Registration date`));
    // Status decides whether the learner counts as active, as withdrawn or as
    // completed, so an unstated status cannot be submitted: it would either be
    // counted as an active learner or vanish from every figure at once.
    if (isBlank(r.status)) issues.push(missing("enrolment", `${label} - Status`));

    if (!isBlank(r.status) && !ENROLMENT_STATUSES.has(r.status)) {
      issues.push(notApproved("enrolment", "Status", r.status));
    }

    if (!isBlank(r.course) && !options.config.programmes.includes(r.course)) {
      issues.push(notApproved("enrolment", "Course", r.course));
    }

    const date = new Date(r.registrationDate).getTime();
    if (!isBlank(r.registrationDate) && Number.isNaN(date)) {
      issues.push(inconsistent("enrolment", `${label} - Registration date`, "Registration date is not a valid date"));
    }
    // A registration dated in the future has not happened yet. Counting it would
    // inflate enrolment with learners who have not started.
    const today = (options.today ?? new Date()).getTime();
    if (!Number.isNaN(date) && date > today) {
      issues.push(inconsistent("enrolment", `${label} - Registration date`, "Registration date is in the future"));
    }

    // The same learner on the same course twice means the register is either
    // duplicated or the learner was re-registered after withdrawing, which is a
    // different fact and belongs in the Dropouts section as a re-enrolment.
    if (!isBlank(r.learner) && !isBlank(r.course)) {
      const key = `${r.learner.trim().toLowerCase()}|${r.course.trim().toLowerCase()}`;
      if (seen.has(key)) {
        issues.push(
          inconsistent(
            "enrolment",
            `${label} - Learner`,
            `Duplicate registration: ${r.learner} is already on ${r.course}. A re-enrolment belongs in Dropouts as a re-enrolment.`
          )
        );
      }
      seen.add(key);
    }

  });

  return issues;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

function validateAttendance(report: OperationsReport): OperationsValidationIssue[] {
  const data = report.attendance;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("attendance", "At least one attendance record (or mark the section Not Applicable)"));
    return issues;
  }

  data.records.forEach((r, i) => {
    const label = `Attendance ${i + 1}`;
    if (isBlank(r.course)) issues.push(missing("attendance", `${label} - Course`));
    if (isBlank(r.sessionDate)) issues.push(missing("attendance", `${label} - Session date`));
    if (r.registered === null) issues.push(missing("attendance", `${label} - Registered`));
    if (r.attended === null) issues.push(missing("attendance", `${label} - Attended`));

    // Attendance above registration is impossible, and it is the one error that
    // would push the rate above 100% - a programme looking better than it is.
    if (typeof r.attended === "number" && typeof r.registered === "number" && r.attended > r.registered) {
      issues.push(
        inconsistent(
          "attendance",
          `${label} - Attended`,
          `Attended (${r.attended}) exceeds registered (${r.registered})`
        )
      );
    }
    if (typeof r.attended === "number" && r.attended < 0) {
      issues.push(inconsistent("attendance", `${label} - Attended`, "Attended cannot be negative"));
    }
    if (typeof r.registered === "number" && r.registered < 0) {
      issues.push(inconsistent("attendance", `${label} - Registered`, "Registered cannot be negative"));
    }
    if (
      typeof r.excusedAbsences === "number" &&
      typeof r.registered === "number" &&
      r.excusedAbsences > r.registered
    ) {
      issues.push(
        inconsistent(
          "attendance",
          `${label} - Excused absences`,
          `Excused absences (${r.excusedAbsences}) exceed the register (${r.registered})`
        )
      );
    }
    const d = new Date(r.sessionDate).getTime();
    if (!isBlank(r.sessionDate) && Number.isNaN(d)) {
      issues.push(inconsistent("attendance", `${label} - Session date`, "Session date is not a valid date"));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Training delivery
// ---------------------------------------------------------------------------

function validateTraining(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationIssue[] {
  const data = report.training;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("training", "At least one training record (or mark the section Not Applicable)"));
    return issues;
  }

  data.records.forEach((r, i) => {
    const label = `Training ${i + 1}`;
    if (isBlank(r.course)) issues.push(missing("training", `${label} - Course`));
    if (isBlank(r.startDate)) issues.push(missing("training", `${label} - Start date`));
    if (r.hours === null) issues.push(missing("training", `${label} - Hours delivered`));

    if (typeof r.hours === "number" && r.hours <= 0) {
      issues.push(inconsistent("training", `${label} - Hours delivered`, "Delivered hours must be greater than zero"));
    }
    if (typeof r.capacity === "number" && r.capacity < 0) {
      issues.push(inconsistent("training", `${label} - Capacity`, "Capacity cannot be negative"));
    }
    // More learners started than there are places: either the cohort
    // over-subscribed or the capacity figure is wrong. Either way the fill rate
    // is meaningless until it is resolved.
    if (
      typeof r.learnersStarted === "number" &&
      typeof r.capacity === "number" &&
      r.capacity > 0 &&
      r.learnersStarted > r.capacity
    ) {
      issues.push(
        inconsistent(
          "training",
          `${label} - Learners started`,
          `Learners started (${r.learnersStarted}) exceeds capacity (${r.capacity})`
        )
      );
    }

    const start = new Date(r.startDate).getTime();
    const end = new Date(r.endDate).getTime();
    if (!isBlank(r.endDate)) {
      if (Number.isNaN(end)) {
        issues.push(inconsistent("training", `${label} - End date`, "End date is not a valid date"));
      } else if (!Number.isNaN(start) && end < start) {
        issues.push(inconsistent("training", `${label} - End date`, "End date cannot be before the start date"));
      }
    }

    if (!isBlank(r.deliveryMode) && !options.config.deliveryModes.includes(r.deliveryMode as never)) {
      issues.push(notApproved("training", "Delivery mode", r.deliveryMode));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

function validateCompletion(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationIssue[] {
  const data = report.completion;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("completion", "At least one completion record (or mark the section Not Applicable)"));
    return issues;
  }

  data.records.forEach((r, i) => {
    const label = `Completion ${i + 1}`;
    if (isBlank(r.learner)) issues.push(missing("completion", `${label} - Learner`));
    if (isBlank(r.course)) issues.push(missing("completion", `${label} - Course`));
    if (isBlank(r.outcome)) issues.push(missing("completion", `${label} - Outcome`));

    // Every completion record is an event, so it always carries the date it
    // happened - including a withdrawal. An outcome with no date cannot be
    // placed in the reporting period, so it would be counted in whichever term
    // happened to load it.
    if (isBlank(r.completionDate)) {
      issues.push(missing("completion", `${label} - Completion date`));
    }
    if (!isBlank(r.completionDate) && Number.isNaN(new Date(r.completionDate).getTime())) {
      issues.push(inconsistent("completion", `${label} - Completion date`, "Completion date is not a valid date"));
    }
    // A learner cannot have completed a course that finishes after today.
    const finished = new Date(r.completionDate).getTime();
    if (!Number.isNaN(finished) && finished > (options.today ?? new Date()).getTime()) {
      issues.push(inconsistent("completion", `${label} - Completion date`, "Completion date is in the future"));
    }

    // Certified without a completion is a contradiction an executive would act on.
    if (r.certified && r.outcome !== "Completed") {
      issues.push(
        inconsistent(
          "completion",
          `${label} - Certified`,
          `Recorded as certified but the outcome is "${r.outcome || "Unspecified"}"`
        )
      );
    }

    if (!isBlank(r.outcome) && !options.config.completionOutcomes.includes(r.outcome as never)) {
      issues.push(notApproved("completion", "Outcome", r.outcome));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Dropouts
// ---------------------------------------------------------------------------

function validateDropouts(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationIssue[] {
  const data = report.dropouts;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("dropouts", "At least one dropout record (or mark the section Not Applicable)"));
    return issues;
  }

  data.records.forEach((r, i) => {
    const label = `Dropout ${i + 1}`;
    if (isBlank(r.learner)) issues.push(missing("dropouts", `${label} - Learner`));
    if (isBlank(r.course)) issues.push(missing("dropouts", `${label} - Course`));
    if (isBlank(r.withdrawalDate)) issues.push(missing("dropouts", `${label} - Withdrawal date`));
    // Without a reason the dropout register cannot answer the only question it
    // exists for: why are learners leaving?
    if (isBlank(r.reason)) issues.push(missing("dropouts", `${label} - Reason`));

    if (typeof r.weeksCompleted === "number" && r.weeksCompleted < 0) {
      issues.push(inconsistent("dropouts", `${label} - Weeks completed`, "Weeks completed cannot be negative"));
    }
    if (!isBlank(r.withdrawalDate) && Number.isNaN(new Date(r.withdrawalDate).getTime())) {
      issues.push(inconsistent("dropouts", `${label} - Withdrawal date`, "Withdrawal date is not a valid date"));
    }

    // A dropout recorded as leaving in the future has not left.
    const today = (options.today ?? new Date()).getTime();
    const w = new Date(r.withdrawalDate).getTime();
    if (!Number.isNaN(w) && w > today) {
      issues.push(inconsistent("dropouts", `${label} - Withdrawal date`, "Withdrawal date is in the future"));
    }

    if (!isBlank(r.reason) && !options.config.dropoutReasons.includes(r.reason as never)) {
      issues.push(notApproved("dropouts", "Reason", r.reason));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function validateProjects(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationIssue[] {
  const data = report.projects;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("projects", "At least one project record (or mark the section Not Applicable)"));
    return issues;
  }

  const seen = new Set<string>();
  data.records.forEach((r, i) => {
    const label = `Project ${i + 1}`;
    if (isBlank(r.projectName)) issues.push(missing("projects", `${label} - Project name`));
    if (isBlank(r.type)) issues.push(missing("projects", `${label} - Type`));
    if (isBlank(r.status)) issues.push(missing("projects", `${label} - Status`));
    // A project with no start date cannot be compared with its plan at all.
    if (isBlank(r.startDate)) issues.push(missing("projects", `${label} - Start date`));
    // Without a review date there is no way to tell a current status from a
    // status somebody typed months ago and never revisited.
    if (isBlank(r.lastReviewed)) issues.push(missing("projects", `${label} - Last reviewed`));

    if (!isBlank(r.projectName)) {
      const key = r.projectName.trim().toLowerCase();
      if (seen.has(key)) {
        issues.push(inconsistent("projects", `${label} - Project name`, `Duplicate project "${r.projectName}"`));
      }
      seen.add(key);
    }

    const start = new Date(r.startDate).getTime();
    const planned = new Date(r.plannedEndDate).getTime();
    const actual = new Date(r.actualEndDate).getTime();
    if (!isBlank(r.plannedEndDate) && !Number.isNaN(planned) && !Number.isNaN(start) && planned < start) {
      issues.push(inconsistent("projects", `${label} - Planned end date`, "Planned end date cannot be before the start date"));
    }
    if (!isBlank(r.actualEndDate) && Number.isNaN(actual)) {
      issues.push(inconsistent("projects", `${label} - Actual end date`, "Actual end date is not a valid date"));
    }
    // A project that finished before it started did not happen; one of the two
    // dates is wrong and the slippage figures depend on which.
    if (!isBlank(r.actualEndDate) && !Number.isNaN(actual) && !Number.isNaN(start) && actual < start) {
      issues.push(inconsistent("projects", `${label} - Actual end date`, "Actual end date cannot be before the start date"));
    }
    if (r.status === "Completed" && isBlank(r.actualEndDate)) {
      issues.push(missing("projects", `${label} - Actual end date`));
    }
    if (r.status === "Not Started" && !Number.isNaN(start) && start < (options.today ?? new Date()).getTime()) {
      issues.push(
        inconsistent("projects", `${label} - Status`, "Still recorded as Not Started after its start date has passed")
      );
    }
    if (typeof r.beneficiaries === "number" && r.beneficiaries < 0) {
      issues.push(inconsistent("projects", `${label} - Beneficiaries`, "Beneficiaries cannot be negative"));
    }

    if (!isBlank(r.type) && !options.config.projectTypes.includes(r.type as never)) {
      issues.push(notApproved("projects", "Type", r.type));
    }
    // A project can only be linked to a course that is actually on the programme
    // list, or the training and project reports stop agreeing about what Buhle
    // delivers.
    if (!isBlank(r.linkedCourse) && !options.config.programmes.includes(r.linkedCourse)) {
      issues.push(notApproved("projects", "Course", r.linkedCourse));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function validateAssets(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationIssue[] {
  const data = report.assets;
  if (data.notApplicable) return [];

  const issues: OperationsValidationIssue[] = [];
  if (data.records.length === 0) {
    issues.push(missing("assets", "At least one asset record (or mark the section Not Applicable)"));
    return issues;
  }

  const seen = new Set<string>();
  data.records.forEach((r, i) => {
    const label = `Asset ${i + 1}`;
    if (isBlank(r.assetName)) issues.push(missing("assets", `${label} - Asset name`));
    // Without a tag an asset cannot be de-duplicated, located on a floor, or
    // reconciled with a procurement invoice.
    if (isBlank(r.assetTag)) issues.push(missing("assets", `${label} - Asset tag`));
    // Without a category the register cannot be grouped or valued by type.
    if (isBlank(r.category)) issues.push(missing("assets", `${label} - Category`));
    if (isBlank(r.status)) issues.push(missing("assets", `${label} - Status`));

    if (!isBlank(r.assetTag)) {
      const key = r.assetTag.trim().toLowerCase();
      if (seen.has(key)) {
        issues.push(inconsistent("assets", `${label} - Asset tag`, `Duplicate asset tag "${r.assetTag}"`));
      }
      seen.add(key);
    }

    if (typeof r.replacementValue === "number" && r.replacementValue < 0) {
      issues.push(inconsistent("assets", `${label} - Replacement value`, "Replacement value cannot be negative"));
    }
    if (!isBlank(r.acquisitionDate) && Number.isNaN(new Date(r.acquisitionDate).getTime())) {
      issues.push(inconsistent("assets", `${label} - Acquisition date`, "Acquisition date is not a valid date"));
    }
    // An asset acquired in the future has not arrived. Including it would inflate
    // the register and depress the in-service rate for stock still in transit.
    const acquired = new Date(r.acquisitionDate).getTime();
    if (!Number.isNaN(acquired) && acquired > (options.today ?? new Date()).getTime()) {
      issues.push(inconsistent("assets", `${label} - Acquisition date`, "Acquisition date is in the future"));
    }

    // An asset in use needs somebody responsible for it, or it has no custodian
    // when it breaks.
    if (r.status === "In Use" && isBlank(r.custodian)) {
      issues.push(missing("assets", `${label} - Custodian`));
    }
    // Disposed without a date leaves an asset on the register with no record of
    // when it left, which is how a register stops agreeing with the floor.
    if (r.status === "Disposed" && isBlank(r.disposalDate)) {
      issues.push(missing("assets", `${label} - Disposal date`));
    }
    if (!isBlank(r.disposalDate) && r.status !== "Disposed") {
      issues.push(
        inconsistent("assets", `${label} - Disposal date`, "A disposal date is recorded but the status is not Disposed")
      );
    }

    if (!isBlank(r.category) && !options.config.assetCategories.includes(r.category)) {
      issues.push(notApproved("assets", "Category", r.category));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-section conflicts
// ---------------------------------------------------------------------------

/**
 * The conflicts that only appear when two sections are read together.
 *
 * These are the ones worth blocking on, because each of them produces a figure
 * that looks reasonable and is wrong.
 */
function validateCrossSection(report: OperationsReport): OperationsValidationIssue[] {
  const issues: OperationsValidationIssue[] = [];
  const enrolments = report.enrolment.records;
  const completions = report.completion.records;
  const dropouts = report.dropouts.records;
  const training = report.training.records;

  // Weeks a learner reports having completed, against the length of the course in
  // the training records. A dropout who studied longer than the course lasts has
  // been recorded against the wrong course, or the course dates are wrong.
  const courseWeeks = new Map<string, number>();
  for (const t of training) {
    if (!t.course || !t.startDate || !t.endDate) continue;
    const days = (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000;
    if (Number.isFinite(days) && days > 0) {
      courseWeeks.set(t.course, Math.max(courseWeeks.get(t.course) ?? 0, Math.round(days / 7)));
    }
  }
  dropouts.forEach((r, i) => {
    if (typeof r.weeksCompleted !== "number") return;
    const weeks = courseWeeks.get(r.course);
    if (weeks !== undefined && r.weeksCompleted > weeks) {
      issues.push(
        inconsistent(
          "dropouts",
          `Dropout ${i + 1} - Weeks completed`,
          `${r.weeksCompleted} weeks completed, but ${r.course} runs for ${weeks}`
        )
      );
    }
  });

  const enrolKey = (learner: string, course: string) =>
    `${learner.trim().toLowerCase()}|${course.trim().toLowerCase()}`;

  const enrolledAt = new Map<string, string>();
  for (const r of enrolments) {
    if (!isBlank(r.learner) && !isBlank(r.course) && !isBlank(r.registrationDate)) {
      enrolledAt.set(enrolKey(r.learner, r.course), r.registrationDate);
    }
  }

  // A learner cannot complete a course they had not yet registered for, and
  // cannot withdraw from one either.
  for (const [i, c] of completions.entries()) {
    if (isBlank(c.learner) || isBlank(c.course) || isBlank(c.completionDate)) continue;
    const reg = enrolledAt.get(enrolKey(c.learner, c.course));
    if (reg && new Date(c.completionDate).getTime() < new Date(reg).getTime()) {
      issues.push(
        inconsistent(
          "completion",
          `Completion ${i + 1} - Completion date`,
          `Completed before ${c.learner} registered for ${c.course} on ${reg}`
        )
      );
    }
  }
  for (const [i, d] of dropouts.entries()) {
    if (isBlank(d.learner) || isBlank(d.course) || isBlank(d.withdrawalDate)) continue;
    const reg = enrolledAt.get(enrolKey(d.learner, d.course));
    if (reg && new Date(d.withdrawalDate).getTime() < new Date(reg).getTime()) {
      issues.push(
        inconsistent(
          "dropouts",
          `Dropout ${i + 1} - Withdrawal date`,
          `Withdrew before ${d.learner} registered for ${d.course} on ${reg}`
        )
      );
    }
  }

  // Completed AND withdrawn from the same course. Each record is plausible on its
  // own; together they are impossible, and the completion rate would take
  // whichever one happened to load last.
  const completedKeys = new Map<string, number>();
  for (const [i, c] of completions.entries()) {
    if (c.outcome !== "Completed" || isBlank(c.learner) || isBlank(c.course)) continue;
    const key = enrolKey(c.learner, c.course);
    if (completedKeys.has(key)) {
      issues.push(
        inconsistent("completion", `Completion ${i + 1} - Learner`, `Duplicate completion record for ${c.learner} on ${c.course}`)
      );
    }
    completedKeys.set(key, i);
  }
  for (const [i, d] of dropouts.entries()) {
    if (isBlank(d.learner) || isBlank(d.course)) continue;
    const key = enrolKey(d.learner, d.course);
    if (completedKeys.has(key)) {
      issues.push(
        inconsistent(
          "dropouts",
          `Dropout ${i + 1} - Reason`,
          `${d.learner} is recorded as both completed and withdrawn from ${d.course}. Resolve which outcome actually happened.`
        )
      );
    }
  }

  // A project that links to a course nobody delivered this period.
  for (const [i, p] of report.projects.records.entries()) {
    if (isBlank(p.linkedCourse)) continue;
    const delivered = report.training.records.some((t) => t.course === p.linkedCourse);
    if (!delivered) {
      issues.push(
        inconsistent(
          "projects",
          `Project ${i + 1} - Linked course`,
          `Linked course "${p.linkedCourse}" has no delivery record in this submission`
        )
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const SECTION_VALIDATORS: Record<
  OperationsSectionKey,
  (report: OperationsReport, options: ValidateOperationsOptions) => OperationsValidationIssue[]
> = {
  enrolment: validateEnrolment,
  attendance: validateAttendance,
  training: validateTraining,
  completion: validateCompletion,
  dropouts: validateDropouts,
  projects: validateProjects,
  assets: validateAssets,
};

function isNotApplicable(report: OperationsReport, key: OperationsSectionKey): boolean {
  switch (key) {
    case "enrolment":
      return report.enrolment.notApplicable;
    case "attendance":
      return report.attendance.notApplicable;
    case "training":
      return report.training.notApplicable;
    case "completion":
      return report.completion.notApplicable;
    case "dropouts":
      return report.dropouts.notApplicable;
    case "projects":
      return report.projects.notApplicable;
    case "assets":
      return report.assets.notApplicable;
  }
}

export function validateOperationsReport(
  report: OperationsReport,
  options: ValidateOperationsOptions
): OperationsValidationResult {
  const bySection = {} as Record<OperationsSectionKey, OperationsSectionValidation>;

  OPERATIONS_SECTION_KEYS.forEach((key) => {
    const issues = SECTION_VALIDATORS[key](report, options);
    bySection[key] = {
      state: issues.length > 0 ? "incomplete" : isNotApplicable(report, key) ? "not_applicable" : "complete",
      issues,
    };
  });

  // Cross-section issues are attributed to the section they concern, so the
  // progress strip reflects them too.
  for (const issue of validateCrossSection(report)) {
    bySection[issue.section].issues.push(issue);
    if (bySection[issue.section].state === "complete") bySection[issue.section].state = "incomplete";
  }

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  return { valid: issues.length === 0, issues, bySection };
}

export function summariseOperationsIssues(
  issues: OperationsValidationIssue[]
): { section: OperationsSectionKey; label: string; lines: string[] }[] {
  const grouped = new Map<OperationsSectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({
    section,
    label: OPERATIONS_SECTION_LABELS[section],
    lines,
  }));
}