import { render, screen, within } from "@testing-library/react";
import { act, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../../auth/AuthContext";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../../data/DataStoreContext";
import { createBlankFarmingReport, DEFAULT_FARMING_CONFIG } from "../../../data/farmingSeed";
import { FARMING_KPI_IDS } from "../../../data/farmingSeed";
import { FarmingHealthSummary } from "./FarmingHealthSummary";
import type { FarmingReport, LivestockRecord, MortalityRecord, SalesRecord } from "../../../types/farming";

/**
 * The Commercial Farming dashboard's own summary block.
 *
 * Four behaviours are pinned here, and they are the ones that make this block
 * different from the generic KPI grid:
 *
 * 1. NOT SUBMITTED IS NOT A RESULT. With nothing submitted, the block says so
 *    rather than showing a row of zeroes that read like a performance report.
 * 2. SECTION COVERAGE IS VISIBLE ACROSS SEVEN REGISTERS. Farming has more
 *    registers than any other department, and an empty one is a gap in the
 *    evidence, reported as a gap.
 * 3. NO RATE IS SHOWN WITHOUT ITS DENOMINATOR. Mortality rows with no livestock
 *    rows is the state this dashboard is most capable of lying about, and the
 *    block calls it out by name.
 * 4. NO TARGET OR VARIANCE COLUMNS. Seven of the nine Farming figures have no
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
        <FarmingHealthSummary />
      </DataStoreProvider>
    </AuthProvider>
  );
}

function quality() {
  return screen.getByTestId("farming-data-quality");
}

function coverage() {
  return screen.getByTestId("farming-section-coverage");
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

function blankReport(): FarmingReport {
  return createBlankFarmingReport({
    cycleId: "cyc-farming-2026-10",
    reportingPeriod: "2026/27 Summer Season",
    frequency: DEFAULT_FARMING_CONFIG.reportingFrequency,
    startDate: "2026-10-01",
    dueDate: "2026-11-15",
  });
}

async function submit(report: FarmingReport) {
  let outcome: Awaited<ReturnType<DataStoreValue["submitFarmingReport"]>> | undefined;
  await act(async () => {
    outcome = await currentStore.submitFarmingReport(report, "Farm Manager");
  });
  // Surfaced rather than swallowed, so a rejected fixture is a named field
  // message instead of a bare false.
  if (outcome && !outcome.ok) throw new Error(outcome.issues.map((i) => i.message).join(" | "));
  expect(outcome?.ok).toBe(true);
}

/** Marks every register the scenario is not about Not Applicable. Needed
 *  because an empty register is a blocking gap, not a completed section: a
 *  report that only populates two registers has to say so explicitly about the
 *  other five, exactly as a manager would. */
function keepOnly(report: FarmingReport, ...keep: (keyof FarmingReport)[]) {
  for (const key of ["production", "livestock", "mortality", "disease", "water", "sales", "costs"] as const) {
    if (keep.includes(key)) continue;
    (report[key] as { notApplicable: boolean }).notApplicable = true;
  }
}

function stock(over: Partial<LivestockRecord> = {}): LivestockRecord {
  return {
    id: "ls-1",
    category: "Cattle",
    breed: "Bonsmara",
    countDate: "2026-10-01",
    headCount: 100,
    breedingFemales: 40,
    additions: 0,
    disposals: 0,
    ...over,
  } as LivestockRecord;
}

function death(over: Partial<MortalityRecord> = {}): MortalityRecord {
  return {
    id: "mo-1",
    category: "Cattle",
    date: "2026-10-02",
    headCount: 2,
    cause: "Unknown",
    causeDetail: "",
    postMortemDone: false,
    countedInRate: true,
    disposalMethod: "Burial",
    reportedBy: "",
    ...over,
  } as MortalityRecord;
}

function sale(over: Partial<SalesRecord> = {}): SalesRecord {
  return {
    id: "sa-1",
    saleDate: "2026-10-02",
    product: "Spinach",
    channel: "Formal market",
    buyer: "Fresh Mart",
    quantity: 40,
    unit: "kg",
    unitPrice: 12.5,
    paymentStatus: "Paid",
    ...over,
  } as SalesRecord;
}

describe("FarmingHealthSummary", () => {
  it("says nothing has been submitted rather than showing zeroes", () => {
    renderSummary();

    expect(within(quality()).getByText("Not submitted")).toBeTruthy();
    expect(quality().textContent).toMatch(/no submission yet/i);
    expect(screen.getByText(/No Commercial Farming report submitted yet/)).toBeTruthy();
  });

  it("names the register behind each headline figure", () => {
    renderSummary();

    // The basis is a column, not a tooltip, because it is the thing a rate gets
    // argued over on.
    expect(screen.getByText("Mortality register over livestock register")).toBeTruthy();
    expect(screen.getAllByText("Sales register").length).toBeGreaterThan(0);
    expect(screen.getByText("Production register")).toBeTruthy();
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
      currentStore.saveFarmingDraft(blankReport(), "Farm Manager");
    });

    const text = coverage().textContent ?? "";
    expect(text).toMatch(/0 of 7 sections reported/);
    // Every register is named, because "several are missing" is not actionable.
    for (const label of ["Production", "Livestock", "Mortality", "Disease", "Water", "Sales", "Costs"]) {
      expect(text).toContain(label);
    }
  });

  it("counts a register marked Not Applicable as excluded rather than missing", async () => {
    renderSummary();

    const report = blankReport();
    report.livestock.records = [stock()];
    report.sales.records = [sale()];
    keepOnly(report, "livestock", "sales");
    await submit(report);

    const text = coverage().textContent ?? "";
    expect(text).toMatch(/2 of 7 sections reported/);
    expect(text).toMatch(/Production/);
    expect(text).toMatch(/marked not applicable/);
    expect(text).not.toMatch(/No data for Production/);
  });

  it("says a mortality rate has no stock to measure against", async () => {
    renderSummary();

    const report = blankReport();
    // Deaths exist, but none confirmed for the rate, and the livestock register
    // is explicitly Not Applicable rather than silently empty. This is the only
    // way to reach the state, and deliberately so: confirmed deaths with no
    // stock are blocked at submission, because the mortality rate is the one
    // figure a live Board escalation rests on.
    report.mortality.records = [death({ countedInRate: false })];
    keepOnly(report, "mortality");
    await submit(report);

    expect(within(quality()).getByText(/no stock to measure against/i)).toBeTruthy();
    expect(quality().textContent).toMatch(/left uncalculated rather than reported against a denominator of zero/i);
    expect(kpi(FARMING_KPI_IDS.mortality).dataAvailable).toBe(false);
  });

  it("shows the derived revenue once a sale is submitted", async () => {
    renderSummary();

    const report = blankReport();
    report.livestock.records = [stock()];
    report.mortality.records = [death()];
    report.sales.records = [sale()];
    keepOnly(report, "livestock", "mortality", "sales");
    await submit(report);

    // 40 kg at R12.50, from the register. Not typed.
    expect(kpi(FARMING_KPI_IDS.farmRevenue).currentValue).toBe(500);
    // Two deaths over 100 head is 2%.
    expect(kpi(FARMING_KPI_IDS.mortality).currentValue).toBe(2);
    expect(within(quality()).getByText("Submitted")).toBeTruthy();
  });

  it("states how many figures can carry a verdict instead of implying all nine can", async () => {
    renderSummary();

    const text = coverage().textContent ?? "";
    const match = text.match(/(\d) of 9 figures carry a threshold/);
    expect(match).not.toBeNull();
    // Revenue and mortality only. Asserted as a range rather than an exact
    // count so that agreeing a new limit later does not fail this test for the
    // wrong reason, but it must never read as all nine.
    expect(Number(match![1])).toBeGreaterThan(0);
    expect(Number(match![1])).toBeLessThan(9);
  });
});