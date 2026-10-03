import readXlsxFile from "read-excel-file/browser";

// ============================================================================
// Shared workbook import core.
//
// Finance and Operations both accept a spreadsheet upload, map its columns to
// typed fields, preview exactly what will be written, and record where every
// figure came from. The parsing rules are the same in both cases, and they are
// the rules that decide whether a figure in the application can be trusted, so
// they live in ONE place rather than being copied per department.
//
// Three properties this module exists to guarantee:
//
//  1. NOTHING IS GUESSED. An unmatched column is reported as unmapped, an
//     unreadable cell is reported as a rejected row with a reason, and an
//     unrecognised controlled-vocabulary value is refused rather than stored as
//     free text. A finance or enrolment register is only as good as the
//     discipline applied when reading someone else's spreadsheet.
//
//  2. A SUGGESTED MAPPING IS NEVER APPLIED SILENTLY. suggestMapping proposes;
//     the user confirms or corrects every field before a single row is written.
//
//  3. NUMBERS AND DATES ARE PARSED THE WAY REAL WORKBOOKS WRITE THEM. Excel
//     serial dates, ISO strings, South African day-first text, accounting
//     negatives and thousands separators. A parser that handles only the tidy
//     case would reject a real file and force manual retyping of work that was
//     already done.
//
// Department modules own their field lists and their record shapes; this module
// owns the mechanics of reading a sheet into typed values.
// ============================================================================

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


/** A sheet as read from a workbook, with its header row already detected. */
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

export function describeSheet(rows: unknown[][], name: string): WorkbookSheet {
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



/** Options a department passes through when coercing controlled-vocabulary
 *  cells. A department resolves its own approved lists; this module has no
 *  knowledge of what a course or an expense category is. */
export interface CoerceOptions {
  /**
   * Resolve a controlled-vocabulary cell (a category, course, programme).
   * Return `{ value }` to accept it, `{ error }` to reject the row with a
   * message, or undefined to fall through to plain text.
   */
  resolveCategory?: (key: string, text: string) => { value: string } | { error: string } | undefined;
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
export function coerceCell(
  raw: unknown,
  field: FieldSpec,
  options: CoerceOptions = {}
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
      // A date parse succeeds by returning a string, so the failure has to be
      // signalled explicitly. Returning null here would hand the caller an empty
      // cell and drop the row's only clue that the workbook held something
      // unreadable in that column.
      const parsed = parseDate(text);
      if (parsed === null) return { error: `"${text}" is not a readable date` };
      return parsed;
    }
    case "boolean": {
      return /^(y|yes|true|1)$/i.test(text);
    }
    case "category": {
      const resolved = options.resolveCategory?.(field.key, text);
      if (resolved) {
        return "value" in resolved ? resolved.value : { error: resolved.error };
      }
      return text;
    }
    case "enum": {
      const accepted = field.options ?? [];
      if (accepted.length === 0) return text;
      const match = accepted.find((o) => o.toLowerCase() === text.toLowerCase());
      if (match) return match;
      // An unrecognised value is rejected rather than stored verbatim: a record
      // claiming to be "Pmts Rcvd" would look like a real status in a report
      // while meaning nothing to anyone reading it.
      return {
        error: `"${text}" is not one of ${accepted.join(", ")} - correct the column or the value`,
      };
    }
    default:
      return text;
  }
}

/** Parses a number out of workbook-formatted text: thousands separators,
 *  currency symbols, accounting negatives, and locale decimal commas. Returns
 *  null when the text holds no recognisable number, so the caller can reject the
 *  row rather than record a zero. */
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
// Step 5: parse a sheet into typed rows
// ---------------------------------------------------------------------------

export interface ParsedRows {
  rows: ParsedRow[];
  acceptable: ParsedRow[];
  rejected: ParsedRow[];
  /** Required fields the mapping did not cover, by label. */
  unmappedFields: string[];
}

/**
 * Parses a sheet against a mapping into typed rows, splitting them into
 * acceptable and rejected with a reason for every rejection.
 *
 * Nothing is written. This is the "show the user exactly what will be imported"
 * step, and its output is what the manager approves. A row with a blocking
 * problem is never partially applied: the row is kept whole or dropped whole, so
 * a half-built record cannot reach the register.
 */
export function buildRows(
  sheet: WorkbookSheet,
  fields: FieldSpec[],
  mapping: ColumnMapping,
  options: CoerceOptions = {}
): ParsedRows {
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

      const parsed = coerceCell(raw, field, options);
      // A string is a valid result for the kinds whose value IS text: prose
      // fields, categories, enum labels and normalised dates. For the numeric
      // kinds it can only mean the cell could not be read, because
      // coerceCell returns a number or an error for those.
      const returnsText =
        field.kind === "text" || field.kind === "category" || field.kind === "enum" || field.kind === "date";
      if (typeof parsed === "string" && !returnsText) {
        issues.push({
          rowNumber: i + 2,
          field: field.label,
          message: `"${String(raw).trim()}" is not a valid ${field.kind}`,
        });
        continue;
      }
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        issues.push({ rowNumber: i + 2, field: field.label, message: (parsed as { error: string }).error });
        continue;
      }
      values[field.key] = parsed;
    }

    rows.push({ rowNumber: i + 2, values, issues });
  });

  const acceptable = rows.filter((r) => r.issues.length === 0);
  const rejected = rows.filter((r) => r.issues.length > 0);
  const unmappedFields = fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);

  return { rows, acceptable, rejected, unmappedFields };
}
