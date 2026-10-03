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
import type { EmploymentType, HrVacancyData, Vacancy, VacancyPriority, VacancyStatus } from "../../../types/hr";
import { HR_KPI_IDS, summariseRecruitment } from "../../../data/hrEngine";
import { HrNotApplicableToggle, HrWarningPreview } from "./HrSectionChrome";

const STATUSES: readonly VacancyStatus[] = ["Open", "Shortlisting", "Interviewing", "Offer Out", "Filled", "Closed"];
const PRIORITIES: readonly VacancyPriority[] = ["Low", "Medium", "High", "Critical"];
const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["Permanent", "Contract", "Part-time", "Intern", "Learner"];

function blankVacancy(index: number): Vacancy {
  return {
    id: `vac-${Date.now()}-${index}`,
    vacancyId: "",
    position: "",
    department: "Human Resources",
    location: "",
    hiringManager: "",
    dateOpened: "",
    requiredStartDate: "",
    employmentType: "Permanent",
    status: "Open",
    priority: "Medium",
    reasonForVacancy: "",
    budgetedSalary: null,
    applicationsReceived: null,
    candidatesShortlisted: null,
    interviewsConducted: null,
    offersMade: null,
    offersAccepted: null,
    offersDeclined: null,
    shortlistingDate: "",
    interviewDate: "",
    offerDate: "",
    acceptanceDate: "",
    filledDate: "",
    recruitmentCost: null,
    hiringRelatedCosts: null,
  };
}

/**
 * Section 6 - Vacancies / Recruitment. Each vacancy carries its own pipeline and
 * dates, so Time to Fill and Offer Acceptance are computed rather than typed
 * (Section 15). Cost per Hire stays blank when no cost was captured, rather than
 * defaulting to zero.
 */
export function HrVacancySection({
  data,
  kpis,
  onChange,
}: {
  data: HrVacancyData;
  kpis: Kpi[];
  onChange: (data: HrVacancyData) => void;
}) {
  const timeToFillKpi = kpis.find((k) => k.id === HR_KPI_IDS.timeToFill);
  const costKpi = kpis.find((k) => k.id === HR_KPI_IDS.costPerHire);
  const offerKpi = kpis.find((k) => k.id === HR_KPI_IDS.offerAcceptance);
  const openKpi = kpis.find((k) => k.id === HR_KPI_IDS.openVacancies);
  const summary = summariseRecruitment(data);

  const addVacancy = () => onChange({ ...data, vacancies: [...data.vacancies, blankVacancy(data.vacancies.length)] });

  if (data.notApplicable) {
    return (
      <div className="flex flex-col gap-4">
        <HrNotApplicableToggle checked onChange={(v) => onChange({ ...data, notApplicable: v })} what="Vacancy reporting" />
        <p className="text-sm text-ink-soft/50">
          Vacancies are marked Not Applicable for this period, so no recruitment figures will be reported.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HrNotApplicableToggle
        checked={data.notApplicable}
        onChange={(v) => onChange({ ...data, notApplicable: v })}
        what="Vacancy reporting"
      />

      <HrRecordList
        title="Vacancies &amp; recruitment pipeline"
        addLabel="Add vacancy"
        onAdd={addVacancy}
      >
        {data.vacancies.length === 0 ? (
          <HrEmptyRow text="No vacancies recorded. Add one, or mark vacancies Not Applicable if none are open." />
        ) : (
          <div className="flex flex-col gap-4">
            {data.vacancies.map((v, i) => (
              <VacancyCard
                key={v.id}
                vacancy={v}
                onChange={(next) =>
                  onChange({ ...data, vacancies: data.vacancies.map((x, j) => (j === i ? next : x)) })
                }
                onRemove={() => onChange({ ...data, vacancies: data.vacancies.filter((_, j) => j !== i) })}
                timeToFill={
                  v.filledDate && v.dateOpened
                    ? Math.round((new Date(v.filledDate).getTime() - new Date(v.dateOpened).getTime()) / 86400000)
                    : null
                }
              />
            ))}
          </div>
        )}
      </HrRecordList>

      {summary && (
        <HrFieldset title="Calculated recruitment" description="Derived by the engine from the vacancies above.">
          <ReadOnlyStat label="Open vacancies" value={summary.openVacancies} />
          <ReadOnlyStat label="Filled this period" value={summary.filledVacancies} />
          <ReadOnlyStat
            label="Time to Fill"
            value={summary.timeToFillDays}
            suffix=" days"
            fallback="No vacancies filled in period"
          />
          <ReadOnlyStat label="Cost per Hire" value={summary.costPerHire} prefix="R" fallback="Data not available" />
          <ReadOnlyStat label="Offers made" value={summary.offersMade} />
          <ReadOnlyStat
            label="Offer acceptance rate"
            value={summary.offerAcceptancePct}
            suffix="%"
            fallback="No offers made"
          />
          <ReadOnlyStat label="Critical vacancies open" value={summary.criticalOpen} />
        </HrFieldset>
      )}

      {summary && summary.pastRequiredStart.length > 0 && (
        <div className="rounded-2xl border border-butter-dark/40 bg-butter/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/60">Past required start date</p>
          <ul className="mt-2 flex flex-col gap-1">
            {summary.pastRequiredStart.map((v) => (
              <li key={v.vacancyId} className="text-xs text-ink-soft/70">
                <span className="font-medium text-ink">
                  {v.vacancyId} {v.position}
                </span>{" "}
                · was required to start{" "}
                {new Date(v.requiredStartDate).toLocaleDateString("en-ZA")} and is still open
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary && summary.repeatedRejections.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Repeated offer rejection</p>
          <ul className="mt-2 flex flex-col gap-1">
            {summary.repeatedRejections.map((v) => (
              <li key={v.vacancyId} className="text-xs text-rose-800">
                <span className="font-medium">
                  {v.vacancyId} {v.position}
                </span>{" "}
                · {v.declined} offers declined
              </li>
            ))}
          </ul>
        </div>
      )}

      <HrFieldset title="Vacancy commentary">
        <div className="col-span-full">
          <HrTextArea
            label="Vacancy Commentary"
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            placeholder="Note hard-to-fill roles, budget constraints, or offer declines."
          />
        </div>
      </HrFieldset>

      <HrWarningPreview
        items={[
          {
            kpi: timeToFillKpi,
            value: summary?.timeToFillDays ?? null,
            emptyNote: "Time to Fill needs at least one vacancy with a filled date.",
          },
          {
            kpi: costKpi,
            value: summary?.costPerHire ?? null,
            emptyNote: "Cost per Hire: no recruitment costs captured this period.",
          },
          {
            kpi: offerKpi,
            value: summary?.offerAcceptancePct ?? null,
            emptyNote: "Offer acceptance needs at least one offer made.",
          },
          { kpi: openKpi, value: summary?.openVacancies ?? null, emptyNote: "Add at least one vacancy." },
        ]}
      />
    </div>
  );
}

function VacancyCard({
  vacancy,
  onChange,
  onRemove,
  timeToFill,
}: {
  vacancy: Vacancy;
  onChange: (next: Vacancy) => void;
  onRemove: () => void;
  timeToFill: number | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
          {vacancy.vacancyId || "New vacancy"}
        </span>
        <div className="flex items-center gap-2">
          {timeToFill !== null && (
            <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold text-ink-soft/70">
              Time to fill: {timeToFill} days
            </span>
          )}
          <HrRemoveButton onClick={onRemove} label="Remove vacancy" />
        </div>
      </div>

      <HrFieldset title="Vacancy record">
        <HrTextField
          label="Vacancy ID"
          value={vacancy.vacancyId}
          onChange={(v) => onChange({ ...vacancy, vacancyId: v })}
          required
        />
        <HrTextField
          label="Position"
          value={vacancy.position}
          onChange={(v) => onChange({ ...vacancy, position: v })}
          required
        />
        <HrSelectField
          label="Department"
          value={vacancy.department}
          options={DEPARTMENT_OPTIONS}
          onChange={(v) => onChange({ ...vacancy, department: v })}
          required
        />
        <HrTextField label="Location" value={vacancy.location} onChange={(v) => onChange({ ...vacancy, location: v })} />
        <HrTextField
          label="Hiring manager"
          value={vacancy.hiringManager}
          onChange={(v) => onChange({ ...vacancy, hiringManager: v })}
          required
        />
        <HrTextField
          label="Date opened"
          type="date"
          value={vacancy.dateOpened}
          onChange={(v) => onChange({ ...vacancy, dateOpened: v })}
          required
        />
        <HrTextField
          label="Required start date"
          type="date"
          value={vacancy.requiredStartDate}
          onChange={(v) => onChange({ ...vacancy, requiredStartDate: v })}
        />
        <HrSelectField
          label="Employment type"
          value={vacancy.employmentType}
          options={EMPLOYMENT_TYPES}
          onChange={(v) => onChange({ ...vacancy, employmentType: v })}
        />
        <HrSelectField
          label="Vacancy status"
          value={vacancy.status}
          options={STATUSES}
          onChange={(v) => onChange({ ...vacancy, status: v })}
          required
        />
        <HrSelectField
          label="Priority"
          value={vacancy.priority}
          options={PRIORITIES}
          onChange={(v) => onChange({ ...vacancy, priority: v })}
        />
        <div className="sm:col-span-2">
          <HrTextField
            label="Reason for vacancy"
            value={vacancy.reasonForVacancy}
            onChange={(v) => onChange({ ...vacancy, reasonForVacancy: v })}
          />
        </div>
        <HrNumberField
          label="Budgeted salary"
          value={vacancy.budgetedSalary}
          onChange={(v) => onChange({ ...vacancy, budgetedSalary: v })}
          prefix="R"
        />
      </HrFieldset>

      <HrFieldset title="Recruitment pipeline">
        <HrNumberField
          label="Applications received"
          value={vacancy.applicationsReceived}
          onChange={(v) => onChange({ ...vacancy, applicationsReceived: v })}
        />
        <HrNumberField
          label="Candidates shortlisted"
          value={vacancy.candidatesShortlisted}
          onChange={(v) => onChange({ ...vacancy, candidatesShortlisted: v })}
        />
        <HrNumberField
          label="Interviews conducted"
          value={vacancy.interviewsConducted}
          onChange={(v) => onChange({ ...vacancy, interviewsConducted: v })}
        />
        <HrNumberField
          label="Offers made"
          value={vacancy.offersMade}
          onChange={(v) => onChange({ ...vacancy, offersMade: v })}
        />
        <HrNumberField
          label="Offers accepted"
          value={vacancy.offersAccepted}
          onChange={(v) => onChange({ ...vacancy, offersAccepted: v })}
        />
        <HrNumberField
          label="Offers declined"
          value={vacancy.offersDeclined}
          onChange={(v) => onChange({ ...vacancy, offersDeclined: v })}
        />
      </HrFieldset>

      <HrFieldset title="Recruitment dates">
        <HrTextField
          label="Shortlisting date"
          type="date"
          value={vacancy.shortlistingDate}
          onChange={(v) => onChange({ ...vacancy, shortlistingDate: v })}
        />
        <HrTextField
          label="Interview date"
          type="date"
          value={vacancy.interviewDate}
          onChange={(v) => onChange({ ...vacancy, interviewDate: v })}
        />
        <HrTextField label="Offer date" type="date" value={vacancy.offerDate} onChange={(v) => onChange({ ...vacancy, offerDate: v })} />
        <HrTextField
          label="Acceptance date"
          type="date"
          value={vacancy.acceptanceDate}
          onChange={(v) => onChange({ ...vacancy, acceptanceDate: v })}
        />
        <HrTextField
          label="Filled date"
          type="date"
          value={vacancy.filledDate}
          onChange={(v) => onChange({ ...vacancy, filledDate: v })}
          hint="Required for Time to Fill when the vacancy is filled or closed."
        />
      </HrFieldset>

      <HrFieldset title="Recruitment cost">
        <HrNumberField
          label="Recruitment cost"
          value={vacancy.recruitmentCost}
          onChange={(v) => onChange({ ...vacancy, recruitmentCost: v })}
          prefix="R"
        />
        <HrNumberField
          label="Other hiring-related costs"
          value={vacancy.hiringRelatedCosts}
          onChange={(v) => onChange({ ...vacancy, hiringRelatedCosts: v })}
          prefix="R"
        />
        <p className="col-span-full text-[11px] text-ink-soft/40">
          Cost per Hire = (recruitment cost + hiring-related costs) ÷ filled vacancies. If no costs are captured the
          KPI reports &quot;Data not available&quot; rather than R0.
        </p>
      </HrFieldset>
    </div>
  );
}

function ReadOnlyStat({
  label,
  value,
  suffix,
  prefix,
  fallback,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  prefix?: string;
  fallback?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-ink-soft/60">{label}</span>
      <span className="text-lg font-bold text-ink">
        {value === null ? (
          <span className="text-sm font-normal text-ink-soft/40">{fallback ?? "Not available"}</span>
        ) : (
          `${prefix ?? ""}${value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}${suffix ?? ""}`
        )}
      </span>
    </div>
  );
}