import { useMemo, useState } from "react";
import { Modal } from "../common/Modal";
import { StatusBadge } from "../kpi/StatusBadge";
import { useDataStore } from "../../data/DataStoreContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../common/ToastContext";
import { computeNextDueDate, getEffectiveStatus, getOpenAlumniCycle } from "../../data/cycleEngine";
import { createBlankAlumniReport } from "../../data/alumniSeed";
import {
  alumniItemsNeedingExplanation,
  computeAlumniKpis,
  previewAlumniStatus,
  sectionForAlumniKpi,
  summariseCohort,
} from "../../data/alumniEngine";
import {
  alumniCompletion,
  summariseAlumniIssues,
  validateAlumniReport,
  type AlumniValidationIssue,
} from "../../data/alumniValidation";
import {
  ALUMNI_SECTION_KEYS,
  ALUMNI_SECTION_LABELS,
  type AlumniReport,
  type AlumniSectionKey,
} from "../../types/alumni";
import type { Kpi } from "../../types";
import {
  BusinessSection,
  CohortBlockSection,
  EngagementSection,
  EmploymentSection,
  FarmSection,
  LoanSection,
  MarketSection,
  ReferralSection,
} from "./alumni/AlumniSections";

/**
 * Step 0 is the cohort block, because every rate in this tracer study describes
 * only the graduates who answered. It is not one of the seven registers, so it
 * is a step of its own rather than a section tab.
 */
type Step = "cohort" | AlumniSectionKey | "review";

/** Which KPIs each section feeds, kept in one place so the progress strip, the
 *  review page and the attention state cannot disagree.
 *
 *  Employment carries the headline economically-active rate as well as its own
 *  employment rate, which is why it is the section a reader checks first. The
 *  loan register produces two figures, and referrals produce two, so neither of
 *  those sections is single-KPI. */
const SECTION_KPIS: Record<AlumniSectionKey, string[]> = {
  employment: ["kpi-alumni", "kpi-alumni-employment-rate"],
  business: ["kpi-business-survival-rate", "kpi-business-survival-months"],
  farm: ["kpi-farm-yield-per-ha"],
  loans: ["kpi-loan-repayment-rate", "kpi-loan-arrears-value"],
  referrals: ["kpi-referrals-received", "kpi-referral-conversion-rate"],
  market: ["kpi-market-participation-rate", "kpi-market-revenue"],
  engagement: ["kpi-alumni-engagement-rate", "kpi-alumni-response-rate"],
};

/**
 * "no_data" is a display state this modal adds on top of the validator's three.
 *
 * Alumni validation deliberately accepts an untouched report: tracing nobody
 * claims nothing, so there is nothing to refuse. That is the right call for
 * whether a submission is allowed, and the wrong call for a progress strip,
 * because a strip that counts an empty register as complete will read "7 / 7
 * sections completed" over a report that evidences nothing at all. So an empty,
 * not-marked-Not-Applicable section counts as outstanding here while still
 * being submittable. The two decisions are separate on purpose.
 */
const DONE_STATES = ["complete", "not_applicable"] as const;

const stateStyles: Record<string, string> = {
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  incomplete: "bg-white text-ink-soft/50 border-dashed border-ink/20",
  attention: "bg-butter text-ink border-butter-dark",
  not_applicable: "bg-ink/[0.04] text-ink-soft/40 border-ink/10",
  no_data: "bg-white text-ink-soft/50 border-dashed border-ink/20",
};

const stateLabel: Record<string, string> = {
  complete: "Complete",
  incomplete: "Incomplete",
  attention: "Attention Required",
  not_applicable: "Not Applicable",
  no_data: "No Data",
};

/**
 * ============================================================================
 * ALUMNI DATA SUBMISSION - seven registers, one cohort.
 * ============================================================================
 *
 * Same shape as the other department submissions, because all of them answer
 * "what happened" through registers rather than through typed headline numbers.
 * What makes Alumni different is that every figure here is a rate over a sample,
 * and the sample is chosen by who answered.
 *
 *  1. NO RATE IS TYPEABLE. Employment rate, business survival, yield per
 *     hectare, loan repayment rate, referral conversion, market participation and
 *     engagement rate are all computed from the rows. Where the rows cannot
 *     produce one the KPI is left uncalculated with the reason attached rather
 *     than defaulted to zero.
 *
 *  2. THE COHORT BLOCK COMES FIRST, NOT LAST. Every rate describes only the
 *     graduates who were traced, so the cohort size and the number reached are
 *     entered before anything else and shown again on the review page. A rate
 *     from twelve people out of two hundred is not the same claim as a rate from a
 *     hundred and twenty, and the dashboard cannot tell the difference without
 *     those two numbers.
 *
 *  3. TWO GRADES OF ISSUE. A contradiction somebody can type their way out of
 *     refuses the submission. A thin response rate, a loan in arrears, an
 *     unverified status does not, because none of those is a data-entry mistake:
 *     they are facts, and refusing them would mean this department could only
 *     ever report on the cohorts it found easy to reach. Those are carried to
 *     review as things to state rather than things to fix.
 *
 *  4. ONLY ONE FIGURE HAS APPROVED LIMITS. kpi-alumni carries target 70, green
 *     68 and amber 55 because it was already on the dashboard. The other twelve
 *     report "Threshold not configured" instead of a colour, so the strip and the
 *     review say plainly which figures can be given a verdict.
 *
 *  5. AN EMPTY REGISTER IS NOT A COMPLETED SECTION. Validation permits it, the
 *     progress strip does not count it, and the summary reports it as a gap. A
 *     register that genuinely does not apply is marked Not Applicable, which is a
 *     deliberate exclusion rather than missing evidence.
 *
 * Manual entry only: this is a tracer study, so the figures are exactly as
 * current as the last conversation with a graduate.
 */
export function AlumniSubmitDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cycles, kpis, alumniConfig, alumniReports, saveAlumniDraft, submitAlumniReport } = useDataStore();
  const { user } = useAuth();
  const toast = useToast();

  const cycle = useMemo(() => getOpenAlumniCycle(cycles), [cycles]);
  const canOverrideDate = user?.role === "admin" || user?.role === "executive";
  const [report, setReport] = useState<AlumniReport | null>(null);
  const [step, setStep] = useState<Step>("cohort");
  const [showReview, setShowReview] = useState(false);
  const [issues, setIssues] = useState<AlumniValidationIssue[]>([]);
  const [attention, setAttention] = useState<AlumniValidationIssue[]>([]);
  const [nextDateOverride, setNextDateOverride] = useState<string | null>(null);
  const [done, setDone] = useState<{ nextDueDate?: string; nextPeriod?: string; warnings: number } | null>(null);

  const working = useMemo(() => {
    if (!cycle) return null;
    if (report && report.cycleId === cycle.cycleId) return report;
    const saved = alumniReports.find((r) => r.cycleId === cycle.cycleId);
    return (
      saved ??
      createBlankAlumniReport({
        cycleId: cycle.cycleId,
        reportingPeriod: cycle.reportingPeriod,
        frequency: alumniConfig.reportingFrequency,
        startDate: cycle.startDate,
        dueDate: cycle.dueDate,
      })
    );
  }, [cycle, report, alumniReports, alumniConfig]);

  const validation = useMemo(
    () => (working ? validateAlumniReport(working, { config: alumniConfig }) : null),
    [working, alumniConfig]
  );

  const computation = useMemo(
    () => (working ? computeAlumniKpis(working, kpis, alumniConfig) : null),
    [working, kpis, alumniConfig]
  );

  const sectionStates = useMemo(() => {
    const states = {} as Record<AlumniSectionKey, string>;
    if (!validation || !computation) return states;

    for (const key of ALUMNI_SECTION_KEYS) {
      const section = validation.bySection[key];
      if (section.state === "not_applicable") {
        states[key] = "not_applicable";
        continue;
      }

      // An empty register is outstanding work even though the validator permits
      // it. See the note on DONE_STATES.
      if (!working || !sectionData(working, key).records.length) {
        states[key] = "no_data";
        continue;
      }

      // Only BLOCKING issues mean work is outstanding. An attention issue is a
      // fact to acknowledge, so letting it read as incomplete would claim work is
      // outstanding on registers that are in fact complete.
      const blocking = section.issues.filter((i) => i.blocking);
      if (blocking.length > 0) {
        states[key] = "incomplete";
        continue;
      }

      const worst = computation.entries
        .filter((entry) => SECTION_KPIS[key].includes(entry.kpiId))
        .some((entry) => {
          const status = previewAlumniStatus(kpis.find((k) => k.id === entry.kpiId), entry.value).status;
          return status === "amber" || status === "red";
        });
      states[key] = worst ? "attention" : "complete";
    }
    return states;
  }, [validation, computation, kpis, working]);

  const completion = useMemo(() => (validation ? alumniCompletion(validation) : null), [validation]);

  const completedCount = useMemo(() => {
    const ready = ALUMNI_SECTION_KEYS.filter((k) => DONE_STATES.includes(sectionStates[k] as never)).length;
    // The cohort block is step 0 and always has to be filled in, so it counts
    // towards progress alongside the seven registers.
    const cohortReady = working && working.cohort.graduatesInCohort !== null && working.cohort.tracedThisPeriod !== null;
    return ready + (cohortReady ? 1 : 0);
  }, [sectionStates, working]);

  const totalSteps = ALUMNI_SECTION_KEYS.length + 1;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  const nextDueDate = useMemo(() => (cycle ? computeNextDueDate(cycle) : ""), [cycle]);
  const effectiveNextDate = nextDateOverride ?? nextDueDate;

  const needsExplanation = useMemo(
    () => (computation ? alumniItemsNeedingExplanation(computation, kpis) : []),
    [computation, kpis]
  );

  function update(patch: Partial<AlumniReport>) {
    setReport((prev) => {
      // Chain from the previous edit rather than from the memo so two field
      // changes landing in the same React batch cannot overwrite each other.
      const base = prev && working && prev.cycleId === working.cycleId ? prev : working;
      return base ? { ...base, ...patch } : prev;
    });
  }

  function handleSaveDraft() {
    if (!working) return;
    saveAlumniDraft(working, user?.name ?? "Unknown");
    toast.success(`Draft saved for ${working.reportingPeriod}`);
  }

  function handleReview() {
    if (!validation) return;
    setAttention(validation.attentionIssues);
    if (!validation.valid) {
      setIssues(validation.blockingIssues);
      // A refused submission is announced. Without this the dialog does not open
      // and the click appears to have done nothing at all.
      toast.error("Alumni submission could not be completed. The blocking issues are listed on each section.");
      const first = validation.blockingIssues[0]?.section;
      if (first) setStep(first);
      return;
    }
    setIssues([]);
    setShowReview(true);
  }

  async function handleSubmit() {
    if (!working) return;
    const outcome = await submitAlumniReport(working, user?.name ?? "Unknown", nextDateOverride ?? undefined);
    if (!outcome.ok) {
      setIssues(outcome.issues);
      setShowReview(false);
      const first = outcome.issues[0]?.section;
      if (first) setStep(first);
      toast.error("Alumni submission could not be completed. The blocking issues are listed on each section.");
      return;
    }
    const warningCount = countWarnings(outcome.computation, kpis, attention.length);
    toast.success(
      warningCount > 0
        ? `Alumni tracer study saved with ${warningCount} thing(s) to note`
        : "Alumni tracer study saved successfully"
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
    setAttention([]);
    setStep("cohort");
    setDone(null);
    onClose();
  }

  if (!cycle || !working || !validation || !computation || !completion) {
    return (
      <Modal open={open} onClose={handleClose} title="Submit Alumni Data" subtitle="No open Alumni reporting cycle.">
        <p className="text-sm text-ink-soft/60">
          There is no open Alumni reporting cycle to submit against. An administrator can open one from Data /
          Submissions.
        </p>
      </Modal>
    );
  }

  const cycleStatus = getEffectiveStatus(cycle);
  const cohortSummary = summariseCohort(working, alumniConfig);
  const orderedSteps: Step[] = ["cohort", ...ALUMNI_SECTION_KEYS];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title="Alumni Tracer Study Submission"
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

          {issues.length > 0 && (
            <IssuePanel
              issues={issues}
              heading={`${issues.length} blocking issue(s) must be fixed before this can be submitted`}
              tone="blocking"
              onJump={(section) => {
                setShowReview(false);
                setStep(section);
              }}
              onDismiss={() => setIssues([])}
            />
          )}

          {attention.length > 0 && (
            <IssuePanel
              issues={attention}
              heading={`${attention.length} thing(s) to note - these do not block the submission`}
              tone="attention"
              onJump={(section) => {
                setShowReview(false);
                setStep(section);
              }}
              onDismiss={() => setAttention([])}
            />
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
                Progress: {completedCount} / {totalSteps} sections completed
              </span>
              <span className="text-sm font-bold text-ink">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-butter transition-all" style={{ width: `${progressPct}%` }} />
            </div>

            <button
              type="button"
              onClick={() => {
                setShowReview(false);
                setStep("cohort");
              }}
              className={`mt-3 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                step === "cohort" && !showReview
                  ? "border-ink bg-ink text-butter"
                  : "border-ink/10 bg-white text-ink-soft/70 hover:bg-ink/5"
              }`}
            >
              Start Here: the Cohort
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  step === "cohort" && !showReview ? "bg-butter/25 text-butter" : stateStyles.incomplete
                }`}
              >
                {cohortReady(working) ? "Complete" : "Incomplete"}
              </span>
            </button>

            <div className="mt-2 flex flex-wrap gap-2">
              {ALUMNI_SECTION_KEYS.map((key) => {
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
                    {ALUMNI_SECTION_LABELS[key]}
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

          {showReview ? (
            <ReviewPanel
              report={working}
              computation={computation}
              cohortSummary={cohortSummary}
              kpis={kpis}
              sectionStates={sectionStates}
              needsExplanation={needsExplanation}
              nextDueDate={effectiveNextDate}
              currencySymbol={alumniConfig.currencySymbol}
              onEdit={(section) => {
                setShowReview(false);
                setStep(section);
              }}
            />
          ) : (
            <div className="min-h-[320px]">
              {step === "cohort" && (
                <CohortBlockSection
                  report={working}
                  summary={cohortSummary}
                  onChange={(cohort) => update({ cohort })}
                  config={alumniConfig}
                />
              )}
              {step === "employment" && (
                <EmploymentSection
                  report={working}
                  data={working.employment}
                  onChange={(employment) => update({ employment })}
                  kpis={kpis}
                  config={alumniConfig}
                />
              )}
              {step === "business" && (
                <BusinessSection
                  report={working}
                  data={working.business}
                  onChange={(business) => update({ business })}
                  kpis={kpis}
                  config={alumniConfig}
                />
              )}
              {step === "farm" && (
                <FarmSection
                  report={working}
                  data={working.farm}
                  onChange={(farm) => update({ farm })}
                  kpis={kpis}
                  config={alumniConfig}
                />
              )}
              {step === "loans" && (
                <LoanSection
                  report={working}
                  data={working.loans}
                  onChange={(loans) => update({ loans })}
                  kpis={kpis}
                  config={alumniConfig}
                />
              )}
              {step === "referrals" && (
                <ReferralSection
                  report={working}
                  data={working.referrals}
                  onChange={(referrals) => update({ referrals })}
                  kpis={kpis}
                  config={alumniConfig}
                />
              )}
              {step === "market" && (
                <MarketSection
                  report={working}
                  data={working.market}
                  onChange={(market) => update({ market })}
                  kpis={kpis}
                  config={alumniConfig}
                />
              )}
              {step === "engagement" && (
                <EngagementSection
                  report={working}
                  data={working.engagement}
                  onChange={(engagement) => update({ engagement })}
                  kpis={kpis}
                  config={alumniConfig}
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
                    Submit Alumni Data
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = orderedSteps.indexOf(step);
                      if (idx > 0) setStep(orderedSteps[idx - 1]);
                    }}
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft/70 hover:bg-ink/5 disabled:opacity-30"
                    disabled={orderedSteps.indexOf(step) === 0}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = orderedSteps.indexOf(step);
                      if (idx < orderedSteps.length - 1) setStep(orderedSteps[idx + 1]);
                      else handleReview();
                    }}
                    className="whitespace-nowrap rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
                  >
                    {orderedSteps.indexOf(step) === orderedSteps.length - 1 ? "Review Submission →" : "Next →"}
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

function sectionData(report: AlumniReport, key: AlumniSectionKey) {
  return report[key] as { records: unknown[]; notApplicable: boolean };
}

/**
 * The cohort block counts as done once both halves of the denominator are
 * present. Without a cohort size no rate can be read, and without a traced count
 * there is no sample to describe.
 */
function cohortReady(report: AlumniReport | null): boolean {
  return Boolean(report && report.cohort.graduatesInCohort !== null && report.cohort.tracedThisPeriod !== null);
}

/**
 * Items that will need explaining, counted from the same computation the review
 * page shows, so the toast, the review and the success panel quote one number.
 */
function countWarnings(
  computation: ReturnType<typeof computeAlumniKpis>,
  kpis: Kpi[],
  attentionCount: number
): number {
  const fromKpis = computation.entries.filter(({ kpiId, value }) => {
    const status = previewAlumniStatus(kpis.find((k) => k.id === kpiId), value).status;
    return status === "amber" || status === "red";
  }).length;
  // Loans in arrears and referral counts are facts the department states rather
  // than verdicts, so they are counted alongside the threshold warnings.
  return fromKpis + attentionCount;
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
  heading,
  tone,
  onJump,
  onDismiss,
}: {
  issues: AlumniValidationIssue[];
  heading: string;
  tone: "blocking" | "attention";
  onJump: (section: AlumniSectionKey) => void;
  onDismiss: () => void;
}) {
  const grouped = summariseAlumniIssues(issues);
  const blocking = tone === "blocking";
  return (
    <div
      className={`rounded-2xl border p-4 ${blocking ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60"}`}
      data-testid={blocking ? "alumni-blocking-issues" : "alumni-attention-issues"}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${blocking ? "text-rose-700" : "text-amber-800"}`}>
          {heading}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className={`text-[11px] underline ${blocking ? "text-rose-600" : "text-amber-700"}`}
        >
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
  cohortSummary,
  kpis,
  sectionStates,
  needsExplanation,
  nextDueDate,
  currencySymbol,
  onEdit,
}: {
  report: AlumniReport;
  computation: ReturnType<typeof computeAlumniKpis>;
  cohortSummary: ReturnType<typeof summariseCohort>;
  kpis: Kpi[];
  sectionStates: Record<AlumniSectionKey, string>;
  needsExplanation: { kpiId: string; name: string; value: number; status: "amber" | "red"; reason: string }[];
  nextDueDate: string;
  currencySymbol: string;
  onEdit: (section: AlumniSectionKey) => void;
}) {
  const derived = computation.entries
    .map((entry) => {
      const kpi = kpis.find((k) => k.id === entry.kpiId);
      if (!kpi) return null;
      const { status, thresholdNote } = previewAlumniStatus(kpi, entry.value);
      return { ...entry, kpi, status, thresholdNote };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
          Review before submitting - nothing has been saved yet
        </p>
        <p className="mt-1 text-xs text-ink-soft/60">
          {report.reportingPeriod} · source:{" "}
          {report.dataSource.kind === "Manual Entry" ? "manual entry" : "nothing submitted yet"}
        </p>
      </div>

      {/*
        The sample is shown again here, above the rates, because a reader who
        only looks at the percentages needs to see how few people they describe.
      */}
      <div className="rounded-2xl border border-amber-300/50 bg-amber-50/50 p-4" data-testid="alumni-review-cohort">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
          How many people these rates describe
        </p>
        {cohortSummary ? (
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
            {cohortSummary.traced} of {cohortSummary.graduatesInCohort} graduates in the cohort were traced
            {cohortSummary.responseRatePct !== null &&
              `, a response rate of ${cohortSummary.responseRatePct.toFixed(1)}%`}.
            {cohortSummary.untraceable > 0 &&
              ` ${cohortSummary.untraceable} were recorded as untraceable.`}{" "}
            The rates below describe only the graduates who answered, not the whole cohort.
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-900/80">
            No cohort size entered, so none of the rates below can be read as a proportion of the cohort.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Sections</p>
        <ul className="mt-2 flex flex-col gap-1">
          {ALUMNI_SECTION_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => onEdit(key)}
                className="text-left font-semibold text-ink underline decoration-ink/20"
              >
                {ALUMNI_SECTION_LABELS[key]}
              </button>
              <span
                className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${stateStyles[sectionStates[key]]}`}
              >
                {stateLabel[sectionStates[key]]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">KPIs that will be calculated</p>
        <ul className="mt-2 flex flex-col gap-2">
          {derived.map(({ kpi, value, status, thresholdNote }) => (
            <li key={kpi.id} className="flex items-start justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-ink">{kpi.name}</p>
                <p className="text-[11px] text-ink-soft/50">
                  Derived from the {ALUMNI_SECTION_LABELS[sectionForAlumniKpi(kpi.id) as AlumniSectionKey]?.toLowerCase() ?? "cohort"} register.
                  Calculated by the Alumni engine.
                </p>
                {thresholdNote && <p className="text-[11px] text-ink-soft/50">{thresholdNote}</p>}
              </div>
              <div className="whitespace-nowrap text-right">
                <p className="font-semibold tabular-nums text-ink">
                  {kpi.unit === "currency" ? `${currencySymbol}${Math.round(value).toLocaleString("en-ZA")}` : `${Math.round(value * 100) / 100}${kpi.unit === "percent" ? "%" : ""}`}
                </p>
                <StatusBadge status={status} compact />
              </div>
            </li>
          ))}
          {derived.length === 0 && (
            <li className="text-xs text-ink-soft/60">
              Nothing can be calculated from this submission yet. Every figure below needs at least one row in its
              register.
            </li>
          )}
        </ul>
      </div>

      {computation.skipped.length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
            Not reported from this submission
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {computation.skipped.map((skip) => {
              const kpi = kpis.find((k) => k.id === skip.kpiId);
              return (
                <li key={skip.kpiId} className="text-[11px] text-ink-soft/60">
                  <span className="font-medium text-ink-soft/80">{kpi?.name ?? skip.kpiId}</span>: {skip.detail}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {needsExplanation.length > 0 && (
        <div className="rounded-2xl border border-butter-dark/30 bg-butter/15 p-4" data-testid="alumni-needs-explanation">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/60">
            Explain before you submit ({needsExplanation.length})
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {needsExplanation.map((item) => (
              <li key={item.kpiId} className="text-[11px] text-ink-soft/70">
                <span className="font-medium text-ink">{item.name}</span>: {item.reason}
              </li>
            ))}
          </ul>
          {/*
            Commentary belongs to the section that raised the figure, so it is
            edited there rather than here. This only says where to go.
          */}
          <ul className="mt-2 flex flex-col gap-0.5">
            {[...new Set(needsExplanation.map((item) => sectionForAlumniKpi(item.kpiId)))]
              // "cohort" is a real answer here, and there is no cohort register to
              // comment on, so it is dropped rather than rendered as a dead link.
              .filter((key): key is AlumniSectionKey => key !== null && key !== "cohort")
              .map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onEdit(key)}
                    className="text-[11px] text-ink-soft/60 underline decoration-ink/20"
                  >
                    Add commentary on {ALUMNI_SECTION_LABELS[key].toLowerCase()}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-ink-soft/40">
        Submitting calculates the Alumni KPIs from the employment, business, farm, loan, referral, market and
        engagement records in this tracer study. Next submission due{" "}
        {new Date(nextDueDate).toLocaleDateString("en-ZA")}.
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
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        ✓
      </div>
      <h3 className="text-lg font-semibold text-ink">Alumni tracer study submitted</h3>
      <p className="max-w-md text-xs leading-relaxed text-ink-soft/60">
        {period} has been submitted. The Alumni KPIs were calculated from the employment, business sustainability, farm
        productivity, loan, referral, market participation and engagement records in this study, and the next cycle is
        open.
      </p>
      {done.warnings > 0 && (
        <p className="rounded-xl bg-butter/20 px-3 py-2 text-xs text-ink-soft/70">
          {done.warnings} thing(s) were recorded for the coordinator to note. None of them blocked the submission.
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