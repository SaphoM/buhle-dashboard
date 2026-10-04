import type { ReportingFrequency } from "./index";

/**
 * ALUMNI - the graduate tracer study.
 *
 * ============================================================================
 * WHY ALUMNI IS THE HARDEST DEPARTMENT TO REPORT HONESTLY
 * ============================================================================
 *
 * Every other department in this dashboard reports on things it controls. It
 * knows how many learners it enrolled, what it spent, how many assets it owns.
 * A blank register there is an administrative failure: somebody forgot, and the
 * fix is to go and find out.
 *
 * Alumni is different, and the difference drives every design decision in this
 * file. The population is people who have left. Buhle does not know where they
 * are, whether they are working, or whether they are even alive on a given
 * afternoon. Every figure here is the output of a survey that reached some
 * fraction of a cohort, and that fraction is the single most important number
 * in the whole department.
 *
 * So the report opens with a COHORT BLOCK, not a register:
 *
 *   - graduatesInCohort: everyone who should have been asked.
 *   - tracedThisPeriod: everyone who actually answered.
 *
 * The ratio between them is the response rate, and it is reported as a KPI in
 * its own right. Every other rate in this department is a rate over the TRACED
 * subset, and the dashboard always shows that subset alongside the rate. A 90%
 * employment rate from 12 traced graduates out of a cohort of 200 is not a good
 * result; it is a very thin sample reported confidently, and this module refuses
 * to let it look like anything else.
 *
 * ============================================================================
 * WHAT IS NEVER TYPEABLE
 * ============================================================================
 *
 * There is no percentage input anywhere in this department. Not employment
 * rate, not business survival, not loan repayment, not engagement. All of them
 * are calculated from the rows below, because every one of them is a ratio of
 * two things somebody could otherwise have typed, and a typed ratio and its
 * register can disagree.
 *
 * The pre-existing KPI, `kpi-alumni` (Alumni Economically Active Rate, 64%,
 * green 68 / amber 55), is the one that matters most here. It ships in the demo
 * data with approved thresholds and no Alumni risk yet depends on it, so its id
 * and limits are preserved and it becomes a derived figure rather than a typed
 * one.
 */

// ---------------------------------------------------------------------------
// Section 0 - The cohort block: the denominator for everything else
// ---------------------------------------------------------------------------

/** How contact was made. Recorded because a 30% response rate reached by
 *  WhatsApp and a 30% response rate reached by registered post are different
 *  facts about how much the sample can be trusted. */
export type TracingMethod = "Telephone" | "WhatsApp" | "Email" | "In person" | "Registered post" | "Third-party" | "";

export interface AlumniCohortBlock {
  /** Everyone in this cohort who was due to be traced. The denominator of the
   *  response rate, and the figure every other rate is reported against. */
  graduatesInCohort: number | null;
  /** How many were reached and gave usable answers this period. */
  tracedThisPeriod: number | null;
  /** How contact was attempted. */
  tracingMethod: TracingMethod;
  /** How many could not be contacted at all, for any reason. Null means "not
   *  counted", which is different from zero and is never read as zero. */
  untraceable: number | null;
  /** Free note on the tracing exercise itself, e.g. a contact list that had
   *  gone stale. */
  notes: string;
}

// ---------------------------------------------------------------------------
// Section 1 - Employment
// ---------------------------------------------------------------------------

/**
 * What a graduate is doing, from the point of view of whether they are
 * economically active.
 *
 * The vocabulary is closed because the rate is derived from it, exactly as the
 * Marketing enquiry outcomes are. "In further education" is deliberately NOT
 * economically active: a student is outside the labour force, and counting
 * them would let a full-time study programme report as employment.
 */
export type EmploymentStatus =
  | "Employed"
  | "Self-employed"
  | "Contributing to family enterprise"
  | "In further education"
  | "Unemployed - seeking"
  | "Unemployed - not seeking"
  | "Retired or medically unable"
  | "Unknown";

/** One row per traced graduate's employment situation. */
export interface EmploymentRecord {
  id: string;
  /** The graduate this row describes. Referenced by the farm, market and
   *  engagement registers, so a person cannot quietly appear in those without
   *  appearing here. */
  graduateId: string;
  status: EmploymentStatus | "";
  /** Whether the position was confirmed with the graduate rather than assumed
   *  from an old record. An unconfirmed row is excluded from the reportable
   *  rate, because a two-year-old "Employed" is an assumption, not a fact. */
  verified: boolean;
  /** ISO date the status was confirmed. */
  dateConfirmed: string;
  /** Employer or trading name. Blank when unemployed or not seeking. */
  employer: string;
  jobTitle: string;
  /** Monthly earnings in rand. Null means not disclosed, which is common and is
   *  not a zero. */
  monthlyIncome: number | null;
  notes: string;
}

export interface AlumniEmploymentData {
  records: EmploymentRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 2 - Business sustainability
// ---------------------------------------------------------------------------

export type BusinessSector =
  | "Agriculture"
  | "Retail"
  | "Services"
  | "Manufacturing"
  | "Construction"
  | "Technology"
  | "Transport"
  | "Other";

/** One row per business a graduate has started.
 *
 *  A business that started before this reporting window and is still trading is
 *  correctly reported here. Like a partnership, a trading business is a
 *  standing position rather than a period flow, so it is not window-checked and
 *  rejecting it would push a real, surviving business out of the register it is
 *  supposed to appear in. */
export interface BusinessRecord {
  id: string;
  /** Business or trading name. */
  businessName: string;
  graduateId: string;
  sector: BusinessSector | "";
  /** ISO date trading began. The denominator of the survival months. */
  startDate: string;
  /** Whether it is still trading at the reporting date. */
  stillTrading: boolean;
  /** Why it stopped, required when stillTrading is false. */
  reasonClosed: string;
  /** Average monthly revenue in rand. Null means not recorded or not
   *  disclosed. */
  monthlyRevenue: number | null;
  /** People employed, including the owner. Null means unknown. */
  employees: number | null;
  notes: string;
}

export interface AlumniBusinessData {
  records: BusinessRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 3 - Farm productivity
// ---------------------------------------------------------------------------

export type CropName =
  | "Maize"
  | "Wheat"
  | "Sorghum"
  | "Sunflower"
  | "Soybeans"
  | "Vegetables"
  | "Fruit"
  | "Sugarcane"
  | "Other";

/** Mass units. Tonnes convert to kilograms; bags deliberately do not.
 *
 *  Yield per hectare is only meaningful when the numerator and the denominator
 *  are in the same family, and a bag is not a fixed mass without a declared
 *  bag weight. So a harvest recorded in bags produces no yield figure and says
 *  why, rather than assuming 50kg and quietly inventing a number. */
export type MassUnit = "kg" | "tonnes" | "bags" | "crates";

export type LivestockCategory = "Cattle" | "Goats" | "Sheep" | "Poultry" | "Pigs" | "Other";

/** One row per farm a graduate operates, per crop or livestock line. */
export interface FarmRecord {
  id: string;
  graduateId: string;
  /** Crop, or blank for a livestock-only line. */
  crop: CropName | "";
  /** Area under this crop in hectares. Required for a yield figure. */
  areaHa: number | null;
  /** Total harvest. Required for a yield figure. */
  totalHarvest: number | null;
  /** Unit the harvest was weighed in. */
  harvestUnit: MassUnit | "";
  /** Livestock category, or blank for a crop line. */
  livestockCategory: LivestockCategory | "";
  /** Head of livestock. */
  livestockHead: number | null;
  /** People working the land, including the owner. */
  labourCount: number | null;
  notes: string;
}

export interface AlumniFarmData {
  records: FarmRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 4 - Loan repayment
// ---------------------------------------------------------------------------

export type LoanStatus = "Current" | "Arrears" | "Paid off" | "Written off";

/**
 * One row per loan Buhle issued to an alumnus.
 *
 * These are OUR loans, so the register is the organisation's own book rather
 * than something an alumnus is telling us about a third party. That is why the
 * balance, the instalment and the arrears history are recorded rather than a
 * simple yes/no repayment flag.
 */
export interface LoanRecord {
  id: string;
  /** Our own loan reference. Duplicates are rejected: the same loan counted
   *  twice would understate the arrears balance. */
  loanReference: string;
  /** The graduate who borrowed, or the business the loan funded. */
  borrower: string;
  /** Original amount advanced, in rand. */
  principal: number | null;
  /** What is still owed, in rand. */
  balanceOutstanding: number | null;
  /** Agreed monthly instalment, in rand. */
  instalmentAmount: number | null;
  /** ISO date the next instalment falls due. */
  instalmentDueDate: string;
  status: LoanStatus | "";
  /** How many months behind the loan is, required while in arrears. */
  arrearsMonths: number | null;
  /** ISO date of the last payment received. */
  lastPaymentDate: string;
  notes: string;
}

export interface AlumniLoanData {
  records: LoanRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 5 - Referrals
// ---------------------------------------------------------------------------

/** Where a referral came from. The channel is recorded because a referral from
 *  a satisfied graduate and one from a payroll flyer are different evidence. */
export type ReferralChannel = "Personal contact" | "Employer" | "Family" | "Community group" | "Social media" | "Other";

/** What became of the person who was referred.
 *
 *  "Awaiting decision" and "Unreachable" exist so a referrer has somewhere
 *  honest to record a contact who has not answered. Without them the only
 *  available answers are success and failure, and a real referral programme
 *  would then record false failures. */
export type ReferralOutcome =
  | "Enrolled"
  | "Applied, not enrolled"
  | "Not enrolled - chose elsewhere"
  | "Not enrolled - could not afford"
  | "Awaiting decision"
  | "Unreachable"
  | "Duplicate";

/** One row per person an alumnus referred. */
export interface ReferralRecord {
  id: string;
  /** The alumnus who referred them. */
  referrerName: string;
  /** The person referred. */
  referredPersonName: string;
  /** The programme they were interested in. */
  programmeReferred: string;
  /** ISO date the referral was made. */
  dateReferred: string;
  channel: ReferralChannel | "";
  outcome: ReferralOutcome | "";
  /** ISO date the outcome became known. */
  outcomeDate: string;
  notes: string;
}

export interface AlumniReferralData {
  records: ReferralRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 6 - Market participation
// ---------------------------------------------------------------------------

export type MarketType = "Formal market" | "Street market" | "Retail store" | "Wholesale" | "Online" | "Contract buyer";

export type SaleFrequency = "Daily" | "Weekly" | "Monthly" | "Seasonal";

/** One row per market a graduate sells through. */
export interface MarketRecord {
  id: string;
  graduateId: string;
  /** Market, stall or buyer name. */
  marketName: string;
  marketType: MarketType | "";
  /** What is sold there. */
  productCategory: string;
  /** How often sales happen. */
  frequencyOfSale: SaleFrequency | "";
  /** Average monthly sales value in rand. Null means not recorded. */
  averageMonthlyRevenue: number | null;
  /** Whether the graduate holds a formal stand or licence at this market. */
  hasFormalSpace: boolean;
  notes: string;
}

export interface AlumniMarketData {
  records: MarketRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Section 7 - Engagement
// ---------------------------------------------------------------------------

export type EngagementActivity =
  | "Mentoring a learner"
  | "Speaking at an event"
  | "Attending an alumni event"
  | "Running a workshop"
  | "Donation"
  | "Employer engagement"
  | "Survey response"
  | "Communication";

/** One row per engagement activity.
 *
 *  Engagement is what an alumnus does FOR the programme, not what they receive
 *  from it, which is why mentoring and donations sit in the same register as
 *  attending an event. */
export interface EngagementRecord {
  id: string;
  graduateId: string;
  activity: EngagementActivity | "";
  /** ISO date the activity happened. */
  activityDate: string;
  /** Hours the alumnus contributed. Null means not tracked, which is common for
   *  a survey response and must not read as zero. */
  hoursContributed: number | null;
  /** Other graduates or learners the activity reached. */
  othersReached: number | null;
  notes: string;
}

export interface AlumniEngagementData {
  records: EngagementRecord[];
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const ALUMNI_SECTION_KEYS = [
  "employment",
  "business",
  "farm",
  "loans",
  "referrals",
  "market",
  "engagement",
] as const;

export type AlumniSectionKey = (typeof ALUMNI_SECTION_KEYS)[number];

export const ALUMNI_SECTION_LABELS: Record<AlumniSectionKey, string> = {
  employment: "Employment",
  business: "Business Sustainability",
  farm: "Farm Productivity",
  loans: "Loan Repayment",
  referrals: "Referrals",
  market: "Market Participation",
  engagement: "Engagement",
};

/** One-line explanation shown on each section tab, so a manager knows what the
 *  register is for before opening it. */
export const ALUMNI_SECTION_PURPOSE: Record<AlumniSectionKey, string> = {
  employment: "What each traced graduate is doing, and whether it counts as economically active.",
  business: "Businesses started by graduates, and whether they are still trading.",
  farm: "Farms run by graduates, measured by yield per hectare rather than by feeling.",
  loans: "Our own loans to alumni enterprises, and what is still outstanding.",
  referrals: "Prospective students referred by graduates, and what became of them.",
  market: "Where graduates sell, and how much they sell for.",
  engagement: "What graduates do for the programme: mentoring, events, donations.",
};

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/** "Not Submitted" is the honest initial state. A report that has never been
 *  filled in must not present as a survey that was carried out, because a reader
 *  would assume somebody phoned every graduate on the list. */
export type AlumniReportStatus = "Not Submitted" | "Draft" | "Submitted";

export type AlumniSourceKind = "Manual Entry" | "Not Submitted";

export interface AlumniDataSource {
  kind: AlumniSourceKind;
  enteredAt?: string;
  enteredBy?: string;
}

export interface AlumniReport {
  id: string;
  cycleId: string;
  department: "Alumni";
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  /** The denominator block. Not a register, because it applies to every one of
   *  them. */
  cohort: AlumniCohortBlock;
  employment: AlumniEmploymentData;
  business: AlumniBusinessData;
  farm: AlumniFarmData;
  loans: AlumniLoanData;
  referrals: AlumniReferralData;
  market: AlumniMarketData;
  engagement: AlumniEngagementData;
  dataSource: AlumniDataSource;
  status: AlumniReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AlumniConfig {
  /** Cadence of the Alumni cycle. Tracer studies run on the cohort's
   *  post-graduation schedule rather than the calendar. */
  reportingFrequency: ReportingFrequency;
  currencySymbol: string;
  /** Approved employment statuses. The economically active rate is derived from
   *  this list, so adding a status here changes what counts as active. */
  employmentStatuses: EmploymentStatus[];
  /** Approved business sectors. */
  businessSectors: BusinessSector[];
  /** Approved crops. */
  crops: CropName[];
  /** Approved mass units for a harvest. */
  massUnits: MassUnit[];
  /** Approved livestock categories. */
  livestockCategories: LivestockCategory[];
  /** Approved loan states. The repayment rate is derived from this list. */
  loanStatuses: LoanStatus[];
  /** Approved referral channels. */
  referralChannels: ReferralChannel[];
  /** Approved referral outcomes. */
  referralOutcomes: ReferralOutcome[];
  /** Approved market types. */
  marketTypes: MarketType[];
  /** How often a graduate sells at a market. */
  saleFrequencies: SaleFrequency[];
  /** Approved engagement activities. */
  engagementActivities: EngagementActivity[];
  /** Tracing methods, so the sample's reliability can be read. */
  tracingMethods: Exclude<TracingMethod, "">[];
  /**
   * The response rate below which a rate is presented with an explicit warning
   * that the sample may not represent the cohort. This is a policy threshold
   * rather than a KPI threshold: it does not raise an Early Warning, it governs
   * how boldly the department is allowed to present its own numbers.
   */
  minimumResponseRatePct: number;
}

// ---------------------------------------------------------------------------
// KPI ids
// ---------------------------------------------------------------------------

/** The KPI ids this department owns. Named once so the seed, the engine, the
 *  modal and the tests cannot drift apart. */
export const ALUMNI_KPI_IDS = {
  /** Pre-existing. Carried through with its approved thresholds intact. */
  economicallyActive: "kpi-alumni",
  responseRate: "kpi-alumni-response-rate",
  employmentRate: "kpi-alumni-employment-rate",
  businessSurvivalRate: "kpi-business-survival-rate",
  businessSurvivalMonths: "kpi-business-survival-months",
  farmYieldPerHa: "kpi-farm-yield-per-ha",
  loanRepaymentRate: "kpi-loan-repayment-rate",
  loanArrearsValue: "kpi-loan-arrears-value",
  referralsReceived: "kpi-referrals-received",
  referralConversionRate: "kpi-referral-conversion-rate",
  marketParticipationRate: "kpi-market-participation-rate",
  marketRevenue: "kpi-market-revenue",
  engagementRate: "kpi-alumni-engagement-rate",
} as const satisfies Record<string, string>;

export type AlumniKpiId = (typeof ALUMNI_KPI_IDS)[keyof typeof ALUMNI_KPI_IDS];