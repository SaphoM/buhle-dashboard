import {
  OpsCheckbox,
  OpsFieldset,
  OpsNumberField,
  OpsReadout,
  OpsRecordTable,
  OpsSelectField,
  OpsTextArea,
  OpsTextField,
} from "./OperationsFields";
import {
  OperationsNoDataNote,
  OperationsNotApplicableToggle,
  OperationsSourceTag,
  OperationsWarningPreview,
} from "./OperationsSectionChrome";
import type { Kpi } from "../../../types";
import type {
  AssetRecord,
  AssetStatus,
  AttendanceRecord,
  CompletionOutcome,
  CompletionRecord,
  DeliveryMode,
  DropoutReasonCategory,
  DropoutRecord,
  EnrolmentRecord,
  EnrolmentStatus,
  OperationsAttendanceData,
  OperationsAssetsData,
  OperationsCompletionData,
  OperationsConfig,
  OperationsDropoutsData,
  OperationsEnrolmentData,
  OperationsProjectsData,
  OperationsReport,
  OperationsTrainingData,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  TrainingRecord,
} from "../../../types/operations";
import {
  summariseAssets,
  summariseAttendance,
  summariseCompletion,
  summariseDropouts,
  summariseEnrolment,
  summariseProjects,
  summariseTraining,
  PROJECT_REVIEW_STALE_DAYS,
} from "../../../data/operationsEngine";
import {
  blankAssetRecord,
  blankAttendanceRecord,
  blankCompletionRecord,
  blankDropoutRecord,
  blankEnrolmentRecord,
  blankProjectRecord,
  blankTrainingRecord,
  OPERATIONS_KPI_IDS,
} from "../../../data/operationsSeed";

/**
 * The seven Operations reporting areas.
 *
 * Each component does three things and nothing else: render the register, hand
 * edits upward, and display what the engine derived. No component computes a
 * rate, formats a verdict, or holds its own copy of a rule. Every figure below a
 * table is read from the same summarise function that the KPI pipeline uses, so
 * what a manager sees while typing is what the board is shown afterwards.
 */

const pct = (v: number | null) => (v === null ? "Not derivable yet" : `${v.toFixed(1)}%`);
const count = (v: number | null) => (v === null ? "None recorded" : v.toLocaleString("en-ZA"));

function Commentary({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <OpsTextArea
      label="Section commentary"
      value={value}
      onChange={onChange}
      hint={hint}
      rows={2}
      placeholder="What a reader needs to know about this period"
    />
  );
}

// ---------------------------------------------------------------------------
// Section 6 - Enrolment
// ---------------------------------------------------------------------------

export function EnrolmentSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsEnrolmentData;
  onChange: (data: OperationsEnrolmentData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseEnrolment(report);
  const update = (id: string, patch: Partial<EnrolmentRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Enrolment reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Enrolment"
          reason="Marked Not Applicable. No enrolment KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Register (typed)"
            description="One row per registration. Status is what decides whether a learner counts as active, so it is required rather than assumed."
          >
            <OpsRecordTable<EnrolmentRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankEnrolmentRecord(), id: uid() }] })}
              addLabel="Add registration"
              emptyText="No registrations yet. Every KPI in this section is derived from this table."
              columns={[
                {
                  key: "learner",
                  label: "Learner",
                  render: (row, patch) => (
                    <OpsTextField label="Learner" required value={row.learner} onChange={(v) => patch({ learner: v } as never)} />
                  ),
                },
                {
                  key: "course",
                  label: "Course",
                  required: true,
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Course"
                      required
                      value={row.course}
                      options={config.programmes}
                      onChange={(v) => patch({ course: v } as never)}
                      blankLabel="Choose a programme"
                    />
                  ),
                },
                {
                  key: "cohort",
                  label: "Cohort",
                  render: (row, patch) => (
                    <OpsTextField label="Cohort" value={row.cohort} onChange={(v) => patch({ cohort: v } as never)} placeholder="2026 Intake A" />
                  ),
                },
                {
                  key: "registrationDate",
                  label: "Registration date",
                  required: true,
                  render: (row, patch) => (
                    <OpsTextField
                      label="Registration date"
                      required
                      type="date"
                      value={row.registrationDate}
                      onChange={(v) => patch({ registrationDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  required: true,
                  render: (row, patch) => (
                    <OpsSelectField<EnrolmentStatus>
                      label="Status"
                      required
                      value={row.status}
                      options={["Enrolled", "In Progress", "Waitlisted", "Withdrawn", "Completed"]}
                      onChange={(v) => patch({ status: v } as never)}
                      blankLabel="Not stated"
                      hint="Unstated status is not counted as active"
                    />
                  ),
                },
                {
                  key: "fundingSource",
                  label: "Funding source",
                  render: (row, patch) => (
                    <OpsTextField label="Funding source" value={row.fundingSource} onChange={(v) => patch({ fundingSource: v } as never)} />
                  ),
                },
                {
                  key: "facilitator",
                  label: "Facilitator",
                  render: (row, patch) => (
                    <OpsTextField label="Facilitator" value={row.facilitator} onChange={(v) => patch({ facilitator: v } as never)} />
                  ),
                },
                {
                  key: "isNewThisPeriod",
                  label: "New this period",
                  render: (row, patch) => (
                    <OpsCheckbox
                      label="New this period"
                      checked={row.isNewThisPeriod}
                      onChange={(v) => patch({ isNewThisPeriod: v } as never)}
                      hint="Distinguishes growth from a static register"
                    />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from this register" description="Calculated by the Operations engine. Never typed.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout label="Active learners" value={count(summary?.active ?? null)} hint="Enrolled or In Progress" />
              <OpsReadout label="New this period" value={count(summary?.newThisPeriod ?? null)} />
              <OpsReadout label="On register" value={count(summary?.totalOnRegister ?? null)} />
              <OpsReadout
                label="Waitlisted"
                value={count(summary?.waitlisted ?? null)}
                hint="On the register, not training"
              />
            </div>
            {summary && summary.byCourse.length > 0 && (
              <p className="mt-2 text-[11px] text-ink-soft/50">
                By course: {summary.byCourse.map((c) => `${c.course} ${c.active}`).join(" · ")}
              </p>
            )}
            {summary && summary.duplicateLearners.length > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Duplicate registrations found for {summary.duplicateLearners.join(", ")}. A re-enrolment belongs in
                Dropouts, not twice on this register.
              </p>
            )}
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.enrolment),
                value: summary?.active ?? null,
                emptyNote: "No registrations recorded, so active enrolment cannot be derived.",
              },
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.newEnrolments),
                value: summary?.newThisPeriod ?? null,
                emptyNote: "No registrations recorded, so new enrolments cannot be derived.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Anything a reader needs about this cohort that the register does not show."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 7 - Attendance
// ---------------------------------------------------------------------------

export function AttendanceSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsAttendanceData;
  onChange: (data: OperationsAttendanceData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseAttendance(report, config);
  const update = (id: string, patch: Partial<AttendanceRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Attendance reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Attendance"
          reason="Marked Not Applicable. No attendance KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Session register (typed)"
            description="Counts only. There is no attendance percentage input: the rate is calculated from these rows, because a typed rate and the register behind it can disagree."
          >
            <OpsRecordTable<AttendanceRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankAttendanceRecord(), id: uid() }] })}
              addLabel="Add session"
              emptyText="No sessions recorded. Attendance rate and sessions delivered both come from this table."
              columns={[
                {
                  key: "course",
                  label: "Course",
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Course"
                      value={row.course}
                      options={config.programmes}
                      onChange={(v) => patch({ course: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "cohort",
                  label: "Cohort",
                  render: (row, patch) => (
                    <OpsTextField label="Cohort" value={row.cohort} onChange={(v) => patch({ cohort: v } as never)} />
                  ),
                },
                {
                  key: "sessionDate",
                  label: "Session date",
                  render: (row, patch) => (
                    <OpsTextField label="Session date" type="date" value={row.sessionDate} onChange={(v) => patch({ sessionDate: v } as never)} />
                  ),
                },
                {
                  key: "facilitator",
                  label: "Facilitator",
                  render: (row, patch) => (
                    <OpsTextField label="Facilitator" value={row.facilitator} onChange={(v) => patch({ facilitator: v } as never)} />
                  ),
                },
                {
                  key: "venue",
                  label: "Venue",
                  render: (row, patch) => (
                    <OpsTextField label="Venue" value={row.venue} onChange={(v) => patch({ venue: v } as never)} />
                  ),
                },
                {
                  key: "registered",
                  label: "Registered",
                  render: (row, patch) => (
                    <OpsNumberField label="Registered" value={row.registered} onChange={(v) => patch({ registered: v } as never)} />
                  ),
                },
                {
                  key: "attended",
                  label: "Attended",
                  render: (row, patch) => (
                    <OpsNumberField label="Attended" value={row.attended} onChange={(v) => patch({ attended: v } as never)} />
                  ),
                },
                {
                  key: "excusedAbsences",
                  label: "Excused",
                  render: (row, patch) => (
                    <OpsNumberField
                      label="Excused absences"
                      value={row.excusedAbsences}
                      onChange={(v) => patch({ excusedAbsences: v } as never)}
                      hint="Sanctioned, not non-attendance"
                    />
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (row, patch) => (
                    <OpsTextField label="Notes" value={row.notes} onChange={(v) => patch({ notes: v } as never)} />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from these sessions" description="Calculated by the Operations engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout label="Attendance rate" value={pct(summary?.ratePct ?? null)} hint="Attended / registered" />
              <OpsReadout label="Learner-sessions attended" value={count(summary?.attended ?? null)} />
              <OpsReadout label="Sessions delivered" value={count(summary?.sessions ?? null)} />
              <OpsReadout label="Sanctioned absences" value={count(summary?.excusedAbsences ?? null)} />
            </div>
            {summary?.sessionsBelowBand != null && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.sessionsBelowBand} of {summary.sessions} session(s) fell below {summary.bandFloorLabel} (
                {summary.bandFloorPct}%).
              </p>
            )}
            {summary?.sessionsOutsidePeriod != null && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.sessionsOutsidePeriod} session(s) are dated before this reporting period began. They are
                counted, but they probably belong to the previous cohort.
              </p>
            )}
            {summary && summary.byCourse.length > 0 && (
              <p className="mt-2 text-[11px] text-ink-soft/50">
                Worst attending: {summary.byCourse.map((c) => `${c.course} ${pct(c.ratePct)}`).join(" · ")}
              </p>
            )}
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.attendanceRate),
                value: summary?.ratePct ?? null,
                emptyNote: "No sessions recorded, so attendance cannot be derived.",
              },
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.sessionsDelivered),
                value: summary?.sessions ?? null,
                emptyNote: "No sessions recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain anything unusual about attendance, especially a low-rate session."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 8 - Training delivery
// ---------------------------------------------------------------------------

export function TrainingSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsTrainingData;
  onChange: (data: OperationsTrainingData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseTraining(report);
  const update = (id: string, patch: Partial<TrainingRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Training delivery reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Training delivery"
          reason="Marked Not Applicable. No training KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Delivery records (typed)"
            description="One row per delivery. Hours are contact hours, not sessions: a half-day and a full day are not the same amount of training."
          >
            <OpsRecordTable<TrainingRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankTrainingRecord(), id: uid() }] })}
              addLabel="Add delivery record"
              emptyText="No deliveries recorded. Training hours and fill rate both come from this table."
              columns={[
                {
                  key: "course",
                  label: "Course",
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Course"
                      value={row.course}
                      options={config.programmes}
                      onChange={(v) => patch({ course: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "deliveryMode",
                  label: "Delivery mode",
                  render: (row, patch) => (
                    <OpsSelectField<DeliveryMode>
                      label="Delivery mode"
                      value={row.deliveryMode}
                      options={config.deliveryModes}
                      onChange={(v) => patch({ deliveryMode: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "startDate",
                  label: "Start date",
                  render: (row, patch) => (
                    <OpsTextField label="Start date" type="date" value={row.startDate} onChange={(v) => patch({ startDate: v } as never)} />
                  ),
                },
                {
                  key: "endDate",
                  label: "End date",
                  render: (row, patch) => (
                    <OpsTextField label="End date" type="date" value={row.endDate} onChange={(v) => patch({ endDate: v } as never)} />
                  ),
                },
                {
                  key: "hours",
                  label: "Hours",
                  render: (row, patch) => (
                    <OpsNumberField label="Contact hours" value={row.hours} onChange={(v) => patch({ hours: v } as never)} step="0.5" />
                  ),
                },
                {
                  key: "capacity",
                  label: "Capacity",
                  render: (row, patch) => (
                    <OpsNumberField label="Capacity" value={row.capacity} onChange={(v) => patch({ capacity: v } as never)} />
                  ),
                },
                {
                  key: "learnersStarted",
                  label: "Learners started",
                  render: (row, patch) => (
                    <OpsNumberField
                      label="Learners started"
                      value={row.learnersStarted}
                      onChange={(v) => patch({ learnersStarted: v } as never)}
                      hint="Blank means not counted"
                    />
                  ),
                },
                {
                  key: "facilitator",
                  label: "Facilitator",
                  render: (row, patch) => (
                    <OpsTextField label="Facilitator" value={row.facilitator} onChange={(v) => patch({ facilitator: v } as never)} />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from these deliveries" description="Calculated by the Operations engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout label="Contact hours delivered" value={count(summary?.hours ?? null)} />
              <OpsReadout label="Courses delivered" value={count(summary?.courses ?? null)} />
              <OpsReadout label="Fill rate" value={pct(summary?.fillRatePct ?? null)} hint="Started / capacity" />
              <OpsReadout label="Learners started" value={count(summary?.learnersStarted ?? null)} />
            </div>
            {summary && Object.keys(summary.byDeliveryMode).length > 0 && (
              <p className="mt-2 text-[11px] text-ink-soft/50">
                By mode:{" "}
                {Object.entries(summary.byDeliveryMode)
                  .map(([mode, n]) => `${mode} ${n}`)
                  .join(" · ")}
              </p>
            )}
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.trainingHours),
                value: summary?.hours ?? null,
                emptyNote: "No delivery records, so training hours cannot be derived.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Note any delivery that was cut short, moved online or run below capacity."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 9 - Completion
// ---------------------------------------------------------------------------

export function CompletionSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsCompletionData;
  onChange: (data: OperationsCompletionData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseCompletion(report);
  const update = (id: string, patch: Partial<CompletionRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Completion reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Completion"
          reason="Marked Not Applicable. No completion KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Outcomes (typed)"
            description="One row per recorded outcome. Withdrawn learners appear here too: a learner who left is a real outcome of the course."
          >
            <OpsRecordTable<CompletionRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankCompletionRecord(), id: uid() }] })}
              addLabel="Add outcome"
              emptyText="No outcomes recorded. Completion rate comes from this table."
              columns={[
                {
                  key: "learner",
                  label: "Learner",
                  render: (row, patch) => (
                    <OpsTextField label="Learner" value={row.learner} onChange={(v) => patch({ learner: v } as never)} />
                  ),
                },
                {
                  key: "course",
                  label: "Course",
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Course"
                      value={row.course}
                      options={config.programmes}
                      onChange={(v) => patch({ course: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "cohort",
                  label: "Cohort",
                  render: (row, patch) => (
                    <OpsTextField label="Cohort" value={row.cohort} onChange={(v) => patch({ cohort: v } as never)} />
                  ),
                },
                {
                  key: "completionDate",
                  label: "Completion date",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Completion date"
                      type="date"
                      value={row.completionDate}
                      onChange={(v) => patch({ completionDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "outcome",
                  label: "Outcome",
                  render: (row, patch) => (
                    <OpsSelectField<CompletionOutcome>
                      label="Outcome"
                      value={row.outcome}
                      options={config.completionOutcomes}
                      onChange={(v) => patch({ outcome: v } as never)}
                      blankLabel="Not recorded"
                    />
                  ),
                },
                {
                  key: "assessmentResult",
                  label: "Assessment result",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Assessment result"
                      value={row.assessmentResult}
                      onChange={(v) => patch({ assessmentResult: v } as never)}
                    />
                  ),
                },
                {
                  key: "certified",
                  label: "Certified",
                  render: (row, patch) => (
                    <OpsCheckbox
                      label="Certified"
                      checked={row.certified}
                      onChange={(v) => patch({ certified: v } as never)}
                      hint="Only valid with a Completed outcome"
                    />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from these outcomes" description="Calculated by the Operations engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout label="Completion rate" value={pct(summary?.completionRatePct ?? null)} hint="Completed / all outcomes" />
              <OpsReadout label="Learners completed" value={count(summary?.completed ?? null)} />
              <OpsReadout label="Outcomes recorded" value={count(summary?.outcomesRecorded ?? null)} />
              <OpsReadout label="Certified" value={count(summary?.certified ?? null)} />
            </div>
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.completion),
                value: summary?.completionRatePct ?? null,
                emptyNote: "No outcomes recorded, so completion cannot be derived.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain a low completion rate or a cohort that finished ahead of schedule."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 10 - Dropouts
// ---------------------------------------------------------------------------

export function DropoutsSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsDropoutsData;
  onChange: (data: OperationsDropoutsData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseDropouts(report, config);
  const update = (id: string, patch: Partial<DropoutRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Dropout reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Dropouts"
          reason="Marked Not Applicable. No dropout KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Dropout register (typed)"
            description="One row per learner who left. The reason is a configured category, because comparing reasons across terms is the only reason this register exists."
          >
            <OpsRecordTable<DropoutRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankDropoutRecord(), id: uid() }] })}
              addLabel="Add dropout"
              emptyText="No dropouts recorded. This is not the same as a zero dropout rate until the register exists."
              columns={[
                {
                  key: "learner",
                  label: "Learner",
                  render: (row, patch) => (
                    <OpsTextField label="Learner" value={row.learner} onChange={(v) => patch({ learner: v } as never)} />
                  ),
                },
                {
                  key: "course",
                  label: "Course",
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Course"
                      value={row.course}
                      options={config.programmes}
                      onChange={(v) => patch({ course: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "cohort",
                  label: "Cohort",
                  render: (row, patch) => (
                    <OpsTextField label="Cohort" value={row.cohort} onChange={(v) => patch({ cohort: v } as never)} />
                  ),
                },
                {
                  key: "withdrawalDate",
                  label: "Withdrawal date",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Withdrawal date"
                      type="date"
                      value={row.withdrawalDate}
                      onChange={(v) => patch({ withdrawalDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "reason",
                  label: "Reason",
                  render: (row, patch) => (
                    <OpsSelectField<DropoutReasonCategory>
                      label="Reason"
                      value={row.reason}
                      options={config.dropoutReasons}
                      onChange={(v) => patch({ reason: v } as never)}
                      blankLabel="Not recorded"
                    />
                  ),
                },
                {
                  key: "weeksCompleted",
                  label: "Weeks completed",
                  render: (row, patch) => (
                    <OpsNumberField
                      label="Weeks completed"
                      value={row.weeksCompleted}
                      onChange={(v) => patch({ weeksCompleted: v } as never)}
                      step="0.5"
                      hint="Compared against the real course length"
                    />
                  ),
                },
                {
                  key: "reEnrolled",
                  label: "Re-enrolled",
                  render: (row, patch) => (
                    <OpsCheckbox
                      label="Re-enrolled"
                      checked={row.reEnrolled}
                      onChange={(v) => patch({ reEnrolled: v } as never)}
                      hint={`Currently ${config.reEnrolmentCountsAsDropout ? "counted against" : "excluded from"} the dropout rate`}
                    />
                  ),
                },
                {
                  key: "reasonDetail",
                  label: "Reason detail",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Reason detail"
                      value={row.reasonDetail}
                      onChange={(v) => patch({ reasonDetail: v } as never)}
                      placeholder="Free text behind the category"
                    />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from this register" description="Calculated by the Operations engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout
                label="Dropout rate"
                value={pct(summary?.dropoutRatePct ?? null)}
                hint="Counted / everyone who began"
              />
              <OpsReadout label="Dropouts counted" value={count(summary?.counted ?? null)} />
              <OpsReadout label="Re-enrolled later" value={count(summary?.reEnrolled ?? null)} />
              <OpsReadout
                label="Mean weeks completed"
                value={summary?.meanWeeksCompleted === null || summary?.meanWeeksCompleted === undefined
                  ? "Not derivable yet"
                  : `${summary.meanWeeksCompleted} weeks`}
              />
            </div>
            {summary && summary.byReason.length > 0 && (
              <p className="mt-2 text-[11px] text-ink-soft/50">
                By reason: {summary.byReason.map((r) => `${r.reason} ${r.count}`).join(" · ")}
              </p>
            )}
            {summary?.earlyDropouts != null && summary.earlyDropouts > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.earlyDropouts} dropout(s) left before half the course was done. That is a programme problem,
                not a learner one.
              </p>
            )}
            {summary && summary.unmatchedDropouts.length > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Not on this submission&apos;s register: {summary.unmatchedDropouts.join(", ")}. The dropout rate is
                measured against the register, so a learner who was never counted as enrolled weakens it.
              </p>
            )}
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.dropoutRate),
                value: summary?.dropoutRatePct ?? null,
                emptyNote: "No dropouts recorded, and no enrolment register to measure them against.",
              },
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.dropouts),
                value: summary?.counted ?? null,
                emptyNote: "No dropouts recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="A reason that keeps recurring is worth a sentence here."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 11 - Projects
// ---------------------------------------------------------------------------

export function ProjectsSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsProjectsData;
  onChange: (data: OperationsProjectsData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseProjects(report);
  const update = (id: string, patch: Partial<ProjectRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Project reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Projects"
          reason="Marked Not Applicable. No project KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Project register (typed)"
            description="A status nobody has refreshed is not a current status, so the review date is required."
          >
            <OpsRecordTable<ProjectRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankProjectRecord(), id: uid() }] })}
              addLabel="Add project"
              emptyText="No projects recorded. Active projects and on-schedule share come from this table."
              columns={[
                {
                  key: "projectName",
                  label: "Project",
                  render: (row, patch) => (
                    <OpsTextField label="Project" value={row.projectName} onChange={(v) => patch({ projectName: v } as never)} />
                  ),
                },
                {
                  key: "type",
                  label: "Type",
                  render: (row, patch) => (
                    <OpsSelectField<ProjectType>
                      label="Type"
                      value={row.type}
                      options={config.projectTypes}
                      onChange={(v) => patch({ type: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (row, patch) => (
                    <OpsSelectField<ProjectStatus>
                      label="Status"
                      value={row.status}
                      options={["Not Started", "On Track", "At Risk", "Delayed", "Completed"]}
                      onChange={(v) => patch({ status: v } as never)}
                      blankLabel="Not reviewed"
                      hint="Unstated is treated as live, not finished"
                    />
                  ),
                },
                {
                  key: "startDate",
                  label: "Start date",
                  render: (row, patch) => (
                    <OpsTextField label="Start date" type="date" value={row.startDate} onChange={(v) => patch({ startDate: v } as never)} />
                  ),
                },
                {
                  key: "plannedEndDate",
                  label: "Planned end",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Planned end date"
                      type="date"
                      value={row.plannedEndDate}
                      onChange={(v) => patch({ plannedEndDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "actualEndDate",
                  label: "Actual end",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Actual end date"
                      type="date"
                      value={row.actualEndDate}
                      onChange={(v) => patch({ actualEndDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "lastReviewed",
                  label: "Last reviewed",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Last reviewed"
                      type="date"
                      value={row.lastReviewed}
                      onChange={(v) => patch({ lastReviewed: v } as never)}
                    />
                  ),
                },
                {
                  key: "beneficiaries",
                  label: "Beneficiaries",
                  render: (row, patch) => (
                    <OpsNumberField label="Beneficiaries" value={row.beneficiaries} onChange={(v) => patch({ beneficiaries: v } as never)} />
                  ),
                },
                {
                  key: "linkedCourse",
                  label: "Linked course",
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Linked course"
                      value={row.linkedCourse}
                      options={config.programmes}
                      onChange={(v) => patch({ linkedCourse: v } as never)}
                      blankLabel="Not a training project"
                    />
                  ),
                },
                {
                  key: "lead",
                  label: "Lead",
                  render: (row, patch) => (
                    <OpsTextField label="Project lead" value={row.lead} onChange={(v) => patch({ lead: v } as never)} />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from this register" description="Calculated by the Operations engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout label="Live projects" value={count(summary?.active ?? null)} hint="Not completed" />
              <OpsReadout
                label="On schedule"
                value={pct(summary?.onSchedulePct ?? null)}
                hint="Of live projects only"
              />
              <OpsReadout label="At risk or delayed" value={count(summary?.atRiskOrDelayed ?? null)} />
              <OpsReadout label="Beneficiaries" value={count(summary?.beneficiaries ?? null)} />
            </div>
            {summary && summary.staleReviews.length > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Status not reviewed in over {PROJECT_REVIEW_STALE_DAYS} days:{" "}
                {summary.staleReviews.map((s) => `${s.projectName} (${s.daysSinceReview}d)`).join(", ")}.
              </p>
            )}
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.activeProjects),
                value: summary?.active ?? null,
                emptyNote: "No projects recorded.",
              },
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.projectsOnSchedule),
                value: summary?.onSchedulePct ?? null,
                emptyNote: "No projects recorded, so on-schedule share cannot be derived.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Say why a project is behind, and what would bring it back on track."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 12 - Assets
// ---------------------------------------------------------------------------

export function AssetsSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: OperationsReport;
  data: OperationsAssetsData;
  onChange: (data: OperationsAssetsData) => void;
  kpis: Kpi[];
  config: OperationsConfig;
}) {
  const summary = summariseAssets(report);
  const update = (id: string, patch: Partial<AssetRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <OperationsSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <OperationsNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Asset reporting"
      />

      {data.notApplicable ? (
        <OperationsNoDataNote
          what="Assets"
          reason="Marked Not Applicable. No asset KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <OpsFieldset
            title="Asset register (typed)"
            description="A tag is required: without one an asset cannot be located, de-duplicated or reconciled with an invoice."
          >
            <OpsRecordTable<AssetRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankAssetRecord(), id: uid() }] })}
              addLabel="Add asset"
              emptyText="No assets recorded. In-service rate and idle value come from this table."
              columns={[
                {
                  key: "assetName",
                  label: "Asset",
                  render: (row, patch) => (
                    <OpsTextField label="Asset" value={row.assetName} onChange={(v) => patch({ assetName: v } as never)} />
                  ),
                },
                {
                  key: "assetTag",
                  label: "Tag",
                  render: (row, patch) => (
                    <OpsTextField label="Asset tag" value={row.assetTag} onChange={(v) => patch({ assetTag: v } as never)} />
                  ),
                },
                {
                  key: "category",
                  label: "Category",
                  render: (row, patch) => (
                    <OpsSelectField
                      label="Category"
                      value={row.category}
                      options={config.assetCategories}
                      onChange={(v) => patch({ category: v } as never)}
                      blankLabel="Not categorised"
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (row, patch) => (
                    <OpsSelectField<AssetStatus>
                      label="Status"
                      value={row.status}
                      options={["In Use", "Idle", "Maintenance", "Disposed", "Not Yet In Service"]}
                      onChange={(v) => patch({ status: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "location",
                  label: "Location",
                  render: (row, patch) => (
                    <OpsTextField label="Location" value={row.location} onChange={(v) => patch({ location: v } as never)} />
                  ),
                },
                {
                  key: "acquisitionDate",
                  label: "Acquired",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Acquisition date"
                      type="date"
                      value={row.acquisitionDate}
                      onChange={(v) => patch({ acquisitionDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "replacementValue",
                  label: "Replacement value",
                  render: (row, patch) => (
                    <OpsNumberField
                      label="Replacement value"
                      value={row.replacementValue}
                      onChange={(v) => patch({ replacementValue: v } as never)}
                      prefix={config.currencySymbol}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "condition",
                  label: "Condition",
                  render: (row, patch) => (
                    <OpsTextField label="Condition" value={row.condition} onChange={(v) => patch({ condition: v } as never)} />
                  ),
                },
                {
                  key: "custodian",
                  label: "Custodian",
                  render: (row, patch) => (
                    <OpsTextField label="Custodian" value={row.custodian} onChange={(v) => patch({ custodian: v } as never)} />
                  ),
                },
                {
                  key: "disposalDate",
                  label: "Disposal date",
                  render: (row, patch) => (
                    <OpsTextField
                      label="Disposal date"
                      type="date"
                      value={row.disposalDate}
                      onChange={(v) => patch({ disposalDate: v } as never)}
                    />
                  ),
                },
              ]}
            />
          </OpsFieldset>

          <OpsFieldset title="Derived from this register" description="Calculated by the Operations engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OpsReadout
                label="In service"
                value={pct(summary?.inServiceRatePct ?? null)}
                hint="Excludes not-yet-in-service and disposed"
              />
              <OpsReadout label="In use" value={count(summary?.inUse ?? null)} />
              <OpsReadout
                label="Idle"
                value={count(summary?.idle ?? null)}
                hint={
                  summary?.idleValue === null || summary?.idleValue === undefined
                    ? "No values recorded"
                    : `${config.currencySymbol}${Math.round(summary.idleValue).toLocaleString("en-ZA")} of capital`
                }
              />
              <OpsReadout label="Not yet in service" value={count(summary?.notYetInService ?? null)} />
            </div>
            {summary && summary.idle != null && summary.idle > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.idle} asset(s) idle: {summary.byCategory.filter((c) => c.idle > 0).map((c) => `${c.category} ${c.idle}`).join(" · ")}.
                Capital already spent producing nothing.
              </p>
            )}
          </OpsFieldset>

          <OperationsWarningPreview
            items={[
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.assetsInService),
                value: summary?.inServiceRatePct ?? null,
                emptyNote: "No assets recorded.",
              },
              {
                kpi: kpis.find((k) => k.id === OPERATIONS_KPI_IDS.assetsIdle),
                value: summary?.idle ?? null,
                emptyNote: "No assets recorded, so the idle count cannot be derived.",
              },
            ]}
            currencySymbol={config.currencySymbol}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain anything idle or awaiting service, and what it is costing."
          />
        </>
      )}
    </div>
  );
}

/** Ids for newly typed rows. A timestamp alone would collide when two rows are
 *  added in the same millisecond, which a fast operator can do. */
function uid(): string {
  return `ops-rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}