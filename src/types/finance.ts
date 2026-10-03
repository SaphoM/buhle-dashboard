// ============================================================================
// FINANCE reporting domain.
//
// The Finance submission is the Finance department's monthly management
// process, modelled on the HR six-section cycle but materially more granular,
// because Finance is the authoritative source for several Executive KPIs
// (Finance spec Sections 30 and 39).
//
// Design rules held throughout this file:
//
//  - Finance is the single source of financial truth. Other departments
//    (Commercial Farming, Operations) may record activity, but revenue, cost,
//    cash, debtors, creditors and profitability are computed HERE and nowhere
//    else (Section 39). The Executive Dashboard reads these KPIs; it never
//    recalculates them.
//
//  - The current data source is an internally built Excel workbook (the
//    "Budget Monitor"), not a live accounting integration (Sections 2, 3 and
//    38). So every record carries provenance - where it came from, when, who
//    entered it - and the UI must never let a reader mistake a manually
//    submitted figure for a live feed. That is why `dataSource` sits on the
//    report rather than being implied.
//
//  - Every captured figure is nullable. "Not supplied" and "zero" are
//    different facts. A missing figure must surface as no-data / not-available /
//    threshold-unset, never as a fabricated Green (Sections 8, 33).
//
//  - Nothing invents a threshold. All limits live on the KPI record and are
//    admin-editable in Administration. The numbers that appear in the
//    specification (R100,000 amber, R50,000 red, R50,000 remaining) are worked
//    EXAMPLES and are deliberately not encoded anywhere in this codebase
//    (Sections 11, 14, 17).
// ============================================================================

import type { Department, ReportingFrequency } from "./index";

export const FINANCE_DEPARTMENT = "Finance" as const satisfies Department;

// ---------------------------------------------------------------------------
// Section 5 - the six Finance reporting areas, in submission order.
// ---------------------------------------------------------------------------

export const FINANCE_SECTION_KEYS = [
  "revenue",
  "cashFlow",
  "budgets",
  "debtors",
  "creditors",
  "profitability",
] as const;

export type FinanceSectionKey = (typeof FINANCE_SECTION_KEYS)[number];

export const FINANCE_SECTION_LABELS: Record<FinanceSectionKey, string> = {
  revenue: "Revenue",
  cashFlow: "Cash Flow",
  budgets: "Budgets",
  debtors: "Debtors",
  creditors: "Creditors",
  profitability: "Profitability",
};

/**
 * Per-section completion state in the modal's progress strip (Section 5).
 *  complete        - required figures supplied and internally consistent
 *  incomplete      - at least one required figure missing
 *  attention       - complete, but a derived KPI trips an Early Warning
 *  not_applicable  - explicitly marked N/A by Finance for this period
 *  imported        - figures arrived via workbook import and are validated
 *
 * Note there is deliberately no "not_available" state here. Unlike HR
 * Performance - which cannot exist until Buhle adopts a formal PMS - every one
 * of the six Finance areas can be produced today from the Budget Monitor
 * workbook, so Finance has no capability gap to report. A genuinely missing
 * figure is `incomplete`, not `not_available`, and conflating the two would
 * let a real data gap hide behind a capability message.
 */
export type FinanceSectionState = "complete" | "incomplete" | "attention" | "not_applicable" | "imported";

// ---------------------------------------------------------------------------
// Section 6 - Revenue
// ---------------------------------------------------------------------------

/**
 * Revenue categories (Section 6).
 *
 * Section 6 is explicit that these must not be hard-coded if the Finance
 * workbook already carries an approved category structure - so this list is
 * configuration, not a domain constant. `DEFAULT_REVENUE_CATEGORIES` is the
 * starting set taken from the discovery discussion, and an administrator can
 * replace or extend it in Administration -> Finance Configuration without a
 * code change (Section 6, final paragraph).
 *
 * `kind` drives the Executive linkage in Section 30: donor/funder lines roll up
 * to Executive Donor Funding, everything else to Executive Total Revenue.
 */
export type RevenueCategoryKind = "operating" | "donor" | "farming" | "other";

export interface RevenueCategory {
  id: string;
  label: string;
  kind: RevenueCategoryKind;
}

export const DEFAULT_REVENUE_CATEGORIES: RevenueCategory[] = [
  { id: "training", label: "Training income", kind: "operating" },
  { id: "corporate-training", label: "Corporate training", kind: "operating" },
  { id: "donor", label: "Donor / funder income", kind: "donor" },
  { id: "farming", label: "Commercial farming income", kind: "farming" },
  { id: "other", label: "Other approved income", kind: "other" },
];

/**
 * One revenue line for the period.
 *
 * Section 6 asks for budget / actual / previous period / YTD budget / YTD
 * actual, and the engine derives variance and achievement from them (Section
 * 7). Finance never types a percentage.
 *
 * `isTransfer` matters for profitability: Section 21 requires the Executive
 * Operating Surplus/Deficit to use the Finance-approved "core operations" view
 * with transfers excluded, so a transfer between Buhle's own cost centres must
 * not inflate or deflate the reported result.
 */
export interface RevenueLine {
  id: string;
  categoryId: string;
  description: string;
  /** Customer, funder or partner the income relates to. */
  counterparty: string;
  costCentre: string;
  project: string;
  /** Course or enterprise, where the line relates to one. */
  programme: string;
  budget: number | null;
  actual: number | null;
  previousPeriod: number | null;
  ytdBudget: number | null;
  ytdActual: number | null;
  /** Internal transfer rather than external income - excluded from the core
   *  operations surplus (Section 21). */
  isTransfer: boolean;
  notes: string;
}

export interface FinanceRevenueData {
  lines: RevenueLine[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 9 - Cash Flow
// ---------------------------------------------------------------------------

/**
 * Cash flow lines (Section 9). Kept as explicit named categories rather than a
 * free-form list because Section 11 makes cash a high-priority warning and the
 * EWS needs a stable, comparable structure period to period.
 */
export const CASH_INFLOW_TYPES = [
  "Revenue received",
  "Donor / funder receipts",
  "Training receipts",
  "Farm receipts",
  "Loan / grant receipts",
  "Other receipts",
] as const;

export const CASH_OUTFLOW_TYPES = [
  "Payroll",
  "Operating expenses",
  "Supplier payments",
  "Capital expenditure",
  "Debt repayments",
  "Other approved expenditure",
] as const;

export type CashInflowType = (typeof CASH_INFLOW_TYPES)[number];
export type CashOutflowType = (typeof CASH_OUTFLOW_TYPES)[number];

export interface CashFlowLine {
  amount: number | null;
  previousPeriod: number | null;
}

export interface FinanceCashFlowData {
  /** Bank balance at the start of the period. */
  openingBankBalance: number | null;
  /** Petty cash / cash on hand, where the organisation holds any. */
  openingCashOnHand: number | null;
  inflows: Record<CashInflowType, CashFlowLine>;
  outflows: Record<CashOutflowType, CashFlowLine>;

  /**
   * Forecast inputs (Section 10).
   *
   * Section 10 is explicit: "If forecasting data is not available: DO NOT
   * fabricate a forecast." These stay null until Finance supplies approved
   * figures, and until then the UI says "Forecast data not available" instead
   * of projecting a closing balance nobody approved.
   */
  forecastInflows: number | null;
  forecastOutflows: number | null;

  /**
   * The closing balance as Finance reads it off the workbook.
   *
   * The engine derives closing cash from opening + inflows - outflows (Section
   * 9), and this figure exists purely so the two can be reconciled. When they
   * disagree, the difference is a real discrepancy between the workbook and the
   * submission rather than something to paper over, so validation refuses it
   * instead of the engine quietly preferring one number.
   */
  closingCashEntered: number | null;

  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 12 - Budgets
// ---------------------------------------------------------------------------

export type BudgetStatus = "Approved" | "Revised" | "Pending Revision";

/**
 * One budget line (Section 12).
 *
 * Section 13 fixes the arithmetic: remaining = revised budget - actual -
 * committed, utilisation = actual / budget x 100, variance = budget - actual.
 * Committed expenditure is separately captured because a budget line can be
 * effectively spent while actuals still look healthy - which is exactly the
 * situation the Section 11 example (R50,000 left on a line) describes.
 */
export interface BudgetLine {
  id: string;
  budgetId: string;
  /** The financial year the line belongs to, e.g. "2026/27". A Budget Monitor
   *  export routinely spans two years, and merging them silently would report one
   *  budget as though it funded the whole year. */
  financialYear: string;
  /** The period the figures on this line cover, e.g. "September" or "2026-09".
   *  Blank means "the reporting period of the submission this line sits in". */
  period: string;
  budgetLine: string;
  category: string;
  department: Department | "";
  costCentre: string;
  project: string;
  funder: string;
  approvedBudget: number | null;
  revisedBudget: number | null;
  actualExpenditure: number | null;
  committedExpenditure: number | null;
  forecastExpenditure: number | null;
  status: BudgetStatus | "";
  notes: string;
}

export interface FinanceBudgetData {
  lines: BudgetLine[];
  /**
   * Whether the Budget Monitor workbook deducts committed spend from remaining
   * budget. Section 13 requires preserving the workbook's approved calculation
   * rather than replacing it, and this is the one place that genuinely differs
   * between finance systems - so it is a recorded, configurable decision rather
   * than an assumption.
   */
  committedCountsAgainstBudget: boolean;
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Sections 15 & 18 - Debtors and Creditors
// ---------------------------------------------------------------------------

/**
 * Ageing buckets (Sections 15, 18).
 *
 * Section 15 says "Use configurable ageing periods if the Finance policy
 * differs", so the bucket boundaries live in FinanceConfig rather than in the
 * engine. The engine reads whatever boundaries it is given.
 */
export interface AgeingBucket {
  label: string;
  /** Inclusive lower bound in days overdue. */
  from: number;
}

export const DEFAULT_AGEING_BUCKETS: AgeingBucket[] = [
  { label: "Current", from: 0 },
  { label: "30 days", from: 30 },
  { label: "60 days", from: 60 },
  { label: "90 days", from: 90 },
  { label: "120+ days", from: 120 },
];

export interface DebtorRecord {
  id: string;
  customer: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  department: Department | "";
  project: string;
  invoiceAmount: number | null;
  amountReceived: number | null;
  /** Snapshot of the total owed at the end of the prior period, for the
   *  "increasing debtor balance" warning in Section 17. Null when there is no
   *  prior figure - the warning is then simply not evaluated. */
  previousPeriodOutstanding: number | null;
  /** Where the invoice stands. The outstanding balance is derived, never typed,
   *  but Finance still records the status, because "disputed" and "written off"
   *  are facts about the debt that an ageing total cannot express. */
  status: ReceivableStatus | "";
  responsibleOwner: string;
  followUpDate: string;
  notes: string;
}

/**
 * Status of an invoice, for both money owed to Buhle and money Buhle owes. The
 * same vocabulary applies to both sides: an invoice is open, partly settled,
 * settled, disputed or written off.
 */
export type ReceivableStatus = "Open" | "Partially Paid" | "Paid" | "Disputed" | "Written Off";

export interface CreditorRecord {
  id: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  department: Department | "";
  costCentre: string;
  project: string;
  invoiceAmount: number | null;
  amountPaid: number | null;
  previousPeriodOutstanding: number | null;
  /** Same vocabulary as debtor invoices; see ReceivableStatus. */
  status: ReceivableStatus | "";
  paymentDate: string;
  responsibleOwner: string;
  notes: string;
}

export interface FinanceDebtorsData {
  records: DebtorRecord[];
  commentary: string;
  notApplicable: boolean;
}

export interface FinanceCreditorsData {
  records: CreditorRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 21 - Profitability
// ---------------------------------------------------------------------------

/**
 * Operating expense lines (Section 21).
 *
 * Expenses are captured separately from budgets: a budget is an authorisation,
 * an expense is what was actually spent. Profitability needs both - spend
 * against budget is a variance question, spend against revenue is a margin
 * question - so the two are never merged.
 */
/**
 * Whether an expense is a direct cost of delivering the revenue it sits beside,
 * or an overhead. Section 21 asks for gross profit "where applicable", and it is
 * only applicable once Finance has classified its costs - so a line with no
 * classification is counted as overhead and reported as such rather than being
 * guessed into one.
 */
export type CostType = "Direct" | "Indirect" | "";

export interface ExpenseLine {
  id: string;
  categoryId: string;
  /** Feeds gross profit; see CostType. Blank means unclassified (overhead). */
  costType: CostType;
  description: string;
  costCentre: string;
  department: Department | "";
  project: string;
  budget: number | null;
  actual: number | null;
  previousPeriod: number | null;
  isTransfer: boolean;
  notes: string;
}

export interface FinanceProfitabilityData {
  expenses: ExpenseLine[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 31 - Commentary
// ---------------------------------------------------------------------------

export interface FinanceCommentary {
  overall: string;
  revenueCommentary: string;
  cashFlowCommentary: string;
  budgetCommentary: string;
  debtorsCommentary: string;
  creditorsCommentary: string;
  profitabilityCommentary: string;
  keyIssue: string;
  keyAchievement: string;
  actionRequired: string;
  supportRequired: string;
  /**
   * Per-KPI explanation, prompted whenever a KPI lands Amber or Red
   * (Section 31: "Prompt Finance for an explanation").
   */
  kpiExplanations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Section 27 - data source / provenance
// ---------------------------------------------------------------------------

export type FinanceSourceKind = "Manual Entry" | "Workbook Import" | "Not Submitted";

export interface FinanceDataSource {
  kind: FinanceSourceKind;
  /** Original workbook filename for imported figures (Section 27). */
  fileName?: string;
  /** Which sheet of that workbook the figures came from. */
  sheetName?: string;
  importedAt?: string;
  importedBy?: string;
  /** Set when an import was attempted and failed (Section 33 "DATA IMPORT
   *  FAILED"). The section then reports the failure rather than reading as
   *  empty-and-fine. */
  failedAt?: string;
  failureReason?: string;
}

/** Section 26 - traceability for one import run. */
export interface ImportRun {
  id: string;
  /** The section this run filled. Without it, a section cannot say whether its
   *  rows came from the workbook or were typed in, and importing Debtors would
   *  appear to vouch for Revenue too. */
  target: FinanceSectionKey;
  fileName: string;
  importedAt: string;
  importedBy: string;
  sheetName: string;
  /** How many rows the sheet offered. */
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  /** Column mapping actually used, so a later re-import can be reproduced. */
  mapping: Record<string, string>;
  status: "Validated" | "Imported" | "Failed";
  notes?: string;
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

export type FinanceReportStatus = "Draft" | "Submitted";

export interface FinanceReport {
  id: string;
  cycleId: string;
  department: typeof FINANCE_DEPARTMENT;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  revenue: FinanceRevenueData;
  cashFlow: FinanceCashFlowData;
  budgets: FinanceBudgetData;
  debtors: FinanceDebtorsData;
  creditors: FinanceCreditorsData;
  profitability: FinanceProfitabilityData;
  commentary: FinanceCommentary;
  dataSource: FinanceDataSource;
  /** Provenance for each import run that fed this report (Section 26). */
  importRuns: ImportRun[];
  status: FinanceReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  /** KPI values derived from this submission - the audit record of what was
   *  calculated (Section 35). */
  computedKpis: Record<string, number | null>;
}

// ---------------------------------------------------------------------------
// Config (Section 4 - cadence must be configurable, never hard-coded)
// ---------------------------------------------------------------------------

export interface FinanceConfig {
  /** Cadence of the Finance reporting cycle. Drives next-due-date calculation. */
  reportingFrequency: ReportingFrequency;
  /** Currency symbol used for display. Comes from Finance configuration rather
   *  than being assumed (Section 11). */
  currencySymbol: string;
  /** The organisation's approved revenue category structure (Section 6). */
  revenueCategories: RevenueCategory[];
  /** The organisation's approved operating expense categories (Section 21). */
  expenseCategories: string[];
  /** Debtor/creditor ageing bucket boundaries in days (Sections 15, 18). */
  ageingBuckets: AgeingBucket[];
  /** Whether Budget Monitor actuals include committed spend (Section 13). */
  committedCountsAgainstBudget: boolean;
}

// ---------------------------------------------------------------------------
// Section 2 - the workbook dependency
// ---------------------------------------------------------------------------

/**
 * The Finance Budget Monitor workbook is a REQUIRED DEPENDENCY that is not yet
 * in the repository (Section 2). The specification is unambiguous about the
 * consequence: do not recreate its formulas from assumptions, do not fabricate
 * values, and build the structure so it can be mapped later.
 *
 * This record is surfaced in the Finance submission so the gap is visible to
 * Finance and to an administrator, rather than being a silent gap in a
 * codebase that appears complete. It is a statement of what is still owed, not
 * a placeholder for invented figures.
 */
export interface WorkbookDependency {
  name: string;
  expectedLocation: string;
  status: "Not Supplied" | "Supplied";
  /** What the application needs from it before mapping can be finalised. */
  requiredContent: string[];
  /** Consequence while it is outstanding. */
  impact: string;
}

export const FINANCE_WORKBOOK_DEPENDENCY: WorkbookDependency = {
  name: "Finance Budget Monitor workbook",
  expectedLocation: "To be supplied by Buhle Finance - not present in this repository",
  status: "Not Supplied",
  requiredContent: [
    "Worksheet names and their purpose",
    "Column headers for each worksheet",
    "Formulas used for totals, subtotals and derived measures",
    "Approved revenue category structure",
    "Approved budget line structure by cost centre",
    "Existing warning thresholds and the currency they are expressed in",
    "Reporting periods currently covered",
  ],
  impact:
    "The submission and import paths are built and usable today by manual entry. The workbook's own calculations have NOT been reimplemented, because doing so from assumptions would silently diverge from Buhle's approved figures. Import mapping is confirmed sheet-by-sheet once the workbook is supplied.",
};
