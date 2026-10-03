import type { Kpi, ReportingFrequency } from "../types";
import {
  CASH_INFLOW_TYPES,
  CASH_OUTFLOW_TYPES,
  DEFAULT_AGEING_BUCKETS,
  DEFAULT_REVENUE_CATEGORIES,
  FINANCE_DEPARTMENT,
  type BudgetLine,
  type CreditorRecord,
  type DebtorRecord,
  type ExpenseLine,
  type FinanceCommentary,
  type FinanceConfig,
  type FinanceReport,
  type RevenueLine,
} from "../types/finance";

/**
 * Finance configuration, blank-report factory and the KPIs the submission owns.
 *
 * Contains NO sample revenue, budget, debtor or creditor figures. Section 2 is
 * explicit - "Do NOT fabricate financial values" - and the discovery confirmed
 * the real numbers live in a workbook that is not in this repository. A
 * fabricated R525,000 would be indistinguishable from a genuine submission once
 * it reached the KPI engine and the Executive Dashboard, so every figure
 * arrives from Finance instead.
 *
 * What IS seeded is the structure: category lists, ageing buckets, KPI
 * definitions and deliberately unset thresholds.
 */

/**
 * Expense categories offered in the Profitability section.
 *
 * Like revenue categories this is Finance-owned configuration (Section 21), so
 * it lives in FinanceConfig rather than being a domain constant. These are the
 * starting categories; an administrator edits them in Administration.
 *
 * Declared before DEFAULT_FINANCE_CONFIG, which reads it at module initialisation.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Payroll",
  "Operating expenses",
  "Supplier / production costs",
  "Capital expenditure",
  "Debt repayments",
  "Donor / grant expenditure",
  "Other approved expenditure",
] as const;

/**
 * Monthly is the proposed default cadence (Section 4), held in config rather
 * than hard-coded into the cycle logic so an administrator can change it and the
 * next-due-date calculation follows.
 */
export const DEFAULT_FINANCE_CONFIG: FinanceConfig = {
  reportingFrequency: "Monthly" as ReportingFrequency,
  // Section 11: "the currency must come from the organisation's Finance
  // configuration." Rand is the working assumption for a South African
  // organisation and is editable, not baked into any formula.
  currencySymbol: "R",
  revenueCategories: DEFAULT_REVENUE_CATEGORIES,
  expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
  ageingBuckets: DEFAULT_AGEING_BUCKETS,
  // Section 13: preserved as a recorded decision rather than an assumption.
  // Until Finance confirms how the Budget Monitor treats committed spend, the
  // conservative reading is used - committed counts against the budget - and
  // the flag is surfaced in Administration so it can be corrected in one place.
  committedCountsAgainstBudget: true,
};

export function blankRevenueLine(categoryId: string): RevenueLine {
  return {
    id: newId("rev"),
    categoryId,
    description: "",
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
  };
}

export function blankExpenseLine(categoryId: string): ExpenseLine {
  return {
    id: newId("exp"),
    categoryId,
    description: "",
    costCentre: "",
    department: "",
    project: "",
    budget: null,
    actual: null,
    previousPeriod: null,
    isTransfer: false,
    notes: "",
  };
}

export function blankBudgetLine(): BudgetLine {
  return {
    id: newId("bud"),
    budgetId: "",
    budgetLine: "",
    category: "",
    department: "",
    costCentre: "",
    project: "",
    funder: "",
    approvedBudget: null,
    revisedBudget: null,
    actualExpenditure: null,
    committedExpenditure: null,
    forecastExpenditure: null,
    status: "",
    notes: "",
  };
}

export function blankDebtorRecord(): DebtorRecord {
  return {
    id: newId("deb"),
    customer: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    description: "",
    department: "",
    project: "",
    invoiceAmount: null,
    amountReceived: null,
    previousPeriodOutstanding: null,
    responsibleOwner: "",
    followUpDate: "",
    notes: "",
  };
}

export function blankCreditorRecord(): CreditorRecord {
  return {
    id: newId("cred"),
    supplier: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    department: "",
    costCentre: "",
    project: "",
    invoiceAmount: null,
    amountPaid: null,
    previousPeriodOutstanding: null,
    paymentDate: "",
    responsibleOwner: "",
    notes: "",
  };
}

export function blankCommentary(): FinanceCommentary {
  return {
    overall: "",
    revenueCommentary: "",
    cashFlowCommentary: "",
    budgetCommentary: "",
    debtorsCommentary: "",
    creditorsCommentary: "",
    profitabilityCommentary: "",
    keyIssue: "",
    keyAchievement: "",
    actionRequired: "",
    supportRequired: "",
    kpiExplanations: {},
  };
}

/** A blank Finance report for one cycle, ready for Finance to complete. */
export function createBlankFinanceReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  config: FinanceConfig;
}): FinanceReport {
  const blankFlow = () => ({ amount: null, previousPeriod: null });
  return {
    id: `fin-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: FINANCE_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    revenue: { lines: [], commentary: "", notApplicable: false },
    cashFlow: {
      openingBankBalance: null,
      openingCashOnHand: null,
      inflows: Object.fromEntries(CASH_INFLOW_TYPES.map((t) => [t, blankFlow()])) as FinanceReport["cashFlow"]["inflows"],
      outflows: Object.fromEntries(CASH_OUTFLOW_TYPES.map((t) => [t, blankFlow()])) as FinanceReport["cashFlow"]["outflows"],
      forecastInflows: null,
      forecastOutflows: null,
      closingCashEntered: null,
      commentary: "",
      notApplicable: false,
    },
    budgets: {
      lines: [],
      committedCountsAgainstBudget: params.config.committedCountsAgainstBudget,
      commentary: "",
      notApplicable: false,
    },
    debtors: { records: [], commentary: "", notApplicable: false },
    creditors: { records: [], commentary: "", notApplicable: false },
    profitability: { expenses: [], commentary: "", notApplicable: false },
    commentary: blankCommentary(),
    // Section 33: before anything is submitted or imported, the honest state is
    // "Not Submitted" - never an implied manual entry.
    dataSource: { kind: "Not Submitted" },
    importRuns: [],
    status: "Draft",
    computedKpis: {},
  };
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Finance KPIs the submission introduces.
 *
 * Every threshold here is `null`. That is deliberate and is the single most
 * important decision in this file: Sections 8, 11, 14, 17, 20 and 22 all say
 * thresholds must be configurable and must not be hard-coded, and the
 * specification's own worked examples (R100,000 amber, R50,000 red, R50,000
 * remaining) are explicitly labelled as examples.
 *
 * With no threshold set the shared engine reports `threshold_unset` - the KPI is
 * recorded, displayed and monitored, but issues no Green/Amber/Red verdict. That
 * is the correct state for a figure Finance has just started reporting but for
 * which the Board has not yet approved a limit. An administrator sets real
 * limits in Administration -> KPI Thresholds, and from that moment the Early
 * Warning System works with no code change.
 *
 * `direction` is encoded through `lowerIsBetter`, which is what makes each of
 * these sensible: a cash balance must stay high, an overdue debtor balance must
 * stay low.
 */
export const FINANCE_SUBMISSION_KPIS: Kpi[] = [
  {
    id: "kpi-cash-balance",
    name: "Closing Cash Balance",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Opening cash plus period inflows less period outflows, derived from the Cash Flow section. No minimum-cash threshold has been approved yet, so this is monitored rather than scored.",
    sourceSystem: "Finance submission - cash flow records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-net-cash-movement",
    name: "Net Cash Movement",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    // A negative movement is the concern, but the magnitude is what an
    // administrator will set limits against. Flagged as not-lower-is-better so
    // an approved positive threshold means "movement must stay above this".
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Total cash inflows less total cash outflows for the period. A negative figure means the organisation consumed cash during the month.",
    sourceSystem: "Finance submission - cash flow records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-budget-utilisation",
    name: "Budget Utilisation",
    department: FINANCE_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Actual expenditure as a share of the approved or revised budget across all budget lines. No approved utilisation ceiling has been set yet.",
    sourceSystem: "Finance submission - budget line records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-budget-remaining",
    name: "Budget Remaining (Tightest Line)",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "The smallest remaining balance across all budget lines, after actual and (where Finance's policy counts it) committed expenditure. Reported per-line rather than as a portfolio total, because a portfolio total can look comfortable while one line has nothing left.",
    sourceSystem: "Finance submission - budget line records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-debtors-total",
    name: "Total Debtors",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Total amount invoiced and not yet received, across all debtor records. No approved maximum exposure has been set yet.",
    sourceSystem: "Finance submission - debtor records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-debtors-90plus",
    name: "Debtors 90+ Days",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Outstanding balance on invoices 90 days or more past their due date, using the configured ageing buckets. This is the figure Section 17's warning is stated against.",
    sourceSystem: "Finance submission - debtor records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-collection-rate",
    name: "Collection Rate",
    department: FINANCE_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Amount received as a share of amount invoiced across the period's debtor records. No approved collection target has been set yet.",
    sourceSystem: "Finance submission - debtor records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-creditors-total",
    name: "Total Creditors",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    // Section 20: "Do not automatically mark a creditor as a risk solely because
    // it exists." A higher creditor balance is not inherently worse, so this is
    // scored as "must stay above" if Finance ever sets a floor, and left
    // unthresholded otherwise rather than assumed bad.
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Total amount invoiced by suppliers and not yet paid. Reported as context for cash planning; Section 20 requires this to be evaluated against configured rules rather than treated as a risk by itself.",
    sourceSystem: "Finance submission - creditor records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-creditors-90plus",
    name: "Creditors 90+ Days",
    department: FINANCE_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Unpaid balance on supplier invoices 90 days or more past their due date. Overdue suppliers carry relationship and supply-continuity risk.",
    sourceSystem: "Finance submission - creditor records",
    thresholdApproval: "proposed",
  },
  {
    id: "kpi-operating-margin",
    name: "Operating Margin",
    department: FINANCE_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Finance Manager",
    dataAvailable: false,
    insight:
      "Core-operations surplus (transfers excluded) as a share of core-operations revenue, per Section 21. No approved margin target has been set yet.",
    sourceSystem: "Finance submission - revenue and expense records",
    thresholdApproval: "proposed",
  },
];
