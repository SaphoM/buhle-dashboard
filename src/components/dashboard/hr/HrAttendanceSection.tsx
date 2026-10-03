import type { Kpi } from "../../../types";
import type { HrAttendanceData } from "../../../types/hr";
import { calculateAbsenteeismRate, deriveTotalAbsenceDays, HR_KPI_IDS } from "../../../data/hrEngine";
import { HrFieldset, HrNumberField, HrTextArea, HrSubheading } from "./HrFields";
import { HrNotApplicableToggle, HrWarningPreview } from "./HrSectionChrome";

/**
 * Section 1 - Attendance. Captures raw day counts only; the absenteeism rate is
 * calculated by the engine and shown live, so HR never types a percentage they
 * could get wrong (Section 4).
 */
export function HrAttendanceSection({
  data,
  kpis,
  standardWorkingDays,
  onChange,
}: {
  data: HrAttendanceData;
  kpis: Kpi[];
  standardWorkingDays: number;
  onChange: (data: HrAttendanceData) => void;
}) {
  const set = <K extends keyof HrAttendanceData>(key: K, value: HrAttendanceData[K]) =>
    onChange({ ...data, [key]: value });

  const rate = calculateAbsenteeismRate(data, standardWorkingDays);
  const absent = deriveTotalAbsenceDays(data);
  const absenteeismKpi = kpis.find((k) => k.id === HR_KPI_IDS.absenteeism);

  if (data.notApplicable) {
    return (
      <div className="flex flex-col gap-4">
        <HrNotApplicableToggle checked onChange={(v) => set("notApplicable", v)} what="Attendance reporting" />
        <p className="text-sm text-ink-soft/50">
          Attendance is marked Not Applicable for this period, so no absenteeism figure will be calculated or
          reported.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HrNotApplicableToggle
        checked={data.notApplicable}
        onChange={(v) => set("notApplicable", v)}
        what="Attendance reporting"
      />

      <HrFieldset title="Workforce snapshot">
        <HrNumberField label="Total employees" value={data.totalEmployees} onChange={(v) => set("totalEmployees", v)} />
        <HrNumberField
          label="Active employees"
          value={data.activeEmployees}
          onChange={(v) => set("activeEmployees", v)}
          required
        />
        <HrNumberField label="New employees during period" value={data.newEmployees} onChange={(v) => set("newEmployees", v)} />
        <HrNumberField
          label="Employees who left during period"
          value={data.employeesLeft}
          onChange={(v) => set("employeesLeft", v)}
        />
      </HrFieldset>

      <HrFieldset
        title="Attendance"
        description="Enter the day counts. Expected employee-days can be left blank - it is derived from active employees × working days if omitted."
      >
        <HrNumberField
          label="Working days in period"
          value={data.workingDays}
          onChange={(v) => set("workingDays", v)}
          required
        />
        <HrNumberField
          label="Total expected employee-days"
          value={data.expectedEmployeeDays}
          onChange={(v) => set("expectedEmployeeDays", v)}
          hint={`Derived: ${data.activeEmployees ?? "?"} × ${data.workingDays ?? standardWorkingDays}`}
        />
        <HrNumberField label="Days present" value={data.daysPresent} onChange={(v) => set("daysPresent", v)} />
        <HrSubheading>Absence breakdown</HrSubheading>
        <HrNumberField
          label="Days absent (total)"
          value={data.daysAbsent}
          onChange={(v) => set("daysAbsent", v)}
          required
          hint={absent !== null ? `Total absence days: ${absent}` : "Required, or supply its components below"}
        />
        <HrNumberField
          label="Days absent with approved reason"
          value={data.daysAbsentApproved}
          onChange={(v) => set("daysAbsentApproved", v)}
        />
        <HrNumberField
          label="Days absent without approved reason"
          value={data.daysAbsentUnapproved}
          onChange={(v) => set("daysAbsentUnapproved", v)}
        />
        <HrNumberField label="Sick leave days" value={data.sickLeaveDays} onChange={(v) => set("sickLeaveDays", v)} />
        <HrNumberField
          label="Unauthorised absence days"
          value={data.unauthorisedAbsenceDays}
          onChange={(v) => set("unauthorisedAbsenceDays", v)}
        />
      </HrFieldset>

      <HrFieldset title="Attendance commentary">
        <div className="col-span-full">
          <HrTextArea
            label="Attendance Commentary"
            value={data.commentary}
            onChange={(v) => set("commentary", v)}
            placeholder="Explain any unusual absence pattern, outbreak, or change in the register process."
            hint="Free text - not used in any calculation."
          />
        </div>
      </HrFieldset>

      <HrWarningPreview
        items={[
          {
            kpi: absenteeismKpi,
            value: rate,
            emptyNote:
              absenteeismKpi?.dataAvailable === false
                ? "Register not digitised yet - submitting here will make this reportable."
                : "Enter absence days and working days to calculate.",
          },
        ]}
      />
    </div>
  );
}