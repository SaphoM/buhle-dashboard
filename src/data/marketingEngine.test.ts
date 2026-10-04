import { describe, expect, it } from "vitest";
import {
  computeMarketingKpis,
  previewMarketingStatus,
  summariseCampaigns,
  summariseEnquiries,
  summariseLeads,
  summarisePartnerships,
  summariseWebsite,
} from "./marketingEngine";
import {
  DEFAULT_MARKETING_CONFIG,
  MARKETING_KPI_IDS,
  MARKETING_SUBMISSION_KPIS,
  createBlankMarketingReport,
} from "./marketingSeed";
import type { MarketingReport } from "../types/marketing";
import type { Kpi, ReportingFrequency } from "../types";

/**
 * The Marketing engine is what stops conversion rate being typed.
 *
 * These tests pin the arithmetic that a typed number would have allowed anybody
 * to move: what counts in the denominator, what counts as a conversion, and what
 * makes a rate un-derivable rather than zero.
 */

const CONFIG = DEFAULT_MARKETING_CONFIG;

function baseReport(): MarketingReport {
  return createBlankMarketingReport({
    cycleId: "cyc-marketing-test",
    reportingPeriod: "September 2026",
    frequency: "Monthly" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-09-20",
  });
}

const entry = (over: Partial<MarketingReport["enquiries"]["records"][number]> = {}) => ({
  id: "e1",
  channel: "Website form" as const,
  dateReceived: "2026-09-02",
  programmeInterest: "Learnership",
  province: "Mpumalanga",
  contactVerified: true,
  status: "Closed" as const,
  outcome: "Enrolled" as const,
  outcomeDate: "2026-09-10",
  handledBy: "Karabo",
  notes: "",
  ...over,
});

describe("enquiry summary", () => {
  it("counts enquiries excluding duplicates", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [
          entry({ id: "a" }),
          entry({ id: "b", outcome: "Duplicate", outcomeDate: "2026-09-10" }),
          entry({ id: "c", outcome: "Not enrolled - chose elsewhere" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseEnquiries(report)!;
    expect(s.total).toBe(3);
    expect(s.duplicates).toBe(1);
    // The duplicate must not inflate the count of interested people.
    expect(s.totalExcludingDuplicates).toBe(2);
  });

  it("excludes duplicates from the conversion denominator", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [
          entry({ id: "a" }),
          entry({ id: "b" }),
          entry({ id: "c", outcome: "Duplicate", outcomeDate: "2026-09-10" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseEnquiries(report)!;
    // 2 converted of 2 real enquiries = 100%, not 2 of 3 = 66.7%.
    expect(s.conversionRatePct).toBe(100);
  });

  it("excludes unverifiable contacts from the reportable conversion rate", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [
          entry({ id: "a" }),
          entry({ id: "b", contactVerified: false, outcome: "Not enrolled - chose elsewhere" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseEnquiries(report)!;
    expect(s.unverifiable).toBe(1);
    expect(s.conversionRatePct).toBe(50);
    // Only the verified enquiry can count, and it did.
    expect(s.reportableConversionRatePct).toBe(100);
  });

  it("reports still-open enquiries separately from rejections", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [
          entry({ id: "a", outcome: "", outcomeDate: "", status: "Follow-up" }),
          entry({ id: "b", outcome: "Awaiting decision", status: "Follow-up" }),
          entry({ id: "c", outcome: "Withdrawn" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseEnquiries(report)!;
    // "Deciding" is not "rejected": neither of the first two is a failure.
    expect(s.open).toBe(2);
    expect(s.converted).toBe(0);
    expect(s.conversionRatePct).toBe(0);
  });

  it("returns nothing rather than zero for an empty register", () => {
    expect(summariseEnquiries(baseReport())).toBeNull();
  });
});

describe("campaign summary", () => {
  const campaign = (over: Partial<MarketingReport["campaigns"]["records"][number]> = {}) => ({
    id: "c1",
    name: "Winter Drive",
    channel: "Digital" as const,
    status: "Completed" as const,
    startDate: "2026-09-01",
    endDate: "2026-09-15",
    budget: 10000,
    spend: 8000,
    reach: 5000,
    notes: "",
    ...over,
  });

  it("counts only completed campaigns as delivered", () => {
    const report = {
      ...baseReport(),
      campaigns: {
        records: [
          campaign({ id: "1", name: "A" }),
          campaign({ id: "2", name: "B", status: "Active" }),
          campaign({ id: "3", name: "C", status: "Planned" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseCampaigns(report)!;
    expect(s.completed).toBe(1);
    expect(s.active).toBe(1);
    expect(s.planned).toBe(1);
  });

  it("only derives cost per enquiry when the campaign is named on an enquiry", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [entry({ id: "a", notes: "came from Winter Drive" })],
        commentary: "",
        notApplicable: false,
      },
      campaigns: {
        records: [campaign({ id: "1", name: "Winter Drive", spend: 8000 })],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseCampaigns(report)!;
    expect(s.costPerEnquiry).toHaveLength(1);
    expect(s.costPerEnquiry[0].cost).toBe(8000);
    expect(s.unattributed).toHaveLength(0);
  });

  it("refuses to invent a cost per enquiry for a campaign nothing is attributed to", () => {
    const report = {
      ...baseReport(),
      enquiries: { records: [entry({ id: "a", notes: "" })], commentary: "", notApplicable: false },
      campaigns: {
        records: [campaign({ id: "1", name: "Winter Drive", spend: 8000 })],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseCampaigns(report)!;
    // Money out, nothing recorded coming back: reported, not divided by zero.
    expect(s.costPerEnquiry).toHaveLength(0);
    expect(s.unattributed).toEqual([{ name: "Winter Drive", spend: 8000 }]);
  });

  it("flags a campaign that overspent its budget", () => {
    const report = {
      ...baseReport(),
      campaigns: {
        records: [campaign({ id: "1", name: "A", budget: 100, spend: 250 })],
        commentary: "",
        notApplicable: false,
      },
    };
    expect(summariseCampaigns(report)!.overBudget).toEqual([{ name: "A", budget: 100, spend: 250 }]);
  });
});

describe("lead summary", () => {
  const lead = (over: Partial<MarketingReport["leads"]["records"][number]> = {}) => ({
    id: "l1",
    source: "Website" as const,
    period: "September 2026",
    leadsGenerated: 100,
    leadsQualified: 60,
    leadsConverted: 30,
    spend: 5000,
    notes: "",
    ...over,
  });

  it("derives conversion and qualification rates from the three counts", () => {
    const report = {
      ...baseReport(),
      leads: { records: [lead()], commentary: "", notApplicable: false },
    };
    const s = summariseLeads(report)!;
    expect(s.generated).toBe(100);
    expect(s.conversionRatePct).toBe(30);
    expect(s.qualificationRatePct).toBe(60);
  });

  it("derives no conversion rate when no leads were generated", () => {
    const report = {
      ...baseReport(),
      leads: { records: [lead({ id: "1", leadsGenerated: 0 })], commentary: "", notApplicable: false },
    };
    // 0 leads is not a 0% conversion rate; it is no denominator.
    expect(summariseLeads(report)!.conversionRatePct).toBeNull();
  });

  it("reports an impossible funnel rather than a rate above 100%", () => {
    const report = {
      ...baseReport(),
      leads: {
        records: [lead({ id: "1", leadsGenerated: 10, leadsConverted: 30 })],
        commentary: "",
        notApplicable: false,
      },
    };
    expect(summariseLeads(report)!.inconsistent).toHaveLength(1);
  });

  it("ranks sources so the best and worst can be named", () => {
    const report = {
      ...baseReport(),
      leads: {
        records: [
          lead({ id: "1", source: "Radio", leadsGenerated: 100, leadsConverted: 5 }),
          lead({ id: "2", source: "Referral", leadsGenerated: 50, leadsConverted: 40 }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summariseLeads(report)!;
    expect(s.bestSource).toBe("Referral");
    expect(s.worstSource).toBe("Radio");
  });
});

describe("partnership summary", () => {
  const partner = (over: Partial<MarketingReport["partnerships"]["records"][number]> = {}) => ({
    id: "p1",
    partner: "Acme Foods",
    type: "Referral" as const,
    status: "Active" as const,
    startDate: "2026-01-01",
    endDate: "",
    contribution: "Cash" as const,
    value: 50000,
    contactPerson: "Jane",
    notes: "",
    ...over,
  });

  it("counts active partnerships and reports ended ones rather than hiding them", () => {
    const report = {
      ...baseReport(),
      partnerships: {
        records: [
          partner({ id: "1", partner: "A" }),
          partner({ id: "2", partner: "B", status: "Prospect" }),
          partner({ id: "3", partner: "C", status: "Lapsed" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summarisePartnerships(report)!;
    expect(s.active).toBe(1);
    expect(s.prospects).toBe(1);
    expect(s.ended).toBe(1);
    expect(s.total).toBe(3);
  });

  it("flags an active partnership whose end date has passed", () => {
    const report = {
      ...baseReport(),
      partnerships: {
        records: [partner({ id: "1", partner: "Old", endDate: "2026-06-30" })],
        commentary: "",
        notApplicable: false,
      },
    };
    const s = summarisePartnerships(report, new Date("2026-09-30"))!;
    // Reads as live, is not: this is the most misleading thing the register
    // can contain, so the engine names it.
    expect(s.expired).toEqual([{ partner: "Old", endDate: "2026-06-30" }]);
  });
});

describe("website summary", () => {
  const web = (over: Partial<MarketingReport["website"]["records"][number]> = {}) => ({
    id: "w1",
    period: "2026-09",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    sessions: 1000,
    uniqueVisitors: 800,
    enquiriesFromSite: 50,
    conversions: 60,
    topLandingPage: "/programmes",
    notes: "",
    ...over,
  });

  it("derives the site enquiry rate from sessions and site enquiries", () => {
    const report = {
      ...baseReport(),
      website: { records: [web()], commentary: "", notApplicable: false },
    };
    const s = summariseWebsite(report)!;
    expect(s.sessions).toBe(1000);
    expect(s.enquiryRatePct).toBe(5);
    expect(s.returningSharePct).toBeCloseTo(20);
  });

  it("derives no enquiry rate when no sessions were recorded", () => {
    const report = {
      ...baseReport(),
      website: { records: [web({ id: "1", sessions: null })], commentary: "", notApplicable: false },
    };
    expect(summariseWebsite(report)!.enquiryRatePct).toBeNull();
  });

  it("names site enquiries the enquiry register does not contain", () => {
    const report = {
      ...baseReport(),
      enquiries: { records: [entry({ id: "a" })], commentary: "", notApplicable: false },
      website: { records: [web()], commentary: "", notApplicable: false },
    };
    // Analytics says 50, the enquiry register holds 1 web enquiry.
    expect(summariseWebsite(report)!.unmatchedSiteEnquiries).toBe(49);
  });
});

describe("KPI computation", () => {
  const kpiList = [
    ...MARKETING_SUBMISSION_KPIS,
    { id: MARKETING_KPI_IDS.enquiries, name: "Student Enquiries" },
    { id: MARKETING_KPI_IDS.conversion, name: "Enquiry-to-Enrolment Conversion" },
  ] as Kpi[];

  it("derives the two pre-existing KPIs from the enquiry register", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [
          entry({ id: "a" }),
          entry({ id: "b" }),
          entry({ id: "c" }),
          entry({ id: "d" }),
          entry({ id: "e", outcome: "Not enrolled - chose elsewhere" }),
        ],
        commentary: "",
        notApplicable: false,
      },
    };
    const result = computeMarketingKpis(report, kpiList, CONFIG);
    const byId = Object.fromEntries(result.entries.map((e) => [e.kpiId, e.value]));
    expect(byId[MARKETING_KPI_IDS.enquiries]).toBe(5);
    expect(byId[MARKETING_KPI_IDS.conversion]).toBe(80);
  });

  it("skips the conversion rate rather than reporting zero when no outcomes exist", () => {
    const report = {
      ...baseReport(),
      enquiries: {
        records: [entry({ id: "a", outcome: "", outcomeDate: "", status: "New" })],
        commentary: "",
        notApplicable: false,
      },
    };
    const result = computeMarketingKpis(report, kpiList, CONFIG);
    // "No outcomes recorded" is not "a 0% conversion rate".
    expect(result.entries.find((e) => e.kpiId === MARKETING_KPI_IDS.conversion)).toBeUndefined();
    expect(result.skipped.find((s) => s.kpiId === MARKETING_KPI_IDS.conversion)?.detail).toMatch(/outcomes/i);
    // The enquiry count itself is still derivable.
    expect(result.entries.find((e) => e.kpiId === MARKETING_KPI_IDS.enquiries)?.value).toBe(1);
  });

  it("skips every KPI on an empty submission and explains each one", () => {
    const result = computeMarketingKpis(baseReport(), kpiList, CONFIG);
    expect(result.entries).toHaveLength(0);
    expect(result.skipped).toHaveLength(8);
    for (const s of result.skipped) {
      expect(s.detail.length).toBeGreaterThan(20);
    }
  });
});

describe("status preview", () => {
  it("will not show a green light for a figure with no approved threshold", () => {
    const kpi = MARKETING_SUBMISSION_KPIS.find((k) => k.id === MARKETING_KPI_IDS.leadsGenerated)!;
    expect(kpi.greenThreshold).toBeNull();
    const preview = previewMarketingStatus(kpi, 500);
    expect(preview.status).toBe("threshold_unset");
    expect(preview.thresholdNote).toMatch(/not configured/i);
  });

  it("judges a live preview by its value, not by the stored availability flag", () => {
    const kpi = MARKETING_SUBMISSION_KPIS.find((k) => k.id === MARKETING_KPI_IDS.leadsGenerated)!;
    // dataAvailable is false until a submission lands; the preview must still
    // show the value the manager just typed.
    expect(kpi.dataAvailable).toBe(false);
    expect(previewMarketingStatus(kpi, 500).status).not.toBe("not_available");
  });

  it("reports an empty figure as no data rather than not-available", () => {
    const kpi = MARKETING_SUBMISSION_KPIS.find((k) => k.id === MARKETING_KPI_IDS.leadsGenerated)!;
    expect(previewMarketingStatus(kpi, null).status).toBe("no_data");
  });

  it("still applies the approved thresholds carried over from the demo data", () => {
    const enquiriesKpi: Kpi = {
      id: MARKETING_KPI_IDS.enquiries,
      name: "Student Enquiries",
      department: "Marketing",
      unit: "count",
      currentValue: 148,
      previousValue: 210,
      target: 250,
      greenThreshold: 220,
      amberThreshold: 160,
      history: [],
      measurementFrequency: "monthly",
      owner: "Marketing Manager",
      insight: "",
    };
    expect(previewMarketingStatus(enquiriesKpi, 240).status).toBe("green");
    expect(previewMarketingStatus(enquiriesKpi, 180).status).toBe("amber");
    expect(previewMarketingStatus(enquiriesKpi, 100).status).toBe("red");
  });
});