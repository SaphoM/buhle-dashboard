import type { Kpi } from "../types";
import { getStatusForValue } from "./kpiEngine";
import {
  CASH_INFLOW_TYPES,
  CASH_OUTFLOW_TYPES,
  DEFAULT_AGEING_BUCKETS,
  type AgeingBucket,
  type FinanceBudgetData,
  type FinanceCashFlowData,
  type FinanceCommentary,
  type FinanceCreditorsData,
  type FinanceDebtorsData,
  type FinanceProfitabilityData,
  type FinanceReport,
  type FinanceRevenueData,
} from "../types/finance";

/**
 * ============================================================================
 * FINANCE KPI ENGINE - the single authoritative source of every financial
 * figure in the application.
 * ============================================================================
 *
 * Sections 7, 13, 16, 19 and 21 all say the same thing in different words:
 * Finance must not be asked to calculate. Achievement percentages, variances,
 * ageing buckets, utilisation and margins are all DERIVED here from the
 * underlying records, and this module is the only place those formulas exist.
 * No component recalculates them - the UI reads what this returns.
 *
 * Every function returns `number | null`, and `null` always means "cannot be
 * derived from what was submitted". That is a genuinely different outcome from
 * zero: a cash balance of R0 is a crisis, and an absent cash figure is a data
 * gap, and the dashboard must be able to tell them apart (Section 33).
 */

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Sum of a set of nullable amounts. Nulls contribute zero, but the function
 *  reports null when not a single amount was supplied - "nothing captured" and
 *  "captured as zero" must not collapse into the same number. */
function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Section 6 & 7 - Revenue
// ---------------------------------------------------------------------------

export interface RevenueSummary {
  currentPeriodRevenue: number | null;
  /** Donor/funder income only - rolls up to Executive Donor Funding (Section 30). */
  donorFunding: number | null;
  /** Commercial farming income - reported separately because Commercial Farming
   *  records the activity while Finance remains authoritative for the money
   *  (Section 39). */
  farmingRevenue: number | null;
  budget: number | null;
  previousPeriod: number | null;
  ytdBudget: number | null;
  ytdActual: number | null;
  /** Actual - budget. Negative means revenue came in below budget. */
  variance: number | null;
  /** Achievement = actual / budget x 100. */
  achievementPct: number | null;
  /** Year-on-year style growth against the previous period, where a previous
   *  figure exists (Section 7: "Revenue Growth / Decline where historical data
   *  exists"). */
  growthPct: number | null;
  /** Lines flagged as internal transfers - excluded from core operations
   *  surplus but still part of cash (Section 21). */
  transferAmount: number | null;
  /** Count of revenue lines present, so the UI can distinguish "one small line"
   *  from "no revenue captured at all". */
  lineCount: number;
}

/**
 * Section 7: current period revenue, YTD revenue, revenue against budget,
 * variance, achievement and growth - all calculated, none of them typed.
 *
 * Budget is taken from the lines' own budget column. Where a line carries
 * actuals but no budget the budget sum is still returned, because a partial
 * budget figure is meaningful context; the section's completeness is decided by
 * validation, not here.
 */
export function calculateRevenue(
  data: FinanceRevenueData,
  categories: { id: string; kind: string }[]
): RevenueSummary | null {
  if (data.notApplicable || data.lines.length === 0) return null;

  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const operating = data.lines.filter((l) => !l.isTransfer);
  if (operating.length === 0 && data.lines.every((l) => l.actual === null)) return null;

  const currentPeriodRevenue = sumOrNull(operating.map((l) => l.actual));
  const budget = sumOrNull(operating.map((l) => l.budget));
  const previousPeriod = sumOrNull(operating.map((l) => l.previousPeriod));
  const ytdBudget = sumOrNull(operating.map((l) => l.ytdBudget));
  const ytdActual = sumOrNull(operating.map((l) => l.ytdActual));
  const transferAmount = sumOrNull(data.lines.filter((l) => l.isTransfer).map((l) => l.actual));

  const byKind = (kind: string) =>
    sumOrNull(operating.filter((l) => kindOf.get(l.categoryId) === kind).map((l) => l.actual));

  return {
    currentPeriodRevenue,
    donorFunding: byKind("donor"),
    farmingRevenue: byKind("farming"),
    budget,
    previousPeriod,
    ytdBudget,
    ytdActual,
    variance:
      currentPeriodRevenue !== null && budget !== null ? currentPeriodRevenue - budget : null,
    achievementPct:
      currentPeriodRevenue !== null && budget !== null && budget !== 0
        ? round((currentPeriodRevenue / budget) * 100, 1)
        : null,
    growthPct:
      currentPeriodRevenue !== null && previousPeriod !== null && previousPeriod !== 0
        ? round(((currentPeriodRevenue - previousPeriod) / previousPeriod) * 100, 1)
        : null,
    transferAmount,
    lineCount: operating.length,
  };
}

// ---------------------------------------------------------------------------
// Section 9 & 10 - Cash Flow
// ---------------------------------------------------------------------------

export interface CashFlowSummary {
  openingCash: number | null;
  totalInflows: number | null;
  totalOutflows: number | null;
  /** Inflows - outflows. Negative means the period consumed cash. */
  netMovement: number | null;
  /** Opening + net movement. This is the authoritative closing cash figure
   *  when it can be derived; the entered closing balance is cross-checked
   *  against it in validation rather than replacing it. */
  closingCash: number | null;
  previousPeriodClosingCash: number | null;

  // Forecast (Section 10) - null unless Finance supplied approved figures.
  forecastAvailable: boolean;
  forecastClosingCash: number | null;
  forecastShortfall: boolean;
}

/**
 * Cash is the one section where the arithmetic is fully determined by the
 * inputs, so the engine derives closing cash rather than accepting a typed
 * figure (Section 9: "Calculate: Total Cash Inflows, Total Cash Outflows, Net
 * Cash Movement, Closing Cash Balance").
 *
 * Section 10's forecast is strictly opt-in: with no forecast inputs the
 * `forecastAvailable` flag is false and the UI says "Forecast data not
 * available" instead of projecting a number nobody approved.
 */
export function calculateCashFlow(
  data: FinanceCashFlowData,
  /** The bank balance carried in from the prior period, so the movement can be
   *  compared period to period. Null when Finance has not supplied one. */
  previousPeriodClosingCash: number | null = null
): CashFlowSummary | null {
  if (data.notApplicable) return null;

  const openingCash =
    data.openingBankBalance === null && data.openingCashOnHand === null
      ? null
      : (data.openingBankBalance ?? 0) + (data.openingCashOnHand ?? 0);

  const totalInflows = sumOrNull(CASH_INFLOW_TYPES.map((t) => data.inflows[t].amount));
  const totalOutflows = sumOrNull(CASH_OUTFLOW_TYPES.map((t) => data.outflows[t].amount));

  // With neither inflows nor outflows captured there is no cash activity to
  // report, even if an opening balance was entered.
  if (totalInflows === null && totalOutflows === null) return null;

  const netMovement =
    totalInflows === null || totalOutflows === null
      ? null
      : totalInflows - totalOutflows;
  const closingCash =
    openingCash === null || netMovement === null ? null : openingCash + netMovement;

  const forecastAvailable = data.forecastInflows !== null && data.forecastOutflows !== null;
  const forecastClosingCash =
    forecastAvailable && closingCash !== null
      ? closingCash + (data.forecastInflows! - data.forecastOutflows!)
      : null;

  return {
    openingCash,
    totalInflows,
    totalOutflows,
    netMovement,
    closingCash,
    previousPeriodClosingCash,
    forecastAvailable,
    forecastClosingCash,
    // A forecast that lands below zero is a shortfall worth warning on
    // (Section 11: "forecast cash shortfall"). No threshold is applied here -
    // that is the KPI's configured threshold's job.
    forecastShortfall: forecastClosingCash !== null && forecastClosingCash < 0,
  };
}

// ---------------------------------------------------------------------------
// Section 12 & 13 - Budgets
// ---------------------------------------------------------------------------

export interface BudgetLineSummary {
  line: BudgetLineLike;
  budgetId: string;
  label: string;
  /** The budget in force: the revision if one exists, otherwise the approved
   *  figure. Section 13 refers to "Approved/Revised Budget" as a single
   *  denominator. */
  budget: number | null;
  actual: number | null;
  committed: number | null;
  /** Section 13: budget - actual - committed. */
  remaining: number | null;
  /** Section 13: actual / budget x 100. */
  utilisationPct: number | null;
  /** Section 13: budget - actual. */
  variance: number | null;
  forecast: number | null;
  /** Overspend against the budget in force. */
  overspent: boolean;
}

interface BudgetLineLike {
  id: string;
  budgetId: string;
  budgetLine: string;
  category: string;
  costCentre: string;
  funder: string;
  approvedBudget: number | null;
  revisedBudget: number | null;
  actualExpenditure: number | null;
  committedExpenditure: number | null;
  forecastExpenditure: number | null;
}

export interface BudgetSummary {
  lines: BudgetLineSummary[];
  totalBudget: number | null;
  totalActual: number | null;
  totalCommitted: number | null;
  totalRemaining: number | null;
  /** Portfolio utilisation = total actual / total budget x 100. */
  utilisationPct: number | null;
  totalVariance: number | null;
  totalForecast: number | null;
  /** Lines already over their budget - a structural problem regardless of
   *  portfolio-level percentage, which can hide a single blown line. */
  overspentLines: BudgetLineSummary[];
  /** Lines with no remaining budget left. Section 11's example - a line
   *  approaching its limit - is detected from these rather than by comparing
   *  against a hard-coded amount. */
  linesAtLimit: BudgetLineSummary[];
  /** The tightest remaining balance across all lines, and which line it is.
   *  This is what a configurable cash/budget warning should be pointed at. */
  lowestRemaining: { budgetId: string; label: string; remaining: number | null } | null;
}

/**
 * Budget monitoring at line-item level (Sections 12, 13, 14).
 *
 * The workbook's own remaining-budget calculation is preserved rather than
 * replaced: where `committedCountsAgainstBudget` is false the committed figure
 * is reported but not deducted, because some finance systems treat committed
 * spend as still available. The flag is recorded configuration, decided by
 * Finance, not an assumption baked into the formula (Section 13, final
 * paragraph).
 */
export function calculateBudgets(data: FinanceBudgetData): BudgetSummary | null {
  if (data.notApplicable || data.lines.length === 0) return null;

  const deductCommitted = data.committedCountsAgainstBudget;

  const lines: BudgetLineSummary[] = data.lines.map((line) => {
    const budget = line.revisedBudget ?? line.approvedBudget;
    const actual = line.actualExpenditure;
    const committed = deductCommitted ? line.committedExpenditure : null;

    const remaining =
      budget === null ? null : budget - (actual ?? 0) - (committed ?? 0);
    const utilisationPct =
      actual !== null && budget !== null && budget !== 0 ? round((actual / budget) * 100, 1) : null;
    const variance = budget === null || actual === null ? null : budget - actual;

    return {
      line,
      budgetId: line.budgetId,
      label: line.budgetLine || line.category || line.costCentre || line.budgetId,
      budget,
      actual,
      committed: line.committedExpenditure,
      remaining,
      utilisationPct,
      variance,
      forecast: line.forecastExpenditure,
      overspent: remaining !== null && remaining < 0,
    };
  });

  const totalBudget = sumOrNull(lines.map((l) => l.budget));
  const totalActual = sumOrNull(lines.map((l) => l.actual));
  const totalCommitted = sumOrNull(lines.map((l) => l.committed));
  const totalRemaining = sumOrNull(lines.map((l) => l.remaining));
  const totalForecast = sumOrNull(lines.map((l) => l.forecast));

  // The tightest line is found by comparing every line that HAS a remaining
  // balance. A line with no budget captured has no remaining figure and is
  // skipped rather than treated as zero - otherwise an incomplete budget table
  // would report a false emergency.
  const withRemaining = lines.filter((l) => l.remaining !== null);
  const lowest = withRemaining.length
    ? withRemaining.reduce((min, l) => ((l.remaining ?? 0) < (min.remaining ?? 0) ? l : min))
    : null;

  return {
    lines,
    totalBudget,
    totalActual,
    totalCommitted,
    totalRemaining,
    utilisationPct:
      totalActual !== null && totalBudget !== null && totalBudget !== 0
        ? round((totalActual / totalBudget) * 100, 1)
        : null,
    totalVariance:
      totalBudget !== null && totalActual !== null ? totalBudget - totalActual : null,
    totalForecast,
    overspentLines: lines.filter((l) => l.overspent),
    linesAtLimit: lines.filter((l) => l.remaining !== null && l.remaining <= 0),
    lowestRemaining: lowest
      ? { budgetId: lowest.budgetId, label: lowest.label, remaining: lowest.remaining }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Sections 15-17 & 18-20 - Debtors / Creditors ageing
// ---------------------------------------------------------------------------

export interface AgeingSummary {
  /** Outstanding total across every record. */
  totalOutstanding: number | null;
  /** Outstanding amount per ageing bucket, keyed by bucket label. */
  byBucket: Record<string, number>;
  /** Count of records per bucket. */
  countByBucket: Record<string, number>;
  /** Everything outside the "Current" bucket. */
  totalOverdue: number | null;
  /** Overdue balance in the 90-days-and-beyond bucket, or the deepest bucket
   *  configured if the policy has no 90-day line. Section 17's warning is
   *  stated against 90+ days. */
  severeOverdue: number | null;
  severeBucketLabel: string;
  /** Invoiced less received, as a percentage. Section 16 collection rate. */
  collectionRatePct: number | null;
  /** Largest single overdue account - Section 17's "large individual overdue
   *  account" warning. */
  largestOverdueAccount: { label: string; amount: number; daysOverdue: number } | null;
  /** Records whose outstanding balance grew against the prior period
   *  (Section 17: "increasing debtor balance" / Section 19 creditor trend). */
  increasingBalance: { label: string; previous: number; current: number }[];
  recordCount: number;
}

/**
 * Shared ageing logic for debtors and creditors.
 *
 * Days overdue is derived from the due date, never typed. Amounts outstanding
 * default to invoice less received when not stated explicitly, which is the
 * ordinary case and saves Finance re-entering the same subtraction.
 *
 * Section 20 is explicit that a creditor is not a risk merely by existing -
 * every signal returned here is descriptive, and whether any of it constitutes
 * a warning is decided by the KPI's configured thresholds downstream.
 */
function summariseAgeing(
  records: {
    id: string;
    label: string;
    dueDate: string;
    invoiceAmount: number | null;
    settledAmount: number | null;
    previousPeriodOutstanding: number | null;
  }[],
  buckets: AgeingBucket[],
  /** Reference date for ageing. Injectable so the ageing tests pin a date
   *  instead of ageing differently as the suite ages. */
  today: Date = new Date()
): AgeingSummary {
  const sorted = [...buckets].sort((a, b) => a.from - b.from);
  const currentLabel = sorted[0]?.label ?? "Current";
  // The "severe" bucket is the one Section 17 names (90+ days). If the
  // configured policy has no such line, the deepest bucket is used instead so
  // the warning still has something to point at.
  const severe = sorted.find((b) => b.from === 90) ?? sorted[sorted.length - 1];

  const byBucket: Record<string, number> = {};
  const countByBucket: Record<string, number> = {};
  for (const b of sorted) {
    byBucket[b.label] = 0;
    countByBucket[b.label] = 0;
  }

  let totalOutstanding = 0;
  let anyOutstanding = false;
  let totalOverdue = 0;
  let severeOverdue = 0;
  let largestOverdue: AgeingSummary["largestOverdueAccount"] = null;
  let totalInvoiced = 0;
  let totalSettled = 0;
  let anyAmounts = false;
  const increasingBalance: AgeingSummary["increasingBalance"] = [];

  for (const rec of records) {
    const outstanding =
      rec.invoiceAmount === null
        ? null
        : Math.max(0, rec.invoiceAmount - (rec.settledAmount ?? 0));

    if (rec.invoiceAmount !== null) {
      anyAmounts = true;
      totalInvoiced += rec.invoiceAmount;
      totalSettled += rec.settledAmount ?? 0;
    }

    // Growth against the prior period is evaluable only where both figures
    // exist; a record with no prior figure simply is not evidence of growth.
    if (
      rec.previousPeriodOutstanding !== null &&
      outstanding !== null &&
      outstanding > rec.previousPeriodOutstanding
    ) {
      increasingBalance.push({
        label: rec.label,
        previous: rec.previousPeriodOutstanding,
        current: outstanding,
      });
    }

    if (outstanding === null) continue;
    anyOutstanding = true;
    totalOutstanding += outstanding;

    const days = daysOverdue(rec.dueDate, today);
    if (days === null) continue;

    // The bucket whose lower bound the age has reached - i.e. the last bucket
    // the record qualifies for.
    const matched = [...sorted].reverse().find((b) => days >= b.from) ?? sorted[0];
    byBucket[matched.label] = (byBucket[matched.label] ?? 0) + outstanding;
    countByBucket[matched.label] = (countByBucket[matched.label] ?? 0) + 1;

    if (matched.label !== currentLabel) {
      totalOverdue += outstanding;
      if (!largestOverdue || outstanding > largestOverdue.amount) {
        largestOverdue = { label: rec.label, amount: outstanding, daysOverdue: days };
      }
    }
    if (matched.from >= severe.from) severeOverdue += outstanding;
  }

  return {
    totalOutstanding: anyOutstanding ? totalOutstanding : null,
    byBucket,
    countByBucket,
    totalOverdue: anyOutstanding ? totalOverdue : null,
    severeOverdue: anyAmounts ? severeOverdue : null,
    severeBucketLabel: severe?.label ?? "90 days",
    collectionRatePct:
      anyAmounts && totalInvoiced > 0 ? round((totalSettled / totalInvoiced) * 100, 1) : null,
    largestOverdueAccount: largestOverdue,
    increasingBalance,
    recordCount: records.length,
  };
}

export function calculateDebtors(
  data: FinanceDebtorsData,
  buckets: AgeingBucket[] = DEFAULT_AGEING_BUCKETS,
  today?: Date
): AgeingSummary | null {
  if (data.notApplicable || data.records.length === 0) return null;
  return summariseAgeing(
    data.records.map((r) => ({
      id: r.id,
      label: r.customer || r.invoiceNumber || r.id,
      dueDate: r.dueDate,
      invoiceAmount: r.invoiceAmount,
      settledAmount: r.amountReceived,
      previousPeriodOutstanding: r.previousPeriodOutstanding,
    })),
    buckets,
    today
  );
}

export function calculateCreditors(
  data: FinanceCreditorsData,
  buckets: AgeingBucket[] = DEFAULT_AGEING_BUCKETS,
  today?: Date
): AgeingSummary | null {
  if (data.notApplicable || data.records.length === 0) return null;
  return summariseAgeing(
    data.records.map((r) => ({
      id: r.id,
      label: r.supplier || r.invoiceNumber || r.id,
      dueDate: r.dueDate,
      invoiceAmount: r.invoiceAmount,
      settledAmount: r.amountPaid,
      previousPeriodOutstanding: r.previousPeriodOutstanding,
    })),
    buckets,
    today
  );
}

/** Days past the due date. Null when there is no due date - an invoice with no
 *  date cannot be aged, and treating it as current would understate exposure. */
export function daysOverdue(dueDate: string, today: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
}

// ---------------------------------------------------------------------------
// Section 21 - Profitability
// ---------------------------------------------------------------------------

export interface ProfitabilitySummary {
  /** Total operating revenue, transfers excluded. */
  revenue: number | null;
  /** Total operating expenditure, transfers excluded. */
  operatingExpenses: number | null;
  /** Revenue less operating expenses. */
  operatingSurplus: number | null;
  /** Surplus as a share of revenue. Null when there is no revenue to divide by
   *  - a margin against zero revenue is undefined, not zero. */
  operatingMarginPct: number | null;
  /** Expenses expressed as a share of revenue. This is the "core operations"
   *  cost ratio Section 21 pairs with the operating margin. */
  costRatioPct: number | null;
  budgetedRevenue: number | null;
  budgetedExpenses: number | null;
  budgetedSurplus: number | null;
  /** Actual surplus less budgeted surplus. */
  surplusVariance: number | null;
  previousPeriodSurplus: number | null;
  /** Internal transfers moved between Buhle cost centres - excluded from every
   *  figure above and reported separately so the exclusion is visible rather
   *  than invisible (Section 21). */
  transfers: number | null;
  /** True when both revenue and expenses were captured, i.e. the surplus is a
   *  real measured position rather than half a calculation. */
  complete: boolean;
}

/**
 * Brings revenue and cost together (Section 21).
 *
 * Both revenue and expense lines carry an `isTransfer` flag, and both are
 * excluded from the core-operations result. Section 21 is explicit that the
 * Executive Operating Surplus/Deficit must use this "core operations" view
 * where transfers are excluded - so the exclusion happens once, here, and every
 * consumer reads the result rather than re-deriving it (Section 39).
 */
export function calculateProfitability(
  revenue: FinanceRevenueData,
  expenses: FinanceProfitabilityData
): ProfitabilitySummary | null {
  if (revenue.notApplicable || expenses.notApplicable) return null;

  const revenueLines = revenue.lines.filter((l) => !l.isTransfer);
  const expenseLines = expenses.expenses.filter((l) => !l.isTransfer);

  const revenueValue = sumOrNull(revenueLines.map((l) => l.actual));
  const expenseValue = sumOrNull(expenseLines.map((l) => l.actual));
  if (revenueValue === null && expenseValue === null) return null;

  const budgetedRevenue = sumOrNull(revenueLines.map((l) => l.budget));
  const budgetedExpenses = sumOrNull(expenseLines.map((l) => l.budget));

  const operatingSurplus =
    revenueValue === null || expenseValue === null ? null : revenueValue - expenseValue;
  const budgetedSurplus =
    budgetedRevenue === null || budgetedExpenses === null ? null : budgetedRevenue - budgetedExpenses;
  const previousPeriodSurplus = (() => {
    const prevRevenue = sumOrNull(revenueLines.map((l) => l.previousPeriod));
    const prevExpense = sumOrNull(expenseLines.map((l) => l.previousPeriod));
    return prevRevenue === null || prevExpense === null ? null : prevRevenue - prevExpense;
  })();

  return {
    revenue: revenueValue,
    operatingExpenses: expenseValue,
    operatingSurplus,
    operatingMarginPct:
      operatingSurplus !== null && revenueValue !== null && revenueValue !== 0
        ? round((operatingSurplus / revenueValue) * 100, 1)
        : null,
    costRatioPct:
      expenseValue !== null && revenueValue !== null && revenueValue !== 0
        ? round((expenseValue / revenueValue) * 100, 1)
        : null,
    budgetedRevenue,
    budgetedExpenses,
    budgetedSurplus,
    surplusVariance:
      operatingSurplus !== null && budgetedSurplus !== null ? operatingSurplus - budgetedSurplus : null,
    previousPeriodSurplus,
    transfers: sumOrNull([
      ...revenue.lines.filter((l) => l.isTransfer).map((l) => l.actual),
      ...expenses.expenses.filter((l) => l.isTransfer).map((l) => l.actual),
    ]),
    // A surplus computed from revenue alone is not a profitability position.
    complete: revenueValue !== null && expenseValue !== null,
  };
}

// ---------------------------------------------------------------------------
// KPI binding - report -> KPI values
// ---------------------------------------------------------------------------

/** A KPI that could not be derived from this submission, with the reason why. */
export interface SkippedKpi {
  kpiId: string;
  reason: "no_data" | "not_available" | "threshold_unset";
  detail: string;
}

export interface FinanceKpiComputation {
  entries: { kpiId: string; value: number }[];
  skipped: SkippedKpi[];
  audit: Record<string, number | null>;
  /** Everything the six sections derived, for the review page and KPI summary
   *  (Section 23). */
  revenue: RevenueSummary | null;
  cashFlow: CashFlowSummary | null;
  budgets: BudgetSummary | null;
  debtors: AgeingSummary | null;
  creditors: AgeingSummary | null;
  profitability: ProfitabilitySummary | null;
}

/** KPI ids the Finance submission is responsible for. */
export const FINANCE_KPI_IDS = {
  revenue: "kpi-revenue",
  donorFunding: "kpi-funding",
  operatingSurplus: "kpi-surplus",
  cashBalance: "kpi-cash-balance",
  netCashMovement: "kpi-net-cash-movement",
  budgetUtilisation: "kpi-budget-utilisation",
  budgetRemaining: "kpi-budget-remaining",
  debtorsTotal: "kpi-debtors-total",
  debtors90Plus: "kpi-debtors-90plus",
  collectionRate: "kpi-collection-rate",
  creditorsTotal: "kpi-creditors-total",
  creditors90Plus: "kpi-creditors-90plus",
  operatingMargin: "kpi-operating-margin",
} as const;

/**
 * The one place the submission meets the shared KPI/EWS pipeline.
 *
 * It returns plain numbers; DataStoreContext drives RAG, risks, actions and
 * alerts from there. That is deliberate - Section 39 requires Finance to be the
 * authoritative source, and the only way to guarantee one set of financial
 * rules application-wide is for every consumer to read these values rather than
 * recalculate them.
 */
export function computeFinanceKpis(
  report: FinanceReport,
  kpis: Kpi[],
  config: { revenueCategories: { id: string; kind: string }[]; ageingBuckets: AgeingBucket[] }
): FinanceKpiComputation {
  const entries: FinanceKpiComputation["entries"] = [];
  const skipped: SkippedKpi[] = [];
  const audit: FinanceKpiComputation["audit"] = {};

  const push = (kpiId: string, value: number | null) => {
    audit[kpiId] = value;
    if (value === null) return;
    entries.push({ kpiId, value });
  };

  const revenue = calculateRevenue(report.revenue, config.revenueCategories);
  const cashFlow = calculateCashFlow(report.cashFlow);
  const budgets = calculateBudgets(report.budgets);
  const debtors = calculateDebtors(report.debtors, config.ageingBuckets);
  const creditors = calculateCreditors(report.creditors, config.ageingBuckets);
  const profitability = calculateProfitability(report.revenue, report.profitability);

  push(FINANCE_KPI_IDS.revenue, revenue?.currentPeriodRevenue ?? null);
  push(FINANCE_KPI_IDS.donorFunding, revenue?.donorFunding ?? null);
  push(FINANCE_KPI_IDS.operatingSurplus, profitability?.operatingSurplus ?? null);
  push(FINANCE_KPI_IDS.cashBalance, cashFlow?.closingCash ?? null);
  push(FINANCE_KPI_IDS.netCashMovement, cashFlow?.netMovement ?? null);
  push(FINANCE_KPI_IDS.budgetUtilisation, budgets?.utilisationPct ?? null);
  // Budget remaining is reported as the TIGHTEST line, not the portfolio total.
  // A portfolio can look comfortable while one line has nothing left, and
  // Section 11's warning is precisely about a single line running out. The
  // portfolio total is still available in the review page for context.
  push(FINANCE_KPI_IDS.budgetRemaining, budgets?.lowestRemaining?.remaining ?? null);
  push(FINANCE_KPI_IDS.debtorsTotal, debtors?.totalOutstanding ?? null);
  push(FINANCE_KPI_IDS.debtors90Plus, debtors?.severeOverdue ?? null);
  push(FINANCE_KPI_IDS.collectionRate, debtors?.collectionRatePct ?? null);
  push(FINANCE_KPI_IDS.creditorsTotal, creditors?.totalOutstanding ?? null);
  push(FINANCE_KPI_IDS.creditors90Plus, creditors?.severeOverdue ?? null);
  push(FINANCE_KPI_IDS.operatingMargin, profitability?.operatingMarginPct ?? null);

  const nameOf = (id: string) => kpis.find((k) => k.id === id)?.name ?? id;
  for (const kpiId of Object.values(FINANCE_KPI_IDS)) {
    if (audit[kpiId] !== null && audit[kpiId] !== undefined) continue;
    skipped.push({
      kpiId,
      reason: "no_data",
      detail: `${nameOf(kpiId)} could not be derived - the underlying ${sectionForKpi(kpiId)} records were not supplied.`,
    });
  }

  return { entries, skipped, audit, revenue, cashFlow, budgets, debtors, creditors, profitability };
}

/** Which section feeds a KPI, used to phrase a skipped-KPI explanation the
 *  manager can act on. */
export function sectionForKpi(kpiId: string): string {
  switch (kpiId) {
    case FINANCE_KPI_IDS.revenue:
    case FINANCE_KPI_IDS.donorFunding:
      return "Revenue";
    case FINANCE_KPI_IDS.cashBalance:
    case FINANCE_KPI_IDS.netCashMovement:
      return "Cash Flow";
    case FINANCE_KPI_IDS.budgetUtilisation:
    case FINANCE_KPI_IDS.budgetRemaining:
      return "Budgets";
    case FINANCE_KPI_IDS.debtorsTotal:
    case FINANCE_KPI_IDS.debtors90Plus:
    case FINANCE_KPI_IDS.collectionRate:
      return "Debtors";
    case FINANCE_KPI_IDS.creditorsTotal:
    case FINANCE_KPI_IDS.creditors90Plus:
      return "Creditors";
    case FINANCE_KPI_IDS.operatingSurplus:
    case FINANCE_KPI_IDS.operatingMargin:
      return "Profitability";
    default:
      return "Finance";
  }
}

/**
 * Live RAG for a candidate value, so the modal can show the warning a
 * submission is about to trigger before it is saved (Sections 8, 11, 14, 17).
 * Delegates to the shared engine so the preview can never disagree with what
 * submission actually does.
 */
export function previewFinanceStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) return { status: "no_data" as const, thresholdNote: "" };
  if (kpi.dataAvailable === false) {
    return { status: "not_available" as const, thresholdNote: kpi.notAvailableReason ?? "" };
  }
  const status = getStatusForValue(kpi, value);
  if (status === "threshold_unset") {
    return {
      status,
      thresholdNote:
        "Threshold not configured - no approved limit has been set for this KPI, so no Green/Amber/Red verdict can be given. The figure will be recorded and monitored only.",
    };
  }
  return { status, thresholdNote: "" };
}

/** Every Amber/Red KPI Finance is expected to explain (Section 31). */
export function kpisNeedingExplanation(
  computation: FinanceKpiComputation,
  kpis: Kpi[],
  commentary: FinanceCommentary
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries
    .map(({ kpiId, value }) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi) return null;
      const status = getStatusForValue(kpi, value);
      if (status !== "amber" && status !== "red") return null;
      return { kpiId, name: kpi.name, value, status };
    })
    .filter((x): x is { kpiId: string; name: string; value: number; status: "amber" | "red" } => x !== null)
    .filter(({ kpiId }) => (commentary.kpiExplanations[kpiId] ?? "").trim() === "");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCurrency(value: number | null | undefined, symbol = "R"): string {
  if (value === null || value === undefined) return "-";
  return `${symbol}${Math.round(value).toLocaleString("en-ZA")}`;
}
