import { describe, expect, it } from "vitest";
import { calculateProfitability, calculateRevenue, calculateBudgets, calculateDebtors } from "./financeEngine";
import { DEFAULT_AGEING_BUCKETS } from "../types/finance";
import type {
  ExpenseLine,
  FinanceBudgetData,
  FinanceDebtorsData,
  FinanceRevenueData,
  RevenueLine,
} from "../types/finance";

/**
 * Unit coverage for the Finance arithmetic.
 *
 * These rules are the ones the whole application depends on: Finance is the
 * authoritative source for the Executive financial KPIs (Finance spec Section 39),
 * so a mistake here does not stay inside the Finance dashboard - it becomes the
 * organisation's reported financial position. Each test pins one rule from the
 * specification rather than exercising the formulas incidentally.
 */

function revenueLine(patch: Partial<RevenueLine> = {}): RevenueLine {
  return {
    id: `rev-${Math.random().toString(36).slice(2, 8)}`,
    categoryId: "training",
    description: "Test line",
    counterparty: "",
    costCentre: "",
    project: "",
    programme: "",
    budget: null,
    actual: null,
    previousPeriod: null,
    ytdBudget: null,
    ytdActual: null,
    isTransfer: false,
    notes: "",
    ...patch,
  };
}

function revenue(lines: RevenueLine[]): FinanceRevenueData {
  return { lines, commentary: "", notApplicable: false };
}

function expense(patch: Partial<ExpenseLine> = {}): ExpenseLine {
  return {
    id: `exp-${Math.random().toString(36).slice(2, 8)}`,
    categoryId: "Operating expenses",
    description: "Test expense",
    costCentre: "",
    department: "",
    project: "",
    budget: null,
    actual: null,
    previousPeriod: null,
    isTransfer: false,
    notes: "",
    ...patch,
  };
}

const CATEGORIES = [
  { id: "training", kind: "operating" },
  { id: "donor", kind: "donor" },
  { id: "farming", kind: "farming" },
];

describe("calculateRevenue (Sections 6, 7)", () => {
  it("derives variance, achievement and growth rather than accepting them", () => {
    const summary = calculateRevenue(
      revenue([
        revenueLine({ budget: 100000, actual: 120000, previousPeriod: 90000, ytdBudget: 900000, ytdActual: 1000000 }),
      ]),
      CATEGORIES
    );

    expect(summary).not.toBeNull();
    expect(summary!.currentPeriodRevenue).toBe(120000);
    expect(summary!.budget).toBe(100000);
    expect(summary!.variance).toBe(20000);
    expect(summary!.achievementPct).toBe(120);
    expect(summary!.ytdActual).toBe(1000000);
    expect(summary!.growthPct).toBe(33.3);
  });

  it("keeps donor and farming income separate for the Executive roll-up (Section 30)", () => {
    const summary = calculateRevenue(
      revenue([
        revenueLine({ categoryId: "training", actual: 100000 }),
        revenueLine({ categoryId: "donor", actual: 250000 }),
        revenueLine({ categoryId: "farming", actual: 40000 }),
      ]),
      CATEGORIES
    );

    expect(summary!.currentPeriodRevenue).toBe(390000);
    expect(summary!.donorFunding).toBe(250000);
    expect(summary!.farmingRevenue).toBe(40000);
  });

  it("excludes internal transfers from external revenue but keeps them visible", () => {
    const summary = calculateRevenue(
      revenue([
        revenueLine({ categoryId: "training", actual: 100000 }),
        revenueLine({ categoryId: "donor", actual: 60000, isTransfer: true }),
      ]),
      CATEGORIES
    );

    expect(summary!.currentPeriodRevenue).toBe(100000);
    expect(summary!.transferAmount).toBe(60000);
  });

  it("reports nothing at all rather than a nil return when there is no data", () => {
    expect(calculateRevenue(revenue([]), CATEGORIES)).toBeNull();
    // A line exists but carries no figures. The summary is still returned so the
    // section can say "one line, nothing captured" rather than "no data", but not
    // one figure in it is derivable - so no KPI can be produced from it.
    const empty = calculateRevenue(revenue([revenueLine()]), CATEGORIES)!;
    expect(empty.lineCount).toBe(1);
    expect(empty.currentPeriodRevenue).toBeNull();
    expect(empty.variance).toBeNull();
    expect(empty.achievementPct).toBeNull();
  });
});

describe("calculateProfitability (Section 21)", () => {
  it("computes the core-operations surplus with transfers excluded", () => {
    const summary = calculateProfitability(
      revenue([
        revenueLine({ categoryId: "training", actual: 500000 }),
        revenueLine({ categoryId: "donor", actual: 100000, isTransfer: true }),
      ]),
      {
        expenses: [
          expense({ actual: 200000 }),
          expense({ categoryId: "Payroll", actual: 150000, isTransfer: true }),
        ],
        commentary: "",
        notApplicable: false,
      }
    );

    // Transfers on BOTH sides are excluded, so the surplus is external revenue
    // less external spend: 500000 - 200000.
    expect(summary!.revenue).toBe(500000);
    expect(summary!.operatingExpenses).toBe(200000);
    expect(summary!.operatingSurplus).toBe(300000);
    expect(summary!.operatingMarginPct).toBe(60);
    expect(summary!.transfers).toBe(250000);
    expect(summary!.complete).toBe(true);
  });

  it("refuses to present half a result as a surplus (Section 22)", () => {
    const summary = calculateProfitability(revenue([revenueLine({ actual: 500000 })]), {
      expenses: [],
      commentary: "",
      notApplicable: false,
    });

    expect(summary!.operatingSurplus).toBeNull();
    expect(summary!.complete).toBe(false);
  });

  it("leaves the margin undefined when there is no revenue to divide by", () => {
    const summary = calculateProfitability(revenue([]), {
      expenses: [expense({ actual: 10000 })],
      commentary: "",
      notApplicable: false,
    });

    expect(summary!.operatingSurplus).toBeNull();
    expect(summary!.operatingMarginPct).toBeNull();
  });
});

describe("calculateBudgets (Sections 12, 13)", () => {
  const base: FinanceBudgetData = {
    committedCountsAgainstBudget: true,
    commentary: "",
    notApplicable: false,
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
        committedExpenditure: 20000,
        forecastExpenditure: null,
        status: "Approved",
        notes: "",
      },
      {
        id: "b2",
        budgetId: "B-02",
        budgetLine: "Fleet",
        category: "",
        department: "",
        costCentre: "",
        project: "",
        funder: "",
        approvedBudget: 50000,
        revisedBudget: null,
        actualExpenditure: 40000,
        committedExpenditure: 0,
        forecastExpenditure: null,
        status: "Approved",
        notes: "",
      },
    ],
  };

  it("applies Section 13's arithmetic: remaining = budget - actual - committed", () => {
    const summary = calculateBudgets(base)!;
    expect(summary.lines[0].remaining).toBe(20000);
    expect(summary.lines[0].utilisationPct).toBe(60);
    expect(summary.lines[0].variance).toBe(40000);
    expect(summary.totalRemaining).toBe(30000);
  });

  it("reports the TIGHTEST remaining line, not the portfolio total (Section 11)", () => {
    const summary = calculateBudgets(base)!;
    // Portfolio remaining is 30000, but the line with least left is Fleet at
    // 10000. A warning pointed at the total would miss the real problem.
    expect(summary.lowestRemaining?.budgetId).toBe("B-02");
    expect(summary.lowestRemaining?.remaining).toBe(10000);
  });

  it("honours the committed-spend convention Finance has configured", () => {
    const summary = calculateBudgets({ ...base, committedCountsAgainstBudget: false })!;
    // Committed is still reported, but not deducted - some finance systems treat
    // committed spend as still available.
    expect(summary.lines[0].committed).toBe(20000);
    expect(summary.lines[0].remaining).toBe(40000);
  });

  it("prefers a revised budget over the approved one", () => {
    const summary = calculateBudgets({
      ...base,
      lines: [{ ...base.lines[0], revisedBudget: 80000 }],
    })!;
    expect(summary.lines[0].budget).toBe(80000);
    expect(summary.lines[0].remaining).toBe(0);
    expect(summary.linesAtLimit.map((l) => l.budgetId)).toContain("B-01");
  });

  it("flags overspent lines even when the portfolio looks healthy", () => {
    const summary = calculateBudgets({
      ...base,
      lines: [{ ...base.lines[0], actualExpenditure: 150000 }, base.lines[1]],
    })!;
    expect(summary.overspentLines.map((l) => l.budgetId)).toEqual(["B-01"]);
  });
});

describe("calculateDebtors (Sections 15-17)", () => {
  const data: FinanceDebtorsData = {
    commentary: "",
    notApplicable: false,
    records: [
      {
        id: "d1",
        customer: "Acme",
        invoiceNumber: "INV-1",
        invoiceDate: "2026-01-01",
        dueDate: "2026-02-01",
        description: "",
        department: "",
        project: "",
        invoiceAmount: 50000,
        amountReceived: 10000,
        previousPeriodOutstanding: 50000,
        responsibleOwner: "",
        followUpDate: "",
        notes: "",
      },
      {
        id: "d2",
        customer: "Globex",
        invoiceNumber: "INV-2",
        invoiceDate: "2026-01-01",
        dueDate: "2026-06-01",
        description: "",
        department: "",
        project: "",
        invoiceAmount: 30000,
        amountReceived: 0,
        previousPeriodOutstanding: 10000,
        responsibleOwner: "",
        followUpDate: "",
        notes: "",
      },
    ],
  };

  // The reference date is pinned rather than left to the clock: ageing must be
  // testable, and a test that moves buckets as the suite ages would start failing
  // for no reason. As at 3 Oct 2026, INV-1 is 244 days overdue (deepest bucket)
  // and INV-2 is 124 days overdue.
  const TODAY = new Date("2026-10-03");
  const summary = calculateDebtors(data, DEFAULT_AGEING_BUCKETS, TODAY)!;

  it("derives outstanding and days overdue from invoice, receipts and due date", () => {
    expect(summary.totalOutstanding).toBe(70000);
    expect(summary.totalOverdue).toBe(70000);
    expect(summary.countByBucket["120+ days"]).toBe(2);
  });

  it("separates the severe 90-day-and-beyond bucket (Section 17)", () => {
    expect(summary.severeBucketLabel).toBe("90 days");
    expect(summary.severeOverdue).toBe(70000);
    // The severe bucket is the 90-day line even though both invoices have aged
    // into the deepest one, so a policy change to the buckets moves the warning.
    expect(summary.byBucket["90 days"]).toBe(0);
    expect(summary.byBucket["120+ days"]).toBe(70000);
  });

  it("puts only the deeply aged invoice in the severe bucket", () => {
    // One invoice 45 days overdue, one 200 - as at the pinned reference date.
    const mixed = calculateDebtors(
      {
        ...data,
        records: [
          { ...data.records[0], dueDate: "2026-08-19", invoiceAmount: 10000, amountReceived: 0 },
          { ...data.records[1], dueDate: "2026-03-17", invoiceAmount: 20000, amountReceived: 0 },
        ],
      },
      DEFAULT_AGEING_BUCKETS,
      TODAY
    )!;

    expect(mixed.byBucket["30 days"]).toBe(10000);
    expect(mixed.byBucket["120+ days"]).toBe(20000);
    // Section 17's warning is stated against 90+ days, so only the older
    // invoice counts toward it.
    expect(mixed.severeOverdue).toBe(20000);
  });

  it("computes the collection rate from receipts against invoiced value", () => {
    // 10000 received against 80000 invoiced.
    expect(summary.collectionRatePct).toBe(12.5);
  });

  it("names the largest overdue account and the accounts that grew", () => {
    expect(summary.largestOverdueAccount?.label).toBe("Acme");
    expect(summary.largestOverdueAccount?.amount).toBe(40000);
    expect(summary.increasingBalance.map((a) => a.label)).toEqual(["Globex"]);
  });

  it("reports no data rather than zero when no invoice amounts were captured", () => {
    const empty = calculateDebtors(
      {
        ...data,
        records: [{ ...data.records[0], invoiceAmount: null, amountReceived: null }],
      },
      DEFAULT_AGEING_BUCKETS,
      TODAY
    )!;
    expect(empty.totalOutstanding).toBeNull();
  });
});