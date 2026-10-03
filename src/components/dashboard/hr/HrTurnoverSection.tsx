import type { Kpi } from "../../../types";
import {
  DEPARTMENT_OPTIONS,
  HrEmptyRow,
  HrFieldset,
  HrNumberField,
  HrRecordList,
  HrRemoveButton,
  HrSelectField,
  HrSubheading,
  HrTextArea,
  HrTextField,
} from "./HrFields";
import { EXIT_REASONS, type EmploymentType, type ExitRecord, type HrTurnoverData, type NewHire } from "../../../types/hr";
import { calculateTurnoverRate, HR_KPI_IDS, summariseExits } from "../../../data/hrEngine";
import { HrNotApplicableToggle, HrWarningPreview } from "./HrSectionChrome";

const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["Permanent", "Contract", "Part-time", "Intern", "Learner"];

/**
 * Section 4 - Turnover / employee movements.
 *
 * Movements are captured per employee, by employee code (Section 26), and the
 * turnover rate is derived - HR never types the percentage (Sections 10/11).
 */
export function HrTurnoverSection({
  data,
  kpis,
  onChange,
}: {
  data: HrTurnoverData;
  kpis: Kpi[];
  onChange: (data: HrTurnoverData) => void;
}) {
  const turnoverKpi = kpis.find((k) => k.id === HR_KPI_IDS.turnover);
  const rate = calculateTurnoverRate(data, null);
  const summary = summariseExits(data);

  const addHire = () =>
    onChange({
      ...data,
      newHires: [
        ...data.newHires,
        { employeeCode: "", department: "Human Resources", position: "", startDate: "", employmentType: "Permanent" },
      ],
    });
  const addExit = () =>
    onChange({
      ...data,
      exits: [
        ...data.exits,
        {
          employeeCode: "",
          department: "Human Resources",
          position: "",
          exitDate: "",
          reason: "Resignation",
          exitInterviewCompleted: false,
        },
      ],
    });

  if (data.notApplicable) {
    return (
      <div className="flex flex-col gap-4">
        <HrNotApplicableToggle checked onChange={(v) => onChange({ ...data, notApplicable: v })} what="Turnover reporting" />
        <p className="text-sm text-ink-soft/50">
          Turnover is marked Not Applicable for this period, so no turnover rate will be calculated or reported.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HrNotApplicableToggle
        checked={data.notApplicable}
        onChange={(v) => onChange({ ...data, notApplicable: v })}
        what="Turnover reporting"
      />

      <HrFieldset
        title="Headcount basis"
        description="Average headcount is the denominator for the turnover rate. Without it the rate cannot be derived."
      >
        <HrNumberField
          label="Average headcount for period"
          value={data.averageHeadcount}
          onChange={(v) => onChange({ ...data, averageHeadcount: v })}
          min={1}
        />
      </HrFieldset>

      <HrRecordList title="New employees" addLabel="Add new employee" onAdd={addHire}>
        {data.newHires.length === 0 ? (
          <HrEmptyRow text="No new employees recorded this period." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.newHires.map((hire, i) => (
              <NewHireRow
                key={i}
                hire={hire}
                onChange={(next) =>
                  onChange({ ...data, newHires: data.newHires.map((h, j) => (j === i ? next : h)) })
                }
                onRemove={() => onChange({ ...data, newHires: data.newHires.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </HrRecordList>

      <HrRecordList title="Employee exits" addLabel="Add exit" onAdd={addExit}>
        {data.exits.length === 0 ? (
          <HrEmptyRow text="No exits recorded this period." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.exits.map((exit, i) => (
              <ExitRow
                key={i}
                exit={exit}
                onChange={(next) => onChange({ ...data, exits: data.exits.map((e, j) => (j === i ? next : e)) })}
                onRemove={() => onChange({ ...data, exits: data.exits.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </HrRecordList>

      <HrFieldset title="Calculated movement" description="Derived by the engine from the records above.">
        <HrSubheading>Movement summary</HrSubheading>
        <ReadOnlyStat label="Turnover rate" value={rate} suffix="%" fallback="Needs average headcount" />
        <ReadOnlyStat label="New hires" value={summary.newHires} />
        <ReadOnlyStat label="Exits" value={summary.total} />
        <ReadOnlyStat label="Net change" value={summary.netChange} />
        <ReadOnlyStat label="Voluntary exits" value={summary.voluntary} />
        <ReadOnlyStat label="Involuntary exits" value={summary.involuntary} />
        <ReadOnlyStat
          label="Exit interviews completed"
          value={summary.exitInterviewsCompleted}
          suffix={`/ ${summary.total}`}
          fallback="No exits"
        />
      </HrFieldset>

      <HrFieldset title="Turnover commentary">
        <div className="col-span-full">
          <HrTextArea
            label="Turnover Commentary"
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            placeholder="Explain the drivers behind any exits, and the net effect on capacity."
          />
        </div>
      </HrFieldset>

      <HrWarningPreview
        items={[
          {
            kpi: turnoverKpi,
            value: rate,
            emptyNote: "Enter average headcount and at least the movement records.",
          },
        ]}
      />
    </div>
  );
}

function NewHireRow({
  hire,
  onChange,
  onRemove,
}: {
  hire: NewHire;
  onChange: (next: NewHire) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-ink/[0.03] p-3 sm:flex-row sm:items-end">
      <HrTextField
        label="Employee code"
        value={hire.employeeCode}
        onChange={(v) => onChange({ ...hire, employeeCode: v })}
        required
      />
      <HrSelectField
        label="Department"
        value={hire.department}
        options={DEPARTMENT_OPTIONS}
        onChange={(v) => onChange({ ...hire, department: v })}
      />
      <HrTextField label="Position" value={hire.position} onChange={(v) => onChange({ ...hire, position: v })} />
      <HrTextField label="Start date" type="date" value={hire.startDate} onChange={(v) => onChange({ ...hire, startDate: v })} required />
      <HrSelectField
        label="Employment type"
        value={hire.employmentType}
        options={EMPLOYMENT_TYPES}
        onChange={(v) => onChange({ ...hire, employmentType: v })}
      />
      <HrRemoveButton onClick={onRemove} label="Remove new employee" />
    </div>
  );
}

function ExitRow({
  exit,
  onChange,
  onRemove,
}: {
  exit: ExitRecord;
  onChange: (next: ExitRecord) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-ink/[0.03] p-3 sm:flex-row sm:items-end">
      <HrTextField
        label="Employee code"
        value={exit.employeeCode}
        onChange={(v) => onChange({ ...exit, employeeCode: v })}
        required
      />
      <HrSelectField
        label="Department"
        value={exit.department}
        options={DEPARTMENT_OPTIONS}
        onChange={(v) => onChange({ ...exit, department: v })}
      />
      <HrTextField label="Position" value={exit.position} onChange={(v) => onChange({ ...exit, position: v })} />
      <HrTextField label="Exit date" type="date" value={exit.exitDate} onChange={(v) => onChange({ ...exit, exitDate: v })} required />
      <HrSelectField
        label="Exit reason"
        value={exit.reason}
        options={EXIT_REASONS}
        onChange={(v) => onChange({ ...exit, reason: v })}
      />
      <label className="flex items-center gap-2 pb-2">
        <input
          type="checkbox"
          checked={exit.exitInterviewCompleted}
          onChange={(e) => onChange({ ...exit, exitInterviewCompleted: e.target.checked })}
          className="h-4 w-4 rounded border-ink/20 accent-ink"
        />
        <span className="text-xs text-ink-soft/60">Exit interview done</span>
      </label>
      <HrRemoveButton onClick={onRemove} label="Remove exit" />
    </div>
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
        {value === null ? (
          <span className="text-sm font-normal text-ink-soft/40">{fallback ?? "Not available"}</span>
        ) : (
          `${value}${suffix ?? ""}`
        )}
      </span>
    </div>
  );
}