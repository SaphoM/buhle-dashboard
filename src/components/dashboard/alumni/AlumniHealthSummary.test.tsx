import { render, screen, within } from "@testing-library/react";
import { act, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../../auth/AuthContext";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../../data/DataStoreContext";
import { createBlankAlumniReport, DEFAULT_ALUMNI_CONFIG } from "../../../data/alumniSeed";
import { AlumniHealthSummary } from "./AlumniHealthSummary";
import { ALUMNI_KPI_IDS, type AlumniReport, type EmploymentRecord } from "../../../types/alumni";

/**
 * The Alumni dashboard's own summary block.
 *
 * Four behaviours are pinned here, and they are the ones that make this block
 * different from the generic KPI grid:
 *
 * 1. THE SAMPLE LEADS. Every rate describes the graduates who answered, so the
 *    cohort block sits above the percentages rather than at the bottom.
 * 2. NO COHORT, NO READABLE RATE. Without a cohort size and a traced count the
 *    block says so rather than showing percentages nobody can interpret.
 * 3. A THIN SAMPLE IS REPORTED AND FLAGGED, not hidden and not refused. The
 *    department's job is to report on the graduates it reached, including when
 *    that is very few.
 * 4. NO TARGET OR VARIANCE COLUMNS. Twelve of the thirteen figures have no
 *    approved limit, so the block must not invent one to fill the Finance shape.
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
        <AlumniHealthSummary />
      </DataStoreProvider>
    </AuthProvider>
  );
}

function quality() {
  return screen.getByTestId("alumni-data-quality");
}

function cohortBlock() {
  return screen.getByTestId("alumni-cohort-coverage");
}

function coverage() {
  return screen.getByTestId("alumni-section-coverage");
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

function blankReport(): AlumniReport {
  return createBlankAlumniReport({
    cycleId: "cyc-alumni-2026-h2",
    reportingPeriod: "H2 2026 Cohort",
    frequency: DEFAULT_ALUMNI_CONFIG.reportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-11-01",
  });
}

async function submit(report: AlumniReport) {
  let outcome: Awaited<ReturnType<DataStoreValue["submitAlumniReport"]>> | undefined;
  await act(async () => {
    outcome = await currentStore.submitAlumniReport(report, "Alumni Coordinator");
  });
  // Surfaced rather than swallowed, so a rejected fixture is a named field
  // message instead of a bare false.
  if (outcome && !outcome.ok) throw new Error(outcome.issues.map((i) => `${i.field}: ${i.message}`).join(" | "));
  expect(outcome?.ok).toBe(true);
}

function employed(reference: string, over: Partial<EmploymentRecord> = {}): EmploymentRecord {
  return {
    id: `e-${reference}`,
    graduateId: reference,
    status: "Employed",
    verified: true,
    dateConfirmed: "2026-10-02",
    employer: "Shoprite",
    jobTitle: "",
    monthlyIncome: 4500,
    notes: "",
    ...over,
  } as EmploymentRecord;
}

describe("AlumniHealthSummary", () => {
  it("says nothing has been submitted rather than showing zeroes", () => {
    renderSummary();

    expect(within(quality()).getByText("Not submitted")).toBeTruthy();
    expect(screen.getByText(/No Alumni tracer study submitted yet/)).toBeTruthy();
  });

  it("leads with the sample, because that is what the rates describe", () => {
    renderSummary();

    const block = cohortBlock();
    expect(within(block).getByText(/No cohort recorded yet/)).toBeTruthy();
    expect(block.textContent).toMatch(/none of the percentages below can be read as a share of the cohort/i);
  });

  it("names the register behind each headline figure", () => {
    renderSummary();

    // The basis is a column, not a tooltip, because a rate with no visible
    // denominator behind it is the figure most easily argued with.
    expect(screen.getByText("Farm productivity register")).toBeTruthy();
    expect(screen.getAllByText("Business register").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Loan register").length).toBeGreaterThan(0);
    expect(screen.getByText("Cohort block")).toBeTruthy();
  });

  it("reports no target or variance columns", () => {
    renderSummary();

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("Metric");
    expect(headers).toContain("Derived from");
    expect(headers).not.toContain("Target");
    expect(headers).not.toContain("Variance");
  });

  it("counts sections with rows and names the ones without", async () => {
    renderSummary();

    await act(async () => {
      currentStore.saveAlumniDraft(blankReport(), "Alumni Coordinator");
    });

    const text = coverage().textContent ?? "";
    expect(text).toMatch(/0 of 7 sections reported/);
    for (const label of [
      "Employment",
      "Business Sustainability",
      "Farm Productivity",
      "Loan Repayment",
      "Referrals",
      "Market Participation",
      "Engagement",
    ]) {
      expect(text).toContain(label);
    }
  });

  it("counts a register marked Not Applicable as excluded rather than missing", async () => {
    renderSummary();

    const report = blankReport();
    report.cohort.graduatesInCohort = 100;
    report.cohort.tracedThisPeriod = 4;
    report.cohort.tracingMethod = "Telephone";
    report.employment.records = [employed("G1"), employed("G2")];
    report.loans.notApplicable = true;
    await submit(report);

    const text = coverage().textContent ?? "";
    expect(text).toMatch(/1 of 7 sections reported/);
    expect(text).toMatch(/Loan Repayment marked not applicable/);
    // Loan Repayment is excluded rather than missing, and Employment holds rows,
    // so neither belongs in the gap list. The five genuinely empty registers do.
    const gap = text.match(/No data for ([^.]+)\./)?.[1] ?? "";
    expect(gap).not.toContain("Loan Repayment");
    expect(gap).not.toContain("Employment");
    expect(gap).toContain("Business Sustainability");
  });

  it("flags a thin sample rather than hiding it or refusing it", async () => {
    renderSummary();

    // Four of a hundred traced is a 4% response rate, well under the department's
    // own minimum. The study is still submitted and still reported, because the
    // graduates who were not reached are exactly the ones worth knowing about.
    const report = blankReport();
    report.cohort.graduatesInCohort = 100;
    report.cohort.tracedThisPeriod = 4;
    report.cohort.tracingMethod = "Telephone";
    report.employment.records = [
      employed("G1"),
      employed("G2"),
      employed("G3", { status: "Unemployed - seeking", employer: "" }),
      employed("G4", { status: "Unemployed - seeking", employer: "" }),
    ];
    report.loans.notApplicable = true;
    report.business.notApplicable = true;
    report.farm.notApplicable = true;
    report.referrals.notApplicable = true;
    report.market.notApplicable = true;
    report.engagement.notApplicable = true;
    await submit(report);

    expect(cohortBlock().textContent).toMatch(/4 of 100 graduates traced \(4\.0% response rate\)/);
    expect(cohortBlock().textContent).toMatch(/minimum response rate/i);
    // The figures are still there. Flagged, not withheld.
    expect(kpi(ALUMNI_KPI_IDS.employmentRate).currentValue).toBe(50);
  });

  it("says nobody was traced rather than reporting a rate of zero", async () => {
    renderSummary();

    const report = blankReport();
    report.cohort.graduatesInCohort = 60;
    report.cohort.tracedThisPeriod = 0;
    report.employment.notApplicable = true;
    report.loans.notApplicable = true;
    report.business.notApplicable = true;
    report.farm.notApplicable = true;
    report.referrals.notApplicable = true;
    report.market.notApplicable = true;
    report.engagement.notApplicable = true;
    await submit(report);

    // Tracing nobody is a real position. It is emphatically not a 0% result, and
    // the block says so in those words.
    expect(within(quality()).getByText("Nobody was traced in this cycle")).toBeTruthy();
    expect(quality().textContent).toMatch(/not the same as a rate of zero/i);
    expect(cohortBlock().textContent).toMatch(/0 of 60 graduates traced/);
  });

  it("states how many figures can carry a verdict instead of implying all thirteen can", () => {
    renderSummary();

    const match = (coverage().textContent ?? "").match(/(\d+) of 13 figures carry a threshold/);
    expect(match).not.toBeNull();
    // Asserted as a range rather than an exact count so that agreeing a new limit
    // later does not fail this test for the wrong reason, but it must never read
    // as all thirteen.
    expect(Number(match![1])).toBeGreaterThan(0);
    expect(Number(match![1])).toBeLessThan(13);
  });
});