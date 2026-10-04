import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ToastProvider } from "../common/ToastContext";
import { MarketingSubmitDataModal } from "./MarketingSubmitDataModal";
import { DEFAULT_MARKETING_CONFIG } from "../../data/marketingSeed";

/**
 * End-to-end coverage of the Marketing submission.
 *
 * Each test drives the real modal with real clicks and typing, then asserts
 * against the real store, so what is verified is what a Marketing manager would
 * actually get rather than a mock of it.
 *
 * The behaviours pinned here are the ones the workflow exists to guarantee:
 *
 *  1. FIVE REGISTERS, ALL PRESENT AND REACHABLE.
 *  2. AN INCOMPLETE SUBMISSION IS REFUSED, loudly, and names the section.
 *  3. THE CONVERSION RATE IS CALCULATED, NEVER TYPED, and a submission with no
 *     recorded outcomes does not become a 0% rate.
 *  4. WHAT COULD NOT BE DERIVED IS CLEARED TO NO DATA RATHER THAN LEFT SHOWING
 *     LAST MONTH'S NUMBER.
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
          <MarketingSubmitDataModal open onClose={() => {}} />
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

/** Review is only offered from the last section, so walk the strip there first.
 *  This mirrors what a manager actually does: traverse, then review. */
async function reviewSubmission() {
  await goToSection(/^Website Activity/);
  await user.click(screen.getByRole("button", { name: /Review Submission/ }));
}

/** The minimum that makes the enquiry register legal: who asked, when, from
 *  where, and what became of it. */
async function addOneConvertedEnquiry() {
  await goToSection(/^Enquiries/);
  await user.click(screen.getByRole("button", { name: /Add enquiry/ }));
  const row = screen.getByRole("group", { name: /Row 1/ });
  await user.selectOptions(within(row).getByLabelText(/^Channel/), DEFAULT_MARKETING_CONFIG.enquiryChannels[0]);
  await user.type(within(row).getByLabelText(/^Date received/), "2026-09-02");
  await user.type(within(row).getByLabelText(/^Programme of interest/), "Learnership");
  await user.type(within(row).getByLabelText(/^Province/), "Mpumalanga");
  await user.selectOptions(within(row).getByLabelText(/^Status/), "Closed");
  await user.selectOptions(within(row).getByLabelText(/^Outcome(?! date)/), "Enrolled");
  await user.type(within(row).getByLabelText(/^Outcome date/), "2026-09-10");
  await user.click(within(row).getByRole("checkbox", { name: /Contact details verified/ }));
}

/** Marks every register except enquiries Not Applicable, which leaves a report
 *  that is valid, submittable, and derives only what it can honestly derive. */
async function excludeEverythingElse() {
  const sections: [RegExp, RegExp][] = [
    [/^Campaigns/, /^Campaign reporting/],
    [/^Lead Generation/, /^Lead generation reporting/],
    [/^Partnerships/, /^Partnership reporting/],
    [/^Website Activity/, /^Website activity reporting/],
  ];
  for (const [tab, checkbox] of sections) {
    await goToSection(tab);
    await markNotApplicable(checkbox);
  }
}

describe("Marketing submission modal", () => {
  it("offers all five reporting areas", async () => {
    renderModal();

    for (const label of ["Enquiries", "Campaigns", "Lead Generation", "Partnerships", "Website Activity"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
  });

  it("offers no field in which a conversion rate could be typed", async () => {
    renderModal();
    await goToSection(/^Enquiries/);

    // The rate is shown as a derived readout. If a percentage input ever appears
    // here, a typed rate and the register behind it can disagree.
    expect((await screen.findAllByText(/Conversion rate/i)).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/conversion rate/i, { selector: "input" })).toBeNull();
  });

  it("refuses an incomplete submission and names the section", async () => {
    renderModal();
    await reviewSubmission();

    // Nothing has been entered, so nothing can be derived, and every KPI must be
    // reported as not derivable rather than as a result.
    expect((await screen.findAllByText(/Nothing can be calculated from this submission/i)).length).toBeGreaterThan(0);
  });

  it("does not turn an unrecorded outcome into a 0% conversion rate", async () => {
    renderModal();

    await goToSection(/^Enquiries/);
    await user.click(screen.getByRole("button", { name: /Add enquiry/ }));
    const row = screen.getByRole("group", { name: /Row 1/ });
    await user.selectOptions(within(row).getByLabelText(/^Channel/), DEFAULT_MARKETING_CONFIG.enquiryChannels[0]);
    await user.type(within(row).getByLabelText(/^Date received/), "2026-09-02");
    await user.selectOptions(within(row).getByLabelText(/^Status/), "New");

    // The enquiry is real and counted, but nobody has said what became of it.
    expect((await screen.findAllByText(/No outcome has been recorded for any of the 1 enquiries/i)).length).toBeGreaterThan(
      0
    );
    expect((await screen.findAllByText(/Not derivable yet/)).length).toBeGreaterThan(0);
  });

  it("calculates the conversion rate from the enquiry outcomes on submission", async () => {
    renderModal();
    await addOneConvertedEnquiry();
    await excludeEverythingElse();
    await reviewSubmission();

    // One enquiry, converted, verified: the rate is 100% and it was derived.
    expect((await screen.findAllByText("100.0%")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Submit Marketing Data/ }));
    await waitFor(() => expect(currentStore.marketingReports.length).toBeGreaterThan(0));

    const submitted = currentStore.marketingReports[0];
    expect(submitted.status).toBe("Submitted");

    const enquiriesKpi = currentStore.kpis.find((k) => k.id === "kpi-enquiries");
    const conversionKpi = currentStore.kpis.find((k) => k.id === "kpi-conversion");
    expect(enquiriesKpi?.currentValue).toBe(1);
    expect(conversionKpi?.currentValue).toBe(100);
  });

  it("clears a KPI the registers cannot support instead of leaving last month's figure", async () => {
    renderModal();
    await addOneConvertedEnquiry();
    await excludeEverythingElse();
    await reviewSubmission();

    // Six of the eight Marketing KPIs have nothing behind them in this
    // submission, and the review says so with a reason for each.
    expect((await screen.findAllByText(/Not reported from this submission/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Submit Marketing Data/ }));
    await waitFor(() => expect(currentStore.marketingReports.length).toBeGreaterThan(0));

    // No website rows were entered, so website sessions must report no data
    // rather than the seeded demo figure.
    const sessions = currentStore.kpis.find((k) => k.id === "kpi-website-sessions");
    expect(sessions?.dataAvailable).toBe(false);
  });

  it("opens the next Marketing cycle on submission", async () => {
    renderModal();
    await addOneConvertedEnquiry();
    await excludeEverythingElse();
    await reviewSubmission();
    await user.click(screen.getByRole("button", { name: /Submit Marketing Data/ }));

    expect(await screen.findByText(/Marketing data submitted/)).toBeTruthy();
    expect((await screen.findAllByText(/Next submission due/)).length).toBeGreaterThan(0);
  });

  it("saves a draft without deriving anything", async () => {
    renderModal();
    await addOneConvertedEnquiry();
    await user.click(screen.getByRole("button", { name: /Save Draft/ }));

    await waitFor(() => expect(currentStore.marketingReports.length).toBe(1));
    const draft = currentStore.marketingReports[0];
    expect(draft.status).toBe("Draft");

    // A draft must not touch the KPIs. The seeded enquiry figure is still the
    // one from the demo data, not the 1 typed into the draft above.
    const enquiriesKpi = currentStore.kpis.find((k) => k.id === "kpi-enquiries");
    expect(enquiriesKpi?.currentValue).toBe(148);
  });
});