import { useMemo, useState } from "react";
import { Modal } from "../common/Modal";
import { StatusBadge } from "../kpi/StatusBadge";
import { useDataStore } from "../../data/DataStoreContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../common/ToastContext";
import { computeNextDueDate, getEffectiveStatus, getOpenAcademyCycle } from "../../data/cycleEngine";
import { createBlankAcademyReport } from "../../data/academySeed";
import {
  ACADEMY_SECTION_KPIS,
  academyKpisNeedingExplanation,
  computeAcademyKpis,
  previewAcademyStatus,
} from "../../data/academyEngine";
import {
  summariseAcademyIssues,
  validateAcademyReport,
  type AcademyValidationIssue,
} from "../../data/academyValidation";
import {
  ACADEMY_SECTION_KEYS,
  ACADEMY_SECTION_LABELS,
  type AcademyReport,
  type AcademySectionKey,
} from "../../types/academy";
import type { Kpi } from "../../types";
import { AssessmentSection, CertificationSection, IntakeSection, ProgrammeSection } from "./academy/AcademySections";

type Step = AcademySectionKey | "review";

const DONE_STATES = ["complete", "not_applicable"] as const;

const stateStyles: Record<string, string> = {
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  incomplete: "bg-white text-ink-soft/50 border-dashed border-ink/20",
  attention: "bg-butter text-ink border-butter-dark",
  not_applicable: "bg-ink/[0.04] text-ink-soft/40 border-ink/10",
};

const stateLabel: Record<string, string> = {
  complete: "Complete",
  incomplete: "Incomplete",
  attention: "Attention Required",
  not_applicable: "Not Applicable",
};

/**
 * ============================================================================
 * ACADEMY DATA SUBMISSION - the Academy side of the Academy & Alumni dashboard.
 * ============================================================================
 *
 * Shaped like the Marketing, Operations and Alumni submissions: four registers,
 * a progress strip, a live Early Warning preview per section, a review page,
 * and one submit that validates, derives every Academy KPI, evaluates Early
 * Warning and opens the next cycle. Nothing derived is typeable.
 */
export function AcademySubmitDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cycles, kpis, academyConfig, academyReports, saveAcademyDraft, submitAcademyReport } = useDataStore();
  const { user } = useAuth();
  const toast = useToast();

  const cycle = useMemo(() => getOpenAcademyCycle(cycles), [cycles]);
  const canOverrideDate = user?.role === "admin" || user?.role === "executive";
  const [report, setReport] = useState<AcademyReport | null>(null);
  const [step, setStep] = useState<Step>("programmes");
  const [showReview, setShowReview] = useState(false);
  const [issues, setIssues] = useState<AcademyValidationIssue[]>([]);
  const [nextDateOverride, setNextDateOverride] = useState<string | null>(null);
  const [done, setDone] = useState<{ nextDueDate?: string; nextPeriod?: string; warnings: number } | null>(null);

  const working = useMemo(() => {
    if (!cycle) return null;
    if (report && report.cycleId === cycle.cycleId) return report;
    const saved = academyReports.find((r) => r.cycleId === cycle.cycleId && r.status !== "Submitted");
    return (
      saved ??
      createBlankAcademyReport({
        cycleId: cycle.cycleId,
        reportingPeriod: cycle.reportingPeriod,
        frequency: academyConfig.reportingFrequency,
        startDate: cycle.startDate,
        dueDate: cycle.dueDate,
      })
    );
  }, [cycle, report, academyReports, academyConfig]);

  const validation = useMemo(
    () => (working ? validateAcademyReport(working, { config: academyConfig }) : null),
    [working, academyConfig]
  );

  const computation = useMemo(
    () => (working ? computeAcademyKpis(working, kpis, academyConfig) : null),
    [working, kpis, academyConfig]
  );

  const sectionStates = useMemo(() => {
    const states = {} as Record<AcademySectionKey, string>;
    if (!validation || !computation) return states;
    for (const key of ACADEMY_SECTION_KEYS) {
      const section = validation.bySection[key];
      if (section.state === "not_applicable") states[key] = "not_applicable";
      else if (section.issues.length > 0) states[key] = "incomplete";
      else {
        const worst = computation.entries
          .filter((e) => ACADEMY_SECTION_KPIS[key].includes(e.kpiId))
          .some((e) => {
            const status = previewAcademyStatus(kpis.find((k) => k.id === e.kpiId), e.value).status;
            return status === "amber" || status === "red";
          });
        states[key] = worst ? "attention" : "complete";
      }
    }
    return states;
  }, [validation, computation, kpis]);

  const completedCount = ACADEMY_SECTION_KEYS.filter((k) => DONE_STATES.includes(sectionStates[k] as never)).length;
  const progressPct = Math.round((completedCount / ACADEMY_SECTION_KEYS.length) * 100);

  const nextDueDate = useMemo(() => (cycle ? computeNextDueDate(cycle) : ""), [cycle]);
  const effectiveNextDate = nextDateOverride ?? nextDueDate;

  const needsExplanation = useMemo(
    () => (computation ? academyKpisNeedingExplanation(computation, kpis) : []),
    [computation, kpis]
  );

  function update(patch: Partial<AcademyReport>) {
    setReport((prev) => {
      const baseReport = prev && working && prev.cycleId === working.cycleId ? prev : working;
      return baseReport ? { ...baseReport, ...patch } : prev;
    });
  }

  function handleSaveDraft() {
    if (!working) return;
    saveAcademyDraft(working, user?.name ?? "Unknown");
    toast.success(`Draft saved for ${working.reportingPeriod}`);
  }

  function handleReview() {
    if (!validation) return;
    if (!validation.valid) {
      setIssues(validation.issues);
      toast.error("Academy submission could not be completed. The blocking issues are listed on each section.");
      const first = validation.issues[0]?.section;
      if (first) setStep(first);
      return;
    }
    setIssues([]);
    setShowReview(true);
  }

  async function handleSubmit() {
    if (!working) return;
    const outcome = await submitAcademyReport(working, user?.name ?? "Unknown", nextDateOverride ?? undefined);
    if (!outcome.ok) {
      setIssues(outcome.issues);
      setShowReview(false);
      const first = outcome.issues[0]?.section;
      if (first) setStep(first);
      toast.error("Academy submission could not be completed. The blocking issues are listed on each section.");
      return;
    }
    const warningCount = academyKpisNeedingExplanation(outcome.computation, kpis).length;
    toast.success(
      warningCount > 0
        ? `Academy submission saved with ${warningCount} warning${warningCount === 1 ? "" : "s"} detected`
        : "Academy submission saved successfully"
    );
    setDone({ nextDueDate: outcome.nextDueDate, nextPeriod: outcome.nextReportingPeriod, warnings: warningCount });
    setReport(null);
    setShowReview(false);
  }

  function handleClose() {
    setReport(null);
    setShowReview(false);
    setIssues([]);
    setStep("programmes");
    setDone(null);
    onClose();
  }

  if (!cycle || !working || !validation || !computation) {
    return (
      <Modal open={open} onClose={handleClose} title="Submit Academy Data" subtitle="No open Academy reporting cycle.">
        <p className="text-sm text-ink-soft/60">
          There is no open Academy reporting cycle to submit against. An administrator can open one from Data /
          Submissions.
        </p>
      </Modal>
    );
  }

  const cycleStatus = getEffectiveStatus(cycle);
  const isSectionStep = (candidate: Step): candidate is AcademySectionKey =>
    (ACADEMY_SECTION_KEYS as readonly string[]).includes(candidate);
  const stepIndex = isSectionStep(step) ? ACADEMY_SECTION_KEYS.indexOf(step) : -1;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="Academy Data Submission"
      subtitle="Recorded to this demo session only - no backend is connected yet."
    >
      {done ? (
        <SuccessPanel done={done} period={working.reportingPeriod} onClose={handleClose} />
      ) : (
        <div className="flex flex-col gap-5">
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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
                Progress: {completedCount} / {ACADEMY_SECTION_KEYS.length} sections completed
              </span>
              <span className="text-sm font-bold text-ink">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-butter transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ACADEMY_SECTION_KEYS.map((key) => {
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
                    {ACADEMY_SECTION_LABELS[key]}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-butter/25 text-butter" : stateStyles[state]}`}
                    >
                      {stateLabel[state]}
                    </span>
                  </button>
                );
              })}
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
              needsExplanation={needsExplanation}
              nextDueDate={effectiveNextDate}
              onEdit={(section) => {
                setShowReview(false);
                setStep(section);
              }}
            />
          ) : (
            <div className="min-h-[320px]">
              {step === "programmes" && (
                <ProgrammeSection
                  report={working}
                  data={working.programmes}
                  onChange={(programmes) => update({ programmes })}
                  kpis={kpis}
                  config={academyConfig}
                />
              )}
              {step === "intakes" && (
                <IntakeSection
                  report={working}
                  data={working.intakes}
                  onChange={(intakes) => update({ intakes })}
                  kpis={kpis}
                  config={academyConfig}
                />
              )}
              {step === "assessments" && (
                <AssessmentSection
                  report={working}
                  data={working.assessments}
                  onChange={(assessments) => update({ assessments })}
                  kpis={kpis}
                  config={academyConfig}
                />
              )}
              {step === "certification" && (
                <CertificationSection
                  report={working}
                  data={working.certification}
                  onChange={(certification) => update({ certification })}
                  kpis={kpis}
                  config={academyConfig}
                />
              )}
            </div>
          )}

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
                    Submit Academy Data
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex > 0) setStep(ACADEMY_SECTION_KEYS[stepIndex - 1]);
                    }}
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5 disabled:opacity-30"
                    disabled={stepIndex <= 0}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex < 0) return;
                      if (stepIndex < ACADEMY_SECTION_KEYS.length - 1) setStep(ACADEMY_SECTION_KEYS[stepIndex + 1]);
                      else handleReview();
                    }}
                    className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
                  >
                    {stepIndex === ACADEMY_SECTION_KEYS.length - 1 ? "Review Submission →" : "Next →"}
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

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-soft/40">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function IssuePanel({
  issues,
  onJump,
  onDismiss,
}: {
  issues: AcademyValidationIssue[];
  onJump: (section: AcademySectionKey) => void;
  onDismiss: () => void;
}) {
  const grouped = summariseAcademyIssues(issues);
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
          {issues.length} issue(s) must be fixed before this can be submitted
        </p>
        <button type="button" onClick={onDismiss} className="text-[11px] text-rose-600 underline">
          Hide
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {grouped.map((group) => (
          <div key={group.section} className="rounded-xl bg-white/70 p-3">
            <button
              type="button"
              onClick={() => onJump(group.section)}
              className="text-xs font-semibold text-ink underline decoration-ink/20"
            >
              {group.label}
            </button>
            <ul className="mt-1 flex flex-col gap-0.5">
              {group.lines.map((line, i) => (
                <li key={i} className="text-[11px] text-ink-soft/70">
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

function ReviewPanel({
  report,
  computation,
  kpis,
  sectionStates,
  needsExplanation,
  nextDueDate,
  onEdit,
}: {
  report: AcademyReport;
  computation: ReturnType<typeof computeAcademyKpis>;
  kpis: Kpi[];
  sectionStates: Record<AcademySectionKey, string>;
  needsExplanation: { kpiId: string; name: string; value: number; status: "amber" | "red" }[];
  nextDueDate: string;
  onEdit: (section: AcademySectionKey) => void;
}) {
  const derived = computation.entries
    .map((entry) => {
      const kpi = kpis.find((k) => k.id === entry.kpiId);
      if (!kpi) return null;
      const { status, thresholdNote } = previewAcademyStatus(kpi, entry.value);
      return { ...entry, kpi, status, thresholdNote };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
          Review before submitting - nothing has been saved yet
        </p>
        <p className="mt-1 text-xs text-ink-soft/60">{report.reportingPeriod} · source: manual entry</p>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Sections</p>
        <ul className="mt-2 flex flex-col gap-1">
          {ACADEMY_SECTION_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-2 text-xs">
              <button type="button" onClick={() => onEdit(key)} className="font-semibold text-ink underline decoration-ink/20">
                {ACADEMY_SECTION_LABELS[key]}
              </button>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${stateStyles[sectionStates[key]]}`}>
                {stateLabel[sectionStates[key]]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">KPIs that will be calculated</p>
        {derived.length === 0 ? (
          <p className="mt-2 text-xs text-ink-soft/50">
            Nothing can be calculated from this submission. Every KPI will be reported as not derivable.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {derived.map(({ kpiId, value, kpi, status, thresholdNote }) => (
              <li key={kpiId} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">{kpi.name}</p>
                  <p className="text-[11px] text-ink-soft/50">
                    {kpi.unit === "percent" ? `${value.toFixed(1)}%` : value.toLocaleString("en-ZA")}
                  </p>
                  {thresholdNote && <p className="text-[11px] text-butter">{thresholdNote}</p>}
                </div>
                <StatusBadge status={status} compact />
              </li>
            ))}
          </ul>
        )}
      </div>

      {computation.skipped.length > 0 && (
        <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
            Not reported from this submission ({computation.skipped.length})
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {computation.skipped.map((s) => (
              <li key={s.kpiId} className="text-[11px] text-ink-soft/60">
                • {s.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {needsExplanation.length > 0 && (
        <div className="rounded-2xl border border-butter-dark/40 bg-butter/15 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">
            {needsExplanation.length} figure(s) will raise an Early Warning
          </p>
          <p className="mt-1 text-[11px] text-ink-soft/60">
            A Risk record and a staged Corrective Action will be created for each. Explain them in the relevant section
            commentary before you submit.
          </p>
        </div>
      )}

      <p className="text-[11px] text-ink-soft/45">
        On submission the next Academy cycle opens for {new Date(nextDueDate).toLocaleDateString("en-ZA")}.
      </p>
    </div>
  );
}

function SuccessPanel({
  done,
  period,
  onClose,
}: {
  done: { nextDueDate?: string; nextPeriod?: string; warnings: number };
  period: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</div>
      <h3 className="text-lg font-semibold text-ink">Academy data submitted</h3>
      <p className="max-w-md text-xs leading-relaxed text-ink-soft/60">
        {period} has been submitted. The Academy KPIs were calculated from the programme, intake, assessment and
        certification records, the Early Warning System has been evaluated, and the next cycle is open.
      </p>
      {done.warnings > 0 && (
        <p className="rounded-xl bg-butter/20 px-3 py-2 text-xs text-ink-soft/70">
          {done.warnings} figure(s) raised a warning. The risks are on the Early Warning System.
        </p>
      )}
      {done.nextDueDate && (
        <p className="text-xs text-ink-soft/50">
          Next submission due {new Date(done.nextDueDate).toLocaleDateString("en-ZA")}
          {done.nextPeriod ? ` (${done.nextPeriod})` : ""}
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 rounded-full bg-ink px-6 py-2 text-sm font-semibold text-butter hover:bg-ink-soft"
      >
        Close
      </button>
    </div>
  );
}
