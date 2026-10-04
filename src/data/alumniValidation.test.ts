import { describe, expect, it } from "vitest";
import {
  alumniCompletion,
  summariseAlumniIssues,
  validateAlumniReport,
} from "./alumniValidation";
import { DEFAULT_ALUMNI_CONFIG, createBlankAlumniReport } from "./alumniSeed";
import {
  ALUMNI_SECTION_KEYS,
  type AlumniReport,
  type BusinessRecord,
  type EngagementRecord,
  type FarmRecord,
  type LoanRecord,
  type MarketRecord,
  type ReferralRecord,
} from "../types/alumni";
import type { ReportingFrequency } from "../types";

/**
 * Alumni validation is the only place in the dashboard with two grades of issue.
 *
 * BLOCKING issues are contradictions and gaps somebody can type their way out
 * of, and they refuse the submission. ATTENTION issues are facts the department
 * has to state rather than fix: a thin response rate, a loan in arrears, an
 * unverified status. Refusing those would mean a cohort that is hard to reach
 * could never be reported on, which is the cohort whose situation most needs
 * reporting.
 *
 * Both halves are pinned below.
 */

const CONFIG = DEFAULT_ALUMNI_CONFIG;

function report(): AlumniReport {
  return createBlankAlumniReport({
    cycleId: "cyc-alumni-test",
    reportingPeriod: "H2 2026 Cohort",
    frequency: "6 Months After Graduation" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-11-01",
  });
}

/** A report that passes everything, so each test can introduce one problem. */
function cleanReport(): AlumniReport {
  const r = report();
  r.cohort.graduatesInCohort = 100;
  r.cohort.tracedThisPeriod = 4;
  r.cohort.tracingMethod = "Telephone";
  r.employment.records = [
    {
      id: "e1",
      graduateId: "G1",
      status: "Employed",
      verified: true,
      dateConfirmed: "2026-10-01",
      employer: "Shoprite",
      jobTitle: "Assistant",
      monthlyIncome: 4500,
      notes: "",
    },
    {
      id: "e2",
      graduateId: "G2",
      status: "Self-employed",
      verified: true,
      dateConfirmed: "2026-10-01",
      employer: "",
      jobTitle: "Owner",
      monthlyIncome: null,
      notes: "",
    },
    {
      id: "e3",
      graduateId: "G3",
      status: "Unemployed - seeking",
      verified: true,
      dateConfirmed: "2026-10-01",
      employer: "",
      jobTitle: "",
      monthlyIncome: null,
      notes: "",
    },
    {
      id: "e4",
      graduateId: "G4",
      status: "In further education",
      verified: true,
      dateConfirmed: "2026-10-01",
      employer: "",
      jobTitle: "",
      monthlyIncome: null,
      notes: "",
    },
  ];
  return r;
}

function validate(r: AlumniReport) {
  return validateAlumniReport(r, { config: CONFIG });
}

// ===========================================================================
// The cohort gate
// ===========================================================================

describe("the cohort gate", () => {
  it("accepts an untouched report", () => {
    // Nothing has been traced, so nothing is claimed. That is legitimate.
    expect(validate(report()).valid).toBe(true);
  });

  it("refuses registers with no cohort size", () => {
    const r = report();
    r.employment.records = [
      {
        id: "e1",
        graduateId: "G1",
        status: "Employed",
        verified: true,
        dateConfirmed: "2026-10-01",
        employer: "Shoprite",
        jobTitle: "",
        monthlyIncome: null,
        notes: "",
      },
    ];
    const result = validate(r);
    expect(result.valid).toBe(false);
    expect(result.blockingIssues.some((i) => i.field.includes("Graduates in cohort"))).toBe(true);
  });

  it("refuses registers with nobody recorded as traced", () => {
    const r = cleanReport();
    r.cohort.tracedThisPeriod = null;
    const result = validate(r);
    expect(result.valid).toBe(false);
    expect(result.blockingIssues.some((i) => i.field.includes("Traced this period"))).toBe(true);
  });

  it("names how many records and which sections when the traced count is missing", () => {
    const r = cleanReport();
    r.cohort.tracedThisPeriod = null;
    const issue = validate(r).blockingIssues.find((i) => i.field.includes("Traced this period"));
    expect(issue!.message).toMatch(/Employment \(4\)/);
  });

  it("refuses more graduates traced than in the cohort", () => {
    const r = cleanReport();
    r.cohort.graduatesInCohort = 2;
    r.cohort.tracedThisPeriod = 4;
    const issue = validate(r).blockingIssues.find((i) => i.field.includes("Traced this period"));
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/Every rate on this page divides by the cohort size/);
  });

  it("refuses traced plus untraceable exceeding the cohort", () => {
    const r = cleanReport();
    r.cohort.graduatesInCohort = 100;
    r.cohort.tracedThisPeriod = 4;
    r.cohort.untraceable = 98;
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Untraceable"))).toBe(true);
  });

  it("refuses an employment register larger than the traced count", () => {
    // This is what produces a participation rate over 100%.
    const r = cleanReport();
    r.cohort.tracedThisPeriod = 2;
    const issue = validate(r).blockingIssues.find((i) => i.message.includes("employment register"));
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/above 100%/);
  });
});

// ===========================================================================
// Employment
// ===========================================================================

describe("employment", () => {
  it("requires the fields a rate is built from", () => {
    const r = cleanReport();
    r.employment.records[0].graduateId = "";
    r.employment.records[0].status = "";
    const result = validate(r);
    expect(result.valid).toBe(false);
    expect(result.bySection.employment.issues.some((i) => i.field.includes("Graduate"))).toBe(true);
    expect(result.bySection.employment.issues.some((i) => i.field.includes("Status"))).toBe(true);
  });

  it("requires a date on a verified status", () => {
    // Without it, a current finding cannot be told from a three-year-old assumption.
    const r = cleanReport();
    r.employment.records[0].dateConfirmed = "";
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Date confirmed"))).toBe(true);
  });

  it("does not require a date on an unverified status", () => {
    const r = cleanReport();
    r.employment.records[0].verified = false;
    r.employment.records[0].dateConfirmed = "";
    const issue = validate(r).blockingIssues.find((i) => i.field.includes("Date confirmed"));
    expect(issue).toBeUndefined();
  });

  it("refuses a status that is not approved", () => {
    const r = cleanReport();
    r.employment.records[0].status = "Doing odd jobs" as never;
    const issue = validate(r).blockingIssues.find((i) => i.kind === "notApproved");
    expect(issue!.message).toMatch(/Add it in Administration/);
  });

  it("refuses an employer recorded with no work", () => {
    const r = cleanReport();
    r.employment.records[2].employer = "Spar";
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Employer"))).toBe(true);
  });

  it("refuses a job with no employer", () => {
    const r = cleanReport();
    r.employment.records[0].employer = "";
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Employer"))).toBe(true);
  });

  it("refuses a student recorded at an employer", () => {
    // The mistake most worth catching, because it flatters the number the board watches.
    const r = cleanReport();
    r.employment.records[3].employer = "Varsity Café";
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Employer"))).toBe(true);
  });

  it("does NOT block on an unverified status, but flags it", () => {
    const r = cleanReport();
    r.employment.records[0].verified = false;
    const result = validate(r);
    expect(result.valid).toBe(true);
    const attention = result.attentionIssues.find((i) => i.field.includes("Verified"));
    expect(attention).toBeDefined();
    expect(attention!.message).toMatch(/excluded from the employment rate/);
  });

  it("flags an Unknown status without blocking", () => {
    const r = cleanReport();
    r.employment.records[2].status = "Unknown";
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Status"))).toBe(true);
  });

  it("never requires an income", () => {
    // A graduate who will not say what they earn must not stop a submission.
    const r = cleanReport();
    for (const row of r.employment.records) row.monthlyIncome = null;
    expect(validate(r).valid).toBe(true);
  });
});

// ===========================================================================
// Business
// ===========================================================================

describe("business sustainability", () => {
  const base = (over: Partial<BusinessRecord> = {}): BusinessRecord => ({
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

  it("requires a reason once a business is closed", () => {
    const r = cleanReport();
    r.business.records = [base({ stillTrading: false, reasonClosed: "" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Reason closed"))).toBe(true);
  });

  it("refuses a closure reason on a business still trading", () => {
    const r = cleanReport();
    r.business.records = [base({ stillTrading: true, reasonClosed: "Lost the shop" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Reason closed"))).toBe(true);
  });

  it("accepts a business that started before this window", () => {
    // A surviving business is a standing position, not a period flow, so it is
    // correctly reported now and rejecting it would push a real business out of
    // the register it belongs in.
    const r = cleanReport();
    r.business.records = [base({ startDate: "2019-03-01" })];
    expect(validate(r).valid).toBe(true);
  });

  it("refuses a start date after the reporting date", () => {
    const r = cleanReport();
    r.business.records = [base({ startDate: "2027-01-01" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Start date"))).toBe(true);
  });

  it("does not block a business with no start date, but flags it", () => {
    const r = cleanReport();
    r.business.records = [base({ startDate: "" })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Start date"))).toBe(true);
  });

  it("requires no revenue", () => {
    const r = cleanReport();
    r.business.records = [base({ monthlyRevenue: null, employees: null })];
    expect(validate(r).valid).toBe(true);
  });
});

// ===========================================================================
// Farm
// ===========================================================================

describe("farm productivity", () => {
  const base = (over: Partial<FarmRecord> = {}): FarmRecord => ({
    id: "f1",
    graduateId: "G1",
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

  it("accepts a clean crop row", () => {
    const r = cleanReport();
    r.farm.records = [base()];
    expect(validate(r).valid).toBe(true);
  });

  it("refuses a row with neither a crop nor livestock", () => {
    const r = cleanReport();
    r.farm.records = [base({ crop: "", livestockCategory: "" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Crop or livestock"))).toBe(true);
  });

  it("refuses one row carrying both a crop and livestock", () => {
    // Otherwise the area and yield are attributed to the wrong thing.
    const r = cleanReport();
    r.farm.records = [base({ livestockCategory: "Cattle", livestockHead: 10 })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Crop and livestock"))).toBe(true);
  });

  it("does NOT block on bags, but says the yield will not be derived", () => {
    // Bags are a perfectly good way to count a harvest. The row is not wrong.
    const r = cleanReport();
    r.farm.records = [base({ totalHarvest: 100, harvestUnit: "bags" })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    const attention = result.attentionIssues.find((i) => i.field.includes("Harvest unit"));
    expect(attention!.message).toMatch(/cannot be converted to kilograms/);
  });

  it("requires a unit when a harvest is recorded", () => {
    const r = cleanReport();
    r.farm.records = [base({ harvestUnit: "" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Harvest unit"))).toBe(true);
  });

  it("refuses a unit with no harvest", () => {
    const r = cleanReport();
    r.farm.records = [base({ totalHarvest: null })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Total harvest"))).toBe(true);
  });

  it("refuses a zero area, because it cannot produce a yield", () => {
    const r = cleanReport();
    r.farm.records = [base({ areaHa: 0 })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Area"))).toBe(true);
  });

  it("does not require an area", () => {
    const r = cleanReport();
    r.farm.records = [base({ areaHa: null })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Area"))).toBe(true);
  });

  it("accepts a livestock-only line with no area or harvest", () => {
    const r = cleanReport();
    r.farm.records = [
      base({ crop: "", livestockCategory: "Goats", livestockHead: 25, areaHa: null, totalHarvest: null }),
    ];
    expect(validate(r).valid).toBe(true);
  });
});

// ===========================================================================
// Loans
// ===========================================================================

describe("loan repayment", () => {
  const base = (over: Partial<LoanRecord> = {}): LoanRecord => ({
    id: "l1",
    loanReference: "LN-001",
    borrower: "G1",
    principal: 50000,
    balanceOutstanding: 20000,
    instalmentAmount: 2000,
    instalmentDueDate: "2026-11-05",
    status: "Current",
    arrearsMonths: null,
    lastPaymentDate: "2026-10-05",
    notes: "",
    ...over,
  });

  it("refuses a paid-off loan that still owes money", () => {
    const r = cleanReport();
    r.loans.records = [base({ status: "Paid off", balanceOutstanding: 5000 })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Balance outstanding"))).toBe(true);
  });

  it("refuses a live loan with nothing outstanding", () => {
    const r = cleanReport();
    r.loans.records = [base({ balanceOutstanding: 0 })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Balance outstanding"))).toBe(true);
  });

  it("requires arrears months once a loan is in arrears", () => {
    const r = cleanReport();
    r.loans.records = [base({ status: "Arrears", arrearsMonths: null })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Arrears months"))).toBe(true);
  });

  it("refuses arrears months on a loan that is not in arrears", () => {
    const r = cleanReport();
    r.loans.records = [base({ arrearsMonths: 3 })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Arrears months"))).toBe(true);
  });

  it("requires both principal and balance, because both feed the arrears figure", () => {
    const r = cleanReport();
    r.loans.records = [base({ principal: null })];
    r.loans.records.push(base({ id: "l2", loanReference: "LN-002", balanceOutstanding: null })) as never;
    const result = validate(r);
    expect(result.blockingIssues.some((i) => i.field.includes("Principal"))).toBe(true);
    expect(result.blockingIssues.some((i) => i.field.includes("Balance outstanding"))).toBe(true);
  });

  it("refuses the same loan reference recorded twice", () => {
    const r = cleanReport();
    r.loans.records = [base({ id: "l1" }), base({ id: "l2" })];
    const issue = validate(r).blockingIssues.find((i) => i.field.includes("Loan reference"));
    expect(issue!.message).toMatch(/understate the arrears balance/);
  });

  it("flags a written-off loan as not repaid rather than blocking it", () => {
    // A write-off may be the correct final answer. What must not happen is it
    // being recorded as a success.
    const r = cleanReport();
    r.loans.records = [base({ status: "Written off", balanceOutstanding: 20000, instalmentDueDate: "" })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.message.includes("NOT repaid"))).toBe(true);
  });

  it("flags arrears for a recovery position without blocking", () => {
    const r = cleanReport();
    r.loans.records = [base({ status: "Arrears", arrearsMonths: 4 })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.message.includes("recovery position"))).toBe(true);
  });

  it("flags an instalment larger than the balance", () => {
    const r = cleanReport();
    r.loans.records = [base({ instalmentAmount: 25000, balanceOutstanding: 20000 })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Instalment"))).toBe(true);
  });

  it("refuses a payment dated in the future", () => {
    const r = cleanReport();
    r.loans.records = [base({ lastPaymentDate: "2099-01-01" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Last payment date"))).toBe(true);
  });
});

// ===========================================================================
// Referrals
// ===========================================================================

describe("referrals", () => {
  const base = (over: Partial<ReferralRecord> = {}): ReferralRecord => ({
    id: "r1",
    referrerName: "G1",
    referredPersonName: "Nomsa",
    programmeReferred: "Internship",
    dateReferred: "2026-09-10",
    channel: "Personal contact",
    outcome: "Enrolled",
    outcomeDate: "2026-10-01",
    notes: "",
    ...over,
  });

  it("refuses the same referred person twice when the second is not a Duplicate", () => {
    const r = cleanReport();
    r.referrals.records = [base({ id: "r1" }), base({ id: "r2" })];
    const issue = validate(r).blockingIssues.find((i) => i.field.includes("Referred person"));
    expect(issue!.message).toMatch(/inflate both the referral count/);
  });

  it("accepts the same referred person twice when the second IS a Duplicate", () => {
    const r = cleanReport();
    r.referrals.records = [
      base({ id: "r1" }),
      base({ id: "r2", outcome: "Duplicate", outcomeDate: "" }),
    ];
    expect(validate(r).valid).toBe(true);
  });

  it("refuses a self-referral", () => {
    const r = cleanReport();
    r.referrals.records = [base({ referredPersonName: "  g1  " })];
    expect(validate(r).blockingIssues.some((i) => i.message.includes("cannot refer themselves"))).toBe(true);
  });

  it("does not block a referral with no outcome yet", () => {
    // "Awaiting decision" is the honest answer while nobody has replied.
    const r = cleanReport();
    r.referrals.records = [base({ outcome: "", outcomeDate: "" })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Outcome"))).toBe(true);
  });

  it("requires an outcome date once an outcome is recorded", () => {
    const r = cleanReport();
    r.referrals.records = [base({ outcomeDate: "" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Outcome date"))).toBe(true);
  });

  it("requires a programme once somebody enrolled", () => {
    // Otherwise the referral cannot be attributed to anything the programme runs.
    const r = cleanReport();
    r.referrals.records = [base({ programmeReferred: "" })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Programme"))).toBe(true);
  });

  it("flags an unapproved outcome", () => {
    const r = cleanReport();
    r.referrals.records = [base({ outcome: "Maybe" as never })];
    expect(validate(r).blockingIssues.some((i) => i.kind === "notApproved")).toBe(true);
  });
});

// ===========================================================================
// Market and engagement
// ===========================================================================

describe("market participation", () => {
  const base = (over: Partial<MarketRecord> = {}): MarketRecord => ({
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

  it("refuses a graduate not seeking work who is recorded selling", () => {
    const r = cleanReport();
    r.employment.records[2].status = "Unemployed - not seeking";
    r.market.records = [base({ graduateId: "G3" })];
    const issue = validate(r).blockingIssues.find((i) => i.section === "market");
    expect(issue!.message).toMatch(/check the status first/);
  });

  it("allows somebody seeking work to sell, because informal trade is how people look", () => {
    // The rule is about "not seeking", not about being unemployed. Someone
    // earning from a stall while looking for a job is the ordinary case.
    const r = cleanReport();
    r.employment.records[2].status = "Unemployed - seeking";
    r.market.records = [base({ graduateId: "G3" })];
    expect(validate(r).valid).toBe(true);
  });

  it("does not object to a self-employed graduate selling", () => {
    const r = cleanReport();
    r.market.records = [base({ graduateId: "G2" })];
    expect(validate(r).valid).toBe(true);
  });

  it("flags a daily stall with no revenue", () => {
    const r = cleanReport();
    r.market.records = [base({ frequencyOfSale: "Daily", averageMonthlyRevenue: null })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Average monthly revenue"))).toBe(true);
  });

  it("refuses an unapproved market type", () => {
    const r = cleanReport();
    r.market.records = [base({ marketType: "The corner" as never })];
    expect(validate(r).blockingIssues.some((i) => i.kind === "notApproved")).toBe(true);
  });
});

describe("engagement", () => {
  const base = (over: Partial<EngagementRecord> = {}): EngagementRecord => ({
    id: "g1",
    graduateId: "G1",
    activity: "Mentoring a learner",
    activityDate: "2026-09-20",
    hoursContributed: 4,
    othersReached: 6,
    notes: "",
    ...over,
  });

  it("accepts an in-window activity", () => {
    const r = cleanReport();
    r.engagement.records = [base()];
    expect(validate(r).valid).toBe(true);
  });

  it("refuses an activity dated outside the period", () => {
    // Engagement is a period flow, so leaving an out-of-window row here would
    // double-count the period.
    const r = cleanReport();
    r.engagement.records = [base({ activityDate: "2026-06-01" })];
    const issue = validate(r).blockingIssues.find((i) => i.field.includes("Activity date"));
    expect(issue!.message).toMatch(/double-count/);
  });

  it("does not require hours", () => {
    const r = cleanReport();
    r.engagement.records = [base({ hoursContributed: null })];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Hours contributed"))).toBe(true);
  });

  it("refuses negative hours", () => {
    const r = cleanReport();
    r.engagement.records = [base({ hoursContributed: -2 })];
    expect(validate(r).blockingIssues.some((i) => i.field.includes("Hours contributed"))).toBe(true);
  });
});

// ===========================================================================
// Cross-register
// ===========================================================================

describe("cross-register consistency", () => {
  it("refuses a graduate who appears in a register but was never traced", () => {
    const r = cleanReport();
    r.market.records = [
      {
        id: "m1",
        graduateId: "G99",
        marketName: "Mbare",
        marketType: "Street market",
        productCategory: "Vegetables",
        frequencyOfSale: "Weekly",
        averageMonthlyRevenue: 7000,
        hasFormalSpace: false,
        notes: "",
      },
    ];
    const issue = validate(r).blockingIssues.find((i) => i.section === "market");
    expect(issue!.message).toMatch(/not in the employment register/);
  });

  it("does not block a referrer who has no employment row", () => {
    // A referral is itself evidence of contact, so this is flagged, not refused.
    const r = cleanReport();
    r.referrals.records = [
      {
        id: "r1",
        referrerName: "Stranger",
        referredPersonName: "Nomsa",
        programmeReferred: "Internship",
        dateReferred: "2026-09-10",
        channel: "Personal contact",
        outcome: "Enrolled",
        outcomeDate: "2026-10-01",
        notes: "",
      },
    ];
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.message.includes("evidence of contact"))).toBe(true);
  });

  it("flags a thin response rate without refusing the submission", () => {
    // A cohort that is hard to reach is exactly the one worth reporting on.
    const r = cleanReport();
    r.cohort.graduatesInCohort = 200;
    r.cohort.tracedThisPeriod = 30;
    const result = validate(r);
    expect(result.valid).toBe(true);
    const attention = result.attentionIssues.find((i) => i.field.includes("Response rate"));
    expect(attention!.message).toMatch(/describes those 30 graduates and not the whole cohort/);
  });

  it("says nothing about response rate when the sample is adequate", () => {
    const r = cleanReport();
    r.cohort.graduatesInCohort = 100;
    r.cohort.tracedThisPeriod = 90;
    expect(validate(r).attentionIssues.some((i) => i.field.includes("Response rate"))).toBe(false);
  });

  it("flags every confirmed graduate being active", () => {
    // Possible, since these are graduates, but it is also what a register that
    // defaults to "Employed" looks like.
    const r = cleanReport();
    for (const row of r.employment.records) {
      row.status = "Employed";
      row.employer = "Shoprite";
    }
    const result = validate(r);
    expect(result.valid).toBe(true);
    expect(result.attentionIssues.some((i) => i.field.includes("Status distribution"))).toBe(true);
  });
});

// ===========================================================================
// Reporting shape
// ===========================================================================

describe("result shape", () => {
  it("reports a section with no issues as complete", () => {
    const result = validate(cleanReport());
    expect(result.bySection.employment.state).toBe("complete");
  });

  it("marks a section Not Applicable when its flag is set and it has no issues", () => {
    const r = cleanReport();
    r.business.notApplicable = true;
    expect(validate(r).bySection.business.state).toBe("not_applicable");
  });

  it("marks a Not Applicable section incomplete if it still has records", () => {
    const r = cleanReport();
    r.business.notApplicable = true;
    r.business.records = [
      {
        id: "b1",
        businessName: "",
        graduateId: "G1",
        sector: "",
        startDate: "",
        stillTrading: true,
        reasonClosed: "",
        monthlyRevenue: null,
        employees: null,
        notes: "",
      },
    ];
    expect(validate(r).bySection.business.state).toBe("incomplete");
  });

  it("counts completion across all seven sections", () => {
    const completion = alumniCompletion(validate(cleanReport()));
    expect(completion.total).toBe(7);
    expect(ALUMNI_SECTION_KEYS).toHaveLength(7);
    expect(completion.complete).toBe(7);
    expect(completion.blocking).toBe(0);
  });

  it("groups issues by section for the refusal panel", () => {
    const r = cleanReport();
    r.employment.records[0].status = "";
    r.farm.records = [
      {
        id: "f1",
        graduateId: "G1",
        crop: "",
        livestockCategory: "",
        areaHa: null,
        totalHarvest: null,
        harvestUnit: "",
        livestockHead: null,
        labourCount: null,
        notes: "",
      },
    ];
    const grouped = summariseAlumniIssues(validate(r).issues);
    expect(grouped.map((g) => g.section)).toContain("employment");
    expect(grouped.map((g) => g.section)).toContain("farm");
  });

  it("separates blocking from attention counts", () => {
    const r = cleanReport();
    r.cohort.graduatesInCohort = 200;
    r.cohort.tracedThisPeriod = 30;
    r.employment.records[0].status = "";
    const result = validate(r);
    expect(result.issues.length).toBe(result.blockingIssues.length + result.attentionIssues.length);
    expect(result.valid).toBe(false);
    expect(result.attentionIssues.length).toBeGreaterThan(0);
  });

  it("validates a report whose every section is Not Applicable", () => {
    // A cohort with no traced graduates can legitimately report nothing.
    const r = report();
    r.cohort.graduatesInCohort = 80;
    r.cohort.tracedThisPeriod = 0;
    for (const key of ALUMNI_SECTION_KEYS) {
      (r[key] as { notApplicable: boolean }).notApplicable = true;
    }
    expect(validate(r).valid).toBe(true);
  });
});
