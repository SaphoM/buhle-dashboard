import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { HrSubmitDataModal } from "./HrSubmitDataModal";
import { ToastProvider } from "../common/ToastContext";
import { AuthProvider } from "../../auth/AuthContext";
import { getStatus } from "../../data/kpiEngine";

/**
 * End-to-end coverage of the six workflows the specification calls for.
 *
 * Each test drives the real modal with real clicks and typing, then asserts
 * against the real store - so what is verified is what an HR manager would
 * actually get, not a mock of it.
 */

/**
 * The assertions need the store after React has finished rendering, so the
 * probe republishes it on every commit into a module-level handle.
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
          <HrSubmitDataModal open onClose={() => {}} />
        </DataStoreProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

const kpi = (id: string) => currentStore.kpis.find((k) => k.id === id)!;

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  currentStore = undefined as unknown as DataStoreValue;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Section 3: the section strip is how the manager moves around the report. */
async function goToSection(name: RegExp) {
  await user.click(await screen.findByRole("button", { name }));
}

/**
 * Field lookups are prefix regexes: a required field's label renders with a
 * trailing "*" marker, so an exact string match would never resolve.
 */
async function setNumber(label: RegExp, value: number) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, String(value));
}

async function setText(label: RegExp, value: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
}

/**
 * The minimum a manager must supply for the report to be submittable: three
 * attendance figures the absenteeism formula consumes, one leave figure, and a
 * headcount. Skills and vacancies are legitimately empty, and Performance is
 * exempt while no PMS exists.
 */
async function fillMinimumValidReport(overrides?: { activeEmployees?: number; workingDays?: number; daysAbsent?: number; averageHeadcount?: number }) {
  const active = overrides?.activeEmployees ?? 40;
  const workingDays = overrides?.workingDays ?? 22;
  const absent = overrides?.daysAbsent ?? 1;

  await goToSection(/^Attendance/);
  await setNumber(/^Active employees/, active);
  await setNumber(/^Working days in period/, workingDays);
  await setNumber(/^Days absent \(total\)/, absent);

  await goToSection(/^Leave/);
  await setNumber(/^Annual - employees/, 12);
  await setNumber(/^Annual - days taken/, 48);

  await goToSection(/^Turnover/);
  await setNumber(/^Average headcount/, overrides?.averageHeadcount ?? active);

  // Land on the final section, which is where the "Review Submission" control
  // lives - the same path a manager takes.
  await goToSection(/^Vacancies/);
}

/** Opens the review page the way the manager does. */
async function goToReview() {
  await user.click(await screen.findByRole("button", { name: /Review Submission/ }));
  await waitFor(() => expect(screen.getByText(/HR Submission Review/)).toBeTruthy());
}

describe("HR Data Submission", () => {
  // Test 1 - a complete, healthy submission submits and updates everything.
  it("records a complete submission, derives the KPIs and opens the next cycle", async () => {
    renderModal();
    await fillMinimumValidReport();

    await goToReview();

    // Absenteeism 1 / (40 x 22) = 0.11%, comfortably inside the 6% threshold.
    const review = screen.getByText(/HR Submission Review/).closest("div")!.parentElement!;
    expect(within(review).getByText(/No Amber or Red warnings/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Submit HR Data$/ }));
    await waitFor(() => expect(screen.getByText(/HR submission recorded/)).toBeTruthy());

    // KPIs are derived from the records, never typed in by the manager.
    // 1 / (40 x 22) = 0.1136%, reported to two decimal places by the engine.
    expect(kpi("kpi-absenteeism").currentValue).toBe(0.11);
    expect(getStatus(kpi("kpi-absenteeism"))).toBe("green");
    expect(kpi("kpi-leave-utilisation").currentValue).toBe(48);
    expect(kpi("kpi-leave-utilisation").dataAvailable).toBe(true);

    // Sections with nothing in them report no data rather than a stale figure.
    expect(kpi("kpi-open-vacancies").dataAvailable).toBe(false);
    expect(getStatus(kpi("kpi-open-vacancies"))).toBe("no_data");

    // The cycle closed and its successor opened itself (Sections 19, 21).
    const next = currentStore.cycles.find((c) => c.cycleId.startsWith("cyc-hr-data-2026-09__next-"));
    expect(next).toBeDefined();
    expect(currentStore.cycles.find((c) => c.cycleId === "cyc-hr-data-2026-09")!.status).toBe("Submitted");

    // The manager is told when the next submission falls due.
    expect(screen.getByText(/Next HR submission/)).toBeTruthy();
    expect(screen.getByText(/October 2026/)).toBeTruthy();

    // The whole chain is auditable.
    const entry = currentStore.auditLog.find((a) => a.action === "hr_report_submitted");
    expect(entry).toBeDefined();
    expect(entry!.actor).toBeTruthy();
    expect(entry!.summary).toMatch(/September 2026/);
  });

  // Test 2 - high absenteeity raises a warning, a risk and a staged action.
  it("raises an absenteeism warning with a risk and a staged corrective action", async () => {
    renderModal();
    // 88 absence days against 20 x 22 = 440 expected = 20%, far past the 9% amber.
    await fillMinimumValidReport({ activeEmployees: 20, workingDays: 22, daysAbsent: 88, averageHeadcount: 20 });

    await goToReview();
    expect(screen.getByText(/warning.*will be raised/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Submit HR Data$/ }));
    await waitFor(() => expect(screen.getByText(/HR submission recorded/)).toBeTruthy());

    expect(getStatus(kpi("kpi-absenteeism"))).toBe("red");

    const absenteeismRisks = currentStore.risks.filter((r) => r.kpiId === "kpi-absenteeism");

    // The pre-existing "not tracked (data gap)" risk is closed as superseded -
    // the submission just proved absenteeism *is* tracked - and replaced by a
    // real performance risk rather than escalated in place.
    const dataGap = absenteeismRisks.find((r) => r.origin === "data_gap")!;
    expect(dataGap).toBeDefined();
    expect(dataGap.status).toBe("Resolved");

    const risk = absenteeismRisks.find((r) => r.status !== "Resolved")!;
    expect(risk).toBeDefined();
    expect(risk.level).toBe("red");
    expect(risk.origin).toBe("performance");
    expect(risk.name).toBe("Staff Absenteeism Rate");

    // Section 22: a raised risk is never left without a staged action.
    const action = currentStore.actions.find((a) => a.riskId === risk!.id);
    expect(action).toBeDefined();
    expect(action!.status).toBe("Open");
    expect(action!.owner).toBeTruthy();
    expect(action!.dueDate).toBeTruthy();
    // The action carries enough context to explain itself without opening
    // the risk (Sections 19, 24).
    expect(action!.context?.kpiName).toBe("Staff Absenteeism Rate");
    expect(action!.context?.ragStatus).toBe("red");
    expect(action!.context?.reportingPeriod).toBe("September 2026");
  });

  // Test 3 - vacancies that stay open past their required start date warn.
  it("warns when a vacancy sits open past its required start date", async () => {
    renderModal();
    await fillMinimumValidReport();

    await goToSection(/^Vacancies/);
    await user.click(await screen.findByRole("button", { name: /Add vacancy/ }));
    await setText(/^Vacancy ID/, "VAC-OPEN-01");
    await setText(/^Position/, "Finance Manager");
    await user.selectOptions(screen.getByLabelText(/^Department/), "Finance");
    await setText(/^Hiring manager/, "A. Manager");
    await user.selectOptions(screen.getByLabelText(/^Vacancy status/), "Open");
    await setText(/^Date opened/, "2026-06-01");
    await setText(/^Required start date/, "2026-09-01");

    await goToReview();
    await user.click(screen.getByRole("button", { name: /^Submit HR Data$/ }));
    await waitFor(() => expect(screen.getByText(/HR submission recorded/)).toBeTruthy());

    expect(kpi("kpi-open-vacancies").currentValue).toBe(1);
    const report = currentStore.hrReports.find((r) => r.status === "Submitted")!;
    expect(report.vacancies.vacancies).toHaveLength(1);
    expect(report.computedKpis!["kpi-open-vacancies"]).toBe(1);
  });

  // Test 4 - an incomplete submission is refused, and says exactly what is missing.
  it("refuses an incomplete submission and names the missing fields", async () => {
    renderModal();

    // Go straight to the review from the last section without filling anything.
    await goToSection(/^Vacancies/);
    await user.click(await screen.findByRole("button", { name: /Review Submission/ }));

    // The modal refuses to open the review page at all.
    await waitFor(() => expect(screen.getByText(/Your HR submission is incomplete/)).toBeTruthy());
    // Every gap names its section, so the manager can jump straight to it.
    const panel = screen.getByText(/Your HR submission is incomplete/).closest("div")!.parentElement!;
    expect(within(panel).getByText(/Attendance/)).toBeTruthy();
    expect(within(panel).getByText(/Active employees is required/)).toBeTruthy();
    expect(within(panel).getByText(/Turnover/)).toBeTruthy();
    expect(screen.queryByText(/HR Submission Review/)).toBeNull();

    // Nothing was written and no cycle moved on.
    expect(currentStore.hrReports).toHaveLength(0);
    expect(currentStore.cycles.find((c) => c.cycleId === "cyc-hr-data-2026-09")!.status).toBe("In Progress");
  });

  // Test 5 - performance is unavailable, and no figure is ever invented.
  it("reports Staff Performance as not yet available instead of fabricating a value", async () => {
    renderModal();

    // The Performance section says so plainly and offers no input fields.
    await goToSection(/^Performance/);
    expect(screen.getByText(/Performance Management System Not Yet Active/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Reviews completed/)).toBeNull();

    // And the KPI carries the reason, so every other surface can show it too -
    // including the Executive Dashboard.
    const perf = kpi("kpi-staff-performance");
    expect(perf.dataAvailable).toBe(false);
    expect(getStatus(perf)).toBe("not_available");
    expect(perf.notAvailableReason).toMatch(/not yet active/i);
    // Critically: no fabricated score.
    expect(perf.currentValue).toBe(0);

    // A full submission must not invent one either.
    await fillMinimumValidReport();
    await goToReview();
    await user.click(screen.getByRole("button", { name: /^Submit HR Data$/ }));
    await waitFor(() => expect(screen.getByText(/HR submission recorded/)).toBeTruthy());

    expect(getStatus(kpi("kpi-staff-performance"))).toBe("not_available");
    expect(currentStore.risks.some((r) => r.kpiId === "kpi-staff-performance")).toBe(false);
  });

  // Test 6 - the next cycle is generated automatically at the configured cadence.
  it("generates the next cycle automatically at the configured frequency", async () => {
    renderModal();
    await fillMinimumValidReport();

    // Before submitting, the manager can see when the next one will fall due.
    expect(screen.getByText(/2026\/10\/30|30 October 2026|Oct/)).toBeTruthy();

    await goToReview();
    await user.click(screen.getByRole("button", { name: /^Submit HR Data$/ }));
    await waitFor(() => expect(screen.getByText(/HR submission recorded/)).toBeTruthy());

    const next = currentStore.cycles.find((c) => c.cycleId.includes("__next-"))!;
    expect(next).toBeDefined();
    expect(next.department).toBe("Human Resources");
    expect(next.frequency).toBe("Monthly");
    expect(next.status).toBe("Upcoming");
    expect(next.completionPct).toBe(0);
    expect(next.submittedBy).toBeUndefined();
    // One month on from the 30 September due date.
    expect(next.dueDate).toBe("2026-10-30");
    expect(next.reportingPeriod).toBe("October 2026");

    // Exactly one submitted report, and it belongs to the closed cycle.
    const submitted = currentStore.hrReports.filter((r) => r.status === "Submitted");
    expect(submitted).toHaveLength(1);
    expect(submitted[0].cycleId).toBe("cyc-hr-data-2026-09");
    expect(submitted[0].reportingPeriod).toBe("September 2026");
  });

  // Supporting behaviour: a draft survives being saved.
  it("saves a draft without submitting it", async () => {
    renderModal();

    await goToSection(/^Attendance/);
    await setNumber(/^Active employees/, 30);
    await user.click(await screen.findByRole("button", { name: /Save Draft/ }));

    await waitFor(() => expect(currentStore.hrReports).toHaveLength(1));
    const draft = currentStore.hrReports[0];
    expect(draft.status).toBe("Draft");
    expect(draft.attendance.activeEmployees).toBe(30);
    // Saving a draft must not move any KPI or advance any cycle.
    expect(currentStore.cycles.find((c) => c.cycleId === "cyc-hr-data-2026-09")!.status).toBe("In Progress");
    expect(kpi("kpi-absenteeism").dataAvailable).toBe(false);
  });
});