import type { Kpi } from "../../../types";
import { LEAVE_TYPES, type HrLeaveData, type LeaveType } from "../../../types/hr";
import { calculateLeaveUtilisation, HR_KPI_IDS } from "../../../data/hrEngine";
import { HrFieldset, HrNumberField, HrTextArea, HrSubheading } from "./HrFields";
import { HrNotApplicableToggle, HrWarningPreview } from "./HrSectionChrome";

/**
 * Section 2 - Leave. Utilisation is summarised from the underlying leave
 * records rather than asking HR for a percentage (Section 6).
 */
export function HrLeaveSection({
  data,
  kpis,
  onChange,
}: {
  data: HrLeaveData;
  kpis: Kpi[];
  onChange: (data: HrLeaveData) => void;
}) {
  const set = <K extends keyof HrLeaveData>(key: K, value: HrLeaveData[K]) => onChange({ ...data, [key]: value });
  const setLine = (type: LeaveType, key: "employees" | "days" | "previousPeriodDays", value: number | null) =>
    set("lines", { ...data.lines, [type]: { ...data.lines[type], [key]: value } });

  const utilisation = calculateLeaveUtilisation(data);
  const leaveKpi = kpis.find((k) => k.id === HR_KPI_IDS.leaveUtilisation);

  if (data.notApplicable) {
    return (
      <div className="flex flex-col gap-4">
        <HrNotApplicableToggle checked onChange={(v) => set("notApplicable", v)} what="Leave reporting" />
        <p className="text-sm text-ink-soft/50">
          Leave is marked Not Applicable for this period, so no leave figures will be calculated or reported.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HrNotApplicableToggle checked={data.notApplicable} onChange={(v) => set("notApplicable", v)} what="Leave reporting" />

      <HrFieldset
        title="Leave summary"
        description="Employees and days per leave type, with the previous period for comparison."
      >
        {LEAVE_TYPES.map((type) => (
          <LeaveTypeRow
            key={type}
            type={type}
            line={data.lines[type]}
            onChange={(key, value) => setLine(type, key, value)}
          />
        ))}
      </HrFieldset>

      <HrFieldset
        title="Leave requests"
        description="Approved + pending + declined must equal requests submitted."
      >
        <HrNumberField
          label="Leave requests submitted"
          value={data.requestsSubmitted}
          onChange={(v) => set("requestsSubmitted", v)}
        />
        <HrNumberField label="Approved" value={data.requestsApproved} onChange={(v) => set("requestsApproved", v)} />
        <HrNumberField label="Pending" value={data.requestsPending} onChange={(v) => set("requestsPending", v)} />
        <HrNumberField label="Declined" value={data.requestsDeclined} onChange={(v) => set("requestsDeclined", v)} />
      </HrFieldset>

      {utilisation && (
        <HrFieldset title="Calculated utilisation" description="Derived by the engine - not entered by hand.">
          <HrSubheading>Leave indicators</HrSubheading>
          <ReadOnlyStat label="Total leave days" value={utilisation.totalDays} />
          <ReadOnlyStat label="Annual leave days" value={utilisation.annualLeaveDays} />
          <ReadOnlyStat label="Sick leave days" value={utilisation.sickLeaveDays} />
          <ReadOnlyStat label="Sick share of leave" value={utilisation.sickSharePct} suffix="%" />
          <ReadOnlyStat
            label="Change vs previous period"
            value={utilisation.periodChangePct}
            suffix="%"
            fallback="No previous period supplied"
          />
          <ReadOnlyStat label="Pending requests" value={utilisation.pendingRequests} />
        </HrFieldset>
      )}

      <HrFieldset title="Leave commentary">
        <div className="col-span-full">
          <HrTextArea
            label="Leave Commentary"
            value={data.commentary}
            onChange={(v) => set("commentary", v)}
            placeholder="Note any unusual sick-leave trend, backlog in approvals, or capacity impact."
          />
        </div>
      </HrFieldset>

      <HrWarningPreview
        items={[
          {
            kpi: leaveKpi,
            value: utilisation?.totalDays ?? null,
            emptyNote: "Enter leave days for at least one leave type.",
          },
        ]}
      />
      <p className="text-[11px] leading-relaxed text-ink-soft/40">
        No approved threshold exists for leave days or sick-leave trends, so no automatic warning is generated for
        them (Section 7). Utilisation is shown for monitoring only until HR management approves limits.
      </p>
    </div>
  );
}

function LeaveTypeRow({
  type,
  line,
  onChange,
}: {
  type: LeaveType;
  line: { employees: number | null; days: number | null; previousPeriodDays: number | null };
  onChange: (key: "employees" | "days" | "previousPeriodDays", value: number | null) => void;
}) {
  return (
    <>
      <HrSubheading className="text-ink-soft/70">{type}</HrSubheading>
      {/* The leave type is part of each label: five rows share these three
          fields, and an unlabelled repeat would be ambiguous to anyone using
          a screen reader as well as to the test suite. */}
      <HrNumberField
        label={`${type} - employees`}
        value={line.employees}
        onChange={(v) => onChange("employees", v)}
        min={0}
      />
      <HrNumberField label={`${type} - days taken`} value={line.days} onChange={(v) => onChange("days", v)} min={0} />
      <HrNumberField
        label={`${type} - previous period days`}
        value={line.previousPeriodDays}
        onChange={(v) => onChange("previousPeriodDays", v)}
        min={0}
      />
    </>
  );
}

function ReadOnlyStat({
  label,
  value,
  suffix,
  fallback,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  fallback?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-ink-soft/60">{label}</span>
      <span className="text-lg font-bold text-ink">
        {value === null ? <span className="text-sm font-normal text-ink-soft/40">{fallback ?? "Not available"}</span> : `${value}${suffix ?? ""}`}
      </span>
    </div>
  );
}