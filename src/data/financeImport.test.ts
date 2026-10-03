import { describe, expect, it } from "vitest";
import {
  BUDGET_FIELDS,
  DEBTOR_FIELDS,
  EXPENSE_FIELDS,
  REVENUE_FIELDS,
  applyImport,
  buildPreview,
  parseDate,
  parseNumeric,
  recordImportFailure,
  suggestMapping,
  type WorkbookSheet,
} from "./financeImport";
import { createBlankFinanceReport } from "./financeSeed";
import type { ReportingFrequency } from "../types";
import { DEFAULT_FINANCE_CONFIG } from "./financeSeed";

/**
 * Import tests (Section 26).
 *
 * The three properties that matter are all enforced here: nothing is applied
 * without a preview, existing figures are never overwritten silently, and a cell
 * that could not be read is left blank rather than invented.
 */

const CONFIG = DEFAULT_FINANCE_CONFIG;

function report() {
  return createBlankFinanceReport({
    cycleId: "cyc-finance-import",
    reportingPeriod: "September 2026",
    frequency: "Monthly" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-10-05",
    config: CONFIG,
  });
}

function sheet(headers: string[], rows: unknown[][], name = "Revenue"): WorkbookSheet {
  return { name, headers, rows: [headers, ...rows], dataRows: rows, populatedCells: rows.length * 2 };
}

describe("parseNumeric (Section 26)", () => {
  it("reads the number formats a finance workbook actually contains", () => {
    expect(parseNumeric("1234")).toBe(1234);
    expect(parseNumeric("1,234.56")).toBe(1234.56);
    expect(parseNumeric("R 1 234,56")).toBe(1234.56);
    expect(parseNumeric("(1,234.56)")).toBe(-1234.56);
    expect(parseNumeric("-1 234")).toBe(-1234);
  });

  it("returns null rather than zero for a cell it cannot read", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("n/a")).toBeNull();
  });
});

describe("parseDate (Section 26)", () => {
  it("normalises the common date formats to ISO", () => {
    expect(parseDate("2026-09-01")).toBe("2026-09-01");
    expect(parseDate("01/09/2026")).toBe("2026-09-01");
    expect(parseDate("1 Sep 2026")).toBe("2026-09-01");
  });

  it("returns null for anything unreadable rather than guessing", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("suggestMapping (Section 26)", () => {
  it("suggests a mapping from the header aliases Finance uses", () => {
    const { mapping } = suggestMapping(["Description", "Actual Amount", "Budget"], REVENUE_FIELDS);
    expect(mapping.actual).toBe("Actual Amount");
    expect(mapping.budget).toBe("Budget");
    expect(mapping.description).toBe("Description");
  });

  it("reports a header claimed by two fields instead of choosing silently", () => {
    const { conflicts } = suggestMapping(["Amount"], [
      { key: "actual", label: "Actual", kind: "currency", aliases: ["amount"] },
      { key: "budget", label: "Budget", kind: "currency", aliases: ["amount"] },
    ]);
    expect(conflicts[0].header).toBe("Amount");
    expect(conflicts[0].claimedBy).toEqual(["Actual", "Budget"]);
  });
});

describe("buildPreview (Sections 26, 33)", () => {
  const source = sheet(
    ["Description", "Actual Amount", "Budget", "Revenue Category"],
    [
      ["Short courses", "450000", "400000", "Training income"],
      ["Grant admin fee", "15000", "", "Training income"],
      ["Farming", "", "40000", "Commercial farming income"],
      ["Broken row", "not a number", "1000", "Training income"],
    ]
  );

  const fullMapping = {
    description: "Description",
    actual: "Actual Amount",
    budget: "Budget",
    categoryId: "Revenue Category",
  };

  it("separates acceptable rows from rows that will be skipped, with reasons", () => {
    const preview = buildPreview(source, "revenue", fullMapping);

    expect(preview.acceptable.map((r) => r.values.description)).toEqual(["Short courses", "Grant admin fee"]);
    // Row numbers are the workbook's own, so an operator can find the row.
    expect(preview.rejected.map((r) => r.rowNumber)).toEqual([4, 5]);
  });

  it("says why each rejected row was dropped rather than dropping it silently", () => {
    const preview = buildPreview(source, "revenue", fullMapping);

    expect(preview.rejected[0].issues[0]).toMatchObject({ field: "Actual", message: "Actual is required" });
    expect(preview.rejected[1].issues[0].field).toMatch(/actual/i);
  });

  it("accepts a blank budget: a revenue line with no budget is still income", () => {
    const preview = buildPreview(source, "revenue", fullMapping);

    expect(preview.acceptable[1].values.budget).toBeUndefined();
    expect(preview.rejected.map((r) => r.rowNumber)).toEqual([4, 5]);
  });

  it("still imports the rows it can read when the optional Budget column is unmapped", () => {
    const preview = buildPreview(source, "revenue", {
      description: "Description",
      actual: "Actual Amount",
      categoryId: "Revenue Category",
    });

    expect(preview.acceptable).toHaveLength(2);
    expect(preview.unmappedFields).toEqual([]);
  });

  it("refuses every row when a required field has no column mapped", () => {
    // The wizard disables Apply when nothing is acceptable, so an incomplete
    // mapping cannot half-fill the section.
    const preview = buildPreview(source, "revenue", { description: "Description", actual: "Actual Amount" });

    expect(preview.unmappedFields).toEqual(["Revenue category"]);
    expect(preview.acceptable).toHaveLength(0);
    expect(preview.rejected.every((r) => r.issues.some((i) => i.message.includes("not mapped")))).toBe(true);
  });
});

describe("the fields a Budget Monitor export can populate (Sections 12, 15, 18, 21)", () => {
  it("maps the financial year and period the workbook states, and the budget status", () => {
    const source = sheet(
      ["Budget ID", "Budget line", "Financial Year", "Period", "Approved", "Actual", "Status"],
      [["B-01", "Marketing", "2026/27", "September 2026", "100000", "60000", "Approved"]],
      "Budgets"
    );
    const preview = buildPreview(source, "budgets", {
      budgetId: "Budget ID",
      budgetLine: "Budget line",
      financialYear: "Financial Year",
      period: "Period",
      approvedBudget: "Approved",
      actualExpenditure: "Actual",
      status: "Status",
    });

    expect(preview.rejected).toHaveLength(0);
    expect(preview.acceptable[0].values).toMatchObject({
      financialYear: "2026/27",
      period: "September 2026",
      status: "Approved",
    });
  });

  it("suggests the new columns from the header names a workbook would use", () => {
    const { mapping } = suggestMapping(["Budget ID", "Budget line", "FY", "Month", "Actual", "Status"], BUDGET_FIELDS);
    expect(mapping.financialYear).toBe("FY");
    expect(mapping.period).toBe("Month");
    expect(mapping.status).toBe("Status");
  });

  it("carries an invoice status from a debtor sheet", () => {
    const source = sheet(
      ["Customer", "Invoice", "Due Date", "Amount", "Status"],
      [["Acme", "INV-1", "2026-09-30", "50000", "Partially Paid"]],
      "Debtors"
    );
    const preview = buildPreview(source, "debtors", {
      customer: "Customer",
      invoiceNumber: "Invoice",
      dueDate: "Due Date",
      invoiceAmount: "Amount",
      status: "Status",
    });

    expect(preview.rejected).toHaveLength(0);
    expect(preview.acceptable[0].values.status).toBe("Partially Paid");
  });

  it("rejects a status it cannot interpret instead of storing the cell verbatim", () => {
    // "Pmts Rcvd" is not a status. Storing it would put a value in the record
    // that looks like a status to a reader and means nothing to the ageing logic.
    const source = sheet(
      ["Customer", "Invoice", "Due Date", "Amount", "Status"],
      [["Acme", "INV-1", "2026-09-30", "50000", "Pmts Rcvd"]],
      "Debtors"
    );
    const preview = buildPreview(source, "debtors", {
      customer: "Customer",
      invoiceNumber: "Invoice",
      dueDate: "Due Date",
      invoiceAmount: "Amount",
      status: "Status",
    });

    expect(preview.acceptable).toHaveLength(0);
    expect(preview.rejected[0].issues[0].message).toContain("not one of");
  });

  it("imports a readable date column and rejects an unreadable one", () => {
    // The two halves of one rule: a date that parses must survive, and a date
    // that does not must be reported rather than landing in the record as an
    // empty due date.
    const headers = ["Customer", "Invoice", "Due Date", "Amount"];
    const source = sheet(headers, [["Acme", "INV-1", "30/09/2026", "50000"], ["Globex", "INV-2", "sometime soon", "20000"]]);
    const mapping = { customer: "Customer", invoiceNumber: "Invoice", dueDate: "Due Date", invoiceAmount: "Amount" };

    const preview = buildPreview(source, "debtors", mapping);

    expect(preview.acceptable).toHaveLength(1);
    expect(preview.acceptable[0].values.dueDate).toBe("2026-09-30");
    expect(preview.rejected[0].issues[0].message).toContain("not a readable date");
  });

  it("carries a direct/indirect cost classification from a workbook", () => {
    const source = sheet(
      ["Description", "Category", "Actual", "Cost type"],
      [["Facilitator fees", "Operating expenses", "180000", "Direct"]],
      "Expenses"
    );
    const preview = buildPreview(source, "profitability", {
      description: "Description",
      categoryId: "Category",
      actual: "Actual",
      costType: "Cost type",
    });

    expect(preview.rejected).toHaveLength(0);
    expect(preview.acceptable[0].values.costType).toBe("Direct");
    expect(suggestMapping(["Description", "Category", "Actual", "Cost type"], EXPENSE_FIELDS).mapping.costType).toBe(
      "Cost type"
    );
    expect(suggestMapping(["Customer", "Status"], DEBTOR_FIELDS).mapping.status).toBe("Status");
  });
});

describe("applyImport (Section 26)", () => {
  const source = sheet(
    ["Description", "Actual Amount", "Revenue Category"],
    [["Short courses", "450000", "Training income"]]
  );
  const mapping = { description: "Description", actual: "Actual Amount", categoryId: "Revenue Category" };

  it("writes nothing until it is applied, and records the run when it is", () => {
    const preview = buildPreview(source, "revenue", mapping);
    const before = report();
    expect(before.revenue.lines).toHaveLength(0);

    const result = applyImport(before, preview, { fileName: "Budget Monitor.xlsx", actor: "Test", mode: "replace" });

    expect(result.report.revenue.lines).toHaveLength(1);
    expect(result.report.revenue.lines[0].actual).toBe(450000);
    expect(result.accepted).toBe(1);
    // The submission now says where its figures came from (Section 27).
    expect(result.report.dataSource.kind).toBe("Workbook Import");
    expect(result.run.status).toBe("Imported");
    expect(result.run.fileName).toBe("Budget Monitor.xlsx");
    expect(result.run.mapping.actual).toBe("Actual Amount");
  });

  it("never overwrites existing rows unless replace mode was chosen", () => {
    const preview = buildPreview(source, "revenue", mapping);
    const existing = report();
    existing.revenue.lines = [
      { ...existing.revenue.lines[0], id: "keep-me", description: "Typed by hand", actual: 1000 },
    ];

    const appended = applyImport(existing, preview, { fileName: "b.xlsx", actor: "Test", mode: "append" });
    expect(appended.replacedSections).toEqual([]);
    expect(appended.report.revenue.lines).toHaveLength(2);

    const replaced = applyImport(existing, preview, { fileName: "b.xlsx", actor: "Test", mode: "replace" });
    expect(replaced.replacedSections).toEqual(["revenue"]);
    expect(replaced.report.revenue.lines).toHaveLength(1);
    expect(replaced.report.revenue.lines[0].description).toBe("Short courses");
  });
});

describe("recordImportFailure (Section 33)", () => {
  it("records the failure so the section cannot read as merely unfilled", () => {
    const failed = recordImportFailure(report(), "File is password protected", "Budget Monitor.xlsx", "debtors");

    expect(failed.dataSource.failureReason).toBe("File is password protected");
    expect(failed.dataSource.failedAt).toBeTruthy();
    expect(failed.importRuns[0].status).toBe("Failed");
    // The run records which section was being filled, so the failure is
    // attributable rather than a general warning.
    expect(failed.importRuns[0].target).toBe("debtors");
    expect(failed.importRuns[0].notes).toBe("File is password protected");
  });
});