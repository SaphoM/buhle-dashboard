import {
  Checkbox,
  Fieldset,
  NumberField,
  Readout,
  RecordTable,
  SelectField,
  TextArea,
  TextField,
} from "../RegisterFields";
import { NoDataNote, NotApplicableToggle, SourceTag, WarningPreview } from "../RegisterChrome";
import type { Kpi } from "../../../types";
import {
  ACADEMY_KPI_IDS,
  ACADEMY_SECTION_PURPOSE,
  type AcademyAssessmentData,
  type AcademyCertificationData,
  type AcademyConfig,
  type AcademyIntakeData,
  type AcademyProgrammeData,
  type AcademyReport,
  type AssessmentRecord,
  type CertificationRecord,
  type IntakeRecord,
  type ProgrammeRecord,
} from "../../../types/academy";
import {
  blankAssessmentRecord,
  blankCertificationRecord,
  blankIntakeRecord,
  blankProgrammeRecord,
} from "../../../data/academySeed";
import {
  previewAcademyStatus,
  summariseAssessments,
  summariseCertification,
  summariseIntakes,
  summariseProgrammes,
} from "../../../data/academyEngine";

/**
 * The four Academy registers.
 *
 * Same shape as the Marketing, Operations and Alumni sections: rows are typed,
 * every rate is derived from them and shown read-only beneath the register, and
 * each section can be marked Not Applicable for a period in which the activity
 * genuinely did not happen. There is no percentage input anywhere in this file.
 */

function uid(): string {
  return `acad-rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "Not derivable yet" : `${v.toFixed(1)}%`;
const count = (v: number | null | undefined) =>
  v === null || v === undefined ? "None recorded" : v.toLocaleString("en-ZA");

interface SectionProps<T> {
  report: AcademyReport;
  data: T;
  onChange: (data: T) => void;
  kpis: Kpi[];
  config: AcademyConfig;
}

function SectionShell({
  report,
  notApplicable,
  onNotApplicable,
  what,
  purpose,
  children,
}: {
  report: AcademyReport;
  notApplicable: boolean;
  onNotApplicable: (v: boolean) => void;
  what: string;
  purpose: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SourceTag
        kind={report.dataSource.kind === "Manual Entry" ? "Manual entry" : "Not submitted"}
        period={report.reportingPeriod}
        footnote="Typed by the Academy & Alumni office from academic records"
      />
      <p className="text-xs text-ink-soft/60">{purpose}</p>
      <NotApplicableToggle checked={notApplicable} onChange={onNotApplicable} what={what} />
      {notApplicable ? (
        <NoDataNote
          what={what}
          reason="Marked Not Applicable. No KPI will be derived from this section and submission is not blocked."
        />
      ) : (
        children
      )}
    </div>
  );
}

function Commentary({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextArea
      label="Section commentary"
      value={value}
      onChange={onChange}
      hint="What changed this period, and why"
      rows={2}
      placeholder="What a reader needs to know about this period"
    />
  );
}

function Preview({ items }: { items: { kpi: Kpi | undefined; value: number | null; emptyNote: string }[] }) {
  return <WarningPreview items={items} previewStatus={previewAcademyStatus} />;
}

// ---------------------------------------------------------------------------
// Section 1 - Programmes
// ---------------------------------------------------------------------------

export function ProgrammeSection({ report, data, onChange, kpis, config }: SectionProps<AcademyProgrammeData>) {
  const summary = summariseProgrammes(report);
  const update = (id: string, patch: Partial<ProgrammeRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Programme reporting"
      purpose={ACADEMY_SECTION_PURPOSE.programmes}
    >
      <Fieldset
        title="Programme register (typed)"
        description="One row per programme. Accreditation is judged on the expiry date as well as the status, so a lapsed accreditation is caught even if nobody updated the status."
      >
        <RecordTable<ProgrammeRecord>
          rows={data.records}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, records: [...data.records, { ...blankProgrammeRecord(), id: uid() }] })}
          addLabel="Add programme"
          emptyText="No programmes recorded yet."
          columns={[
            {
              key: "name",
              label: "Programme",
              required: true,
              render: (row, patch) => (
                <TextField label="Programme" value={row.name} required onChange={(v) => patch({ name: v } as never)} />
              ),
            },
            {
              key: "nqfLevel",
              label: "NQF level",
              render: (row, patch) => (
                <NumberField label="NQF level" value={row.nqfLevel} onChange={(v) => patch({ nqfLevel: v } as never)} />
              ),
            },
            {
              key: "accreditingBody",
              label: "Accrediting body",
              render: (row, patch) => (
                <SelectField
                  label="Accrediting body"
                  value={row.accreditingBody}
                  options={config.accreditingBodies}
                  onChange={(v) => patch({ accreditingBody: v } as never)}
                />
              ),
            },
            {
              key: "accreditationStatus",
              label: "Accreditation",
              required: true,
              render: (row, patch) => (
                <SelectField
                  label="Accreditation status"
                  value={row.accreditationStatus}
                  options={config.accreditationStatuses}
                  required
                  onChange={(v) => patch({ accreditationStatus: v } as never)}
                />
              ),
            },
            {
              key: "accreditationExpiry",
              label: "Expiry",
              render: (row, patch) => (
                <TextField
                  label="Accreditation expiry"
                  type="date"
                  value={row.accreditationExpiry}
                  onChange={(v) => patch({ accreditationExpiry: v } as never)}
                  hint="Required once accredited."
                />
              ),
            },
            {
              key: "status",
              label: "Status",
              required: true,
              render: (row, patch) => (
                <SelectField
                  label="Programme status"
                  value={row.status}
                  options={config.programmeStatuses}
                  required
                  onChange={(v) => patch({ status: v } as never)}
                />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (row, patch) => (
                <TextArea label="Notes" value={row.notes} rows={1} onChange={(v) => patch({ notes: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <Commentary value={data.commentary} onChange={(v) => onChange({ ...data, commentary: v })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Active programmes" value={count(summary?.active)} />
        <Readout label="Need accreditation" value={count(summary?.accreditable)} />
        <Readout label="Currently accredited" value={count(summary?.accredited)} />
        <Readout label="Accredited rate" value={pct(summary?.accreditedRatePct)} />
      </div>

      {summary && summary.lapsed.length > 0 && (
        <NoDataNote
          what="Lapsed accreditation"
          reason={`${summary.lapsed.map((l) => `${l.name} (expired ${l.expiry})`).join(", ")} - marked Accredited but past expiry, so not counted as accredited.`}
        />
      )}
      {summary && summary.expiringSoon.length > 0 && (
        <p className="rounded-xl bg-butter/20 px-3 py-2 text-[11px] text-ink-soft/70">
          Expiring within 90 days: {summary.expiringSoon.map((l) => `${l.name} (${l.expiry})`).join(", ")}.
        </p>
      )}

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.accreditedProgrammes),
            value: summary?.accreditedRatePct ?? null,
            emptyNote: "No accreditable programmes recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 2 - Intakes
// ---------------------------------------------------------------------------

export function IntakeSection({ report, data, onChange, kpis }: SectionProps<AcademyIntakeData>) {
  const summary = summariseIntakes(report);
  const programmeNames = report.programmes.records.map((r) => r.name).filter(Boolean);
  const update = (id: string, patch: Partial<IntakeRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Intake reporting"
      purpose={ACADEMY_SECTION_PURPOSE.intakes}
    >
      <Fieldset
        title="Intake register (typed)"
        description="One row per programme intake. Applications, acceptances and registrations are separate counts, so an accepted applicant who never arrived is visible rather than hidden in a percentage."
      >
        <RecordTable<IntakeRecord>
          rows={data.records}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, records: [...data.records, { ...blankIntakeRecord(), id: uid() }] })}
          addLabel="Add intake"
          emptyText="No intakes recorded yet."
          columns={[
            {
              key: "programme",
              label: "Programme",
              required: true,
              render: (row, patch) =>
                programmeNames.length > 0 ? (
                  <SelectField
                    label="Programme"
                    value={row.programme}
                    options={programmeNames}
                    required
                    onChange={(v) => patch({ programme: v } as never)}
                  />
                ) : (
                  <TextField label="Programme" value={row.programme} required onChange={(v) => patch({ programme: v } as never)} />
                ),
            },
            {
              key: "intake",
              label: "Intake",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Intake"
                  value={row.intake}
                  required
                  placeholder="2026 Intake B"
                  onChange={(v) => patch({ intake: v } as never)}
                />
              ),
            },
            {
              key: "startDate",
              label: "Start date",
              required: true,
              render: (row, patch) => (
                <TextField label="Start date" type="date" value={row.startDate} required onChange={(v) => patch({ startDate: v } as never)} />
              ),
            },
            {
              key: "capacity",
              label: "Capacity",
              required: true,
              render: (row, patch) => (
                <NumberField label="Capacity" value={row.capacity} required onChange={(v) => patch({ capacity: v } as never)} />
              ),
            },
            {
              key: "applicationsReceived",
              label: "Applications",
              render: (row, patch) => (
                <NumberField
                  label="Applications received"
                  value={row.applicationsReceived}
                  onChange={(v) => patch({ applicationsReceived: v } as never)}
                />
              ),
            },
            {
              key: "applicationsAccepted",
              label: "Accepted",
              render: (row, patch) => (
                <NumberField
                  label="Applications accepted"
                  value={row.applicationsAccepted}
                  onChange={(v) => patch({ applicationsAccepted: v } as never)}
                />
              ),
            },
            {
              key: "learnersRegistered",
              label: "Registered",
              required: true,
              render: (row, patch) => (
                <NumberField
                  label="Learners registered"
                  value={row.learnersRegistered}
                  required
                  onChange={(v) => patch({ learnersRegistered: v } as never)}
                />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (row, patch) => (
                <TextArea label="Notes" value={row.notes} rows={1} onChange={(v) => patch({ notes: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <Commentary value={data.commentary} onChange={(v) => onChange({ ...data, commentary: v })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Applications" value={count(summary?.applications)} />
        <Readout label="Accepted" value={count(summary?.accepted)} />
        <Readout label="Registered" value={count(summary?.registered)} />
        <Readout label="Accepted, not registered" value={count(summary?.noShows)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Places offered" value={count(summary?.capacity)} />
        <Readout label="Acceptance rate" value={pct(summary?.acceptanceRatePct)} />
        <Readout label="Fill rate" value={pct(summary?.fillRatePct)} hint="Registered of places offered" />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.applicationAcceptance),
            value: summary?.acceptanceRatePct ?? null,
            emptyNote: "Applications not recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.intakeFillRate),
            value: summary?.fillRatePct ?? null,
            emptyNote: "Capacity or registrations not recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 3 - Assessments
// ---------------------------------------------------------------------------

export function AssessmentSection({ report, data, onChange, kpis, config }: SectionProps<AcademyAssessmentData>) {
  const summary = summariseAssessments(report);
  const update = (id: string, patch: Partial<AssessmentRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Assessment reporting"
      purpose={ACADEMY_SECTION_PURPOSE.assessments}
    >
      <Fieldset
        title="Assessment register (typed)"
        description="One row per learner per module. Absent is its own result: a learner who did not sit the assessment is excluded from the competency rate rather than counted as not competent."
      >
        <RecordTable<AssessmentRecord>
          rows={data.records}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, records: [...data.records, { ...blankAssessmentRecord(), id: uid() }] })}
          addLabel="Add assessment"
          emptyText="No assessments recorded yet."
          columns={[
            {
              key: "learner",
              label: "Learner",
              required: true,
              render: (row, patch) => (
                <TextField label="Learner" value={row.learner} required onChange={(v) => patch({ learner: v } as never)} />
              ),
            },
            {
              key: "programme",
              label: "Programme",
              required: true,
              render: (row, patch) => (
                <TextField label="Programme" value={row.programme} required onChange={(v) => patch({ programme: v } as never)} />
              ),
            },
            {
              key: "module",
              label: "Module",
              required: true,
              render: (row, patch) => (
                <TextField label="Module" value={row.module} required onChange={(v) => patch({ module: v } as never)} />
              ),
            },
            {
              key: "assessmentDate",
              label: "Date",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Assessment date"
                  type="date"
                  value={row.assessmentDate}
                  required
                  onChange={(v) => patch({ assessmentDate: v } as never)}
                />
              ),
            },
            {
              key: "result",
              label: "Result",
              required: true,
              render: (row, patch) => (
                <SelectField
                  label="Result"
                  value={row.result}
                  options={config.assessmentResults}
                  required
                  onChange={(v) => patch({ result: v } as never)}
                />
              ),
            },
            {
              key: "moderated",
              label: "Moderated",
              render: (row, patch) => (
                <Checkbox label="Moderated" checked={row.moderated} onChange={(v) => patch({ moderated: v } as never)} />
              ),
            },
            {
              key: "reassessment",
              label: "Re-assessment",
              render: (row, patch) => (
                <Checkbox label="Re-assessment" checked={row.reassessment} onChange={(v) => patch({ reassessment: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <Commentary value={data.commentary} onChange={(v) => onChange({ ...data, commentary: v })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Assessed" value={count(summary?.assessed)} hint="Excludes absentees" />
        <Readout label="Competent" value={count(summary?.competent)} />
        <Readout label="Not yet competent" value={count(summary?.notYetCompetent)} />
        <Readout label="Absent" value={count(summary?.absent)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Competency rate" value={pct(summary?.competencyRatePct)} />
        <Readout label="Moderated" value={count(summary?.moderated)} />
        <Readout label="Moderation coverage" value={pct(summary?.moderationCoveragePct)} />
        <Readout label="Re-assessments" value={count(summary?.reassessments)} />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.competencyRate),
            value: summary?.competencyRatePct ?? null,
            emptyNote: "No assessed results recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.moderationCoverage),
            value: summary?.moderationCoveragePct ?? null,
            emptyNote: "No assessed results recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 4 - Certification
// ---------------------------------------------------------------------------

export function CertificationSection({ report, data, onChange, kpis, config }: SectionProps<AcademyCertificationData>) {
  const summary = summariseCertification(report);
  const update = (id: string, patch: Partial<CertificationRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Certification reporting"
      purpose={ACADEMY_SECTION_PURPOSE.certification}
    >
      <Fieldset
        title="Certification register (typed)"
        description="One row per learner who completed a programme. Certificates are issued by the SETA, so Eligible, Submitted and Certified are kept apart: the wait between them is what this register exists to show. Graduates join the Alumni population."
      >
        <RecordTable<CertificationRecord>
          rows={data.records}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, records: [...data.records, { ...blankCertificationRecord(), id: uid() }] })}
          addLabel="Add completer"
          emptyText="No completers recorded yet."
          columns={[
            {
              key: "learner",
              label: "Learner",
              required: true,
              render: (row, patch) => (
                <TextField label="Learner" value={row.learner} required onChange={(v) => patch({ learner: v } as never)} />
              ),
            },
            {
              key: "programme",
              label: "Programme",
              required: true,
              render: (row, patch) => (
                <TextField label="Programme" value={row.programme} required onChange={(v) => patch({ programme: v } as never)} />
              ),
            },
            {
              key: "cohort",
              label: "Cohort",
              render: (row, patch) => (
                <TextField label="Cohort" value={row.cohort} onChange={(v) => patch({ cohort: v } as never)} />
              ),
            },
            {
              key: "completionDate",
              label: "Completed",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Completion date"
                  type="date"
                  value={row.completionDate}
                  required
                  onChange={(v) => patch({ completionDate: v } as never)}
                />
              ),
            },
            {
              key: "status",
              label: "Status",
              required: true,
              render: (row, patch) => (
                <SelectField
                  label="Certification status"
                  value={row.status}
                  options={config.certificationStatuses}
                  required
                  onChange={(v) => patch({ status: v } as never)}
                />
              ),
            },
            {
              key: "certificateDate",
              label: "Certificate date",
              render: (row, patch) => (
                <TextField
                  label="Certificate date"
                  type="date"
                  value={row.certificateDate}
                  onChange={(v) => patch({ certificateDate: v } as never)}
                  hint="Required once Certified."
                />
              ),
            },
            {
              key: "graduated",
              label: "Graduated",
              render: (row, patch) => (
                <Checkbox
                  label="Graduated"
                  checked={row.graduated}
                  onChange={(v) => patch({ graduated: v } as never)}
                  hint="Joins the Alumni tracer population."
                />
              ),
            },
          ]}
        />
      </Fieldset>

      <Commentary value={data.commentary} onChange={(v) => onChange({ ...data, commentary: v })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Completers" value={count(summary?.completers)} />
        <Readout label="Certified" value={count(summary?.certified)} />
        <Readout label="Awaiting SETA" value={count(summary?.awaitingSeta)} />
        <Readout label="Withheld" value={count(summary?.withheld)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Certification rate" value={pct(summary?.certificationRatePct)} />
        <Readout label="Graduates" value={count(summary?.graduated)} hint="Feeds the Alumni tracer study" />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.certificationRate),
            value: summary?.certificationRatePct ?? null,
            emptyNote: "No certification statuses recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === ACADEMY_KPI_IDS.graduates),
            value: summary ? summary.graduated : null,
            emptyNote: "No completers recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}
