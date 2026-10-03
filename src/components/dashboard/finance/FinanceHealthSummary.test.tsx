import { render, screen, waitFor, within } from "@testing-library/react";
import { act, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../../auth/AuthContext";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../../data/DataStoreContext";
import { createBlankFinanceReport } from "../../../data/financeSeed";
import { recordImportFailure } from "../../../data/financeImport";
import type { ReportingFrequency } from "../../../types";
import { DEFAULT_FINANCE_CONFIG } from "../../../data/financeSeed";
import { FinanceHealthSummary } from "./FinanceHealthSummary";

/**
 * The Finance dashboard's data-quality line (spec Sections 23, 33 and 38).
 *
 * Section 33 is the requirement being pinned here: a manager looking at the
 * Finance dashboard must be able to tell apart a position that was submitted, a
 * draft still in progress, a workbook import that failed, and nothing submitted
 * at all. None of those may present as a performance result, and none may be
 * silent.
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
        <FinanceHealthSummary />
      </DataStoreProvider>
    </AuthProvider>
  );
}

const CYCLE_ID = "cyc-finance-2026-09";

function blankReport() {
  return createBlankFinanceReport({
    cycleId: CYCLE_ID,
    reportingPeriod: "September 2026",
    frequency: "Monthly" as ReportingFrequency,
    startDate: "2026-09-01",
    dueDate: "2026-10-05",
    config: DEFAULT_FINANCE_CONFIG,
  });
}

function quality() {
  return screen.getByTestId("finance-data-quality");
}

describe("Finance health summary", () => {
  it("states that nothing has been submitted instead of showing a result", () => {
    renderSummary();

    expect(within(quality()).getByText("Not submitted")).toBeTruthy();
    expect(quality().textContent).toMatch(/no KPI below reports a performance result/i);
  });

  it("shows the six headline metrics with their targets and statuses", () => {
    renderSummary();

    // Section 23 names exactly these six for the Finance summary.
    for (const label of [
      "Revenue",
      "Cash balance",
      "Budget utilisation",
      "Debtors 90+ days",
      "Creditors 90+ days",
      "Operating surplus / (deficit)",
    ]) {
      expect(screen.getByRole("rowheader", { name: label })).toBeTruthy();
    }
    // Columns Section 23 asks for: current value, target, variance, status.
    expect(screen.getByRole("columnheader", { name: "Current" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Target" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Variance" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeTruthy();
  });

  it("marks a draft as a draft, not as a submitted position", async () => {
    renderSummary();

    await act(async () => {
      currentStore.saveFinanceDraft(blankReport(), "Finance Manager");
    });

    await waitFor(() => expect(within(quality()).getByText("Draft in progress")).toBeTruthy());
    expect(quality().textContent).toMatch(/has not been submitted/i);
  });

  it("says the import failed, and says the figures below are not refreshed", async () => {
    renderSummary();

    await act(async () => {
      const failed = recordImportFailure(
        blankReport(),
        "The workbook is password protected.",
        "Budget Monitor.xlsx",
        "revenue"
      );
      currentStore.saveFinanceDraft(failed, "Finance Manager");
    });

    // Section 33: DATA IMPORT FAILED is its own state, distinct from an empty
    // section, and it must not leave stale figures looking current.
    await waitFor(() => expect(within(quality()).getByText("Data import failed")).toBeTruthy());
    expect(quality().textContent).toMatch(/password protected/i);
    expect(quality().textContent).toMatch(/not a refreshed position/i);
  });
});