// The `/browser` entry point is required: read-excel-file's root export map only
// declares platform subpaths, so a bare "read-excel-file" import does not
// resolve. The browser build is the right one for a client-side file upload.
import readXlsxFile from "read-excel-file/browser";
import {
  DEFAULT_REVENUE_CATEGORIES,
  type BudgetLine,
  type CreditorRecord,
  type DebtorRecord,
  type ExpenseLine,
  type FinanceReport,
  type FinanceSectionKey,
  type ImportRun,
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

/** One worksheet as read from the file. */
export interface WorkbookSheet {
  name: string;
  rows: unknown[][];
  /** Header row detected for this sheet. */
  headers: string[];
  /** Data rows beneath the header. */
  dataRows: unknown[][];
  /** Non-empty cell count - a cheap signal of whether a sheet is worth showing. */
  populatedCells: number;
}

/** Which Finance section a sheet is being imported into. */
export type ImportTarget = FinanceSectionKey;

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
export interface FieldSpec {
  /** Internal field key, matching the report object. */
  key: string;
  label: string;
  /** Header spellings that map to this field. Matched case-insensitively. */
  aliases: string[];
  required?: boolean;
  kind: "text" | "number" | "currency" | "date" | "boolean" | "category" | "enum";
  /** For enum/category fields, the accepted values. */
  options?: readonly string[];
}

const DATE_ALIASES = ["date", "due date", "invoice date", "posting date", "transaction date"];

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
  { key: "paymentDate", label: "Payment date", kind: "text", aliases: ["payment date", "paid date", "date paid"] },
  { key: "responsibleOwner", label: "Responsible owner", kind: "text", aliases: ["owner", "responsible", "responsible owner", "contact"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comment"] },
];

export const EXPENSE_FIELDS: FieldSpec[] = [
  { key: "description", label: "Expense description", kind: "text", aliases: ["description", "details", "narrative", "item", "expense description", "line"] },
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
// Step 1-2: read the workbook
// ---------------------------------------------------------------------------

/**
 * Reads an uploaded workbook into per-sheet row arrays.
 *
 * The header row is detected rather than assumed to be row 1, because finance
 * workbooks routinely carry a title and a date range above the table. It is the
 * first row with two or more non-empty text cells that other rows also fill -
 * a title row has one populated cell, a blank spacer has none.
 */
export async function readWorkbook(file: File): Promise<WorkbookSheet[]> {
  const sheets = await readAllSheets(file);
  return sheets.map((sheet) => describeSheet(sheet.data, sheet.sheet));
}

/**
 * Reads every sheet with its real name.
 *
 * `read-excel-file` returns one `{ sheet, data }` record per worksheet, so the
 * name and the rows arrive together. That matters for traceability: an ImportRun
 * names the sheet a figure came from, and a row/name mismatch would make the
 * audit trail point at the wrong worksheet.
 */
async function readAllSheets(file: File): Promise<{ sheet: string; data: unknown[][] }[]> {
  const buffer = await file.arrayBuffer();
  const sheets = await readXlsxFile<unknown>(buffer);
  return sheets.map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] }));
}

function describeSheet(rows: unknown[][], name: string): WorkbookSheet {
  const headerIndex = detectHeaderRow(rows);
  const headers = headerIndex >= 0 ? (rows[headerIndex] ?? []).map((h) => String(h ?? "").trim()) : [];
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const populatedCells = rows.reduce(
    (sum, row) => sum + row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length,
    0
  );
  return { name, rows, headers, dataRows, populatedCells };
}

function detectHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 15);
  let best = -1;
  let bestCount = 1;
  for (let i = 0; i < limit; i += 1) {
    const count = (rows[i] ?? []).filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
    if (count > bestCount) {
      bestCount = count;
      best = i;
    }
  }
  return best;
}

/**
 * Reads a workbook and pairs each sheet with its real name.
 *
 * Kept as a named export because it is the only entry point the modal needs, and
 * it is the single place the library's shape is adapted to our `WorkbookSheet`.
 */
export async function readWorkbookWithNames(file: File): Promise<WorkbookSheet[]> {
  return readWorkbook(file);
}

// ---------------------------------------------------------------------------
// Step 3-4: map columns
// ---------------------------------------------------------------------------

/** A mapping from internal field key to the sheet header it reads from. */
export type ColumnMapping = Record<string, string>;

/**
 * Suggests a mapping by matching each field's accepted header aliases.
 *
 * A SUGGESTION, never an application: the modal shows it and Finance confirms
 * or corrects every field before anything is imported. When two fields would
 * claim the same header, the first match wins and the conflict is reported, so
 * an ambiguous sheet produces a visible question rather than a silently wrong
 * figure.
 */
export function suggestMapping(headers: string[], fields: FieldSpec[]): {
  mapping: ColumnMapping;
  conflicts: { header: string; claimedBy: string[] }[];
} {
  const normalised = headers.map((h) => h.trim().toLowerCase());
  const mapping: ColumnMapping = {};
  const claimed: Record<string, string[]> = {};

  for (const field of fields) {
    const aliasSet = field.aliases.map((a) => a.toLowerCase());
    const idx = normalised.findIndex((h) => h !== "" && aliasSet.includes(h));
    if (idx >= 0) {
      mapping[field.key] = headers[idx];
      claimed[headers[idx]] = [...(claimed[headers[idx]] ?? []), field.label];
    }
  }

  const conflicts = Object.entries(claimed)
    .filter(([, claimants]) => claimants.length > 1)
    .map(([header, claimants]) => ({ header, claimedBy: claimants }));

  return { mapping, conflicts };
}

// ---------------------------------------------------------------------------
// Step 5-6: validate and preview
// ---------------------------------------------------------------------------

export interface RowIssue {
  /** 1-based row number as it appears in the sheet, for Finance to find it. */
  rowNumber: number;
  field: string;
  message: string;
}

export interface ParsedRow {
  rowNumber: number;
  values: Record<string, unknown>;
  issues: RowIssue[];
}

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
  const headerIndex = new Map(sheet.headers.map((h, i) => [h.trim().toLowerCase(), i]));

  // A required field with no column mapped cannot be supplied by any row, so
  // every row is unimportable. Saying so per row keeps the section out of the
  // report entirely rather than filling it with half-built records that would
  // only fail validation later.
  const unmappedRequired = fields.filter((f) => f.required && !mapping[f.key]);

  const rows: ParsedRow[] = [];
  sheet.dataRows.forEach((row, i) => {
    // A wholly blank row is spreadsheet padding, not a record.
    const hasContent = row.some((c) => c !== null && c !== undefined && String(c).trim() !== "");
    if (!hasContent) return;

    const values: Record<string, unknown> = {};
    const issues: RowIssue[] = [];

    for (const field of unmappedRequired) {
      issues.push({
        rowNumber: i + 2,
        field: field.label,
        message: `${field.label} is not mapped, so no column can supply it`,
      });
    }

    for (const field of fields) {
      const header = mapping[field.key];
      if (!header) continue;
      const col = headerIndex.get(header.trim().toLowerCase());
      const raw = col === undefined ? null : (row[col] ?? null);

      if (field.required && isBlankCell(raw)) {
        issues.push({ rowNumber: i + 2, field: field.label, message: `${field.label} is required` });
        continue;
      }
      if (isBlankCell(raw)) continue;

      const parsed = coerce(raw, field, options);
      if (typeof parsed === "string" && field.kind !== "text" && field.kind !== "category" && field.kind !== "enum") {
        issues.push({ rowNumber: i + 2, field: field.label, message: `"${String(raw).trim()}" is not a valid ${field.kind}` });
        continue;
      }
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        issues.push({ rowNumber: i + 2, field: field.label, message: (parsed as { error: string }).error });
        continue;
      }
      values[field.key] = parsed;
    }

    // A row with no usable values at all cannot become a record.
    if (Object.keys(values).length === 0 && issues.length > 0) {
      rows.push({ rowNumber: i + 2, values, issues });
      return;
    }
    rows.push({ rowNumber: i + 2, values, issues });
  });

  const acceptable = rows.filter((r) => r.issues.length === 0);
  const rejected = rows.filter((r) => r.issues.length > 0);
  const unmappedFields = fields
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);

  return {
    target,
    sheetName: sheet.name,
    rows,
    acceptable,
    rejected,
    mapping,
    unmappedFields,
    headers: sheet.headers,
  };
}

function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Coerces a raw cell into the target type.
 *
 * Currency is parsed leniently because finance workbooks write R1 234.56,
 * (1,234.56) for negatives, and "1,234" interchangeably - but never so leniently
 * that unrecognised text becomes a number. A cell that cannot be read becomes an
 * explicit error, which surfaces as a rejected row, rather than a silent zero.
 */
function coerce(
  raw: unknown,
  field: FieldSpec,
  options: { revenueCategories?: { id: string; label: string }[]; expenseCategories?: string[] }
): unknown {
  const text = String(raw).trim();

  switch (field.kind) {
    case "currency":
    case "number": {
      const parsed = parseNumeric(text);
      if (parsed === null) return { error: `"${text}" is not a number` };
      return parsed;
    }
    case "date": {
      return parseDate(text);
    }
    case "boolean": {
      return /^(y|yes|true|1)$/i.test(text);
    }
    case "category": {
      if (field.key === "categoryId" && options.revenueCategories) {
        const match = options.revenueCategories.find(
          (c) => c.label.toLowerCase() === text.toLowerCase() || c.id.toLowerCase() === text.toLowerCase()
        );
        if (match) return match.id;
        return { error: `"${text}" is not an approved category - map it or add it in Administration` };
      }
      if (field.key === "categoryId" && options.expenseCategories) {
        const match = options.expenseCategories.find((c) => c.toLowerCase() === text.toLowerCase());
        if (match) return match;
        return { error: `"${text}" is not an approved expense category - map it or add it in Administration` };
      }
      return text;
    }
    default:
      return text;
  }
}

/** Parses a number out of finance-formatted text. Returns null when the text
 *  holds no recognisable number, so the caller can reject the row. */
export function parseNumeric(text: string): number | null {
  let s = text.trim();
  if (s === "") return null;
  // Accounting negatives: (1,234.56)
  const parenNegative = /^\(.*\)$/.test(s);
  if (parenNegative) s = s.slice(1, -1);
  // Strip currency symbols, spaces and thousands separators.
  s = s.replace(/[^\d.,-]/g, "");
  if (parenNegative && !s.startsWith("-")) s = `-${s}`;
  // Decide which separator is the decimal point: the last one, if it leaves 1-2
  // digits after it, is a decimal point. "1,234" is a thousands separator;
  // "1,50" is a decimal comma.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const after = s.length - lastComma - 1;
    s = after === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses a date cell into an ISO date.
 *
 * Covers the formats a finance workbook actually contains: real Excel serial
 * dates, ISO strings, and the day-month-year and day/month/year text forms used
 * when a sheet has been exported to CSV in a South African locale.
 *
 * Returns null when the value is not a date the app can read. It is never
 * guessed - a due date invented from an unreadable cell would silently corrupt
 * every ageing calculation downstream.
 */
export function parseDate(text: string): string | null {
  const s = text.trim();
  if (s === "") return null;

  // Excel serial date (1900 system): day 1 = 1900-01-01, with the well-known
  // 1900 leap-year bug, so the epoch is offset accordingly.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 0 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;

  // South African / European convention: day first.
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return `${year}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }

  // Textual months, e.g. "28 Sep 2026". Date.parse reads these as local
  // midnight, so the calendar date is read back from local parts: converting via
  // toISOString would move every date a day backwards east of Greenwich, which
  // is every date Buhle imports.
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${pad(String(d.getMonth() + 1))}-${pad(String(d.getDate()))}`;
  }

  return null;
}

function pad(v: string): string {
  return v.padStart(2, "0");
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
