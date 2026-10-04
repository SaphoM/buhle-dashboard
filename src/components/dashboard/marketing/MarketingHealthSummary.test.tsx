import { render, screen, within } from "@testing-library/react";
import { act, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../../auth/AuthContext";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../../data/DataStoreContext";
import { getStatus } from "../../../data/kpiEngine";
import { createBlankMarketingReport, DEFAULT_MARKETING_CONFIG } from "../../../data/marketingSeed";
import { MarketingHealthSummary } from "./MarketingHealthSummary";
import type { EnquiryRecord, MarketingReport } from "../../../types/marketing";

/**
 * The Marketing dashboard's own summary block.
 *
 * Four behaviours are pinned here, and they are the ones that make this block
 * different from the generic KPI grid:
 *
 * 1. NOT SUBMITTED IS NOT A RESULT. With nothing submitted, the block says so
 *    rather than showing a row of zeroes that read like a performance report.
 * 2. NO TARGET OR VARIANCE COLUMNS. Six of the eight Marketing KPIs have no
 *    approved threshold, so there would be nothing to compare most figures
 *    against, and the block must not invent one to fill the shape Finance uses.
 * 3. SECTION COVERAGE IS VISIBLE. Five registers, any of which can be empty. An
 *    empty register is a gap in the evidence, and it is reported as a gap.
 * 4. "NO OUTCOMES RECORDED" IS NOT "A 0% RATE". This is the state Marketing has
 *    and the other register departments do not, and the block has to say it,
 *    because a submitted enquiry register with no outcomes is a real and easily
 *    misread position.
 */

let currentStore: DataStoreValue;

function StoreProbe() {
  const store = useDataStore();
  useEffect(() => {
    currentStore = store;
  }, [store]);
  return null;
}

function renderSummary() {
  return render(
    <AuthProvider>
      <DataStoreProvider>
        <StoreProbe />
        <MarketingHealthSummary />
      </DataStoreProvider>
    </AuthProvider>
  );
}

function quality() {
  return screen.getByTestId("marketing-data-quality");
}

function coverage() {
  return screen.getByTestId("marketing-section-coverage");
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

function blankReport(): MarketingReport {
  return createBlankMarketingReport({
    cycleId: "cyc-marketing-2026-09",
    reportingPeriod: "September 2026",
    frequency: DEFAULT_MARKETING_CONFIG.reportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-09-20",
  });
}

/** Submits a report for the open Marketing cycle through the real store, so the
 *  summary is exercised against the same state the dashboard would see. */
async function submit(fill: (report: MarketingReport) => void) {
  const report = blankReport();
  fill(report);
  let outcome: Awaited<ReturnType<DataStoreValue["submitMarketingReport"]>> | undefined;
  await act(async () => {
    outcome = await currentStore.submitMarketingReport(report, "Marketing Manager");
  });
  expect(outcome?.ok).toBe(true);
}

function enquiry(over: Partial<EnquiryRecord> = {}): EnquiryRecord {
  return {
    id: "e1",
    channel: DEFAULT_MARKETING_CONFIG.enquiryChannels[0],
    dateReceived: "2026-09-02",
    programmeInterest: "Learnership",
    province: "Mpumalanga",
    contactVerified: true,
    status: "Closed",
    outcome: "Enrolled",
    outcomeDate: "2026-09-10",
    handledBy: "Karabo",
    notes: "",
    ...over,
  };
}

describe("Marketing health summary", () => {
  it("states that nothing has been submitted instead of showing zeroes", () => {
    renderSummary();

    expect(within(quality()).getByText("Not submitted")).toBeTruthy();
    expect(quality().textContent).toMatch(/no KPI below reports a performance result/i);
    // The six new figures have nothing behind them yet.
    expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
  });

  it("names the register each headline figure was derived from", () => {
    renderSummary();

    // A conversion rate with no visible basis is the figure most easily argued
    // with in a board meeting.
    for (const basis of [
      "Enquiry register",
      "Enquiry register outcomes",
      "Campaign register",
      "Lead register",
      "Lead register funnel",
      "Partnership register",
      "Website analytics register",
    ]) {
      expect(screen.getAllByText(basis).length).toBeGreaterThan(0);
    }
  });

  it("has no target or variance columns, because six of the eight have no approved threshold", () => {
    renderSummary();

    expect(screen.queryByText(/^Target$/)).toBeNull();
    expect(screen.queryByText(/^Variance$/)).toBeNull();
    // No figure without an approved limit may be dressed in a verdict.
    for (const id of [
      "kpi-campaigns-delivered",
      "kpi-leads-generated",
      "kpi-lead-conversion-rate",
      "kpi-active-partnerships",
      "kpi-website-sessions",
      "kpi-website-enquiry-rate",
    ]) {
      expect(getStatus(kpi(id))).toBe("no_data");
    }
  });

  it("still judges the two pre-existing KPIs on their approved thresholds", async () => {
    renderSummary();

    // These two were on the dashboard before this submission existed, and the
    // demo data already depends on the enquiry KPI, so their limits stand.
    expect(kpi("kpi-enquiries").greenThreshold).toBe(220);
    expect(kpi("kpi-conversion").greenThreshold).toBe(32);
  });

  it("reports section coverage rather than implying every register was filled", () => {
    renderSummary();

    expect(within(coverage()).getByText(/Section coverage: 0 of 5 sections reported/)).toBeTruthy();
    expect(coverage().textContent).toMatch(/not derivable from this submission and are not counted as zero/i);
  });

  it("counts a submitted register as coverage and marks the absent ones as a gap", async () => {
    renderSummary();
    await submit((report) => {
      report.enquiries.records = [enquiry()];
      // Everything else left empty on purpose.
    });

    expect(within(coverage()).getByText(/Section coverage: 1 of 5 sections reported/)).toBeTruthy();
    const text = coverage().textContent ?? "";
    for (const missing of ["Campaigns", "Lead Generation", "Partnerships", "Website Activity"]) {
      expect(text).toContain(missing);
    }
  });

  it("separates a submitted enquiry register with no outcomes from a 0% conversion rate", async () => {
    renderSummary();
    await submit((report) => {
      report.enquiries.records = [
        enquiry({ id: "a", status: "New", outcome: "", outcomeDate: "" }),
        enquiry({ id: "b", status: "Follow-up", outcome: "", outcomeDate: "" }),
      ];
    });

    // The enquiry volume is real and submitted...
    expect(kpi("kpi-enquiries").currentValue).toBe(2);
    // ...but nothing says what became of them, so the rate is not reported at all.
    expect(kpi("kpi-conversion").dataAvailable).toBe(false);
    expect(within(quality()).getByText("Conversion rate has no recorded outcomes")).toBeTruthy();
    expect(quality().textContent).toMatch(/left uncalculated rather than reported as 0%/i);
  });

  it("reports the conversion rate once outcomes exist", async () => {
    renderSummary();
    await submit((report) => {
      report.enquiries.records = [
        enquiry({ id: "a" }),
        enquiry({ id: "b", outcome: "Not enrolled - chose elsewhere", outcomeDate: "2026-09-11" }),
      ];
    });

    expect(kpi("kpi-enquiries").currentValue).toBe(2);
    expect(kpi("kpi-conversion").currentValue).toBe(50);
    expect(within(quality()).getByText("Submitted")).toBeTruthy();
  });

  it("treats a marked Not Applicable register as excluded rather than missing", async () => {
    renderSummary();
    await submit((report) => {
      report.enquiries.records = [enquiry()];
      report.campaigns.notApplicable = true;
      report.leads.notApplicable = true;
      report.partnerships.notApplicable = true;
      report.website.notApplicable = true;
    });

    expect(within(coverage()).getByText(/Section coverage: 1 of 5 sections reported/)).toBeTruthy();
    expect(coverage().textContent).toMatch(/marked not applicable, so it is deliberately excluded/i);
  });

  it("shows a draft as provisional rather than as the submitted position", async () => {
    renderSummary();
    await act(async () => {
      currentStore.saveMarketingDraft(blankReport(), "Marketing Manager");
    });

    expect(within(quality()).getByText("Draft in progress")).toBeTruthy();
    expect(quality().textContent).toMatch(/has not been submitted/i);
  });
});