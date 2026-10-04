import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ToastProvider } from "../common/ToastContext";
import { AlumniSubmitDataModal } from "./AlumniSubmitDataModal";
import { DEFAULT_ALUMNI_CONFIG } from "../../data/alumniSeed";
import { ALUMNI_KPI_IDS } from "../../types/alumni";

/**
 * End-to-end coverage of the Alumni tracer study submission.
 *
 * Each test drives the real modal with real clicks and typing, then asserts
 * against the real store, so what is verified is what an alumni coordinator would
 * actually get rather than a mock of it.
 *
 * The behaviours pinned here are the ones the workflow exists to guarantee:
 *
 *  1. ALL SEVEN REGISTERS PRESENT AND REACHABLE, plus the cohort block that every
 *     rate is measured against.
 *  2. A CONTRADICTION IS REFUSED, and a FACT IS NOT. This is the distinction the
 *     whole department turns on, and it is the easiest thing to regress.
 *  3. NO RATE IS EVER TYPED. The employment rate is computed from the employment
 *     register against the cohort block.
 *  4. AN EMPTY REGISTER IS NOT A COMPLETED SECTION, even though the validator
 *     permits submitting one. The progress strip must never read 7 / 7 over a
 *     report that evidences nothing.
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
          <AlumniSubmitDataModal open onClose={() => {}} />
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
  // Review is only offered from the last section, so walk there first.
  await goToSection(/^Engagement/);
  await user.click(screen.getByRole("button", { name: /Review Submission/ }));
}

/** The cohort block is the denominator for every rate, so it is filled first. */
async function fillCohort(cohortSize = 100, traced = 4) {
  await goToSection(/^Start Here/);
  await user.type(screen.getByLabelText(/^Graduates in cohort/), String(cohortSize));
  await user.type(screen.getByLabelText(/^Traced this period/), String(traced));
  await user.selectOptions(screen.getByLabelText(/^Tracing method/), DEFAULT_ALUMNI_CONFIG.tracingMethods[0]);
}

/** One traced graduate, verified, with a confirmation date. */
async function addGraduate(reference: string, status: string, employer?: string) {
  await user.click(screen.getByRole("button", { name: /Add a graduate/ }));
  const row = screen.getByRole("group", { name: new RegExp(`Row ${Number(reference.slice(1))}`) });
  await user.type(within(row).getByLabelText(/^Graduate reference/), reference);
  await user.selectOptions(within(row).getByLabelText(/^Employment status/), status);
  // An employed graduate needs the employer's name, because "Employed" with no
  // employer is exactly the kind of half-answered row the validator refuses.
  if (employer) await user.type(within(row).getByLabelText(/^Employer/), employer);
  await user.click(within(row).getByRole("checkbox", { name: /Confirmed with the graduate/ }));
  await user.type(within(row).getByLabelText(/^Date confirmed/), "2026-10-02");
}

/**
 * Four traced graduates, one of them employed.
 *
 * Four rather than one because the employment rate is a proportion of the
 * VERIFIED ROWS in the register, not of the cohort: one employed out of one traced
 * is 100%, which would not prove anything. One in four is a rate worth deriving.
 */
async function addFourTracedGraduates() {
  await goToSection(/^Employment/);
  await addGraduate("G1", DEFAULT_ALUMNI_CONFIG.employmentStatuses[0], "Shoprite");
  await addGraduate("G2", "Unemployed - seeking");
  await addGraduate("G3", "Unemployed - seeking");
  await addGraduate("G4", "Unemployed - seeking");
}

/** Marks every register the scenario is not about Not Applicable. */
async function excludeAllExcept(...keep: string[]) {
  const sections: [RegExp, RegExp][] = [
    [/^Employment/, /Employment reporting/],
    [/^Business Sustainability/, /Business reporting/],
    [/^Farm Productivity/, /Farm reporting/],
    [/^Loan Repayment/, /Loan reporting/],
    [/^Referrals/, /Referral reporting/],
    [/^Market Participation/, /Market reporting/],
    [/^Engagement/, /Engagement reporting/],
  ];
  for (const [tab, toggle] of sections) {
    if (keep.some((k) => tab.source.includes(k))) continue;
    await goToSection(tab);
    await markNotApplicable(toggle);
  }
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

describe("AlumniSubmitDataModal", () => {
  it("offers the cohort block and all seven registers", async () => {
    renderModal();

    expect(await screen.findByRole("button", { name: /^Start Here/ })).not.toBeNull();
    for (const label of [
      "Employment",
      "Business Sustainability",
      "Farm Productivity",
      "Loan Repayment",
      "Referrals",
      "Market Participation",
      "Engagement",
    ]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${label}`) })).not.toBeNull();
    }

    // Progress is counted across the cohort block and the seven registers.
    expect(await screen.findByText(/Progress: 0 \/ 8 sections completed/)).not.toBeNull();
  });

  it("reaches every section and its add control", async () => {
    renderModal();

    const adds: [RegExp, RegExp][] = [
      [/^Employment/, /Add a graduate/],
      [/^Business Sustainability/, /Add a business/],
      [/^Farm Productivity/, /Add a farm line/],
      [/^Loan Repayment/, /Add a loan/],
      [/^Referrals/, /Add a referral/],
      [/^Market Participation/, /Add a market/],
      [/^Engagement/, /Add an activity/],
    ];

    for (const [tab, addControl] of adds) {
      await goToSection(tab);
      expect(await screen.findByRole("button", { name: addControl })).not.toBeNull();
    }
  });

  it("refuses a contradiction rather than silently accepting it", async () => {
    renderModal();

    await fillCohort(100, 1);
    await goToSection(/^Employment/);
    await user.click(screen.getByRole("button", { name: /Add a graduate/ }));
    const row = screen.getByRole("group", { name: /Row 1/ });
    await user.type(within(row).getByLabelText(/^Graduate reference/), "G1");
    // Unemployed with an employer named is a contradiction somebody can type
    // their way out of, so it refuses.
    await user.selectOptions(within(row).getByLabelText(/^Employment status/), "Unemployed - seeking");
    await user.click(within(row).getByRole("checkbox", { name: /Confirmed with the graduate/ }));
    await user.type(within(row).getByLabelText(/^Date confirmed/), "2026-10-02");
    await user.type(within(row).getByLabelText(/^Employer/), "Shoprite");

    await excludeAllExcept("Employment");
    await reviewSubmission();

    const panel = await screen.findByTestId("alumni-blocking-issues");
    expect(panel.textContent).toMatch(/blocking issue/i);
  });

  it("accepts a thin response rate rather than refusing it", async () => {
    renderModal();

    // Four traced out of a hundred is a 4% response rate, far below any sensible
    // minimum. It is a fact about a hard-to-reach cohort, not a data-entry
    // mistake, so it must not stop the department reporting on it.
    await fillCohort(100, 4);
    await addFourTracedGraduates();
    await excludeAllExcept("Employment");
    await reviewSubmission();

    expect(screen.queryByTestId("alumni-blocking-issues")).toBeNull();
    expect(await screen.findByRole("button", { name: /Submit Alumni Data/ })).not.toBeNull();
  });

  it("derives the employment rate from the register rather than accepting a typed rate", async () => {
    renderModal();

    await fillCohort(100, 4);
    await addFourTracedGraduates();
    await excludeAllExcept("Employment");
    await reviewSubmission();
    await user.click(await screen.findByRole("button", { name: /Submit Alumni Data/ }));

    await waitFor(() => {
      // One employed of four traced. There is no field anywhere in the form that
      // would let anyone type "25%".
      expect(kpi(ALUMNI_KPI_IDS.employmentRate).currentValue).toBe(25);
    });
  });

  it("shows the cohort above the rates on review, because that is what they describe", async () => {
    renderModal();

    await fillCohort(100, 4);
    await addFourTracedGraduates();
    await excludeAllExcept("Employment");
    await reviewSubmission();

    const panel = await screen.findByTestId("alumni-review-cohort");
    expect(panel.textContent).toMatch(/4 of 100 graduates in the cohort were traced/);
    expect(panel.textContent).toMatch(/rates below describe only the graduates who answered/i);
  });

  it("does not count an empty register as a completed section", async () => {
    renderModal();

    await fillCohort(100, 4);
    await addFourTracedGraduates();
    // Every register left empty and unmarked: the validator permits submitting
    // this, because nothing has been claimed. The strip must still say so.
    // One of eight, and deliberately not more:
    //   - the cohort block counts, both halves of the denominator are present;
    //   - employment does NOT count, because one in four is far below the
    //     approved limit, so it reads "Attention Required" rather than Complete.
    //     A section that produced a figure somebody must explain is not done;
    //   - the six untouched registers are No Data, not Complete.
    const progress = await screen.findByText(/Progress:/);
    expect(progress.textContent).toMatch(/Progress: 1 \/ 8 sections completed/);
    expect(within(await screen.findByRole("button", { name: /^Employment/ })).getByText("Attention Required"))
      .not.toBeNull();

    const tab = await screen.findByRole("button", { name: /^Referrals/ });
    expect(within(tab).getByText("No Data")).not.toBeNull();
  });
});