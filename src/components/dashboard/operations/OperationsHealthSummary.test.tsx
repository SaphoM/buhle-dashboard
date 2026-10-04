import { render, screen, within } from "@testing-library/react";
import { act, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../../auth/AuthContext";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../../data/DataStoreContext";
import { getStatus } from "../../../data/kpiEngine";
import { blankEnrolmentRecord } from "../../../data/operationsSeed";
import { blankOperationsReport } from "../../../data/operationsTestFixtures";
import { OperationsHealthSummary } from "./OperationsHealthSummary";
import type { OperationsReport } from "../../../types/operations";

/**
 * The Operations dashboard's own summary block.
 *
 * Three behaviours are pinned here, and they are the ones that make this block
 * different from the generic KPI grid:
 *
 * 1. NOT SUBMITTED IS NOT A RESULT. With nothing submitted, the block says so
 *    rather than showing a row of zeroes that read like a performance report.
 * 2. NO TARGET OR VARIANCE COLUMNS. No Operations threshold has been approved,
 *    so there is nothing to compare a figure against, and the block must not
 *    invent one to fill the shape Finance uses.
 * 3. SECTION COVERAGE IS VISIBLE. Seven registers, any of which can be empty. An
 *    empty register is a gap in the evidence, and it is reported as a gap.
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
        <OperationsHealthSummary />
      </DataStoreProvider>
    </AuthProvider>
  );
}

function quality() {
  return screen.getByTestId("operations-data-quality");
}

function coverage() {
  return screen.getByTestId("operations-section-coverage");
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

/** Submits a report for the open Operations cycle through the real store, so
 *  the summary is exercised against the same state the dashboard would see. */
async function submitCoverageReport(fill: (report: OperationsReport) => void) {
  const report = blankOperationsReport();
  fill(report);
  let outcome: Awaited<ReturnType<DataStoreValue["submitOperationsReport"]>> | undefined;
  await act(async () => {
    outcome = await currentStore.submitOperationsReport(report, "Operations Manager");
  });
  expect(outcome?.ok).toBe(true);
}

function markAllNotApplicable(report: OperationsReport) {
  report.attendance.notApplicable = true;
  report.training.notApplicable = true;
  report.completion.notApplicable = true;
  report.dropouts.notApplicable = true;
  report.projects.notApplicable = true;
  report.assets.notApplicable = true;
}

describe("Operations health summary", () => {
  it("states that nothing has been submitted instead of showing zeroes", () => {
    renderSummary();

    expect(within(quality()).getByText("Not submitted")).toBeTruthy();
    expect(quality().textContent).toMatch(/no KPI below reports a performance result/i);
    // Nothing may read as a derived figure before anything is submitted.
    expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
  });

  it("names the register each headline figure was derived from", () => {
    renderSummary();

    // A figure without its basis is not defensible in front of a board.
    for (const basis of [
      "Enrolment register",
      "Session attendance register",
      "Completion register",
      "Dropout register",
      "Project register",
      "Asset register",
    ]) {
      expect(screen.getAllByText(basis).length).toBeGreaterThan(0);
    }
  });

  it("has no target or variance columns, because no Operations threshold is approved", () => {
    renderSummary();

    // Finance shows targets and variances because Finance has approved ones.
    // Showing the same columns here with empty cells would imply a comparison
    // that does not exist.
    expect(screen.queryByText(/^Target$/)).toBeNull();
    expect(screen.queryByText(/^Variance$/)).toBeNull();
    // And no figure is dressed in a Green verdict.
    for (const id of [
      "kpi-enrolment",
      "kpi-attendance-rate",
      "kpi-completion",
      "kpi-dropout-rate",
    ]) {
      expect(getStatus(kpi(id))).toBe("no_data");
    }
  });

  it("reports section coverage and names the registers holding no rows", async () => {
    renderSummary();
    await submitCoverageReport((report) => {
      markAllNotApplicable(report);
      report.enrolment.records = [
        {
          ...blankEnrolmentRecord(),
          id: "enrol-1",
          learner: "Thandi Mokoena",
          course: currentStore.operationsConfig.programmes[0],
          registrationDate: "2026-07-01",
          status: "Enrolled",
        },
      ];
    });

    expect(within(coverage()).getByText(/Section coverage: 1 of 7 sections reported/)).toBeTruthy();
    // The six excluded sections are named as not applicable, so an intentional
    // exclusion is never mistaken for data nobody entered.
    expect(coverage().textContent).toMatch(/marked not applicable/i);
    expect(coverage().textContent).not.toMatch(/No data for Attendance/i);
  });

  it("shows a submitted position with its provenance", async () => {
    renderSummary();
    await submitCoverageReport((report) => {
      markAllNotApplicable(report);
      report.enrolment.records = [
        {
          ...blankEnrolmentRecord(),
          id: "enrol-1",
          learner: "Thandi Mokoena",
          course: currentStore.operationsConfig.programmes[0],
          registrationDate: "2026-07-01",
          status: "Enrolled",
        },
      ];
    });

    // Submitted, and recorded as manual entry rather than a workbook import.
    expect(within(quality()).getByText("Submitted")).toBeTruthy();
    expect(quality().textContent).toMatch(/submitted manually/i);

    // The derived figure is on the KPI the Executive views already read.
    expect(kpi("kpi-enrolment").currentValue).toBe(1);
    // The figure is now real and available, but still unjudged: no threshold is
    // approved, so it reports threshold_unset rather than Green.
    expect(kpi("kpi-enrolment").dataAvailable).toBe(true);
    expect(getStatus(kpi("kpi-enrolment"))).toBe("threshold_unset");
  });

  it("says plainly that no figure carries a verdict until a threshold is approved", () => {
    renderSummary();

    expect(screen.getByText(/no figure here carries a Green\/Amber\/Red verdict/i)).toBeTruthy();
  });
});