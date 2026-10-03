import type { Kpi } from "../../../types";
import type { HrPerformanceData } from "../../../types/hr";
import { calculatePerformanceMetrics, HR_KPI_IDS } from "../../../data/hrEngine";
import { HrFieldset, HrNumberField, HrTextArea, HrTextField, HrCheckbox, HrSubheading } from "./HrFields";
import { HrNotAvailableNotice, HrWarningPreview } from "./HrSectionChrome";

/**
 * Section 3 - Performance.
 *
 * Sections 8, 9 and test 5 are unambiguous: Staff Performance cannot be
 * reported until a formal performance-management system exists. So this section
 * has exactly two modes. While the system is inactive it states that plainly and
 * captures nothing - it does not offer fields, because a half-filled form is how
 * a proxy figure ends up being reported as if it were real. Once an
 * administrator switches the system on, the fields appear and the engine derives
 * the review completion rate.
 */
export function HrPerformanceSection({
  data,
  kpis,
  onChange,
}: {
  data: HrPerformanceData;
  kpis: Kpi[];
  onChange: (data: HrPerformanceData) => void;
}) {
  const set = <K extends keyof HrPerformanceData>(key: K, value: HrPerformanceData[K]) =>
    onChange({ ...data, [key]: value });

  const performanceKpi = kpis.find((k) => k.id === HR_KPI_IDS.performance);
  const completion = calculatePerformanceMetrics(data);

  if (!data.systemActive) {
    return (
      <div className="flex flex-col gap-4">
        <HrNotAvailableNotice
          title="Performance Management System Not Yet Active"
          reason="Buhle has not yet introduced a formal performance-management process, so Staff Performance cannot be reported. No figure is calculated, and the Staff Performance KPI shows &quot;Not Yet Available&quot; across the HR and Executive dashboards rather than a fabricated result. This section will activate automatically once an administrator enables the system in Administration → HR Configuration."
        />
        <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
          <HrTextArea
            label="Performance-management notes (optional)"
            value={data.commentary}
            onChange={(v) => set("commentary", v)}
            placeholder="Record progress towards a performance-management process - e.g. policy drafted, line-manager training planned."
            hint="Stored with the submission for audit, but not used in any KPI."
          />
        </div>
        <HrWarningPreview
          items={[
            {
              kpi: performanceKpi,
              value: null,
              emptyNote: "No performance-management data source exists - status is Not Yet Available, not Green.",
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
        Performance-management system is active. Review figures captured below will be reported.
      </div>

      <HrFieldset title="Review progress">
        <HrNumberField
          label="Employees due for review"
          value={data.dueForReview}
          onChange={(v) => set("dueForReview", v)}
          required
        />
        <HrNumberField
          label="Reviews completed"
          value={data.reviewsCompleted}
          onChange={(v) => set("reviewsCompleted", v)}
          required
        />
        <HrNumberField
          label="Reviews outstanding"
          value={data.reviewsOutstanding}
          onChange={(v) => set("reviewsOutstanding", v)}
          hint={
            data.dueForReview !== null && data.reviewsCompleted !== null
              ? `Derived: ${data.dueForReview - data.reviewsCompleted}`
              : undefined
          }
        />
      </HrFieldset>

      <HrFieldset title="Review outcomes">
        <HrNumberField
          label="Meeting expectations"
          value={data.meetingExpectations}
          onChange={(v) => set("meetingExpectations", v)}
        />
        <HrNumberField
          label="Requiring development"
          value={data.requiringDevelopment}
          onChange={(v) => set("requiringDevelopment", v)}
        />
        <HrNumberField
          label="Requiring performance intervention"
          value={data.requiringIntervention}
          onChange={(v) => set("requiringIntervention", v)}
        />
        <HrTextField
          label="Performance review period"
          value={data.reviewPeriod}
          onChange={(v) => set("reviewPeriod", v)}
          placeholder="e.g. Q3 2026"
          required
        />
        <HrTextField
          label="Review status"
          value={data.reviewStatus}
          onChange={(v) => set("reviewStatus", v)}
          placeholder="e.g. In progress"
        />
        <div className="flex items-end">
          <HrCheckbox
            label="Follow-up required"
            checked={data.followUpRequired}
            onChange={(v) => set("followUpRequired", v)}
          />
        </div>
      </HrFieldset>

      <HrFieldset title="Performance commentary">
        <HrSubheading className="sr-only">Commentary</HrSubheading>
        <div className="col-span-full">
          <HrTextArea
            label="HR commentary"
            value={data.commentary}
            onChange={(v) => set("commentary", v)}
            placeholder="Note review progress, development plans in progress, or cases needing intervention."
          />
        </div>
      </HrFieldset>

      <HrWarningPreview
        items={[
          {
            kpi: performanceKpi,
            value: completion,
            emptyNote: "Enter employees due for review and reviews completed.",
          },
        ]}
      />
      <p className="text-[11px] leading-relaxed text-ink-soft/40">
        Performance warning thresholds (overdue reviews, low completion, intervention caseload) are not configured
        yet, so this KPI is reported for monitoring only until they are approved (Section 9).
      </p>
    </div>
  );
}