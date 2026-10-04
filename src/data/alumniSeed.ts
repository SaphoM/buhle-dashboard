import type {
  AlumniBusinessData,
  AlumniConfig,
  AlumniEngagementData,
  AlumniEmploymentData,
  AlumniFarmData,
  AlumniLoanData,
  AlumniMarketData,
  AlumniReferralData,
  AlumniReport,
  BusinessRecord,
  CropName,
  EmploymentRecord,
  EmploymentStatus,
  EngagementActivity,
  EngagementRecord,
  FarmRecord,
  LoanRecord,
  LoanStatus,
  LivestockCategory,
  MassUnit,
  MarketRecord,
  MarketType,
  ReferralChannel,
  ReferralOutcome,
  ReferralRecord,
  SaleFrequency,
  TracingMethod,
} from "../types/alumni";
import { ALUMNI_KPI_IDS } from "../types/alumni";
import type { Kpi } from "../types";

/**
 * Approved vocabularies, blank-record factories and the KPI templates.
 *
 * Every vocabulary the validation checks against lives here and is
 * configurable in Administration, because the derived rates are defined by
 * these lists. The economically active rate is the sharpest example: which
 * statuses count as active is a policy decision, not a coding one, and
 * hard-coding it would mean changing the meaning of a rate without anyone
 * deciding to.
 */

export const ALUMNI_DEPARTMENT = "Alumni" as const;

export const DEFAULT_EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "Employed",
  "Self-employed",
  "Contributing to family enterprise",
  "In further education",
  "Unemployed - seeking",
  "Unemployed - not seeking",
  "Retired or medically unable",
  "Unknown",
];

export const DEFAULT_BUSINESS_SECTORS = [
  "Agriculture",
  "Retail",
  "Services",
  "Manufacturing",
  "Construction",
  "Technology",
  "Transport",
  "Other",
] as const;

export const DEFAULT_CROPS: CropName[] = [
  "Maize",
  "Wheat",
  "Sorghum",
  "Sunflower",
  "Soybeans",
  "Vegetables",
  "Fruit",
  "Sugarcane",
  "Other",
];

export const DEFAULT_MASS_UNITS: MassUnit[] = ["kg", "tonnes", "bags", "crates"];

export const DEFAULT_LIVESTOCK_CATEGORIES: LivestockCategory[] = [
  "Cattle",
  "Goats",
  "Sheep",
  "Poultry",
  "Pigs",
  "Other",
];

export const DEFAULT_LOAN_STATUSES: LoanStatus[] = ["Current", "Arrears", "Paid off", "Written off"];

export const DEFAULT_REFERRAL_CHANNELS: ReferralChannel[] = [
  "Personal contact",
  "Employer",
  "Family",
  "Community group",
  "Social media",
  "Other",
];

export const DEFAULT_REFERRAL_OUTCOMES: ReferralOutcome[] = [
  "Enrolled",
  "Applied, not enrolled",
  "Not enrolled - chose elsewhere",
  "Not enrolled - could not afford",
  "Awaiting decision",
  "Unreachable",
  "Duplicate",
];

export const DEFAULT_MARKET_TYPES: MarketType[] = [
  "Formal market",
  "Street market",
  "Retail store",
  "Wholesale",
  "Online",
  "Contract buyer",
];

export const DEFAULT_SALE_FREQUENCIES: SaleFrequency[] = ["Daily", "Weekly", "Monthly", "Seasonal"];

export const DEFAULT_ENGAGEMENT_ACTIVITIES: EngagementActivity[] = [
  "Mentoring a learner",
  "Speaking at an event",
  "Attending an alumni event",
  "Running a workshop",
  "Donation",
  "Employer engagement",
  "Survey response",
  "Communication",
];

export const DEFAULT_TRACING_METHODS: Exclude<TracingMethod, "">[] = [
  "Telephone",
  "WhatsApp",
  "Email",
  "In person",
  "Registered post",
  "Third-party",
];

export const DEFAULT_PROGRAMMES = [
  "Learnership",
  "Bursary programme",
  "Internship",
  "Apprenticeship",
  "Graduate placement",
  "Short course",
];

/**
 * The response rate below which the department warns that its own sample may
 * not represent the cohort. 60% is a starting point, not a finding: it is set
 * here so an administrator can move it, and so the warning threshold is visible
 * in one place rather than buried in the engine.
 */
export const DEFAULT_MINIMUM_RESPONSE_RATE_PCT = 60;

export const DEFAULT_ALUMNI_CONFIG: AlumniConfig = {
  reportingFrequency: "6 Months After Graduation",
  currencySymbol: "R",
  employmentStatuses: DEFAULT_EMPLOYMENT_STATUSES,
  businessSectors: [...DEFAULT_BUSINESS_SECTORS],
  crops: [...DEFAULT_CROPS],
  massUnits: [...DEFAULT_MASS_UNITS],
  livestockCategories: [...DEFAULT_LIVESTOCK_CATEGORIES],
  loanStatuses: [...DEFAULT_LOAN_STATUSES],
  referralChannels: [...DEFAULT_REFERRAL_CHANNELS],
  referralOutcomes: [...DEFAULT_REFERRAL_OUTCOMES],
  marketTypes: [...DEFAULT_MARKET_TYPES],
  saleFrequencies: [...DEFAULT_SALE_FREQUENCIES],
  engagementActivities: [...DEFAULT_ENGAGEMENT_ACTIVITIES],
  tracingMethods: [...DEFAULT_TRACING_METHODS],
  minimumResponseRatePct: DEFAULT_MINIMUM_RESPONSE_RATE_PCT,
};

// ---------------------------------------------------------------------------
// Blank records
//
// Every count and amount starts as null, never zero. A null is "not known",
// which is the normal state for a tracer survey; a zero would read as "none",
// which is a claim about the world that a blank register cannot support.
// ---------------------------------------------------------------------------

export function blankEmploymentRecord(): EmploymentRecord {
  return {
    id: "",
    graduateId: "",
    status: "",
    verified: false,
    dateConfirmed: "",
    employer: "",
    jobTitle: "",
    monthlyIncome: null,
    notes: "",
  };
}

export function blankBusinessRecord(): BusinessRecord {
  return {
    id: "",
    businessName: "",
    graduateId: "",
    sector: "",
    startDate: "",
    stillTrading: true,
    reasonClosed: "",
    monthlyRevenue: null,
    employees: null,
    notes: "",
  };
}

export function blankFarmRecord(): FarmRecord {
  return {
    id: "",
    graduateId: "",
    crop: "",
    areaHa: null,
    totalHarvest: null,
    harvestUnit: "",
    livestockCategory: "",
    livestockHead: null,
    labourCount: null,
    notes: "",
  };
}

export function blankLoanRecord(): LoanRecord {
  return {
    id: "",
    loanReference: "",
    borrower: "",
    principal: null,
    balanceOutstanding: null,
    instalmentAmount: null,
    instalmentDueDate: "",
    status: "",
    arrearsMonths: null,
    lastPaymentDate: "",
    notes: "",
  };
}

export function blankReferralRecord(): ReferralRecord {
  return {
    id: "",
    referrerName: "",
    referredPersonName: "",
    programmeReferred: "",
    dateReferred: "",
    channel: "",
    outcome: "",
    outcomeDate: "",
    notes: "",
  };
}

export function blankMarketRecord(): MarketRecord {
  return {
    id: "",
    graduateId: "",
    marketName: "",
    marketType: "",
    productCategory: "",
    frequencyOfSale: "",
    averageMonthlyRevenue: null,
    hasFormalSpace: false,
    notes: "",
  };
}

export function blankEngagementRecord(): EngagementRecord {
  return {
    id: "",
    graduateId: "",
    activity: "",
    activityDate: "",
    hoursContributed: null,
    othersReached: null,
    notes: "",
  };
}

type EmptySection = { records: never[]; commentary: string; notApplicable: boolean };

function emptySection<T>(): T {
  return { records: [], commentary: "", notApplicable: false } as unknown as T;
}

export function createBlankAlumniReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: AlumniReport["frequency"];
  startDate: string;
  dueDate: string;
}): AlumniReport {
  return {
    id: `alumni-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: ALUMNI_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    cohort: {
      graduatesInCohort: null,
      tracedThisPeriod: null,
      tracingMethod: "",
      untraceable: null,
      notes: "",
    },
    employment: emptySection<AlumniEmploymentData>(),
    business: emptySection<AlumniBusinessData>(),
    farm: emptySection<AlumniFarmData>(),
    loans: emptySection<AlumniLoanData>(),
    referrals: emptySection<AlumniReferralData>(),
    market: emptySection<AlumniMarketData>(),
    engagement: emptySection<AlumniEngagementData>(),
    dataSource: { kind: "Not Submitted" },
    status: "Not Submitted",
  };
}

/** Exported for tests that need to know a blank section is genuinely empty
 *  rather than three registers with null rows in them. */
export const BLANK_SECTION: EmptySection = emptySection();

// ---------------------------------------------------------------------------
// KPI templates
// ---------------------------------------------------------------------------

function template(
  id: string,
  name: string,
  unit: Kpi["unit"],
  insight: string
): Kpi {
  return {
    id,
    name,
    department: ALUMNI_DEPARTMENT,
    unit,
    currentValue: 0,
    previousValue: 0,
    target: 0,
    // No approved limit exists for any of the new Alumni figures. Leaving these
    // null is what makes the engine report "Threshold not configured" rather
    // than dressing an invented target in a Green badge.
    greenThreshold: null,
    amberThreshold: null,
    history: [],
    measurementFrequency: "quarterly",
    owner: "Alumni Coordinator",
    insight,
    dataAvailable: false,
    notAvailableReason: "No tracer study has been submitted for this cohort yet.",
  };
}

export const ALUMNI_SUBMISSION_KPIS: Kpi[] = [
  template(
    ALUMNI_KPI_IDS.responseRate,
    "Tracer Response Rate",
    "percent",
    "Share of the cohort that answered. Every other Alumni rate is a rate over this subset, so this figure governs how far the rest can be trusted."
  ),
  template(
    ALUMNI_KPI_IDS.employmentRate,
    "Alumni in Employment",
    "percent",
    "Employed or self-employed, as a share of traced graduates."
  ),
  template(
    ALUMNI_KPI_IDS.businessSurvivalRate,
    "Business Survival Rate",
    "percent",
    "Businesses started by graduates that are still trading at the reporting date."
  ),
  template(
    ALUMNI_KPI_IDS.businessSurvivalMonths,
    "Median Months Trading",
    "months",
    "How long the median surviving business has been trading. The survival rate says how many; this says for how long."
  ),
  template(
    ALUMNI_KPI_IDS.farmYieldPerHa,
    "Mean Farm Yield per Hectare",
    "count",
    "Mean yield per hectare across farming graduates. Crops harvested in bags or crates are excluded rather than converted on an assumed bag weight."
  ),
  template(
    ALUMNI_KPI_IDS.loanRepaymentRate,
    "Loan Repayment Rate",
    "percent",
    "Share of our loans that are current or paid off. Written-off loans count as NOT repaid, because excluding them would make the book look healthier than it is."
  ),
  template(
    ALUMNI_KPI_IDS.loanArrearsValue,
    "Loan Balance in Arrears",
    "currency",
    "Rand still outstanding on loans in arrears. This is our own money and it is reported whatever it says."
  ),
  template(
    ALUMNI_KPI_IDS.referralsReceived,
    "Referrals Received",
    "count",
    "People prospective students were referred by graduates, excluding duplicates."
  ),
  template(
    ALUMNI_KPI_IDS.referralConversionRate,
    "Referral Conversion Rate",
    "percent",
    "Referred people who enrolled. Duplicates are excluded from the denominator so a rate cannot be improved by recording the same person twice."
  ),
  template(
    ALUMNI_KPI_IDS.marketParticipationRate,
    "Market Participation Rate",
    "percent",
    "Traced graduates selling through at least one market."
  ),
  template(
    ALUMNI_KPI_IDS.marketRevenue,
    "Market Sales Revenue",
    "currency",
    "Average monthly sales value reported across markets."
  ),
  template(
    ALUMNI_KPI_IDS.engagementRate,
    "Alumni Engagement Rate",
    "percent",
    "Traced graduates who did something for the programme: mentoring, speaking, donating, hosting."
  ),
];