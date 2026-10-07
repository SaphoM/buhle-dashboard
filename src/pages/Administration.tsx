import { useRef, useState } from "react";
import { DEMO_USERS } from "../data/demoData";
import { useDataStore } from "../data/DataStoreContext";
import {
  COST_CENTRES,
  DEPARTMENTS,
  ENTERPRISE_CODES,
  FUNDER_CODES,
  TO_CONFIRM_REGISTER,
  type EvidenceStatus,
  type MasterRecord,
} from "../data/masterData";
import type { Department, ReportingFrequency } from "../types";
import type {
  CampaignChannel,
  EnquiryChannel,
  EnquiryOutcome,
  LeadSource,
  PartnershipType,
} from "../types/marketing";
import type { FarmingConfig } from "../types/farming";
import type { AlumniConfig } from "../types/alumni";
import { FINANCE_WORKBOOK_DEPENDENCY } from "../types/finance";
import { FinanceWorkbookDependencyNotice } from "../components/dashboard/finance/FinanceSectionChrome";
import { Tooltip } from "../components/common/Tooltip";
import { useToast } from "../components/common/ToastContext";

const APPROVAL_NOTE: Record<"confirmed" | "proposed", string> = {
  confirmed:
    "Confirmed - this target/threshold comes from a real Buhle document supplied during discovery (e.g. the HR KPI Calc workbook's own 2026 goals).",
  proposed:
    "Proposed - a starting point from the discovery brief, not yet Board-approved (see Section 19 of the brief).",
};

// Same short labels the top nav already uses per department (permissions.ts
// NAV_ITEMS) - reused here rather than inventing new department wording.
const KPI_DEPARTMENT_TABS: { label: string; department: Department | "all" }[] = [
  { label: "All", department: "all" },
  { label: "Finance", department: "Finance" },
  { label: "Operations", department: "Operations" },
  { label: "Farming", department: "Commercial Farming" },
  { label: "HR", department: "Human Resources" },
  { label: "Marketing", department: "Marketing" },
  { label: "Academy", department: "Academy" },
  { label: "Alumni", department: "Alumni" },
];

const evidenceStyles: Record<EvidenceStatus, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  proposed: "bg-butter/30 text-ink border-butter-dark/40",
  to_confirm: "bg-rose-50 text-rose-700 border-rose-200",
};

const evidenceLabel: Record<EvidenceStatus, string> = {
  confirmed: "Confirmed",
  proposed: "Proposed",
  to_confirm: "To Confirm",
};

function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${evidenceStyles[status]}`}>
      {evidenceLabel[status]}
    </span>
  );
}

function MasterDataList({ title, items }: { title: string; items: MasterRecord[] }) {
  return (
    <div className="card-surface rounded-3xl border border-ink/10 p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.code}
            tabIndex={item.note ? 0 : undefined}
            className="group relative flex items-center justify-between gap-2 rounded-xl bg-ink/[0.03] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-butter-dark"
          >
            <span className="text-sm text-ink-soft/80">{item.label}</span>
            <EvidenceBadge status={item.status} />
            {item.note && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-2xl bg-ink px-3 py-2 text-xs leading-snug text-butter opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                {item.note}
                <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-ink" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Cadences an HR reporting cycle can realistically run at. Held here rather
// than in the cycle engine so the option set is configuration, not a constant.
const HR_FREQUENCY_OPTIONS = [
  "Weekly",
  "Monthly",
  "Quarterly",
  "Annually",
  "Per Cohort",
  "Per Season",
] as const satisfies readonly ReportingFrequency[];

// The Finance cycle is monthly in practice (the Budget Monitor workbook is
// updated monthly), so the option set stays close to that rather than offering
// every cadence the type allows.
const FINANCE_FREQUENCY_OPTIONS = [
  "Weekly",
  "Monthly",
  "Quarterly",
  "Per Season",
] as const satisfies readonly ReportingFrequency[];

// Operations is per-cohort in practice: enrolment, attendance, completion and
// dropout are all term-level facts, so a monthly cycle would report the same
// cohort four times and make a completion rate look like it moved when nothing
// about the cohort changed. The option set stays close to that.
const OPERATIONS_FREQUENCY_OPTIONS = [
  "Per Cohort",
  "Per Season",
  "Monthly",
  "Quarterly",
  "Per Batch",
] as const satisfies readonly ReportingFrequency[];

/** Tracer studies run against a cohort rather than a calendar period, so the
 *  options differ from the operational ones. */
const ALUMNI_FREQUENCY_OPTIONS = [
  "6 Months After Graduation",
  "Per Cohort",
] as const satisfies readonly ReportingFrequency[];

/** A renameable list of approved categories. Finance's category structure comes
 *  from the workbook and the organisation's chart of accounts, so it is
 *  editable here rather than compiled in - Section 6 and Section 21 both require
 *  that. */
function CategoryList({
  title,
  description,
  items,
  onRename,
}: {
  title: string;
  description: string;
  items: readonly { label: string }[];
  onRename: (index: number, label: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-soft/60">{title}</p>
      <p className="mt-1 text-[11px] text-ink-soft/40">{description}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <input
            key={`${item.label}-${index}`}
            className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink"
            value={item.label}
            onChange={(e) => onRename(index, e.target.value)}
          />
        ))}
      </div>
    </div>
  );
}

export function Administration() {
  const {
    kpis,
    updateKpiThresholds,
    hrConfig,
    updateHrConfig,
    financeConfig,
    updateFinanceConfig,
    operationsConfig,
    updateOperationsConfig,
    marketingConfig,
    updateMarketingConfig,
    farmingConfig,
    updateFarmingConfig,
    alumniConfig,
    updateAlumniConfig,
    auditLog,
  } =
    useDataStore();
  const [kpiDeptFilter, setKpiDeptFilter] = useState<Department | "all">("all");
  const toast = useToast();
  // Threshold inputs fire onChange per keystroke (so live cross-role display
  // stays in sync as before) but the confirmation toast should only fire
  // once, when the user actually finishes editing a field - tracked here and
  // fired on blur, not on every keystroke.
  const dirtyThresholds = useRef<Set<string>>(new Set());

  function updateThreshold(
    id: string,
    field: "greenThreshold" | "amberThreshold" | "target",
    value: number | null
  ) {
    dirtyThresholds.current.add(`${id}-${field}`);
    updateKpiThresholds(id, { [field]: value });
  }

  function confirmThresholdEdit(id: string, field: string) {
    const key = `${id}-${field}`;
    if (!dirtyThresholds.current.has(key)) return;
    dirtyThresholds.current.delete(key);
    toast.success("KPI threshold updated successfully");
  }

  const filteredKpis = kpiDeptFilter === "all" ? kpis : kpis.filter((k) => k.department === kpiDeptFilter);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Administration</h1>
        <p className="text-sm text-ink-soft/60">
          System configuration - master data, KPI thresholds, users and escalation rules. Changes here do not
          require a code change.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Master Data <span className="normal-case text-ink-soft/40">- shared reference codes, governed centrally rather than hard-coded per department</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MasterDataList title="Departments" items={DEPARTMENTS} />
          <MasterDataList title="Cost Centres" items={COST_CENTRES} />
          <MasterDataList title="Funder / Project Codes" items={FUNDER_CODES} />
          <MasterDataList title="Enterprise Codes" items={ENTERPRISE_CODES} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">KPI Thresholds</h2>

        <div className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto rounded-full border border-ink/10 bg-white/80 p-1.5 shadow-sm">
          {KPI_DEPARTMENT_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setKpiDeptFilter(tab.department)}
              aria-pressed={kpiDeptFilter === tab.department}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                kpiDeptFilter === tab.department
                  ? "bg-ink text-white shadow-sm"
                  : "text-ink-soft/70 hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="card-surface overflow-x-auto rounded-3xl border border-ink/10 shadow-sm">
          {filteredKpis.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft/40">No KPI thresholds configured for this department.</p>
          ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">KPI</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Approval</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Green ≥</th>
                <th className="px-4 py-2.5 font-medium">Amber ≥</th>
              </tr>
            </thead>
            <tbody>
              {filteredKpis.map((k) => (
                <tr key={k.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">
                    <Tooltip text={k.insight}>{k.name}</Tooltip>
                  </td>
                  <td className="px-4 py-2 text-ink-soft/70">{k.owner}</td>
                  <td className="px-4 py-2 text-xs text-ink-soft/50">{k.sourceSystem ?? "TO CONFIRM"}</td>
                  <td className="px-4 py-2">
                    <Tooltip
                      text={APPROVAL_NOTE[k.thresholdApproval === "confirmed" ? "confirmed" : "proposed"]}
                    >
                      <EvidenceBadge status={k.thresholdApproval === "confirmed" ? "confirmed" : "proposed"} />
                    </Tooltip>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.target}
                      onChange={(e) => updateThreshold(k.id, "target", Number(e.target.value))}
                      onBlur={() => confirmThresholdEdit(k.id, "target")}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.greenThreshold ?? ""}
                      placeholder="Not set"
                      onChange={(e) => updateThreshold(k.id, "greenThreshold", e.target.value === "" ? null : Number(e.target.value))}
                      onBlur={() => confirmThresholdEdit(k.id, "greenThreshold")}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded-full border border-ink/10 bg-white px-3 py-1"
                      value={k.amberThreshold ?? ""}
                      placeholder="Not set"
                      onChange={(e) => updateThreshold(k.id, "amberThreshold", e.target.value === "" ? null : Number(e.target.value))}
                      onBlur={() => confirmThresholdEdit(k.id, "amberThreshold")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-soft/40">
          "Confirmed" means the target/threshold comes from a real Buhle document supplied during discovery (e.g.
          the HR KPI Calc workbook's own 2026 goals). "Proposed" means it is a starting point from the discovery
          brief, not yet Board-approved - see Section 19 of the brief.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          HR Configuration{" "}
          <span className="normal-case text-ink-soft/40">
            - the switches that govern what HR can report at all
          </span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <label className="flex max-w-sm flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">HR reporting frequency</span>
            <select
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
              value={hrConfig.reportingFrequency}
              onChange={(e) =>
                updateHrConfig({ reportingFrequency: e.target.value as typeof hrConfig.reportingFrequency })
              }
            >
              {HR_FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-soft/40">
              Drives the calculated next submission date for every HR cycle. Monthly is the proposed default
              (HR spec Section 2).
            </span>
          </label>

          <label className="flex max-w-sm flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">Standard working days per month</span>
            <input
              type="number"
              min={1}
              className="w-32 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
              value={hrConfig.standardWorkingDaysPerMonth}
              onChange={(e) => updateHrConfig({ standardWorkingDaysPerMonth: Number(e.target.value) })}
            />
            <span className="text-[11px] text-ink-soft/40">
              Used to derive expected employee-days when HR leaves that field blank.
            </span>
          </label>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={hrConfig.performanceManagementActive}
                onChange={(e) => updateHrConfig({ performanceManagementActive: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-ink/20 accent-ink"
              />
              <span>
                <span className="text-sm font-semibold text-ink">
                  Formal performance-management system is active
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft/50">
                  Leave this <strong>off</strong> until Buhle adopts a formal performance-management process. While
                  it is off, the HR Performance section reports &quot;Performance Management System Not Yet
                  Active&quot; and the Staff Performance KPI shows &quot;Not Yet Available&quot; everywhere, including
                  the Executive Dashboard. No figure is fabricated (HR spec Sections 8, 9 and test 5).
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Finance Configuration{" "}
          <span className="normal-case text-ink-soft/40">
            - the conventions Finance decides, rather than the application assuming
          </span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <label className="flex max-w-sm flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Finance reporting frequency</span>
              <select
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={financeConfig.reportingFrequency}
                onChange={(e) =>
                  updateFinanceConfig({
                    reportingFrequency: e.target.value as typeof financeConfig.reportingFrequency,
                  })
                }
              >
                {FINANCE_FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-soft/40">
                Drives the calculated next submission date for every Finance cycle. Monthly is the proposed
                default (Finance spec Section 4).
              </span>
            </label>

            <label className="flex max-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Currency symbol</span>
              <input
                type="text"
                maxLength={3}
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={financeConfig.currencySymbol}
                onChange={(e) => updateFinanceConfig({ currencySymbol: e.target.value })}
              />
              <span className="text-[11px] text-ink-soft/40">
                Display only. Every amount is entered and stored as a plain number, so changing this changes
                presentation and never the figures (Finance spec Section 11).
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={financeConfig.committedCountsAgainstBudget}
                onChange={(e) => updateFinanceConfig({ committedCountsAgainstBudget: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-ink/20 accent-ink"
              />
              <span>
                <span className="text-sm font-semibold text-ink">
                  Committed expenditure reduces remaining budget
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft/50">
                  The Budget Monitor workbook has not yet confirmed which convention it uses. This must be set to
                  match it exactly, because the remaining-budget formula is the workbook&apos;s approved
                  calculation and must be preserved rather than replaced (Finance spec Section 13). Until then the
                  conservative reading is used and recorded as an explicit decision, not an assumption.
                </span>
              </span>
            </label>
          </div>

          <CategoryList
            title="Approved revenue categories"
            description="Section 6 requires these to come from the organisation's approved category structure rather than being hard-coded. The kind drives the Executive roll-up: donor and funder lines feed Executive Donor Funding."
            items={financeConfig.revenueCategories}
            onRename={(index, label) =>
              updateFinanceConfig({
                revenueCategories: financeConfig.revenueCategories.map((c, i) =>
                  i === index ? { ...c, label } : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved operating expense categories"
            description="Section 21 - the expense structure Finance reports against. Labels are editable; the identity of each category is preserved."
            items={financeConfig.expenseCategories.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFinanceConfig({
                expenseCategories: financeConfig.expenseCategories.map((c, i) => (i === index ? label : c)),
              })
            }
          />

          <div>
            <p className="text-xs font-semibold text-ink-soft/60">Ageing buckets (days overdue)</p>
            <p className="mt-1 text-[11px] text-ink-soft/40">
              Sections 15 and 18 permit configurable ageing periods where the Finance policy differs. The engine
              reads whatever boundaries are set here; the 90-day warning follows the deepest bucket if no 90-day
              line exists.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {financeConfig.ageingBuckets.map((bucket, index) => (
                <label key={bucket.label} className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5">
                  <span className="text-xs text-ink-soft/60">{bucket.label}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs text-ink"
                    value={bucket.from}
                    onChange={(e) =>
                      updateFinanceConfig({
                        ageingBuckets: financeConfig.ageingBuckets.map((b, i) =>
                          i === index ? { ...b, from: Number(e.target.value) } : b
                        ),
                      })
                    }
                  />
                  <span className="text-[11px] text-ink-soft/35">days and beyond</span>
                </label>
              ))}
            </div>
          </div>

          <FinanceWorkbookDependencyNotice dependency={FINANCE_WORKBOOK_DEPENDENCY} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Operations Configuration{" "}
          <span className="normal-case text-ink-soft/40">
            - the conventions and approved vocabularies Operations decides
          </span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">No Operations KPI threshold is configured</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              All twelve Operations KPIs ship with no approved limit, so they report{" "}
              <span className="font-medium text-ink-soft/70">Threshold not configured</span> instead of a
              Green/Amber/Red verdict. That is the honest position while Buhle&apos;s learner-facing targets are
              still being agreed: a made-up target would manufacture warnings, and missing one would manufacture
              false reassurance. Approving a limit in the KPI threshold table above switches the Early Warning
              System on for that figure immediately, with no code change.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <label className="flex max-w-sm flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Operations reporting frequency</span>
              <select
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={operationsConfig.reportingFrequency}
                onChange={(e) =>
                  updateOperationsConfig({
                    reportingFrequency: e.target.value as typeof operationsConfig.reportingFrequency,
                  })
                }
              >
                {OPERATIONS_FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-soft/40">
                Drives the calculated next submission date for every Operations cycle. Per Cohort is the default,
                because completion and dropout are cohort-level facts.
              </span>
            </label>

            <label className="flex max-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Currency symbol</span>
              <input
                type="text"
                maxLength={3}
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={operationsConfig.currencySymbol}
                onChange={(e) => updateOperationsConfig({ currencySymbol: e.target.value })}
              />
              <span className="text-[11px] text-ink-soft/40">
                Display only, for asset values. Every amount is stored as a plain number, so changing this changes
                presentation and never the figures.
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={operationsConfig.reEnrolmentCountsAsDropout}
                onChange={(e) =>
                  updateOperationsConfig({ reEnrolmentCountsAsDropout: e.target.checked })
                }
                className="mt-1 h-4 w-4 rounded border-ink/20 accent-ink"
              />
              <span>
                <span className="text-sm font-semibold text-ink">
                  A learner who re-enrols still counts as a dropout
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft/50">
                  Off, a learner who left and then re-enrolled in the same programme is excluded from the dropout
                  numerator while remaining in the denominator, because the dropout rate answers &quot;did learners
                  who began this cohort finish it?&quot; rather than &quot;how many times did somebody leave?&quot;.
                  The two conventions produce materially different rates, so this is recorded here as an explicit
                  policy decision rather than assumed in the engine.
                </span>
              </span>
            </label>
          </div>

          <CategoryList
            title="Approved programmes"
            description="The course and programme list every learner, session and completion record must reference. A value outside this list is rejected at submission rather than silently accepted, because an unregistered programme makes a cohort rate meaningless."
            items={operationsConfig.programmes.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateOperationsConfig({
                programmes: operationsConfig.programmes.map((c, i) => (i === index ? label : c)),
              })
            }
          />

          <CategoryList
            title="Approved asset categories"
            description="The asset register's categories. Asset value, condition and in-service base all come from the register itself, never from a summary someone types."
            items={operationsConfig.assetCategories.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateOperationsConfig({
                assetCategories: operationsConfig.assetCategories.map((c, i) => (i === index ? label : c)),
              })
            }
          />

          <div>
            <p className="text-xs font-semibold text-ink-soft/60">Attendance reporting bands</p>
            <p className="mt-1 text-[11px] text-ink-soft/40">
              Present / absent counts per band, for reporting only. The attendance rate itself is derived from the
              session register and can never be typed, so these bands describe an already-calculated figure rather
              than being an input to it.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {operationsConfig.attendanceBands.map((band, index) => (
                <label key={band.label} className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5">
                  <input
                    className="w-28 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs text-ink"
                    value={band.label}
                    onChange={(e) =>
                      updateOperationsConfig({
                        attendanceBands: operationsConfig.attendanceBands.map((b, i) =>
                          i === index ? { ...b, label: e.target.value } : b
                        ),
                      })
                    }
                  />
                  <span className="text-[11px] text-ink-soft/35">from</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-20 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs text-ink"
                    value={band.minPct}
                    onChange={(e) =>
                      updateOperationsConfig({
                        attendanceBands: operationsConfig.attendanceBands.map((b, i) =>
                          i === index ? { ...b, minPct: Number(e.target.value) } : b
                        ),
                      })
                    }
                  />
                  <span className="text-[11px] text-ink-soft/35">%</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Marketing Configuration <span className="normal-case text-ink-soft/40">- what counts, and what may be named</span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">Six of the eight Marketing KPIs have no approved threshold</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              Only <span className="font-medium text-ink-soft/70">Student Enquiries</span> and{" "}
              <span className="font-medium text-ink-soft/70">Enquiry to Enrolment Conversion</span> carry approved
              limits, because those two were already on the dashboard before this submission existed and the demo data
              already depends on the enquiry KPI. The six new figures report{" "}
              <span className="font-medium text-ink-soft/70">Threshold not configured</span> rather than a
              Green/Amber/Red verdict, because no limit has been approved for a marketing figure yet. Approving one in
              the KPI threshold table above switches the Early Warning System on for that figure immediately, with no
              code change.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <label className="flex max-w-sm flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Marketing reporting frequency</span>
              <select
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={marketingConfig.reportingFrequency}
                onChange={(e) =>
                  updateMarketingConfig({
                    reportingFrequency: e.target.value as typeof marketingConfig.reportingFrequency,
                  })
                }
              >
                {OPERATIONS_FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-soft/40">
                Drives the calculated next submission date for every Marketing cycle. Monthly is the default, because
                enquiry volume moves on a timescale of days and a quarterly cadence would report the same pipeline for
                three months and make it look stalled.
              </span>
            </label>

            <label className="flex max-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Currency symbol</span>
              <input
                type="text"
                maxLength={3}
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={marketingConfig.currencySymbol}
                onChange={(e) => updateMarketingConfig({ currencySymbol: e.target.value })}
              />
              <span className="text-[11px] text-ink-soft/40">
                Display only, for campaign spend and partnership value. Every amount is stored as a plain number, so
                changing this changes presentation and never the figures.
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">The outcome list is a policy decision, not a label list</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              The enquiry conversion rate is calculated from the outcome list below, so adding{" "}
              <span className="font-medium text-ink-soft/70">Enrolled</span> to the approved outcomes immediately
              changes what counts as a conversion, and removing it would drop every historical rate to zero. Only{" "}
              <span className="font-medium text-ink-soft/70">Enrolled</span> is treated as converted;{" "}
              <span className="font-medium text-ink-soft/70">Awaiting decision</span> and{" "}
              <span className="font-medium text-ink-soft/70">Unreachable</span> are recorded outcomes that resolve
              nothing, so they count in the denominator but not the numerator.{" "}
              <span className="font-medium text-ink-soft/70">Duplicate</span> is excluded from the denominator
              entirely, so a conversion rate cannot be improved by recording the same person twice. Duplicate, Awaiting
              decision and Unreachable are part of the outcome vocabulary precisely so a person has somewhere honest to
              record a contact they could not reach.
            </p>
          </div>

          <CategoryList
            title="Approved enquiry channels"
            description="Where an enquiry came from. Drives the per-channel breakdown, so it is a closed list rather than free text."
            items={marketingConfig.enquiryChannels.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                enquiryChannels: marketingConfig.enquiryChannels.map((c, i) => (i === index ? (label as EnquiryChannel) : c)),
              })
            }
          />

          <CategoryList
            title="Approved enquiry outcomes"
            description="The conversion rate is derived from this list. Editing it changes what a conversion means for every future submission."
            items={marketingConfig.enquiryOutcomes.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                enquiryOutcomes: marketingConfig.enquiryOutcomes.map((c, i) => (i === index ? (label as EnquiryOutcome) : c)),
              })
            }
          />

          <CategoryList
            title="Approved campaign channels"
            description="How a campaign was run. The cost per enquiry comparison only works when every campaign names the channel it ran on."
            items={marketingConfig.campaignChannels.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                campaignChannels: marketingConfig.campaignChannels.map((c, i) => (i === index ? (label as CampaignChannel) : c)),
              })
            }
          />

          <CategoryList
            title="Approved lead sources"
            description="The lead register's sources. One row per source per period, so the best and worst sources can be named from the data rather than asserted."
            items={marketingConfig.leadSources.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                leadSources: marketingConfig.leadSources.map((c, i) => (i === index ? (label as LeadSource) : c)),
              })
            }
          />

          <CategoryList
            title="Approved partnership types"
            description="What kind of relationship a partner represents. A cash contribution with no recorded value is rejected at submission, because it quietly understates partnership value."
            items={marketingConfig.partnershipTypes.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                partnershipTypes: marketingConfig.partnershipTypes.map((c, i) => (i === index ? (label as PartnershipType) : c)),
              })
            }
          />

          <CategoryList
            title="Approved programmes"
            description="The programmes an enquiry can be interested in. A value outside this list is rejected rather than silently accepted."
            items={marketingConfig.programmes.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                programmes: marketingConfig.programmes.map((c, i) => (i === index ? label : c)),
              })
            }
          />

          <CategoryList
            title="Approved provinces"
            description="Where an enquiry came from. A closed list, so the geographic read is comparable between months rather than depending on spelling."
            items={marketingConfig.provinces.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateMarketingConfig({
                provinces: marketingConfig.provinces.map((c, i) => (i === index ? label : c)),
              })
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Commercial Farming Configuration{" "}
          <span className="normal-case text-ink-soft/40">- what counts, and what may be named</span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">Seven of the nine Farming figures have no approved threshold</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              Only <span className="font-medium text-ink-soft/70">Livestock Mortality Rate</span> carries confirmed
              limits, because a Board-level escalation is open against it and the limits that triggered it must survive.
              <span className="font-medium text-ink-soft/70"> Commercial Farm Revenue</span> carries a proposed target
              only. The remaining figures report{" "}
              <span className="font-medium text-ink-soft/70">Threshold not configured</span> rather than a
              Green/Amber/Red verdict, because no limit has been approved for a farming figure yet. Approving one in the
              KPI threshold table above switches the Early Warning System on for that figure immediately, with no code
              change.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <label className="flex max-w-sm flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Farming reporting frequency</span>
              <select
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={farmingConfig.reportingFrequency}
                onChange={(e) =>
                  updateFarmingConfig({
                    reportingFrequency: e.target.value as typeof farmingConfig.reportingFrequency,
                  })
                }
              >
                {OPERATIONS_FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-soft/40">
                Drives the calculated next submission date for every Farming cycle. Per Season is the default, because a
                crop cycle and a livestock cycle are both seasonal: a monthly cycle would report the same standing herd
                and the same standing water meter reading twelve times and make them look like they moved.
              </span>
            </label>

            <label className="flex max-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Currency symbol</span>
              <input
                type="text"
                maxLength={3}
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={farmingConfig.currencySymbol}
                onChange={(e) => updateFarmingConfig({ currencySymbol: e.target.value })}
              />
              <span className="text-[11px] text-ink-soft/40">
                Display only, for sales value and cost lines. Every amount is stored as a plain number, so changing
                this changes presentation and never the figures.
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">Whether suspected deaths count is a policy decision</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              The mortality rate is deaths over stock on hand, and a suspected or disputed death moves it materially.
              Switching this on includes every recorded death in the rate; switched off, only deaths marked confirmed for
              the rate are counted, and the rest stay on the register as a record without inflating the figure the
              Board sees. Individual records can always be excluded regardless of this setting.
            </p>
            <label className="mt-3 flex max-w-sm flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Count suspected deaths in the mortality rate</span>
              <select
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={farmingConfig.mortalityCountsSuspected ? "yes" : "no"}
                onChange={(e) => updateFarmingConfig({ mortalityCountsSuspected: e.target.value === "yes" })}
              >
                <option value="no">No, confirmed deaths only</option>
                <option value="yes">Yes, include suspected deaths</option>
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">An empty register is a gap, never a completed section</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              All seven Farming registers are typed in, so a submission with nothing in a register would otherwise
              validate as finished and report every figure as no data. Each register therefore has to hold at least one
              row, or be explicitly marked Not Applicable. A month with genuinely no disease is recorded as Not
              Applicable, which is a deliberate exclusion rather than missing evidence, and the two are never conflated.
            </p>
          </div>

          <CategoryList
            title="Approved crops and enterprises"
            description="What is grown on the farm. Drives the per-crop production breakdown, so it is a closed list rather than free text."
            items={farmingConfig.crops.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({ crops: farmingConfig.crops.map((c, i) => (i === index ? label : c)) })
            }
          />

          <CategoryList
            title="Approved plots and areas"
            description="Where a harvest was recorded. Closing this list keeps area figures comparable between seasons."
            items={farmingConfig.plots.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({ plots: farmingConfig.plots.map((c, i) => (i === index ? label : c)) })
            }
          />

          <CategoryList
            title="Approved livestock groups"
            description="Species groups. The mortality and disease rates are both divided by stock on hand from this list, so a group that changes name changes what the rate is measured against."
            items={farmingConfig.livestockCategories.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({
                livestockCategories: farmingConfig.livestockCategories.map((c, i) =>
                  i === index ? (label as FarmingConfig["livestockCategories"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved mortality causes"
            description="Why an animal died. A closed list so causes aggregate into the same category next season, and so biosecurity reporting stays consistent."
            items={farmingConfig.mortalityCauses.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({
                mortalityCauses: farmingConfig.mortalityCauses.map((c, i) =>
                  i === index ? (label as FarmingConfig["mortalityCauses"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved diseases"
            description="Disease names taken from the veterinary record. Editing this changes what a case counts as in the incidence rate."
            items={farmingConfig.diseases.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({ diseases: farmingConfig.diseases.map((c, i) => (i === index ? label : c)) })
            }
          />

          <CategoryList
            title="Approved water sources"
            description="Where water was drawn from. Recorded as read on the meter, in the meter's own unit rather than converted."
            items={farmingConfig.waterSources.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({
                waterSources: farmingConfig.waterSources.map((c, i) =>
                  i === index ? (label as FarmingConfig["waterSources"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved sales channels"
            description="Where produce was sold. A closed list so channel revenue is comparable between seasons."
            items={farmingConfig.salesChannels.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({ salesChannels: farmingConfig.salesChannels.map((c, i) => (i === index ? label : c)) })
            }
          />

          <CategoryList
            title="Approved cost categories"
            description="What the money was spent on. The feed cost ratio is derived from the Feed line in this list, so removing Feed changes what that figure reports."
            items={farmingConfig.costCategories.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({
                costCategories: farmingConfig.costCategories.map((c, i) =>
                  i === index ? (label as FarmingConfig["costCategories"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved cost centres"
            description="Which part of the farm carried the cost, so a cost total can be split between crops and livestock."
            items={farmingConfig.costCentres.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateFarmingConfig({ costCentres: farmingConfig.costCentres.map((c, i) => (i === index ? label : c)) })
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Alumni Configuration <span className="normal-case text-ink-soft/40">- who counts, and who may be named</span>
        </h2>
        <div className="card-surface flex flex-col gap-5 rounded-3xl border border-ink/10 p-6 shadow-sm">
          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">Twelve of the thirteen Alumni KPIs have no approved threshold</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              Only <span className="font-medium text-ink-soft/70">Alumni Economically Active Rate</span> carries
              approved limits, because it was already on the dashboard before this tracer study existed. The twelve new
              figures report <span className="font-medium text-ink-soft/70">Threshold not configured</span> rather than a
              Green/Amber/Red verdict, because no limit has been approved for an Alumni figure yet. Approving one in the
              KPI threshold table above switches the Early Warning System on for that figure immediately, with no code
              change.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <label className="flex max-w-sm flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Alumni reporting frequency</span>
              <select
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={alumniConfig.reportingFrequency}
                onChange={(e) =>
                  updateAlumniConfig({
                    reportingFrequency: e.target.value as typeof alumniConfig.reportingFrequency,
                  })
                }
              >
                {ALUMNI_FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-soft/40">
                Drives the calculated next submission date for every Alumni cycle. Tracer studies run after graduates
                have had time to settle, so 6 Months After Graduation is the default rather than a monthly cycle that
                would re-ask the same people about the same placement.
              </span>
            </label>

            <label className="flex max-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Currency symbol</span>
              <input
                type="text"
                maxLength={3}
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={alumniConfig.currencySymbol}
                onChange={(e) => updateAlumniConfig({ currencySymbol: e.target.value })}
              />
              <span className="text-[11px] text-ink-soft/40">
                Display only, for market revenue and loan balances. Every amount is stored as a plain number, so
                changing this changes presentation and never the figures.
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">Which statuses count as economically active</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              The headline Alumni rate counts anyone in an approved active status, so adding a status to the employment
              list immediately changes the headline figure for every future study.{" "}
              <span className="font-medium text-ink-soft/70">Unemployed - seeking</span> and{" "}
              <span className="font-medium text-ink-soft/70">In further education</span> are recorded states that are
              deliberately not counted as active, because counting them would let a programme raise its own result by
              recording graduates who have not started work.{" "}
              <span className="font-medium text-ink-soft/70">Unknown</span> exists in the vocabulary so somebody who
              could not be reached has an honest place to be recorded rather than being guessed at.
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 p-4">
            <p className="text-sm font-semibold text-ink">A thin sample is reported, not refused</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/50">
              The minimum response rate below is a reporting threshold rather than a KPI threshold: it raises no Early
              Warning, it decides whether a study is flagged as thin on the dashboard and on the review page. Lowering it
              makes thin studies read as adequate, so it is set where the department can defend it. A cohort that is hard
              to reach still gets reported, because that is the cohort whose situation most needs reporting.
            </p>
            <label className="mt-3 flex max-w-[160px] flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Minimum response rate</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={alumniConfig.minimumResponseRatePct}
                onChange={(e) => updateAlumniConfig({ minimumResponseRatePct: Number(e.target.value) })}
              />
              <span className="text-[11px] text-ink-soft/40">
                Percent of the cohort that has to be traced before a study is treated as representative. Studies below
                this are flagged, not blocked.
              </span>
            </label>
          </div>

          <CategoryList
            title="Approved employment statuses"
            description="What a traced graduate is doing. The headline economically active rate is derived from this list, so editing it changes what counts as active."
            items={alumniConfig.employmentStatuses.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                employmentStatuses: alumniConfig.employmentStatuses.map((c, i) =>
                  i === index ? (label as AlumniConfig["employmentStatuses"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved tracing methods"
            description="How a graduate was reached. Recorded because the method changes who is easy to find, which is exactly the bias a tracer study has to disclose."
            items={alumniConfig.tracingMethods.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                tracingMethods: alumniConfig.tracingMethods.map((c, i) =>
                  i === index ? (label as AlumniConfig["tracingMethods"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved business sectors"
            description="What sector a traced business operates in, which is what makes the survival rate comparable between cohorts."
            items={alumniConfig.businessSectors.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                businessSectors: alumniConfig.businessSectors.map((c, i) =>
                  i === index ? (label as AlumniConfig["businessSectors"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved crops"
            description="What is grown on a traced farm. Yield per hectare is only comparable between crops if the crop list is closed."
            items={alumniConfig.crops.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                crops: alumniConfig.crops.map((c, i) =>
                  i === index ? (label as AlumniConfig["crops"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved mass units"
            description="The unit a harvest was weighed in. Recorded as measured and never converted, because a converted total is a claim nobody on the farm can check."
            items={alumniConfig.massUnits.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                massUnits: alumniConfig.massUnits.map((c, i) =>
                  i === index ? (label as AlumniConfig["massUnits"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved livestock categories"
            description="Species groups on a traced farm. Used to separate crop yield from livestock output rather than adding unlike quantities together."
            items={alumniConfig.livestockCategories.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                livestockCategories: alumniConfig.livestockCategories.map((c, i) =>
                  i === index ? (label as AlumniConfig["livestockCategories"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved loan statuses"
            description="Where a loan sits. The repayment rate is derived from this list, and In Arrears is deliberately part of it so arrears are recorded rather than avoided."
            items={alumniConfig.loanStatuses.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                loanStatuses: alumniConfig.loanStatuses.map((c, i) =>
                  i === index ? (label as AlumniConfig["loanStatuses"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved referral channels"
            description="How a referred graduate heard about the programme. A closed list keeps referral conversion comparable between cohorts."
            items={alumniConfig.referralChannels.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                referralChannels: alumniConfig.referralChannels.map((c, i) =>
                  i === index ? (label as AlumniConfig["referralChannels"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved referral outcomes"
            description="What a referral became. Only the enrolled outcomes count in the conversion rate, so this list is a policy decision rather than a label list."
            items={alumniConfig.referralOutcomes.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                referralOutcomes: alumniConfig.referralOutcomes.map((c, i) =>
                  i === index ? (label as AlumniConfig["referralOutcomes"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved market types"
            description="The kind of market a graduate sells through. Market participation counts anyone who sold, so this list decides what counts as participating."
            items={alumniConfig.marketTypes.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                marketTypes: alumniConfig.marketTypes.map((c, i) =>
                  i === index ? (label as AlumniConfig["marketTypes"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved sale frequencies"
            description="How often a graduate sells. Separates a one-off cash sale from a trading business, which are very different claims about market participation."
            items={alumniConfig.saleFrequencies.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                saleFrequencies: alumniConfig.saleFrequencies.map((c, i) =>
                  i === index ? (label as AlumniConfig["saleFrequencies"][number]) : c
                ),
              })
            }
          />

          <CategoryList
            title="Approved engagement activities"
            description="What counts as staying engaged. The engagement rate is derived from this list, so widening it raises the rate without anybody doing anything."
            items={alumniConfig.engagementActivities.map((label) => ({ label }))}
            onRename={(index, label) =>
              updateAlumniConfig({
                engagementActivities: alumniConfig.engagementActivities.map((c, i) =>
                  i === index ? (label as AlumniConfig["engagementActivities"][number]) : c
                ),
              })
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          Audit Log <span className="normal-case text-ink-soft/40">- who changed what, and when</span>
        </h2>
        <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
          {auditLog.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft/40">
              Nothing recorded yet. Submissions, threshold changes and due-date overrides are logged here.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Who</th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {[...auditLog].reverse().map((a) => (
                  <tr key={a.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2 text-xs text-ink-soft/50">
                      {new Date(a.timestamp).toLocaleString("en-ZA")}
                    </td>
                    <td className="px-4 py-2 text-ink-soft/70">{a.actor}</td>
                    <td className="px-4 py-2 text-ink-soft/70">{a.department}</td>
                    <td className="px-4 py-2 text-ink-soft/80">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Users &amp; Roles</h2>
        <div className="card-surface overflow-hidden rounded-3xl border border-ink/10 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase text-ink-soft/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_USERS.map((u) => (
                <tr key={u.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2 text-ink">{u.name}</td>
                  <td className="px-4 py-2 text-ink-soft/50">{u.email}</td>
                  <td className="px-4 py-2 capitalize text-ink-soft/70">{u.role.replace("_", " ")}</td>
                  <td className="px-4 py-2 text-ink-soft/70">{u.department ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft/40">
          Board members are not application users - Board reporting is generated from the Executive environment
          instead (see Section 4 of the discovery brief). The Board persona shown elsewhere in this demo predates
          that clarification and is kept only for demonstration purposes.
        </p>
      </section>

      <section className="card-surface rounded-3xl border border-ink/10 p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">Escalation Rules</h2>
        <p className="text-sm text-ink-soft/70">Green → Monitor. Amber → Department Manager + Corrective Action. Red → Executive Management → Board → Immediate Intervention.</p>
        <p className="mt-2 text-xs text-ink-soft/40">
          Escalation recipients are configurable per department in a production build; this demo uses fixed
          role-based routing shown above.
        </p>
      </section>

      <section className="rounded-3xl border border-dashed border-ink/20 bg-white/40 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft/50">
          To Confirm Register <span className="normal-case text-ink-soft/40">- open items, not silently resolved with guesses</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {TO_CONFIRM_REGISTER.map((item, i) => (
            <li key={i} className="text-sm text-ink-soft/70">
              <span className="font-medium text-ink-soft/90">{item.item}</span>
              {item.note && <span className="text-ink-soft/50"> - {item.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
