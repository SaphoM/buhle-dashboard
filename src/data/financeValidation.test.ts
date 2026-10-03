import { describe, expect, it } from "vitest";
import { validateFinanceReport } from "./financeValidation";
import { DEFAULT_FINANCE_CONFIG, createBlankFinanceReport } from "./financeSeed";
import type { FinanceReport } from "../types/finance";
import type { ReportingFrequency } from "../types";

/**
 * Validation is the gate that stops a confidently wrong financial position from
 * reaching a KPI (Sections 25, 35 step 1). These tests pin the rules that would
 * otherwise let a bad submission look like a good one.
 */

const CONFIG = DEFAULT_FINANCE_CONFIG;

function report(): FinanceReport {
  return createBlankFinanceReport({
    cycleId: "cyc-finance-test",
    reportingPeriod: "September 2026",
    frequency: "Monthly" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-10-05",
    config: CONFIG,
  });
}

function options() {
  return {
    revenueCategoryIds: CONFIG.revenueCategories.map((c) => c.id),
    expenseCategories: CONFIG.expenseCategories,
    today: new Date("2026-10-03"),
  };
}

/** The smallest report that passes validation, used as the base for the
 *  single-defect tests below. */
function validReport(): FinanceReport {
  const base = report();
  return {
    ...base,
    revenue: {
      ...base.revenue,
      lines: [
        {
          id: "r1",
          categoryId: "training",
          description: "Short courses",
          counterparty: "",
          costCentre: "Delmas",
          project: "",
          programme: "",
          budget: 400000,
          actual: 450000,
          previousPeriod: 380000,
          ytdBudget: null,
          ytdActual: null,
          isTransfer: false,
          notes: "",
        },
      ],
    },
    cashFlow: {
      ...base.cashFlow,
      openingBankBalance: 2000000,
      inflows: { ...base.cashFlow.inflows, "Revenue received": { amount: 400000, previousPeriod: null } },
      outflows: { ...base.cashFlow.outflows, Payroll: { amount: 300000, previousPeriod: null } },
    },
    budgets: {
      ...base.budgets,
      lines: [
        {
          id: "b1",
          budgetId: "B-01",
          budgetLine: "Marketing",
          category: "",
          department: "",
          costCentre: "",
          project: "",
          funder: "",
          approvedBudget: 100000,
          revisedBudget: null,
          actualExpenditure: 60000,
          committedExpenditure: 0,
          forecastExpenditure: null,
          status: "Approved",
          notes: "",
        },
      ],
    },
    debtors: {
      ...base.debtors,
      records: [
        {
          id: "d1",
          customer: "Acme",
          invoiceNumber: "INV-1",
          invoiceDate: "2026-08-01",
          dueDate: "2026-09-01",
          description: "",
          department: "",
          project: "",
          invoiceAmount: 50000,
          amountReceived: 0,
          previousPeriodOutstanding: null,
          responsibleOwner: "",
          followUpDate: "",
          notes: "",
        },
      ],
    },
    creditors: {
      ...base.creditors,
      records: [
        {
          id: "c1",
          supplier: "Supplier A",
          invoiceNumber: "BILL-1",
          invoiceDate: "2026-08-01",
          dueDate: "2026-09-01",
          department: "",
          costCentre: "",
          project: "",
          invoiceAmount: 30000,
          amountPaid: 0,
          previousPeriodOutstanding: null,
          paymentDate: "",
          responsibleOwner: "",
          notes: "",
        },
      ],
    },
    profitability: {
      ...base.profitability,
      expenses: [
        {
          id: "e1",
          categoryId: "Operating expenses",
          description: "Supplies",
          costCentre: "",
          department: "",
          project: "",
          budget: 200000,
          actual: 250000,
          previousPeriod: null,
          isTransfer: false,
          notes: "",
        },
      ],
    },
  };
}

describe("validateFinanceReport", () => {
  it("accepts a complete report", () => {
    const result = validateFinanceReport(validReport(), options());
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("refuses an empty report rather than recording a nil position", () => {
    const result = validateFinanceReport(report(), options());
    expect(result.valid).toBe(false);
    // Every section explains what it needs, and marks itself incomplete.
    expect(result.issues.map((i) => i.section)).toEqual(
      expect.arrayContaining(["revenue", "cashFlow", "budgets", "debtors", "creditors", "profitability"])
    );
    expect(result.bySection.revenue.state).toBe("incomplete");
  });

  it("accepts a section marked Not Applicable as satisfied, not skipped", () => {
    const withNa = { ...validReport(), debtors: { ...validReport().debtors, records: [], notApplicable: true } };
    const result = validateFinanceReport(withNa, options());
    expect(result.valid).toBe(true);
    expect(result.bySection.debtors.state).toBe("not_applicable");
  });

  it("blocks a closing balance that contradicts the derived cash position", () => {
    const base = validReport();
    const result = validateFinanceReport(
      {
        ...base,
        // Opening 2,000,000 + 400,000 - 300,000 = 2,100,000. The workbook says
        // 2,500,000. One of them is wrong and the application will not guess.
        cashFlow: { ...base.cashFlow, closingCashEntered: 2500000 },
      },
      options()
    );

    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.field.includes("Closing"));
    expect(issue?.kind).toBe("inconsistent");
    expect(result.bySection.cashFlow.state).toBe("incomplete");
  });

  it("rejects a revenue category that is no longer approved", () => {
    const base = validReport();
    const result = validateFinanceReport(
      { ...base, revenue: { ...base.revenue, lines: [{ ...base.revenue.lines[0], categoryId: "retired" }] } },
      options()
    );
    expect(result.issues.some((i) => i.field.includes("Revenue category"))).toBe(true);
  });

  it("rejects duplicate debtor invoices", () => {
    const base = validReport();
    const result = validateFinanceReport(
      { ...base, debtors: { ...base.debtors, records: [base.debtors.records[0], { ...base.debtors.records[0], id: "d2" }] } },
      options()
    );
    expect(result.issues.some((i) => i.message.includes("Duplicate invoice"))).toBe(true);
  });

  it("rejects receipts that exceed the invoice they settle", () => {
    const base = validReport();
    const result = validateFinanceReport(
      {
        ...base,
        debtors: {
          ...base.debtors,
          records: [{ ...base.debtors.records[0], invoiceAmount: 50000, amountReceived: 60000 }],
        },
      },
      options()
    );
    expect(result.issues.some((i) => i.field.includes("Amount received"))).toBe(true);
  });

  it("rejects a half-supplied forecast", () => {
    const base = validReport();
    const result = validateFinanceReport(
      { ...base, cashFlow: { ...base.cashFlow, forecastInflows: 500000 } },
      options()
    );
    expect(result.issues.some((i) => i.field === "Cash forecast")).toBe(true);
  });

  it("accepts a forecast when both halves are supplied", () => {
    const base = validReport();
    const result = validateFinanceReport(
      { ...base, cashFlow: { ...base.cashFlow, forecastInflows: 500000, forecastOutflows: 450000 } },
      options()
    );
    expect(result.valid).toBe(true);
  });

  it("flags a units error on revenue without blocking a genuine overrun", () => {
    const base = validReport();

    const modest = validateFinanceReport(base, options());
    expect(modest.valid).toBe(true);

    const wild = validateFinanceReport(
      {
        ...base,
        revenue: { ...base.revenue, lines: [{ ...base.revenue.lines[0], budget: 400000, actual: 9000000 }] },
      },
      options()
    );
    expect(wild.issues.some((i) => i.message.includes("units error"))).toBe(true);
  });

  it("requires a category on every expense line", () => {
    const base = validReport();
    const result = validateFinanceReport(
      { ...base, profitability: { ...base.profitability, expenses: [{ ...base.profitability.expenses[0], categoryId: "" }] } },
      options()
    );
    expect(result.issues.some((i) => i.field.includes("Expense category"))).toBe(true);
  });
});