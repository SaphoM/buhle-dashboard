import {
  CASH_INFLOW_TYPES,
  CASH_OUTFLOW_TYPES,
  FINANCE_SECTION_KEYS,
  type FinanceReport,
  type FinanceSectionKey,
} from "../types/finance";
import { calculateBudgets, calculateCashFlow, calculateProfitability, calculateRevenue } from "./financeEngine";

/**
 * ============================================================================
 * Finance submission validation (Section 25).
 * ============================================================================
 *
 * Section 25 is unambiguous: "DO NOT silently submit incomplete data." A
 * Finance submission either carries everything the configured rules require, or
 * it is refused with a precise list of what is missing - each item naming its
 * section, so the manager can jump straight to the field.
 *
 * Two principles shape what is required here:
 *
 *  - Only inputs a formula actually consumes are mandatory. Section 25's own
 *    example names Revenue actual, Cash Flow closing balance, Budget actual and
 *    Debtors outstanding - not every column on the form. Requiring a note or a
 *    cost centre that no calculation reads would train Finance to type junk to
 *    get past the gate, which is exactly the behaviour Section 25 is trying to
 *    prevent.
 *
 *  - Internal consistency is checked, not just presence. A receipt that exceeds
 *    the invoice, a closing cash balance that contradicts its own inflows and
 *    outflows, a budget that is revised below what has already been spent -
 *    each of those produces a confidently wrong KPI downstream, so they are
 *    caught before submission rather than after.
 */

export interface ValidationIssue {
  section: FinanceSectionKey;
  /** Human label for the specific missing or inconsistent field. */
  field: string;
  message: string;
  /** True when the issue is a contradiction rather than an omission. The UI
   *  words these differently, because "you left this blank" and "these two
   *  numbers disagree" call for different corrections. */
  kind?: "missing" | "inconsistent";
}

export interface SectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: ValidationIssue[];
}

export interface FinanceValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  bySection: Record<FinanceSectionKey, SectionValidation>;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function missing(section: FinanceSectionKey, field: string): ValidationIssue {
  return { section, field, message: `${field} is required`, kind: "missing" };
}

function inconsistent(section: FinanceSectionKey, field: string, message: string): ValidationIssue {
  return { section, field, message, kind: "inconsistent" };
}

// ---------------------------------------------------------------------------
// Section 6 - Revenue
// ---------------------------------------------------------------------------

function validateRevenue(report: FinanceReport, categoryIds: string[]): ValidationIssue[] {
  const r = report.revenue;
  if (r.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  // With no lines at all there is nothing to submit, and an empty revenue
  // section must not pass as a nil return.
  if (r.lines.length === 0) {
    issues.push(missing("revenue", "At least one revenue line (or mark the section Not Applicable)"));
    return issues;
  }

  r.lines.forEach((line, i) => {
    const label = `Revenue line ${i + 1}`;
    if (isBlank(line.categoryId) || !categoryIds.includes(line.categoryId)) {
      issues.push(missing("revenue", `${label} - Revenue category`));
    }
    // Actual is the figure every revenue KPI is built from. Budget is strongly
    // desirable (without it there is no variance or achievement) but is not
    // required - a line invoiced mid-period may legitimately have no budget
    // split yet.
    if (line.actual === null) {
      issues.push(missing("revenue", `${label} - Actual revenue`));
    }
    if (line.actual !== null && line.actual < 0 && !line.isTransfer) {
      issues.push(
        inconsistent("revenue", `${label} - Actual revenue`, "External revenue cannot be negative - use a reduction line or record it as a transfer")
      );
    }
    if (line.budget !== null && line.actual !== null && line.budget > 0 && line.actual > line.budget * 3) {
      // Not an error - revenue can beat budget - but a 3x overrun usually means
      // a units error (cents vs rand) rather than a real result.
      issues.push(
        inconsistent(
          "revenue",
          `${label} - Actual revenue`,
          `Actual revenue is more than three times the budget - check this is not a units error`
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Section 9 - Cash Flow
// ---------------------------------------------------------------------------

function validateCashFlow(report: FinanceReport): ValidationIssue[] {
  const c = report.cashFlow;
  if (c.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  const hasInflow = CASH_INFLOW_TYPES.some((t) => c.inflows[t].amount !== null);
  const hasOutflow = CASH_OUTFLOW_TYPES.some((t) => c.outflows[t].amount !== null);

  if (!hasInflow && !hasOutflow) {
    issues.push(missing("cashFlow", "At least one cash inflow or outflow for the period"));
    return issues;
  }

  // The opening position anchors the closing balance, so it is required
  // whenever there is any movement to report.
  if (c.openingBankBalance === null && c.openingCashOnHand === null) {
    issues.push(missing("cashFlow", "Opening cash balance"));
  }

  // Any line where actuals exist but a prior-period figure does not prevents
  // the period-on-period comparison Section 7/19 rely on.
  CASH_INFLOW_TYPES.forEach((t) => {
    if (c.inflows[t].amount === null && c.inflows[t].previousPeriod !== null) {
      issues.push(
        inconsistent("cashFlow", `${t} - current period`, `A previous-period figure was given for ${t} but not the current period`)
      );
    }
  });

  // Section 10: a forecast with only half its inputs is not a forecast.
  if ((c.forecastInflows === null) !== (c.forecastOutflows === null)) {
    issues.push(
      inconsistent(
        "cashFlow",
        "Cash forecast",
        "A forecast needs both expected inflows and expected outflows - supply both or neither"
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Section 12 - Budgets
// ---------------------------------------------------------------------------

function validateBudgets(report: FinanceReport): ValidationIssue[] {
  const b = report.budgets;
  if (b.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  if (b.lines.length === 0) {
    issues.push(missing("budgets", "At least one budget line (or mark the section Not Applicable)"));
    return issues;
  }

  const seen = new Set<string>();
  const years = new Set<string>();
  b.lines.forEach((line, i) => {
    const label = `Budget line ${i + 1}`;
    if (isBlank(line.budgetId)) issues.push(missing("budgets", `${label} - Budget ID`));
    if (isBlank(line.budgetLine) && isBlank(line.category) && isBlank(line.costCentre)) {
      issues.push(missing("budgets", `${label} - Budget line description`));
    }
    // Section 13 divides by the budget in force, so a line with spend and no
    // budget cannot produce a utilisation figure at all.
    if (line.approvedBudget === null && line.revisedBudget === null) {
      issues.push(missing("budgets", `${label} - Approved or revised budget`));
    }
    if (line.actualExpenditure === null) {
      issues.push(missing("budgets", `${label} - Actual expenditure`));
    }

    if (!isBlank(line.budgetId)) {
      if (seen.has(line.budgetId)) {
        issues.push(inconsistent("budgets", `${label} - Budget ID`, `Duplicate budget ID "${line.budgetId}"`));
      }
      seen.add(line.budgetId);
    }

    const budget = line.revisedBudget ?? line.approvedBudget;
    // Section 12: a Budget Monitor export routinely spans two financial years.
    // If only some lines name their year, the untagged ones may belong to either,
    // and the utilisation figure would blend them. Flagged, not blocked: the
    // submission is still Finance's to interpret.
    if (!isBlank(line.financialYear)) years.add(line.financialYear.trim().toLowerCase());

    // Actual + committed above the budget in force is a real overspend, which
    // is exactly what the EWS is meant to surface - not a data-entry error.
    // So it is reported as context, not blocked here.
    if (budget !== null && budget < 0) {
      issues.push(inconsistent("budgets", `${label} - Budget`, "A budget cannot be negative"));
    }
    if (
      line.actualExpenditure !== null &&
      line.actualExpenditure < 0 &&
      line.committedExpenditure === null
    ) {
      issues.push(
        inconsistent("budgets", `${label} - Actual expenditure`, "Negative actual expenditure needs a matching committed or credit figure")
      );
    }
  });

  if (years.size > 1) {
    issues.push(
      inconsistent(
        "budgets",
        "Financial year",
        `Budget lines span more than one financial year (${[...years].join(", ")}). Utilisation would blend years - submit one year at a time or tag every line.`
      )
    );
  }
  if (years.size > 0 && years.size < b.lines.length) {
    issues.push(
      inconsistent(
        "budgets",
        "Financial year",
        `Only ${years.size} of ${b.lines.length} budget lines state a financial year. Untagged lines are counted in the same utilisation figure.`
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Section 15 - Debtors
// ---------------------------------------------------------------------------

function validateDebtors(report: FinanceReport, today: Date): ValidationIssue[] {
  const d = report.debtors;
  if (d.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  if (d.records.length === 0) {
    issues.push(missing("debtors", "At least one debtor record (or mark the section Not Applicable)"));
    return issues;
  }

  const seen = new Set<string>();
  d.records.forEach((rec, i) => {
    const label = `Debtor ${i + 1}`;
    if (isBlank(rec.customer)) issues.push(missing("debtors", `${label} - Customer`));
    if (isBlank(rec.invoiceNumber)) issues.push(missing("debtors", `${label} - Invoice number`));
    if (isBlank(rec.dueDate)) issues.push(missing("debtors", `${label} - Due date`));
    if (rec.invoiceAmount === null) issues.push(missing("debtors", `${label} - Invoice amount`));

    if (!isBlank(rec.invoiceNumber)) {
      const key = rec.invoiceNumber.trim().toLowerCase();
      if (seen.has(key)) {
        issues.push(inconsistent("debtors", `${label} - Invoice number`, `Duplicate invoice "${rec.invoiceNumber}"`));
      }
      seen.add(key);
    }

    if (!isBlank(rec.invoiceDate) && !isBlank(rec.dueDate)) {
      if (new Date(rec.dueDate).getTime() < new Date(rec.invoiceDate).getTime()) {
        issues.push(inconsistent("debtors", `${label} - Due date`, "Due date cannot be before the invoice date"));
      }
    }
    if (!isBlank(rec.dueDate) && new Date(rec.dueDate).getTime() < 0) {
      issues.push(inconsistent("debtors", `${label} - Due date`, "Due date is not a valid date"));
    }

    // More received than invoiced is either a data-entry slip or a credit note.
    // Either way it silently inflates the collection rate, so it is caught.
    if (
      rec.invoiceAmount !== null &&
      rec.amountReceived !== null &&
      rec.amountReceived > rec.invoiceAmount
    ) {
      issues.push(
        inconsistent(
          "debtors",
          `${label} - Amount received`,
          `Amount received (${rec.amountReceived}) exceeds the invoice amount (${rec.invoiceAmount})`
        )
      );
    }

    // Section 15: status and figures have to agree. An invoice marked Paid is
    // reported as collected by the collection rate while the ageing table still
    // shows it outstanding, and nobody can tell which figure to believe.
    if (rec.status === "Paid" && rec.invoiceAmount !== null && rec.amountReceived !== null) {
      const outstanding = rec.invoiceAmount - rec.amountReceived;
      if (outstanding > 1) {
        issues.push(
          inconsistent(
            "debtors",
            `${label} - Status`,
            `Marked Paid but ${Math.round(outstanding)} still outstanding`
          )
        );
      }
    }

    // A follow-up date in the past on an unpaid invoice is worth surfacing but
    // not blocking.
    if (
      !isBlank(rec.followUpDate) &&
      rec.amountReceived !== null &&
      rec.amountReceived < (rec.invoiceAmount ?? 0) &&
      new Date(rec.followUpDate).getTime() < today.getTime()
    ) {
      issues.push(
        inconsistent(
          "debtors",
          `${label} - Follow-up date`,
          "Follow-up date has passed and the invoice is still not fully settled"
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Section 18 - Creditors
// ---------------------------------------------------------------------------

function validateCreditors(report: FinanceReport): ValidationIssue[] {
  const c = report.creditors;
  if (c.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  if (c.records.length === 0) {
    issues.push(missing("creditors", "At least one creditor record (or mark the section Not Applicable)"));
    return issues;
  }

  const seen = new Set<string>();
  c.records.forEach((rec, i) => {
    const label = `Creditor ${i + 1}`;
    if (isBlank(rec.supplier)) issues.push(missing("creditors", `${label} - Supplier`));
    if (isBlank(rec.invoiceNumber)) issues.push(missing("creditors", `${label} - Invoice number`));
    if (isBlank(rec.dueDate)) issues.push(missing("creditors", `${label} - Due date`));
    if (rec.invoiceAmount === null) issues.push(missing("creditors", `${label} - Invoice amount`));

    if (!isBlank(rec.invoiceNumber)) {
      const key = rec.invoiceNumber.trim().toLowerCase();
      if (seen.has(key)) {
        issues.push(inconsistent("creditors", `${label} - Invoice number`, `Duplicate invoice "${rec.invoiceNumber}"`));
      }
      seen.add(key);
    }

    if (!isBlank(rec.invoiceDate) && !isBlank(rec.dueDate)) {
      if (new Date(rec.dueDate).getTime() < new Date(rec.invoiceDate).getTime()) {
        issues.push(inconsistent("creditors", `${label} - Due date`, "Due date cannot be before the invoice date"));
      }
    }

    if (rec.invoiceAmount !== null && rec.amountPaid !== null && rec.amountPaid > rec.invoiceAmount) {
      issues.push(
        inconsistent(
          "creditors",
          `${label} - Amount paid`,
          `Amount paid (${rec.amountPaid}) exceeds the invoice amount (${rec.invoiceAmount})`
        )
      );
    }

    // Section 18: same agreement rule as debtors. A creditor invoice marked Paid
    // is excluded from the overdue position, so a leftover balance would quietly
    // disappear from the ageing report.
    if (rec.status === "Paid" && rec.invoiceAmount !== null && rec.amountPaid !== null) {
      const outstanding = rec.invoiceAmount - rec.amountPaid;
      if (outstanding > 1) {
        issues.push(
          inconsistent(
            "creditors",
            `${label} - Status`,
            `Marked Paid but ${Math.round(outstanding)} still outstanding`
          )
        );
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Section 21 - Profitability
// ---------------------------------------------------------------------------

function validateProfitability(report: FinanceReport, expenseCategories: string[]): ValidationIssue[] {
  const p = report.profitability;
  if (p.notApplicable) return [];

  const issues: ValidationIssue[] = [];

  if (p.expenses.length === 0) {
    // Without expenses there is no operating result, only revenue. Section 22
    // needs the surplus/deficit, so this blocks submission rather than letting
    // an operating surplus be reported from revenue alone.
    issues.push(missing("profitability", "At least one operating expense line (or mark the section Not Applicable)"));
    return issues;
  }

  p.expenses.forEach((line, i) => {
    const label = `Expense line ${i + 1}`;
    if (isBlank(line.categoryId) || !expenseCategories.includes(line.categoryId)) {
      issues.push(missing("profitability", `${label} - Expense category`));
    }
    if (line.actual === null) {
      issues.push(missing("profitability", `${label} - Actual expenditure`));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-section checks
// ---------------------------------------------------------------------------

/**
 * Checks that span sections. These are the ones a per-section validator cannot
 * see, and they are where a confidently wrong KPI would otherwise be born.
 */
function validateCrossSection(report: FinanceReport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Section 9 derives closing cash. If Finance also typed a closing balance and
  // it disagrees with the derived figure, the workbook and the submission are
  // saying different things - one of them is wrong and we do not know which, so
  // it must be resolved by a person rather than silently picked.
  const cash = calculateCashFlow(report.cashFlow);
  if (
    cash?.closingCash !== null &&
    cash?.closingCash !== undefined &&
    report.cashFlow.closingCashEntered !== null &&
    report.cashFlow.closingCashEntered !== undefined &&
    Math.abs(cash.closingCash - report.cashFlow.closingCashEntered) > 1
  ) {
    issues.push(
      inconsistent(
        "cashFlow",
        "Closing cash balance",
        `Closing balance entered (${report.cashFlow.closingCashEntered}) does not reconcile with opening balance plus inflows less outflows (${cash.closingCash})`
      )
    );
  }

  // Section 21: a surplus can only be reported once both sides exist. Revenue
  // captured with no expenses would otherwise read as a 100% margin.
  const profitability = calculateProfitability(report.revenue, report.profitability);
  if (profitability && !profitability.complete) {
    issues.push(
      inconsistent(
        "profitability",
        "Operating surplus / deficit",
        "An operating result needs both revenue and expenditure. One side is missing, so no surplus or margin can be reported."
      )
    );
  }

  // Section 13: a revision below what has already been spent is arithmetically
  // possible but almost always a versioning mistake in the workbook.
  const budgets = calculateBudgets(report.budgets);
  budgets?.overspentLines.forEach((line) => {
    const l = line.line;
    if (l.actualExpenditure !== null && l.actualExpenditure > (line.budget ?? 0) && (l.budgetId ?? "").trim() !== "") {
      issues.push(
        inconsistent(
          "budgets",
          `Budget line ${l.budgetId}`,
          `Actual spend exceeds the budget in force by ${Math.round(Math.abs(line.remaining ?? 0))} - confirm this overspend is intended`
        )
      );
    }
  });

  // Section 33: an import that failed must not leave the section looking merely
  // empty. It has to say so.
  if (report.dataSource.failureReason) {
    issues.push(
      inconsistent(
        "revenue",
        "Data source",
        `The last workbook import failed: ${report.dataSource.failureReason}. Re-import or enter the figures manually.`
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const SECTION_VALIDATORS: Record<FinanceSectionKey, (report: FinanceReport, ctx: ValidationContext) => ValidationIssue[]> = {
  revenue: (r, ctx) => validateRevenue(r, ctx.revenueCategoryIds),
  cashFlow: (r) => validateCashFlow(r),
  budgets: (r) => validateBudgets(r),
  debtors: (r, ctx) => validateDebtors(r, ctx.today),
  creditors: (r) => validateCreditors(r),
  profitability: (r, ctx) => validateProfitability(r, ctx.expenseCategories),
};

interface ValidationContext {
  revenueCategoryIds: string[];
  expenseCategories: string[];
  today: Date;
}

export interface ValidateOptions {
  /** Approved revenue category ids. A line referencing a category the
   *  administrator has since removed is flagged rather than silently accepted. */
  revenueCategoryIds: string[];
  /** Approved expense categories (Section 21). */
  expenseCategories: string[];
  today?: Date;
}

/**
 * Validates a whole report and classifies each section.
 *
 * A section with issues is `incomplete`; one marked Not Applicable is
 * satisfied, not skipped - Finance with no debtors this month must not be
 * blocked. The modal upgrades `complete` to `attention` once it sees an
 * Amber/Red KPI, because that is a different kind of problem from missing data.
 */
export function validateFinanceReport(
  report: FinanceReport,
  options: ValidateOptions
): FinanceValidationResult {
  const ctx: ValidationContext = {
    revenueCategoryIds: options.revenueCategoryIds,
    expenseCategories: options.expenseCategories,
    today: options.today ?? new Date(),
  };
  const bySection = {} as Record<FinanceSectionKey, SectionValidation>;

  FINANCE_SECTION_KEYS.forEach((key) => {
    const issues = SECTION_VALIDATORS[key](report, ctx);
    bySection[key] = {
      state: issues.length > 0 ? "incomplete" : isNotApplicable(report, key) ? "not_applicable" : "complete",
      issues,
    };
  });

  // Cross-section issues are attributed to the section they concern so the
  // progress strip reflects them too - a cash reconciliation failure is a Cash
  // Flow problem, not a general one.
  const cross = validateCrossSection(report);
  cross.forEach((issue) => {
    bySection[issue.section].issues.push(issue);
    if (bySection[issue.section].state === "complete") bySection[issue.section].state = "incomplete";
  });

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  return { valid: issues.length === 0, issues, bySection };
}

function isNotApplicable(report: FinanceReport, key: FinanceSectionKey): boolean {
  switch (key) {
    case "revenue":
      return report.revenue.notApplicable;
    case "cashFlow":
      return report.cashFlow.notApplicable;
    case "budgets":
      return report.budgets.notApplicable;
    case "debtors":
      return report.debtors.notApplicable;
    case "creditors":
      return report.creditors.notApplicable;
    case "profitability":
      return report.profitability.notApplicable;
  }
}

/**
 * Human-readable missing-data summary for the refusal message (Section 25),
 * grouped by section so it reads like the specification's own example.
 */
export function summariseIssues(issues: ValidationIssue[]): { section: FinanceSectionKey; lines: string[] }[] {
  const grouped = new Map<FinanceSectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({ section, lines }));
}

/**
 * Non-blocking observations worth showing before submission (Section 41's review
 * step). Things that are not errors but that Finance should see before the
 * numbers become the official position.
 */
export function financeDataNotes(
  report: FinanceReport,
  config: { revenueCategories: { id: string; kind: string }[] }
): string[] {
  const notes: string[] = [];

  const revenue = calculateRevenue(report.revenue, config.revenueCategories);
  if (revenue && revenue.budget === null) {
    notes.push("Revenue: no budget figures supplied, so variance and achievement cannot be calculated.");
  }

  const cash = calculateCashFlow(report.cashFlow);
  if (cash) {
    if (!cash.forecastAvailable) {
      notes.push("Cash Flow: forecast data not available - enter approved expected inflows and outflows to project a closing position.");
    } else if (cash.forecastShortfall) {
      notes.push("Cash Flow: the approved forecast projects a negative closing position.");
    }
  }

  const budgets = calculateBudgets(report.budgets);
  if (budgets) {
    if (budgets.overspentLines.length > 0) {
      notes.push(
        `Budgets: ${budgets.overspentLines.length} line(s) are over budget - ${budgets.overspentLines
          .slice(0, 3)
          .map((l) => l.label)
          .join(", ")}${budgets.overspentLines.length > 3 ? ", …" : ""}.`
      );
    }
    if (budgets.lowestRemaining?.remaining !== null && budgets.lowestRemaining?.remaining !== undefined) {
      notes.push(
        `Budgets: tightest remaining balance is on "${budgets.lowestRemaining.label}" at ${budgets.lowestRemaining.remaining}.`
      );
    }
  }

  return notes;
}
