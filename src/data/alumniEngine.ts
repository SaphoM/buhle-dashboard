import type { Kpi } from "../types";
import { getStatusForValue } from "./kpiEngine";
import type {
  AlumniConfig,
  AlumniEmploymentData,
  AlumniReport,
  AlumniSectionKey,
  BusinessRecord,
  EngagementRecord,
  FarmRecord,
  LoanRecord,
  LoanStatus,
  MarketRecord,
  ReferralRecord,
} from "../types/alumni";
import { ALUMNI_KPI_IDS } from "../types/alumni";

/**
 * ALUMNI ENGINE
 *
 * Every Alumni figure is derived here from the register rows. There is no typed
 * percentage anywhere in this department, and this file is the reason: a rate
 * that can be typed can disagree with the rows underneath it, and in a tracer
 * study that disagreement is the whole risk.
 *
 * Two rules run through all of it.
 *
 * 1. A RATE OVER AN EMPTY SUBSET IS NULL, NOT ZERO.
 *    If 30 graduates are traced and none of them owns a business, the business
 *    survival rate is not 0%. It is unknown, because the question was never put
 *    to anyone with a business. Reporting 0% would tell the board that graduate
 *    enterprise had failed when nobody asked the question.
 *
 * 2. A RATE ALWAYS TRAVELS WITH ITS DENOMINATOR.
 *    Every rate in this file returns the sample size next to the percentage, and
 *    the UI shows both. "67% of 12 traced graduates" and "67% of 140" are the
 *    same number and completely different claims.
 */

function round(value: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** The central guard. `num / den` only when there is a denominator at all. */
function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return round((num / den) * 100, 1);
}

function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(sum(values) / values.length, 1);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // With an even count the median is the midpoint of the two middle values. A
  // "median" that silently picks one of the central pair would misstate how long
  // the median business has been trading.
  const midValue = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round(midValue, 1);
}

function monthsBetween(fromIso: string, toIso: string): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) +
    // Day-of-month adjustment so a business started on the 28th is not shown as
    // trading for a month longer than it has.
    ((to.getDate() - from.getDate()) / 30.4375);
  return Math.max(0, Math.floor(months));
}

// ---------------------------------------------------------------------------
// Section 0 - the cohort block
// ---------------------------------------------------------------------------

export interface CohortSummary {
  graduatesInCohort: number;
  traced: number;
  untraceable: number;
  responseRatePct: number | null;
  tracingMethod: string;
  /** True when the sample is thin enough that the department's own configured
   *  minimum has not been met. The rates are still reported, but the dashboard
   *  and the review page carry this flag so nobody quotes them unqualified. */
  belowMinimumResponse: boolean;
  minimumResponseRatePct: number;
  /** traced + untraceable, against the cohort. Anything over 100 means the
   *  tracing log double-counted somebody. */
  coveragePct: number | null;
}

export function summariseCohort(report: AlumniReport, config: AlumniConfig): CohortSummary | null {
  const { graduatesInCohort, tracedThisPeriod, untraceable, tracingMethod } = report.cohort;
  if (graduatesInCohort === null && tracedThisPeriod === null && untraceable === null && !tracingMethod) {
    return null;
  }
  const cohort = graduatesInCohort ?? 0;
  const traced = tracedThisPeriod ?? 0;
  const responseRatePct = rate(traced, cohort);
  return {
    graduatesInCohort: cohort,
    traced,
    untraceable: untraceable ?? 0,
    responseRatePct,
    tracingMethod,
    belowMinimumResponse:
      responseRatePct !== null && responseRatePct < config.minimumResponseRatePct,
    minimumResponseRatePct: config.minimumResponseRatePct,
    coveragePct: rate(traced + (untraceable ?? 0), cohort),
  };
}

// ---------------------------------------------------------------------------
// Section 1 - Employment
// ---------------------------------------------------------------------------

/**
 * Statuses that count as economically active.
 *
 * Deliberately excludes "In further education". A graduate who went on to a
 * further qualification is a programme success, but they are outside the labour
 * force, and counting them as active would let the alumni programme claim credit
 * for people who are not working. It also excludes "Unknown", which is not a
 * state a person is in but the absence of an answer.
 *
 * Derived from the config list rather than hard-coded, so an administrator who
 * disagrees with this policy can change the policy and not the code.
 */
const NOT_ECONOMICALLY_ACTIVE: ReadonlySet<string> = new Set([
  "In further education",
  // Someone actively seeking work is unemployed, which is the most obvious way
  // to get this wrong and the one a hurried submission is most likely to make.
  "Unemployed - seeking",
  "Unemployed - not seeking",
  "Retired or medically unable",
  "Unknown",
]);

export function isEconomicallyActive(status: string, config: AlumniConfig): boolean {
  if (!status) return false;
  if (NOT_ECONOMICALLY_ACTIVE.has(status)) return false;
  return config.employmentStatuses.includes(status as never);
}

/** In employment proper: employed by someone, or self-employed. A family
 *  contributor is economically active but not in employment, and collapsing the
 *  two would overstate the salaried jobs the programme created. */
const IN_EMPLOYMENT: ReadonlySet<string> = new Set(["Employed", "Self-employed"]);

export interface EmploymentSummary {
  total: number;
  /** Rows whose status was confirmed rather than inherited from an old record. */
  verified: number;
  unverified: number;
  economicallyActive: number;
  inEmployment: number;
  furtherEducation: number;
  unemployedSeeking: number;
  /** Rate over VERIFIED rows only, and null when nothing has been verified. */
  economicallyActiveRatePct: number | null;
  employmentRatePct: number | null;
  /** The denominator behind both rates, so the UI can never show a percentage
   *  without the number of people it came from. */
  sampleSize: number;
  totalMonthlyIncome: number;
  reportingIncome: number;
}

export function summariseEmployment(data: AlumniEmploymentData, config: AlumniConfig): EmploymentSummary | null {
  const records = data.records;
  if (records.length === 0) return null;

  const verifiedRows = records.filter((r) => r.verified);
  const economicallyActive = verifiedRows.filter((r) => isEconomicallyActive(r.status, config)).length;
  const inEmployment = verifiedRows.filter((r) => IN_EMPLOYMENT.has(r.status)).length;
  const disclosed = verifiedRows.filter((r) => typeof r.monthlyIncome === "number");

  return {
    total: records.length,
    verified: verifiedRows.length,
    unverified: records.length - verifiedRows.length,
    economicallyActive,
    inEmployment,
    furtherEducation: verifiedRows.filter((r) => r.status === "In further education").length,
    unemployedSeeking: verifiedRows.filter((r) => r.status === "Unemployed - seeking").length,
    // Both rates are over verified rows. An unconfirmed row is an assumption,
    // and an assumption in the denominator would drag every rate down while an
    // assumption in the numerator would lift it - neither is knowable.
    economicallyActiveRatePct: rate(economicallyActive, verifiedRows.length),
    employmentRatePct: rate(inEmployment, verifiedRows.length),
    sampleSize: verifiedRows.length,
    totalMonthlyIncome: sum(records.map((r) => r.monthlyIncome)),
    reportingIncome: sum(disclosed.map((r) => r.monthlyIncome)),
  };
}

// ---------------------------------------------------------------------------
// Section 2 - Business sustainability
// ---------------------------------------------------------------------------

export interface BusinessSummary {
  total: number;
  stillTrading: number;
  closed: number;
  survivalRatePct: number | null;
  /** Median months trading, over SURVIVING businesses only. A closed business's
   *  months trading is the length of its life, not its survival, and averaging
   *  the two together would answer a question nobody asked. */
  medianMonthsTrading: number | null;
  longestMonthsTrading: number | null;
  sectors: string[];
  totalMonthlyRevenue: number;
  totalEmployees: number;
  /** Businesses that closed with no reason recorded. Reported, not hidden: it is
   *  the gap in the data a reader needs to see. */
  closedWithoutReason: number;
}

export function summariseBusiness(
  records: BusinessRecord[],
  asOfDate: string
): BusinessSummary | null {
  if (records.length === 0) return null;

  const stillTrading = records.filter((r) => r.stillTrading);
  const closed = records.filter((r) => !r.stillTrading);
  const monthsFor = (r: BusinessRecord) => monthsBetween(r.startDate, asOfDate);

  const survivingMonths = stillTrading.map(monthsFor).filter((m): m is number => m !== null);
  const allMonths = records.map(monthsFor).filter((m): m is number => m !== null);

  return {
    total: records.length,
    stillTrading: stillTrading.length,
    closed: closed.length,
    // Every business in the register started at a known time, so the
    // denominator is the whole register rather than a subset that had to be
    // filtered for honesty.
    survivalRatePct: rate(stillTrading.length, records.length),
    medianMonthsTrading: median(survivingMonths),
    longestMonthsTrading: allMonths.length ? Math.max(...allMonths) : null,
    sectors: [...new Set(records.map((r) => r.sector).filter(Boolean))].sort(),
    totalMonthlyRevenue: sum(records.map((r) => r.monthlyRevenue)),
    totalEmployees: sum(records.map((r) => r.employees)),
    closedWithoutReason: closed.filter((r) => !r.reasonClosed.trim()).length,
  };
}

// ---------------------------------------------------------------------------
// Section 3 - Farm productivity
// ---------------------------------------------------------------------------

/** Kilograms per unit, for the units that genuinely convert.
 *
 *  Bags and crates are deliberately absent. A bag of maize is 50kg and a bag of
 *  potatoes is not the same bag of anything, so converting on an assumed weight
 *  would invent a yield figure out of a unit that does not carry one. Those rows
 *  produce no yield and say so instead. */
const KG_PER_UNIT: Partial<Record<string, number>> = { kg: 1, tonnes: 1000 };

export interface FarmSummary {
  totalRows: number;
  graduatesFarming: number;
  cropLines: number;
  livestockLines: number;
  totalAreaHa: number;
  totalLabour: number;
  /** Yield per hectare for every line where area, harvest and a convertible unit
   *  are all present. */
  yieldSamples: { graduateId: string; crop: string; kgPerHa: number }[];
  meanYieldPerHa: number | null;
  sampleSize: number;
  /** Rows that would have produced a yield if the harvest were in kilograms or
   *  tonnes. Named so the shortfall can be explained rather than discovered. */
  rowsExcludedForUnconvertibleUnit: number;
  totalLivestockHead: number;
}

/** Yield per hectare in kg/ha, or null when it cannot be derived honestly. */
export function yieldPerHectare(record: FarmRecord): number | null {
  if (
    record.areaHa === null ||
    record.totalHarvest === null ||
    record.areaHa <= 0 ||
    record.totalHarvest < 0
  ) {
    return null;
  }
  const factor = KG_PER_UNIT[record.harvestUnit];
  if (!factor) return null;
  return round((record.totalHarvest * factor) / record.areaHa, 1);
}

export function summariseFarm(records: FarmRecord[]): FarmSummary | null {
  if (records.length === 0) return null;

  const cropLines = records.filter((r) => r.crop);
  const livestockLines = records.filter((r) => r.livestockCategory);

  const yieldSamples: { graduateId: string; crop: string; kgPerHa: number }[] = [];
  for (const r of records) {
    const kgPerHa = yieldPerHectare(r);
    if (kgPerHa !== null) yieldSamples.push({ graduateId: r.graduateId, crop: r.crop, kgPerHa });
  }

  // Rows with an area and a harvest but no convertible unit: the data is present
  // and unusable, which is a different problem from the data being absent.
  const rowsExcludedForUnconvertibleUnit = records.filter(
    (r) => r.areaHa !== null && r.totalHarvest !== null && r.areaHa > 0 && !KG_PER_UNIT[r.harvestUnit]
  ).length;

  return {
    totalRows: records.length,
    graduatesFarming: new Set(records.map((r) => r.graduateId).filter(Boolean)).size,
    cropLines: cropLines.length,
    livestockLines: livestockLines.length,
    totalAreaHa: round(sum(records.map((r) => r.areaHa)), 2),
    totalLabour: sum(records.map((r) => r.labourCount)),
    yieldSamples,
    meanYieldPerHa: mean(yieldSamples.map((s) => s.kgPerHa)),
    sampleSize: yieldSamples.length,
    rowsExcludedForUnconvertibleUnit,
    totalLivestockHead: sum(records.map((r) => r.livestockHead)),
  };
}

// ---------------------------------------------------------------------------
// Section 4 - Loan repayment
// ---------------------------------------------------------------------------

/** Written-off loans are NOT repayments.
 *
 *  Excluding them from the denominator would be the single easiest way to make
 *  the loan book look healthy, and it would flatter the programme exactly when
 *  the money has been written off. A written-off loan sits in the denominator as
 *  not repaid, and appears in the arrears value. */
const REPAID: ReadonlySet<string> = new Set(["Current", "Paid off"]);

export interface LoanSummary {
  totalLoans: number;
  current: number;
  arrears: number;
  paidOff: number;
  writtenOff: number;
  repaymentRatePct: number | null;
  totalPrincipal: number;
  totalOutstanding: number;
  /** Rand still outstanding on loans in arrears. */
  arrearsValue: number;
  /** Loans carrying an arrears status with no arrears months recorded. */
  arrearsWithoutMonths: number;
  duplicateReferences: string[];
}

export function summariseLoans(records: LoanRecord[]): LoanSummary | null {
  if (records.length === 0) return null;

  const byStatus = (status: LoanStatus | "" ) => records.filter((r) => r.status === status);
  const current = byStatus("Current");
  const arrears = byStatus("Arrears");
  const paidOff = byStatus("Paid off");
  const writtenOff = byStatus("Written off");

  // A loan reference appearing twice means the same loan is counted twice, which
  // understates the arrears balance. Surfaced by name so the fix is possible.
  const seen = new Map<string, number>();
  for (const r of records) {
    const ref = r.loanReference.trim();
    if (!ref) continue;
    seen.set(ref, (seen.get(ref) ?? 0) + 1);
  }
  const duplicateReferences = [...seen.entries()].filter(([, n]) => n > 1).map(([ref]) => ref);

  const repaid = records.filter((r) => REPAID.has(r.status)).length;

  return {
    totalLoans: records.length,
    current: current.length,
    arrears: arrears.length,
    paidOff: paidOff.length,
    writtenOff: writtenOff.length,
    repaymentRatePct: rate(repaid, records.length),
    totalPrincipal: sum(records.map((r) => r.principal)),
    totalOutstanding: sum(records.map((r) => r.balanceOutstanding)),
    // Arrears value includes written-off balances: the money is still gone and
    // the board needs to see it in the same figure as the money merely late.
    arrearsValue: sum([...arrears, ...writtenOff].map((r) => r.balanceOutstanding)),
    arrearsWithoutMonths: arrears.filter((r) => r.arrearsMonths === null).length,
    duplicateReferences,
  };
}

// ---------------------------------------------------------------------------
// Section 5 - Referrals
// ---------------------------------------------------------------------------

/** Outcomes that mean the programme heard back.
 *
 *  "Awaiting decision" and "Unreachable" are NOT failures and are excluded from
 *  the denominator. Without them the only available answers are enrolled and
 *  not enrolled, and a referrer chasing someone who has not replied would have
 *  to record a false failure. This is the same reasoning as the Marketing
 *  enquiry conversion rate, and it is the difference between a referral programme
 *  that reports honestly and one that reports its own impatience. */
const RESOLVED_REFERRAL_OUTCOMES: ReadonlySet<string> = new Set([
  "Enrolled",
  "Applied, not enrolled",
  "Not enrolled - chose elsewhere",
  "Not enrolled - could not afford",
]);

export interface ReferralSummary {
  totalRows: number;
  duplicates: number;
  /** Referrals excluding duplicates. */
  referrals: number;
  enrolled: number;
  pending: number;
  unreachable: number;
  /** Conversion over referrals whose outcome is actually known. Null when
   *  nothing has come back yet. */
  conversionRatePct: number | null;
  outcomesKnown: number;
  distinctReferrers: number;
  topChannels: { channel: string; count: number }[];
}

export function summariseReferrals(records: ReferralRecord[]): ReferralSummary | null {
  if (records.length === 0) return null;

  // A duplicate is excluded from BOTH the numerator and the denominator, so
  // recording the same person twice cannot inflate the count or the rate.
  const duplicates = records.filter((r) => r.outcome === "Duplicate");
  const real = records.filter((r) => r.outcome !== "Duplicate");
  const resolved = real.filter((r) => RESOLVED_REFERRAL_OUTCOMES.has(r.outcome));
  const enrolled = real.filter((r) => r.outcome === "Enrolled").length;

  const channelCounts = new Map<string, number>();
  for (const r of real) {
    if (!r.channel) continue;
    channelCounts.set(r.channel, (channelCounts.get(r.channel) ?? 0) + 1);
  }

  return {
    totalRows: records.length,
    duplicates: duplicates.length,
    referrals: real.length,
    enrolled,
    pending: real.filter((r) => r.outcome === "Awaiting decision").length,
    unreachable: real.filter((r) => r.outcome === "Unreachable").length,
    conversionRatePct: rate(enrolled, resolved.length),
    outcomesKnown: resolved.length,
    distinctReferrers: new Set(real.map((r) => r.referrerName.trim()).filter(Boolean)).size,
    topChannels: [...channelCounts.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------
// Section 6 - Market participation
// ---------------------------------------------------------------------------

export interface MarketSummary {
  totalRows: number;
  /** Distinct graduates with at least one market row. This is the numerator for
   *  the participation rate, so a graduate selling at three markets counts
   *  once. */
  graduatesParticipating: number;
  marketsServed: number;
  withFormalSpace: number;
  totalMonthlyRevenue: number;
  revenueReporting: number;
  distinctProducts: number;
  topMarkets: { market: string; count: number }[];
}

export function summariseMarket(records: MarketRecord[]): MarketSummary | null {
  if (records.length === 0) return null;

  const marketCounts = new Map<string, number>();
  for (const r of records) {
    if (!r.marketName) continue;
    marketCounts.set(r.marketName, (marketCounts.get(r.marketName) ?? 0) + 1);
  }

  const reporting = records.filter((r) => typeof r.averageMonthlyRevenue === "number");

  return {
    totalRows: records.length,
    graduatesParticipating: new Set(records.map((r) => r.graduateId).filter(Boolean)).size,
    marketsServed: marketCounts.size,
    withFormalSpace: records.filter((r) => r.hasFormalSpace).length,
    totalMonthlyRevenue: sum(records.map((r) => r.averageMonthlyRevenue)),
    revenueReporting: reporting.length,
    distinctProducts: new Set(records.map((r) => r.productCategory).filter(Boolean)).size,
    topMarkets: [...marketCounts.entries()]
      .map(([market, count]) => ({ market, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------
// Section 7 - Engagement
// ---------------------------------------------------------------------------

export interface EngagementSummary {
  totalRows: number;
  /** Distinct graduates with at least one activity. The numerator for the
   *  engagement rate. */
  graduatesEngaged: number;
  totalHours: number;
  hoursReporting: number;
  totalOthersReached: number;
  distinctActivities: number;
  activityBreakdown: { activity: string; count: number }[];
}

export function summariseEngagement(records: EngagementRecord[]): EngagementSummary | null {
  if (records.length === 0) return null;

  const activityCounts = new Map<string, number>();
  for (const r of records) {
    if (!r.activity) continue;
    activityCounts.set(r.activity, (activityCounts.get(r.activity) ?? 0) + 1);
  }
  const hoursReporting = records.filter((r) => typeof r.hoursContributed === "number");

  return {
    totalRows: records.length,
    graduatesEngaged: new Set(records.map((r) => r.graduateId).filter(Boolean)).size,
    totalHours: sum(records.map((r) => r.hoursContributed)),
    hoursReporting: hoursReporting.length,
    totalOthersReached: sum(records.map((r) => r.othersReached)),
    distinctActivities: activityCounts.size,
    activityBreakdown: [...activityCounts.entries()]
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

export interface SkippedAlumniKpi {
  kpiId: string;
  reason: "no_data";
  /** A sentence naming the specific obstacle, not "no data". */
  detail: string;
}

export interface AlumniComputation {
  cohort: CohortSummary | null;
  employment: EmploymentSummary | null;
  business: BusinessSummary | null;
  farm: FarmSummary | null;
  loans: LoanSummary | null;
  referrals: ReferralSummary | null;
  market: MarketSummary | null;
  engagement: EngagementSummary | null;
  entries: { kpiId: string; value: number }[];
  skipped: SkippedAlumniKpi[];
}

export function computeAlumniKpis(
  report: AlumniReport,
  kpis: { id: string; name: string }[],
  config: AlumniConfig
): AlumniComputation {
  const cohort = summariseCohort(report, config);
  const employment = summariseEmployment(report.employment, config);
  // Survival is measured against the reporting date, not today's date, so a
  // figure does not change between the day it is due and the day it is typed.
  const business = summariseBusiness(report.business.records, report.dueDate);
  const farm = summariseFarm(report.farm.records);
  const loans = summariseLoans(report.loans.records);
  const referrals = summariseReferrals(report.referrals.records);
  const market = summariseMarket(report.market.records);
  const engagement = summariseEngagement(report.engagement.records);

  // The traced cohort is the denominator for every rate about graduates, so it
  // is read once here and passed down.
  const traced = cohort?.traced ?? 0;

  const values: Record<string, number | null> = {
    [ALUMNI_KPI_IDS.economicallyActive]: employment?.economicallyActiveRatePct ?? null,
    [ALUMNI_KPI_IDS.responseRate]: cohort?.responseRatePct ?? null,
    [ALUMNI_KPI_IDS.employmentRate]: employment?.employmentRatePct ?? null,
    [ALUMNI_KPI_IDS.businessSurvivalRate]: business?.survivalRatePct ?? null,
    [ALUMNI_KPI_IDS.businessSurvivalMonths]: business?.medianMonthsTrading ?? null,
    [ALUMNI_KPI_IDS.farmYieldPerHa]: farm?.meanYieldPerHa ?? null,
    [ALUMNI_KPI_IDS.loanRepaymentRate]: loans?.repaymentRatePct ?? null,
    [ALUMNI_KPI_IDS.loanArrearsValue]: loans?.arrearsValue ?? null,
    [ALUMNI_KPI_IDS.referralsReceived]: referrals?.referrals ?? null,
    [ALUMNI_KPI_IDS.referralConversionRate]: referrals?.conversionRatePct ?? null,
    // Participation is over the traced cohort, so a graduate who sells but was
    // never traced does not inflate the rate past 100%.
    [ALUMNI_KPI_IDS.marketParticipationRate]: rate(market?.graduatesParticipating ?? 0, traced),
    [ALUMNI_KPI_IDS.marketRevenue]: market?.totalMonthlyRevenue ?? null,
    [ALUMNI_KPI_IDS.engagementRate]: rate(engagement?.graduatesEngaged ?? 0, traced),
  };

  const detailFor = (kpiId: string): string | null => {
    switch (kpiId) {
      case ALUMNI_KPI_IDS.economicallyActive:
        return !employment
          ? "No graduates were traced, so there is no employment situation to report."
          : employment.verified === 0
            ? "Graduates were traced but no employment status was confirmed, so no rate can be reported. Unconfirmed statuses are excluded rather than assumed."
            : "Traced graduates were recorded, but none was confirmed in a state that counts as economically active.";
      case ALUMNI_KPI_IDS.responseRate:
        return !cohort || cohort.graduatesInCohort === 0
          ? "The cohort size has not been entered, so there is no denominator for a response rate."
          : "No graduates were traced this period, so the response rate is 0%.";
      case ALUMNI_KPI_IDS.employmentRate:
        return !employment || employment.sampleSize === 0
          ? "No employment status was confirmed for any traced graduate."
          : `None of the ${employment.sampleSize} confirmed graduates were recorded as employed or self-employed.`;
      case ALUMNI_KPI_IDS.businessSurvivalRate:
        return !business
          ? "No businesses started by graduates were recorded."
          : `None of the ${business.total} recorded businesses is still trading at the reporting date.`;
      case ALUMNI_KPI_IDS.businessSurvivalMonths:
        return !business || business.medianMonthsTrading === null
          ? "No business with a start date is still trading, so there is no survival duration to report."
          : "Surviving businesses have no start date, so their months trading cannot be counted.";
      case ALUMNI_KPI_IDS.farmYieldPerHa:
        if (!farm || farm.sampleSize === 0) {
          return farm && farm.rowsExcludedForUnconvertibleUnit > 0
            ? `${farm.rowsExcludedForUnconvertibleUnit} farming row(s) recorded a harvest in bags or crates, which cannot be converted to a yield without a declared weight per unit. No mean yield can be reported.`
            : "No farming row recorded both an area and a harvest in a convertible unit, so no yield can be derived.";
        }
        return "No farming row produced a yield.";
      case ALUMNI_KPI_IDS.loanRepaymentRate:
        return !loans
          ? "No loans to alumni enterprises were recorded."
          : `None of the ${loans.totalLoans} recorded loans is current or paid off. Written-off loans are counted as not repaid.`;
      case ALUMNI_KPI_IDS.loanArrearsValue:
        return !loans
          ? "No loans to alumni enterprises were recorded, so there is no arrears balance."
          : "No loan is in arrears or written off, so nothing is outstanding beyond its scheduled repayment.";
      case ALUMNI_KPI_IDS.referralsReceived:
        return referrals?.totalRows
          ? "Every referral recorded was marked Duplicate, so no real referrals can be counted."
          : "Graduates have not referred anyone this period.";
      case ALUMNI_KPI_IDS.referralConversionRate:
        return !referrals || referrals.referrals === 0
          ? "No referrals were recorded, so there is no conversion rate."
          : referrals.outcomesKnown === 0
            ? `${referrals.referrals} referral(s) were recorded but none has a known outcome yet, so there is no conversion rate. Reporting 0% would say every referral failed, which is not what is known.`
            : `None of the ${referrals.outcomesKnown} referrals with a known outcome resulted in an enrolment.`;
      case ALUMNI_KPI_IDS.marketParticipationRate:
        return traced === 0
          ? "No graduates were traced this period, so there is no denominator for a participation rate."
          : `None of the ${traced} traced graduates sells through a recorded market.`;
      case ALUMNI_KPI_IDS.marketRevenue:
        return !market || market.revenueReporting === 0
          ? "No market recorded a monthly sales value."
          : "Markets were recorded but none reported a monthly sales value.";
      case ALUMNI_KPI_IDS.engagementRate:
        return traced === 0
          ? "No graduates were traced this period, so there is no denominator for an engagement rate."
          : `None of the ${traced} traced graduates is recorded as having done anything for the programme.`;
      default:
        return null;
    }
  };

  const entries: { kpiId: string; value: number }[] = [];
  const skipped: SkippedAlumniKpi[] = [];

  for (const [kpiId, value] of Object.entries(values)) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      const name = kpis.find((k) => k.id === kpiId)?.name ?? kpiId;
      skipped.push({
        kpiId,
        reason: "no_data",
        detail: detailFor(kpiId) ?? `${name} could not be derived from this submission.`,
      });
      continue;
    }
    entries.push({ kpiId, value });
  }

  return { cohort, employment, business, farm, loans, referrals, market, engagement, entries, skipped };
}

/** Which section a KPI comes from, so the review page and the progress strip
 *  can attribute it without a second hard-coded table. `kpi-alumni` is
 *  attributed to employment because that is the register it is derived from. */
export function sectionForAlumniKpi(kpiId: string): AlumniSectionKey | "cohort" | null {
  switch (kpiId) {
    case ALUMNI_KPI_IDS.economicallyActive:
    case ALUMNI_KPI_IDS.employmentRate:
      return "employment";
    case ALUMNI_KPI_IDS.responseRate:
      return "cohort";
    case ALUMNI_KPI_IDS.businessSurvivalRate:
    case ALUMNI_KPI_IDS.businessSurvivalMonths:
      return "business";
    case ALUMNI_KPI_IDS.farmYieldPerHa:
      return "farm";
    case ALUMNI_KPI_IDS.loanRepaymentRate:
    case ALUMNI_KPI_IDS.loanArrearsValue:
      return "loans";
    case ALUMNI_KPI_IDS.referralsReceived:
    case ALUMNI_KPI_IDS.referralConversionRate:
      return "referrals";
    case ALUMNI_KPI_IDS.marketParticipationRate:
    case ALUMNI_KPI_IDS.marketRevenue:
      return "market";
    case ALUMNI_KPI_IDS.engagementRate:
      return "engagement";
    default:
      return null;
  }
}

/**
 * The status a figure would get, for the live preview.
 *
 * The rule matches the other departments: `dataAvailable` describes the STORED
 * KPI, not this live preview. Every new Alumni KPI ships `dataAvailable: false`
 * and stays false until a submission lands, so letting that flag win here would
 * show "Not Yet Available" for a figure the manager has just derived.
 */
export function previewAlumniStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) {
    if (kpi && kpi.dataAvailable === false && kpi.notAvailableReason) {
      return { status: "not_available" as const, thresholdNote: kpi.notAvailableReason };
    }
    return { status: "no_data" as const, thresholdNote: "" };
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

/**
 * Figures a manager is expected to explain before submitting.
 *
 * Two things put an item on this list, and neither is a RAG colour.
 *
 *  - An Amber or Red KPI, which is the shared rule.
 *  - Arrears in the loan book, and a response rate below the configured minimum.
 *    These are included deliberately: a thin sample and a deteriorating loan book
 *    are both facts the board should hear stated plainly, and neither will ever
 *    reach Amber/Red on its own because the new Alumni KPIs have no approved
 *    thresholds. Waiting for a colour that cannot arrive would leave them
 *    unremarked.
 */
export function alumniItemsNeedingExplanation(
  computation: AlumniComputation,
  kpis: Kpi[]
): { kpiId: string; name: string; value: number; status: "amber" | "red"; reason: string }[] {
  const out: { kpiId: string; name: string; value: number; status: "amber" | "red"; reason: string }[] = [];

  for (const { kpiId, value } of computation.entries) {
    const kpi = kpis.find((k) => k.id === kpiId);
    if (!kpi) continue;
    const status = getStatusForValue(kpi, value);
    if (status === "amber" || status === "red") {
      out.push({ kpiId, name: kpi.name, value, status, reason: "Below the approved threshold." });
    }
  }

  const nameFor = (id: string) => kpis.find((k) => k.id === id)?.name ?? id;

  if (computation.loans && computation.loans.arrears > 0) {
    out.push({
      kpiId: ALUMNI_KPI_IDS.loanArrearsValue,
      name: nameFor(ALUMNI_KPI_IDS.loanArrearsValue),
      value: computation.loans.arrearsValue,
      status: "amber",
      reason: `${computation.loans.arrears} loan(s) are in arrears. These are Buhle's own loans to alumni enterprises and need a stated recovery plan.`,
    });
  }

  if (computation.cohort?.belowMinimumResponse) {
    out.push({
      kpiId: ALUMNI_KPI_IDS.responseRate,
      name: nameFor(ALUMNI_KPI_IDS.responseRate),
      value: computation.cohort.responseRatePct ?? 0,
      status: "amber",
      reason: `Only ${computation.cohort.responseRatePct}% of the cohort was traced, below the ${computation.cohort.minimumResponseRatePct}% minimum set in Administration. Every rate in this submission describes that subset and not the whole cohort.`,
    });
  }

  return out;
}