import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ToastProvider } from "../common/ToastContext";
import { FarmingSubmitDataModal } from "./FarmingSubmitDataModal";
import { DEFAULT_FARMING_CONFIG } from "../../data/farmingSeed";
import { FARMING_KPI_IDS } from "../../data/farmingSeed";
import { computeFarmingKpis } from "../../data/farmingEngine";

/**
 * End-to-end coverage of the Commercial Farming submission.
 *
 * Each test drives the real modal with real clicks and typing, then asserts
 * against the real store, so what is verified is what a farm manager would
 * actually get rather than a mock of it.
 *
 * The behaviours pinned here are the ones the workflow exists to guarantee:
 *
 *  1. ALL SEVEN REGISTERS PRESENT AND REACHABLE. Farming has more registers than
 *     any other department, so a missing one is the specific failure worth
 *     catching.
 *  2. AN INCOMPLETE SUBMISSION IS REFUSED, loudly, and names the section.
 *  3. NO RATE IS EVER TYPED. Revenue and the feed cost ratio are computed from
 *     quantity x price and from the cost and sales registers. This is the whole
 *     point of the register model and the easiest thing to regress.
 *  4. A RATE WITH NO DENOMINATOR IS NOT ZERO. Mortality rows with no livestock
 *     rows must leave the rate uncalculated, because "no deaths recorded" and
 *     "no stock to measure against" are different claims.
 */

let currentStore: DataStoreValue;

function StoreProbe() {
  const store = useDataStore();
  useEffect(() => {
    currentStore = store;
  }, [store]);
  return null;
}

function renderModal() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <DataStoreProvider>
          <StoreProbe />
          <FarmingSubmitDataModal open onClose={() => {}} />
        </DataStoreProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  currentStore = undefined as unknown as DataStoreValue;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function goToSection(name: RegExp) {
  await user.click(await screen.findByRole("button", { name }));
}

async function markNotApplicable(what: RegExp) {
  await user.click(screen.getByRole("checkbox", { name: what }));
}

async function reviewSubmission() {
  await goToSection(/^Costs/);
  await user.click(screen.getByRole("button", { name: /Review Submission/ }));
}

/** The minimum that makes a sale line legal: date, product, channel, quantity,
 *  unit, price and payment status. */
async function addOneSale() {
  await goToSection(/^Sales/);
  await user.click(screen.getByRole("button", { name: /Add sale/ }));
  const row = screen.getByRole("group", { name: /Row 1/ });
  await user.type(within(row).getByLabelText(/^Sale date/), "2026-10-02");
  await user.type(within(row).getByLabelText(/^Product/), "Spinach");
  await user.selectOptions(within(row).getByLabelText(/^Channel/), DEFAULT_FARMING_CONFIG.salesChannels[0]);
  await user.type(within(row).getByLabelText(/^Quantity/), "40");
  await user.type(within(row).getByLabelText(/^Unit/), "kg");
  await user.type(within(row).getByLabelText(/^Price per unit/), "12.50");
  await user.selectOptions(within(row).getByLabelText(/^Payment status/), "Paid");
}

/** A cost line needs a date, category, centre, description and amount. */
async function addOneFeedCost() {
  await goToSection(/^Costs/);
  await user.click(screen.getByRole("button", { name: /Add cost/ }));
  const row = screen.getByRole("group", { name: /Row 1/ });
  await user.type(within(row).getByLabelText(/^Date/), "2026-10-03");
  await user.selectOptions(within(row).getByLabelText(/^Category/), "Feed");
  await user.selectOptions(within(row).getByLabelText(/^Cost centre/), "Livestock");
  await user.type(within(row).getByLabelText(/^Amount/), "2000");
}

/** Marks the six registers that are not part of the scenario Not Applicable,
 *  which leaves a report that is valid, submittable, and derives only what it
 *  can honestly derive. Kept as two variants because which register is left
 *  standing is exactly what each test is about. */
async function excludeAllExcept(...keep: string[]) {
  const sections: [RegExp, RegExp][] = [
    [/^Production/, /Production reporting/],
    [/^Livestock/, /Livestock reporting/],
    [/^Mortality/, /Mortality reporting/],
    [/^Disease/, /Disease reporting/],
    [/^Water/, /Water reporting/],
    [/^Sales/, /Sales reporting/],
    [/^Costs/, /Cost reporting/],
  ];
  for (const [tab, toggle] of sections) {
    if (keep.some((k) => tab.source.includes(k))) continue;
    await goToSection(tab);
    await markNotApplicable(toggle);
  }
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

describe("FarmingSubmitDataModal", () => {
  it("offers all seven registers", async () => {
    renderModal();

    for (const label of ["Production", "Livestock", "Mortality", "Disease", "Water", "Sales", "Costs"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${label}`) })).not.toBeNull();
    }

    // Progress is counted across all seven, not a subset.
    expect(await screen.findByText(/Progress: 0 \/ 7 sections completed/)).not.toBeNull();
  });

  it("reaches every section and its add control", async () => {
    renderModal();

    const adds: [RegExp, RegExp][] = [
      [/^Production/, /Add crop record/],
      [/^Livestock/, /Add livestock count/],
      [/^Mortality/, /Add mortality record/],
      [/^Disease/, /Add disease case/],
      [/^Water/, /Add water reading/],
      [/^Sales/, /Add sale/],
      [/^Costs/, /Add cost/],
    ];

    for (const [tab, addControl] of adds) {
      await goToSection(tab);
      expect(await screen.findByRole("button", { name: addControl })).not.toBeNull();
    }
  });

  it("refuses an incomplete submission and names the section", async () => {
    renderModal();

    await reviewSubmission();

    // The refusal is a panel, not only a toast, because otherwise the dialog
    // silently fails to open and the click looks like it did nothing. It names
    // the sections so the manager knows where to go.
    expect(await screen.findByText(/issue\(s\) must be fixed before this can be submitted/)).not.toBeNull();
    expect(await screen.findByText(/No rows in the production register/i)).not.toBeNull();
  });

  it("derives revenue from quantity and price rather than accepting a typed total", async () => {
    renderModal();

    await excludeAllExcept("Sales");
    await addOneSale();
    await reviewSubmission();
    await user.click(await screen.findByRole("button", { name: /Submit Farming Data/ }));

    await waitFor(() => {
      // 40 kg at R12.50 is R500. Nothing in the form could type that total.
      expect(kpi(FARMING_KPI_IDS.farmRevenue).currentValue).toBe(500);
    });
  });

  it("derives the feed cost ratio from the cost register rather than accepting a typed ratio", async () => {
    renderModal();

    await excludeAllExcept("Sales", "Costs");
    await addOneSale();
    await addOneFeedCost();
    await reviewSubmission();
    await user.click(await screen.findByRole("button", { name: /Submit Farming Data/ }));

    await waitFor(() => {
      expect(kpi(FARMING_KPI_IDS.totalCosts).currentValue).toBe(2000);
      // Feed is R2000 of the R2000 total, so the ratio is 100%. That can only
      // come out of the cost register: there is no field anywhere in the form
      // that would let anyone type "feed is all of my spending".
      expect(kpi(FARMING_KPI_IDS.feedCostRatio).currentValue).toBe(100);
    });
  });

  it("leaves the mortality rate uncalculated when there is no stock to divide by", async () => {
    renderModal();

    // Livestock marked not applicable, mortality given a real row. The numerator
    // exists and the denominator does not.
    await goToSection(/^Livestock/);
    await markNotApplicable(/Livestock reporting/);

    await goToSection(/^Mortality/);
    await user.click(screen.getByRole("button", { name: /Add mortality record/ }));
    const row = screen.getByRole("group", { name: /Row 1/ });
    await user.selectOptions(within(row).getByLabelText(/^Category/), "Cattle");
    await user.type(within(row).getByLabelText(/^Date/), "2026-09-04");
    await user.type(within(row).getByLabelText(/^Head lost/), "2");
    await user.selectOptions(within(row).getByLabelText(/^Cause \(required\)|^Cause$/), "Unknown");

    await goToSection(/^Production/);
    await markNotApplicable(/Production reporting/);
    await goToSection(/^Disease/);
    await markNotApplicable(/Disease reporting/);
    await goToSection(/^Water/);
    await markNotApplicable(/Water reporting/);
    await goToSection(/^Sales/);
    await markNotApplicable(/Sales reporting/);
    await goToSection(/^Costs/);
    await markNotApplicable(/Cost reporting/);

    await reviewSubmission();
    await user.click(await screen.findByRole("button", { name: /Submit Farming Data/ }));

    await waitFor(() => {
      // Reported as unavailable, NOT as 0%. Zero would assert that no deaths
      // occurred among no animals, which is arithmetically fine and evidentially
      // meaningless.
      expect(kpi(FARMING_KPI_IDS.mortality).dataAvailable).toBe(false);
    });

    // And the engine says why, in the words a manager can act on, rather than
    // leaving a blank cell.
    const submitted = currentStore.farmingReports.find((r) => r.status === "Submitted")!;
    const computation = computeFarmingKpis(submitted, currentStore.kpis, currentStore.farmingConfig);
    const skip = computation.skipped.find((s) => s.kpiId === FARMING_KPI_IDS.mortality)!;
    expect(skip.reason).toBe("no_data");
    expect(skip.detail).toMatch(/needs a stock figure/i);
  });
});