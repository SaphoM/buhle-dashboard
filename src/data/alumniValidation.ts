import {
  ALUMNI_SECTION_KEYS,
  ALUMNI_SECTION_LABELS,
  type AlumniConfig,
  type AlumniReport,
  type AlumniSectionKey,
} from "../types/alumni";
import { isEconomicallyActive } from "./alumniEngine";

/**
 * ============================================================================
 * Alumni submission validation.
 * ============================================================================
 *
 * The same governing rule as every other department: a submission either
 * carries what the configured rules require, or it is refused with a precise
 * list naming the section and the field.
 *
 * What is different about Alumni is that it has a gate no other department has,
 * and it comes FIRST.
 *
 * ---------------------------------------------------------------------------
 * THE COHORT GATE
 * ---------------------------------------------------------------------------
 *
 * A tracer study has a denominator, and if the denominator is missing the rates
 * below it are meaningless. If the report says 12 graduates were traced and
 * records 8 of them in employment, then 8/12 = 67% is a fact about those 12
 * people and a guess about the cohort they came from. Nothing else on this page
 * can be checked until the department has said how big the cohort is and how
 * many of them it reached.
 *
 * So: no section can be submitted until the cohort size and the number traced are
 * both entered, and traced can never exceed the cohort.
 *
 * ---------------------------------------------------------------------------
 * BLOCKING VERSUS ATTENTION
 * ---------------------------------------------------------------------------
 *
 * Every other department in this dashboard has one kind of issue: blocking. That
 * is the right model for most data entry, because an unfinished field is a gap
 * somebody can go and fill in.
 *
 * It is the wrong model here, for one specific case. A 40% response rate is not
 * a data-entry error. It is a true fact about a difficult tracing exercise, and
 * refusing the submission until the response rate improves would mean the
 * department could never report on a cohort it struggled to reach - which is
 * precisely the cohort whose situation most needs reporting.
 *
 * So Alumni validation issues carry a `blocking` flag:
 *
 *  - Blocking issues are contradictions and gaps that somebody can fix by typing
 *    the right thing. These refuse the submission.
 *
 *  - Non-blocking issues are facts the department must state, not fix. A thin
 *    response rate, an unverifiable status, a loan in arrears. These are carried
 *    through to the review page, where the manager must acknowledge them and
 *    write a commentary before submitting.
 *
 * This is a deliberate divergence from the other departments, and the reason is
 * specific to Alumni rather than a preference for softer rules.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT REQUIRED
 * ---------------------------------------------------------------------------
 *
 * Required fields are limited to what a derived figure actually consumes.
 *
 * A monthly income is never required, because income is not in any KPI and a
 * graduate who will not say what they earn must not stop a submission.
 *
 * An area in hectares is not required, because a livestock-only line has no
 * area. A reason for closure is required the moment a business is closed, and
 * only then: while it trades there is nothing to explain.
 *
 * A referral outcome is not required, because "Awaiting decision" and
 * "Unreachable" are the honest answers and the vocabulary must contain them.
 *
 * A start date is not required for a business, but without one there is no
 * survival duration to report, which is surfaced rather than blocked.
 */

export type AlumniIssueKind = "missing" | "inconsistent" | "notApproved";

export interface AlumniValidationIssue {
  section: AlumniSectionKey;
  field: string;
  message: string;
  kind: AlumniIssueKind;
  /**
   * Whether this issue refuses submission. False means the department must
   * acknowledge it, not fix it. See the note above.
   */
  blocking: boolean;
}

export interface AlumniSectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: AlumniValidationIssue[];
}

export interface AlumniValidationResult {
  /** True when no BLOCKING issue exists. Non-blocking issues are listed too. */
  valid: boolean;
  issues: AlumniValidationIssue[];
  blockingIssues: AlumniValidationIssue[];
  /** The ones a manager must acknowledge and write about before submitting. */
  attentionIssues: AlumniValidationIssue[];
  bySection: Record<AlumniSectionKey, AlumniSectionValidation>;
}

export interface ValidateAlumniOptions {
  config: AlumniConfig;
  today?: Date;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function missing(section: AlumniSectionKey, field: string, message: string): AlumniValidationIssue {
  return { section, field, message, kind: "missing", blocking: true };
}

function inconsistent(section: AlumniSectionKey, field: string, message: string): AlumniValidationIssue {
  return { section, field, message, kind: "inconsistent", blocking: true };
}

function notApproved(section: AlumniSectionKey, field: string, message: string): AlumniValidationIssue {
  return { section, field, message, kind: "notApproved", blocking: true };
}

/** A fact the department states rather than fixes. */
function attention(section: AlumniSectionKey, field: string, message: string): AlumniValidationIssue {
  return { section, field, message, kind: "inconsistent", blocking: false };
}

function posNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ---------------------------------------------------------------------------
// The cohort gate
// ---------------------------------------------------------------------------

/**
 * Runs before anything else. Returns the issue that blocks a submission whose
 * denominator is missing, or whose tracing log is impossible.
 *
 * The traced-exceeds-cohort check is here rather than in the section validators
 * because there is no section it belongs to: it is a statement about the tracing
 * exercise as a whole, and it is the one number that could make every other
 * figure on the page wrong.
 */
export function validateCohort(report: AlumniReport): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const { graduatesInCohort, tracedThisPeriod, untraceable } = report.cohort;

  // The gate only bites when the department has actually started tracing. An
  // untouched report is legitimately empty; it just cannot also hold records.
  const registerCounts: [AlumniSectionKey, number][] = [
    ["employment", report.employment.records.length],
    ["business", report.business.records.length],
    ["farm", report.farm.records.length],
    ["loans", report.loans.records.length],
    ["referrals", report.referrals.records.length],
    ["market", report.market.records.length],
    ["engagement", report.engagement.records.length],
  ];
  const rowsEntered = registerCounts.reduce((acc, [, n]) => acc + n, 0);
  const namedSections = registerCounts
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${ALUMNI_SECTION_LABELS[key]} (${n})`)
    .join(", ");

  if (graduatesInCohort === null && rowsEntered === 0) return issues;

  if (graduatesInCohort === null) {
    issues.push(
      missing(
        "employment",
        "Cohort - Graduates in cohort",
        "The cohort size has not been entered. Every rate in this report is a rate over the graduates who were traced, so without the cohort size there is nothing to say those rates represent. Enter the number of graduates due to be traced, or mark every section Not Applicable if no tracing was done."
      )
    );
    return issues;
  }

  if (graduatesInCohort < 0) {
    issues.push(
      inconsistent("employment", "Cohort - Graduates in cohort", "The cohort size cannot be negative.")
    );
  }

  if (tracedThisPeriod === null && rowsEntered > 0) {
    issues.push(
      missing(
        "employment",
        "Cohort - Traced this period",
        `${rowsEntered} record(s) were entered across ${namedSections}, but nobody is recorded as having been traced. The registers and the tracing log have to describe the same exercise.`
      )
    );
    return issues;
  }

  const traced = tracedThisPeriod ?? 0;
  if (traced < 0) {
    issues.push(inconsistent("employment", "Cohort - Traced this period", "The number traced cannot be negative."));
  }

  if (traced > graduatesInCohort) {
    issues.push(
      inconsistent(
        "employment",
        "Cohort - Traced this period",
        `More graduates (${traced}) were traced than are in the cohort (${graduatesInCohort}). Either the cohort size is wrong or somebody was counted twice in the tracing log. Every rate on this page divides by the cohort size, so this has to be corrected first.`
      )
    );
  }

  if (posNumber(untraceable)) {
    if (untraceable < 0) {
      issues.push(inconsistent("employment", "Cohort - Untraceable", "The number who could not be reached cannot be negative."));
    }
    if (traced + untraceable > graduatesInCohort) {
      issues.push(
        inconsistent(
          "employment",
          "Cohort - Untraceable",
          `${traced} traced plus ${untraceable} untraceable is more than the ${graduatesInCohort} graduates in the cohort. Somebody appears twice in the tracing log.`
        )
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Section validators
// ---------------------------------------------------------------------------

/**
 * Employment.
 *
 * The verification rule is the important one. An unconfirmed status is not a
 * reportable fact, so it cannot be silently counted as unemployed - that would
 * turn a stale record into a graduate in trouble. It is a non-blocking issue
 * instead, because chasing a confirmation is the tracer's job, not the data
 * entry clerk's, and it may simply not be possible.
 */
function validateEmployment(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.employment.records;
  const seenIds = new Set<string>();

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Employment ${n}`;
    validateRowIdentity(r.id, `Employment ${n} - ID`, "employment", seenIds, issues);

    if (isBlank(r.graduateId)) {
      issues.push(missing("employment", `${label} - Graduate`, "Enter which graduate this row describes."));
    }

    if (isBlank(r.status)) {
      issues.push(missing("employment", `${label} - Status`, "Select the graduate's employment status."));
    } else if (!config.employmentStatuses.includes(r.status as never)) {
      issues.push(
        notApproved(
          "employment",
          `${label} - Status`,
          `"${r.status}" is not an approved employment status. Add it in Administration if it is a real status Buhle uses.`
        )
      );
    }

    // Confirmed status must say when it was confirmed. Without the date there is
    // no way to tell a current finding from a three-year-old assumption.
    if (r.verified && isBlank(r.dateConfirmed)) {
      issues.push(
        missing(
          "employment",
          `${label} - Date confirmed`,
          "This status is marked verified, so record the date it was confirmed. Without it the row cannot be told apart from a status carried forward from an earlier survey."
        )
      );
    }

    if (r.verified && isBlank(r.status)) {
      issues.push(
        inconsistent(
          "employment",
          `${label} - Verified`,
          "This row is marked verified but has no status. Confirm the status, or clear the verification."
        )
      );
    }

    // An employer with no work, or work with no employer.
    const needsEmployer = r.status === "Employed";
    if (needsEmployer && isBlank(r.employer)) {
      issues.push(missing("employment", `${label} - Employer`, "A graduate recorded as employed needs the employer's name."));
    }
    if (!needsEmployer && r.status && !isBlank(r.employer)) {
      issues.push(
        inconsistent(
          "employment",
          `${label} - Employer`,
          `An employer is recorded but the status is "${r.status}". Either the status or the employer is wrong.`
        )
      );
    }

    if (r.monthlyIncome !== null && r.monthlyIncome < 0) {
      issues.push(inconsistent("employment", `${label} - Monthly income`, "Monthly income cannot be negative."));
    }

    // A graduate studying is a programme success and must not be recorded as
    // working. This is the mistake most worth catching, because it flatters the
    // very number the board watches.
    if (r.status === "In further education" && r.employer.trim()) {
      issues.push(
        inconsistent(
          "employment",
          `${label} - Employer`,
          "This graduate is in further education and is also recorded at an employer. Record one or the other, or a part-time arrangement in the notes."
        )
      );
    }

    // Attention, not blocking: an unverified status is excluded from the rate
    // anyway, so the department must know the rate rests on a smaller group.
    if (!r.verified && r.status && r.status !== "Unknown") {
      issues.push(
        attention(
          "employment",
          `${label} - Verified`,
          `"${r.status}" was not confirmed with the graduate and will be excluded from the employment rate. Confirm it if you can, or clear the status so it is not mistaken for an answer.`
        )
      );
    }

    if (r.status === "Unknown") {
      issues.push(
        attention(
          "employment",
          `${label} - Status`,
          "The status is Unknown, so this graduate counts in the cohort but not in any employment rate. The gap between traced and reported will show that."
        )
      );
    }
  });

  return issues;
}

/**
 * Business sustainability.
 *
 * The stock/flow distinction matters here and is stated in the record: a
 * business that started before this window and is still trading is correctly
 * reported now, so no window check is applied to startDate. What IS checked is
 * the future, because a start date after the reporting date cannot have produced
 * a business that was trading during it.
 */
function validateBusiness(report: AlumniReport): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.business.records;
  const seenIds = new Set<string>();
  const due = new Date(report.dueDate);

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Business ${n}`;
    validateRowIdentity(r.id, `Business ${n} - ID`, "business", seenIds, issues);

    if (isBlank(r.businessName)) {
      issues.push(missing("business", `${label} - Business name`, "Enter the business or trading name."));
    }
    if (isBlank(r.graduateId)) {
      issues.push(missing("business", `${label} - Graduate`, "Enter which graduate owns this business."));
    }

    if (isBlank(r.startDate)) {
      // Not blocking: a missing start date means no survival duration can be
      // derived, which the engine reports as such.
      issues.push(
        attention(
          "business",
          `${label} - Start date`,
          "No start date, so how long this business has been trading cannot be counted. The survival rate still includes it, but it will not appear in the median months trading."
        )
      );
    } else if (new Date(r.startDate).getTime() > due.getTime()) {
      issues.push(
        inconsistent(
          "business",
          `${label} - Start date`,
          `A start date of ${r.startDate} is after this period's reporting date (${report.dueDate}). It cannot have been trading during this period.`
        )
      );
    }

    // The central contradiction of this section: closed and still trading.
    if (!r.stillTrading && isBlank(r.reasonClosed)) {
      issues.push(
        missing(
          "business",
          `${label} - Reason closed`,
          "This business is recorded as closed, so record why. A closed business with no reason is the row the survival rate counts but nobody can learn from."
        )
      );
    }
    if (r.stillTrading && !isBlank(r.reasonClosed)) {
      issues.push(
        inconsistent(
          "business",
          `${label} - Reason closed`,
          `A reason for closing is recorded but the business is marked as still trading. Either it closed, in which case clear the still-trading flag, or the reason does not apply yet.`
        )
      );
    }

    if (r.monthlyRevenue !== null && r.monthlyRevenue < 0) {
      issues.push(inconsistent("business", `${label} - Monthly revenue`, "Monthly revenue cannot be negative."));
    }
    if (r.employees !== null && (r.employees < 0 || !Number.isInteger(r.employees))) {
      issues.push(inconsistent("business", `${label} - Employees`, "Employees must be a whole number of zero or more."));
    }
    // A closed business reporting revenue is either a stale figure or a wrong
    // flag, and both corrupt the revenue total.
    if (!r.stillTrading && posNumber(r.monthlyRevenue)) {
      issues.push(
        attention(
          "business",
          `${label} - Monthly revenue`,
          "A monthly revenue is recorded for a business marked as closed. Confirm the revenue is not being counted for a business that is no longer trading."
        )
      );
    }
  });

  return issues;
}

/**
 * Farm productivity.
 *
 * The unit rule is the substantive one. Yield per hectare only exists when the
 * numerator and the denominator are commensurable, so kilograms and tonnes are
 * accepted and bags and crates are recorded but produce no yield. A block for
 * the unit would be wrong: bags are a perfectly good way to count a harvest, and
 * the row is not wrong, it is just not convertible.
 */
function validateFarm(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.farm.records;
  const seenIds = new Set<string>();

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Farm ${n}`;
    validateRowIdentity(r.id, `Farm ${n} - ID`, "farm", seenIds, issues);

    if (isBlank(r.graduateId)) {
      issues.push(missing("farm", `${label} - Graduate`, "Enter which graduate runs this farm."));
    }

    const hasCrop = !isBlank(r.crop);
    const hasLivestock = !isBlank(r.livestockCategory);

    // A row must describe something. A farming row with neither a crop nor
    // livestock is a blank line that happened to get saved.
    if (!hasCrop && !hasLivestock) {
      issues.push(
        missing(
          "farm",
          `${label} - Crop or livestock`,
          "Select a crop or a livestock category. A farming row with neither does not describe a farm."
        )
      );
    }

    if (hasCrop && !config.crops.includes(r.crop as never)) {
      issues.push(
        notApproved("farm", `${label} - Crop`, `"${r.crop}" is not an approved crop. Add it in Administration if graduates really grow it.`)
      );
    }
    if (hasLivestock && !config.livestockCategories.includes(r.livestockCategory as never)) {
      issues.push(
        notApproved(
          "farm",
          `${label} - Livestock category`,
          `"${r.livestockCategory}" is not an approved livestock category. Add it in Administration if it is one.`
        )
      );
    }
    if (hasCrop && hasLivestock) {
      issues.push(
        inconsistent(
          "farm",
          `${label} - Crop and livestock`,
          "This row records both a crop and livestock. Split it into two rows, one per line, so the area and yield are not attributed to the wrong thing."
        )
      );
    }

    // Area and harvest only matter for a crop line.
    if (hasCrop) {
      if (r.areaHa === null) {
        issues.push(
          attention(
            "farm",
            `${label} - Area`,
            "No area was recorded, so no yield per hectare can be derived for this crop. Area and harvest are not required - the row is still a valid report of the crop."
          )
        );
      } else if (r.areaHa <= 0) {
        issues.push(
          inconsistent("farm", `${label} - Area`, "An area of zero or less cannot produce a yield. Enter the area in hectares, or leave it blank if it is unknown.")
        );
      }

      if (r.totalHarvest !== null && isBlank(r.harvestUnit)) {
        issues.push(missing("farm", `${label} - Harvest unit`, "A harvest was recorded but not the unit it was weighed in."));
      }
      if (r.totalHarvest === null && !isBlank(r.harvestUnit)) {
        issues.push(
          inconsistent(
            "farm",
            `${label} - Total harvest`,
            "A unit is recorded but no harvest. Enter the harvest, or clear the unit."
          )
        );
      }
      if (!isBlank(r.harvestUnit) && !config.massUnits.includes(r.harvestUnit as never)) {
        issues.push(
          notApproved(
            "farm",
            `${label} - Harvest unit`,
            `"${r.harvestUnit}" is not an approved mass unit. Add it in Administration if graduates report harvests in it.`
          )
        );
      }

      // Not blocking: bags and crates are legitimate ways to count a harvest.
      // The row stands; the yield figure is simply not derived from it.
      if (r.totalHarvest !== null && (r.harvestUnit === "bags" || r.harvestUnit === "crates")) {
        issues.push(
          attention(
            "farm",
            `${label} - Harvest unit`,
            `The harvest is recorded in ${r.harvestUnit}, which cannot be converted to kilograms without a declared weight per unit, so no yield per hectare is derived from this row. Record the harvest in kg or tonnes if the weight is known.`
          )
        );
      }

      if (r.totalHarvest !== null && r.totalHarvest < 0) {
        issues.push(inconsistent("farm", `${label} - Total harvest`, "A harvest cannot be negative."));
      }

      if (r.totalHarvest === null && r.areaHa === null) {
        issues.push(
          attention(
            "farm",
            `${label} - Productivity`,
            "This crop row records neither an area nor a harvest, so it contributes to the count of farms but not to the yield figure."
          )
        );
      }
    }

    if (hasLivestock) {
      if (r.livestockHead === null) {
        issues.push(
          attention(
            "farm",
            `${label} - Livestock head`,
            "No head of livestock was recorded, so this row describes a category but not a number of animals."
          )
        );
      } else if (r.livestockHead < 0 || !Number.isInteger(r.livestockHead)) {
        issues.push(
          inconsistent("farm", `${label} - Livestock head`, "Livestock head must be a whole number of zero or more.")
        );
      }
    }

    if (r.labourCount !== null && (r.labourCount < 0 || !Number.isInteger(r.labourCount))) {
      issues.push(
        inconsistent("farm", `${label} - Labour count`, "Labour count must be a whole number of zero or more.")
      );
    }
  });

  return issues;
}

/**
 * Loan repayment.
 *
 * These are Buhle's own loans, so the checks are the ones a lender applies to its
 * own book. The status-versus-balance contradictions are blocking because each
 * one makes the arrears balance wrong, and the arrears balance is money.
 */
function validateLoans(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.loans.records;
  const seenIds = new Set<string>();
  const seenRefs = new Map<string, number>();

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Loan ${n}`;
    validateRowIdentity(r.id, `Loan ${n} - ID`, "loans", seenIds, issues);

    if (isBlank(r.loanReference)) {
      issues.push(missing("loans", `${label} - Loan reference`, "Enter the loan reference."));
    } else {
      const ref = r.loanReference.trim();
      const first = seenRefs.get(ref);
      if (first !== undefined) {
        issues.push(
          inconsistent(
            "loans",
            `${label} - Loan reference`,
            `Loan reference "${ref}" is already recorded on Loan ${first}. The same loan counted twice would understate the arrears balance and overstate the repayment rate.`
          )
        );
      } else {
        seenRefs.set(ref, n);
      }
    }

    if (isBlank(r.borrower)) {
      issues.push(missing("loans", `${label} - Borrower`, "Enter the graduate or business that borrowed."));
    }

    if (isBlank(r.status)) {
      issues.push(missing("loans", `${label} - Status`, "Select the loan status."));
    } else if (!config.loanStatuses.includes(r.status as never)) {
      issues.push(
        notApproved("loans", `${label} - Status`, `"${r.status}" is not an approved loan status. Add it in Administration if it is one.`)
      );
    }

    // A loan has to have an amount and a balance for any of the money to mean
    // anything. Both are required, unlike an income, because both feed the
    // arrears figure the board sees.
    if (!posNumber(r.principal) || r.principal <= 0) {
      issues.push(missing("loans", `${label} - Principal`, "Enter the amount originally advanced."));
    }
    if (!posNumber(r.balanceOutstanding)) {
      issues.push(missing("loans", `${label} - Balance outstanding`, "Enter what is still owed."));
    }

    if (posNumber(r.principal) && posNumber(r.balanceOutstanding)) {
      // Paid off but owing money, and owing nothing but not marked paid off.
      if (r.status === "Paid off" && r.balanceOutstanding > 0) {
        issues.push(
          inconsistent(
            "loans",
            `${label} - Balance outstanding`,
            `This loan is marked Paid off but ${r.balanceOutstanding} is still outstanding. A settled loan should show a balance of zero.`
          )
        );
      }
      if (r.status === "Paid off" && r.balanceOutstanding === 0 && r.instalmentAmount !== null && r.instalmentAmount > 0) {
        issues.push(
          attention(
            "loans",
            `${label} - Instalment`,
            "This loan is settled but still carries an instalment amount. Clear it so it is not read as a live obligation."
          )
        );
      }
      if (r.status !== "Paid off" && r.balanceOutstanding === 0) {
        issues.push(
          inconsistent(
            "loans",
            `${label} - Balance outstanding`,
            `The balance is zero but the loan is marked "${r.status}". A loan with nothing outstanding should be recorded as Paid off.`
          )
        );
      }
      // Overdrawn: more owed than was ever advanced. Money that cannot be
      // explained, usually a capitalised fee or a mis-keyed figure.
      if (r.balanceOutstanding > r.principal) {
        issues.push(
          attention(
            "loans",
            `${label} - Balance outstanding`,
            `The balance (${r.balanceOutstanding}) is larger than the original principal (${r.principal}). If this is a restructured loan with fees added, say so in the notes, otherwise the arrears balance will not reconcile.`
          )
        );
      }
    }

    if (r.instalmentAmount !== null && r.instalmentAmount <= 0) {
      issues.push(inconsistent("loans", `${label} - Instalment`, "An instalment must be greater than zero. Clear it if the loan has no monthly instalment."));
    }

    // An instalment larger than the balance is the last payment overshooting.
    // Allowed, but worth naming, because it usually means the schedule was not
    // updated when the balance was.
    if (
      posNumber(r.instalmentAmount) &&
      posNumber(r.balanceOutstanding) &&
      r.instalmentAmount > 0 &&
      r.balanceOutstanding > 0 &&
      r.instalmentAmount > r.balanceOutstanding
    ) {
      issues.push(
        attention(
          "loans",
          `${label} - Instalment`,
          `The instalment (${r.instalmentAmount}) is larger than the balance (${r.balanceOutstanding}). Check that the instalment schedule was updated when the balance changed.`
        )
      );
    }

    // Arrears without a duration is the one arrears field that is required:
    // "in arrears" with no idea for how long cannot be escalated.
    if (r.status === "Arrears" && r.arrearsMonths === null) {
      issues.push(
        missing("loans", `${label} - Arrears months`, "This loan is in arrears, so record how many months behind it is.")
      );
    }
    if (r.status === "Arrears" && r.arrearsMonths !== null && (r.arrearsMonths < 0 || !Number.isInteger(r.arrearsMonths))) {
      issues.push(inconsistent("loans", `${label} - Arrears months`, "Arrears months must be a whole number of zero or more."));
    }
    if (r.status !== "Arrears" && r.arrearsMonths !== null) {
      issues.push(
        inconsistent(
          "loans",
          `${label} - Arrears months`,
          `An arrears duration is recorded but the loan is marked "${r.status}". Only a loan in arrears has arrears months.`
        )
      );
    }

    // A settled or written-off loan has no next instalment date.
    if ((r.status === "Paid off" || r.status === "Written off") && !isBlank(r.instalmentDueDate)) {
      issues.push(
        attention(
          "loans",
          `${label} - Instalment due date`,
          `This loan is marked "${r.status}" but still has an instalment due date. Clear it so it does not appear in collection follow-up.`
        )
      );
    }
    // A current loan with no instalment is not a plan.
    if (r.status === "Current" && posNumber(r.balanceOutstanding) && r.balanceOutstanding > 0 && isBlank(r.instalmentDueDate)) {
      issues.push(
        missing("loans", `${label} - Instalment due date`, "A current loan with a balance needs a next instalment due date.")
      );
    }

    // A written-off loan is not repaid. Stating it as attention rather than
    // blocking because the write-off may be the correct and final answer; what
    // must not happen is it being recorded as a success.
    if (r.status === "Written off") {
      issues.push(
        attention(
          "loans",
          `${label} - Status`,
          "This loan is written off, so it counts as NOT repaid in the repayment rate and its balance is included in the arrears value. If it was settled by other means, change the status rather than leaving it here."
        )
      );
    }

    if (r.status === "Arrears") {
      issues.push(
        attention(
          "loans",
          `${label} - Status`,
          "This loan is in arrears. It will need a stated recovery position in the commentary before this submission goes to the board."
        )
      );
    }

    // A payment dated after this period ended cannot belong to this period.
    //
    // The bound is the reporting period rather than the clock on purpose:
    // validation that changes answer depending on when it is run is not
    // validation, it is a coin toss. Bounding by dueDate also lets a cycle that
    // is still open accept a payment booked this morning.
    const periodEnd = new Date(report.dueDate).getTime();
    if (!isBlank(r.lastPaymentDate) && new Date(r.lastPaymentDate).getTime() > periodEnd) {
      issues.push(
        inconsistent(
          "loans",
          `${label} - Last payment date`,
          `A payment dated ${r.lastPaymentDate} falls after this period's reporting date (${report.dueDate}), so it cannot belong to this period.`
        )
      );
    }
  });

  return issues;
}

/**
 * Referrals.
 *
 * A referral is a relationship between two named people, and the two checks that
 * matter are both about counting: the same person referred twice, and somebody
 * referring themselves. The first would inflate the referral count and the
 * conversion rate. The second is a data-entry slip, not misconduct, so it is
 * blocking on the count but the message stays matter-of-fact.
 */
function validateReferrals(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.referrals.records;
  const seenIds = new Set<string>();
  const seenReferred = new Map<string, number>();

  const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Referral ${n}`;
    validateRowIdentity(r.id, `Referral ${n} - ID`, "referrals", seenIds, issues);

    if (isBlank(r.referrerName)) {
      issues.push(missing("referrals", `${label} - Referrer`, "Enter the graduate who made the referral."));
    }
    if (isBlank(r.referredPersonName)) {
      issues.push(missing("referrals", `${label} - Referred person`, "Enter the name of the person referred."));
    }

    // Self-referral.
    if (!isBlank(r.referrerName) && !isBlank(r.referredPersonName)) {
      if (normalise(r.referrerName) === normalise(r.referredPersonName)) {
        issues.push(
          inconsistent(
            "referrals",
            `${label} - Referred person`,
            "The referrer and the referred person have the same name. A graduate cannot refer themselves, so one of the two names is wrong."
          )
        );
      }
    }

    // The same prospective student counted twice. Both the referrer and the
    // outcome are checked, because the same person arriving through two
    // graduates is a real thing that happens and should be recorded as a
    // Duplicate, not two referrals.
    if (!isBlank(r.referredPersonName)) {
      const key = normalise(r.referredPersonName);
      const first = seenReferred.get(key);
      if (first !== undefined && r.outcome !== "Duplicate") {
        issues.push(
          inconsistent(
            "referrals",
            `${label} - Referred person`,
            `"${r.referredPersonName.trim()}" is already recorded on Referral ${first} and this row is not marked Duplicate. Recording the same person twice would inflate both the referral count and the conversion rate. Mark this row Duplicate, or change the name if it is a different person.`
          )
        );
      } else if (first === undefined) {
        seenReferred.set(key, n);
      }
    }

    if (!isBlank(r.programmeReferred)) {
      issues.push(
        attention(
          "referrals",
          `${label} - Programme`,
          `"${r.programmeReferred}" is free text rather than an approved programme. Approved programmes are configured in Administration, so matching one keeps the referral count comparable across cohorts.`
        )
      );
    }

    if (isBlank(r.dateReferred)) {
      issues.push(missing("referrals", `${label} - Date referred`, "Enter the date the referral was made."));
    }

    if (isBlank(r.outcome)) {
      // Not blocking, and deliberately so. "Awaiting decision" and "Unreachable"
      // are the honest answers while somebody has not replied, and this row
      // simply stays out of the conversion rate until an outcome is known.
      issues.push(
        attention(
          "referrals",
          `${label} - Outcome`,
          "No outcome recorded. This referral is excluded from the conversion rate until an outcome is known, which is correct while somebody has not yet replied. Record Awaiting decision or Unreachable if that is the case."
        )
      );
    } else if (!config.referralOutcomes.includes(r.outcome as never)) {
      issues.push(
        notApproved(
          "referrals",
          `${label} - Outcome`,
          `"${r.outcome}" is not an approved referral outcome. Add it in Administration if it is one.`
        )
      );
    }

    // An outcome without a date cannot be placed in a period. A Duplicate is
    // exempt: it records a correction rather than a resolved referral, so there
    // is no outcome for it to have happened on.
    if (!isBlank(r.outcome) && r.outcome !== "Duplicate" && isBlank(r.outcomeDate)) {
      issues.push(
        missing(
          "referrals",
          `${label} - Outcome date`,
          "An outcome is recorded, so record the date it became known. Without it the enrolment cannot be attributed to a period."
        )
      );
    }

    // Enrolled with no programme is a referral that produced nothing traceable.
    if (r.outcome === "Enrolled" && isBlank(r.programmeReferred)) {
      issues.push(
        missing(
          "referrals",
          `${label} - Programme`,
          "This referral enrolled, so record which programme they enrolled in, otherwise the referral cannot be attributed to anything the programme runs."
        )
      );
    }

    // A Duplicate is a record of a correction, not a referral, so it should not
    // carry an enrolment outcome.
    if (r.outcome === "Duplicate" && r.outcomeDate) {
      issues.push(
        attention(
          "referrals",
          `${label} - Outcome date`,
          "This row is marked Duplicate and is excluded from the referral count, so its outcome date is not used. Clear it if that is not intended."
        )
      );
    }
  });

  return issues;
}

/** Market participation. */
function validateMarket(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.market.records;
  const seenIds = new Set<string>();

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Market ${n}`;
    validateRowIdentity(r.id, `Market ${n} - ID`, "market", seenIds, issues);

    if (isBlank(r.graduateId)) {
      issues.push(missing("market", `${label} - Graduate`, "Enter which graduate sells here."));
    }
    if (isBlank(r.marketName)) {
      issues.push(missing("market", `${label} - Market`, "Enter the market, stall or buyer name."));
    }
    if (isBlank(r.productCategory)) {
      issues.push(missing("market", `${label} - Product`, "Enter what is sold at this market."));
    }

    if (isBlank(r.marketType)) {
      issues.push(missing("market", `${label} - Market type`, "Select the type of market."));
    } else if (!config.marketTypes.includes(r.marketType as never)) {
      issues.push(
        notApproved("market", `${label} - Market type`, `"${r.marketType}" is not an approved market type. Add it in Administration.`)
      );
    }

    if (isBlank(r.frequencyOfSale)) {
      issues.push(missing("market", `${label} - Frequency of sale`, "Select how often the graduate sells here."));
    } else if (!config.saleFrequencies.includes(r.frequencyOfSale as never)) {
      issues.push(
        notApproved(
          "market",
          `${label} - Frequency of sale`,
          `"${r.frequencyOfSale}" is not an approved sale frequency. Add it in Administration.`
        )
      );
    }

    if (r.averageMonthlyRevenue !== null && r.averageMonthlyRevenue < 0) {
      issues.push(inconsistent("market", `${label} - Average monthly revenue`, "Monthly revenue cannot be negative."));
    }

    // A daily stall with no revenue figure is common and not an error, but it
    // does mean the revenue total rests on a subset, which the reader should be
    // told rather than left to assume.
    if (r.frequencyOfSale === "Daily" && !posNumber(r.averageMonthlyRevenue)) {
      issues.push(
        attention(
          "market",
          `${label} - Average monthly revenue`,
          "A daily selling point is recorded with no monthly revenue. The market revenue figure covers only the markets that reported one, so it is not the whole picture."
        )
      );
    }

    // A seasonal seller with a daily frequency is a contradiction about the
    // business, not a typo worth blocking.
    if (r.frequencyOfSale === "Daily" && r.marketType === "Formal market" && r.hasFormalSpace === false) {
      issues.push(
        attention(
          "market",
          `${label} - Formal space`,
          "A graduate selling daily at a formal market without a formal stand or licence is worth a note: it usually means a spot is being used informally."
        )
      );
    }
  });

  return issues;
}

/** Engagement. */
function validateEngagement(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];
  const records = report.engagement.records;
  const seenIds = new Set<string>();
  const start = new Date(report.startDate).getTime();
  const due = new Date(report.dueDate).getTime();

  records.forEach((r, i) => {
    const n = i + 1;
    const label = `Engagement ${n}`;
    validateRowIdentity(r.id, `Engagement ${n} - ID`, "engagement", seenIds, issues);

    if (isBlank(r.graduateId)) {
      issues.push(missing("engagement", `${label} - Graduate`, "Enter which graduate took part."));
    }
    if (isBlank(r.activity)) {
      issues.push(missing("engagement", `${label} - Activity`, "Select the activity the graduate took part in."));
    } else if (!config.engagementActivities.includes(r.activity as never)) {
      issues.push(
        notApproved("engagement", `${label} - Activity`, `"${r.activity}" is not an approved activity. Add it in Administration.`)
      );
    }

    if (isBlank(r.activityDate)) {
      issues.push(missing("engagement", `${label} - Activity date`, "Enter the date of the activity."));
    } else {
      const t = new Date(r.activityDate).getTime();
      if (Number.isNaN(t)) {
        issues.push(inconsistent("engagement", `${label} - Activity date`, "That is not a date I can read."));
      } else {
        // Engagement is a period flow, unlike a business or a loan, so an
        // out-of-window activity does double-count the period.
        if (t < start || t > due) {
          issues.push(
            inconsistent(
              "engagement",
              `${label} - Activity date`,
              `An activity dated ${r.activityDate} falls outside this reporting period (${report.startDate} to ${report.dueDate}). Engagement is counted in the period it happened, so leaving it here would double-count it.`
            )
          );
        }
      }
    }

    if (r.hoursContributed !== null && (r.hoursContributed < 0 || !Number.isFinite(r.hoursContributed))) {
      issues.push(inconsistent("engagement", `${label} - Hours contributed`, "Hours contributed cannot be negative."));
    }
    if (r.othersReached !== null && (r.othersReached < 0 || !Number.isInteger(r.othersReached))) {
      issues.push(inconsistent("engagement", `${label} - Others reached`, "Others reached must be a whole number of zero or more."));
    }

    // Mentoring is hours of somebody else's time. Not tracking them is common
    // and not a data error, but it does mean the hours figure is a partial
    // measure of what graduates contribute.
    if (r.activity === "Mentoring a learner" && r.hoursContributed === null) {
      issues.push(
        attention(
          "engagement",
          `${label} - Hours contributed`,
          "Mentoring is recorded with no hours. The total hours figure counts only the activities that recorded them, so it understates what graduates contributed."
        )
      );
    }

    // A donation with no hours is fine, but a donation with a recipient count of
    // zero is odd enough to mention.
    if (r.activity === "Donation" && r.othersReached === 0) {
      issues.push(
        attention(
          "engagement",
          `${label} - Others reached`,
          "A donation is recorded as reaching nobody. If the donation was to the programme rather than to other graduates or learners, clear this field."
        )
      );
    }
  });

  return issues;
}

/** Shared row identity check, used by every section. */
function validateRowIdentity(
  id: string,
  field: string,
  section: AlumniSectionKey,
  seen: Set<string>,
  issues: AlumniValidationIssue[]
): void {
  const sectionName = ALUMNI_SECTION_LABELS[section];
  if (isBlank(id)) {
    // The modal assigns ids on add. A blank one means a row was constructed
    // outside the UI, which would make React keys collide and edits ambiguous.
    issues.push(
      inconsistent(section, field, `This ${sectionName.toLowerCase()} row has no id, so it cannot be edited or removed reliably. Remove the row and add it again.`)
    );
    return;
  }
  if (seen.has(id)) {
    issues.push(
      inconsistent(section, field, `Two ${sectionName.toLowerCase()} rows share the id "${id}". Each row needs its own id.`)
    );
    return;
  }
  seen.add(id);
}

// ---------------------------------------------------------------------------
// Cross-register consistency
// ---------------------------------------------------------------------------

/**
 * The registers describe the same traced graduates from seven angles, and they
 * have to agree about who those people are.
 *
 * A graduate who appears in the farm register but not the employment register is
 * not a small problem: the participation and engagement rates divide by the
 * traced cohort, so somebody counted in one register and not another produces a
 * rate that cannot be reconciled with the rows behind it.
 *
 * The referral register is the one deliberate exception. A graduate can refer
 * somebody without appearing in the employment register, because the referrer is
 * by definition a graduate somebody has spoken to. That is handled as attention
 * rather than blocking.
 */
function validateCrossSection(report: AlumniReport, config: AlumniConfig): AlumniValidationIssue[] {
  const issues: AlumniValidationIssue[] = [];

  const tracedIds = new Set<string>();
  for (const r of report.employment.records) {
    if (!isBlank(r.graduateId)) tracedIds.add(r.graduateId.trim());
  }

  // The employment register holds more graduates than the tracing log says were
  // traced. This is the same integrity failure as traced exceeding the cohort,
  // one step down: it would push the participation and engagement rates above
  // 100%, which is how a denominator error shows up in a headline figure.
  const tracedCount = report.cohort.tracedThisPeriod;
  if (typeof tracedCount === "number" && tracedCount >= 0 && tracedIds.size > tracedCount) {
    issues.push(
      inconsistent(
        "employment",
        "Cohort - Traced this period",
        `${tracedIds.size} graduates appear in the employment register but only ${tracedCount} were recorded as traced. The registers and the tracing log describe the same exercise, and a participation or engagement rate above 100% is what this produces. Either the traced count or the employment register is wrong.`
      )
    );
  }

  const check = (
    ids: string[],
    section: AlumniSectionKey,
    field: (id: string) => string,
    requireTraced: boolean
  ) => {
    for (const id of ids) {
      const trimmed = id.trim();
      if (!trimmed || tracedIds.has(trimmed)) continue;
      if (requireTraced) {
        issues.push(
          inconsistent(
            section,
            field(trimmed),
            `Graduate "${trimmed}" appears in this register but not in the employment register. The two registers describe the same traced graduates, and the participation and engagement rates divide by the traced cohort, so this row cannot be reconciled until it is either added to the employment register or corrected.`
          )
        );
      } else {
        issues.push(
          attention(
            section,
            field(trimmed),
            `Graduate "${trimmed}" made a referral but has no row in the employment register. If they were traced, add them, because a referral is evidence of contact.`
          )
        );
      }
    }
  };

  check(report.business.records.map((r) => r.graduateId), "business", (id) => `Business - Graduate ${id}`, true);
  check(report.farm.records.map((r) => r.graduateId), "farm", (id) => `Farm - Graduate ${id}`, true);
  check(report.market.records.map((r) => r.graduateId), "market", (id) => `Market - Graduate ${id}`, true);
  check(report.engagement.records.map((r) => r.graduateId), "engagement", (id) => `Engagement - Graduate ${id}`, true);
  // Loans name a borrower, which may be a business rather than a graduate, so
  // this one is not cross-checked against the employment register at all.
  check(report.referrals.records.map((r) => r.referrerName), "referrals", (id) => `Referral - Referrer ${id}`, false);

  // A graduate recorded as unemployed and selling through a market is the single
  // most likely contradiction in this whole module, and the one a reader would
  // catch first. It is blocking, because one of the two is wrong.
  for (const m of report.market.records) {
    const employment = report.employment.records.find((r) => r.graduateId.trim() === m.graduateId.trim());
    if (!employment || !employment.status) continue;
    const inactive = employment.status === "Unemployed - not seeking" || employment.status === "Retired or medically unable";
    if (inactive) {
      issues.push(
        inconsistent(
          "market",
          `Market - Graduate ${m.graduateId.trim()}`,
          `This graduate's status is "${employment.status}" but they sell through ${m.marketName || "a recorded market"}. One of the two records is wrong; part-time informal selling counted as not seeking work is common, so check the status first.`
        )
      );
    }
  }

  // A business marked closed whose graduate is recorded as employed by that same
  // business is fine, so no check there. But a farm line for a graduate with no
  // employment status at all is already caught above.

  // Thin sample, surfaced not blocked.
  const traced = report.cohort.tracedThisPeriod;
  const cohort = report.cohort.graduatesInCohort;
  if (
    typeof traced === "number" &&
    typeof cohort === "number" &&
    cohort > 0 &&
    traced >= 0 &&
    traced <= cohort
  ) {
    const responsePct = Math.round((traced / cohort) * 1000) / 10;
    if (responsePct < config.minimumResponseRatePct) {
      issues.push(
        attention(
          "employment",
          "Cohort - Response rate",
          `Only ${responsePct}% of the cohort was traced (${traced} of ${cohort}), below the ${config.minimumResponseRatePct}% minimum set in Administration. This does not block the submission - a cohort that is hard to reach is exactly the one worth reporting on - but every rate here describes those ${traced} graduates and not the whole cohort, and the commentary should say so.`
        )
      );
    }
  }

  // Nothing traced but registers full of rows is the contradiction the cohort
  // gate already covers. Nothing traced and nothing recorded is an empty
  // submission, which is legitimate.

  // A report where every graduate is employed, in a cohort with known unemployed
  // neighbours, is possible but worth a question. Not blocking, and phrased as
  // a question rather than an accusation.
  const employmentRecords = report.employment.records.filter((r) => r.verified && r.status);
  if (employmentRecords.length >= 3) {
    const allActive = employmentRecords.every((r) => isEconomicallyActive(r.status, config));
    if (allActive) {
      issues.push(
        attention(
          "employment",
          "Employment - Status distribution",
          `All ${employmentRecords.length} confirmed graduates are recorded as economically active. This happens - these are graduates of a programme - but confirm the statuses are not being defaulted to "Employed" as a courtesy, because that is the failure this register is most prone to.`
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
  AlumniSectionKey,
  (report: AlumniReport, config: AlumniConfig) => AlumniValidationIssue[]
> = {
  employment: validateEmployment,
  business: validateBusiness,
  farm: (report, config) => validateFarm(report, config),
  loans: (report, config) => validateLoans(report, config),
  referrals: (report, config) => validateReferrals(report, config),
  market: (report, config) => validateMarket(report, config),
  engagement: (report, config) => validateEngagement(report, config),
};

export function isAlumniSectionNotApplicable(report: AlumniReport, key: AlumniSectionKey): boolean {
  switch (key) {
    case "employment":
      return report.employment.notApplicable;
    case "business":
      return report.business.notApplicable;
    case "farm":
      return report.farm.notApplicable;
    case "loans":
      return report.loans.notApplicable;
    case "referrals":
      return report.referrals.notApplicable;
    case "market":
      return report.market.notApplicable;
    case "engagement":
      return report.engagement.notApplicable;
  }
}

export function validateAlumniReport(
  report: AlumniReport,
  options: ValidateAlumniOptions
): AlumniValidationResult {
  const config = options.config;
  const bySection = {} as Record<AlumniSectionKey, AlumniSectionValidation>;

  ALUMNI_SECTION_KEYS.forEach((key) => {
    const issues = SECTION_VALIDATORS[key](report, config);
    bySection[key] = {
      state:
        issues.length > 0
          ? "incomplete"
          : isAlumniSectionNotApplicable(report, key)
            ? "not_applicable"
            : "complete",
      issues,
    };
  });

  // Cross-register and cohort issues are attributed to the section they concern
  // so the progress strip reflects them too.
  for (const issue of [...validateCohort(report), ...validateCrossSection(report, config)]) {
    bySection[issue.section].issues.push(issue);
    // Only a BLOCKING issue means the section is not finished. An attention
    // issue is a fact to acknowledge, not a missing field, and letting it mark
    // the section incomplete would make the progress strip claim work is
    // outstanding when the registers are in fact complete.
    if (issue.blocking && bySection[issue.section].state === "complete") {
      bySection[issue.section].state = "incomplete";
    }
  }

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  const blockingIssues = issues.filter((i) => i.blocking);
  const attentionIssues = issues.filter((i) => !i.blocking);

  return {
    // Only blocking issues refuse the submission.
    valid: blockingIssues.length === 0,
    issues,
    blockingIssues,
    attentionIssues,
    bySection,
  };
}

/** Issues grouped by section, for the refusal panel. */
export function summariseAlumniIssues(
  issues: AlumniValidationIssue[]
): { section: AlumniSectionKey; label: string; lines: string[] }[] {
  const grouped = new Map<AlumniSectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({
    section,
    label: ALUMNI_SECTION_LABELS[section],
    lines,
  }));
}

/** How many sections are usable right now. Drives the progress strip. */
export function alumniCompletion(result: AlumniValidationResult): {
  complete: number;
  total: number;
  notApplicable: number;
  blocking: number;
  attention: number;
} {
  const states = ALUMNI_SECTION_KEYS.map((k) => result.bySection[k].state);
  return {
    complete: states.filter((s) => s === "complete").length,
    notApplicable: states.filter((s) => s === "not_applicable").length,
    total: ALUMNI_SECTION_KEYS.length,
    blocking: result.blockingIssues.length,
    attention: result.attentionIssues.length,
  };
}