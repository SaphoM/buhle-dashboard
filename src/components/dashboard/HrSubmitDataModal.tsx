import { useMemo, useState } from "react";
import { Modal } from "../common/Modal";
import { StatusBadge } from "../kpi/StatusBadge";
import { useDataStore } from "../../data/DataStoreContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../common/ToastContext";
import { computeNextDueDate, getEffectiveStatus } from "../../data/cycleEngine";
import { getStatusForValue } from "../../data/kpiEngine";
import { createBlankHrReport } from "../../data/hrSeed";
import { computeHrKpis, kpisNeedingExplanation, HR_KPI_IDS } from "../../data/hrEngine";
import { hrDataNotes, summariseIssues, validateHrReport, type ValidationIssue } from "../../data/hrValidation";
import {
  HR_SECTION_KEYS,
  HR_SECTION_LABELS,
  type HrReport,
  type HrSectionKey,
  type HrSectionState,
} from "../../types/hr";
import { HrTextArea } from "./hr/HrFields";
import { HrAttendanceSection } from "./hr/HrAttendanceSection";
import { HrLeaveSection } from "./hr/HrLeaveSection";
import { HrPerformanceSection } from "./hr/HrPerformanceSection";
import { HrTurnoverSection } from "./hr/HrTurnoverSection";
import { HrSkillsSection } from "./hr/HrSkillsSection";
import { HrVacancySection } from "./hr/HrVacancySection";

type Step = HrSectionKey | "review";

const stateStyles: Record<HrSectionState, string> = {
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  incomplete: "bg-white text-ink-soft/50 border-dashed border-ink/20",
  attention: "bg-butter text-ink border-butter-dark",
  not_available: "bg-white text-ink-soft/50 border-dashed border-ink/20",
  not_applicable: "bg-ink/[0.04] text-ink-soft/40 border-ink/10",
};

const stateLabel: Record<HrSectionState, string> = {
  complete: "Complete",
  incomplete: "Incomplete",
  attention: "Attention Required",
  not_available: "Not Yet Available",
  not_applicable: "Not Applicable",
};

/**
 * ============================================================================
 * HR DATA SUBMISSION - the HR department's monthly management process.
 * ============================================================================
 *
 * Structured as six sections (Section 3) rather than one long scrolling form,
 * because the answer HR needs is not "did I fill in every box" but "what
 * changed, what needs attention, and what is the next deadline" (Section 28).
 *
 * Entered data is held in component state across section changes, so moving
 * between sections never loses work. Nothing touches the KPI engine, risks or
 * dashboards until Submit, which runs the full Section 19 chain in one step.
 */
export function HrSubmitDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { kpis, cycles, hrReports, hrConfig, saveHrDraft, submitHrReport } = useDataStore();
  const { user } = useAuth();
  const toast = useToast();
  const canOverrideDate = user?.role === "admin" || user?.role === "executive";

  // The cycle this submission fulfils: the soonest-due HR cycle that has not
  // been closed out, using the same cycle engine the dashboard reads.
  const cycle = useMemo(
    () =>
      cycles
        .filter((c) => c.department === "Human Resources")
        .filter((c) => !["Accepted", "Closed"].includes(getEffectiveStatus(c)))
        .filter((c) => !["Submitted", "Validation Required"].includes(getEffectiveStatus(c)))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0],
    [cycles]
  );

  const existingDraft = useMemo(
    () => (cycle ? hrReports.find((r) => r.cycleId === cycle.cycleId && r.status === "Draft") : undefined),
    [hrReports, cycle]
  );

  const [report, setReport] = useState<HrReport | null>(null);
  const [step, setStep] = useState<Step>("attendance");
  const [showReview, setShowReview] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [done, setDone] = useState<null | { nextDueDate?: string; nextPeriod?: string; warnings: number }>(null);

  // Build the working report once per cycle: an existing draft if one was saved,
  // otherwise a blank report for this cycle.
  const working: HrReport | null = useMemo(() => {
    if (!cycle) return null;
    if (report && report.cycleId === cycle.cycleId) return report;
    if (existingDraft) return existingDraft;
    return createBlankHrReport({
      cycleId: cycle.cycleId,
      reportingPeriod: cycle.reportingPeriod,
      frequency: cycle.frequency,
      startDate: cycle.startDate,
      dueDate: cycle.dueDate,
      performanceManagementActive: hrConfig.performanceManagementActive,
    });
  }, [cycle, report, existingDraft, hrConfig.performanceManagementActive]);

  const validation = useMemo(() => (working ? validateHrReport(working) : null), [working]);
  const computation = useMemo(
    () => (working ? computeHrKpis(working, kpis, hrConfig.standardWorkingDaysPerMonth) : null),
    [working, kpis, hrConfig.standardWorkingDaysPerMonth]
  );

  const sectionStates = useMemo(() => {
    const states = {} as Record<HrSectionKey, HrSectionState>;
    if (!validation || !computation) return states;
    for (const key of HR_SECTION_KEYS) {
      const base = validation.bySection[key].state;
      // A section that is complete but whose KPI trips a warning is "attention",
      // not "complete" - the manager should see that before submitting.
      const derivedIds: Record<HrSectionKey, string[]> = {
        attendance: [HR_KPI_IDS.absenteeism],
        leave: [HR_KPI_IDS.leaveUtilisation],
        performance: [HR_KPI_IDS.performance],
        turnover: [HR_KPI_IDS.turnover],
        skills: [HR_KPI_IDS.trainingCompletion],
        vacancies: [
          HR_KPI_IDS.timeToFill,
          HR_KPI_IDS.costPerHire,
          HR_KPI_IDS.offerAcceptance,
          HR_KPI_IDS.openVacancies,
        ],
      };
      const breached = derivedIds[key].some((kpiId) => {
        const entry = computation.entries.find((e) => e.kpiId === kpiId);
        if (!entry) return false;
        const kpi = kpis.find((k) => k.id === kpiId);
        if (!kpi) return false;
        const s = kpi.greenThreshold === null || kpi.amberThreshold === null ? "threshold_unset" : undefined;
        if (s) return false;
        const status = getStatusForValue(kpi, entry.value);
        return status === "amber" || status === "red";
      });
      states[key] = base === "complete" && breached ? "attention" : base;
    }
    return states;
  }, [validation, computation, kpis]);

  const completedCount = HR_SECTION_KEYS.filter(
    (k) => sectionStates[k] === "complete" || sectionStates[k] === "attention" || sectionStates[k] === "not_applicable"
  ).length;
  const progressPct = Math.round((completedCount / HR_SECTION_KEYS.length) * 100);

  const nextDueDate = useMemo(() => (cycle ? computeNextDueDate(cycle) : ""), [cycle]);
  const [nextDateOverride, setNextDateOverride] = useState<string | null>(null);
  const effectiveNextDate = nextDateOverride ?? nextDueDate;

  const notes = useMemo(() => (working ? hrDataNotes(working) : []), [working]);
  const needsExplanation = useMemo(
    () => (working && computation ? kpisNeedingExplanation(computation, kpis, working.commentary) : []),
    [working, computation, kpis]
  );

  function update(patch: Partial<HrReport>) {
    setReport((prev) => {
      // Chain from the previous edit rather than from the memo so two field
      // changes landing in the same React batch cannot overwrite each other,
      // and fall back to the memo when the cycle has moved on underneath us.
      const base = prev && working && prev.cycleId === working.cycleId ? prev : working;
      return base ? { ...base, ...patch } : prev;
    });
  }

  function handleSaveDraft() {
    if (!working) return;
    saveHrDraft(working, user?.name ?? "Unknown");
    toast.success(`Draft saved for ${working.reportingPeriod}`);
  }

  function handleReview() {
    if (!working || !validation) return;
    if (!validation.valid) {
      setIssues(validation.issues);
      // Jump straight to the first section with a problem.
      const first = validation.issues[0]?.section;
      if (first) setStep(first);
      return;
    }
    setIssues([]);
    setShowReview(true);
  }

  function handleSubmit() {
    if (!working) return;
    const outcome = submitHrReport(working, user?.name ?? "Unknown", nextDateOverride ?? undefined);
    if (!outcome.ok) {
      setIssues(outcome.issues ?? []);
      const first = outcome.issues?.[0]?.section;
      if (first) setStep(first);
      setShowReview(false);
      return;
    }
    const warningCount = outcome.alerts?.filter((a) => a.level === "amber" || a.level === "red").length ?? 0;
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
    setStep("attendance");
    setDone(null);
    onClose();
  }

  if (!cycle || !working || !validation || !computation) {
    return (
      <Modal open={open} onClose={handleClose} title="Submit HR Data" subtitle="No open HR reporting cycle.">
        <p className="text-sm text-ink-soft/60">
          There is no open HR reporting cycle to submit against. An administrator can open one from Data /
          Submissions.
        </p>
      </Modal>
    );
  }

  const cycleStatus = getEffectiveStatus(cycle);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="HR Data Submission"
      subtitle="Recorded to this demo session only - no backend is connected yet."
    >
      {done ? (
        <SuccessPanel done={done} onClose={handleClose} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Cycle header - what period, when due, when next (Sections 2, 21) */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-ink/[0.04] p-4 lg:grid-cols-5">
            <HeaderField label="Reporting period" value={working.reportingPeriod} />
            <HeaderField label="Submission due" value={new Date(cycle.dueDate).toLocaleDateString("en-ZA")} />
            <HeaderField label="Next submission" value={new Date(effectiveNextDate).toLocaleDateString("en-ZA")} />
            <HeaderField label="Frequency" value={working.frequency} />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">Submission status</div>
              <div className="mt-0.5">
                <StatusBadge status={cycleStatus === "Overdue" ? "red" : cycleStatus === "In Progress" ? "amber" : "green"} compact />
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

          {/* Progress + section strip (Section 3) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
                Progress: {completedCount} / {HR_SECTION_KEYS.length} sections completed
              </span>
              <span className="text-sm font-bold text-ink">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-butter transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {HR_SECTION_KEYS.map((key) => {
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
                    {HR_SECTION_LABELS[key]}
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
            </div>
          </div>

          {issues.length > 0 && <IssuePanel issues={issues} onJump={setStep} onDismiss={() => setIssues([])} />}

          {showReview ? (
            <ReviewPanel
              report={working}
              computation={computation}
              kpis={kpis}
              sectionStates={sectionStates}
              notes={notes}
              needsExplanation={needsExplanation}
              nextDueDate={effectiveNextDate}
              onEdit={setStep}
              onCommentary={(patch) =>
                update({ commentary: { ...working.commentary, ...patch } })
              }
            />
          ) : (
            <div className="min-h-[320px]">
              {step === "attendance" && (
                <HrAttendanceSection
                  data={working.attendance}
                  kpis={kpis}
                  standardWorkingDays={hrConfig.standardWorkingDaysPerMonth}
                  onChange={(attendance) => update({ attendance })}
                />
              )}
              {step === "leave" && (
                <HrLeaveSection data={working.leave} kpis={kpis} onChange={(leave) => update({ leave })} />
              )}
              {step === "performance" && (
                <HrPerformanceSection
                  data={working.performance}
                  kpis={kpis}
                  onChange={(performance) => update({ performance })}
                />
              )}
              {step === "turnover" && (
                <HrTurnoverSection data={working.turnover} kpis={kpis} onChange={(turnover) => update({ turnover })} />
              )}
              {step === "skills" && (
                <HrSkillsSection data={working.skills} kpis={kpis} onChange={(skills) => update({ skills })} />
              )}
              {step === "vacancies" && (
                <HrVacancySection data={working.vacancies} kpis={kpis} onChange={(vacancies) => update({ vacancies })} />
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
                    Submit HR Data
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = HR_SECTION_KEYS.indexOf(step as HrSectionKey);
                      if (idx > 0) setStep(HR_SECTION_KEYS[idx - 1]);
                    }}
                    disabled={HR_SECTION_KEYS.indexOf(step as HrSectionKey) === 0}
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5 disabled:opacity-30"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = HR_SECTION_KEYS.indexOf(step as HrSectionKey);
                      if (idx < HR_SECTION_KEYS.length - 1) setStep(HR_SECTION_KEYS[idx + 1]);
                      else handleReview();
                    }}
                    className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
                  >
                    {HR_SECTION_KEYS.indexOf(step as HrSectionKey) === HR_SECTION_KEYS.length - 1
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

/** Section 18: refuse the submission and say exactly what is missing. */
function IssuePanel({
  issues,
  onJump,
  onDismiss,
}: {
  issues: ValidationIssue[];
  onJump: (section: HrSectionKey) => void;
  onDismiss: () => void;
}) {
  const grouped = summariseIssues(issues);
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-rose-800">Your HR submission is incomplete.</p>
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
              {HR_SECTION_LABELS[g.section]} →
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

/** Section 17: the pre-submission review. */
function ReviewPanel({
  report,
  computation,
  kpis,
  sectionStates,
  notes,
  needsExplanation,
  nextDueDate,
  onEdit,
  onCommentary,
}: {
  report: HrReport;
  computation: ReturnType<typeof computeHrKpis>;
  kpis: ReturnType<typeof useDataStore>["kpis"];
  sectionStates: Record<HrSectionKey, HrSectionState>;
  notes: string[];
  needsExplanation: { kpiId: string; name: string; value: number; status: "amber" | "red" }[];
  nextDueDate: string;
  onEdit: (section: HrSectionKey) => void;
  onCommentary: (patch: Partial<HrReport["commentary"]>) => void;
}) {
  const { kpiExplanations: _perKpi, ...commentary } = report.commentary;
  const amberCount = computation.entries.filter((e) => {
    const kpi = kpis.find((k) => k.id === e.kpiId);
    return kpi && kpi.greenThreshold !== null && kpi.amberThreshold !== null && getStatusForValue(kpi, e.value) !== "green";
  }).length;

  const headline: Record<HrSectionKey, { label: string; value?: string }> = {
    attendance: { label: "Absenteeism", value: fmt(computation.audit[HR_KPI_IDS.absenteeism], "%") },
    leave: { label: "Leave days", value: fmt(computation.audit[HR_KPI_IDS.leaveUtilisation], "") },
    performance: { label: "Review completion", value: fmt(computation.audit[HR_KPI_IDS.performance], "%") },
    turnover: { label: "Turnover", value: fmt(computation.audit[HR_KPI_IDS.turnover], "%") },
    skills: { label: "Training completion", value: fmt(computation.audit[HR_KPI_IDS.trainingCompletion], "%") },
    vacancies: {
      label: "Open vacancies / Time to Fill",
      value: `${fmt(computation.audit[HR_KPI_IDS.openVacancies], "")} / ${fmt(computation.audit[HR_KPI_IDS.timeToFill], " days")}`,
    },
  };

  const sectionKpis: Record<HrSectionKey, string[]> = {
    attendance: [HR_KPI_IDS.absenteeism],
    leave: [HR_KPI_IDS.leaveUtilisation],
    performance: [HR_KPI_IDS.performance],
    turnover: [HR_KPI_IDS.turnover],
    skills: [HR_KPI_IDS.trainingCompletion],
    vacancies: [
      HR_KPI_IDS.timeToFill,
      HR_KPI_IDS.costPerHire,
      HR_KPI_IDS.offerAcceptance,
      HR_KPI_IDS.openVacancies,
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft/60">HR Submission Review</h3>
        <p className="text-sm text-ink-soft/60">Reporting period: {report.reportingPeriod}</p>
      </div>

      <div className="flex flex-col gap-2">
        {HR_SECTION_KEYS.map((key) => {
          const state = sectionStates[key];
          const kpiStatuses = sectionKpis[key]
            .map((kpiId) => {
              const kpi = kpis.find((k) => k.id === kpiId);
              const value = computation.audit[kpiId];
              if (!kpi) return null;
              if (value === null || value === undefined) {
                return { kpi, status: kpi.dataAvailable === false ? ("not_available" as const) : ("no_data" as const), value: null };
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
                  <span className="text-sm font-semibold text-ink">{HR_SECTION_LABELS[key]}</span>
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
                {headline[key].label}:{" "}
                <span className="font-semibold text-ink">{headline[key].value ?? "Not reported"}</span>
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
                            ? `R${s.value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
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

      {/* Section 23: commentary, with a prompt for every Amber/Red KPI */}
      <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">HR Commentary</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <HrTextArea label="Overall HR commentary" value={commentary.overall} onChange={(v) => onCommentary({ overall: v })} rows={2} />
          <HrTextArea label="Key issue" value={commentary.keyIssue} onChange={(v) => onCommentary({ keyIssue: v })} rows={2} />
          <HrTextArea label="Key achievement" value={commentary.keyAchievement} onChange={(v) => onCommentary({ keyAchievement: v })} rows={2} />
          <HrTextArea label="Workforce concern" value={commentary.workforceConcern} onChange={(v) => onCommentary({ workforceConcern: v })} rows={2} />
          <HrTextArea label="Action required" value={commentary.actionRequired} onChange={(v) => onCommentary({ actionRequired: v })} rows={2} />
          <HrTextArea
            label="Support required from Executive Management"
            value={commentary.supportRequired}
            onChange={(v) => onCommentary({ supportRequired: v })}
            rows={2}
          />
        </div>

        {needsExplanation.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-ink/10 pt-3">
            <p className="text-xs font-semibold text-ink">
              These KPIs are Amber or Red: please explain why
            </p>
            {needsExplanation.map((n) => (
              <HrTextArea
                key={n.kpiId}
                label={`Why is "${n.name}" ${n.status === "red" ? "critical" : "above threshold"}?`}
                value={report.commentary.kpiExplanations[n.kpiId] ?? ""}
                onChange={(v) => onCommentary({ kpiExplanations: { ...report.commentary.kpiExplanations, [n.kpiId]: v } })}
                rows={2}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-ink/10 p-3">
        <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">Next HR submission</div>
        <div className="text-sm font-semibold text-ink">
          {new Date(nextDueDate).toLocaleDateString("en-ZA")}
        </div>
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
      <p className="text-sm font-medium text-ink">HR submission recorded.</p>
      <p className="max-w-md text-xs text-ink-soft/50">
        HR KPIs have been calculated, the Early Warning System evaluated, risks and corrective actions created, and
        the HR and Executive dashboards updated, with no manual refresh needed.
      </p>
      {done.warnings > 0 && (
        <p className="text-xs font-semibold text-ink">
          {done.warnings} warning{done.warnings === 1 ? "" : "s"} raised. See the Risk Centre.
        </p>
      )}
      {done.nextDueDate && (
        <p className="text-xs text-ink-soft/60">
          Next HR submission: <span className="font-semibold text-ink">{new Date(done.nextDueDate).toLocaleDateString("en-ZA")}</span>
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

function fmt(value: number | null | undefined, suffix: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return `${value}${suffix}`;
}