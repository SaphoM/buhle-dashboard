import { useMemo, useState } from "react";
import { Modal } from "../common/Modal";
import { StatusBadge } from "../kpi/StatusBadge";
import { useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../common/ToastContext";
import { computeNextDueDate, getEffectiveStatus, getOpenFinanceCycle } from "../../data/cycleEngine";
import { getStatusForValue } from "../../data/kpiEngine";
import { createBlankFinanceReport } from "../../data/financeSeed";
import { FINANCE_KPI_IDS, computeFinanceKpis, formatCurrency, kpisNeedingExplanation } from "../../data/financeEngine";
import { financeDataNotes, summariseIssues, validateFinanceReport, type ValidationIssue } from "../../data/financeValidation";
import {
  FINANCE_SECTION_KEYS,
  FINANCE_SECTION_LABELS,
  FINANCE_WORKBOOK_DEPENDENCY,
  type FinanceReport,
  type FinanceSectionKey,
  type FinanceSectionState,
} from "../../types/finance";
import type { Department } from "../../types";
import { FinTextArea } from "./finance/FinanceFields";
import { RevenueSection } from "./finance/RevenueSection";
import { CashFlowSection } from "./finance/CashFlowSection";
import { BudgetsSection } from "./finance/BudgetsSection";
import { DebtorsSection } from "./finance/DebtorsSection";
import { CreditorsSection } from "./finance/CreditorsSection";
import { ProfitabilitySection } from "./finance/ProfitabilitySection";
import { FinanceImportWizard } from "./finance/FinanceImportWizard";
import { FinanceWorkbookDependencyNotice } from "./finance/FinanceSectionChrome";

type Step = FinanceSectionKey | "review" | "import";

const DEPARTMENT_OPTIONS: Department[] = [
  "Executive",
  "Finance",
  "Operations",
  "Commercial Farming",
  "Human Resources",
  "Marketing",
  "Academy",
  "Alumni",
];

const stateStyles: Record<FinanceSectionState, string> = {
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  incomplete: "bg-white text-ink-soft/50 border-dashed border-ink/20",
  attention: "bg-butter text-ink border-butter-dark",
  imported: "bg-emerald-50 text-emerald-700 border-emerald-200",
  not_applicable: "bg-ink/[0.04] text-ink-soft/40 border-ink/10",
};

const stateLabel: Record<FinanceSectionState, string> = {
  complete: "Complete",
  incomplete: "Incomplete",
  attention: "Attention Required",
  imported: "Imported",
  not_applicable: "Not Applicable",
};

/** Which KPIs each section feeds. Drives both the attention upgrade and the
 *  review page, and lives here once so the two can never disagree. */
const SECTION_KPIS: Record<FinanceSectionKey, string[]> = {
  revenue: [FINANCE_KPI_IDS.revenue, FINANCE_KPI_IDS.donorFunding],
  cashFlow: [FINANCE_KPI_IDS.cashBalance, FINANCE_KPI_IDS.netCashMovement],
  budgets: [FINANCE_KPI_IDS.budgetUtilisation, FINANCE_KPI_IDS.budgetRemaining],
  debtors: [FINANCE_KPI_IDS.debtorsTotal, FINANCE_KPI_IDS.debtors90Plus, FINANCE_KPI_IDS.collectionRate],
  creditors: [FINANCE_KPI_IDS.creditorsTotal, FINANCE_KPI_IDS.creditors90Plus],
  profitability: [FINANCE_KPI_IDS.operatingSurplus, FINANCE_KPI_IDS.operatingMargin, FINANCE_KPI_IDS.grossMargin],
};

/**
 * ============================================================================
 * FINANCE DATA SUBMISSION - the Finance department's monthly management
 * process (Sections 5, 23, 35, 41).
 * ============================================================================
 *
 * Structured exactly like the HR six-section submission, because the two answer
 * the same management question - what happened, what needs attention, what
 * happens next - through different subject matter. Finance is materially more
 * granular (line-level revenue, budget, debtor and creditor records) and, unlike
 * HR, is the AUTHORITATIVE SOURCE for several Executive KPIs (Section 39): what
 * is computed here is what the Executive Dashboard shows, with no second set of
 * rules anywhere else in the application.
 *
 * Three rules shape this component:
 *
 *  1. Finance types FACTS, never judgements. Budget, actual, dates, amounts.
 *     Variances, ageing, margins, surplus and every warning are derived. There
 *     is no input anywhere in the six sections for a percentage Finance could
 *     get wrong.
 *
 *  2. NOTHING IS GREEN BY DEFAULT (Sections 8, 22, 33). A missing figure, an
 *     unset threshold and a failed import each have their own visible state, and
 *     none of them can be submitted as though everything were fine.
 *
 *  3. ONE CONFIRMATION, ONE CHAIN. The review page states exactly what will be
 *     calculated and what will be raised before anything is saved, and Submit
 *     runs the whole Section 35 chain atomically: validate, save, calculate,
 *     RAG, evaluate EWS, reconcile risks, create actions, update dashboards,
 *     schedule the next cycle, write the audit entry.
 */
/**
 * How many Amber or Red warnings this submission will raise.
 *
 * A KPI with no approved threshold cannot warn: there is nothing to be measured
 * against, and Section 33 forbids presenting an unthresholded figure as a
 * performance result. One definition, so the review preview, the success panel
 * and the toast cannot disagree about the same submission.
 */
function countWarnings(computation: ReturnType<typeof computeFinanceKpis>, kpis: DataStoreValue["kpis"]): number {
  return computation.entries.filter((e) => {
    const kpi = kpis.find((k) => k.id === e.kpiId);
    return (
      kpi && kpi.greenThreshold !== null && kpi.amberThreshold !== null && getStatusForValue(kpi, e.value) !== "green"
    );
  }).length;
}

export function FinanceSubmitDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { kpis, cycles, financeReports, financeConfig, saveFinanceDraft, recordFinanceImport, submitFinanceReport } =
    useDataStore();
  const { user } = useAuth();
  const toast = useToast();
  const canOverrideDate = user?.role === "admin" || user?.role === "executive";

  // The cycle this submission fulfils: the soonest-due open Finance cycle, using
  // the same cycle engine the dashboard reads.
  const cycle = useMemo(() => getOpenFinanceCycle(cycles), [cycles]);

  const existingDraft = useMemo(
    () =>
      cycle ? financeReports.find((r) => r.cycleId === cycle.cycleId && r.status === "Draft") : undefined,
    [financeReports, cycle]
  );

  const [report, setReport] = useState<FinanceReport | null>(null);
  const [step, setStep] = useState<Step>("revenue");
  const [showReview, setShowReview] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [done, setDone] = useState<null | { nextDueDate?: string; nextPeriod?: string; warnings: number }>(null);

  // Section 9 needs the prior period's closing cash for comparison, taken from
  // the last Finance report actually submitted rather than typed by anyone.
  const previousPeriodClosingCash = useMemo(() => {
    if (!cycle) return null;
    const prior = [...financeReports]
      .filter((r) => r.status === "Submitted" && r.cycleId !== cycle.cycleId)
      .sort((a, b) => (a.cycleId < b.cycleId ? 1 : -1))[0];
    return prior?.computedKpis?.[FINANCE_KPI_IDS.cashBalance] ?? null;
  }, [financeReports, cycle]);

  const working: FinanceReport | null = useMemo(() => {
    if (!cycle) return null;
    if (report && report.cycleId === cycle.cycleId) return report;
    if (existingDraft) return existingDraft;
    return createBlankFinanceReport({
      cycleId: cycle.cycleId,
      reportingPeriod: cycle.reportingPeriod,
      frequency: cycle.frequency,
      startDate: cycle.startDate,
      dueDate: cycle.dueDate,
      config: financeConfig,
    });
  }, [cycle, report, existingDraft, financeConfig]);

  const validation = useMemo(
    () =>
      working
        ? validateFinanceReport(working, {
            revenueCategoryIds: financeConfig.revenueCategories.map((c) => c.id),
            expenseCategories: financeConfig.expenseCategories,
          })
        : null,
    [working, financeConfig]
  );

  const computation = useMemo(() => (working ? computeFinanceKpis(working, kpis, financeConfig) : null), [
    working,
    kpis,
    financeConfig,
  ]);

  const sectionStates = useMemo(() => {
    const states = {} as Record<FinanceSectionKey, FinanceSectionState>;
    if (!validation || !computation) return states;
    for (const key of FINANCE_SECTION_KEYS) {
      const base = validation.bySection[key].state;
      // A section that is complete but whose KPI trips a warning is "attention",
      // not "complete" - the manager should see that before submitting.
      const breached = SECTION_KPIS[key].some((kpiId) => {
        const entry = computation.entries.find((e) => e.kpiId === kpiId);
        if (!entry) return false;
        const kpi = kpis.find((k) => k.id === kpiId);
        if (!kpi || kpi.greenThreshold === null || kpi.amberThreshold === null) return false;
        const status = getStatusForValue(kpi, entry.value);
        return status === "amber" || status === "red";
      });
      const imported = base === "complete" && hasImportedData(working!, key);
      states[key] = breached ? "attention" : imported ? "imported" : base;
    }
    return states;
  }, [validation, computation, kpis, working]);

  const completedCount = FINANCE_SECTION_KEYS.filter((k) =>
    ["complete", "attention", "not_applicable", "imported"].includes(sectionStates[k])
  ).length;
  const progressPct = Math.round((completedCount / FINANCE_SECTION_KEYS.length) * 100);

  const nextDueDate = useMemo(() => (cycle ? computeNextDueDate(cycle) : ""), [cycle]);
  const [nextDateOverride, setNextDateOverride] = useState<string | null>(null);
  const effectiveNextDate = nextDateOverride ?? nextDueDate;

  const notes = useMemo(() => (working ? financeDataNotes(working, financeConfig) : []), [working, financeConfig]);
  const needsExplanation = useMemo(
    () => (working && computation ? kpisNeedingExplanation(computation, kpis, working.commentary) : []),
    [working, computation, kpis]
  );

  function update(patch: Partial<FinanceReport>) {
    setReport((prev) => {
      // Chain from the previous edit rather than from the memo so two field
      // changes landing in the same React batch cannot overwrite each other.
      const base = prev && working && prev.cycleId === working.cycleId ? prev : working;
      return base ? { ...base, ...patch } : prev;
    });
  }

  function handleSaveDraft() {
    if (!working) return;
    saveFinanceDraft(working, user?.name ?? "Unknown");
    toast.success(`Draft saved for ${working.reportingPeriod}`);
  }

  function handleImportApplied(next: FinanceReport, summary: string) {
    update(next);
    recordFinanceImport(next, user?.name ?? "Unknown", summary);
  }

  function handleReview() {
    if (!working || !validation) return;
    if (!validation.valid) {
      setIssues(validation.issues);
      // Section 36: a refused submission is announced. Without this the dialog
      // simply does not open and the click appears to have done nothing.
      toast.error("Finance submission could not be completed. The blocking issues are listed on each section.");
      const first = validation.issues[0]?.section;
      if (first) setStep(first);
      return;
    }
    setIssues([]);
    setShowReview(true);
  }

  function handleSubmit() {
    if (!working) return;
    const outcome = submitFinanceReport(working, user?.name ?? "Unknown", nextDateOverride ?? undefined);
    if (!outcome.ok) {
      setIssues(outcome.issues ?? []);
      const first = outcome.issues?.[0]?.section;
      if (first) setStep(first);
      setShowReview(false);
      // Section 36: a rejected submission is not silent. Without this the modal
      // closes the review and the user is left guessing whether anything saved.
      toast.error("Finance submission could not be completed. The blocking issues are listed on each section.");
      return;
    }
    // Counted from the same dry run the review screen showed, so the toast, the
    // success panel and the review all quote one number. Reading the alerts off
    // the committed run instead could count a different set.
    const warningCount = computation ? countWarnings(computation, kpis) : 0;
    // Section 36: the confirmation is announced, not only displayed on screen,
    // so it is still seen after the modal closes and the count is explicit.
    toast.success(
      warningCount > 0
        ? `Finance submission saved with ${warningCount} warning${warningCount === 1 ? "" : "s"} detected`
        : "Finance submission saved successfully"
    );
    setDone({
      nextDueDate: outcome.nextDueDate,
      nextPeriod: outcome.nextReportingPeriod,
      warnings: warningCount,
    });
    setReport(null);
    setShowReview(false);
  }

  function handleClose() {
    setReport(null);
    setShowReview(false);
    setIssues([]);
    setStep("revenue");
    setDone(null);
    onClose();
  }

  if (!cycle || !working || !validation || !computation) {
    return (
      <Modal open={open} onClose={handleClose} title="Submit Finance Data" subtitle="No open Finance reporting cycle.">
        <p className="text-sm text-ink-soft/60">
          There is no open Finance reporting cycle to submit against. An administrator can open one from Data /
          Submissions.
        </p>
      </Modal>
    );
  }

  const cycleStatus = getEffectiveStatus(cycle);
  // Type guard rather than a boolean, so the footer navigation can index into
  // FINANCE_SECTION_KEYS without casting `step` back from Step.
  const isSectionStep = (candidate: Step): candidate is FinanceSectionKey =>
    (FINANCE_SECTION_KEYS as readonly string[]).includes(candidate);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="Finance Data Submission"
      subtitle="Recorded to this demo session only - no backend is connected yet."
    >
      {done ? (
        <SuccessPanel done={done} onClose={handleClose} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Cycle header - what period, when due, when next (Sections 2, 4) */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-ink/[0.04] p-4 lg:grid-cols-5">
            <HeaderField label="Reporting period" value={working.reportingPeriod} />
            <HeaderField label="Submission due" value={new Date(cycle.dueDate).toLocaleDateString("en-ZA")} />
            <HeaderField label="Next submission" value={new Date(effectiveNextDate).toLocaleDateString("en-ZA")} />
            <HeaderField label="Frequency" value={working.frequency} />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">Submission status</div>
              <div className="mt-0.5">
                <StatusBadge
                  status={cycleStatus === "Overdue" ? "red" : cycleStatus === "In Progress" ? "amber" : "green"}
                  compact
                />
                <span className="ml-1.5 text-sm font-semibold text-ink">{cycleStatus}</span>
              </div>
            </div>
            {canOverrideDate && (
              <label className="col-span-2 flex flex-col gap-1 lg:col-span-5">
                <span className="text-[11px] uppercase tracking-wide text-ink-soft/40">
                  Override next submission date (optional)
                </span>
                <input
                  type="date"
                  value={effectiveNextDate}
                  onChange={(e) => setNextDateOverride(e.target.value)}
                  className="w-full max-w-[220px] rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink"
                />
              </label>
            )}
          </div>

          {/* Progress + section strip (Section 5) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
                Progress: {completedCount} / {FINANCE_SECTION_KEYS.length} sections completed
              </span>
              <span className="text-sm font-bold text-ink">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-butter transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {FINANCE_SECTION_KEYS.map((key) => {
                const state = sectionStates[key];
                const active = step === key && !showReview;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setShowReview(false);
                      setStep(key);
                    }}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active ? "border-ink bg-ink text-butter" : "border-ink/10 bg-white text-ink-soft/70 hover:bg-ink/5"
                    }`}
                  >
                    {FINANCE_SECTION_LABELS[key]}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-butter/25 text-butter" : stateStyles[state]
                      }`}
                    >
                      {stateLabel[state]}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setShowReview(false);
                  setStep("import");
                }}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  step === "import" && !showReview
                    ? "border-ink bg-ink text-butter"
                    : "border-dashed border-ink/20 bg-white text-ink-soft/60 hover:bg-ink/5"
                }`}
              >
                Import workbook
                <span className="rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[10px] text-ink-soft/60">
                  {working.importRuns.length > 0 ? `${working.importRuns.length} run(s)` : "Optional"}
                </span>
              </button>
            </div>
          </div>

          {issues.length > 0 && (
            <IssuePanel
              issues={issues}
              onJump={(section) => {
                setShowReview(false);
                setStep(section);
              }}
              onDismiss={() => setIssues([])}
            />
          )}

          {showReview ? (
            <ReviewPanel
              report={working}
              computation={computation}
              kpis={kpis}
              sectionStates={sectionStates}
              notes={notes}
              needsExplanation={needsExplanation}
              nextDueDate={effectiveNextDate}
              currencySymbol={financeConfig.currencySymbol}
              onEdit={(section) => {
                setShowReview(false);
                setStep(section);
              }}
              onCommentary={(patch) => update({ commentary: { ...working.commentary, ...patch } })}
            />
          ) : (
            <div className="min-h-[320px]">
              {step === "import" && (
                <FinanceImportWizard
                  report={working}
                  config={financeConfig}
                  onApply={handleImportApplied}
                />
              )}
              {step === "revenue" && (
                <RevenueSection
                  report={working}
                  data={working.revenue}
                  onChange={(revenue) => update({ revenue })}
                  kpis={kpis}
                  config={financeConfig}
                />
              )}
              {step === "cashFlow" && (
                <CashFlowSection
                  report={working}
                  data={working.cashFlow}
                  onChange={(cashFlow) => update({ cashFlow })}
                  kpis={kpis}
                  config={financeConfig}
                  previousPeriodClosingCash={previousPeriodClosingCash}
                />
              )}
              {step === "budgets" && (
                <BudgetsSection
                  report={working}
                  data={working.budgets}
                  onChange={(budgets) => update({ budgets })}
                  kpis={kpis}
                  config={financeConfig}
                  departmentOptions={DEPARTMENT_OPTIONS}
                />
              )}
              {step === "debtors" && (
                <DebtorsSection
                  report={working}
                  data={working.debtors}
                  onChange={(debtors) => update({ debtors })}
                  kpis={kpis}
                  config={financeConfig}
                  departmentOptions={DEPARTMENT_OPTIONS}
                />
              )}
              {step === "creditors" && (
                <CreditorsSection
                  report={working}
                  data={working.creditors}
                  onChange={(creditors) => update({ creditors })}
                  kpis={kpis}
                  config={financeConfig}
                  departmentOptions={DEPARTMENT_OPTIONS}
                />
              )}
              {step === "profitability" && (
                <ProfitabilitySection
                  report={working}
                  data={working.profitability}
                  revenue={working.revenue}
                  onChange={(profitability) => update({ profitability })}
                  kpis={kpis}
                  config={financeConfig}
                  departmentOptions={DEPARTMENT_OPTIONS}
                />
              )}
            </div>
          )}

          {/* Footer - navigation, draft, submit */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-4">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5"
            >
              Save Draft
            </button>
            <div className="flex items-center gap-2">
              {showReview ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowReview(false)}
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5"
                  >
                    Back to sections
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="whitespace-nowrap rounded-full bg-ink px-6 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
                  >
                    Submit Finance Data
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSectionStep(step)) return;
                      const idx = FINANCE_SECTION_KEYS.indexOf(step);
                      if (idx > 0) setStep(FINANCE_SECTION_KEYS[idx - 1]);
                      else setStep("import");
                    }}
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5 disabled:opacity-30"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (step === "import") {
                        setStep("revenue");
                        return;
                      }
                      if (!isSectionStep(step)) return;
                      const idx = FINANCE_SECTION_KEYS.indexOf(step);
                      if (idx < FINANCE_SECTION_KEYS.length - 1) setStep(FINANCE_SECTION_KEYS[idx + 1]);
                      else handleReview();
                    }}
                    className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
                  >
                    {step === "import"
                      ? "Start with Revenue →"
                      : isSectionStep(step) && FINANCE_SECTION_KEYS.indexOf(step) === FINANCE_SECTION_KEYS.length - 1
                        ? "Review Submission →"
                        : "Next →"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Whether a section's rows came from the workbook rather than from typing.
 *  The run must have targeted THIS section: importing Debtors says nothing about
 *  where the Revenue lines came from, and crediting the wrong section to the
 *  workbook would misrepresent provenance. */
function hasImportedData(report: FinanceReport, key: FinanceSectionKey): boolean {
  // "Validated" means the rows landed but some were rejected; only a Failed run
  // wrote nothing.
  return report.importRuns.some((run) => run.status !== "Failed" && run.target === key) && sectionHasRows(report, key);
}

function sectionHasRows(report: FinanceReport, key: FinanceSectionKey): boolean {
  switch (key) {
    case "revenue":
      return report.revenue.lines.length > 0;
    case "cashFlow":
      return Object.values(report.cashFlow.inflows).some((l) => l.amount !== null) ||
        Object.values(report.cashFlow.outflows).some((l) => l.amount !== null);
    case "budgets":
      return report.budgets.lines.length > 0;
    case "debtors":
      return report.debtors.records.length > 0;
    case "creditors":
      return report.creditors.records.length > 0;
    case "profitability":
      return report.profitability.expenses.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

/** Section 25: refuse the submission and say exactly what is missing. */
function IssuePanel({
  issues,
  onJump,
  onDismiss,
}: {
  issues: ValidationIssue[];
  onJump: (section: FinanceSectionKey) => void;
  onDismiss: () => void;
}) {
  const grouped = summariseIssues(issues);
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-rose-800">Your Finance submission is incomplete.</p>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-rose-400 hover:text-rose-700">
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs text-rose-700">
        {issues.length} item{issues.length === 1 ? "" : "s"} still needed before this can be submitted.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {grouped.map((g) => (
          <div key={g.section} className="rounded-xl bg-white/70 p-3">
            <button
              onClick={() => onJump(g.section)}
              className="text-xs font-semibold text-ink underline-offset-2 hover:underline"
            >
              {FINANCE_SECTION_LABELS[g.section]} →
            </button>
            <ul className="mt-1 flex flex-col gap-0.5">
              {g.lines.map((line, i) => (
                <li key={i} className="text-xs text-ink-soft/70">
                  • {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Section 41: the pre-submission review. */
function ReviewPanel({
  report,
  computation,
  kpis,
  sectionStates,
  notes,
  needsExplanation,
  nextDueDate,
  currencySymbol,
  onEdit,
  onCommentary,
}: {
  report: FinanceReport;
  computation: ReturnType<typeof computeFinanceKpis>;
  kpis: ReturnType<typeof useDataStore>["kpis"];
  sectionStates: Record<FinanceSectionKey, FinanceSectionState>;
  notes: string[];
  needsExplanation: { kpiId: string; name: string; value: number; status: "amber" | "red" }[];
  nextDueDate: string;
  currencySymbol: string;
  onEdit: (section: FinanceSectionKey) => void;
  onCommentary: (patch: Partial<FinanceReport["commentary"]>) => void;
}) {
  const { kpiExplanations: _perKpi, ...commentary } = report.commentary;
  const amberCount = countWarnings(computation, kpis);

  const headline: Record<FinanceSectionKey, { label: string; value: string }> = {
    revenue: {
      label: "Revenue",
      value: formatCurrency(computation.revenue?.currentPeriodRevenue ?? null, currencySymbol),
    },
    cashFlow: {
      label: "Closing cash",
      value: formatCurrency(computation.cashFlow?.closingCash ?? null, currencySymbol),
    },
    budgets: {
      label: "Budget remaining (tightest line)",
      value: computation.budgets?.lowestRemaining
        ? `${computation.budgets.lowestRemaining.label}: ${formatCurrency(computation.budgets.lowestRemaining.remaining, currencySymbol)}`
        : "Not derivable",
    },
    debtors: {
      label: "Total debtors",
      value: formatCurrency(computation.debtors?.totalOutstanding ?? null, currencySymbol),
    },
    creditors: {
      label: "Total creditors",
      value: formatCurrency(computation.creditors?.totalOutstanding ?? null, currencySymbol),
    },
    profitability: {
      label: "Operating surplus / (deficit)",
      value: formatCurrency(computation.profitability?.operatingSurplus ?? null, currencySymbol),
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft/60">Finance Submission Review</h3>
        <p className="text-sm text-ink-soft/60">Reporting period: {report.reportingPeriod}</p>
      </div>

      <FinanceWorkbookDependencyNotice dependency={FINANCE_WORKBOOK_DEPENDENCY} />

      <div className="flex flex-col gap-2">
        {FINANCE_SECTION_KEYS.map((key) => {
          const state = sectionStates[key];
          const kpiStatuses = SECTION_KPIS[key]
            .map((kpiId) => {
              const kpi = kpis.find((k) => k.id === kpiId);
              const value = computation.audit[kpiId];
              if (!kpi) return null;
              if (value === null || value === undefined) {
                return {
                  kpi,
                  status: kpi.dataAvailable === false ? ("not_available" as const) : ("no_data" as const),
                  value: null,
                };
              }
              if (kpi.greenThreshold === null || kpi.amberThreshold === null) {
                return { kpi, status: "threshold_unset" as const, value };
              }
              return { kpi, status: getStatusForValue(kpi, value), value };
            })
            .filter(Boolean);

          return (
            <div key={key} className="rounded-2xl border border-ink/10 bg-white/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{FINANCE_SECTION_LABELS[key]}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateStyles[state]}`}>
                    {stateLabel[state]}
                  </span>
                </div>
                <button
                  onClick={() => onEdit(key)}
                  className="text-xs font-semibold text-ink-soft/50 hover:text-ink hover:underline"
                >
                  Edit
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-soft/60">
                {headline[key].label}: <span className="font-semibold text-ink">{headline[key].value}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {kpiStatuses.map((s) =>
                  s ? (
                    <span key={s.kpi.id} className="flex items-center gap-1.5 text-[11px] text-ink-soft/60">
                      <StatusBadge status={s.status} compact />
                      {s.kpi.name}
                      {s.value !== null && (
                        <span className="font-semibold text-ink">
                          {s.kpi.unit === "currency"
                            ? `${currencySymbol}${s.value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
                            : s.kpi.unit === "days"
                              ? `${s.value.toFixed(0)}d`
                              : s.kpi.unit === "percent"
                                ? `${s.value.toFixed(1)}%`
                                : s.value}
                        </span>
                      )}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>

      {computation.skipped.length > 0 && (
        <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
            Not reported from this submission
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {computation.skipped.map((s) => (
              <li key={s.kpiId} className="text-xs text-ink-soft/60">
                • {s.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-2xl bg-butter/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/60">Worth noting</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {notes.map((n, i) => (
              <li key={i} className="text-xs text-ink-soft/70">
                • {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl bg-ink p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Early Warnings</p>
        <p className="mt-1 text-sm text-white/90">
          {amberCount === 0
            ? "No Amber or Red warnings will be raised by this submission."
            : `${amberCount} warning${amberCount === 1 ? "" : "s"} will be raised, each creating a Risk record and a staged Corrective Action.`}
        </p>
      </div>

      {/* Section 31: commentary, with a prompt for every Amber/Red KPI */}
      <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Finance Commentary</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FinTextArea label="Overall Finance commentary" value={commentary.overall} onChange={(v) => onCommentary({ overall: v })} rows={2} />
          <FinTextArea label="Key issue" value={commentary.keyIssue} onChange={(v) => onCommentary({ keyIssue: v })} rows={2} />
          <FinTextArea label="Key achievement" value={commentary.keyAchievement} onChange={(v) => onCommentary({ keyAchievement: v })} rows={2} />
          <FinTextArea label="Revenue commentary" value={commentary.revenueCommentary} onChange={(v) => onCommentary({ revenueCommentary: v })} rows={2} />
          <FinTextArea label="Cash flow commentary" value={commentary.cashFlowCommentary} onChange={(v) => onCommentary({ cashFlowCommentary: v })} rows={2} />
          <FinTextArea label="Budget commentary" value={commentary.budgetCommentary} onChange={(v) => onCommentary({ budgetCommentary: v })} rows={2} />
          <FinTextArea label="Debtors commentary" value={commentary.debtorsCommentary} onChange={(v) => onCommentary({ debtorsCommentary: v })} rows={2} />
          <FinTextArea label="Creditors commentary" value={commentary.creditorsCommentary} onChange={(v) => onCommentary({ creditorsCommentary: v })} rows={2} />
          <FinTextArea label="Profitability commentary" value={commentary.profitabilityCommentary} onChange={(v) => onCommentary({ profitabilityCommentary: v })} rows={2} />
          <FinTextArea label="Action required" value={commentary.actionRequired} onChange={(v) => onCommentary({ actionRequired: v })} rows={2} />
          <FinTextArea label="Support required from Executive Management" value={commentary.supportRequired} onChange={(v) => onCommentary({ supportRequired: v })} rows={2} />
        </div>

        {needsExplanation.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-ink/10 pt-3">
            <p className="text-xs font-semibold text-ink">These KPIs are Amber or Red: please explain why</p>
            {needsExplanation.map((n) => (
              <FinTextArea
                key={n.kpiId}
                label={`Why is "${n.name}" ${n.status === "red" ? "critical" : "outside its threshold"}?`}
                value={report.commentary.kpiExplanations[n.kpiId] ?? ""}
                onChange={(v) =>
                  onCommentary({ kpiExplanations: { ...report.commentary.kpiExplanations, [n.kpiId]: v } })
                }
                rows={2}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-ink/10 p-3">
        <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">Next Finance submission</div>
        <div className="text-sm font-semibold text-ink">{new Date(nextDueDate).toLocaleDateString("en-ZA")}</div>
      </div>
    </div>
  );
}

function SuccessPanel({
  done,
  onClose,
}: {
  done: { nextDueDate?: string; nextPeriod?: string; warnings: number };
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
        ✓
      </div>
      <p className="text-sm font-medium text-ink">Finance submission recorded.</p>
      <p className="max-w-md text-xs text-ink-soft/50">
        Financial KPIs have been calculated, the Early Warning System evaluated, risks and corrective actions
        created, and the Finance and Executive dashboards updated, with no manual refresh needed. Finance is the
        authoritative source for these figures, so nothing was recalculated anywhere else.
      </p>
      {done.warnings > 0 && (
        <p className="text-xs font-semibold text-ink">
          {done.warnings} warning{done.warnings === 1 ? "" : "s"} raised. See the Risk Centre.
        </p>
      )}
      {done.nextDueDate && (
        <p className="text-xs text-ink-soft/60">
          Next Finance submission:{" "}
          <span className="font-semibold text-ink">{new Date(done.nextDueDate).toLocaleDateString("en-ZA")}</span>
          {done.nextPeriod && ` (${done.nextPeriod})`}
        </p>
      )}
      <button
        onClick={onClose}
        className="mt-2 min-w-[160px] whitespace-nowrap rounded-full bg-ink px-7 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
      >
        Done
      </button>
    </div>
  );
}