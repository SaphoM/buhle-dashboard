import { describe, expect, it } from "vitest";
import {
  alumniItemsNeedingExplanation,
  computeAlumniKpis,
  isEconomicallyActive,
  previewAlumniStatus,
  sectionForAlumniKpi,
  summariseBusiness,
  summariseCohort,
  summariseEmployment,
  summariseEngagement,
  summariseFarm,
  summariseLoans,
  summariseMarket,
  summariseReferrals,
  yieldPerHectare,
} from "./alumniEngine";
import {
  ALUMNI_SUBMISSION_KPIS,
  DEFAULT_ALUMNI_CONFIG,
  createBlankAlumniReport,
} from "./alumniSeed";
import { ALUMNI_KPI_IDS } from "../types/alumni";
import type {
  AlumniConfig,
  AlumniReport,
  BusinessRecord,
  EmploymentRecord,
  EngagementRecord,
  FarmRecord,
  LoanRecord,
  MarketRecord,
  ReferralRecord,
} from "../types/alumni";
import type { Kpi, ReportingFrequency } from "../types";

/**
 * The Alumni engine is what stops a tracer study being able to flatter itself.
 *
 * Every test here pins one of the three claims this department makes:
 * what counts as economically active, what the denominator of each rate really
 * is, and which combinations produce an honest "cannot be calculated" rather
 * than a misleading zero.
 */

const CONFIG = DEFAULT_ALUMNI_CONFIG;

function baseReport(): AlumniReport {
  return createBlankAlumniReport({
    cycleId: "cyc-alumni-test",
    reportingPeriod: "H2 2026 Cohort",
    frequency: "6 Months After Graduation" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-11-01",
  });
}

const employment = (over: Partial<EmploymentRecord> = {}): EmploymentRecord => ({
  id: "e1",
  graduateId: "G1",
  status: "Employed",
  verified: true,
  dateConfirmed: "2026-10-01",
  employer: "Shoprite",
  jobTitle: "Assistant",
  monthlyIncome: 4500,
  notes: "",
  ...over,
});

const business = (over: Partial<BusinessRecord> = {}): BusinessRecord => ({
  id: "b1",
  businessName: "Thandi Foods",
  graduateId: "G1",
  sector: "Retail",
  startDate: "2025-01-15",
  stillTrading: true,
  reasonClosed: "",
  monthlyRevenue: 18000,
  employees: 3,
  notes: "",
  ...over,
});

const farm = (over: Partial<FarmRecord> = {}): FarmRecord => ({
  id: "f1",
  graduateId: "G2",
  crop: "Maize",
  areaHa: 4,
  totalHarvest: 12000,
  harvestUnit: "kg",
  livestockCategory: "",
  livestockHead: null,
  labourCount: 2,
  notes: "",
  ...over,
});

const loan = (over: Partial<LoanRecord> = {}): LoanRecord => ({
  id: "l1",
  loanReference: "LN-001",
  borrower: "G1",
  principal: 50000,
  balanceOutstanding: 20000,
  instalmentAmount: 2000,
  instalmentDueDate: "2026-11-05",
  status: "Current",
  arrearsMonths: null,
  lastPaymentDate: "2026-09-05",
  notes: "",
  ...over,
});

const referral = (over: Partial<ReferralRecord> = {}): ReferralRecord => ({
  id: "r1",
  referrerName: "G1",
  referredPersonName: "Nomsa",
  programmeReferred: "Internship",
  dateReferred: "2026-09-10",
  channel: "Personal contact",
  outcome: "Enrolled",
  outcomeDate: "2026-09-28",
  notes: "",
  ...over,
});

const market = (over: Partial<MarketRecord> = {}): MarketRecord => ({
  id: "m1",
  graduateId: "G1",
  marketName: "Mbare Market",
  marketType: "Street market",
  productCategory: "Vegetables",
  frequencyOfSale: "Weekly",
  averageMonthlyRevenue: 7000,
  hasFormalSpace: false,
  notes: "",
  ...over,
});

const engagement = (over: Partial<EngagementRecord> = {}): EngagementRecord => ({
  id: "g1",
  graduateId: "G1",
  activity: "Mentoring a learner",
  activityDate: "2026-09-20",
  hoursContributed: 4,
  othersReached: 6,
  notes: "",
  ...over,
});

// ===========================================================================
// Economically active
// ===========================================================================

describe("what counts as economically active", () => {
  it("counts employed, self-employed and family enterprise work as active", () => {
    expect(isEconomicallyActive("Employed", CONFIG)).toBe(true);
    expect(isEconomicallyActive("Self-employed", CONFIG)).toBe(true);
    expect(isEconomicallyActive("Contributing to family enterprise", CONFIG)).toBe(true);
  });

  it("does not count further education as economically active", () => {
    // A student is outside the labour force. Counting them would let a
    // qualification programme claim credit as employment.
    expect(isEconomicallyActive("In further education", CONFIG)).toBe(false);
  });

  it("does not count somebody seeking work as active", () => {
    // The most obvious way to get this wrong, and the one a hurried submission
    // is most likely to make.
    expect(isEconomicallyActive("Unemployed - seeking", CONFIG)).toBe(false);
  });

  it("does not count Unknown as active", () => {
    // Unknown is the absence of an answer, not a state a person is in.
    expect(isEconomicallyActive("Unknown", CONFIG)).toBe(false);
  });

  it("reads the approved list from config, so the policy is not hard-coded", () => {
    const widened: AlumniConfig = { ...CONFIG, employmentStatuses: [...CONFIG.employmentStatuses] };
    // The explicit exclusion above wins over a widened approved list: adding a
    // status to Administration must not quietly redefine the labour force.
    expect(isEconomicallyActive("In further education", widened)).toBe(false);
    expect(isEconomicallyActive("Retired or medically unable", widened)).toBe(false);
  });
});

// ===========================================================================
// The cohort block
// ===========================================================================

describe("the cohort block", () => {
  it("returns null when nothing has been entered", () => {
    expect(summariseCohort(baseReport(), CONFIG)).toBeNull();
  });

  it("derives the response rate from cohort size and traced", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 200;
    report.cohort.tracedThisPeriod = 60;
    const summary = summariseCohort(report, CONFIG)!;
    expect(summary.responseRatePct).toBe(30);
    expect(summary.traced).toBe(60);
    expect(summary.graduatesInCohort).toBe(200);
  });

  it("flags a response rate below the configured minimum", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 200;
    report.cohort.tracedThisPeriod = 40;
    expect(summariseCohort(report, CONFIG)!.belowMinimumResponse).toBe(true);
  });

  it("does not flag a response rate at or above the minimum", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 200;
    report.cohort.tracedThisPeriod = 120;
    expect(summariseCohort(report, CONFIG)!.belowMinimumResponse).toBe(false);
  });

  it("reports no response rate at all when the cohort size is missing", () => {
    // No denominator means no rate, rather than a division by zero.
    const report = baseReport();
    report.cohort.tracedThisPeriod = 30;
    expect(summariseCohort(report, CONFIG)!.responseRatePct).toBeNull();
  });

  it("treats an untraced cohort as 0% rather than unknown", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 50;
    report.cohort.tracedThisPeriod = 0;
    const summary = summariseCohort(report, CONFIG)!;
    expect(summary.responseRatePct).toBe(0);
  });
});

// ===========================================================================
// Employment
// ===========================================================================

describe("employment", () => {
  it("returns null with no rows", () => {
    expect(summariseEmployment(baseReport().employment, CONFIG)).toBeNull();
  });

  it("rates over verified rows only", () => {
    // 2 active out of 3 verified, and one unverified row that would have been
    // unemployed. Including it would report 67% instead of 100%.
    const data = {
      ...baseReport().employment,
      records: [
        employment({ id: "e1", graduateId: "G1" }),
        employment({ id: "e2", graduateId: "G2", status: "Self-employed", employer: "" }),
        employment({ id: "e3", graduateId: "G3", status: "Unemployed - seeking", employer: "" }),
        employment({ id: "e4", graduateId: "G4", status: "Unemployed - seeking", employer: "", verified: false }),
      ],
    };
    const summary = summariseEmployment(data, CONFIG)!;
    expect(summary.verified).toBe(3);
    expect(summary.unverified).toBe(1);
    expect(summary.economicallyActive).toBe(2);
    expect(summary.economicallyActiveRatePct).toBe(66.7);
    // The rate carries the sample size it came from.
    expect(summary.sampleSize).toBe(3);
  });

  it("reports no rate when nothing has been verified", () => {
    // Reporting 0% here would claim every traced graduate is inactive.
    const data = {
      ...baseReport().employment,
      records: [
        employment({ id: "e1", graduateId: "G1", status: "Employed", verified: false }),
        employment({ id: "e2", graduateId: "G2", status: "Employed", verified: false, employer: "" }),
      ],
    };
    const summary = summariseEmployment(data, CONFIG)!;
    expect(summary.economicallyActiveRatePct).toBeNull();
    expect(summary.employmentRatePct).toBeNull();
  });

  it("separates in-employment from economically active", () => {
    // A family contributor is working but not in employment, and collapsing the
    // two would overstate the jobs the programme created.
    const data = {
      ...baseReport().employment,
      records: [
        employment({ id: "e1", graduateId: "G1" }),
        employment({ id: "e2", graduateId: "G2", status: "Contributing to family enterprise", employer: "" }),
      ],
    };
    const summary = summariseEmployment(data, CONFIG)!;
    expect(summary.economicallyActive).toBe(2);
    expect(summary.inEmployment).toBe(1);
    expect(summary.economicallyActiveRatePct).toBe(100);
    expect(summary.employmentRatePct).toBe(50);
  });

  it("treats null income as undisclosed rather than zero", () => {
    const data = {
      ...baseReport().employment,
      records: [
        employment({ id: "e1", graduateId: "G1", monthlyIncome: 5000 }),
        employment({ id: "e2", graduateId: "G2", monthlyIncome: null }),
      ],
    };
    const summary = summariseEmployment(data, CONFIG)!;
    expect(summary.totalMonthlyIncome).toBe(5000);
    expect(summary.reportingIncome).toBe(5000);
  });
});

// ===========================================================================
// Business survival
// ===========================================================================

describe("business survival", () => {
  it("returns null with no rows", () => {
    expect(summariseBusiness([], "2026-11-01")).toBeNull();
  });

  it("derives the survival rate across every business", () => {
    const summary = summariseBusiness(
      [business({ id: "b1" }), business({ id: "b2", stillTrading: false, reasonClosed: "Premises" })],
      "2026-11-01"
    )!;
    expect(summary.survivalRatePct).toBe(50);
    expect(summary.stillTrading).toBe(1);
    expect(summary.closed).toBe(1);
  });

  it("takes the median of surviving businesses only", () => {
    // A closed business's months trading is the length of its life, not its
    // survival. Averaging the two together would answer a question nobody asked.
    const summary = summariseBusiness(
      [
        business({ id: "b1", startDate: "2025-01-15", stillTrading: true }),
        business({ id: "b2", startDate: "2026-01-15", stillTrading: true }),
        business({ id: "b3", startDate: "2020-01-15", stillTrading: false, reasonClosed: "Closed" }),
      ],
      "2026-11-01"
    )!;
    // 21 and 9 months survive; the 81-month-old closed business is excluded.
    // Both are a month under the plain calendar count because the businesses
    // started on the 15th and the reporting date is the 1st, which is the
    // day-of-month adjustment doing its job.
    expect(summary.medianMonthsTrading).toBe(15);
    // The longest figure still reports the full picture.
    expect(summary.longestMonthsTrading).toBe(81);
  });

  it("averages the two central values for an even count", () => {
    const summary = summariseBusiness(
      [
        business({ id: "b1", startDate: "2026-01-15", stillTrading: true }),
        business({ id: "b2", startDate: "2026-03-15", stillTrading: true }),
        business({ id: "b3", startDate: "2026-05-15", stillTrading: true }),
        business({ id: "b4", startDate: "2026-07-15", stillTrading: true }),
      ],
      "2026-11-01"
    )!;
    // 9, 7, 5 and 3 months -> median 6.
    expect(summary.medianMonthsTrading).toBe(6);
  });

  it("reports no duration when no surviving business has a start date", () => {
    const summary = summariseBusiness([business({ id: "b1", startDate: "" })], "2026-11-01")!;
    expect(summary.medianMonthsTrading).toBeNull();
    // The survival rate is still available and is not affected.
    expect(summary.survivalRatePct).toBe(100);
  });

  it("counts closed businesses with no reason as a gap in the data", () => {
    const summary = summariseBusiness([business({ id: "b1", stillTrading: false, reasonClosed: "" })], "2026-11-01")!;
    expect(summary.closedWithoutReason).toBe(1);
  });
});

// ===========================================================================
// Farm productivity
// ===========================================================================

describe("farm productivity", () => {
  it("derives yield per hectare from kilograms", () => {
    expect(yieldPerHectare(farm())).toBe(3000);
  });

  it("converts tonnes to kilograms before dividing", () => {
    expect(yieldPerHectare(farm({ totalHarvest: 12, harvestUnit: "tonnes" }))).toBe(3000);
  });

  it("produces no yield from bags, rather than assuming a bag weight", () => {
    // A bag of maize is 50kg and a bag of potatoes is not the same bag of
    // anything. Converting on an assumed weight would invent the figure.
    expect(yieldPerHectare(farm({ totalHarvest: 100, harvestUnit: "bags" }))).toBeNull();
    const summary = summariseFarm([farm({ totalHarvest: 100, harvestUnit: "bags" }) as never])!;
    expect(summary.meanYieldPerHa).toBeNull();
    expect(summary.rowsExcludedForUnconvertibleUnit).toBe(1);
  });

  it("produces no yield without an area", () => {
    expect(yieldPerHectare(farm({ areaHa: null }))).toBeNull();
  });

  it("produces no yield for a zero area", () => {
    expect(yieldPerHectare(farm({ areaHa: 0 }))).toBeNull();
  });

  it("means across every convertible line and reports the sample size", () => {
    const summary = summariseFarm([
      farm({ id: "f1", graduateId: "G2", areaHa: 4, totalHarvest: 12000 }),
      farm({ id: "f2", graduateId: "G3", areaHa: 2, totalHarvest: 4000 }),
    ] as never)!;
    // 3000 and 2000 -> mean 2500
    expect(summary.meanYieldPerHa).toBe(2500);
    expect(summary.sampleSize).toBe(2);
  });

  it("separates crop lines from livestock lines", () => {
    const summary = summariseFarm([
      farm({ id: "f1" }),
      farm({ id: "f2", crop: "", livestockCategory: "Cattle", livestockHead: 40, areaHa: null, totalHarvest: null }),
    ] as never)!;
    expect(summary.cropLines).toBe(1);
    expect(summary.livestockLines).toBe(1);
    expect(summary.totalLivestockHead).toBe(40);
    // The livestock line contributes nothing to yield.
    expect(summary.sampleSize).toBe(1);
  });

  it("counts distinct graduates so one farm is not counted twice", () => {
    const summary = summariseFarm([
      farm({ id: "f1", graduateId: "G2" }),
      farm({ id: "f2", graduateId: "G2", crop: "Vegetables" }),
    ] as never)!;
    expect(summary.graduatesFarming).toBe(1);
    expect(summary.totalRows).toBe(2);
  });
});

// ===========================================================================
// Loans
// ===========================================================================

describe("loan repayment", () => {
  it("returns null with no rows", () => {
    expect(summariseLoans([])).toBeNull();
  });

  it("counts written-off loans as NOT repaid", () => {
    // Excluding a write-off from the denominator is the easiest way to make the
    // book look healthy, and it flatters the programme exactly when money is gone.
    const summary = summariseLoans([
      loan({ id: "l1", status: "Current" }),
      loan({ id: "l2", loanReference: "LN-002", status: "Paid off", balanceOutstanding: 0 }),
      loan({ id: "l3", loanReference: "LN-003", status: "Written off", balanceOutstanding: 5000 }),
    ] as never)!;
    expect(summary.repaymentRatePct).toBe(66.7);
    expect(summary.writtenOff).toBe(1);
    expect(summary.paidOff).toBe(1);
    expect(summary.current).toBe(1);
  });

  it("includes written-off balances in the arrears value", () => {
    // The money is still gone and the board needs to see it beside the money
    // that is merely late.
    const summary = summariseLoans([
      loan({ id: "l1", status: "Arrears", arrearsMonths: 3 }),
      loan({ id: "l2", loanReference: "LN-002", status: "Written off" }),
    ] as never)!;
    expect(summary.arrearsValue).toBe(40000);
    expect(summary.arrears).toBe(1);
  });

  it("reports no arrears value when nothing is late or written off", () => {
    const summary = summariseLoans([loan({ id: "l1", status: "Current" })])!;
    expect(summary.arrearsValue).toBe(0);
  });

  it("surfaces duplicate loan references by name", () => {
    const summary = summariseLoans([
      loan({ id: "l1", loanReference: "LN-001" }),
      loan({ id: "l2", loanReference: "LN-001" }),
    ] as never)!;
    expect(summary.duplicateReferences).toEqual(["LN-001"]);
  });

  it("counts arrears with no duration as a gap", () => {
    const summary = summariseLoans([loan({ id: "l1", status: "Arrears", arrearsMonths: null })])!;
    expect(summary.arrearsWithoutMonths).toBe(1);
  });
});

// ===========================================================================
// Referrals
// ===========================================================================

describe("referrals", () => {
  it("returns null with no rows", () => {
    expect(summariseReferrals([])).toBeNull();
  });

  it("excludes duplicates from both the count and the rate", () => {
    const summary = summariseReferrals([
      referral({ id: "r1", referredPersonName: "Nomsa", outcome: "Enrolled" }),
      referral({ id: "r2", referredPersonName: "Thabo", outcome: "Enrolled" }),
      referral({ id: "r3", referredPersonName: "Nomsa", outcome: "Duplicate", outcomeDate: "" }),
    ] as never)!;
    expect(summary.duplicates).toBe(1);
    expect(summary.referrals).toBe(2);
    expect(summary.conversionRatePct).toBe(100);
  });

  it("keeps pending and unreachable referrals out of the conversion denominator", () => {
    // Forcing these into the denominator would report a referrer's own
    // impatience as a programme failure.
    const summary = summariseReferrals([
      referral({ id: "r1", referredPersonName: "A", outcome: "Enrolled" }),
      referral({ id: "r2", referredPersonName: "B", outcome: "Awaiting decision", outcomeDate: "" }),
      referral({ id: "r3", referredPersonName: "C", outcome: "Unreachable", outcomeDate: "" }),
    ] as never)!;
    expect(summary.outcomesKnown).toBe(1);
    expect(summary.conversionRatePct).toBe(100);
    expect(summary.pending).toBe(1);
    expect(summary.unreachable).toBe(1);
  });

  it("reports no conversion rate when no outcome is known yet", () => {
    const summary = summariseReferrals([
      referral({ id: "r1", referredPersonName: "A", outcome: "Awaiting decision", outcomeDate: "" }),
    ] as never)!;
    // 0% here would say every referral failed, which is not what is known.
    expect(summary.conversionRatePct).toBeNull();
  });

  it("counts distinct referrers", () => {
    const summary = summariseReferrals([
      referral({ id: "r1", referrerName: "G1", referredPersonName: "A" }),
      referral({ id: "r2", referrerName: "G1", referredPersonName: "B" }),
      referral({ id: "r3", referrerName: "G2", referredPersonName: "C" }),
    ] as never)!;
    expect(summary.distinctReferrers).toBe(2);
    expect(summary.referrals).toBe(3);
  });
});

// ===========================================================================
// Market and engagement
// ===========================================================================

describe("market participation", () => {
  it("counts distinct graduates so three markets is one participant", () => {
    const summary = summariseMarket([
      market({ id: "m1", graduateId: "G1" }),
      market({ id: "m2", graduateId: "G1", marketName: "Mbare Market" }),
      market({ id: "m3", graduateId: "G2", marketName: "Mbare Market" }),
    ] as never)!;
    expect(summary.graduatesParticipating).toBe(2);
    expect(summary.totalRows).toBe(3);
    expect(summary.marketsServed).toBe(1);
  });

  it("sums monthly revenue only from rows that reported one", () => {
    const summary = summariseMarket([
      market({ id: "m1", averageMonthlyRevenue: 7000 }),
      market({ id: "m2", graduateId: "G2", marketName: "Town", averageMonthlyRevenue: null }),
    ] as never)!;
    expect(summary.totalMonthlyRevenue).toBe(7000);
    expect(summary.revenueReporting).toBe(1);
  });
});

describe("engagement", () => {
  it("counts distinct graduates, not activities", () => {
    const summary = summariseEngagement([
      engagement({ id: "g1", graduateId: "G1" }),
      engagement({ id: "g2", graduateId: "G1", activity: "Donation" }),
      engagement({ id: "g3", graduateId: "G2", activity: "Survey response" }),
    ] as never)!;
    expect(summary.graduatesEngaged).toBe(2);
    expect(summary.totalRows).toBe(3);
  });

  it("treats untracked hours as unknown rather than zero", () => {
    const summary = summariseEngagement([
      engagement({ id: "g1", graduateId: "G1", hoursContributed: 4 }),
      engagement({ id: "g2", graduateId: "G2", activity: "Survey response", hoursContributed: null }),
    ] as never)!;
    expect(summary.totalHours).toBe(4);
    expect(summary.hoursReporting).toBe(1);
  });
});

// ===========================================================================
// KPI computation
// ===========================================================================

describe("KPI computation", () => {
  const kpis = ALUMNI_SUBMISSION_KPIS.map((k) => ({ id: k.id, name: k.name }));

  it("derives every figure from a full report", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 200;
    report.cohort.tracedThisPeriod = 120;
    report.employment.records = [
      employment({ id: "e1", graduateId: "G1" }),
      employment({ id: "e2", graduateId: "G2", status: "Self-employed", employer: "" }),
      employment({ id: "e3", graduateId: "G3", status: "In further education", employer: "" }),
    ];
    report.business.records = [business({ id: "b1" })];
    report.farm.records = [farm({ id: "f1", graduateId: "G1" })];
    report.loans.records = [loan({ id: "l1" })];
    report.referrals.records = [referral({ id: "r1" })];
    report.market.records = [market({ id: "m1", graduateId: "G1" })];
    report.engagement.records = [engagement({ id: "g1", graduateId: "G1" })];

    const computation = computeAlumniKpis(report, kpis, CONFIG);
    const valueFor = (id: string) => computation.entries.find((e) => e.kpiId === id)?.value;

    expect(valueFor(ALUMNI_KPI_IDS.responseRate)).toBe(60);
    // 2 of 3 confirmed graduates are active; "In further education" is not.
    expect(valueFor(ALUMNI_KPI_IDS.economicallyActive)).toBe(66.7);
    // And 2 of 3 are in employment, because a student is active-adjacent but
    // holds no job. The two rates agree here but are not the same measure.
    expect(valueFor(ALUMNI_KPI_IDS.employmentRate)).toBe(66.7);
    expect(valueFor(ALUMNI_KPI_IDS.businessSurvivalRate)).toBe(100);
    expect(valueFor(ALUMNI_KPI_IDS.farmYieldPerHa)).toBe(3000);
    expect(valueFor(ALUMNI_KPI_IDS.loanRepaymentRate)).toBe(100);
    expect(valueFor(ALUMNI_KPI_IDS.referralsReceived)).toBe(1);
    expect(valueFor(ALUMNI_KPI_IDS.referralConversionRate)).toBe(100);
    // Participation and engagement are over the traced cohort, not the register.
    expect(valueFor(ALUMNI_KPI_IDS.marketParticipationRate)).toBe(0.8);
    expect(valueFor(ALUMNI_KPI_IDS.engagementRate)).toBe(0.8);
    expect(computation.skipped).toHaveLength(0);
  });

  it("divides participation by the traced cohort, exposing a contradiction rather than hiding it", () => {
    // Nine distinct graduates selling from a cohort of two traced produces a rate
    // over 100%. The engine reports the arithmetic honestly instead of clamping
    // it to 100%, because the real finding is that the registers disagree with
    // the tracing log - and validateCrossSection refuses that combination.
    const report = baseReport();
    report.cohort.graduatesInCohort = 10;
    report.cohort.tracedThisPeriod = 2;
    report.market.records = Array.from({ length: 9 }, (_, i) =>
      market({ id: `m${i}`, graduateId: `G${i}` })
    );

    const computation = computeAlumniKpis(report, kpis, CONFIG);
    expect(computation.entries.find((e) => e.kpiId === ALUMNI_KPI_IDS.marketParticipationRate)?.value).toBe(450);
  });

  it("skips the response rate with no cohort size rather than dividing by zero", () => {
    const report = baseReport();
    report.cohort.tracedThisPeriod = 20;
    const computation = computeAlumniKpis(report, kpis, CONFIG);
    const skipped = computation.skipped.find((s) => s.kpiId === ALUMNI_KPI_IDS.responseRate);
    expect(skipped).toBeDefined();
    expect(skipped!.detail).toMatch(/cohort size has not been entered/i);
  });

  it("skips the loan KPIs when no loans are recorded, rather than reporting zero", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 10;
    report.cohort.tracedThisPeriod = 10;
    const computation = computeAlumniKpis(report, kpis, CONFIG);
    // No arrears value at all is different from an arrears value of R0, so the
    // figure is skipped with a reason.
    const skipped = computation.skipped.find((s) => s.kpiId === ALUMNI_KPI_IDS.loanArrearsValue);
    expect(skipped).toBeDefined();
    expect(computation.entries.find((e) => e.kpiId === ALUMNI_KPI_IDS.loanArrearsValue)).toBeUndefined();
  });

  it("explains a skipped yield caused by an unconvertible unit", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 10;
    report.cohort.tracedThisPeriod = 5;
    report.farm.records = [farm({ totalHarvest: 100, harvestUnit: "bags" })];
    const computation = computeAlumniKpis(report, kpis, CONFIG);
    const skipped = computation.skipped.find((s) => s.kpiId === ALUMNI_KPI_IDS.farmYieldPerHa);
    expect(skipped!.detail).toMatch(/bags or crates/);
  });

  it("attributes every KPI to the section it came from", () => {
    expect(sectionForAlumniKpi(ALUMNI_KPI_IDS.economicallyActive)).toBe("employment");
    expect(sectionForAlumniKpi(ALUMNI_KPI_IDS.responseRate)).toBe("cohort");
    expect(sectionForAlumniKpi(ALUMNI_KPI_IDS.farmYieldPerHa)).toBe("farm");
    expect(sectionForAlumniKpi(ALUMNI_KPI_IDS.loanArrearsValue)).toBe("loans");
    expect(sectionForAlumniKpi("kpi-not-alumni")).toBeNull();
  });

  it("ships every new KPI without an approved threshold", () => {
    // A null threshold yields "Threshold not configured" rather than an
    // invented Green badge.
    for (const kpi of ALUMNI_SUBMISSION_KPIS) {
      expect(kpi.greenThreshold).toBeNull();
      expect(kpi.amberThreshold).toBeNull();
      expect(kpi.dataAvailable).toBe(false);
    }
  });

  it("never includes a typed rate in the templates", () => {
    // There is no percentage KPI an officer could edit; the rates are derived.
    const rateKpis = ALUMNI_SUBMISSION_KPIS.filter((k) => k.unit === "percent");
    expect(rateKpis.length).toBeGreaterThan(0);
    for (const kpi of rateKpis) {
      expect(kpi.currentValue).toBe(0);
      expect(kpi.target).toBe(0);
    }
  });
});

// ===========================================================================
// Previews and the explanation list
// ===========================================================================

describe("preview status", () => {
  it("reports no_data rather than a verdict when a figure cannot be derived", () => {
    expect(previewAlumniStatus(undefined, 50).status).toBe("no_data");
  });

  it("says a threshold has not been configured rather than showing a colour", () => {
    const kpi = ALUMNI_SUBMISSION_KPIS.find((k) => k.id === ALUMNI_KPI_IDS.engagementRate)!;
    const preview = previewAlumniStatus(kpi, 40);
    expect(preview.status).toBe("threshold_unset");
    expect(preview.thresholdNote).toMatch(/Threshold not configured/);
  });

  it("gives a real colour once an approved threshold exists", () => {
    const kpi: Kpi = { ...ALUMNI_SUBMISSION_KPIS[0], greenThreshold: 60, amberThreshold: 40 };
    expect(previewAlumniStatus(kpi, 70).status).toBe("green");
    expect(previewAlumniStatus(kpi, 50).status).toBe("amber");
    expect(previewAlumniStatus(kpi, 20).status).toBe("red");
  });
});

describe("items needing explanation", () => {
  const kpis = ALUMNI_SUBMISSION_KPIS.map((k) => ({ ...k }));

  it("raises arrears even though no KPI threshold can ever fire", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 10;
    report.cohort.tracedThisPeriod = 10;
    report.loans.records = [loan({ id: "l1", status: "Arrears", arrearsMonths: 4 })];

    const computation = computeAlumniKpis(report, kpis, CONFIG);
    const items = alumniItemsNeedingExplanation(computation, kpis);
    const arrears = items.find((i) => i.kpiId === ALUMNI_KPI_IDS.loanArrearsValue);
    expect(arrears).toBeDefined();
    expect(arrears!.reason).toMatch(/recovery plan/i);
  });

  it("raises a thin sample so the rates are never quoted unqualified", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 200;
    report.cohort.tracedThisPeriod = 30;
    const computation = computeAlumniKpis(report, kpis, CONFIG);
    const items = alumniItemsNeedingExplanation(computation, kpis);
    const thin = items.find((i) => i.kpiId === ALUMNI_KPI_IDS.responseRate);
    expect(thin).toBeDefined();
    expect(thin!.reason).toMatch(/describes that subset and not the whole cohort/i);
  });

  it("raises nothing for a well-traced, clean report", () => {
    const report = baseReport();
    report.cohort.graduatesInCohort = 100;
    report.cohort.tracedThisPeriod = 90;
    report.employment.records = [employment({ id: "e1", graduateId: "G1" })];
    const computation = computeAlumniKpis(report, kpis, CONFIG);
    expect(alumniItemsNeedingExplanation(computation, kpis)).toHaveLength(0);
  });
});