import { LEAVE_TYPES, type HrReport, type HrSectionKey } from "../types/hr";
import { summariseRecruitment, calculateTrainingCompletion } from "./hrEngine";

/**
 * ============================================================================
 * HR submission validation (Section 18).
 * ============================================================================
 *
 * "Do not silently submit incomplete information." A submission either has
 * everything the configured rules require, or it is refused with a precise list
 * of what is missing - each item naming its section, so the manager can jump
 * straight to the field rather than hunting for it.
 *
 * Two rules shape what is required:
 *  - A section explicitly marked Not Applicable is satisfied, not skipped. A
 *    department with no vacancies this month must not be blocked from
 *    submitting because a vacancy table is empty.
 *  - Performance is never "missing". While no formal PMS exists it reports Not
 *    Yet Available (Section 8), which is a legitimate, submittable state.
 */

export interface ValidationIssue {
  section: HrSectionKey;
  /** Human label for the specific missing field, e.g. "Total expected employee-days". */
  field: string;
  message: string;
}

export interface SectionValidation {
  state: "complete" | "incomplete" | "attention" | "not_available" | "not_applicable";
  issues: ValidationIssue[];
}

export interface HrValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  bySection: Record<HrSectionKey, SectionValidation>;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function issue(section: HrSectionKey, field: string): ValidationIssue {
  return { section, field, message: `${field} is required` };
}

// ---------------------------------------------------------------------------
// Per-section rules
// ---------------------------------------------------------------------------

function validateAttendance(report: HrReport): ValidationIssue[] {
  const a = report.attendance;
  if (a.notApplicable) return [];

  const issues: ValidationIssue[] = [];
  // Only the inputs the absenteeism formula actually consumes are mandatory.
  // Everything else in the snapshot is context, and blocking submission on
  // optional context would train managers to type junk to get past the form.
  if (a.activeEmployees === null) issues.push(issue("attendance", "Active employees"));
  if (a.workingDays === null) issues.push(issue("attendance", "Working days in period"));
  if (
    a.daysAbsent === null &&
    a.daysAbsentApproved === null &&
    a.daysAbsentUnapproved === null &&
    a.sickLeaveDays === null &&
    a.unauthorisedAbsenceDays === null
  ) {
    issues.push(issue("attendance", "Days absent (or its approved/unapproved/sick/unauthorised components)"));
  }

  // An expected-employee-days figure that contradicts the headcount and
  // working days entered is a data-entry error worth catching before it
  // silently skews the rate.
  const expected = a.expectedEmployeeDays;
  if (
    expected !== null &&
    a.activeEmployees !== null &&
    a.workingDays !== null &&
    expected > 0 &&
    Math.abs(expected - a.activeEmployees * a.workingDays) / expected > 0.1
  ) {
    issues.push({
      section: "attendance",
      field: "Total expected employee-days",
      message: `Total expected employee-days (${expected}) does not match active employees × working days (${a.activeEmployees * a.workingDays})`,
    });
  }

  if (a.daysPresent !== null && a.daysAbsent !== null && a.daysPresent + a.daysAbsent > (a.expectedEmployeeDays ?? Infinity)) {
    issues.push({
      section: "attendance",
      field: "Days present",
      message: "Days present plus days absent exceeds total expected employee-days",
    });
  }

  return issues;
}

function validateLeave(report: HrReport): ValidationIssue[] {
  const l = report.leave;
  if (l.notApplicable) return [];

  const issues: ValidationIssue[] = [];
  const anyLeaveData = LEAVE_TYPES.some((type) => l.lines[type].days !== null);
  if (!anyLeaveData && l.requestsSubmitted === null) {
    issues.push(issue("leave", "Leave days for at least one leave type (or leave request counts)"));
  }

  if (
    l.requestsSubmitted !== null &&
    (l.requestsApproved === null || l.requestsPending === null || l.requestsDeclined === null)
  ) {
    issues.push(issue("leave", "Leave requests approved / pending / declined (to match requests submitted)"));
  }

  // The request pipeline must reconcile - otherwise the dashboard reports a
  // backlog that does not exist.
  if (
    l.requestsSubmitted !== null &&
    l.requestsApproved !== null &&
    l.requestsPending !== null &&
    l.requestsDeclined !== null
  ) {
    const total = l.requestsApproved + l.requestsPending + l.requestsDeclined;
    if (total !== l.requestsSubmitted) {
      issues.push({
        section: "leave",
        field: "Leave requests",
        message: `Approved + pending + declined (${total}) does not equal requests submitted (${l.requestsSubmitted})`,
      });
    }
  }

  return issues;
}

function validatePerformance(report: HrReport): ValidationIssue[] {
  const p = report.performance;
  if (!p.systemActive) return [];

  const issues: ValidationIssue[] = [];
  if (p.dueForReview === null) issues.push(issue("performance", "Total employees due for performance review"));
  if (p.reviewsCompleted === null) issues.push(issue("performance", "Reviews completed"));

  if (
    p.dueForReview !== null &&
    p.reviewsCompleted !== null &&
    p.reviewsCompleted > p.dueForReview
  ) {
    issues.push({
      section: "performance",
      field: "Reviews completed",
      message: "Reviews completed exceeds employees due for review",
    });
  }

  if (isBlank(p.reviewPeriod)) issues.push(issue("performance", "Performance review period"));
  return issues;
}

function validateTurnover(report: HrReport): ValidationIssue[] {
  const t = report.turnover;
  if (t.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  if (t.averageHeadcount === null && t.exits.length === 0 && t.newHires.length === 0) {
    issues.push(issue("turnover", "Average headcount (or at least one employee movement)"));
  }
  if (t.averageHeadcount !== null && t.averageHeadcount <= 0) {
    issues.push({ section: "turnover", field: "Average headcount", message: "Average headcount must be greater than zero" });
  }

  // Every movement record needs enough detail to be auditable and to satisfy
  // the Section 26 requirement that movements reference a real employee code.
  t.newHires.forEach((hire, i) => {
    if (isBlank(hire.employeeCode)) {
      issues.push({ section: "turnover", field: `New hire ${i + 1}`, message: "Employee code is required" });
    }
    if (isBlank(hire.startDate)) {
      issues.push({ section: "turnover", field: `New hire ${i + 1}`, message: "Start date is required" });
    }
  });

  t.exits.forEach((exit, i) => {
    if (isBlank(exit.employeeCode)) {
      issues.push({ section: "turnover", field: `Exit ${i + 1}`, message: "Employee code is required" });
    }
    if (isBlank(exit.exitDate)) {
      issues.push({ section: "turnover", field: `Exit ${i + 1}`, message: "Exit date is required" });
    }
  });

  return issues;
}

function validateSkills(report: HrReport): ValidationIssue[] {
  const s = report.skills;
  if (s.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  s.programmes.forEach((p, i) => {
    if (isBlank(p.programme)) {
      issues.push({ section: "skills", field: `Training programme ${i + 1}`, message: "Programme name is required" });
    }
    if (p.enrolled === null) {
      issues.push({ section: "skills", field: `Training programme ${i + 1}`, message: "Number enrolled is required" });
    }
    if (p.completed !== null && p.enrolled !== null && p.completed > p.enrolled) {
      issues.push({
        section: "skills",
        field: `Training programme ${i + 1}`,
        message: "Number completed exceeds number enrolled",
      });
    }
    if (p.status === "Completed" && isBlank(p.completionDate)) {
      issues.push({
        section: "skills",
        field: `Training programme ${i + 1}`,
        message: "A completed programme needs a completion date",
      });
    }
  });

  s.gaps.forEach((g, i) => {
    if (isBlank(g.requiredSkill)) {
      issues.push({ section: "skills", field: `Skills gap ${i + 1}`, message: "Required skill is required" });
    }
    if (isBlank(g.department)) {
      issues.push({ section: "skills", field: `Skills gap ${i + 1}`, message: "Department is required" });
    }
  });

  // An "employees requiring training" figure with nothing enrolled against it
  // is almost always a half-finished entry rather than a real position.
  if (s.employeesRequiringTraining !== null && s.employeesRequiringTraining > 0 && s.programmes.length === 0) {
    issues.push({
      section: "skills",
      field: "Training programmes",
      message: "Employees are recorded as requiring training but no training programme has been entered",
    });
  }

  return issues;
}

function validateVacancies(report: HrReport): ValidationIssue[] {
  const v = report.vacancies;
  if (v.notApplicable) return [];

  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  v.vacancies.forEach((vac, i) => {
    const label = `Vacancy ${i + 1}`;
    if (isBlank(vac.vacancyId)) issues.push(issue("vacancies", `${label} - Vacancy ID`));
    if (isBlank(vac.position)) issues.push(issue("vacancies", `${label} - Position`));
    if (isBlank(vac.department)) issues.push(issue("vacancies", `${label} - Department`));
    if (isBlank(vac.hiringManager)) issues.push(issue("vacancies", `${label} - Hiring manager`));
    if (isBlank(vac.status)) issues.push(issue("vacancies", `${label} - Vacancy status`));
    if (isBlank(vac.dateOpened)) issues.push(issue("vacancies", `${label} - Date opened`));

    if (!isBlank(vac.vacancyId)) {
      if (seen.has(vac.vacancyId)) {
        issues.push({ section: "vacancies", field: `${label} - Vacancy ID`, message: `Duplicate vacancy ID "${vac.vacancyId}"` });
      }
      seen.add(vac.vacancyId);
    }

    // A filled vacancy without a fill date cannot produce a Time to Fill.
    if ((vac.status === "Filled" || vac.status === "Closed") && isBlank(vac.filledDate)) {
      issues.push({
        section: "vacancies",
        field: `${label} - Filled date`,
        message: "A filled or closed vacancy needs a filled date for Time to Fill to be calculated",
      });
    }
    // Both dates must be present for the comparison to mean anything: a negative
    // Time to Fill is otherwise computed silently from a missing date.
    if (
      !isBlank(vac.filledDate) &&
      !isBlank(vac.dateOpened) &&
      new Date(vac.filledDate).getTime() < new Date(vac.dateOpened).getTime()
    ) {
      issues.push({ section: "vacancies", field: `${label} - Filled date`, message: "Filled date cannot be before the date opened" });
    }

    const made = vac.offersMade ?? 0;
    const accepted = vac.offersAccepted ?? 0;
    const declined = vac.offersDeclined ?? 0;
    if (accepted + declined > made) {
      issues.push({
        section: "vacancies",
        field: `${label} - Offers`,
        message: "Offers accepted plus offers declined cannot exceed offers made",
      });
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const SECTION_VALIDATORS: Record<HrSectionKey, (report: HrReport) => ValidationIssue[]> = {
  attendance: validateAttendance,
  leave: validateLeave,
  performance: validatePerformance,
  turnover: validateTurnover,
  skills: validateSkills,
  vacancies: validateVacancies,
};

/**
 * Validates a whole report and classifies each section. A section with no
 * issues is still "attention" if the data it produced trips a warning, which
 * the caller determines from the EWS - so `state` here is about completeness
 * and the modal upgrades it to "attention" once it sees an Amber/Red KPI.
 */
export function validateHrReport(report: HrReport): HrValidationResult {
  const bySection = {} as Record<HrSectionKey, SectionValidation>;

  (Object.keys(SECTION_VALIDATORS) as HrSectionKey[]).forEach((key) => {
    const issues = SECTION_VALIDATORS[key](report);
    let state: SectionValidation["state"] = "complete";
    if (issues.length > 0) state = "incomplete";
    else if (isNotApplicable(report, key)) state = "not_applicable";
    else if (key === "performance" && !report.performance.systemActive) state = "not_available";
    bySection[key] = { state, issues };
  });

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  return { valid: issues.length === 0, issues, bySection };
}

function isNotApplicable(report: HrReport, key: HrSectionKey): boolean {
  switch (key) {
    case "attendance":
      return report.attendance.notApplicable;
    case "leave":
      return report.leave.notApplicable;
    case "turnover":
      return report.turnover.notApplicable;
    case "skills":
      return report.skills.notApplicable;
    case "vacancies":
      return report.vacancies.notApplicable;
    case "performance":
      return false;
  }
}

/**
 * Human-readable missing-data summary for the refusal message (Section 18).
 * Grouped by section so it reads like the specification's own example.
 */
export function summariseIssues(issues: ValidationIssue[]): { section: HrSectionKey; lines: string[] }[] {
  const grouped = new Map<HrSectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({ section, lines }));
}

/**
 * Non-blocking observations worth showing before submission: things that are
 * not errors but that the HR manager should see - e.g. cost per hire cannot be
 * derived because no cost was captured.
 */
export function hrDataNotes(report: HrReport): string[] {
  const notes: string[] = [];

  const training = calculateTrainingCompletion(report.skills);
  if (training && training.overdueProgrammes.length > 0) {
    notes.push(`${training.overdueProgrammes.length} training programme(s) are past their completion date.`);
  }
  if (training && training.gapsWithoutPlan > 0) {
    notes.push(`${training.gapsWithoutPlan} skills gap(s) have no development action recorded.`);
  }

  const recruitment = summariseRecruitment(report.vacancies);
  if (recruitment) {
    if (recruitment.costPerHire === null) {
      notes.push("Cost per Hire: data not available - no recruitment or hiring costs were captured.");
    }
    if (recruitment.pastRequiredStart.length > 0) {
      notes.push(`${recruitment.pastRequiredStart.length} vacancy(ies) are past their required start date and still open.`);
    }
    if (recruitment.repeatedRejections.length > 0) {
      notes.push(`${recruitment.repeatedRejections.length} vacancy(ies) have had two or more offers declined.`);
    }
  }

  return notes;
}