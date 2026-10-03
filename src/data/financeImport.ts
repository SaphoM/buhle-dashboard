import { buildRows, parseDate, parseNumeric, readWorkbook, readWorkbookWithNames, suggestMapping } from "./workbookImport";
import type { ColumnMapping, FieldSpec, ParsedRow, RowIssue, WorkbookSheet } from "./workbookImport";
import {
  DEFAULT_REVENUE_CATEGORIES,
  type BudgetStatus,
  type BudgetLine,
  type CreditorRecord,
  type DebtorRecord,
  type ExpenseLine,
  type FinanceReport,
  type FinanceSectionKey,
  type ImportRun,
  type ReceivableStatus,
  type RevenueLine,
} from "../types/finance";
import {
  blankBudgetLine,
  blankCreditorRecord,
  blankDebtorRecord,
  blankExpenseLine,
  blankRevenueLine,
} from "./financeSeed";

/**
 * ============================================================================
 * Finance workbook import (Section 26).
 * ============================================================================
 *
 *     UPLOAD -> READ WORKBOOK -> SHOW SHEETS -> MAP COLUMNS -> VALIDATE
 *            -> PREVIEW -> IMPORT -> CALCULATE KPIs -> EVALUATE EWS
 *
 * The Finance department's dashboard today IS an internally built Excel
 * workbook (discovery, Sept 2026), and Section 2 makes reproducing its business
 * logic the preferred direction rather than depending on a Sage integration. So
 * import is a first-class path into the same submission a manager can type into
 * - not a separate data model, and not a second submission system.
 *
 * Three rules govern this module:
 *
 *  1. NOTHING IS OVERWRITTEN SILENTLY (Section 26). Import produces a PREVIEW -
 *     parsed rows, validation verdicts, what will change - and only commits when
 *     Finance confirms. Section 26 is explicit: "Show the user what will be
 *     imported before committing."
 *
 *  2. THE WORKBOOK'S OWN FORMULAS ARE NOT GUESSED AT (Section 2). Since the real
 *     workbook is not in this repository, the importer reads the values it is
 *     given and maps them field by field under Finance's supervision. It never
 *     infers a formula, never invents a column, and never fabricates a value for
 *     a cell it could not read. Section 2's rule - "Do NOT fabricate financial
 *     values" - is enforced literally here.
 *
 *  3. IMPORT IS NOT AN ERP INTEGRATION (Section 3). This reads a file a person
 *     uploads. There is no API dependency, no live feed, and nothing to
 *     configure server-side, so the Finance dashboard is fully usable without it.
 *
 * Provenance (Section 26/27) is first-class: every run records file, sheet,
 * row counts, the column mapping used and who imported it, so any figure on the
 * dashboard can be traced back to a specific cell in a specific workbook.
 */

/** Which Finance section a sheet is being imported into. */
export type ImportTarget = FinanceSectionKey;

// The generic reading machinery lives in workbookImport because Operations uses
// the identical rules. These re-exports keep the Finance import module's public
// surface unchanged, so the wizard and its tests import from one place as before.
export { readWorkbook, readWorkbookWithNames, suggestMapping, parseNumeric, parseDate };
export type { WorkbookSheet, ColumnMapping, FieldSpec, RowIssue, ParsedRow };

export interface ImportPreview {
  target: ImportTarget;
  sheetName: string;
  rows: ParsedRow[];
  /** Rows with no blocking problem. */
  acceptable: ParsedRow[];
  /** Rows that will be skipped, with the reason. */
  rejected: ParsedRow[];
  mapping: ColumnMapping;
  /** Fields the mapping did not cover - reported so Finance knows what will be
   *  missing rather than discovering it in the review page. */
  unmappedFields: string[];
  headers: string[];
}

/**
 * The fields each target can receive from a sheet, and the header aliases that
 * identify them.
 *
 * Aliases exist because a hand-built finance workbook never has tidy headers -
 * "Amount", "Actual Amount", "Budget Actual" and "YTD Actual" all mean different
 * things to a person and everything to a parser. Guessing between them silently
 * would be exactly the fabrication Section 2 forbids, so each logical field
 * lists the headers it will accept, and the mapping step requires a human to
 * choose. An unmatched field is simply not imported; it is never guessed.
 */

const DATE_ALIASES = ["date", "due date", "invoice date", "posting date", "transaction date"];

/** The accepted enum values, taken from the domain vocabulary rather than
 *  restated here, so an imported value and a typed value cannot diverge. */
const BUDGET_STATUS_VALUES: readonly BudgetStatus[] = ["Approved", "Revised", "Pending Revision"];
const RECEIVABLE_STATUS_VALUES: readonly ReceivableStatus[] = [
  "Open",
  "Partially Paid",
  "Paid",
  "Disputed",
  "Written Off",
];
const COST_TYPE_VALUES: readonly ("Direct" | "Indirect")[] = ["Direct", "Indirect"];

export const REVENUE_FIELDS: FieldSpec[] = [
  { key: "description", label: "Revenue description", kind: "text", aliases: ["description", "details", "narrative", "item", "revenue description", "line"] },
  { key: "counterparty", label: "Customer / funder / partner", kind: "text", aliases: ["customer", "funder", "partner", "donor", "client", "counterparty"] },
  { key: "costCentre", label: "Cost centre", kind: "text", aliases: ["cost centre", "costcenter", "cc", "department", "cost centre name"] },
  { key: "project", label: "Project / programme", kind: "text", aliases: ["project", "programme", "program", "project name"] },
  { key: "programme", label: "Course / enterprise", kind: "text", aliases: ["course", "enterprise", "activity", "course/enterprise"] },
  { key: "budget", label: "Budget", kind: "currency", aliases: ["budget", "budgeted", "budget amount", "planned"] },
  { key: "actual", label: "Actual", kind: "currency", required: true, aliases: ["actual", "actuals", "actual amount", "value", "amount", "received"] },
  { key: "previousPeriod", label: "Previous period", kind: "currency", aliases: ["previous", "previous period", "prior", "last period", "previous month"] },
  { key: "ytdBudget", label: "YTD budget", kind: "currency", aliases: ["ytd budget", "year to date budget", "y-t-d budget"] },
  { key: "ytdActual", label: "YTD actual", kind: "currency", aliases: ["ytd actual", "year to date actual", "y-t-d actual"] },
  { key: "categoryId", label: "Revenue category", kind: "category", required: true, aliases: ["category", "revenue category", "type", "income type", "category name"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comment", "comments"] },
];

export const BUDGET_FIELDS: FieldSpec[] = [
  { key: "budgetId", label: "Budget ID", kind: "text", required: true, aliases: ["budget id", "budgetid", "budget code", "code", "id", "line id"] },
  { key: "financialYear", label: "Financial year", kind: "text", aliases: ["financial year", "fin year", "fy", "year", "financialyear"] },
  { key: "period", label: "Period", kind: "text", aliases: ["period", "month", "reporting period", "period covered", "month covered"] },
  { key: "budgetLine", label: "Budget line", kind: "text", required: true, aliases: ["budget line", "line", "line description", "budget line name", "item", "account"] },
  { key: "category", label: "Budget category", kind: "text", aliases: ["category", "budget category", "expense type", "type"] },
  { key: "department", label: "Department", kind: "text", aliases: ["department", "dept", "cost centre owner"] },
  { key: "costCentre", label: "Cost centre", kind: "text", aliases: ["cost centre", "costcenter", "cc"] },
  { key: "project", label: "Project", kind: "text", aliases: ["project", "programme", "program"] },
  { key: "funder", label: "Funder", kind: "text", aliases: ["funder", "donor", "grant", "fund"] },
  { key: "approvedBudget", label: "Approved budget", kind: "currency", aliases: ["approved budget", "approved", "original budget", "budget"] },
  { key: "revisedBudget", label: "Revised budget", kind: "currency", aliases: ["revised budget", "revised", "adjusted budget", "current budget"] },
  { key: "actualExpenditure", label: "Actual expenditure", kind: "currency", required: true, aliases: ["actual", "actuals", "actual expenditure", "spent", "actual spend", "ytd actual"] },
  { key: "committedExpenditure", label: "Committed expenditure", kind: "currency", aliases: ["committed", "commitments", "committed expenditure", "po", "orders"] },
  { key: "forecastExpenditure", label: "Forecast expenditure", kind: "currency", aliases: ["forecast", "forecast expenditure", "expected", "projection"] },
  { key: "status", label: "Budget status", kind: "enum", options: BUDGET_STATUS_VALUES, aliases: ["status", "budget status", "line status", "approval status"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comment"] },
];

export const DEBTOR_FIELDS: FieldSpec[] = [
  { key: "customer", label: "Customer", kind: "text", required: true, aliases: ["customer", "client", "debtor", "account", "name", "customer name"] },
  { key: "invoiceNumber", label: "Invoice number", kind: "text", required: true, aliases: ["invoice", "invoice number", "invoice no", "inv no", "document", "reference"] },
  { key: "invoiceDate", label: "Invoice date", kind: "date", aliases: DATE_ALIASES.concat(["invoice date"]) },
  { key: "dueDate", label: "Due date", kind: "date", required: true, aliases: ["due", "due date", "payment due", "expected date"] },
  { key: "description", label: "Description", kind: "text", aliases: ["description", "details", "service", "narrative"] },
  { key: "department", label: "Department", kind: "text", aliases: ["department", "dept", "cost centre"] },
  { key: "project", label: "Project / course", kind: "text", aliases: ["project", "course", "programme", "service"] },
  { key: "invoiceAmount", label: "Invoice amount", kind: "currency", required: true, aliases: ["invoice amount", "amount", "value", "total", "debt", "outstanding", "balance"] },
  { key: "amountReceived", label: "Amount received", kind: "currency", aliases: ["received", "amount received", "paid", "payment", "settled"] },
  { key: "status", label: "Status", kind: "enum", options: RECEIVABLE_STATUS_VALUES, aliases: ["status", "invoice status", "payment status", "state"] },
  { key: "responsibleOwner", label: "Responsible owner", kind: "text", aliases: ["owner", "responsible", "responsible owner", "account manager", "contact"] },
  { key: "followUpDate", label: "Follow-up date", kind: "text", aliases: ["follow up", "follow-up", "follow up date", "next action"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comment"] },
];

export const CREDITOR_FIELDS: FieldSpec[] = [
  { key: "supplier", label: "Supplier", kind: "text", required: true, aliases: ["supplier", "vendor", "creditor", "payee", "name", "supplier name"] },
  { key: "invoiceNumber", label: "Invoice number", kind: "text", required: true, aliases: ["invoice", "invoice number", "invoice no", "document", "reference"] },
  { key: "invoiceDate", label: "Invoice date", kind: "date", aliases: DATE_ALIASES.concat(["invoice date"]) },
  { key: "dueDate", label: "Due date", kind: "date", required: true, aliases: ["due", "due date", "payment due"] },
  { key: "department", label: "Department", kind: "text", aliases: ["department", "dept"] },
  { key: "costCentre", label: "Cost centre", kind: "text", aliases: ["cost centre", "costcenter", "cc"] },
  { key: "project", label: "Project", kind: "text", aliases: ["project", "programme", "program"] },
  { key: "invoiceAmount", label: "Invoice amount", kind: "currency", required: true, aliases: ["invoice amount", "amount", "value", "total", "balance"] },
  { key: "amountPaid", label: "Amount paid", kind: "currency", aliases: ["paid", "amount paid", "payment", "settled"] },
  { key: "status", label: "Status", kind: "enum", options: RECEIVABLE_STATUS_VALUES, aliases: ["status", "invoice status", "payment status", "state"] },
  { key: "paymentDate", label: "Payment date", kind: "text", aliases: ["payment date", "paid date", "date paid"] },
  { key: "responsibleOwner", label: "Responsible owner", kind: "text", aliases: ["owner", "responsible", "responsible owner", "contact"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comment"] },
];

export const EXPENSE_FIELDS: FieldSpec[] = [
  { key: "description", label: "Expense description", kind: "text", aliases: ["description", "details", "narrative", "item", "expense description", "line"] },
  { key: "costType", label: "Cost type", kind: "enum", options: COST_TYPE_VALUES, aliases: ["cost type", "direct/indirect", "direct or indirect", "nature of cost", "cost nature"] },
  { key: "costCentre", label: "Cost centre", kind: "text", aliases: ["cost centre", "costcenter", "cc"] },
  { key: "department", label: "Department", kind: "text", aliases: ["department", "dept"] },
  { key: "project", label: "Project", kind: "text", aliases: ["project", "programme", "program"] },
  { key: "budget", label: "Budget", kind: "currency", aliases: ["budget", "budgeted", "planned"] },
  { key: "actual", label: "Actual", kind: "currency", required: true, aliases: ["actual", "actuals", "actual amount", "value", "amount", "spent"] },
  { key: "previousPeriod", label: "Previous period", kind: "currency", aliases: ["previous", "previous period", "prior", "last period"] },
  { key: "categoryId", label: "Expense category", kind: "category", required: true, aliases: ["category", "expense category", "type", "expense type"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comment"] },
];

export const TARGET_FIELDS: Record<ImportTarget, FieldSpec[]> = {
  revenue: REVENUE_FIELDS,
  budgets: BUDGET_FIELDS,
  debtors: DEBTOR_FIELDS,
  creditors: CREDITOR_FIELDS,
  profitability: EXPENSE_FIELDS,
  // Cash flow is aggregated from named categories rather than line-by-line, so a
  // two-column sheet (type, amount) is what it needs. Handled separately below.
  cashFlow: [
    { key: "type", label: "Cash flow category", kind: "text", required: true, aliases: ["type", "category", "description", "cash flow type", "detail"] },
    { key: "amount", label: "Amount", kind: "currency", required: true, aliases: ["amount", "value", "total", "inflow", "outflow"] },
    { key: "previousPeriod", label: "Previous period", kind: "currency", aliases: ["previous", "previous period", "prior"] },
  ],
};

export const TARGET_LABELS: Record<ImportTarget, string> = {
  revenue: "Revenue",
  cashFlow: "Cash Flow",
  budgets: "Budgets",
  debtors: "Debtors",
  creditors: "Creditors",
  profitability: "Profitability (expenses)",
};

// ---------------------------------------------------------------------------
// Step 5-6: validate and preview
//
// Reading the workbook (step 1-2) and suggesting a column mapping (step 3-4)
// both live in workbookImport and are re-exported above.
// ---------------------------------------------------------------------------

/**
 * Parses a sheet against a mapping and produces a preview. Nothing is written
 * here - this is the "show the user what will be imported" step, and its output
 * is what Finance approves.
 */
export function buildPreview(
  sheet: WorkbookSheet,
  target: ImportTarget,
  mapping: ColumnMapping,
  options: {
    revenueCategories?: { id: string; label: string }[];
    expenseCategories?: string[];
  } = {}
): ImportPreview {
  const fields = TARGET_FIELDS[target];
  const parsed = buildRows(sheet, fields, mapping, {
    resolveCategory: (key, text) => {
      // Finance category vocabulary: revenue categories carry an id and a label,
      // expense categories are plain strings. Both are matched case-insensitively
      // and refused when unrecognised, so a figure cannot land in the report
      // carrying a category that does not exist.
      if (key !== "categoryId") return undefined;
      if (options.revenueCategories) {
        const match = options.revenueCategories.find(
          (c) => c.label.toLowerCase() === text.toLowerCase() || c.id.toLowerCase() === text.toLowerCase()
        );
        if (match) return { value: match.id };
        return { error: `"${text}" is not an approved category - map it or add it in Administration` };
      }
      if (options.expenseCategories) {
        const match = options.expenseCategories.find((c) => c.toLowerCase() === text.toLowerCase());
        if (match) return { value: match };
        return { error: `"${text}" is not an approved expense category - map it or add it in Administration` };
      }
      return undefined;
    },
  });

  return {
    target,
    sheetName: sheet.name,
    rows: parsed.rows,
    acceptable: parsed.acceptable,
    rejected: parsed.rejected,
    mapping,
    unmappedFields: parsed.unmappedFields,
    headers: sheet.headers,
  };
}

// ---------------------------------------------------------------------------
// Step 7: import - apply a confirmed preview to the report
// ---------------------------------------------------------------------------

export interface ImportResult {
  report: FinanceReport;
  run: ImportRun;
  /** Sections whose existing rows were replaced by imported ones. */
  replacedSections: ImportTarget[];
  accepted: number;
  rejected: number;
}

/**
 * Applies an approved preview to the report.
 *
 * Section 26: "Do NOT automatically overwrite existing financial records. Show
 * the user what will be imported before committing." The modal only calls this
 * after Finance has seen the preview, and the caller chooses REPLACE or APPEND.
 * This function records which happened in the ImportRun so the audit trail says
 * plainly whether prior figures were overwritten.
 */
export function applyImport(
  report: FinanceReport,
  preview: ImportPreview,
  options: { fileName: string; actor: string; mode: "replace" | "append" }
): ImportResult {
  const stamp = new Date().toISOString();
  let next = report;
  const replacedSections: ImportTarget[] = [];

  switch (preview.target) {
    case "revenue": {
      const lines = buildRevenueLines(preview);
      const replace = options.mode === "replace";
      if (replace && report.revenue.lines.length > 0) replacedSections.push("revenue");
      next = {
        ...next,
        revenue: {
          ...next.revenue,
          lines: replace ? lines : [...next.revenue.lines, ...lines],
          notApplicable: false,
        },
      };
      break;
    }
    case "budgets": {
      const lines = buildBudgetLines(preview);
      const replace = options.mode === "replace";
      if (replace && report.budgets.lines.length > 0) replacedSections.push("budgets");
      next = {
        ...next,
        budgets: {
          ...next.budgets,
          lines: replace ? lines : [...next.budgets.lines, ...lines],
          notApplicable: false,
        },
      };
      break;
    }
    case "debtors": {
      const records = buildDebtorRecords(preview);
      const replace = options.mode === "replace";
      if (replace && report.debtors.records.length > 0) replacedSections.push("debtors");
      next = {
        ...next,
        debtors: {
          ...next.debtors,
          records: replace ? records : [...next.debtors.records, ...records],
          notApplicable: false,
        },
      };
      break;
    }
    case "creditors": {
      const records = buildCreditorRecords(preview);
      const replace = options.mode === "replace";
      if (replace && report.creditors.records.length > 0) replacedSections.push("creditors");
      next = {
        ...next,
        creditors: {
          ...next.creditors,
          records: replace ? records : [...next.creditors.records, ...records],
          notApplicable: false,
        },
      };
      break;
    }
    case "profitability": {
      const expenses = buildExpenseLines(preview);
      const replace = options.mode === "replace";
      if (replace && next.profitability.expenses.length > 0) replacedSections.push("profitability");
      next = {
        ...next,
        profitability: {
          ...next.profitability,
          expenses: replace ? expenses : [...next.profitability.expenses, ...expenses],
          notApplicable: false,
        },
      };
      break;
    }
    case "cashFlow": {
      next = applyCashFlowImport(next, preview);
      break;
    }
  }

  const run: ImportRun = {
    id: `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    target: preview.target,
    fileName: options.fileName,
    importedAt: stamp,
    importedBy: options.actor,
    sheetName: preview.sheetName,
    rowsRead: preview.rows.length,
    rowsAccepted: preview.acceptable.length,
    rowsRejected: preview.rejected.length,
    mapping: preview.mapping,
    status: preview.rejected.length > 0 ? "Validated" : "Imported",
    notes: replacedSections.length
      ? `Replaced existing ${replacedSections.join(", ")} figures.`
      : "Appended to existing figures.",
  };

  // Section 27: after an import the source is no longer "not submitted" and no
  // longer a manual entry. Recording the file and sheet is what makes the figure
  // traceable back to the workbook.
  next = {
    ...next,
    importRuns: [...next.importRuns, run],
    dataSource: {
      kind: "Workbook Import",
      fileName: options.fileName,
      sheetName: preview.sheetName,
      importedAt: stamp,
      importedBy: options.actor,
    },
  };

  return {
    report: next,
    run,
    replacedSections,
    accepted: preview.acceptable.length,
    rejected: preview.rejected.length,
  };
}

/** Cash flow import folds rows into the named category totals rather than
 *  creating a line list, because the Cash Flow section is a fixed set of
 *  categories (Section 9). A sheet row whose type is not recognised is reported
 *  as rejected rather than silently dropped into "Other". */
function applyCashFlowImport(report: FinanceReport, preview: ImportPreview): FinanceReport {
  const { CASH_INFLOW_TYPES, CASH_OUTFLOW_TYPES } = CASH_INFLOW_KEYS;
  let inflows = { ...report.cashFlow.inflows };
  let outflows = { ...report.cashFlow.outflows };
  let openingBankBalance = report.cashFlow.openingBankBalance;
  let rejected = 0;

  // Rows the preview flagged are not applied.
  const usable = new Set(preview.acceptable.map((r) => r.rowNumber));

  preview.rows.forEach((row) => {
    if (!usable.has(row.rowNumber)) {
      rejected += 1;
      return;
    }
    const type = String(row.values.type ?? "").trim();
    const amount = typeof row.values.amount === "number" ? row.values.amount : null;
    const previous = typeof row.values.previousPeriod === "number" ? row.values.previousPeriod : null;
    if (amount === null) return;

    const inflow = CASH_INFLOW_TYPES.find((t) => t.toLowerCase() === type.toLowerCase());
    if (inflow) {
      inflows[inflow] = {
        amount: (inflows[inflow].amount ?? 0) + amount,
        previousPeriod: (inflows[inflow].previousPeriod ?? 0) + (previous ?? 0),
      };
      return;
    }
    const outflow = CASH_OUTFLOW_TYPES.find((t) => t.toLowerCase() === type.toLowerCase());
    if (outflow) {
      outflows[outflow] = {
        amount: (outflows[outflow].amount ?? 0) + amount,
        previousPeriod: (outflows[outflow].previousPeriod ?? 0) + (previous ?? 0),
      };
      return;
    }
    if (/opening|balance brought forward|bb?f/i.test(type)) {
      openingBankBalance = (openingBankBalance ?? 0) + amount;
      return;
    }
    // An unrecognised category is a real problem: dropping it into "Other" would
    // quietly corrupt the totals. It is counted as rejected and surfaced.
    rejected += 1;
  });

  return {
    ...report,
    cashFlow: {
      ...report.cashFlow,
      openingBankBalance,
      inflows,
      outflows,
      notApplicable: false,
    },
  };
}

const CASH_INFLOW_KEYS = {
  CASH_INFLOW_TYPES: [
    "Revenue received",
    "Donor / funder receipts",
    "Training receipts",
    "Farm receipts",
    "Loan / grant receipts",
    "Other receipts",
  ],
  CASH_OUTFLOW_TYPES: [
    "Payroll",
    "Operating expenses",
    "Supplier payments",
    "Capital expenditure",
    "Debt repayments",
    "Other approved expenditure",
  ],
} as const;

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function buildRevenueLines(preview: ImportPreview): RevenueLine[] {
  return preview.acceptable.map((row) => ({
    ...blankRevenueLine(String(row.values.categoryId ?? DEFAULT_REVENUE_CATEGORIES[0].id)),
    ...pick(row.values, [
      "description",
      "counterparty",
      "costCentre",
      "project",
      "programme",
      "budget",
      "actual",
      "previousPeriod",
      "ytdBudget",
      "ytdActual",
      "categoryId",
      "notes",
    ]),
  }));
}

function buildExpenseLines(preview: ImportPreview): ExpenseLine[] {
  return preview.acceptable.map((row) => ({
    ...blankExpenseLine(String(row.values.categoryId ?? "")),
    ...pick(row.values, [
      "description",
      "costCentre",
      "department",
      "project",
      "budget",
      "actual",
      "previousPeriod",
      "categoryId",
      "notes",
    ]),
  }));
}

function buildBudgetLines(preview: ImportPreview): BudgetLine[] {
  return preview.acceptable.map((row) => ({
    ...blankBudgetLine(),
    ...pick(row.values, [
      "budgetId",
      "budgetLine",
      "category",
      "department",
      "costCentre",
      "project",
      "funder",
      "approvedBudget",
      "revisedBudget",
      "actualExpenditure",
      "committedExpenditure",
      "forecastExpenditure",
      "notes",
    ]),
  }));
}

function buildDebtorRecords(preview: ImportPreview): DebtorRecord[] {
  return preview.acceptable.map((row) => ({
    ...blankDebtorRecord(),
    ...pick(row.values, [
      "customer",
      "invoiceNumber",
      "invoiceDate",
      "dueDate",
      "description",
      "department",
      "project",
      "invoiceAmount",
      "amountReceived",
      "responsibleOwner",
      "followUpDate",
      "notes",
    ]),
  }));
}

function buildCreditorRecords(preview: ImportPreview): CreditorRecord[] {
  return preview.acceptable.map((row) => ({
    ...blankCreditorRecord(),
    ...pick(row.values, [
      "supplier",
      "invoiceNumber",
      "invoiceDate",
      "dueDate",
      "department",
      "costCentre",
      "project",
      "invoiceAmount",
      "amountPaid",
      "paymentDate",
      "responsibleOwner",
      "notes",
    ]),
  }));
}

function pick(values: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (values[k] !== undefined) out[k] = values[k];
  }
  return out;
}

/** Records a failed import on the report so Section 33's "DATA IMPORT FAILED"
 *  state is real rather than an empty section that reads as merely unfilled. */
export function recordImportFailure(
  report: FinanceReport,
  reason: string,
  fileName?: string,
  /** The section the Manager was trying to fill when the file could not be read. */
  target: ImportTarget = "revenue"
): FinanceReport {
  const stamp = new Date().toISOString();
  return {
    ...report,
    dataSource: {
      ...report.dataSource,
      fileName: fileName ?? report.dataSource.fileName,
      failedAt: stamp,
      failureReason: reason,
    },
    importRuns: [
      ...report.importRuns,
      {
        id: `imp-${Date.now().toString(36)}`,
        target,
        fileName: fileName ?? "unknown",
        importedAt: stamp,
        importedBy: "unknown",
        sheetName: "-",
        rowsRead: 0,
        rowsAccepted: 0,
        rowsRejected: 0,
        mapping: {},
        status: "Failed",
        notes: reason,
      },
    ],
  };
}
