import {
  BD_SECTION_KEYS,
  BD_SECTION_LABELS,
  type BdConfig,
  type BdReport,
  type BdSectionKey,
} from "../types/businessDevelopment";

/**
 * ============================================================================
 * Business Development submission validation.
 * ============================================================================
 *
 * Same rule as every other register department: a submission either carries
 * what the calculations need, or it is refused with a list naming the section
 * and the field. Required fields are limited to what a KPI actually consumes,
 * so nobody is trained to type junk to get past the gate.
 *
 * The contradictions this catches are the ones that would otherwise produce an
 * impossible rate or a false story: a proposal marked Won but flagged as not
 * won, an opportunity won before it was opened, more probability than 100,
 * a stalled deal whose "last activity" predates its creation.
 *
 * The general issues (reporting period, due date) sit outside the sections:
 * they are about the submission, not about any register.
 */

export type BdIssueSection = BdSectionKey | "general";

export interface BdValidationIssue {
  section: BdIssueSection;
  field: string;
  message: string;
  kind?: "missing" | "inconsistent";
}

export interface BdSectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: BdValidationIssue[];
}

export interface BdValidationResult {
  valid: boolean;
  issues: BdValidationIssue[];
  bySection: Record<BdSectionKey, BdSectionValidation>;
}

export interface ValidateBdOptions {
  config: BdConfig;
  today?: Date;
}

const isBlank = (v: string | null | undefined) => v === null || v === undefined || String(v).trim() === "";
const isFuture = (iso: string | null | undefined, today: Date) =>
  Boolean(iso) && new Date(iso as string).getTime() > today.getTime();
const isNegative = (v: number | null | undefined) => typeof v === "number" && v < 0;

function missing(section: BdSectionKey, field: string): BdValidationIssue {
  return { section, field, message: `${field} is required`, kind: "missing" };
}

function inconsistent(section: BdSectionKey, field: string, message: string): BdValidationIssue {
  return { section, field, message, kind: "inconsistent" };
}

function notApproved(section: BdSectionKey, field: string, value: string, vocabulary: string): BdValidationIssue {
  return inconsistent(
    section,
    field,
    `"${value}" is not an approved ${vocabulary} - add it in Administration or correct the record`
  );
}

function validateLeads(report: BdReport, options: ValidateBdOptions): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  const { config } = options;
  const today = options.today ?? new Date();

  report.leads.leads.forEach((r, i) => {
    const n = `Lead ${i + 1}`;
    if (isBlank(r.dateReceived)) issues.push(missing("leads", `${n} - Date received`));
    else if (isFuture(r.dateReceived, today)) {
      issues.push(inconsistent("leads", `${n} - Date received`, "Date received is in the future"));
    }
    if (isBlank(r.organisation)) issues.push(missing("leads", `${n} - Organisation`));
    if (isBlank(r.source)) issues.push(missing("leads", `${n} - Source`));
    else if (!config.leadSources.includes(r.source)) {
      issues.push(notApproved("leads", `${n} - Source`, r.source, "source"));
    }
    if (isBlank(r.status)) issues.push(missing("leads", `${n} - Status`));
    else if (!config.leadStatuses.includes(r.status)) {
      issues.push(notApproved("leads", `${n} - Status`, r.status, "status"));
    }
    if (isNegative(r.estimatedValue)) {
      issues.push(inconsistent("leads", `${n} - Estimated value`, "Estimated value cannot be negative"));
    }
    if (r.nextActionDate && r.dateReceived && new Date(r.nextActionDate) < new Date(r.dateReceived)) {
      issues.push(inconsistent("leads", `${n} - Next action date`, "Next action is dated before the lead arrived"));
    }
  });

  return issues;
}

function validateOpportunities(report: BdReport, options: ValidateBdOptions): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  const { config } = options;
  const today = options.today ?? new Date();

  report.opportunities.opportunities.forEach((r, i) => {
    const n = `Opportunity ${i + 1}`;
    if (isBlank(r.opportunityName)) issues.push(missing("opportunities", `${n} - Opportunity name`));
    if (isBlank(r.client)) issues.push(missing("opportunities", `${n} - Client`));
    if (isBlank(r.owner)) issues.push(missing("opportunities", `${n} - Owner`));
    if (isBlank(r.dateCreated)) issues.push(missing("opportunities", `${n} - Date created`));
    else if (isFuture(r.dateCreated, today)) {
      issues.push(inconsistent("opportunities", `${n} - Date created`, "Date created is in the future"));
    }
    if (isBlank(r.stage)) issues.push(missing("opportunities", `${n} - Stage`));
    else if (!config.opportunityStages.includes(r.stage)) {
      issues.push(notApproved("opportunities", `${n} - Stage`, r.stage, "stage"));
    }

    const open = r.stage !== "Won" && r.stage !== "Lost";
    if (r.estimatedValue === null && open) {
      issues.push(missing("opportunities", `${n} - Estimated value`));
    }
    if (isNegative(r.estimatedValue)) {
      issues.push(inconsistent("opportunities", `${n} - Estimated value`, "Estimated value cannot be negative"));
    }
    if (open && r.probability === null) issues.push(missing("opportunities", `${n} - Probability`));
    if (r.probability !== null && (r.probability < 0 || r.probability > 100)) {
      issues.push(inconsistent("opportunities", `${n} - Probability`, "Probability must be between 0 and 100"));
    }

    // The weighted value is derived, so a typed one must agree with what the
    // engine will calculate - otherwise the review page and the KPI would
    // quote different numbers from the same row.
    if (r.estimatedValue !== null && r.probability !== null && r.weightedValue !== null) {
      const expected = Math.round(r.estimatedValue * (r.probability / 100));
      if (Math.abs(expected - r.weightedValue) > 1) {
        issues.push(
          inconsistent(
            "opportunities",
            `${n} - Weighted value`,
            `Weighted value R${r.weightedValue.toLocaleString()} does not match value x probability (R${expected.toLocaleString()})`
          )
        );
      }
    }

    if (r.lastActivityDate && r.dateCreated && new Date(r.lastActivityDate) < new Date(r.dateCreated)) {
      issues.push(
        inconsistent("opportunities", `${n} - Last activity date`, "Last activity is dated before the opportunity was created")
      );
    }
    if (r.lastActivityDate && isFuture(r.lastActivityDate, today)) {
      issues.push(inconsistent("opportunities", `${n} - Last activity date`, "Last activity date is in the future"));
    }

    if (r.stage === "Won") {
      if (isBlank(r.wonDate)) issues.push(missing("opportunities", `${n} - Won date`));
      else if (isFuture(r.wonDate, today)) {
        issues.push(inconsistent("opportunities", `${n} - Won date`, "Won date is in the future"));
      }
      if (r.wonDate && r.dateCreated && new Date(r.wonDate) < new Date(r.dateCreated)) {
        issues.push(inconsistent("opportunities", `${n} - Won date`, "Won before the opportunity was created"));
      }
    }
    if (r.stage === "Lost") {
      if (isBlank(r.lostDate)) issues.push(missing("opportunities", `${n} - Lost date`));
      if (isBlank(r.lostReason)) issues.push(missing("opportunities", `${n} - Lost reason`));
    }
  });

  return issues;
}

function validateProposals(report: BdReport, options: ValidateBdOptions): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  const { config } = options;
  const today = options.today ?? new Date();

  report.proposals.proposals.forEach((r, i) => {
    const n = `Proposal ${i + 1}`;
    if (isBlank(r.client)) issues.push(missing("proposals", `${n} - Client`));
    if (isBlank(r.dateSubmitted)) issues.push(missing("proposals", `${n} - Date submitted`));
    else if (isFuture(r.dateSubmitted, today)) {
      issues.push(inconsistent("proposals", `${n} - Date submitted`, "Date submitted is in the future"));
    }
    if (isBlank(r.status)) issues.push(missing("proposals", `${n} - Status`));
    else if (!config.proposalStatuses.includes(r.status)) {
      issues.push(notApproved("proposals", `${n} - Status`, r.status, "status"));
    }
    if (r.proposalValue !== null && isNegative(r.proposalValue)) {
      issues.push(inconsistent("proposals", `${n} - Proposal value`, "Proposal value cannot be negative"));
    }

    // The won flag and the status must tell the same story - the win rate is
    // computed from the status, so a contradictory flag would silently
    // disagree with it.
    if (r.status === "Won" && r.won !== true) {
      issues.push(inconsistent("proposals", `${n} - Won flag`, "Status is Won but the proposal is not marked as won"));
    }
    if (r.status === "Lost" && r.won !== false) {
      issues.push(inconsistent("proposals", `${n} - Won flag`, "Status is Lost but the proposal is not marked as lost"));
    }
    if (r.won === true && r.status !== "Won") {
      issues.push(inconsistent("proposals", `${n} - Status`, "Marked as won, so the status must be Won"));
    }
    if (r.status === "Lost" && isBlank(r.lostReason)) {
      issues.push(missing("proposals", `${n} - Lost reason`));
    }
  });

  return issues;
}

function validateNewBusiness(report: BdReport, options: ValidateBdOptions): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  const today = options.today ?? new Date();

  report.newBusiness.newBusiness.forEach((r, i) => {
    const n = `Win ${i + 1}`;
    if (isBlank(r.client)) issues.push(missing("newBusiness", `${n} - Client`));
    if (isBlank(r.awardDate)) issues.push(missing("newBusiness", `${n} - Award date`));
    else if (isFuture(r.awardDate, today)) {
      issues.push(inconsistent("newBusiness", `${n} - Award date`, "Award date is in the future"));
    }
    if (isBlank(r.owner)) issues.push(missing("newBusiness", `${n} - Owner`));
    if (r.wonValue === null) issues.push(missing("newBusiness", `${n} - Won value`));
    else if (isNegative(r.wonValue)) {
      issues.push(inconsistent("newBusiness", `${n} - Won value`, "Won value cannot be negative"));
    }
    if (r.contractStartDate && r.awardDate && new Date(r.contractStartDate) < new Date(r.awardDate)) {
      issues.push(inconsistent("newBusiness", `${n} - Contract start date`, "Contract starts before the award date"));
    }
  });

  return issues;
}

function validateClients(report: BdReport, options: ValidateBdOptions): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  const today = options.today ?? new Date();

  report.clients.clients.forEach((r, i) => {
    const n = `Client ${i + 1}`;
    if (isBlank(r.clientName)) issues.push(missing("clients", `${n} - Client name`));
    if (isBlank(r.awardDate)) issues.push(missing("clients", `${n} - Award date`));
    else if (isFuture(r.awardDate, today)) {
      issues.push(inconsistent("clients", `${n} - Award date`, "Award date is in the future"));
    }
  });

  return issues;
}

function validatePartnerships(report: BdReport, options: ValidateBdOptions): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  const { config } = options;
  const today = options.today ?? new Date();

  report.partnerships.partnerships.forEach((r, i) => {
    const n = `Partnership ${i + 1}`;
    if (isBlank(r.partner)) issues.push(missing("partnerships", `${n} - Partner`));
    if (isBlank(r.dateInitiated)) issues.push(missing("partnerships", `${n} - Date initiated`));
    else if (isFuture(r.dateInitiated, today)) {
      issues.push(inconsistent("partnerships", `${n} - Date initiated`, "Date initiated is in the future"));
    }
    if (isBlank(r.status)) issues.push(missing("partnerships", `${n} - Status`));
    else if (!config.partnershipStatuses.includes(r.status)) {
      issues.push(notApproved("partnerships", `${n} - Status`, r.status, "status"));
    }
    if (isNegative(r.potentialValue)) {
      issues.push(inconsistent("partnerships", `${n} - Potential value`, "Potential value cannot be negative"));
    }
  });

  return issues;
}

const SECTION_VALIDATORS: Record<
  BdSectionKey,
  (report: BdReport, options: ValidateBdOptions) => BdValidationIssue[]
> = {
  leads: validateLeads,
  opportunities: validateOpportunities,
  proposals: validateProposals,
  newBusiness: validateNewBusiness,
  clients: validateClients,
  partnerships: validatePartnerships,
  // The commentary is read, not calculated: nothing in it feeds a KPI, so an
  // empty box is a thin submission rather than an invalid one.
  commentary: () => [],
};

export function validateBdReport(report: BdReport, options: ValidateBdOptions): BdValidationResult {
  const issues: BdValidationIssue[] = [];

  if (isBlank(report.reportingPeriod)) {
    issues.push({ section: "general", field: "Reporting period", message: "Reporting period is required", kind: "missing" });
  }
  if (isBlank(report.dueDate)) {
    issues.push({ section: "general", field: "Due date", message: "Due date is required", kind: "missing" });
  }

  const bySection = {} as Record<BdSectionKey, BdSectionValidation>;

  for (const key of BD_SECTION_KEYS) {
    const section = report[key];
    if (section.notApplicable) {
      bySection[key] = { state: "not_applicable", issues: [] };
      continue;
    }
    const sectionIssues = SECTION_VALIDATORS[key](report, options);
    // An empty register that has not been marked Not Applicable is a gap, not
    // a result: it blocks submission rather than quietly deriving nothing. The
    // commentary is prose rather than a register, so it is exempt - an empty
    // commentary box is a thin submission, not an invalid one.
    if (key !== "commentary") {
      const rows = (section as unknown as Record<string, unknown>)[key];
      if (Array.isArray(rows) && rows.length === 0) {
        sectionIssues.push({
          section: key,
          field: BD_SECTION_LABELS[key],
          message: "No rows recorded. Add rows, or mark the section Not Applicable for this period.",
          kind: "missing",
        });
      }
    }
    bySection[key] = { state: sectionIssues.length > 0 ? "incomplete" : "complete", issues: sectionIssues };
    issues.push(...sectionIssues);
  }

  return { valid: issues.length === 0, issues, bySection };
}

/** Issues grouped by section, for the refusal panel. */
export function summariseBdIssues(
  issues: BdValidationIssue[]
): { section: BdIssueSection; label: string; lines: string[] }[] {
  const grouped = new Map<BdIssueSection, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({
    section,
    label: section === "general" ? "Submission" : BD_SECTION_LABELS[section as BdSectionKey],
    lines,
  }));
}
