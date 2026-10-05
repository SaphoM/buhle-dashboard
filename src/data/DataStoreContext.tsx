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
    report: AlumniReport,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => Promise<
    | {
        ok: true;
        alerts: EwsAlert[];
        computation: AlumniComputation;
        nextDueDate?: string;
        nextReportingPeriod?: string;
      }
    | {
        ok: false;
        issues: ReturnType<typeof validateAlumniReport>["blockingIssues"];
        attentionIssues: ReturnType<typeof validateAlumniReport>["attentionIssues"];
      }
  >;
  saveFinanceDraft: (report: FinanceReport, actor: string) => void;
  /**
   * Records a workbook import against a Finance report (Section 26). Kept
   * separate from saving a draft so the audit trail distinguishes an import from
   * typing, which is the difference Finance needs when tracing a figure back to
   * a cell.
   */
  recordFinanceImport: (report: FinanceReport, actor: string, summary: string) => void;
  /**
   * The full Finance chain (Section 35), mirroring the HR one: validate ->
   * save -> calculate KPIs -> RAG -> evaluate EWS -> create/update risks ->
   * create actions -> update dashboards -> calculate next submission date ->
   * audit.
   *
   * Finance is authoritative for its KPIs (Section 39), so this deliberately
   * drives the same shared pipeline rather than computing a parallel set of
   * "Finance-only" values.
   */
  submitFinanceReport: (
    report: FinanceReport,
    submittedBy: string,
    nextDueDateOverride?: string
  ) => FinanceSubmissionOutcome;
  /**
   * Section 24: raise a corrective action against an existing risk. The KPI,
   * current value, target, RAG status, reporting period and detection date are
   * inherited from the risk; the caller supplies action, owner and due date.
   */
  createActionForRiskId: (riskId: string, draft: CorrectiveActionDraft) => CorrectiveAction | null;
}

const DataStoreContext = createContext<DataStoreValue | undefined>(undefined);

/** Appends one entry to the audit log. Every consequential change goes through
 *  here so the trail is complete by construction rather than by discipline. */
function auditEntry(
  actor: string,
  action: AuditAction,
  department: Kpi["department"],
  summary: string,
  details?: Record<string, string | number | null>
): AuditEntry {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    department,
    summary,
    details,
  };
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [hrConfig, setHrConfig] = useState<HrConfig>(DEFAULT_HR_CONFIG);
  const [financeConfig, setFinanceConfig] = useState<FinanceConfig>(DEFAULT_FINANCE_CONFIG);
  const [operationsConfig, setOperationsConfig] = useState<OperationsConfig>(DEFAULT_OPERATIONS_CONFIG);
  const [farmingConfig, setFarmingConfig] = useState<FarmingConfig>(DEFAULT_FARMING_CONFIG);
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig>(DEFAULT_MARKETING_CONFIG);
  const [alumniConfig, setAlumniConfig] = useState<AlumniConfig>(DEFAULT_ALUMNI_CONFIG);
  const [kpis, setKpis] = useState<Kpi[]>(() =>
    // Section 8/9: the Staff Performance KPI's availability is driven by the
    // HR configuration switch, not hard-coded, so the toggle in Administration
    // is immediately true everywhere rather than only inside the modal.
    // Commercial Farming's derived KPIs are appended to the seeded list, with the
    // two that already exist (farm revenue, mortality) de-duplicated by id: the
    // same identifier must not appear twice in the store, or the KPI pipeline and
    // a risk pointing at that id would disagree about which record they mean.
    [
      ...INITIAL_KPIS,
      ...FARMING_SUBMISSION_KPIS.filter((fk) => !INITIAL_KPIS.some((k) => k.id === fk.id)),
      ...MARKETING_SUBMISSION_KPIS.filter((mk) => !INITIAL_KPIS.some((k) => k.id === mk.id)),
      // `kpi-alumni` already ships in INITIAL_KPIS with approved limits
      // (green 68 / amber 55), so the id filter keeps the seeded record and
      // carries its thresholds through. Only the twelve new figures are appended,
      // and they ship without limits rather than with invented ones.
      ...ALUMNI_SUBMISSION_KPIS.filter((ak) => !INITIAL_KPIS.some((k) => k.id === ak.id)),
    ].map(
      (kpi) =>
        kpi.id === HR_KPI_IDS.performance
          ? {
              ...kpi,
              dataAvailable: false,
              notAvailableReason: DEFAULT_HR_CONFIG.performanceManagementActive
                ? undefined
                : PERFORMANCE_UNAVAILABLE_REASON,
            }
          : kpi
    )
  );
  // Section 2/4: reporting frequency is configuration for both HR and Finance,
  // so the open cycle takes its cadence from config rather than from the value
  // the seed data happened to carry.
  const [cycles, setCycles] = useState<DataCollectionCycle[]>(() =>
    DEMO_CYCLES.map((c) => {
      if (c.cycleId.startsWith("cyc-hr-data-")) return { ...c, frequency: DEFAULT_HR_CONFIG.reportingFrequency };
      if (c.department === "Finance") return { ...c, frequency: DEFAULT_FINANCE_CONFIG.reportingFrequency };
      if (c.department === "Operations") return { ...c, frequency: DEFAULT_OPERATIONS_CONFIG.reportingFrequency };
      if (c.department === "Commercial Farming") {
        return { ...c, frequency: DEFAULT_FARMING_CONFIG.reportingFrequency };
      }
      if (c.department === "Marketing") return { ...c, frequency: DEFAULT_MARKETING_CONFIG.reportingFrequency };
      if (c.department === "Alumni") return { ...c, frequency: DEFAULT_ALUMNI_CONFIG.reportingFrequency };
      return c;
    })
  );
  const [risks, setRisks] = useState<Risk[]>(DEMO_RISKS);
  const [actions, setActions] = useState<CorrectiveAction[]>(DEMO_ACTIONS);
  const [hrReports, setHrReports] = useState<HrReport[]>([]);
  const [financeReports, setFinanceReports] = useState<FinanceReport[]>([]);
  const [operationsReports, setOperationsReports] = useState<OperationsReport[]>([]);
  const [farmingReports, setFarmingReports] = useState<FarmingReport[]>([]);
  const [marketingReports, setMarketingReports] = useState<MarketingReport[]>([]);
  const [alumniReports, setAlumniReports] = useState<AlumniReport[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  /**
   * Pure core of the KPI submission path: takes a snapshot of state and returns
   * the next state plus the alerts raised. Kept separate from the context
   * methods so the HR submission can drive the exact same pipeline (Section 19
   * steps 5-8) instead of reimplementing it.
   */
  function runKpiSubmission(
    entries: { kpiId: string; value: number }[],
    snapshot: { kpis: Kpi[]; risks: Risk[]; actions: CorrectiveAction[] },
    /** The period these values describe, so risks and actions can name it. */
    reportingPeriod?: string
  ): { kpis: Kpi[]; risks: Risk[]; actions: CorrectiveAction[]; alerts: EwsAlert[] } {
    // Computed synchronously against the snapshot and returned together -
    // everything in the batch is derived here, in order, so two KPIs changing
    // at once both land correctly instead of racing each other.
    let workingKpis = snapshot.kpis;
    let workingRisks = snapshot.risks;
    let workingActions = snapshot.actions;
    const newAlerts: EwsAlert[] = [];

    for (const { kpiId, value } of entries) {
      const kpi = workingKpis.find((k) => k.id === kpiId);
      if (!kpi) continue;
      // The submission modal resubmits every field it shows, including
      // ones the user never touched - a no-op re-submit must not shift
      // previousValue/history, or every untouched KPI's trend would
      // flatten to 0% just because it shared a form with an edited one.
      const changed = kpi.dataAvailable === false || value !== kpi.currentValue;
      if (!changed) continue;

      const updatedKpi: Kpi = {
        ...kpi,
        previousValue: kpi.currentValue,
        currentValue: value,
        dataAvailable: true,
        lastUpdated: new Date().toISOString().slice(0, 10),
        history: [...kpi.history.slice(-5), { period: "Latest", value }],
      };
      workingKpis = workingKpis.map((k) => (k.id === kpiId ? updatedKpi : k));

      // Section 62, steps 5-7: react, don't just recolour. Evaluate the
      // new value against this KPI's own thresholds and create/escalate/
      // resolve the risk record tied to it - this is what actually shows
      // up in the Risk Centre and dashboards, not just a badge.
      const newStatus = getStatusForValue(updatedKpi, value);
      const { risks: nextRisks, alert, createdRisk } = reconcileRiskForKpi(
        updatedKpi,
        newStatus,
        workingRisks,
        reportingPeriod
      );
      workingRisks = nextRisks;
      if (alert) newAlerts.push(alert);

      // Section 22/62: a newly-raised risk doesn't just sit there - stage
      // a corrective action for it automatically, owned and due.
      if (createdRisk) {
        const action = createActionForRisk(createdRisk);
        workingActions = [...workingActions, action];
        newAlerts.push({
          id: `alert-${action.id}-${Date.now()}`,
          kind: "created",
          level: createdRisk.level,
          message: `Action created: "${action.description}" - ${action.owner}, due ${new Date(action.dueDate).toLocaleDateString("en-ZA")}.`,
          timestamp: action.createdDate,
        });
      }
    }

    return { kpis: workingKpis, risks: workingRisks, actions: workingActions, alerts: newAlerts };
  }

  /**
   * Section 24 applied to KPIs this submission could NOT derive.
   *
   * A KPI left out of a submission must not keep displaying the previous
   * period's figure as though it described the current one, and a risk raised
   * against that stale figure must not stay open. Both are cleared explicitly
   * here rather than left to chance.
   */
  function clearSkippedKpis(
    skipped: SkippedKpi[],
    currentKpis: Kpi[],
    currentRisks: Risk[]
  ): { kpis: Kpi[]; risks: Risk[] } {
    if (skipped.length === 0) return { kpis: currentKpis, risks: currentRisks };
    const byId = new Map(skipped.map((s) => [s.kpiId, s]));

    const nextKpis = currentKpis.map((kpi) => {
      const skip = byId.get(kpi.id);
      if (!skip) return kpi;
      // "not_available" is a durable property of the KPI (no system behind it);
      // "no_data" means nobody submitted it this period, which is transient.
      const unavailable = skip.reason === "not_available";
      return {
        ...kpi,
        dataAvailable: false,
        notAvailableReason: unavailable ? skip.detail : undefined,
        // The old figure is retained only as prior-period context; getStatus()
        // returns no_data/not_available, so it is never shown as current.
        lastUpdated: new Date().toISOString().slice(0, 10),
      };
    });

    const nextRisks = currentRisks.map((risk) => {
      const skip = byId.get(risk.kpiId);
      if (!skip || risk.status === "Resolved") return risk;
      return {
        ...risk,
        status: "Resolved" as const,
        notes: `Resolved: "${skip.detail}" No current-period figure exists, so this risk is no longer measurable.`,
      };
    });

    return { kpis: nextKpis, risks: nextRisks };
  }

  /** Pure core of cycle submission: marks the cycle done and opens the next. */
  function runCycleSubmission(
    cycleId: string,
    submittedBy: string,
    nextDueDateOverride: string | undefined,
    currentCycles: DataCollectionCycle[]
  ): { cycles: DataCollectionCycle[]; nextDueDate?: string; nextReportingPeriod?: string } {
    const target = currentCycles.find((c) => c.cycleId === cycleId);
    const updated = currentCycles.map((c) =>
      c.cycleId === cycleId
        ? {
            ...c,
            status: "Submitted" as const,
            completionPct: 100,
            submissionDate: new Date().toISOString().slice(0, 10),
            submittedBy,
            validationStatus: "Not Reviewed" as const,
          }
        : c
    );
    const alreadySubmitted = ["Submitted", "Validation Required", "Accepted", "Closed"].includes(
      target?.status ?? ""
    );
    if (!target || alreadySubmitted) return { cycles: updated };

    // Section 62, steps 10-11: calculate the next submission date and open the
    // next cycle automatically - the manager should never have to schedule
    // their own next submission. Section 51: an authorised user may override
    // that calculated date instead.
    const nextDueDate = nextDueDateOverride || computeNextDueDate(target);
    const nextPeriod = deriveNextReportingPeriod(target, nextDueDate);
    const nextCycle: DataCollectionCycle = {
      ...target,
      cycleId: `${target.cycleId}__next-${nextDueDate}`,
      reportingPeriod: nextPeriod,
      startDate: target.dueDate,
      dueDate: nextDueDate,
      status: "Upcoming",
      completionPct: 0,
      submissionDate: undefined,
      submittedBy: undefined,
      validationStatus: undefined,
      nextDateOverridden: Boolean(nextDueDateOverride),
    };
    return { cycles: [...updated, nextCycle], nextDueDate, nextReportingPeriod: nextPeriod };
  }

  const value = useMemo<DataStoreValue>(
    () => ({
      kpis,
      cycles,
      risks,
      actions,
      hrReports,
      financeReports,
      operationsReports,
      farmingReports,
      marketingReports,
      alumniReports,
      employees,
      auditLog,
      hrConfig,
      financeConfig,
      operationsConfig,
      farmingConfig,
      marketingConfig,
      alumniConfig,
      submitKpiValues: (entries) => {
        // No reporting period is claimed here: this path has no report behind
        // it, so guessing one would attach the wrong period to any risk it
        // raised. Risks fall back to naming their detection month instead.
        const result = runKpiSubmission(entries, { kpis, risks, actions });
        setKpis(result.kpis);
        setRisks(result.risks);
        setActions(result.actions);
        return result.alerts;
      },
      submitCycle: (cycleId, submittedBy, nextDueDateOverride) => {
        const result = runCycleSubmission(cycleId, submittedBy, nextDueDateOverride, cycles);
        setCycles(result.cycles);
      },
      overrideCycleDueDate: (cycleId, newDueDate) => {
        const cycle = cycles.find((c) => c.cycleId === cycleId);
        setCycles((prev) =>
          prev.map((c) => (c.cycleId === cycleId ? { ...c, dueDate: newDueDate, nextDateOverridden: true } : c))
        );
        if (cycle) {
          setAuditLog((prev) => [
            ...prev,
            auditEntry("Authorised user", "cycle_due_date_overridden", cycle.department, `Due date for "${cycle.dataset}" moved to ${newDueDate}.`, {
              cycleId,
              previousDueDate: cycle.dueDate,
              newDueDate,
            }),
          ]);
        }
      },
      updateKpiThresholds: (kpiId, updates) => {
        const kpi = kpis.find((k) => k.id === kpiId);
        setKpis((prev) =>
          prev.map((k) => (k.id === kpiId ? { ...k, ...updates, thresholdApproval: "confirmed" } : k))
        );
        if (kpi) {
          setAuditLog((prev) => [
            ...prev,
            auditEntry("Administrator", "kpi_threshold_updated", kpi.department, `Thresholds updated for "${kpi.name}".`, {
              kpiId,
              target: updates.target ?? kpi.target,
              greenThreshold: updates.greenThreshold !== undefined ? updates.greenThreshold : kpi.greenThreshold,
              amberThreshold: updates.amberThreshold !== undefined ? updates.amberThreshold : kpi.amberThreshold,
            }),
          ]);
        }
      },
      advanceActionStatus: (actionId) => {
        let summary: string | null = null;
        setActions((prev) =>
          prev.map((a) => {
            if (a.id !== actionId) return a;
            const order: ActionStatus[] = ["Open", "In Progress", "Completed"];
            const idx = order.indexOf(a.status);
            if (idx === -1 || idx === order.length - 1) return a;
            summary = `Action moved from ${a.status} to ${order[idx + 1]}.`;
            return { ...a, status: order[idx + 1] };
          })
        );
        if (summary) {
          const risk = risks.find((r) => actions.find((a) => a.id === actionId)?.riskId === r.id);
          setAuditLog((prev) => [
            ...prev,
            auditEntry("Action owner", "action_status_advanced", risk?.department ?? "Human Resources", summary!, {
              actionId,
            }),
          ]);
        }
      },
      updateHrConfig: (updates) => {
        setHrConfig((prev) => ({ ...prev, ...updates }));

        // Section 2: changing the cadence changes the open HR cycle's cadence,
        // so the next submission date the cycle engine calculates reflects the
        // configuration rather than the value it was seeded with.
        if (updates.reportingFrequency) {
          const frequency = updates.reportingFrequency;
          setCycles((prev) =>
            prev.map((c) =>
              c.cycleId.startsWith("cyc-hr-data-") && !["Closed", "Accepted"].includes(c.status)
                ? { ...c, frequency }
                : c
            )
          );
        }

        // Section 8/9: the performance switch is the single source of truth for
        // whether Staff Performance can exist at all. Turning it off retires any
        // previously reported figure rather than leaving a stale score on the
        // Executive Dashboard; turning it on clears the "unavailable" wording so
        // the KPI correctly reads "Not submitted this period" until HR reports.
        if (updates.performanceManagementActive !== undefined) {
          const active = updates.performanceManagementActive;
          setKpis((prev) =>
            prev.map((kpi) =>
              kpi.id === HR_KPI_IDS.performance
                ? {
                    ...kpi,
                    dataAvailable: false,
                    notAvailableReason: active ? undefined : PERFORMANCE_UNAVAILABLE_REASON,
                  }
                : kpi
            )
          );
        }

        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            "Administrator",
            "hr_config_updated",
            "Human Resources",
            `HR configuration updated: ${Object.keys(updates).join(", ")}.`,
            Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, String(v)]))
          ),
        ]);
      },
      saveHrDraft: (report, actor) => {
        const stamped: HrReport = { ...report, status: "Draft", savedAt: new Date().toISOString() };
        setHrReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(actor, "hr_draft_saved", "Human Resources", `Draft saved for ${report.reportingPeriod}.`, {
            reportId: report.id,
            cycleId: report.cycleId,
          }),
        ]);
      },
      submitHrReport: (report, submittedBy, nextDueDateOverride) => {
        // Section 19, step 1: VALIDATE. Refuse rather than store a partial
        // submission - an incomplete report that looks submitted is exactly the
        // failure mode this guards against.
        const validation = validateHrReport(report);
        if (!validation.valid) {
          return { ok: false, issues: validation.issues };
        }

        const now = new Date().toISOString();
        const submitted: HrReport = {
          ...report,
          status: "Submitted",
          submittedAt: now,
          submittedBy,
          savedAt: undefined,
        };

        // Section 19, steps 2-4: SAVE, then CALCULATE the KPIs from the
        // submitted records. The engine is the only place these formulas live.
        const computation = computeHrKpis(submitted, kpis, hrConfig.standardWorkingDaysPerMonth);
        setHrReports((prev) => [...prev.filter((r) => r.id !== submitted.id), { ...submitted, computedKpis: computation.audit }]);

        // Section 26: employee movements register against the employee
        // registry by employee code. Records are upserted, never duplicated, so
        // a re-submitted period corrects the record instead of cloning it.
        const movedEmployees: Employee[] = [
          ...report.turnover.newHires.map((h) => ({
            employeeCode: h.employeeCode,
            fullName: h.employeeCode, // name captured once the HR master is loaded
            department: h.department,
            position: h.position,
            employmentType: h.employmentType,
            startDate: h.startDate,
          })),
          ...report.turnover.exits.map((e) => {
            const existing = employees.find((emp) => emp.employeeCode === e.employeeCode);
            return {
              employeeCode: e.employeeCode,
              fullName: existing?.fullName ?? e.employeeCode,
              department: e.department,
              position: e.position,
              employmentType: existing?.employmentType ?? "Permanent",
              startDate: existing?.startDate ?? e.exitDate,
              exitDate: e.exitDate,
            };
          }),
        ].filter((e) => e.employeeCode.trim() !== "");
        if (movedEmployees.length > 0) {
          setEmployees((prev) => {
            const next = [...prev];
            for (const emp of movedEmployees) {
              const idx = next.findIndex((e) => e.employeeCode === emp.employeeCode);
              if (idx >= 0) next[idx] = { ...next[idx], ...emp };
              else next.push(emp);
            }
            return next;
          });
        }

        // Steps 5-8: push the derived values through the shared KPI/EWS
        // pipeline - the identical path every other department's submission
        // uses, so an HR submission cannot develop its own private rules. It
        // recalculates RAG against each KPI's own configured thresholds,
        // reconciles risks and stages corrective actions.
        // A KPI this submission could not derive must not keep showing the
        // previous period's figure as current, and any risk resting on that
        // stale figure must be closed - otherwise the dashboard reports a
        // result for a period nobody reported (Sections 24, 25).
        const cleared = clearSkippedKpis(computation.skipped, kpis, risks);
        const kpiRun = runKpiSubmission(
          computation.entries,
          { kpis: cleared.kpis, risks: cleared.risks, actions },
          submitted.reportingPeriod
        );
        setKpis(kpiRun.kpis);
        setRisks(kpiRun.risks);
        setActions(kpiRun.actions);
        const alerts = kpiRun.alerts;

        // Steps 9-10: dashboards read straight off `kpis`, so they are already
        // current. Calculate the next submission date and open the next cycle.
        const cycleRun = runCycleSubmission(report.cycleId, submittedBy, nextDueDateOverride, cycles);
        setCycles(cycleRun.cycles);
        const nextDueDate = cycleRun.nextDueDate;

        // Step 11: AUDIT LOG.
        const derivedCount = computation.entries.length;
        const skippedCount = computation.skipped.length;
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            submittedBy,
            "hr_report_submitted",
            "Human Resources",
            `HR report submitted for ${report.reportingPeriod}: ${derivedCount} KPI(s) calculated, ${skippedCount} not derivable.`,
            {
              reportId: submitted.id,
              cycleId: report.cycleId,
              reportingPeriod: report.reportingPeriod,
              kpisCalculated: derivedCount,
              kpisSkipped: skippedCount,
              nextDueDate: nextDueDate ?? null,
            }
          ),
        ]);

        return {
          ok: true,
          alerts,
          computation,
          nextDueDate,
          nextReportingPeriod: cycleRun.nextReportingPeriod,
        };
      },
      updateFinanceConfig: (updates) => {
        setFinanceConfig((prev) => ({ ...prev, ...updates }));

        // Section 4: changing the cadence changes the open Finance cycle's
        // cadence, so the next submission date reflects the configuration.
        if (updates.reportingFrequency) {
          const frequency = updates.reportingFrequency;
          setCycles((prev) =>
            prev.map((c) =>
              c.department === "Finance" && !["Closed", "Accepted"].includes(c.status) ? { ...c, frequency } : c
            )
          );
        }

        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            "Administrator",
            "finance_config_updated",
            "Finance",
            `Finance configuration updated: ${Object.keys(updates).join(", ")}.`,
            Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, String(v)]))
          ),
        ]);
      },
      updateOperationsConfig: (updates: Partial<OperationsConfig>) => {
        setOperationsConfig((prev) => ({ ...prev, ...updates }));

        // The cadence change moves the open Operations cycle with it, exactly as
        // it does for HR and Finance.
        if (updates.reportingFrequency) {
          const frequency = updates.reportingFrequency;
          setCycles((prev) =>
            prev.map((c) =>
              c.department === "Operations" && !["Closed", "Accepted"].includes(c.status) ? { ...c, frequency } : c
            )
          );
        }

        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            "Administrator",
            "operations_config_updated",
            "Operations",
            `Operations configuration updated: ${Object.keys(updates).join(", ")}.`,
            Object.fromEntries(
              Object.entries(updates).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") || "(emptied)" : String(v),
              ])
            )
          ),
        ]);
      },
      saveOperationsDraft: (report, actor) => {
        const stamped: OperationsReport = { ...report, status: "Draft", savedAt: new Date().toISOString() };
        setOperationsReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(actor, "operations_draft_saved", "Operations", `Draft saved for ${report.reportingPeriod}.`, {
            reportId: report.id,
            cycleId: report.cycleId,
          }),
        ]);
      },
      recordOperationsImport: (report, actor, summary) => {
        const stamped: OperationsReport = { ...report, savedAt: new Date().toISOString() };
        setOperationsReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);

        // The run's own status decides the audit action. A refused workbook is
        // exactly the event the audit trail exists to make visible: the manager
        // sent numbers and they did not arrive.
        const latestRun = report.importRuns[report.importRuns.length - 1];
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            actor,
            latestRun?.status === "Failed" ? "operations_import_failed" : "operations_import_completed",
            "Operations",
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
      submitOperationsReport: async (report, submittedBy, nextDueDateOverride) => {
        // Step 1: VALIDATE. The refusal rule is the same as HR and Finance: a
        // partial report that looks submitted is the failure mode this guards.
        const validation = validateOperationsReport(report, { config: operationsConfig });
        if (!validation.valid) {
          return { ok: false, issues: validation.issues };
        }

        const now = new Date().toISOString();
        const submitted: OperationsReport = {
          ...report,
          status: "Submitted",
          submittedAt: now,
          submittedBy,
          savedAt: undefined,
          dataSource:
            report.dataSource.kind === "Workbook Import" || report.importRuns.length > 0
              ? { ...report.dataSource, kind: "Workbook Import" }
              : { ...report.dataSource, kind: "Manual Entry" },
        };

        // Steps 2-4: SAVE, then CALCULATE. This is the only place Operations
        // KPIs are derived; everything else reads these values.
        const computation = computeOperationsKpis(submitted, kpis, operationsConfig);
        setOperationsReports((prev) => [...prev.filter((r) => r.id !== submitted.id), submitted]);

        // Steps 5-8: the shared pipeline. An Operations KPI the submission could
        // not derive must stop displaying the previous term's figure as though
        // it described this one, and any risk resting on that stale figure closes.
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

        // Step 10: AUDIT.
        const derivedCount = computation.entries.length;
        const skippedCount = computation.skipped.length;
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            submittedBy,
            "operations_report_submitted",
            "Operations",
            `Operations report submitted for ${report.reportingPeriod}: ${derivedCount} KPI(s) calculated, ${skippedCount} not derivable, source ${submitted.dataSource.kind}.`,
            {
              reportId: submitted.id,
              cycleId: report.cycleId,
              reportingPeriod: submitted.reportingPeriod,
              dataSource: submitted.dataSource.kind,
              kpisCalculated: derivedCount,
              kpisSkipped: skippedCount,
              sectionsReported: (Object.entries(validation.bySection) as [OperationsSectionKey, { state: string }][])
                .filter(([, s]) => s.state === "complete")
                .map(([key]) => key)
                .join(", "),
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
      updateFarmingConfig: (updates: Partial<FarmingConfig>) => {
        setFarmingConfig((prev) => ({ ...prev, ...updates }));

        // The cadence is configuration, so the open Commercial Farming cycle
        // takes the new cadence with it rather than keeping the seeded one.
        if (updates.reportingFrequency) {
          const frequency = updates.reportingFrequency;
          setCycles((prev) =>
            prev.map((c) =>
              c.department === "Commercial Farming" && !["Closed", "Accepted"].includes(c.status)
                ? { ...c, frequency }
                : c
            )
          );
        }

        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            "Administrator",
            "farming_config_updated",
            "Commercial Farming",
            `Commercial Farming configuration updated: ${Object.keys(updates).join(", ")}.`,
            Object.fromEntries(
              Object.entries(updates).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") || "(emptied)" : String(v),
              ])
            )
          ),
        ]);
      },
      saveFarmingDraft: (report, actor) => {
        const stamped: FarmingReport = { ...report, status: "Draft", savedAt: new Date().toISOString() };
        setFarmingReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            actor,
            "farming_draft_saved",
            "Commercial Farming",
            `Draft saved for ${report.reportingPeriod}.`,
            { reportId: report.id, cycleId: report.cycleId }
          ),
        ]);
      },
      submitFarmingReport: async (report, submittedBy, nextDueDateOverride) => {
        // Step 1: VALIDATE. Refusal, not acceptance-with-caveats: a half-filled
        // farm register that looks submitted is exactly the failure this guards,
        // because every farm KPI is derived from these rows.
        const validation = validateFarmingReport(report, { config: farmingConfig });
        if (!validation.valid) {
          return { ok: false, issues: validation.issues };
        }

        const now = new Date().toISOString();
        const submitted: FarmingReport = {
          ...report,
          status: "Submitted",
          submittedAt: now,
          submittedBy,
          savedAt: undefined,
          // Every farm figure this cycle came from a person typing, so the
          // provenance says so rather than implying a system feed.
          dataSource: { ...report.dataSource, kind: "Manual Entry" },
        };

        // Steps 2-4: SAVE, then CALCULATE. This is the only place Commercial
        // Farming KPIs are derived; every other surface reads these values.
        const computation = computeFarmingKpis(submitted, kpis, farmingConfig);
        setFarmingReports((prev) => [...prev.filter((r) => r.id !== submitted.id), submitted]);

        // Steps 5-8: the shared pipeline. A KPI the registers could not derive
        // is cleared rather than left displaying the previous season's figure as
        // though it described this one, and any risk resting on that stale figure
        // closes with it.
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

        // Step 10: AUDIT. Which sections were actually reported is recorded,
        // because "not applicable" and "complete" are different facts and only
        // one of them means the farm answered for it.
        const derivedCount = computation.entries.length;
        const skippedCount = computation.skipped.length;
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            submittedBy,
            "farming_report_submitted",
            "Commercial Farming",
            `Commercial Farming report submitted for ${report.reportingPeriod}: ${derivedCount} KPI(s) calculated, ${skippedCount} not derivable, source ${submitted.dataSource.kind}.`,
            {
              reportId: submitted.id,
              cycleId: report.cycleId,
              reportingPeriod: submitted.reportingPeriod,
              dataSource: submitted.dataSource.kind,
              kpisCalculated: derivedCount,
              kpisSkipped: skippedCount,
              sectionsReported: (Object.entries(validation.bySection) as [FarmingSectionKey, { state: string }][])
                .filter(([, sec]) => sec.state === "complete")
                .map(([key]) => key)
                .join(", "),
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
      updateMarketingConfig: (updates: Partial<MarketingConfig>) => {
        setMarketingConfig((prev) => ({ ...prev, ...updates }));

        // The cadence is configuration, so the open Marketing cycle takes the new
        // cadence with it rather than keeping the seeded one.
        if (updates.reportingFrequency) {
          const frequency = updates.reportingFrequency;
          setCycles((prev) =>
            prev.map((c) =>
              c.department === "Marketing" && !["Closed", "Accepted"].includes(c.status) ? { ...c, frequency } : c
            )
          );
        }

        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            "Administrator",
            "marketing_config_updated",
            "Marketing",
            `Marketing configuration updated: ${Object.keys(updates).join(", ")}.`,
            Object.fromEntries(
              Object.entries(updates).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") || "(emptied)" : String(v),
              ])
            )
          ),
        ]);
      },
      saveMarketingDraft: (report, actor) => {
        const stamped: MarketingReport = { ...report, status: "Draft", savedAt: new Date().toISOString() };
        setMarketingReports((prev) => [...prev.filter((r) => r.id !== report.id), stamped]);
        setAuditLog((prev) => [
          ...prev,
          auditEntry(actor, "marketing_draft_saved", "Marketing", `Draft saved for ${report.reportingPeriod}.`, {
            reportId: report.id,
            cycleId: report.cycleId,
          }),
        ]);
      },
      submitMarketingReport: async (report, submittedBy, nextDueDateOverride) => {
        // Step 1: VALIDATE. Refusal, not acceptance-with-caveats: a half-filled
        // marketing report that looks submitted is exactly the failure this
        // guards, because every Marketing KPI is derived from these rows.
        const validation = validateMarketingReport(report, { config: marketingConfig });
        if (!validation.valid) {
          return { ok: false, issues: validation.issues };
        }

        const now = new Date().toISOString();
        const submitted: MarketingReport = {
          ...report,
          status: "Submitted",
          submittedAt: now,
          submittedBy,
          savedAt: undefined,
          // Every figure this period came from a person typing, so the
          // provenance says so rather than implying an analytics feed.
          dataSource: { ...report.dataSource, kind: "Manual Entry" },
        };

        // Steps 2-4: SAVE, then CALCULATE. This is the only place Marketing KPIs
        // are derived; every other surface reads these values.
        const computation = computeMarketingKpis(submitted, kpis, marketingConfig);
        setMarketingReports((prev) => [...prev.filter((r) => r.id !== submitted.id), submitted]);

        // Steps 5-8: the shared pipeline. A KPI the registers could not derive is
        // cleared rather than left displaying last month's figure as though it
        // described this one, and any risk resting on that stale figure closes
        // with it. This matters more here than in any other department: the demo
        // data shows enquiries falling for five months, and leaving the previous
        // month's number on screen would keep that visible without anything
        // actually having been reported.
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

        // Step 10: AUDIT. Which sections were actually reported is recorded,
        // because "not applicable" and "complete" are different facts and only
        // one of them means the department answered for it.
        const derivedCount = computation.entries.length;
        const skippedCount = computation.skipped.length;
        setAuditLog((prev) => [
          ...prev,
          auditEntry(
            submittedBy,
            "marketing_report_submitted",
            "Marketing",
            `Marketing report submitted for ${report.reportingPeriod}: ${derivedCount} KPI(s) calculated, ${skippedCount} not derivable, source ${submitted.dataSource.kind}.`,
            {
              reportId: submitted.id,
              cycleId: report.cycleId,
              reportingPeriod: submitted.reportingPeriod,
              dataSource: submitted.dataSource.kind,
              kpisCalculated: derivedCount,
              kpisSkipped: skippedCount,
              sectionsReported: (Object.entries(validation.bySection) as [MarketingSectionKey, { state: string }][])
                .filter(([, sec]) => sec.state === "complete")
                .map(([key]) => key)
                .join(", "),
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
      submitAlumniReport: async (report, submittedBy, nextDueDateOverride) => {
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
