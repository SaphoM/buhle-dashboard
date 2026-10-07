import { useMemo, useState } from "react";
import { Modal } from "../../common/Modal";
import { StatusBadge } from "../../kpi/StatusBadge";
import { useDataStore } from "../../../data/DataStoreContext";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../common/ToastContext";
import { computeNextDueDate, getEffectiveStatus, getOpenBdCycle } from "../../../data/cycleEngine";
import { createBlankBdReport } from "../../../data/businessDevelopmentSeed";
import {
  BD_SECTION_KPIS,
  bdKpisNeedingExplanation,
  computeBdKpis,
  previewBdStatus,
} from "../../../data/businessDevelopmentEngine";
import {
  summariseBdIssues,
  validateBdReport,
  type BdValidationIssue,
} from "../../../data/businessDevelopmentValidation";
import {
  BD_SECTION_KEYS,
  BD_SECTION_LABELS,
  type BdReport,
  type BdSectionKey,
} from "../../../types/businessDevelopment";
import type { Kpi } from "../../../types";
import {
  ClientSection,
  CommentarySection,
  LeadSection,
  NewBusinessSection,
  OpportunitySection,
  PartnershipSection,
  ProposalSection,
} from "./BdSections";

type Step = BdSectionKey | "review";

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
 * BUSINESS DEVELOPMENT DATA SUBMISSION - the BD side of the BD dashboard.
 * ============================================================================
 *
 * Shaped like the Marketing, Operations, Alumni and Academy submissions: seven
 * registers, a progress strip, a live Early Warning preview per section, a
 * review page, and one submit that validates, derives every BD KPI, evaluates
 * Early Warning and opens the next cycle. Nothing derived - not the win rate,
 * not the weighted pipeline, not the stall count - is typeable.
 */
export function BdSubmitDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cycles, kpis, bdConfig, bdReports, saveBdDraft, submitBdReport } = useDataStore();
  const { user } = useAuth();
  const toast = useToast();

  const cycle = useMemo(() => getOpenBdCycle(cycles), [cycles]);
  const canOverrideDate = user?.role === "admin" || user?.role === "executive";
  const [report, setReport] = useState<BdReport | null>(null);
  const [step, setStep] = useState<Step>("leads");
  const [showReview, setShowReview] = useState(false);
  const [issues, setIssues] = useState<BdValidationIssue[]>([]);
  const [nextDateOverride, setNextDateOverride] = useState<string | null>(null);
  const [done, setDone] = useState<{ nextDueDate?: string; nextPeriod?: string; warnings: number } | null>(null);

  const working = useMemo(() => {
    if (!cycle) return null;
    if (report && report.cycleId === cycle.cycleId) return report;
    const saved = bdReports.find((r) => r.cycleId === cycle.cycleId && r.status !== "Submitted");
    return (
      saved ??
      createBlankBdReport({
        cycleId: cycle.cycleId,
        reportingPeriod: cycle.reportingPeriod,
        dueDate: cycle.dueDate,
      })
    );
  }, [cycle, report, bdReports]);

  const validation = useMemo(
    () => (working ? validateBdReport(working, { config: bdConfig }) : null),
    [working, bdConfig]
  );

  const computation = useMemo(
    () => (working ? computeBdKpis(working, kpis, bdConfig) : null),
    [working, kpis, bdConfig]
  );

  const sectionStates = useMemo(() => {
    const states = {} as Record<BdSectionKey, string>;
    if (!validation || !computation) return states;
    for (const key of BD_SECTION_KEYS) {
      const section = validation.bySection[key];
      if (section.state === "not_applicable") states[key] = "not_applicable";
      else if (section.issues.length > 0) states[key] = "incomplete";
      else {
        const worst = computation.entries
          .filter((e) => BD_SECTION_KPIS[key].includes(e.kpiId))
          .some((e) => {
            const status = previewBdStatus(kpis.find((k) => k.id === e.kpiId), e.value).status;
            return status === "amber" || status === "red";
          });
        states[key] = worst ? "attention" : "complete";
      }
    }
    return states;
  }, [validation, computation, kpis]);

  const completedCount = BD_SECTION_KEYS.filter((k) => DONE_STATES.includes(sectionStates[k] as never)).length;
  const progressPct = Math.round((completedCount / BD_SECTION_KEYS.length) * 100);

  const nextDueDate = useMemo(() => (cycle ? computeNextDueDate(cycle) : ""), [cycle]);
  const effectiveNextDate = nextDateOverride ?? nextDueDate;

  const needsExplanation = useMemo(
    () => (computation ? bdKpisNeedingExplanation(computation, kpis) : []),
    [computation, kpis]
  );

  function update(patch: Partial<BdReport>) {
    setReport((prev) => {
      const baseReport = prev && working && prev.cycleId === working.cycleId ? prev : working;
      return baseReport ? { ...baseReport, ...patch } : prev;
    });
  }

  function handleSaveDraft() {
    if (!working) return;
    saveBdDraft(working, user?.name ?? "Unknown");
    toast.success(`Draft saved for ${working.reportingPeriod}`);
  }

  function handleReview() {
    if (!validation) return;
    if (!validation.valid) {
      setIssues(validation.issues);
      toast.error("Business Development submission could not be completed. The blocking issues are listed on each section.");
      const first = validation.issues[0]?.section;
      if (first && first !== "general") setStep(first);
      return;
    }
    setIssues([]);
    setShowReview(true);
  }

  async function handleSubmit() {
    if (!working) return;
    const outcome = await submitBdReport(working, user?.name ?? "Unknown", nextDateOverride ?? undefined);
    if (!outcome.ok) {
      setIssues(outcome.issues);
      setShowReview(false);
      const first = outcome.issues[0]?.section;
      if (first && first !== "general") setStep(first);
      toast.error("Business Development submission could not be completed. The blocking issues are listed on each section.");
      return;
    }
    const warningCount = bdKpisNeedingExplanation(outcome.computation, kpis).length;
    toast.success(
      warningCount > 0
        ? `Business Development submission saved with ${warningCount} warning${warningCount === 1 ? "" : "s"} detected`
        : "Business Development submission saved successfully"
    );
    setDone({ nextDueDate: outcome.nextDueDate, nextPeriod: outcome.nextReportingPeriod, warnings: warningCount });
    setReport(null);
    setShowReview(false);
  }

  function handleClose() {
    setReport(null);
    setShowReview(false);
    setIssues([]);
    setStep("leads");
    setDone(null);
    onClose();
  }

  if (!cycle || !working || !validation || !computation) {
    return (
      <Modal open={open} onClose={handleClose} title="Submit Business Development Data" subtitle="No open BD reporting cycle.">
        <p className="text-sm text-ink-soft/60">
          There is no open Business Development reporting cycle to submit against. An administrator can open one from
          Data / Submissions.
        </p>
      </Modal>
    );
  }

  const cycleStatus = getEffectiveStatus(cycle);
  const isSectionStep = (candidate: Step): candidate is BdSectionKey =>
    (BD_SECTION_KEYS as readonly string[]).includes(candidate);
  const stepIndex = isSectionStep(step) ? BD_SECTION_KEYS.indexOf(step) : -1;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="Business Development Data Submission"
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
            <HeaderField label="Frequency" value={bdConfig.reportingFrequency} />
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
                Progress: {completedCount} / {BD_SECTION_KEYS.length} sections completed
              </span>
              <span className="text-sm font-bold text-ink">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-butter transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {BD_SECTION_KEYS.map((key) => {
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
                    {BD_SECTION_LABELS[key]}
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
              {step === "leads" && (
                <LeadSection
                  report={working}
                  data={working.leads}
                  onChange={(leads) => update({ leads })}
                  kpis={kpis}
                  config={bdConfig}
                />
              )}
              {step === "opportunities" && (
                <OpportunitySection
                  report={working}
                  data={working.opportunities}
                  onChange={(opportunities) => update({ opportunities })}
                  kpis={kpis}
                  config={bdConfig}
                />
              )}
              {step === "proposals" && (
                <ProposalSection
                  report={working}
                  data={working.proposals}
                  onChange={(proposals) => update({ proposals })}
                  kpis={kpis}
                  config={bdConfig}
                />
              )}
              {step === "newBusiness" && (
                <NewBusinessSection
                  report={working}
                  data={working.newBusiness}
                  onChange={(newBusiness) => update({ newBusiness })}
                  kpis={kpis}
                  config={bdConfig}
                />
              )}
              {step === "clients" && (
                <ClientSection
                  report={working}
                  data={working.clients}
                  onChange={(clients) => update({ clients })}
                  kpis={kpis}
                  config={bdConfig}
                />
              )}
              {step === "partnerships" && (
                <PartnershipSection
                  report={working}
                  data={working.partnerships}
                  onChange={(partnerships) => update({ partnerships })}
                  kpis={kpis}
                  config={bdConfig}
                />
              )}
              {step === "commentary" && (
                <CommentarySection
                  report={working}
                  data={working.commentary}
                  onChange={(commentary) => update({ commentary })}
                  kpis={kpis}
                  config={bdConfig}
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
                    Submit BD Data
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex > 0) setStep(BD_SECTION_KEYS[stepIndex - 1]);
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
                      if (stepIndex < BD_SECTION_KEYS.length - 1) setStep(BD_SECTION_KEYS[stepIndex + 1]);
                      else handleReview();
                    }}
                    className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
                  >
                    {stepIndex === BD_SECTION_KEYS.length - 1 ? "Review Submission →" : "Next →"}
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
  issues: BdValidationIssue[];
  onJump: (section: BdSectionKey) => void;
  onDismiss: () => void;
}) {
  const grouped = summariseBdIssues(issues);
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
              onClick={() => onJump(group.section as BdSectionKey)}
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
  report: BdReport;
  computation: ReturnType<typeof computeBdKpis>;
  kpis: Kpi[];
  sectionStates: Record<BdSectionKey, string>;
  needsExplanation: { kpiId: string; name: string; value: number; status: "amber" | "red" }[];
  nextDueDate: string;
  onEdit: (section: BdSectionKey) => void;
}) {
  const derived = computation.entries
    .map((entry) => {
      const kpi = kpis.find((k) => k.id === entry.kpiId);
      if (!kpi) return null;
      const { status, thresholdNote } = previewBdStatus(kpi, entry.value);
      return { ...entry, kpi, status, thresholdNote };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const renderValue = (unit: string, value: number) => {
    if (unit === "percent") return `${value.toFixed(1)}%`;
    if (unit === "currency") return `R ${Math.round(value).toLocaleString("en-ZA").replace(/,/g, " ")}`;
    if (unit === "days") return `${Math.round(value)} days`;
    return value.toLocaleString("en-ZA");
  };

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
          {BD_SECTION_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-2 text-xs">
              <button type="button" onClick={() => onEdit(key)} className="font-semibold text-ink underline decoration-ink/20">
                {BD_SECTION_LABELS[key]}
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
                  <p className="text-[11px] text-ink-soft/50">{renderValue(kpi.unit, value)}</p>
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
        On submission the next Business Development cycle opens for {new Date(nextDueDate).toLocaleDateString("en-ZA")}.
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
      <h3 className="text-lg font-semibold text-ink">Business Development data submitted</h3>
      <p className="max-w-md text-xs leading-relaxed text-ink-soft/60">
        {period} has been submitted. The BD KPIs were calculated from the lead, opportunity, proposal, new business,
        client and partnership registers, the Early Warning System has been evaluated, and the next cycle is open.
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
