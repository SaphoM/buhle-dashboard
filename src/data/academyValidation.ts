import {
  ACADEMY_SECTION_KEYS,
  ACADEMY_SECTION_LABELS,
  type AcademyConfig,
  type AcademyReport,
  type AcademySectionKey,
} from "../types/academy";

/**
 * ============================================================================
 * Academy submission validation.
 * ============================================================================
 *
 * Same rule as every other register department: a submission either carries
 * what the calculations need, or it is refused with a list naming the section
 * and the field. Required fields are limited to what a KPI actually consumes,
 * so nobody is trained to type junk to get past the gate.
 *
 * The contradictions this catches are the ones that would otherwise produce an
 * impossible rate: more registered than accepted, more accepted than applied,
 * a Certified learner with no certificate date, an Accredited programme with no
 * accrediting body.
 */

export interface AcademyValidationIssue {
  section: AcademySectionKey;
  field: string;
  message: string;
  kind?: "missing" | "inconsistent";
}

export interface AcademySectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: AcademyValidationIssue[];
}

export interface AcademyValidationResult {
  valid: boolean;
  issues: AcademyValidationIssue[];
  bySection: Record<AcademySectionKey, AcademySectionValidation>;
}

export interface ValidateAcademyOptions {
  config: AcademyConfig;
  today?: Date;
}

const isBlank = (v: string | null | undefined) => v === null || v === undefined || String(v).trim() === "";
const isNegative = (v: number | null | undefined) => typeof v === "number" && v < 0;
const isFuture = (iso: string, today: Date) => Boolean(iso) && new Date(iso).getTime() > today.getTime();

function missing(section: AcademySectionKey, field: string): AcademyValidationIssue {
  return { section, field, message: `${field} is required`, kind: "missing" };
}

function inconsistent(section: AcademySectionKey, field: string, message: string): AcademyValidationIssue {
  return { section, field, message, kind: "inconsistent" };
}

function notApproved(section: AcademySectionKey, field: string, value: string): AcademyValidationIssue {
  return inconsistent(
    section,
    field,
    `"${value}" is not an approved ${field.split(" - ").pop()?.toLowerCase() ?? "value"} - add it in Administration or correct the record`
  );
}

function validateProgrammes(report: AcademyReport, { config }: ValidateAcademyOptions): AcademyValidationIssue[] {
  const issues: AcademyValidationIssue[] = [];
  const seen = new Map<string, number>();

  report.programmes.records.forEach((r, i) => {
    const n = `Programme ${i + 1}`;
    if (isBlank(r.name)) issues.push(missing("programmes", `${n} - Name`));
    if (isBlank(r.status)) issues.push(missing("programmes", `${n} - Status`));
    else if (!config.programmeStatuses.includes(r.status as never)) {
      issues.push(notApproved("programmes", `${n} - Status`, r.status));
    }
    if (isBlank(r.accreditationStatus)) issues.push(missing("programmes", `${n} - Accreditation status`));
    else if (!config.accreditationStatuses.includes(r.accreditationStatus as never)) {
      issues.push(notApproved("programmes", `${n} - Accreditation status`, r.accreditationStatus));
    }
    if (isNegative(r.nqfLevel) || (r.nqfLevel !== null && r.nqfLevel > 10)) {
      issues.push(inconsistent("programmes", `${n} - NQF level`, "NQF level must be between 1 and 10"));
    }
    if (r.accreditationStatus === "Accredited") {
      if (isBlank(r.accreditingBody) || r.accreditingBody === "None") {
        issues.push(
          inconsistent("programmes", `${n} - Accrediting body`, "An accredited programme must name the body that accredited it")
        );
      }
      if (isBlank(r.accreditationExpiry)) issues.push(missing("programmes", `${n} - Accreditation expiry`));
    }

    const key = r.name.trim().toLowerCase();
    if (key) {
      if (seen.has(key)) {
        issues.push(
          inconsistent("programmes", `${n} - Name`, `"${r.name}" appears more than once. One row per programme.`)
        );
      }
      seen.set(key, i);
    }
  });

  return issues;
}

function validateIntakes(report: AcademyReport, options: ValidateAcademyOptions): AcademyValidationIssue[] {
  const issues: AcademyValidationIssue[] = [];
  const today = options.today ?? new Date();

  report.intakes.records.forEach((r, i) => {
    const n = `Intake ${i + 1}`;
    if (isBlank(r.programme)) issues.push(missing("intakes", `${n} - Programme`));
    if (isBlank(r.intake)) issues.push(missing("intakes", `${n} - Intake`));
    if (isBlank(r.startDate)) issues.push(missing("intakes", `${n} - Start date`));
    else if (isFuture(r.startDate, today)) {
      issues.push(inconsistent("intakes", `${n} - Start date`, "Start date is in the future"));
    }
    if (r.capacity === null) issues.push(missing("intakes", `${n} - Capacity`));
    if (r.learnersRegistered === null) issues.push(missing("intakes", `${n} - Learners registered`));

    for (const [key, label] of [
      ["capacity", "Capacity"],
      ["applicationsReceived", "Applications received"],
      ["applicationsAccepted", "Applications accepted"],
      ["learnersRegistered", "Learners registered"],
    ] as const) {
      if (isNegative(r[key])) issues.push(inconsistent("intakes", `${n} - ${label}`, `${label} cannot be negative`));
    }

    // The funnel has to run downwards, or a rate above 100% follows.
    if (r.applicationsReceived !== null && r.applicationsAccepted !== null && r.applicationsAccepted > r.applicationsReceived) {
      issues.push(
        inconsistent(
          "intakes",
          `${n} - Applications accepted`,
          `${r.applicationsAccepted} accepted from ${r.applicationsReceived} applications, which would be an acceptance rate above 100%`
        )
      );
    }
    if (r.applicationsAccepted !== null && r.learnersRegistered !== null && r.learnersRegistered > r.applicationsAccepted) {
      issues.push(
        inconsistent(
          "intakes",
          `${n} - Learners registered`,
          `${r.learnersRegistered} registered from only ${r.applicationsAccepted} accepted. A learner cannot register without being accepted.`
        )
      );
    }
  });

  return issues;
}

function validateAssessments(report: AcademyReport, options: ValidateAcademyOptions): AcademyValidationIssue[] {
  const issues: AcademyValidationIssue[] = [];
  const today = options.today ?? new Date();

  report.assessments.records.forEach((r, i) => {
    const n = `Assessment ${i + 1}`;
    if (isBlank(r.learner)) issues.push(missing("assessments", `${n} - Learner`));
    if (isBlank(r.programme)) issues.push(missing("assessments", `${n} - Programme`));
    if (isBlank(r.module)) issues.push(missing("assessments", `${n} - Module`));
    if (isBlank(r.assessmentDate)) issues.push(missing("assessments", `${n} - Assessment date`));
    else if (isFuture(r.assessmentDate, today)) {
      issues.push(inconsistent("assessments", `${n} - Assessment date`, "Assessment date is in the future"));
    }
    if (isBlank(r.result)) issues.push(missing("assessments", `${n} - Result`));
    else if (!options.config.assessmentResults.includes(r.result as never)) {
      issues.push(notApproved("assessments", `${n} - Result`, r.result));
    }
    if (r.result === "Absent" && r.moderated) {
      issues.push(
        inconsistent("assessments", `${n} - Moderated`, "An absent learner has no result to moderate")
      );
    }
  });

  return issues;
}

function validateCertification(report: AcademyReport, options: ValidateAcademyOptions): AcademyValidationIssue[] {
  const issues: AcademyValidationIssue[] = [];
  const today = options.today ?? new Date();

  report.certification.records.forEach((r, i) => {
    const n = `Completer ${i + 1}`;
    if (isBlank(r.learner)) issues.push(missing("certification", `${n} - Learner`));
    if (isBlank(r.programme)) issues.push(missing("certification", `${n} - Programme`));
    if (isBlank(r.completionDate)) issues.push(missing("certification", `${n} - Completion date`));
    else if (isFuture(r.completionDate, today)) {
      issues.push(inconsistent("certification", `${n} - Completion date`, "Completion date is in the future"));
    }
    if (isBlank(r.status)) issues.push(missing("certification", `${n} - Status`));
    else if (!options.config.certificationStatuses.includes(r.status as never)) {
      issues.push(notApproved("certification", `${n} - Status`, r.status));
    }

    if (r.status === "Certified" && isBlank(r.certificateDate)) {
      issues.push(missing("certification", `${n} - Certificate date`));
    }
    if (r.status !== "Certified" && !isBlank(r.certificateDate)) {
      issues.push(
        inconsistent(
          "certification",
          `${n} - Certificate date`,
          "A certificate date is recorded but the status is not Certified. Update the status or clear the date."
        )
      );
    }
    if (r.certificateDate && r.completionDate && new Date(r.certificateDate) < new Date(r.completionDate)) {
      issues.push(
        inconsistent("certification", `${n} - Certificate date`, "Certificate was issued before the learner completed")
      );
    }
    if (r.graduated && r.status === "Withheld") {
      issues.push(
        inconsistent(
          "certification",
          `${n} - Graduated`,
          "Marked as graduated while the certificate is withheld. Confirm the learner's status before they join the Alumni population."
        )
      );
    }
  });

  return issues;
}

const SECTION_VALIDATORS: Record<
  AcademySectionKey,
  (report: AcademyReport, options: ValidateAcademyOptions) => AcademyValidationIssue[]
> = {
  programmes: validateProgrammes,
  intakes: validateIntakes,
  assessments: validateAssessments,
  certification: validateCertification,
};

export function validateAcademyReport(report: AcademyReport, options: ValidateAcademyOptions): AcademyValidationResult {
  const bySection = {} as Record<AcademySectionKey, AcademySectionValidation>;

  for (const key of ACADEMY_SECTION_KEYS) {
    const section = report[key];
    if (section.notApplicable) {
      bySection[key] = { state: "not_applicable", issues: [] };
      continue;
    }
    const issues = SECTION_VALIDATORS[key](report, options);
    // An empty register that has not been marked Not Applicable is a gap, not
    // a result: it blocks submission rather than quietly deriving nothing.
    if (section.records.length === 0) {
      issues.push({
        section: key,
        field: ACADEMY_SECTION_LABELS[key],
        message: "No rows recorded. Add rows, or mark the section Not Applicable for this period.",
        kind: "missing",
      });
    }
    bySection[key] = { state: issues.length > 0 ? "incomplete" : "complete", issues };
  }

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  return { valid: issues.length === 0, issues, bySection };
}

/** Issues grouped by section, for the refusal panel. */
export function summariseAcademyIssues(
  issues: AcademyValidationIssue[]
): { section: AcademySectionKey; label: string; lines: string[] }[] {
  const grouped = new Map<AcademySectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({ section, label: ACADEMY_SECTION_LABELS[section], lines }));
}
