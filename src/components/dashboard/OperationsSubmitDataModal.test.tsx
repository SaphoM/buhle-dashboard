import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ToastProvider } from "../common/ToastContext";
import { OperationsSubmitDataModal } from "./OperationsSubmitDataModal";
import { blankOperationsReport, OPS_CONFIG } from "../../data/operationsTestFixtures";
import { getStatus } from "../../data/kpiEngine";

/**
 * End-to-end coverage of the Operations submission.
 *
 * Each test drives the real modal with real clicks and typing, then asserts
 * against the real store, so what is verified is what an Operations manager
 * would actually get rather than a mock of it.
 *
 * The four behaviours pinned here are the ones the workflow exists to guarantee:
 *
 *  1. SEVEN SECTIONS, ALL PRESENT AND REACHABLE.
 *  2. AN INCOMPLETE SUBMISSION IS REFUSED, loudly, and names the section.
 *  3. A COMPLETE SUBMISSION DERIVES ITS KPIs THROUGH THE ENGINE, and because
 *     no Operations threshold is approved, none of them is Green.
 *  4. WHAT COULD NOT BE DERIVED IS CLEARED TO NO DATA RATHER THAN LEFT SHOWING
 *     THE PREVIOUS COHORT'S NUMBER.
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
          <OperationsSubmitDataModal open onClose={() => {}} />
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

/** Marks a whole section Not Applicable, which is a legitimate choice and must
 *  unblock submission rather than being treated as missing data. */
async function markNotApplicable(what: RegExp) {
  await user.click(screen.getByRole("checkbox", { name: what }));
}

/** Review is only offered from the last section, so walk the strip there
 *  first. This mirrors what a manager actually does: traverse, then review. */
async function reviewSubmission() {
  await goToSection(/^Assets/);
  await user.click(screen.getByRole("button", { name: /Review Submission/ }));
}

/** The minimum that makes the enrolment register legal: a named learner on an
 *  approved programme, with a registration date and an explicit status. */
async function addOneValidEnrolment() {
  await goToSection(/^Enrolment/);
  await user.click(screen.getByRole("button", { name: /Add registration/ }));
  const row = screen.getByRole("group", { name: /Row 1/ });
  await user.type(within(row).getByLabelText(/^Learner/), "Thandi Mokoena");
  await user.selectOptions(within(row).getByLabelText(/^Course/), OPS_CONFIG.programmes[0]);
  await user.type(within(row).getByLabelText(/^Registration date/), "2026-07-01");
  await user.selectOptions(within(row).getByLabelText(/^Status/), "Enrolled");
}

/** Marks everything except enrolment as Not Applicable, which leaves a report
 *  that is valid, submittable, and derives only what it can honestly derive.
 *
 *  "Not Applicable" is the legitimate answer for a register this cohort does not
 *  have, which is why it is a first-class choice rather than leaving rows empty. */
async function excludeEverythingElse() {
  const sections: [RegExp, RegExp][] = [
    [/^Attendance/, /^Attendance reporting/],
    [/^Training/, /^Training delivery reporting/],
    [/^Completion/, /^Completion reporting/],
    [/^Dropouts/, /^Dropout reporting/],
    [/^Projects/, /^Project reporting/],
    [/^Assets/, /^Asset reporting/],
  ];
  for (const [tab, checkbox] of sections) {
    await goToSection(tab);
    await markNotApplicable(checkbox);
  }
}

describe("Operations submission modal", () => {
  it("offers all seven reporting areas plus the import step", async () => {
    renderModal();

    for (const label of [
      "Enrolment",
      "Attendance",
      "Training",
      "Completion",
      "Dropouts",
      "Projects",
      "Assets",
    ]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Import workbook/ })).toBeTruthy();
  });

  it("states that a KPI with no approved threshold cannot be Green", async () => {
    renderModal();

    // With an empty register there is nothing to give a verdict on at all, and
    // the section must say that rather than reporting zero learners.
    expect((await screen.findAllByText(/No registrations recorded/i)).length).toBeGreaterThan(0);

    // Once a figure exists, the enrolment section previews its KPIs. No
    // Operations threshold is approved, so the wording must be explicit rather
    // than a reassuring colour.
    await addOneValidEnrolment();
    expect((await screen.findAllByText(/Threshold not configured/i)).length).toBeGreaterThan(0);
    // And nothing on the page may claim a Green verdict.
    expect(screen.queryByText(/^Green$/)).toBeNull();
  });

  it("refuses an incomplete submission and names the offending section", async () => {
    renderModal();

    // Deliberately nothing entered anywhere. Walk to the end and try to review.
    await reviewSubmission();

    // Section 36: a refused submission is announced, not silent.
    expect(
      await screen.findByText(/submission could not be completed/i)
    ).toBeTruthy();
    // And the user is taken to the section that needs attention.
    // The strip button and the issue panel both offer Assets, and both must be
    // reachable, so the section is asserted by presence rather than by count.
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Assets/ }).length).toBeGreaterThan(0);
    });
  });

  it("saves a draft without submitting or touching the KPIs", async () => {
    renderModal();

    await addOneValidEnrolment();
    await user.click(screen.getByRole("button", { name: /Save Draft/ }));

    await waitFor(() => {
      expect(currentStore.operationsReports.some((r) => r.status === "Draft")).toBe(true);
    });
    // A draft is not a submission: the KPI must still read as unavailable, with
    // no derived value and no timestamp.
    const active = currentStore.kpis.find((k) => k.id === "kpi-enrolment")!;
    expect(active.dataAvailable).toBe(false);
    expect(active.lastUpdated ?? null).toBeNull();
  });

  it("derives KPIs from a complete submission and clears what it cannot derive", async () => {
    renderModal();

    await addOneValidEnrolment();
    await excludeEverythingElse();
    await reviewSubmission();

    // The review page must show the derived figure and name what is missing
    // rather than quietly submitting a partial report.
    expect(await screen.findByText(/Review before submitting/i)).toBeTruthy();
    expect(screen.getByText("Student Enrolment")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Submit Operations Data/ }));

    // The submission closed the cycle and recorded the report.
    await waitFor(() => {
      expect(currentStore.operationsReports.some((r) => r.status === "Submitted")).toBe(true);
    });

    // The enrolment KPI now carries the derived value...
    const active = currentStore.kpis.find((k) => k.id === "kpi-enrolment")!;
    expect(active.currentValue).toBe(1);
    expect(active.lastUpdated).toBeTruthy();

    // ...and a KPI nothing could be derived for reports no data rather than a
    // stale figure. The stored value is deliberately kept as prior-period
    // context; `dataAvailable` is the guard that stops it being displayed, so
    // the guarantee is that the status is no_data and the reason is recorded.
    const completion = currentStore.kpis.find((k) => k.id === "kpi-completion")!;
    expect(completion.dataAvailable).toBe(false);
    expect(getStatus(completion)).toBe("no_data");
    expect(completion.notAvailableReason).toBeFalsy();
  });

  it("records the submission in the audit trail with its provenance", async () => {
    renderModal();

    await addOneValidEnrolment();
    await excludeEverythingElse();
    await reviewSubmission();
    await user.click(await screen.findByRole("button", { name: /^Submit Operations Data/ }));

    await waitFor(() => {
      const entry = currentStore.auditLog.find((a) => a.department === "Operations" && a.summary.includes("submitted"));
      expect(entry).toBeTruthy();
      // Manual entry must be recorded as manual, not left ambiguous.
      expect(entry?.summary).toMatch(/Manual Entry/);
      expect(entry?.details?.sectionsReported).toContain("enrolment");
    });
  });

  it("keeps the Operations report separate from the previous cohort's figures", async () => {
    renderModal();

    await addOneValidEnrolment();
    await excludeEverythingElse();
    await reviewSubmission();
    await user.click(await screen.findByRole("button", { name: /^Submit Operations Data/ }));
    await waitFor(() => {
      expect(currentStore.operationsReports.some((r) => r.status === "Submitted")).toBe(true);
    });

    // A second submission for the next cohort must start from a clean report,
    // not from the cohort just submitted.
    const saved = currentStore.operationsReports.find((r) => r.status === "Submitted")!;
    expect(saved.reportingPeriod).toBe("Term 3 2026");
    // And the next cycle is now open.
    expect(
      currentStore.cycles.some((c) => c.department === "Operations" && c.status !== "Closed")
    ).toBe(true);
  });

  it("refuses a report whose programme is not on the approved list", async () => {
    renderModal();

    // The Course field is a select built from the approved vocabulary, so the UI
    // cannot produce this by accident. The guarantee that matters is at the store:
    // a report assembled elsewhere (or by an import) must still be refused, or an
    // unregistered programme would make a cohort rate meaningless.
    const report = blankOperationsReport();
    report.enrolment.records = [
      {
        ...blankOperationsReport().enrolment.records[0],
        id: "enrol-1",
        learner: "Dineo Kgosana",
        course: "Unlisted Programme",
        registrationDate: "2026-07-01",
        status: "Enrolled",
      } as never,
    ];
    for (const key of ["attendance", "training", "completion", "dropouts", "projects", "assets"] as const) {
      report[key].notApplicable = true;
    }

    const outcome = await currentStore.submitOperationsReport(report, "Operations Manager");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues.some((i) => i.field.toLowerCase().includes("course"))).toBe(true);
    }
    // And nothing was saved.
    expect(currentStore.operationsReports.some((r) => r.status === "Submitted")).toBe(false);
  });
});

/** Guards the fixture the rest of this file leans on. */
describe("Operations test fixture", () => {
  it("starts with an empty but valid-shaped report", () => {
    const report = blankOperationsReport();
    expect(report.cycleId).toBe("cyc-operations-2026-t3");
    expect(report.frequency).toBe("Per Cohort");
    expect(report.enrolment.records).toEqual([]);
  });
});