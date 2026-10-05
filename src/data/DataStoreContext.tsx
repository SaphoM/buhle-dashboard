import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Kpi, DataCollectionCycle, Risk, CorrectiveAction, ActionStatus, CorrectiveActionDraft } from "../types";
import type { AuditAction, AuditEntry, Employee, HrConfig, HrReport } from "../types/hr";
import { DEMO_KPIS, DEMO_RISKS, DEMO_ACTIONS } from "./demoData";
import { DEMO_CYCLES } from "./cyclesData";
import { computeNextDueDate, deriveNextReportingPeriod } from "./cycleEngine";
import { getStatusForValue } from "./kpiEngine";
import { reconcileRiskForKpi, createActionForRisk, type EwsAlert } from "./ewsEngine";
import {
  computeHrKpis,
  HR_KPI_IDS,
  PERFORMANCE_UNAVAILABLE_REASON,
  type HrKpiComputation,
  type SkippedKpi,
} from "./hrEngine";
import { validateHrReport, type ValidationIssue } from "./hrValidation";
import { DEFAULT_HR_CONFIG, HR_SUBMISSION_KPIS } from "./hrSeed";
import type { FinanceConfig, FinanceReport } from "../types/finance";
import { computeFinanceKpis, type FinanceKpiComputation } from "./financeEngine";
import { validateFinanceReport, type ValidationIssue as FinanceValidationIssue } from "./financeValidation";
import { DEFAULT_FINANCE_CONFIG, FINANCE_SUBMISSION_KPIS } from "./financeSeed";
import type { OperationsConfig, OperationsReport, OperationsSectionKey } from "../types/operations";
import { computeOperationsKpis, type OperationsComputation } from "./operationsEngine";
import { validateOperationsReport } from "./operationsValidation";
import { DEFAULT_OPERATIONS_CONFIG, OPERATIONS_SUBMISSION_KPIS } from "./operationsSeed";
import type { FarmingConfig, FarmingReport, FarmingSectionKey } from "../types/farming";
import { computeFarmingKpis, type FarmingComputation } from "./farmingEngine";
import { validateFarmingReport } from "./farmingValidation";
import { DEFAULT_FARMING_CONFIG, FARMING_SUBMISSION_KPIS } from "./farmingSeed";
import type { MarketingConfig, MarketingReport, MarketingSectionKey } from "../types/marketing";
import { computeMarketingKpis, type MarketingComputation } from "./marketingEngine";
import { validateMarketingReport } from "./marketingValidation";
import { DEFAULT_MARKETING_CONFIG, MARKETING_SUBMISSION_KPIS } from "./marketingSeed";
import type { AlumniConfig, AlumniReport, AlumniSectionKey } from "../types/alumni";
import { computeAlumniKpis, type AlumniComputation } from "./alumniEngine";
import { validateAlumniReport } from "./alumniValidation";
import { ALUMNI_SUBMISSION_KPIS, DEFAULT_ALUMNI_CONFIG } from "./alumniSeed";
import type { BdConfig, BdReport } from "../types/businessDevelopment";
import { computeBdKpis, type BdComputation } from "./businessDevelopmentEngine";
import { validateBdReport } from "./businessDevelopmentValidation";
import { BD_SUBMISSION_KPIS, DEFAULT_BD_CONFIG } from "./businessDevelopmentSeed";

// The HR submission owns four KPIs that predate it in name only - they become
// reportable the moment HR submits the underlying records. Finance is the
// authoritative source for a larger set (Sections 30 and 39), so the same applies
// there: a Finance KPI is reportable the moment Finance submits its records.
// Operations works the same way, and it carries the two ids the demo risks and
// the Executive roll-up already point at (kpi-enrolment, kpi-completion), so
// those must exist in the store from the first render rather than appearing only
// after a submission.
const INITIAL_KPIS: Kpi[] = [
  ...DEMO_KPIS,
  ...HR_SUBMISSION_KPIS,
  ...FINANCE_SUBMISSION_KPIS,
  ...OPERATIONS_SUBMISSION_KPIS,
];

// Lifts the KPI and Cycle demo arrays into React state so a department
// manager's submission (via the Input Modal - Section 47) actually flows
// through: SUBMISSION -> KPI CALCULATION -> dashboards/EWS re-render.
// In-memory only, same as the rest of this demo - no backend yet.

/**
 * The outcome of either submission path (HR or Finance).
 *
 * Shared on purpose: both submissions run the same chain and the same
 * validation contract, so the modals report "what is missing" identically. Only
 * the KPI computation differs, because the two domains calculate different
 * measures - but both produce plain KPI values that the shared pipeline consumes.
 */
export interface SubmissionOutcome<
  TIssue = ValidationIssue,
  TComputation = HrKpiComputation
> {
  ok: boolean;
  /** Present when ok is false - exactly what is missing, per Section 18. */
  issues?: TIssue[];
  /** EWS alerts raised by this submission, for a single composite toast. */
  alerts?: EwsAlert[];
  computation?: TComputation;
  /** The next submission date the cycle engine calculated (Section 19). */
  nextDueDate?: string;
  nextReportingPeriod?: string;
}

export type FinanceSubmissionOutcome = SubmissionOutcome<
  FinanceValidationIssue,
  FinanceKpiComputation
>;

/** Retained as the historical name for the HR path. */
export type HrSubmissionOutcome = SubmissionOutcome;

export interface DataStoreValue {
  kpis: Kpi[];
  cycles: DataCollectionCycle[];
  risks: Risk[];
  actions: CorrectiveAction[];
  /** HR six-section reports, newest last. Drafts and submissions alike. */
  hrReports: HrReport[];
  /**
   * Finance six-section reports, newest last. One per Finance cycle. Because
   * Finance is the authoritative source for several Executive KPIs (Section 39),
   * these reports are what the Executive Dashboard ultimately reads.
   */
  financeReports: FinanceReport[];
  /** Operations submissions, one per reporting cycle (Section 6 and the seven
   *  reporting areas that follow it). */
  operationsReports: OperationsReport[];
  /** Commercial Farming register submissions, one per reporting cycle. */
  farmingReports: FarmingReport[];
  /** Marketing register submissions, one per reporting cycle. */
  marketingReports: MarketingReport[];
  /** Alumni tracer-study submissions, one per reporting cycle. */
  alumniReports: AlumniReport[];
  /** Business Development submissions. */
  bdReports: Record<string, BdReport>;
  bdConfig: BdConfig;
  /** Employee registry - the single source for employee identity (Section 26). */
  employees: Employee[];
  /** Append-only record of every consequential change (Section 19, step 12). */
  auditLog: AuditEntry[];
  hrConfig: HrConfig;
  /** Section 4: Finance cadence, currency, categories, ageing and the
   *  committed-budget convention all live in configuration, never in a formula. */
  financeConfig: FinanceConfig;
  /** Approved Operations vocabularies and cadence. Every vocabulary the
   *  validation and the import check against is configured, not hard-coded. */
  operationsConfig: OperationsConfig;
  /** Commercial Farming: approved crops, plots, livestock categories, mortality
   *  causes, diseases, water sources, sales channels, cost categories and cost
   *  centres, plus the reporting cadence and the currency revenue is shown in.
   *  Validation checks every vocabulary against these, so a record cannot name a
   *  category that this season's configuration does not carry. */
  farmingConfig: FarmingConfig;
  /** Marketing: approved enquiry channels and OUTCOMES, campaign channels and
   *  states, lead sources, partnership types and states, programmes and
   *  provinces. The outcome list is configuration because the conversion rate is
   *  derived from it: adding an outcome there immediately changes what counts as
   *  a conversion, and that is a policy decision rather than a coding one. */
  marketingConfig: MarketingConfig;
  /** Alumni: the tracer-study cadence, the currency, and every approved
   *  vocabulary the derived rates are built from - including the employment
   *  statuses and loan states that define what counts as economically active and
   *  what counts as repaid. Those two lists are configuration because they decide
   *  what the headline figures mean: changing one redefines a rate, and that is
   *  a policy decision rather than a coding one.
   *
   *  Also carries `minimumResponseRatePct`, the point below which the department
   *  must warn that its sample may not represent the cohort. It does not raise an
   *  Early Warning - it governs how boldly the department may present its own
   *  numbers. */
  alumniConfig: AlumniConfig;
  bdReports: Record<string, BdReport>;
  bdConfig: BdConfig;
  /**
   * Records values for one or more KPIs in a single atomic step - clears
   * "no data", shifts history forward, then reacts: creates/escalates/
   * resolves the risk tied to each one, and raises an alert per change.
   * Takes a batch (not one call per KPI) so a single submission that trips
   * two thresholds at once evaluates correctly - each call in a loop would
   * otherwise read the same pre-submission risks snapshot and clobber each
   * other's new risk records. Returns what changed so the caller (the
   * submission modal) can raise one composite confirmation toast instead of
   * a separate notification per risk event.
   */
  submitKpiValues: (entries: { kpiId: string; value: number }[]) => EwsAlert[];
  /**
   * Marks a cycle as submitted, then re-evaluates the cycle engine (Section
   * 62): calculates the next submission date and opens the next cycle
   * automatically, so nobody has to manually schedule it.
   */
  submitCycle: (cycleId: string, submittedBy: string, nextDueDateOverride?: string) => void;
  /** Section 51: an authorised user manually overrides a calculated due date. */
  overrideCycleDueDate: (cycleId: string, newDueDate: string) => void;
  /**
   * Section 60 (Early Warning Configuration): admin edits a KPI's own
   * target/threshold - this is the one place "the trigger and limits" are
   * actually set. Marks the KPI's thresholdApproval as "confirmed" since an
   * administrator just explicitly set the value.
   */
  updateKpiThresholds: (
    kpiId: string,
    updates: Partial<Pick<Kpi, "target" | "greenThreshold" | "amberThreshold">>
  ) => void;
  /** Advances an action Open -> In Progress -> Completed (used by the
   *  Corrective Actions page's "Advance" control). */
  advanceActionStatus: (actionId: string) => void;
  /** Section 2: the HR reporting cadence is configuration, not a constant. */
  updateHrConfig: (updates: Partial<HrConfig>) => void;
  /** Saves partial progress without submitting, and without touching KPIs/EWS. */
  saveHrDraft: (report: HrReport, actor: string) => void;
  /**
   * The full HR chain (Section 19): validate -> save -> calculate KPIs ->
   * compare to targets -> RAG -> evaluate EWS -> create/update risks -> create
   * actions -> update dashboards -> calculate next submission date -> audit.
   *
   * Returns ok:false with the precise list of missing items rather than
   * throwing, so the modal can render "what is missing" directly.
   */
  submitHrReport: (report: HrReport, submittedBy: string, nextDueDateOverride?: string) => HrSubmissionOutcome;
  /** Section 2/4: Finance configuration is administration-owned. */
  updateFinanceConfig: (updates: Partial<FinanceConfig>) => void;
  /**
   * Operations configuration is administration-owned too, and is where the
   * approved vocabularies (programmes, asset categories, dropout reasons) and
   * the reporting cadence live. These are the values the Operations engine reads
   * when it validates and derives, so changing one here changes what a
   * submission is allowed to say.
   */
  updateOperationsConfig: (updates: Partial<OperationsConfig>) => void;
  /** Saves partial Operations progress without submitting, and without touching KPIs/EWS. */
  saveOperationsDraft: (report: OperationsReport, actor: string) => void;
  /**
   * Records a workbook import against an Operations report, including a failed
   * one. Separate from saving a draft so the audit trail distinguishes a number
   * read from a spreadsheet from a number typed in.
   */
  recordOperationsImport: (report: OperationsReport, actor: string, summary: string) => void;
  /**
   * The full Operations chain, mirroring Finance and HR: validate -> save ->
   * calculate KPIs -> RAG -> evaluate EWS -> create/update risks -> open the next
   * cycle -> audit.
   */
  submitOperationsReport: (
    report: OperationsReport,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => Promise<
    | {
        ok: true;
        alerts: EwsAlert[];
        computation: OperationsComputation;
        nextDueDate?: string;
        nextReportingPeriod?: string;
      }
    | { ok: false; issues: ReturnType<typeof validateOperationsReport>["issues"] }
  >;
  /** Applies Commercial Farming configuration: cadence, currency and every
   *  approved vocabulary the validation checks against. A cadence change moves
   *  the open Commercial Farming cycle with it, as it does for every other
   *  department. */
  updateFarmingConfig: (updates: Partial<FarmingConfig>) => void;
  /** Saves Commercial Farming register progress without submitting, and without
   *  touching KPIs or Early Warning. */
  saveFarmingDraft: (report: FarmingReport, actor: string) => void;
  /** The full Commercial Farming chain, identical in shape to Operations:
   *  validate -> save -> calculate KPIs -> RAG -> evaluate EWS -> create/update
   *  risks -> open the next cycle -> audit. Nothing is derived before validation
   *  passes, and a KPI the registers cannot produce is marked not derivable
   *  rather than left showing the previous season's figure. */
  submitFarmingReport: (
    report: FarmingReport,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => Promise<
    | {
        ok: true;
        alerts: EwsAlert[];
        computation: FarmingComputation;
        nextDueDate?: string;
        nextReportingPeriod?: string;
      }
    | { ok: false; issues: ReturnType<typeof validateFarmingReport>["issues"] }
  >;
  /** Applies Marketing configuration: cadence, currency and every approved
   *  vocabulary the validation checks against. A cadence change moves the open
   *  Marketing cycle with it, as it does for every other department. */
  updateMarketingConfig: (updates: Partial<MarketingConfig>) => void;
  /** Saves Marketing register progress without submitting, and without touching
   *  KPIs or Early Warning. */
  saveMarketingDraft: (report: MarketingReport, actor: string) => void;
  /** The full Marketing chain, identical in shape to the other departments:
   *  validate -> save -> calculate KPIs -> RAG -> evaluate EWS -> create/update
   *  risks -> open the next cycle -> audit. Nothing is derived before validation
   *  passes, and a KPI the registers cannot produce is marked not derivable
   *  rather than left showing last month's figure. */
  submitMarketingReport: (
    report: MarketingReport,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => Promise<
    | {
        ok: true;
        alerts: EwsAlert[];
        computation: MarketingComputation;
        nextDueDate?: string;
        nextReportingPeriod?: string;
      }
    | { ok: false; issues: ReturnType<typeof validateMarketingReport>["issues"] }
  >;
  /** Applies Alumni configuration: cadence, currency and every approved
   *  vocabulary the derived rates depend on. A cadence change moves the open
   *  Alumni cycle with it, as it does for every other department. */
  updateAlumniConfig: (updates: Partial<AlumniConfig>) => void;
  /** Saves Alumni register progress without submitting, and without touching
   *  KPIs or Early Warning. */
  saveAlumniDraft: (report: AlumniReport, actor: string) => void;
  /** The full Alumni chain, identical in shape to the other departments:
   *  validate -> save -> calculate KPIs -> RAG -> evaluate EWS -> create/update
   *  risks -> open the next cycle -> audit.
   *
   *  One difference: Alumni validation returns two grades of issue, and only the
   *  BLOCKING ones refuse. Facts the department can only state rather than fix -
   *  a thin response rate, a loan in arrears - pass through and are carried to
   *  the review page instead, because refusing them would mean a cohort that is
   *  hard to reach could never be reported on. */
  submitAlumniReport: (
    report: any,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => Promise<SubmissionOutcome<any, any>>;
  submitBdReport: (
    report: any,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => Promise<SubmissionOutcome<any, any>>;
  updateAlumniConfig: (updates: Partial<AlumniConfig>) => {
        setAlumniConfig((prev) => ({ ...prev, ...updates }));

        // The cadence is configuration, so the open Alumni cycle takes the new
        // cadence with it rather than keeping the seeded one. The tracer-study
        // cadence matters more here than elsewhere: it is what decides how long
        // after graduation a graduate is asked how they are doing.
        if (updates.reportingFrequency) {
          const frequency = updates.reportingFrequency;
          setCycles((prev) =>
            prev.map((c) =>
              c.department === "Alumni" && !["Closed", "Accepted"].includes(c.status) ? { ...c, frequency } : c
            )
          );
        }

        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            "Administrator",
            "alumni_config_updated",
            "Alumni",
            // The employment and loan lists are named explicitly, because
            // changing one of those changes what the headline rates MEAN rather
            // than merely how they are labelled.
            Object.keys(updates).includes("employmentStatuses") ||
            Object.keys(updates).includes("loanStatuses")
              ? `Alumni configuration updated: ${Object.keys(updates).join(", ")}. The approved employment and loan states define the economically active rate and the repayment rate, so every Alumni rate for this period now rests on the revised lists.`
              : `Alumni configuration updated: ${Object.keys(updates).join(", ")}.`,
            Object.fromEntries(
              Object.entries(updates).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") || "(emptied)" : String(v),
              ])
            )
          ),
        ]);
      },
      saveAlumniDraft: (report, actor) => {
        const stamped: AlumniReport = { ...report, status: "Draft", savedAt: new Date().toISOString() };
        setAlumniReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(actor, "alumni_draft_saved", "Alumni", `Draft saved for ${report.reportingPeriod}.`, {
            reportId: report.id,
            cycleId: report.cycleId,
            // The sample size is recorded on the draft itself. A tracer study in
            // progress is easy to misread as a complete one, and the audit trail
            // is where that gap gets recorded rather than assumed.
            traced: report.cohort.tracedThisPeriod ?? null,
            cohort: report.cohort.graduatesInCohort ?? null,
          }),
        ]);
      },
    submitAlumniReport: async (report: any, submittedBy: string, nextDueDateOverride?: string) => {
        // BD helper could be added elsewhere; but quick integration
        if (report.department === "Business Development") {
          const validation = validateBdReport(report);
          if (validation.length > 0) {
            return { ok: false, issues: validation as any };
          }
          const now = new Date().toISOString();
          const submitted = { ...report, submittedAt: now, submittedBy };
          const computation = computeBdKpis(submitted, kpis, { stalledThresholdDays: bdConfig.stalledThresholdDays });
          setBdReports((prev: any) => ({ ...prev, [submitted.reportId]: submitted }));
          const kpiRun = runKpiSubmission(
            {
              kpis: computation.kpis,
              previousKpis: kpis,
              department: "Business Development" as any,
              reportingPeriod: submitted.reportingPeriod,
              submittedBy,
              nextDueDateOverride,
            },
            { cycles, setCycles, kpis, setKpis, risks, setRisks, actions, setActions, auditLog, setAuditLog }
          );
          return { ok: true, alerts: kpiRun.alerts, nextDueDate: kpiRun.nextDueDate, nextReportingPeriod: kpiRun.nextReportingPeriod };
        }

        // Step 1: VALIDATE. Only BLOCKING issues refuse.
        //
        // The distinction is the point of this department's validation. A
        // contradiction somebody can type their way out of refuses the
        // submission. A thin response rate or a loan in arrears does not, because
        // neither is a data-entry mistake - both are facts, and refusing them
        // would mean the department could only ever report on cohorts it found
        // easy to reach. Those are returned separately and carried to review.
        const validation = validateAlumniReport(report, { config: alumniConfig });
        if (!validation.valid) {
          return { ok: false, issues: validation.blockingIssues, attentionIssues: validation.attentionIssues };
        }

        const now = new Date().toISOString();
        const submitted: AlumniReport = {
          ...report,
          status: "Submitted",
          submittedAt: now,
          submittedBy,
          savedAt: undefined,
          // Every figure this period came from a person tracing graduates, so
          // the provenance says so rather than implying a system feed.
          dataSource: { ...report.dataSource, kind: "Manual Entry" },
        };

        // Steps 2-4: SAVE, then CALCULATE. The only place Alumni KPIs are
        // derived; every other surface reads these values.
        const computation = computeAlumniKpis(submitted, kpis, alumniConfig);
        setAlumniReports((prev) => [...prev.filter((r) => r.id !== submitted.id), submitted]);

        // Steps 5-8: the shared pipeline. A KPI the registers could not derive
        // is cleared rather than left showing an earlier cohort's figure as
        // though it described this one - which is how a 40% response rate from
        // twelve graduates ends up on the executive dashboard looking like a
        // departmental result.
        const cleared = clearSkippedKpis(computation.skipped, kpis, risks);
        const kpiRun = runKpiSubmission(
          computation.entries,
          { kpis: cleared.kpis, risks: cleared.risks, actions },
          submitted.reportingPeriod
        );
        setKpis(kpiRun.kpis);
        setRisks(kpiRun.risks);
        setActions(kpiRun.actions);

        // Step 9: open the next cycle.
        const cycleRun = runCycleSubmission(report.cycleId, submittedBy, nextDueDateOverride, cycles);
        setCycles(cycleRun.cycles);

        // Step 10: AUDIT. The sample size is recorded on the submission itself,
        // not just in the message, so any figure derived from it can be traced
        // back to how many graduates it was actually based on.
        const derivedCount = computation.entries.length;
        const skippedCount = computation.skipped.length;
        const cohort = submitted.cohort;
        const sampleNote =
          typeof cohort.tracedThisPeriod === "number" && typeof cohort.graduatesInCohort === "number"
            ? ` Traced ${cohort.tracedThisPeriod} of ${cohort.graduatesInCohort} graduates in the cohort (${computation.cohort?.responseRatePct ?? 0}% response).`
            : "";
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            submittedBy,
            "alumni_report_submitted",
            "Alumni",
            `Alumni tracer study submitted for ${report.reportingPeriod}: ${derivedCount} KPI(s) calculated, ${skippedCount} not derivable, source ${submitted.dataSource.kind}.${sampleNote}`,
            {
              reportId: submitted.id,
              cycleId: report.cycleId,
              reportingPeriod: submitted.reportingPeriod,
              dataSource: submitted.dataSource.kind,
              kpisCalculated: derivedCount,
              kpisSkipped: skippedCount,
              cohortSize: cohort.graduatesInCohort ?? null,
              tracedThisPeriod: cohort.tracedThisPeriod ?? null,
              untraceable: cohort.untraceable ?? null,
              tracingMethod: cohort.tracingMethod || null,
              responseRatePct: computation.cohort?.responseRatePct ?? null,
              belowMinimumResponse: computation.cohort?.belowMinimumResponse
                ? `yes - below the ${computation.cohort.minimumResponseRatePct}% minimum set in Administration`
                : "no",
              // An arrears balance is money, so it is recorded on the submission
              // rather than only being visible on a dashboard card.
              loansInArrears: computation.loans?.arrears ?? null,
              arrearsValue: computation.loans?.arrearsValue ?? null,
              // Both counts are kept because "not applicable" and "complete" are
              // different facts, and only one of them means the department
              // answered for that register.
              sectionsReported: (Object.entries(validation.bySection) as [AlumniSectionKey, { state: string }][])
                .filter(([, sec]) => sec.state === "complete")
                .map(([key]) => key)
                .join(", "),
              sectionsNotApplicable: (Object.entries(validation.bySection) as [AlumniSectionKey, { state: string }][])
                .filter(([, sec]) => sec.state === "not_applicable")
                .map(([key]) => key)
                .join(", "),
              issuesAcknowledged: validation.attentionIssues.length,
              nextDueDate: cycleRun.nextDueDate ?? null,
            }
          ),
        ]);

        return {
          ok: true,
          alerts: kpiRun.alerts,
          computation,
          nextDueDate: cycleRun.nextDueDate,
          nextReportingPeriod: cycleRun.nextReportingPeriod,
        };
      },
      saveFinanceDraft: (report, actor) => {
        const stamped: FinanceReport = { ...report, status: "Draft", savedAt: new Date().toISOString() };
        setFinanceReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(actor, "finance_draft_saved", "Finance", `Draft saved for ${report.reportingPeriod}.`, {
            reportId: report.id,
            cycleId: report.cycleId,
          }),
        ]);
      },
      recordFinanceImport: (report, actor, summary) => {
        const stamped: FinanceReport = { ...report, savedAt: new Date().toISOString() };
        setFinanceReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        // The run's own status decides the audit action. Sniffing the summary
        // text for a prefix meant a failed import could be filed as a successful
        // one - and a failed import is exactly the event Section 33 exists to
        // make visible.
        const latestRun = report.importRuns[report.importRuns.length - 1];
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            actor,
            latestRun?.status === "Failed" ? "finance_import_failed" : "finance_import_completed",
            "Finance",
            summary || `Workbook import recorded for ${report.reportingPeriod}.`,
            {
              reportId: report.id,
              fileName: report.dataSource.fileName ?? null,
              sheetName: report.dataSource.sheetName ?? null,
              runs: report.importRuns.length,
            }
          ),
        ]);
      },
      submitFinanceReport: (report, submittedBy, nextDueDateOverride) => {
        // Section 35, step 1: VALIDATE. Same refusal rule as HR - a partial
        // report that looks submitted is the failure mode this guards against.
        const validation = validateFinanceReport(report, {
          revenueCategoryIds: financeConfig.revenueCategories.map((c) => c.id),
          expenseCategories: financeConfig.expenseCategories,
        });
        if (!validation.valid) {
          return { ok: false, issues: validation.issues };
        }

        const now = new Date().toISOString();
        const submitted: FinanceReport = {
          ...report,
          status: "Submitted",
          submittedAt: now,
          submittedBy,
          savedAt: undefined,
          // Section 27: an imported submission says so, so the dashboard can
          // tell a figure read from a workbook from one that was typed.
          dataSource:
            report.dataSource.kind === "Workbook Import" || report.importRuns.length > 0
              ? { ...report.dataSource, kind: "Workbook Import" }
              : { ...report.dataSource, kind: "Manual Entry" },
        };

        // Steps 2-4: SAVE, then CALCULATE. Section 39: this is the only place
        // financial KPIs are derived. Everything else reads these values.
        const computation = computeFinanceKpis(submitted, kpis, financeConfig);
        setFinanceReports((prev) => [
          ...prev.filter((r) => r.id !== submitted.id),
          { ...submitted, computedKpis: computation.audit },
        ]);

        // Steps 5-8: the identical shared pipeline HR uses. A Finance KPI the
        // submission could not derive must not keep displaying the prior
        // period's figure as though it described this one, and a risk resting on
        // that stale figure must close (Sections 24, 25).
        const cleared = clearSkippedKpis(computation.skipped, kpis, risks);
        const kpiRun = runKpiSubmission(
          computation.entries,
          { kpis: cleared.kpis, risks: cleared.risks, actions },
          submitted.reportingPeriod
        );
        setKpis(kpiRun.kpis);
        setRisks(kpiRun.risks);
        setActions(kpiRun.actions);

        // Steps 9-10: dashboards already read `kpis`. Open the next cycle.
        const cycleRun = runCycleSubmission(report.cycleId, submittedBy, nextDueDateOverride, cycles);
        setCycles(cycleRun.cycles);

        // Step 11: AUDIT.
        const derivedCount = computation.entries.length;
        const skippedCount = computation.skipped.length;
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            submittedBy,
            "finance_report_submitted",
            "Finance",
            `Finance report submitted for ${report.reportingPeriod}: ${derivedCount} KPI(s) calculated, ${skippedCount} not derivable, source ${submitted.dataSource.kind}.`,
            {
              reportId: submitted.id,
              cycleId: report.cycleId,
              reportingPeriod: report.reportingPeriod,
              dataSource: submitted.dataSource.kind,
              kpisCalculated: derivedCount,
              kpisSkipped: skippedCount,
              nextDueDate: cycleRun.nextDueDate ?? null,
            }
          ),
        ]);

        return {
          ok: true,
          alerts: kpiRun.alerts,
          computation,
          nextDueDate: cycleRun.nextDueDate,
          nextReportingPeriod: cycleRun.nextReportingPeriod,
        };
      },
      createActionForRiskId: (riskId, draft) => {
        const risk = risks.find((r) => r.id === riskId);
        if (!risk) return null;
        const kpi = kpis.find((k) => k.id === risk.kpiId);
        // The reporting period comes from the report that raised this risk, so
        // it is matched on the KPI the risk belongs to - not on the cycle id.
        const report = [...hrReports]
          .reverse()
          .find((r) => r.computedKpis && Object.prototype.hasOwnProperty.call(r.computedKpis, risk.kpiId));
        const action: CorrectiveAction = {
          id: `act-${risk.id}-${Date.now()}`,
          riskId,
          description: draft.description,
          owner: draft.owner,
          dueDate: draft.dueDate,
          status: "Open",
          createdDate: new Date().toISOString().slice(0, 10),
          // Section 24: inherit the evidence so the action explains itself.
          context: {
            department: risk.department,
            kpiName: risk.name,
            currentValue: kpi ? `${kpi.currentValue}` : `${risk.currentValue}`,
            target: `${risk.target}`,
            ragStatus: risk.level.toUpperCase(),
            reportingPeriod: report?.reportingPeriod ?? "Current period",
            dateDetected: risk.dateDetected,
            notes: draft.notes,
          },
        };
        setActions((prev) => [...prev, action]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(draft.owner, "action_created", risk.department, `Corrective action raised against "${risk.name}".`, {
            riskId,
            dueDate: draft.dueDate,
          }),
        ]);
        return action;
      },
    }),
    [
      kpis,
      cycles,
      risks,
      actions,
      hrReports,
      financeReports,
      operationsReports,
      employees,
      auditLog,
      hrConfig,
      financeConfig,
      operationsConfig,
      farmingConfig,
      farmingReports,
      marketingConfig,
      marketingReports,
      alumniConfig,
      alumniReports,
    ]
  );

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}

export function useDataStore() {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore must be used within DataStoreProvider");
  return ctx;
}
