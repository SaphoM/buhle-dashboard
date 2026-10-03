import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { getStatus } from "../../data/kpiEngine";
import { ToastProvider } from "../common/ToastContext";
import { FinanceSubmitDataModal } from "./FinanceSubmitDataModal";

/**
 * End-to-end coverage of the Finance submission chain (specification Sections 23,
 * 35, 39, 41).
 *
 * Each test drives the real modal with real clicks and typing and asserts against
 * the real store, so what is verified is what a Finance Manager would actually
 * get. Finance is the authoritative source for several Executive KPIs, so the
 * assertions are about the shared KPI/EWS pipeline rather than a private set of
 * Finance numbers.
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
          <FinanceSubmitDataModal open onClose={() => {}} />
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

/** Section 5: the section strip is how the Manager moves around the report. */
async function goToSection(name: RegExp) {
  await user.click(await screen.findByRole("button", { name }));
}

/**
 * Field lookups are prefix regexes: a required field renders with a trailing "*"
 * marker, so an exact string match would never resolve.
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

/** Date inputs need the ISO value set directly; typing into their segments is
 *  unreliable in jsdom and reads ambiguously in the test. */
async function setDate(label: RegExp, value: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
}

type Overrides = {
  revenueActual?: number;
  openingBank?: number;
  cashIn?: number;
  cashOut?: number;
  expenseActual?: number;
  debtorInvoice?: number;
  debtorReceived?: number;
  debtorDue?: string;
  creditorDue?: string;
  creditorInvoice?: number;
  budgetApproved?: number;
  budgetActual?: number;
};

const DEFAULTS: Required<Overrides> = {
  revenueActual: 450000,
  openingBank: 2000000,
  cashIn: 400000,
  cashOut: 300000,
  expenseActual: 250000,
  debtorInvoice: 50000,
  debtorReceived: 10000,
  debtorDue: "2026-09-01",
  creditorDue: "2026-09-15",
  creditorInvoice: 30000,
  budgetApproved: 100000,
  budgetActual: 60000,
};

/**
 * The minimum a Finance Manager must supply for the report to be submittable:
 * one revenue line with an actual, an opening cash balance with movement, one
 * budget line, one debtor, one creditor, and one operating expense so a surplus
 * can be derived from both sides (Section 21 forbids reporting half a result).
 */
async function fillMinimumValidReport(overrides: Partial<Overrides> = {}) {
  const v = { ...DEFAULTS, ...overrides };

  await goToSection(/^Revenue/);
  await user.click(await screen.findByRole("button", { name: /Add revenue line/ }));
  await setText(/^Description/, "Short courses");
  await setNumber(/^Budget/, 400000);
  await setNumber(/^Actual/, v.revenueActual);

  await goToSection(/^Cash Flow/);
  await setNumber(/^Opening bank balance/, v.openingBank);
  await setNumber(/^Revenue received/, v.cashIn);
  await setNumber(/^Payroll/, v.cashOut);

  await goToSection(/^Budgets/);
  await user.click(await screen.findByRole("button", { name: /Add budget line/ }));
  await setText(/^Budget ID/, "B-01");
  await setText(/^Budget line/, "Marketing");
  await setNumber(/^Approved budget/, v.budgetApproved);
  await setNumber(/^Actual expenditure/, v.budgetActual);

  await goToSection(/^Debtors/);
  await user.click(await screen.findByRole("button", { name: /Add debtor/ }));
  await setText(/^Customer/, "Acme");
  await setText(/^Invoice number/, "INV-1");
  await setDate(/^Due date/, v.debtorDue);
  await setNumber(/^Invoice amount/, v.debtorInvoice);
  await setNumber(/^Amount received/, v.debtorReceived);

  await goToSection(/^Creditors/);
  await user.click(await screen.findByRole("button", { name: /Add creditor/ }));
  await setText(/^Supplier/, "Supplier A");
  await setText(/^Invoice number/, "BILL-1");
  await setDate(/^Due date/, v.creditorDue);
  await setNumber(/^Invoice amount/, v.creditorInvoice);

  await goToSection(/^Profitability/);
  await user.click(await screen.findByRole("button", { name: /Add expense line/ }));
  await user.selectOptions(screen.getByLabelText(/^Category/), "Payroll");
  await setText(/^Description/, "Salaries");
  await setNumber(/^Actual/, v.expenseActual);
}

async function goToReview() {
  await user.click(await screen.findByRole("button", { name: /Review Submission/ }));
  await waitFor(() => expect(screen.getByText(/Finance Submission Review/)).toBeTruthy());
}

/**
 * Section 60: thresholds are configuration, not constants. The demo KPI seeds
 * carry annual-looking limits, so a month of realistic turnover would read as a
 * breach. This sets the limits an administrator would actually agree for a
 * month before the Manager submits.
 */
async function setMonthlyThresholds() {
  await act(async () => {
    currentStore.updateKpiThresholds("kpi-revenue", { target: 400000, greenThreshold: 420000, amberThreshold: 350000 });
    currentStore.updateKpiThresholds("kpi-surplus", { target: 150000, greenThreshold: 120000, amberThreshold: 50000 });
  });
}

describe("Finance Data Submission", () => {
  // Test 1 - a complete submission runs the whole Section 35 chain.
  it("records a complete submission, derives the KPIs and opens the next cycle", async () => {
    renderModal();
    await fillMinimumValidReport();
    await setMonthlyThresholds();

    await goToReview();

    const review = screen.getByText(/Finance Submission Review/).closest("div")!.parentElement!;
    expect(within(review).getByText(/No Amber or Red warnings/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Submit Finance Data$/ }));
    await waitFor(() => expect(screen.getByText(/Finance submission recorded/)).toBeTruthy());

    // Every figure is derived from the submitted records, never typed in.
    expect(kpi("kpi-revenue").currentValue).toBe(450000);
    expect(getStatus(kpi("kpi-revenue"))).toBe("green");
    // Closing cash = opening + inflows - outflows.
    expect(kpi("kpi-cash-balance").currentValue).toBe(2100000);
    expect(kpi("kpi-debtors-total").currentValue).toBe(40000);
    expect(kpi("kpi-creditors-total").currentValue).toBe(30000);
    // Surplus is core operations: external revenue less external spend.
    expect(kpi("kpi-surplus").currentValue).toBe(200000);

    // Sections marked Not Applicable, or with nothing to report, never read as
    // fine because they are quiet.
    expect(getStatus(kpi("kpi-collection-rate"))).not.toBe("green");

    // The cycle closed and its successor opened itself (Section 36).
    expect(currentStore.cycles.find((c) => c.cycleId === "cyc-finance-2026-09")!.status).toBe("Submitted");
    const next = currentStore.cycles.find((c) => c.cycleId.includes("cyc-finance-2026-09__next-"));
    expect(next).toBeDefined();
    expect(next!.department).toBe("Finance");
    expect(next!.status).toBe("Upcoming");

    // The Manager is told when the next submission falls due.
    expect(screen.getByText(/Next Finance submission/)).toBeTruthy();

    // The whole chain is auditable.
    const entry = currentStore.auditLog.find((a) => a.action === "finance_report_submitted");
    expect(entry).toBeDefined();
    expect(entry!.actor).toBeTruthy();
    expect(entry!.summary).toMatch(/September 2026/);

    const report = currentStore.financeReports.find((r) => r.status === "Submitted")!;
    expect(report.reportingPeriod).toBe("September 2026");
    expect(report.computedKpis!["kpi-surplus"]).toBe(200000);
    // Section 27: provenance says where the figures came from.
    expect(report.dataSource.kind).toBe("Manual Entry");
  });

  // Test 2 - a breach raises a warning, a risk and a staged corrective action.
  it("raises a warning with a risk and a staged corrective action when a threshold is breached", async () => {
    renderModal();
    // One invoice 90000, 124 days past due, so the 90+ line is breached as well.
    await fillMinimumValidReport({ debtorInvoice: 90000, debtorReceived: 0, debtorDue: "2026-06-01" });

    // Section 60: the limits are the administrator's to set, not constants in the
    // engine. Without these, debtor totals could never breach anything.
    await act(async () => {
      currentStore.updateKpiThresholds("kpi-debtors-total", {
        target: 50000,
        greenThreshold: 50000,
        amberThreshold: 80000,
      });
    });

    await goToReview();
    expect(screen.getByText(/warning.*will be raised/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Submit Finance Data$/ }));
    await waitFor(() => expect(screen.getByText(/Finance submission recorded/)).toBeTruthy());

    expect(getStatus(kpi("kpi-debtors-total"))).toBe("red");

    const risk = currentStore.risks.find((r) => r.kpiId === "kpi-debtors-total" && r.status !== "Resolved")!;
    expect(risk).toBeDefined();
    expect(risk.level).toBe("red");
    expect(risk.origin).toBe("performance");
    // The risk carries the period of the figure it is about, so it cannot drift
    // out of step with the KPI it tracks.
    expect(risk.reportingPeriod).toBe("September 2026");
    expect(risk.currentValue).toBe(90000);

    // Section 22: a raised risk is never left without a staged action.
    const action = currentStore.actions.find((a) => a.riskId === risk.id)!;
    expect(action).toBeDefined();
    expect(action.status).toBe("Open");
    expect(action.owner).toBeTruthy();
    expect(action.dueDate).toBeTruthy();
    // The action carries enough context to explain itself without opening the
    // risk (Sections 24, 31).
    expect(action.context?.kpiName).toBe("Total Debtors");
    expect(action.context?.ragStatus).toBe("red");
    expect(action.context?.reportingPeriod).toBe("September 2026");

    // The KPI the demo data already had a live risk for is escalated in place
    // rather than duplicated: two live risks for one KPI would double-count the
    // exposure on the Risk Centre.
    const revenueRisks = currentStore.risks.filter((r) => r.kpiId === "kpi-revenue" && r.status !== "Resolved");
    expect(revenueRisks).toHaveLength(1);
    expect(revenueRisks[0].id).toBe("risk-1");
    expect(revenueRisks[0].level).toBe("red");
    expect(revenueRisks[0].escalationLevel).toBe("Executive Management");
  });

  // Test 3 - nothing is green by default (Sections 8, 22, 33).
  it("never reports a KPI as green while its threshold is unset or its data is absent", async () => {
    renderModal();
    await fillMinimumValidReport();
    await setMonthlyThresholds();

    await goToReview();
    // The review states a derived figure for every KPI, including the ones
    // Finance has not agreed a threshold for yet.
    const review = screen.getByText(/Finance Submission Review/).closest("div")!.parentElement!;
    expect(within(review).getByText("Closing Cash Balance")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Submit Finance Data$/ }));
    await waitFor(() => expect(screen.getByText(/Finance submission recorded/)).toBeTruthy());

    // A real figure with no agreed threshold is "threshold unset", not green.
    expect(kpi("kpi-cash-balance").currentValue).toBe(2100000);
    expect(getStatus(kpi("kpi-cash-balance"))).toBe("threshold_unset");
    // ...and it must not raise a warning on a limit nobody has agreed.
    expect(currentStore.risks.some((r) => r.kpiId === "kpi-cash-balance" && r.status !== "Resolved")).toBe(false);
  });

  // Test 4 - a section that does not apply is recorded as such, not as zero.
  it("records a section marked Not Applicable without inventing figures", async () => {
    renderModal();
    await fillMinimumValidReport();

    // Creditors are marked Not Applicable instead of being left empty.
    await goToSection(/^Creditors/);
    await user.click(await screen.findByLabelText(/Creditors reporting does not apply this period/));

    await goToSection(/^Profitability/);
    await goToReview();
    await user.click(screen.getByRole("button", { name: /^Submit Finance Data$/ }));
    await waitFor(() => expect(screen.getByText(/Finance submission recorded/)).toBeTruthy());

    const report = currentStore.financeReports.find((r) => r.status === "Submitted")!;
    expect(report.creditors.notApplicable).toBe(true);
    // No creditor KPI is reported at all rather than reported as R0.00.
    expect(kpi("kpi-creditors-total").dataAvailable).toBe(false);
    expect(getStatus(kpi("kpi-creditors-total"))).toBe("no_data");
  });

  // Test 5 - an incomplete submission is refused and names what is missing.
  it("refuses an incomplete submission and names the missing fields", async () => {
    renderModal();

    await goToSection(/^Profitability/);
    await user.click(await screen.findByRole("button", { name: /Review Submission/ }));

    await waitFor(() => expect(screen.getByText(/Your Finance submission is incomplete/)).toBeTruthy());

    const panel = screen.getByText(/Your Finance submission is incomplete/).closest("div")!.parentElement!;
    expect(within(panel).getByText(/Revenue/)).toBeTruthy();
    expect(within(panel).getByText(/At least one revenue line/)).toBeTruthy();
    // Cash Flow states the first thing it needs rather than every field at once.
    expect(within(panel).getByText(/At least one cash inflow or outflow/)).toBeTruthy();
    expect(within(panel).getByText(/Budgets/)).toBeTruthy();
    expect(within(panel).getByText(/Debtors/)).toBeTruthy();
    expect(screen.queryByText(/Finance Submission Review/)).toBeNull();

    // Nothing was written and no cycle moved on.
    expect(currentStore.financeReports).toHaveLength(0);
    expect(currentStore.cycles.find((c) => c.cycleId === "cyc-finance-2026-09")!.status).toBe("In Progress");
  });

  // Test 6 - cash that does not reconcile blocks submission (Section 9).
  it("blocks a submission whose closing cash contradicts the derived position", async () => {
    renderModal();
    await fillMinimumValidReport();

    await goToSection(/^Cash Flow/);
    // Opening 2,000,000 + 400,000 - 300,000 = 2,100,000. The workbook says
    // 2,500,000. One of them is wrong and the application will not guess which.
    await setNumber(/^Closing balance as shown/, 2500000);

    await goToSection(/^Profitability/);
    await user.click(await screen.findByRole("button", { name: /Review Submission/ }));

    await waitFor(() => expect(screen.getByText(/Your Finance submission is incomplete/)).toBeTruthy());
    expect(screen.getByText(/does not reconcile/)).toBeTruthy();
    expect(currentStore.financeReports.filter((r) => r.status === "Submitted")).toHaveLength(0);
  });

  // Test 7 - the next cycle is generated automatically at the configured cadence.
  it("generates the next cycle automatically at the configured frequency", async () => {
    renderModal();
    await fillMinimumValidReport();
    await setMonthlyThresholds();

    await goToReview();
    await user.click(screen.getByRole("button", { name: /^Submit Finance Data$/ }));
    await waitFor(() => expect(screen.getByText(/Finance submission recorded/)).toBeTruthy());

    const next = currentStore.cycles.find((c) => c.cycleId.includes("cyc-finance-2026-09__next-"))!;
    expect(next.frequency).toBe("Monthly");
    expect(next.status).toBe("Upcoming");
    expect(next.completionPct).toBe(0);
    expect(next.submittedBy).toBeUndefined();
    // One calendar month on from the 5 October due date. Not 30 days, which
    // would land on the 4th and creep a day earlier every month.
    expect(next.dueDate).toBe("2026-11-05");
    expect(next.reportingPeriod).toBe("November 2026");

    const submitted = currentStore.financeReports.filter((r) => r.status === "Submitted");
    expect(submitted).toHaveLength(1);
    expect(submitted[0].cycleId).toBe("cyc-finance-2026-09");
  });

  // Supporting behaviour: a draft survives being saved, and is picked back up.
  it("saves a draft without submitting it or moving any KPI", async () => {
    renderModal();

    await goToSection(/^Revenue/);
    await user.click(await screen.findByRole("button", { name: /Add revenue line/ }));
    await setNumber(/^Actual/, 450000);
    await user.click(await screen.findByRole("button", { name: /Save Draft/ }));

    await waitFor(() => expect(currentStore.financeReports).toHaveLength(1));
    const draft = currentStore.financeReports[0];
    expect(draft.status).toBe("Draft");
    expect(draft.revenue.lines[0].actual).toBe(450000);
    // Saving a draft must not move a KPI or advance a cycle.
    expect(currentStore.cycles.find((c) => c.cycleId === "cyc-finance-2026-09")!.status).toBe("In Progress");
    expect(kpi("kpi-revenue").dataAvailable).toBeFalsy();

    const entry = currentStore.auditLog.find((a) => a.action === "finance_draft_saved");
    expect(entry).toBeDefined();
  });

  // Supporting behaviour: a failed import is a visible state, not an empty
  // section, and it blocks submission until it is resolved (Section 33).
  it("records a failed workbook import and refuses to submit until it is resolved", async () => {
    renderModal();
    await fillMinimumValidReport();

    await goToSection(/^Import workbook/);

    // A file that is not a readable workbook. This is the real path a Manager
    // hits with a password-protected or corrupted file.
    const broken = new File([new Uint8Array([1, 2, 3, 4])], "Budget Monitor.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText(/Workbook file/), broken);

    await waitFor(() => expect(screen.getByText(/Import failed/)).toBeTruthy());

    // The failure is recorded on the report and in the audit trail as a failure,
    // not as a completed import.
    await waitFor(() => expect(currentStore.financeReports).toHaveLength(1));
    const report = currentStore.financeReports[0];
    expect(report.dataSource.failureReason).toBeTruthy();
    expect(report.importRuns[0].status).toBe("Failed");
    const entry = currentStore.auditLog.find((a) => a.action === "finance_import_failed");
    expect(entry).toBeDefined();
    expect(currentStore.auditLog.some((a) => a.action === "finance_import_completed")).toBe(false);

    // And the Manager cannot submit a report that says its last import failed:
    // the section would otherwise read as merely unfilled.
    await goToSection(/^Profitability/);
    await user.click(await screen.findByRole("button", { name: /Review Submission/ }));
    await waitFor(() => expect(screen.getByText(/Your Finance submission is incomplete/)).toBeTruthy());
    expect(screen.getByText(/The last workbook import failed/)).toBeTruthy();
    expect(currentStore.financeReports.filter((r) => r.status === "Submitted")).toHaveLength(0);
  });
});