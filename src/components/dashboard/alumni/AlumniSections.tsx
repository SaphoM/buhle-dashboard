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
import { ALUMNI_KPI_IDS, type AlumniSectionKey } from "../../../types/alumni";
import type {
  AlumniBusinessData,
  AlumniConfig,
  AlumniEmploymentData,
  AlumniDataSource,
  AlumniEngagementData,
  AlumniFarmData,
  AlumniLoanData,
  AlumniMarketData,
  AlumniReferralData,
  AlumniReport,
  BusinessRecord,
  EmploymentRecord,
  EngagementRecord,
  FarmRecord,
  LoanRecord,
  MarketRecord,
  ReferralRecord,
} from "../../../types/alumni";
import {
  blankBusinessRecord,
  blankEngagementRecord,
  blankFarmRecord,
  blankLoanRecord,
  blankMarketRecord,
  blankReferralRecord,
  blankEmploymentRecord,
} from "../../../data/alumniSeed";
import {
  previewAlumniStatus,
  summariseBusiness,
  summariseEmployment,
  summariseEngagement,
  summariseFarm,
  summariseLoans,
  summariseMarket,
  summariseReferrals,
  yieldPerHectare,
} from "../../../data/alumniEngine";
import type { CohortSummary } from "../../../data/alumniEngine";

/**
 * The seven Alumni registers, plus the cohort block that they all hang off.
 *
 * The same shape as the Operations, Farming and Marketing sections, for the same
 * reasons, with one rule that matters more here than anywhere else in the
 * system:
 *
 *  NO RATE IS TYPEABLE. There is no percentage input in this file. Not
 *  employment, not business survival, not loan repayment, not participation,
 *  not engagement. Every one is computed from the rows below it, because in a
 *  tracer study a typed rate and its register can disagree, and the whole value
 *  of the department is that the two match.
 *
 *  A CONSEQUENCE: every rate readout shows its denominator next to it. "66.7%"
 *  on its own is a claim; "66.7% of 3 confirmed graduates" is a fact with a size
 *  attached. The formatting helpers below all take the sample size for that
 *  reason, and `rateWithBase` deliberately renders "Not derivable yet" for null
 *  rather than 0%.
 */

/** Ids for newly typed rows. A timestamp alone would collide when two rows are
 *  added in the same millisecond, which a fast operator can do. */
let rowCounter = 0;
function uid(): string {
  rowCounter += 1;
  return `alumni-rec-${Date.now().toString(36)}-${rowCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * A rate, always shown against the number of people it came from.
 *
 * The `of N` clause is not decoration. A reader who sees "90% of 3 graduates"
 * and a reader who sees "90% of 140 graduates" should be able to tell at a
 * glance that these are not the same claim, and this is the only place in the UI
 * where that distinction is visible before the report leaves the department.
 */
function rateWithBase(value: number | null | undefined, base: number, noun: string): string {
  if (value === null || value === undefined) return "Not derivable yet";
  if (base <= 0) return "Not derivable yet";
  return `${value.toFixed(1)}% of ${base} ${noun}`;
}

/** A rate with no meaningful denominator, such as a conversion rate over
 *  referrals whose outcome is known. */
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "Not derivable yet" : `${v.toFixed(1)}%`;
const count = (v: number | null | undefined) =>
  v === null || v === undefined ? "None recorded" : v.toLocaleString("en-ZA");
const money = (v: number | null | undefined, symbol: string) =>
  v === null || v === undefined ? "Not derivable yet" : `${symbol}${Math.round(v).toLocaleString("en-ZA")}`;

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
    <TextArea
      label="Section commentary"
      value={value}
      onChange={onChange}
      hint={hint}
      rows={2}
      placeholder="What a reader needs to know about this cohort"
    />
  );
}

/** The provenance tag every section carries.
 *
 *  Nothing in a tracer study is a live feed. Every figure comes from a person
 *  speaking to a graduate, and a reader who assumes a system writes this
 *  register directly will read last cycle's number as though it were current. */
function AlumniSourceTag({ source, reportingPeriod }: { source: AlumniDataSource; reportingPeriod: string }) {
  return (
    <SourceTag
      kind={source.kind === "Manual Entry" ? "Manual entry" : "Not submitted"}
      period={reportingPeriod}
      detail={
        source.enteredAt
          ? `Entered ${new Date(source.enteredAt).toLocaleDateString("en-ZA")}${source.enteredBy ? ` by ${source.enteredBy}` : ""}`
          : undefined
      }
      footnote="Typed by a person who contacted the graduate"
    />
  );
}

function AlumniWarningPreview({
  items,
  config,
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string; label?: string }[];
  config: AlumniConfig;
}) {
  return <WarningPreview items={items} previewStatus={previewAlumniStatus} currencySymbol={config.currencySymbol} />;
}

function NotApplicable({
  checked,
  onChange,
  what,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  what: string;
}) {
  return <NotApplicableToggle checked={checked} onChange={onChange} what={what} />;
}

// ---------------------------------------------------------------------------
// Section 0 - The cohort block
// ---------------------------------------------------------------------------

/**
 * The cohort block, shown FIRST and before any register.
 *
 * It is placed above the seven registers rather than as an eighth one because
 * it is not a register of anything: it is the size of the population and the
 * number of them reached, and every rate on the other six tabs divides by those
 * two figures. Putting it at the end would mean somebody had filled in a
 * tracer study before being told what it was a sample of.
 */
export function CohortBlockSection({
  report,
  summary,
  onChange,
  config,
}: {
  report: AlumniReport;
  summary: CohortSummary | null;
  onChange: (cohort: AlumniReport["cohort"]) => void;
  config: AlumniConfig;
}) {
  const cohort = report.cohort;
  const coverageGap =
    summary && summary.traced + summary.untraceable < summary.graduatesInCohort
      ? summary.graduatesInCohort - summary.traced - summary.untraceable
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3">
        <p className="text-xs font-semibold text-amber-900">Start here</p>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80">
          Every rate in this tracer study describes only the graduates who answered. Enter how many were in the
          cohort and how many you reached, because that is what tells a reader how far the percentages can be
          trusted. A rate from twelve people out of two hundred is not the same claim as a rate from a hundred
          and twenty.
        </p>
      </div>

      <Fieldset title="Who was in this cohort">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField
            label="Graduates in cohort"
            value={cohort.graduatesInCohort}
            onChange={(v) => onChange({ ...cohort, graduatesInCohort: v })}
            required
            hint="Everyone due to be traced. This is the denominator of every rate below."
          />
          <NumberField
            label="Traced this period"
            value={cohort.tracedThisPeriod}
            onChange={(v) => onChange({ ...cohort, tracedThisPeriod: v })}
            required
            hint="How many were reached and gave usable answers."
          />
          <SelectField
            label="Tracing method"
            value={cohort.tracingMethod}
            options={config.tracingMethods}
            onChange={(v) => onChange({ ...cohort, tracingMethod: v })}
            blankLabel="Not set"
            hint="A 30% response rate by WhatsApp and one by registered post are different facts."
          />
          <NumberField
            label="Could not be reached"
            value={cohort.untraceable}
            onChange={(v) => onChange({ ...cohort, untraceable: v })}
            hint="Leave blank if you did not count them."
          />
        </div>
      </Fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Readout
          label="Response rate"
          value={
            summary && summary.responseRatePct !== null
              ? rateWithBase(summary.responseRatePct, summary.graduatesInCohort, "graduates")
              : "Not derivable yet"
          }
          hint={
            summary
              ? `${summary.traced} traced of ${summary.graduatesInCohort} in the cohort`
              : "Enter the cohort size and the number traced"
          }
        />
        <Readout
          label="Coverage"
          value={summary && summary.coveragePct !== null ? pct(summary.coveragePct) : "Not derivable yet"}
          hint="Traced plus untraceable, against the cohort"
        />
        <Readout
          label="Not yet accounted for"
          value={count(coverageGap)}
          hint={
            coverageGap > 0
              ? "Neither traced nor recorded as unreachable. Fine to leave if you are still working through the list."
              : "Everyone is either traced or recorded as unreachable"
          }
        />
      </div>

      {summary?.belowMinimumResponse && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3">
          <p className="text-xs font-semibold text-amber-900">
            Below the {summary.minimumResponseRatePct}% minimum response rate
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80">
            Only {summary.responseRatePct}% of this cohort was traced. That does not stop you submitting: a cohort
            that is hard to reach is often the one most worth reporting on. But every rate below describes these{" "}
            {summary.traced} graduates and not the whole cohort, so say so in your commentary before this goes to
            the board.
          </p>
        </div>
      )}

      <Commentary
        value={cohort.notes}
        onChange={(v) => onChange({ ...cohort, notes: v })}
        hint="How the tracing exercise went: a contact list that had gone stale, a cohort that had moved, anything a reader should know before reading the rates."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 - Employment
// ---------------------------------------------------------------------------

export function EmploymentSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"employment">;
  onChange: (data: AlumniSectionData<"employment">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseEmployment(data, config);
  const update = (id: string, patch: Partial<EmploymentRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const activeKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.economicallyActive);
  const employedKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.employmentRate);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Employment reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Employment reporting"
          reason="No graduate was traced this period, so there is no employment situation to report. Marking this Not Applicable records that fact; leaving it empty records an oversight."
        />
      ) : (
        <>
          <Fieldset title="What each traced graduate is doing">
            <RecordTable
              rows={data.records}
              addLabel="Add a graduate"
              emptyText="No graduates traced yet. Add one row per graduate you spoke to."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankEmploymentRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "graduateId",
                  label: "Graduate",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Graduate reference"
                      value={r.graduateId}
                      onChange={(v) => patch({ graduateId: v } as never)}
                      required
                      hint="The ID used by the farm, market and engagement registers."
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  required: true,
                  render: (r, patch) => (
                    <SelectField
                      label="Employment status"
                      value={r.status}
                      options={config.employmentStatuses}
                      onChange={(v) => patch({ status: v } as never)}
                      required
                      allowBlank={false}
                    />
                  ),
                },
                {
                  key: "verified",
                  label: "Confirmed",
                  required: true,
                  render: (r, patch) => (
                    <Checkbox
                      label="Confirmed with the graduate"
                      checked={r.verified}
                      onChange={(v) => patch({ verified: v } as never)}
                      hint="Only confirmed rows count towards the rate."
                    />
                  ),
                },
                {
                  key: "dateConfirmed",
                  label: "Date confirmed",
                  render: (r, patch) => (
                    <TextField
                      label="Date confirmed"
                      type="date"
                      value={r.dateConfirmed}
                      onChange={(v) => patch({ dateConfirmed: v } as never)}
                    />
                  ),
                },
                {
                  key: "employer",
                  label: "Employer",
                  render: (r, patch) => (
                    <TextField
                      label="Employer"
                      value={r.employer}
                      onChange={(v) => patch({ employer: v } as never)}
                    />
                  ),
                },
                {
                  key: "monthlyIncome",
                  label: "Monthly income",
                  render: (r, patch) => (
                    <NumberField
                      label="Monthly income"
                      value={r.monthlyIncome}
                      onChange={(v) => patch({ monthlyIncome: v } as never)}
                      hint="Optional. Leave blank if they would not say."
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Economically active"
              value={
                summary ? rateWithBase(summary.economicallyActiveRatePct, summary.sampleSize, "confirmed") : "Not derivable yet"
              }
              hint={
                summary
                  ? `${summary.economicallyActive} of ${summary.sampleSize} confirmed. Further education is NOT counted as active.`
                  : "Enter at least one confirmed graduate"
              }
            />
            <Readout
              label="In employment"
              value={summary ? rateWithBase(summary.employmentRatePct, summary.sampleSize, "confirmed") : "Not derivable yet"}
              hint={
                summary
                  ? `${summary.inEmployment} employed or self-employed. Family enterprise work is active but not employment.`
                  : "Employed and self-employed only"
              }
            />
            <Readout
              label="Confirmed vs unconfirmed"
              value={summary ? `${summary.verified} of ${summary.total}` : "None recorded"}
              hint={
                summary && summary.unverified > 0
                  ? `${summary.unverified} row(s) excluded from the rates until confirmed.`
                  : "Every row is confirmed"
              }
            />
          </div>

          {summary && summary.unverified > 0 && (
            <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3 text-[11px] leading-relaxed text-ink-soft/70">
              An unconfirmed status is excluded from the rates above rather than counted as unemployment. A
              two-year-old "Employed" is an assumption, and counting it either way would turn a stale record into a
              fact about this cohort.
            </div>
          )}

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: activeKpi,
                value: summary?.economicallyActiveRatePct ?? null,
                label: "Economically Active Rate",
                emptyNote:
                  summary && summary.verified === 0
                    ? "No status has been confirmed, so there is no rate. Unconfirmed rows are excluded rather than assumed."
                    : "No graduates traced, so there is no employment situation to report.",
              },
              {
                kpi: employedKpi,
                value: summary?.employmentRatePct ?? null,
                label: "In Employment",
                emptyNote:
                  summary && summary.sampleSize > 0
                    ? `None of the ${summary.sampleSize} confirmed graduates are recorded as employed or self-employed.`
                    : "No employment status confirmed for any traced graduate.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="Anything a reader needs before trusting the rate: how many declined to answer, whether a whole employer closed and affected several graduates, and so on."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 - Business sustainability
// ---------------------------------------------------------------------------

export function BusinessSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"business">;
  onChange: (data: AlumniSectionData<"business">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseBusiness(data.records, report.dueDate);
  const update = (id: string, patch: Partial<BusinessRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const survivalKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.businessSurvivalRate);
  const monthsKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.businessSurvivalMonths);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Business reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Business reporting"
          reason="No graduate in this cohort has started a business. Record that fact rather than leaving an empty register that looks like an oversight."
        />
      ) : (
        <>
          <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3 text-[11px] leading-relaxed text-ink-soft/70">
            Report every business that is trading now, including ones that started before this period. A business
            that began two years ago and is still running belongs in this register: it is the outcome the programme
            is being measured on, not a duplicate of an earlier figure.
          </div>

          <Fieldset title="Businesses started by graduates">
            <RecordTable
              rows={data.records}
              addLabel="Add a business"
              emptyText="No businesses recorded."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankBusinessRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "businessName",
                  label: "Business",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Business name"
                      value={r.businessName}
                      onChange={(v) => patch({ businessName: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "graduateId",
                  label: "Owner",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Graduate reference"
                      value={r.graduateId}
                      onChange={(v) => patch({ graduateId: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "sector",
                  label: "Sector",
                  render: (r, patch) => (
                    <SelectField
                      label="Sector"
                      value={r.sector}
                      options={config.businessSectors}
                      onChange={(v) => patch({ sector: v } as never)}
                    />
                  ),
                },
                {
                  key: "startDate",
                  label: "Started",
                  render: (r, patch) => (
                    <TextField
                      label="Start date"
                      type="date"
                      value={r.startDate}
                      onChange={(v) => patch({ startDate: v } as never)}
                      hint="Used to work out how long it has been trading."
                    />
                  ),
                },
                {
                  key: "stillTrading",
                  label: "Trading",
                  required: true,
                  render: (r, patch) => (
                    <Checkbox
                      label="Still trading"
                      checked={r.stillTrading}
                      onChange={(v) => patch({ stillTrading: v } as never)}
                    />
                  ),
                },
                {
                  key: "monthlyRevenue",
                  label: "Revenue",
                  render: (r, patch) => (
                    <NumberField
                      label="Monthly revenue"
                      value={r.monthlyRevenue}
                      onChange={(v) => patch({ monthlyRevenue: v } as never)}
                      hint="Optional."
                    />
                  ),
                },
                ...(data.records.length > 0 && data.records.some((r) => !r.stillTrading)
                  ? [
                      {
                        key: "reasonClosed",
                        label: "Closure reason",
                        required: true,
                        render: (r: BusinessRecord, patch: (v: never) => void) => (
                          <TextField
                            label="Why it closed"
                            value={r.reasonClosed}
                            onChange={(v) => patch({ reasonClosed: v } as never)}
                            required={!r.stillTrading}
                            wide
                            hint="A closed business with no reason is counted by the survival rate but teaches nobody anything."
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Still trading"
              value={summary ? rateWithBase(summary.survivalRatePct, summary.total, "businesses") : "Not derivable yet"}
              hint={
                summary
                  ? `${summary.stillTrading} trading, ${summary.closed} closed of ${summary.total} recorded.`
                  : "No businesses recorded"
              }
            />
            <Readout
              label="Median months trading"
              value={
                summary && summary.medianMonthsTrading !== null
                  ? `${summary.medianMonthsTrading} months`
                  : "Not derivable yet"
              }
              hint={
                summary && summary.medianMonthsTrading === null
                  ? "No surviving business has a start date, so no duration can be counted."
                  : "Surviving businesses only. A closed business's length is its lifespan, not its survival."
              }
            />
            <Readout
              label="Monthly revenue"
              value={summary ? money(summary.totalMonthlyRevenue, config.currencySymbol) : "Not derivable yet"}
              hint={summary ? `Across ${summary.total} business(es)` : "No businesses recorded"}
            />
          </div>

          {summary && summary.closedWithoutReason > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900/80">
              {summary.closedWithoutReason} closed business row(s) have no reason recorded. They still count towards
              the survival rate, but a reader cannot tell a business that closed in the ordinary way from one that
              was never really going to work.
            </div>
          )}

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: survivalKpi,
                value: summary?.survivalRatePct ?? null,
                label: "Business Survival Rate",
                emptyNote: summary
                  ? `None of the ${summary.total} recorded businesses is still trading.`
                  : "No businesses started by graduates were recorded.",
              },
              {
                kpi: monthsKpi,
                value: summary?.medianMonthsTrading ?? null,
                label: "Median Months Trading",
                emptyNote: summary
                  ? "No surviving business has a start date, so no survival duration can be reported."
                  : "No businesses recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="What closed and why, in plain terms. This is the part a board actually wants to hear."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3 - Farm productivity
// ---------------------------------------------------------------------------

export function FarmSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"farm">;
  onChange: (data: AlumniSectionData<"farm">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseFarm(data.records);
  const update = (id: string, patch: Partial<FarmRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const yieldKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.farmYieldPerHa);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Farm reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Farm reporting"
          reason="No graduate in this cohort farms. Record that fact rather than leaving an empty register."
        />
      ) : (
        <>
          <Fieldset title="Farms run by graduates">
            <div className="mb-2 text-[11px] leading-relaxed text-ink-soft/50">
              One row per crop or per livestock line. A mixed farm is two rows, not one, so the area and the yield
              are not attributed to the wrong thing.
            </div>
            <RecordTable
              rows={data.records}
              addLabel="Add a farm line"
              emptyText="No farms recorded."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankFarmRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "graduateId",
                  label: "Farmer",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Graduate reference"
                      value={r.graduateId}
                      onChange={(v) => patch({ graduateId: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "crop",
                  label: "Crop",
                  render: (r, patch) => (
                    <SelectField
                      label="Crop"
                      value={r.crop}
                      options={config.crops}
                      onChange={(v) => patch({ crop: v } as never)}
                      blankLabel="Livestock only"
                    />
                  ),
                },
                {
                  key: "livestockCategory",
                  label: "Livestock",
                  render: (r, patch) => (
                    <SelectField
                      label="Livestock category"
                      value={r.livestockCategory}
                      options={config.livestockCategories}
                      onChange={(v) => patch({ livestockCategory: v } as never)}
                      blankLabel="Crop only"
                    />
                  ),
                },
                {
                  key: "areaHa",
                  label: "Area",
                  render: (r, patch) => (
                    <NumberField
                      label="Area (ha)"
                      value={r.areaHa}
                      onChange={(v) => patch({ areaHa: v } as never)}
                      hint="Needed for a yield figure."
                    />
                  ),
                },
                {
                  key: "totalHarvest",
                  label: "Harvest",
                  render: (r, patch) => (
                    <NumberField
                      label="Total harvest"
                      value={r.totalHarvest}
                      onChange={(v) => patch({ totalHarvest: v } as never)}
                    />
                  ),
                },
                {
                  key: "harvestUnit",
                  label: "Unit",
                  render: (r, patch) => (
                    <SelectField
                      label="Harvest unit"
                      value={r.harvestUnit}
                      options={config.massUnits}
                      onChange={(v) => patch({ harvestUnit: v } as never)}
                    />
                  ),
                },
                {
                  key: "livestockHead",
                  label: "Head",
                  render: (r, patch) => (
                    <NumberField
                      label="Livestock head"
                      value={r.livestockHead}
                      onChange={(v) => patch({ livestockHead: v } as never)}
                    />
                  ),
                },
                ...(data.records.length > 0
                  ? [
                      {
                        key: "derivedYield",
                        label: "Derived yield",
                        render: (r: FarmRecord) => (
                          <Readout
                            label="Yield per hectare"
                            value={
                              yieldPerHectare(r) !== null
                                ? `${yieldPerHectare(r)?.toLocaleString("en-ZA")} kg/ha`
                                : "Not derivable"
                            }
                            hint={
                              !r.areaHa || !r.totalHarvest
                                ? "Needs an area and a harvest."
                                : r.harvestUnit === "bags" || r.harvestUnit === "crates"
                                  ? `A ${r.harvestUnit} count cannot be converted without a declared weight per unit.`
                                  : "Calculated, not typed."
                            }
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Mean yield per hectare"
              value={
                summary && summary.meanYieldPerHa !== null
                  ? `${summary.meanYieldPerHa.toLocaleString("en-ZA")} kg/ha`
                  : "Not derivable yet"
              }
              hint={
                summary
                  ? `Mean of ${summary.sampleSize} line(s) with an area, a harvest and a convertible unit.`
                  : "No farms recorded"
              }
            />
            <Readout
              label="Total area"
              value={summary ? `${summary.totalAreaHa.toLocaleString("en-ZA")} ha` : "Not derivable yet"}
              hint={summary ? `Across ${summary.graduatesFarming} farming graduate(s)` : "No farms recorded"}
            />
            <Readout
              label="Livestock"
              value={summary ? `${summary.totalLivestockHead.toLocaleString("en-ZA")} head` : "None recorded"}
              hint={summary ? `${summary.livestockLines} livestock line(s)` : "No farms recorded"}
            />
          </div>

          {summary && summary.rowsExcludedForUnconvertibleUnit > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900/80">
              {summary.rowsExcludedForUnconvertibleUnit} line(s) record a harvest in bags or crates. Those are
              perfectly good ways to count a harvest, but a bag is not a fixed weight, so they are left out of the
              yield figure rather than converted on an assumed 50kg. If the graduates know the weight per bag, record
              the harvest in kilograms instead and it will count.
            </div>
          )}

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: yieldKpi,
                value: summary?.meanYieldPerHa ?? null,
                label: "Mean Farm Yield",
                emptyNote:
                  summary && summary.rowsExcludedForUnconvertibleUnit > 0
                    ? `${summary.rowsExcludedForUnconvertibleUnit} line(s) recorded in bags or crates, which cannot be converted to a yield without a declared weight per unit.`
                    : "No farm line has both an area and a harvest in a convertible unit.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="Weather, inputs, labour. Anything that would explain a yield that moved."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4 - Loan repayment
// ---------------------------------------------------------------------------

export function LoanSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"loans">;
  onChange: (data: AlumniSectionData<"loans">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseLoans(data.records);
  const update = (id: string, patch: Partial<LoanRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const repaymentKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.loanRepaymentRate);
  const arrearsKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.loanArrearsValue);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Loan reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Loan reporting"
          reason="Buhle has issued no loans to alumni enterprises in this period. Record that rather than leaving an empty register."
        />
      ) : (
        <>
          <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3 text-[11px] leading-relaxed text-ink-soft/70">
            These are Buhle's own loans, so this is our book rather than something a graduate is telling us about a
            third party. A written-off loan counts as NOT repaid, and its balance stays in the arrears figure,
            because excluding it would make the book look healthier exactly when the money has gone.
          </div>

          <Fieldset title="Loans to alumni enterprises">
            <RecordTable
              rows={data.records}
              addLabel="Add a loan"
              emptyText="No loans recorded."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankLoanRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "loanReference",
                  label: "Reference",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Loan reference"
                      value={r.loanReference}
                      onChange={(v) => patch({ loanReference: v } as never)}
                      required
                      hint="Must be unique. The same loan twice understates the arrears balance."
                    />
                  ),
                },
                {
                  key: "borrower",
                  label: "Borrower",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Graduate or business"
                      value={r.borrower}
                      onChange={(v) => patch({ borrower: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "principal",
                  label: "Principal",
                  required: true,
                  render: (r, patch) => (
                    <NumberField
                      label="Original amount"
                      value={r.principal}
                      onChange={(v) => patch({ principal: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "balanceOutstanding",
                  label: "Balance",
                  required: true,
                  render: (r, patch) => (
                    <NumberField
                      label="Balance outstanding"
                      value={r.balanceOutstanding}
                      onChange={(v) => patch({ balanceOutstanding: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "instalmentAmount",
                  label: "Instalment",
                  render: (r, patch) => (
                    <NumberField
                      label="Monthly instalment"
                      value={r.instalmentAmount}
                      onChange={(v) => patch({ instalmentAmount: v } as never)}
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  required: true,
                  render: (r, patch) => (
                    <SelectField
                      label="Status"
                      value={r.status}
                      options={config.loanStatuses}
                      onChange={(v) => patch({ status: v } as never)}
                      required
                      allowBlank={false}
                    />
                  ),
                },
                {
                  key: "arrearsMonths",
                  label: "Arrears",
                  required: true,
                  render: (r, patch) => (
                    <NumberField
                      label="Months in arrears"
                      value={r.arrearsMonths}
                      onChange={(v) => patch({ arrearsMonths: v } as never)}
                      hint={r.status === "Arrears" ? "Required while in arrears." : "Only while in arrears."}
                    />
                  ),
                },
                {
                  key: "instalmentDueDate",
                  label: "Next due",
                  render: (r, patch) => (
                    <TextField
                      label="Next instalment due"
                      type="date"
                      value={r.instalmentDueDate}
                      onChange={(v) => patch({ instalmentDueDate: v } as never)}
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Repayment rate"
              value={summary ? rateWithBase(summary.repaymentRatePct, summary.totalLoans, "loans") : "Not derivable yet"}
              hint={
                summary
                  ? `${summary.current + summary.paidOff} current or paid off. ${summary.writtenOff} written off counts as NOT repaid.`
                  : "No loans recorded"
              }
            />
            <Readout
              label="Balance in arrears"
              value={summary ? money(summary.arrearsValue, config.currencySymbol) : "Not derivable yet"}
              hint={
                summary
                  ? `${summary.arrears} in arrears, ${summary.writtenOff} written off.`
                  : "No loans recorded"
              }
            />
            <Readout
              label="Still outstanding"
              value={summary ? money(summary.totalOutstanding, config.currencySymbol) : "Not derivable yet"}
              hint={summary ? `Of ${money(summary.totalPrincipal, config.currencySymbol)} advanced` : "No loans recorded"}
            />
          </div>

          {summary && summary.duplicateReferences.length > 0 && (
            <div className="rounded-xl border border-rose-300/60 bg-rose-50/60 p-3 text-[11px] leading-relaxed text-rose-900/80">
              Loan reference(s) {summary.duplicateReferences.join(", ")} appear more than once. Each loan should be
              recorded once, or the arrears balance and the repayment rate will both be wrong.
            </div>
          )}

          {summary && summary.arrears > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900/80">
              {summary.arrears} loan(s) are in arrears, worth {money(summary.arrearsValue, config.currencySymbol)}.
              This does not block submission, but these are Buhle's own loans and the commentary should state a
              recovery position before the report reaches the board.
              {summary.arrearsWithoutMonths > 0 && (
                <> {summary.arrearsWithoutMonths} of them have no arrears duration recorded.</>
              )}
            </div>
          )}

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: repaymentKpi,
                value: summary?.repaymentRatePct ?? null,
                label: "Loan Repayment Rate",
                emptyNote: summary
                  ? `None of the ${summary.totalLoans} recorded loans is current or paid off. Written-off loans are counted as not repaid.`
                  : "No loans to alumni enterprises were recorded.",
              },
              {
                kpi: arrearsKpi,
                value: summary?.arrearsValue ?? null,
                label: "Loan Balance in Arrears",
                emptyNote: summary
                  ? "No loan is in arrears or written off."
                  : "No loans recorded, so there is no arrears balance.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="Recovery position on anything in arrears, and why anything was written off."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5 - Referrals
// ---------------------------------------------------------------------------

export function ReferralSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"referrals">;
  onChange: (data: AlumniSectionData<"referrals">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseReferrals(data.records);
  const update = (id: string, patch: Partial<ReferralRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const countKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.referralsReceived);
  const conversionKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.referralConversionRate);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Referral reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Referral reporting"
          reason="No graduate referred anyone this period. Record that rather than leaving an empty register."
        />
      ) : (
        <>
          <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3 text-[11px] leading-relaxed text-ink-soft/70">
            One row per person a graduate referred. Use Awaiting decision or Unreachable rather than a failure
            when nobody has come back yet: those two are left out of the conversion rate, so the number describes
            what is actually known instead of the referrer&apos;s impatience.
          </div>

          <Fieldset title="Prospective students referred by graduates">
            <RecordTable
              rows={data.records}
              addLabel="Add a referral"
              emptyText="No referrals recorded."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankReferralRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "referrerName",
                  label: "Referrer",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Referring graduate"
                      value={r.referrerName}
                      onChange={(v) => patch({ referrerName: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "referredPersonName",
                  label: "Referred person",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Referred person"
                      value={r.referredPersonName}
                      onChange={(v) => patch({ referredPersonName: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "programmeReferred",
                  label: "Programme",
                  render: (r, patch) => (
                    <TextField
                      label="Programme"
                      value={r.programmeReferred}
                      onChange={(v) => patch({ programmeReferred: v } as never)}
                    />
                  ),
                },
                {
                  key: "dateReferred",
                  label: "Date referred",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Date referred"
                      type="date"
                      value={r.dateReferred}
                      onChange={(v) => patch({ dateReferred: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "channel",
                  label: "Channel",
                  render: (r, patch) => (
                    <SelectField
                      label="How they heard"
                      value={r.channel}
                      options={config.referralChannels}
                      onChange={(v) => patch({ channel: v } as never)}
                    />
                  ),
                },
                {
                  key: "outcome",
                  label: "Outcome",
                  render: (r, patch) => (
                    <SelectField
                      label="Outcome"
                      value={r.outcome}
                      options={config.referralOutcomes}
                      onChange={(v) => patch({ outcome: v } as never)}
                    />
                  ),
                },
                {
                  key: "outcomeDate",
                  label: "Outcome date",
                  render: (r, patch) => (
                    <TextField
                      label="Outcome date"
                      type="date"
                      value={r.outcomeDate}
                      onChange={(v) => patch({ outcomeDate: v } as never)}
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Referrals received"
              value={summary ? count(summary.referrals) : "None recorded"}
              hint={
                summary
                  ? `${summary.duplicates} duplicate(s) excluded. From ${summary.distinctReferrers} referring graduate(s).`
                  : "No referrals recorded"
              }
            />
            <Readout
              label="Conversion rate"
              value={summary ? rateWithBase(summary.conversionRatePct, summary.outcomesKnown, "known outcomes") : "None recorded"}
              hint={
                summary
                  ? `${summary.enrolled} enrolled of ${summary.outcomesKnown} with a known outcome. ${summary.pending} awaiting, ${summary.unreachable} unreachable.`
                  : "No referrals recorded"
              }
            />
            <Readout
              label="Best channel"
              value={summary && summary.topChannels.length > 0 ? summary.topChannels[0].channel : "None recorded"}
              hint={
                summary && summary.topChannels.length > 0
                  ? `${summary.topChannels[0].count} referral(s) via this channel`
                  : "No channel recorded"
              }
            />
          </div>

          {summary && summary.outcomesKnown === 0 && summary.referrals > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900/80">
              {summary.referrals} referral(s) recorded and none has a known outcome yet, so there is no conversion
              rate. Reporting 0% here would say every referral failed, which is not what is known.
            </div>
          )}

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: countKpi,
                value: summary?.referrals ?? null,
                label: "Referrals Received",
                emptyNote: summary?.totalRows
                  ? "Every referral recorded was marked Duplicate, so no real referrals can be counted."
                  : "Graduates have not referred anyone this period.",
              },
              {
                kpi: conversionKpi,
                value: summary?.conversionRatePct ?? null,
                label: "Referral Conversion Rate",
                emptyNote:
                  summary && summary.referrals > 0 && summary.outcomesKnown === 0
                    ? `${summary.referrals} referral(s) recorded but none has a known outcome yet, so there is no conversion rate.`
                    : summary
                      ? `None of the ${summary.outcomesKnown} referrals with a known outcome resulted in an enrolment.`
                      : "No referrals were recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="What is working about the referral programme, and anything still pending."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 6 - Market participation
// ---------------------------------------------------------------------------

export function MarketSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"market">;
  onChange: (data: AlumniSectionData<"market">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseMarket(data.records);
  const update = (id: string, patch: Partial<MarketRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const participationKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.marketParticipationRate);
  const revenueKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.marketRevenue);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Market reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Market reporting"
          reason="No traced graduate sells through a market. Record that rather than leaving an empty register."
        />
      ) : (
        <>
          <Fieldset title="Where graduates sell">
            <RecordTable
              rows={data.records}
              addLabel="Add a market"
              emptyText="No markets recorded."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankMarketRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "graduateId",
                  label: "Graduate",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Graduate reference"
                      value={r.graduateId}
                      onChange={(v) => patch({ graduateId: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "marketName",
                  label: "Market",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Market or buyer"
                      value={r.marketName}
                      onChange={(v) => patch({ marketName: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "marketType",
                  label: "Type",
                  required: true,
                  render: (r, patch) => (
                    <SelectField
                      label="Market type"
                      value={r.marketType}
                      options={config.marketTypes}
                      onChange={(v) => patch({ marketType: v } as never)}
                      required
                      allowBlank={false}
                    />
                  ),
                },
                {
                  key: "productCategory",
                  label: "Product",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="What is sold"
                      value={r.productCategory}
                      onChange={(v) => patch({ productCategory: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "frequencyOfSale",
                  label: "Frequency",
                  required: true,
                  render: (r, patch) => (
                    <SelectField
                      label="Sells this often"
                      value={r.frequencyOfSale}
                      options={config.saleFrequencies}
                      onChange={(v) => patch({ frequencyOfSale: v } as never)}
                      required
                      allowBlank={false}
                    />
                  ),
                },
                {
                  key: "averageMonthlyRevenue",
                  label: "Revenue",
                  render: (r, patch) => (
                    <NumberField
                      label="Average monthly sales"
                      value={r.averageMonthlyRevenue}
                      onChange={(v) => patch({ averageMonthlyRevenue: v } as never)}
                      hint="Optional."
                    />
                  ),
                },
                {
                  key: "hasFormalSpace",
                  label: "Formal space",
                  render: (r, patch) => (
                    <Checkbox
                      label="Has a formal stand or licence"
                      checked={r.hasFormalSpace}
                      onChange={(v) => patch({ hasFormalSpace: v } as never)}
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Graduates selling"
              value={summary ? count(summary.graduatesParticipating) : "None recorded"}
              hint={
                summary
                  ? `Across ${summary.totalRows} market row(s) and ${summary.marketsServed} market(s). One graduate counts once however many markets they use.`
                  : "No markets recorded"
              }
            />
            <Readout
              label="Monthly sales value"
              value={summary ? money(summary.totalMonthlyRevenue, config.currencySymbol) : "Not derivable yet"}
              hint={
                summary
                  ? `${summary.revenueReporting} of ${summary.totalRows} row(s) reported a figure.`
                  : "No markets recorded"
              }
            />
            <Readout
              label="With a formal stand"
              value={summary ? `${summary.withFormalSpace} of ${summary.totalRows}` : "None recorded"}
              hint={summary ? "The rest are selling informally." : "No markets recorded"}
            />
          </div>

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: participationKpi,
                value: null,
                label: "Market Participation Rate",
                emptyNote: "A participation rate needs both a market register and a traced cohort to divide by. It is shown on the dashboard once both exist.",
              },
              {
                kpi: revenueKpi,
                value: summary?.totalMonthlyRevenue ?? null,
                label: "Market Sales Revenue",
                emptyNote: summary && summary.revenueReporting === 0
                  ? "Markets were recorded but none reported a monthly sales value."
                  : "No market recorded a monthly sales value.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="Anything about access to markets that the numbers alone do not explain."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 7 - Engagement
// ---------------------------------------------------------------------------

export function EngagementSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: AlumniReport;
  data: AlumniSectionData<"engagement">;
  onChange: (data: AlumniSectionData<"engagement">) => void;
  kpis: Kpi[];
  config: AlumniConfig;
}) {
  const summary = summariseEngagement(data.records);
  const update = (id: string, patch: Partial<EngagementRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const engagementKpi = kpis.find((k) => k.id === ALUMNI_KPI_IDS.engagementRate);

  return (
    <div className="flex flex-col gap-4">
      <AlumniSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Engagement reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Engagement reporting"
          reason="No graduate did anything for the programme this period. Record that rather than leaving an empty register."
        />
      ) : (
        <>
          <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3 text-[11px] leading-relaxed text-ink-soft/70">
            Engagement means what a graduate does FOR the programme. Mentoring a learner, hosting a workshop,
            speaking at an event and donating all count. The activity date must fall inside this reporting period,
            because engagement is counted in the period it happened.
          </div>

          <Fieldset title="What graduates contributed">
            <RecordTable
              rows={data.records}
              addLabel="Add an activity"
              emptyText="No engagement recorded."
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankEngagementRecord(), id: uid() }] })}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onUpdate={update}
              columns={[
                {
                  key: "graduateId",
                  label: "Graduate",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Graduate reference"
                      value={r.graduateId}
                      onChange={(v) => patch({ graduateId: v } as never)}
                      required
                    />
                  ),
                },
                {
                  key: "activity",
                  label: "Activity",
                  required: true,
                  render: (r, patch) => (
                    <SelectField
                      label="Activity"
                      value={r.activity}
                      options={config.engagementActivities}
                      onChange={(v) => patch({ activity: v } as never)}
                      required
                      allowBlank={false}
                    />
                  ),
                },
                {
                  key: "activityDate",
                  label: "Date",
                  required: true,
                  render: (r, patch) => (
                    <TextField
                      label="Activity date"
                      type="date"
                      value={r.activityDate}
                      onChange={(v) => patch({ activityDate: v } as never)}
                      required
                      hint={`Must fall between ${report.startDate} and ${report.dueDate}.`}
                    />
                  ),
                },
                {
                  key: "hoursContributed",
                  label: "Hours",
                  render: (r, patch) => (
                    <NumberField
                      label="Hours contributed"
                      value={r.hoursContributed}
                      onChange={(v) => patch({ hoursContributed: v } as never)}
                      hint="Optional. Leave blank if not tracked."
                    />
                  ),
                },
                {
                  key: "othersReached",
                  label: "Others reached",
                  render: (r, patch) => (
                    <NumberField
                      label="Other graduates or learners reached"
                      value={r.othersReached}
                      onChange={(v) => patch({ othersReached: v } as never)}
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Readout
              label="Graduates engaged"
              value={summary ? count(summary.graduatesEngaged) : "None recorded"}
              hint={
                summary
                  ? `Across ${summary.totalRows} activity row(s). One graduate counts once however much they did.`
                  : "No engagement recorded"
              }
            />
            <Readout
              label="Hours contributed"
              value={summary ? `${summary.totalHours.toLocaleString("en-ZA")} hours` : "None recorded"}
              hint={
                summary
                  ? `${summary.hoursReporting} of ${summary.totalRows} row(s) recorded hours, so this is a partial measure.`
                  : "No engagement recorded"
              }
            />
            <Readout
              label="Most common activity"
              value={summary && summary.activityBreakdown.length > 0 ? summary.activityBreakdown[0].activity : "None recorded"}
              hint={
                summary && summary.activityBreakdown.length > 0
                  ? `${summary.activityBreakdown[0].count} occurrence(s)`
                  : "No activity recorded"
              }
            />
          </div>

          <AlumniWarningPreview
            config={config}
            items={[
              {
                kpi: engagementKpi,
                value: null,
                label: "Alumni Engagement Rate",
                emptyNote: "An engagement rate needs both an engagement register and a traced cohort to divide by. It is shown on the dashboard once both exist.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="Which graduates are doing the most, and whether there is anybody worth asking for more."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps a section key to the data block it edits, so each section component is
 *  typed to exactly one block and cannot be wired to the wrong one. */
type AlumniSectionDataMap = {
  employment: AlumniEmploymentData;
  business: AlumniBusinessData;
  farm: AlumniFarmData;
  loans: AlumniLoanData;
  referrals: AlumniReferralData;
  market: AlumniMarketData;
  engagement: AlumniEngagementData;
};

type AlumniSectionData<K extends AlumniSectionKey> = AlumniSectionDataMap[K];