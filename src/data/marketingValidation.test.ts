import { describe, expect, it } from "vitest";
import { validateMarketingReport } from "./marketingValidation";
import { DEFAULT_MARKETING_CONFIG, createBlankMarketingReport } from "./marketingSeed";
import type { MarketingReport } from "../types/marketing";
import type { ReportingFrequency } from "../types";

/**
 * Validation is the gate. A Marketing submission either carries what the rules
 * require, or it is refused with a list naming the section and the field.
 *
 * These tests pin the rules that would otherwise let a bad marketing month look
 * like a good one - above all the rules that stop a conversion rate being
 * improved by recording less rather than by converting more.
 */

const CONFIG = DEFAULT_MARKETING_CONFIG;
const TODAY = new Date("2026-09-30");

function report(): MarketingReport {
  return createBlankMarketingReport({
    cycleId: "cyc-marketing-val",
    reportingPeriod: "September 2026",
    frequency: "Monthly" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-09-30",
  });
}

function validate(r: MarketingReport) {
  return validateMarketingReport(r, { config: CONFIG, today: TODAY });
}

/** The smallest report that passes, used as the base for the single-defect
 *  tests below. */
function validReport(): MarketingReport {
  const base = report();
  return {
    ...base,
    enquiries: {
      records: [
        {
          id: "e1",
          channel: "Website form",
          dateReceived: "2026-09-02",
          programmeInterest: "Learnership",
          province: "Mpumalanga",
          contactVerified: true,
          status: "Closed",
          outcome: "Enrolled",
          outcomeDate: "2026-09-10",
          handledBy: "Karabo",
          notes: "Winter Drive",
        },
        {
          id: "e2",
          channel: "Phone",
          dateReceived: "2026-09-03",
          programmeInterest: "Bursary programme",
          province: "Gauteng",
          contactVerified: true,
          status: "Closed",
          outcome: "Not enrolled - chose elsewhere",
          outcomeDate: "2026-09-11",
          handledBy: "Karabo",
          notes: "",
        },
      ],
      commentary: "",
      notApplicable: false,
    },
    campaigns: {
      records: [
        {
          id: "c1",
          name: "Winter Drive",
          channel: "Digital",
          status: "Completed",
          startDate: "2026-09-01",
          endDate: "2026-09-15",
          budget: 10000,
          spend: 8000,
          reach: 5000,
          notes: "",
        },
      ],
      commentary: "",
      notApplicable: false,
    },
    leads: {
      records: [
        {
          id: "l1",
          source: "Website",
          period: "September 2026",
          leadsGenerated: 100,
          leadsQualified: 60,
          leadsConverted: 30,
          spend: 5000,
          notes: "",
        },
      ],
      commentary: "",
      notApplicable: false,
    },
    partnerships: {
      records: [
        {
          id: "p1",
          partner: "Acme Foods",
          type: "Referral",
          status: "Active",
          startDate: "2026-01-01",
          endDate: "2027-01-01",
          contribution: "Cash",
          value: 50000,
          contactPerson: "Jane",
          notes: "",
        },
      ],
      commentary: "",
      notApplicable: false,
    },
    website: {
      records: [
        {
          id: "w1",
          period: "2026-09",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          sessions: 1000,
          uniqueVisitors: 800,
          enquiriesFromSite: 1,
          conversions: 2,
          topLandingPage: "/programmes",
          notes: "",
        },
      ],
      commentary: "",
      notApplicable: false,
    },
  };
}

describe("a valid submission", () => {
  it("passes with no issues", () => {
    expect(validate(validReport()).valid).toBe(true);
  });
});

describe("enquiries", () => {
  it("refuses a conversion recorded on an unverified contact", () => {
    const r = validReport();
    r.enquiries.records[0].contactVerified = false;
    const issues = validate(r).issues;
    expect(issues.some((i) => /Contact verified/i.test(i.field) && i.section === "enquiries")).toBe(true);
  });

  it("refuses an outcome with no date, because the period it belongs to is unknowable", () => {
    const r = validReport();
    r.enquiries.records[0].outcomeDate = "";
    expect(validate(r).issues.some((i) => /Outcome date/i.test(i.field))).toBe(true);
  });

  it("refuses a closed enquiry with no outcome, which would silently shrink the denominator", () => {
    const r = validReport();
    r.enquiries.records[0].outcome = "";
    r.enquiries.records[0].outcomeDate = "";
    expect(validate(r).issues.some((i) => /Outcome/i.test(i.field))).toBe(true);
  });

  it("refuses an outcome recorded before the enquiry arrived", () => {
    const r = validReport();
    r.enquiries.records[0].outcomeDate = "2026-09-01";
    r.enquiries.records[0].dateReceived = "2026-09-05";
    expect(validate(r).issues.some((i) => /before the enquiry arrived/i.test(i.message))).toBe(true);
  });

  it("refuses an outcome outside the approved list, because the rate is derived from it", () => {
    const r = validReport();
    r.enquiries.records[0].outcome = "Signed up" as never;
    expect(validate(r).issues.some((i) => /not an approved/i.test(i.message))).toBe(true);
  });

  it("refuses an enquiry dated in the future", () => {
    const r = validReport();
    r.enquiries.records[0].dateReceived = "2026-12-01";
    expect(validate(r).issues.some((i) => /future/i.test(i.message))).toBe(true);
  });
});

describe("campaigns", () => {
  it("refuses a completed campaign with no end date", () => {
    const r = validReport();
    r.campaigns.records[0].endDate = "";
    expect(validate(r).issues.some((i) => i.section === "campaigns" && /End date/i.test(i.field))).toBe(true);
  });

  it("refuses spend that exceeds the budget", () => {
    const r = validReport();
    r.campaigns.records[0].spend = 12000;
    expect(validate(r).issues.some((i) => /exceeds the budget/i.test(i.message))).toBe(true);
  });

  it("refuses two campaigns with the same name, which makes attribution impossible", () => {
    const r = validReport();
    r.campaigns.records.push({ ...r.campaigns.records[0], id: "c2" });
    expect(validate(r).issues.some((i) => /more than once/i.test(i.message))).toBe(true);
  });

  it("refuses a campaign whose end date precedes its start", () => {
    const r = validReport();
    r.campaigns.records[0].endDate = "2026-08-01";
    expect(validate(r).issues.some((i) => /before the start date/i.test(i.message))).toBe(true);
  });
});

describe("lead generation", () => {
  it("refuses more conversions than leads generated", () => {
    const r = validReport();
    r.leads.records[0].leadsConverted = 150;
    expect(validate(r).issues.some((i) => /above 100%/i.test(i.message))).toBe(true);
  });

  it("refuses conversions that exceed qualified leads", () => {
    const r = validReport();
    r.leads.records[0].leadsQualified = 20;
    r.leads.records[0].leadsConverted = 30;
    expect(validate(r).issues.some((i) => /qualified first/i.test(i.message))).toBe(true);
  });

  it("refuses two rows for the same source and period, which would be added together", () => {
    const r = validReport();
    r.leads.records.push({ ...r.leads.records[0], id: "l2" });
    expect(validate(r).issues.some((i) => /already has a row/i.test(i.message))).toBe(true);
  });

  it("requires the generated count, because it is the denominator", () => {
    const r = validReport();
    r.leads.records[0].leadsGenerated = null;
    expect(validate(r).issues.some((i) => /Leads generated/i.test(i.field))).toBe(true);
  });
});

describe("partnerships", () => {
  it("refuses a partnership marked Active past its own end date", () => {
    const r = validReport();
    r.partnerships.records[0].endDate = "2026-06-30";
    expect(validate(r).issues.some((i) => /the agreement ended/i.test(i.message))).toBe(true);
  });

  it("refuses a cash contribution with no value recorded", () => {
    const r = validReport();
    r.partnerships.records[0].value = null;
    expect(validate(r).issues.some((i) => /Value/i.test(i.field))).toBe(true);
  });

  it("refuses an active partnership with no contact, which nobody can act on", () => {
    const r = validReport();
    r.partnerships.records[0].contactPerson = "";
    expect(validate(r).issues.some((i) => /Contact person/i.test(i.field))).toBe(true);
  });

  it("refuses the same partner twice, which inflates the active count", () => {
    const r = validReport();
    r.partnerships.records.push({ ...r.partnerships.records[0], id: "p2" });
    expect(validate(r).issues.some((i) => /more than once/i.test(i.message))).toBe(true);
  });
});

describe("website activity", () => {
  it("refuses more unique visitors than sessions", () => {
    const r = validReport();
    r.website.records[0].uniqueVisitors = 2000;
    expect(validate(r).issues.some((i) => /unique visitor generates at least one session/i.test(i.message))).toBe(
      true
    );
  });

  it("refuses sessions with no unit of measure left blank", () => {
    const r = validReport();
    r.website.records[0].sessions = null;
    expect(validate(r).issues.some((i) => /Sessions/i.test(i.field))).toBe(true);
  });

  it("refuses two rows for the same analytics period", () => {
    const r = validReport();
    r.website.records.push({ ...r.website.records[0], id: "w2" });
    expect(validate(r).issues.some((i) => /appears more than once/i.test(i.message))).toBe(true);
  });
});

describe("cross-section", () => {
  it("refuses an enquiry dated outside the reporting period, which would double-count it", () => {
    const r = validReport();
    r.enquiries.records[0].dateReceived = "2026-08-15";
    expect(validate(r).issues.some((i) => /outside this reporting period/i.test(i.message))).toBe(true);
  });

  it("names site enquiries the enquiry register does not contain", () => {
    const r = validReport();
    r.website.records[0].enquiriesFromSite = 40;
    expect(validate(r).issues.some((i) => /missing/i.test(i.message))).toBe(true);
  });

  it("refuses leads with an entirely empty enquiry register", () => {
    const r = validReport();
    r.enquiries.records = [];
    expect(validate(r).issues.some((i) => /enquiry register is empty/i.test(i.message))).toBe(true);
  });

  it("names a campaign with spend and no enquiry attributed to it", () => {
    const r = validReport();
    r.campaigns.records[0].name = "Untouched Campaign";
    expect(validate(r).issues.some((i) => /no cost per enquiry can be derived/i.test(i.message))).toBe(true);
  });
});

describe("Not Applicable", () => {
  it("marks a section not applicable rather than blocking submission", () => {
    const r = validReport();
    r.partnerships.notApplicable = true;
    r.partnerships.records = [];
    const result = validate(r);
    expect(result.bySection.partnerships.state).toBe("not_applicable");
    expect(result.valid).toBe(true);
  });

  it("does not let a marked section hide a cross-section conflict about it", () => {
    const r = validReport();
    r.enquiries.notApplicable = true;
    r.enquiries.records = [];
    r.leads.records = [{ ...r.leads.records[0] }];
    // Leads exist but nothing was recorded against them: still a real gap.
    expect(validate(r).valid).toBe(false);
  });
});