import type { Kpi } from "../../../types";
import {
  DEPARTMENT_OPTIONS,
  HrEmptyRow,
  HrFieldset,
  HrNumberField,
  HrRecordList,
  HrRemoveButton,
  HrSelectField,
  HrTextArea,
  HrTextField,
} from "./HrFields";
import type {
  HrSkillsData,
  SkillPriority,
  SkillsGap,
  TrainingProgramme,
  TrainingStatus,
} from "../../../types/hr";
import { calculateTrainingCompletion, HR_KPI_IDS } from "../../../data/hrEngine";
import { HrNotApplicableToggle, HrWarningPreview } from "./HrSectionChrome";

const STATUSES: readonly TrainingStatus[] = ["Planned", "In Progress", "Completed", "Cancelled"];
const PRIORITIES: readonly SkillPriority[] = ["Low", "Medium", "High", "Critical"];

/**
 * Section 5 - Skills & Training. Completion rate is derived across programmes;
 * skills gaps and overdue programmes feed the EWS notes (Section 12/13).
 */
export function HrSkillsSection({
  data,
  kpis,
  onChange,
}: {
  data: HrSkillsData;
  kpis: Kpi[];
  onChange: (data: HrSkillsData) => void;
}) {
  const trainingKpi = kpis.find((k) => k.id === HR_KPI_IDS.trainingCompletion);
  const completion = calculateTrainingCompletion(data);

  const addProgramme = () =>
    onChange({
      ...data,
      programmes: [
        ...data.programmes,
        {
          id: `prog-${Date.now()}-${data.programmes.length}`,
          programme: "",
          provider: "",
          enrolled: null,
          completed: null,
          startDate: "",
          completionDate: "",
          status: "Planned",
        },
      ],
    });

  const addGap = () =>
    onChange({
      ...data,
      gaps: [
        ...data.gaps,
        {
          id: `gap-${Date.now()}-${data.gaps.length}`,
          department: "Human Resources",
          role: "",
          requiredSkill: "",
          currentLevel: "",
          requiredLevel: "",
          priority: "Medium",
          developmentAction: "",
          owner: "",
          targetDate: "",
        },
      ],
    });

  if (data.notApplicable) {
    return (
      <div className="flex flex-col gap-4">
        <HrNotApplicableToggle checked onChange={(v) => onChange({ ...data, notApplicable: v })} what="Skills and training reporting" />
        <p className="text-sm text-ink-soft/50">
          Skills and training is marked Not Applicable for this period, so no training figures will be reported.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HrNotApplicableToggle
        checked={data.notApplicable}
        onChange={(v) => onChange({ ...data, notApplicable: v })}
        what="Skills and training reporting"
      />

      <HrFieldset title="Skills development">
        <HrNumberField
          label="Employees requiring training"
          value={data.employeesRequiringTraining}
          onChange={(v) => onChange({ ...data, employeesRequiringTraining: v })}
        />
      </HrFieldset>

      <HrRecordList
        title="Training programmes"
        addLabel="Add programme"
        onAdd={addProgramme}
      >
        {data.programmes.length === 0 ? (
          <HrEmptyRow text="No training programmes recorded this period." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.programmes.map((p, i) => (
              <ProgrammeRow
                key={p.id}
                programme={p}
                onChange={(next) =>
                  onChange({ ...data, programmes: data.programmes.map((x, j) => (j === i ? next : x)) })
                }
                onRemove={() => onChange({ ...data, programmes: data.programmes.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </HrRecordList>

      {completion && (
        <HrFieldset title="Calculated outcomes" description="Derived by the engine from the programmes above.">
          <ReadOnlyStat label="Total enrolled" value={completion.totalEnrolled} />
          <ReadOnlyStat label="Total completed" value={completion.totalCompleted} />
          <ReadOnlyStat label="Completion rate" value={completion.completionPct} suffix="%" />
          <ReadOnlyStat label="Programmes in progress" value={completion.inProgress} />
          <ReadOnlyStat label="Critical skills gaps" value={completion.criticalGaps} />
          <ReadOnlyStat
            label="Gaps without a development plan"
            value={completion.gapsWithoutPlan}
            fallback="None"
          />
        </HrFieldset>
      )}

      {completion && completion.overdueProgrammes.length > 0 && (
        <div className="rounded-2xl border border-butter-dark/40 bg-butter/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/60">Overdue training</p>
          <ul className="mt-2 flex flex-col gap-1">
            {completion.overdueProgrammes.map((o) => (
              <li key={o.programme} className="text-xs text-ink-soft/70">
                <span className="font-medium text-ink">{o.programme}</span> · {o.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <HrRecordList title="Skills gaps" addLabel="Add gap" onAdd={addGap}>
        {data.gaps.length === 0 ? (
          <HrEmptyRow text="No skills gaps recorded this period." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.gaps.map((g, i) => (
              <GapRow
                key={g.id}
                gap={g}
                onChange={(next) => onChange({ ...data, gaps: data.gaps.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => onChange({ ...data, gaps: data.gaps.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </HrRecordList>

      <HrFieldset title="Skills commentary">
        <div className="col-span-full">
          <HrTextArea
            label="Skills Commentary"
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            placeholder="Note priority skills gaps, funding constraints, or provider issues."
          />
        </div>
      </HrFieldset>

      <HrWarningPreview
        items={[
          {
            kpi: trainingKpi,
            value: completion?.completionPct ?? null,
            emptyNote: "Add at least one programme with an enrolled count.",
          },
        ]}
      />
      <p className="text-[11px] leading-relaxed text-ink-soft/40">
        Training warning thresholds (minimum completion rate, overdue programme limit) are not configured yet, so
        no automatic warning is raised for them (Section 13).
      </p>
    </div>
  );
}

function ProgrammeRow({
  programme,
  onChange,
  onRemove,
}: {
  programme: TrainingProgramme;
  onChange: (next: TrainingProgramme) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl bg-ink/[0.03] p-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <HrTextField
          label="Programme"
          value={programme.programme}
          onChange={(v) => onChange({ ...programme, programme: v })}
          required
        />
      </div>
      <HrTextField
        label="Provider"
        value={programme.provider}
        onChange={(v) => onChange({ ...programme, provider: v })}
      />
      <HrSelectField
        label="Status"
        value={programme.status}
        options={STATUSES}
        onChange={(v) => onChange({ ...programme, status: v })}
      />
      <HrNumberField
        label="Enrolled"
        value={programme.enrolled}
        onChange={(v) => onChange({ ...programme, enrolled: v })}
        min={0}
      />
      <HrNumberField
        label="Completed"
        value={programme.completed}
        onChange={(v) => onChange({ ...programme, completed: v })}
        min={0}
      />
      <HrTextField
        label="Start date"
        type="date"
        value={programme.startDate}
        onChange={(v) => onChange({ ...programme, startDate: v })}
      />
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <HrTextField
            label="Completion date"
            type="date"
            value={programme.completionDate}
            onChange={(v) => onChange({ ...programme, completionDate: v })}
          />
        </div>
        <HrRemoveButton onClick={onRemove} label="Remove programme" />
      </div>
    </div>
  );
}

function GapRow({
  gap,
  onChange,
  onRemove,
}: {
  gap: SkillsGap;
  onChange: (next: SkillsGap) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl bg-ink/[0.03] p-3 sm:grid-cols-2 lg:grid-cols-4">
      <HrSelectField
        label="Department"
        value={gap.department}
        options={DEPARTMENT_OPTIONS}
        onChange={(v) => onChange({ ...gap, department: v })}
        required
      />
      <HrTextField label="Role" value={gap.role} onChange={(v) => onChange({ ...gap, role: v })} />
      <HrTextField
        label="Required skill"
        value={gap.requiredSkill}
        onChange={(v) => onChange({ ...gap, requiredSkill: v })}
        required
      />
      <HrTextField label="Current level" value={gap.currentLevel} onChange={(v) => onChange({ ...gap, currentLevel: v })} />
      <HrTextField
        label="Required level"
        value={gap.requiredLevel}
        onChange={(v) => onChange({ ...gap, requiredLevel: v })}
      />
      <HrSelectField
        label="Priority"
        value={gap.priority}
        options={PRIORITIES}
        onChange={(v) => onChange({ ...gap, priority: v })}
      />
      <div className="sm:col-span-2">
        <HrTextField
          label="Development action"
          value={gap.developmentAction}
          onChange={(v) => onChange({ ...gap, developmentAction: v })}
          hint="Leave blank to flag this gap as having no development plan."
        />
      </div>
      <HrTextField label="Owner" value={gap.owner} onChange={(v) => onChange({ ...gap, owner: v })} />
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <HrTextField
            label="Target completion"
            type="date"
            value={gap.targetDate}
            onChange={(v) => onChange({ ...gap, targetDate: v })}
          />
        </div>
        <HrRemoveButton onClick={onRemove} label="Remove skills gap" />
      </div>
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