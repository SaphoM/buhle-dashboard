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
import type {
  CampaignRecord,
  EnquiryRecord,
  LeadSourceRecord,
  MarketingCampaignData,
  MarketingConfig,
  MarketingDataSource,
  MarketingEnquiryData,
  MarketingLeadData,
  MarketingPartnershipData,
  MarketingReport,
  MarketingWebsiteData,
  PartnershipRecord,
  WebsiteActivityRecord,
} from "../../../types/marketing";
import {
  blankCampaignRecord,
  blankEnquiryRecord,
  blankLeadSourceRecord,
  blankPartnershipRecord,
  blankWebsiteActivityRecord,
} from "../../../data/marketingSeed";
import {
  previewMarketingStatus,
  summariseCampaigns,
  summariseEnquiries,
  summariseLeads,
  summarisePartnerships,
  summariseWebsite,
} from "../../../data/marketingEngine";

/**
 * The five Marketing registers.
 *
 * The same shape as the Operations and Farming sections, for the same reasons,
 * and with one rule that matters more here than anywhere else in the system:
 *
 *  NOTHING DERIVED IS TYPEABLE. There is no conversion rate input in this file.
 *  There is no enquiry count input, no cost per enquiry input, no active
 *  partnership count. In a marketing department the temptation is strongest,
 *  because a conversion rate is the number everybody wants to report and the
 *  easiest one to reach for when the register has not been filled in. So the
 *  conversion rate is computed from the enquiry rows, and where the rows cannot
 *  produce one, the KPI is left uncalculated with a reason attached rather than
 *  filled with a figure that looks like an answer.
 *
 * Each section also carries its own Not Applicable switch: "we ran no campaigns
 * this month" is a real and common fact, and it must not be recorded as an empty
 * register that blocks submission.
 */

/** Ids for newly typed rows. A timestamp alone would collide when two rows are
 *  added in the same millisecond, which a fast operator can do. */
function uid(): string {
  return `mkt-rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

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
      placeholder="What a reader needs to know about this month"
    />
  );
}

/** The provenance tag every section carries.
 *
 *  Marketing figures are typed by people, from analytics exports, newsletters
 *  and phone calls. Nothing here is a live feed, and a reader who assumes the
 *  analytics tool writes into this register directly will read a stale number
 *  as though it were current. */
function MarketingSourceTag({ source, reportingPeriod }: { source: MarketingDataSource; reportingPeriod: string }) {
  return (
    <SourceTag
      kind={source.kind === "Manual Entry" ? "Manual entry" : "Not submitted"}
      period={reportingPeriod}
      detail={
        source.enteredAt
          ? `Entered ${new Date(source.enteredAt).toLocaleDateString("en-ZA")}${source.enteredBy ? ` by ${source.enteredBy}` : ""}`
          : undefined
      }
      footnote="Typed by a person from analytics exports, newsletters and calls"
    />
  );
}

function MarketingWarningPreview({
  items,
  config,
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string; label?: string }[];
  config: MarketingConfig;
}) {
  return <WarningPreview items={items} previewStatus={previewMarketingStatus} currencySymbol={config.currencySymbol} />;
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
// Section 1 - Enquiries
// ---------------------------------------------------------------------------

export function EnquirySection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: MarketingReport;
  data: MarketingEnquiryData;
  onChange: (data: MarketingEnquiryData) => void;
  kpis: Kpi[];
  config: MarketingConfig;
}) {
  const summary = summariseEnquiries(report);
  const update = (id: string, patch: Partial<EnquiryRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const enqKpi = kpis.find((k) => k.id === "kpi-enquiries");
  const convKpi = kpis.find((k) => k.id === "kpi-conversion");

  return (
    <div className="flex flex-col gap-4">
      <MarketingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Enquiry reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Enquiries"
          reason="Marked Not Applicable. No enquiry KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Enquiry register (typed)"
            description="One row per person who asked about a programme. The outcome is what makes the conversion rate derivable, so an open enquiry stays blank rather than being guessed at."
          >
            <RecordTable<EnquiryRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankEnquiryRecord(), id: uid() }] })}
              addLabel="Add enquiry"
              emptyText="No enquiries recorded yet."
              columns={[
                {
                  key: "channel",
                  label: "Channel",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Channel"
                      value={row.channel}
                      options={config.enquiryChannels}
                      required
                      onChange={(v) => patch({ channel: v } as never)}
                    />
                  ),
                },
                {
                  key: "dateReceived",
                  label: "Date received",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Date received"
                      type="date"
                      value={row.dateReceived}
                      required
                      onChange={(v) => patch({ dateReceived: v } as never)}
                    />
                  ),
                },
                {
                  key: "programmeInterest",
                  label: "Programme",
                  render: (row, patch) => (
                    <TextField
                      label="Programme of interest"
                      value={row.programmeInterest}
                      onChange={(v) => patch({ programmeInterest: v } as never)}
                      placeholder="Learnership"
                    />
                  ),
                },
                {
                  key: "province",
                  label: "Province",
                  render: (row, patch) => (
                    <TextField label="Province" value={row.province} onChange={(v) => patch({ province: v } as never)} placeholder="Mpumalanga" />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Status"
                      value={row.status}
                      options={config.enquiryStatuses}
                      required
                      onChange={(v) => patch({ status: v } as never)}
                    />
                  ),
                },
                {
                  key: "outcome",
                  label: "Outcome",
                  render: (row, patch) => (
                    <SelectField
                      label="Outcome"
                      value={row.outcome}
                      options={config.enquiryOutcomes}
                      onChange={(v) => patch({ outcome: v } as never)}
                      hint="Leave blank while the enquiry is still open."
                    />
                  ),
                },
                {
                  key: "outcomeDate",
                  label: "Outcome date",
                  render: (row, patch) => (
                    <TextField label="Outcome date" type="date" value={row.outcomeDate} onChange={(v) => patch({ outcomeDate: v } as never)} />
                  ),
                },
                {
                  key: "contactVerified",
                  label: "Contact verified",
                  render: (row, patch) => (
                    <Checkbox
                      label="Contact details verified"
                      checked={row.contactVerified}
                      onChange={(v) => patch({ contactVerified: v } as never)}
                      hint="An unverified contact is excluded from the reportable conversion rate."
                    />
                  ),
                },
                {
                  key: "handledBy",
                  label: "Handled by",
                  render: (row, patch) => (
                    <TextField label="Handled by" value={row.handledBy} onChange={(v) => patch({ handledBy: v } as never)} />
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (row, patch) => (
                    <TextArea
                      label="Notes"
                      value={row.notes}
                      onChange={(v) => patch({ notes: v } as never)}
                      rows={1}
                      placeholder="Name the campaign here if the enquiry came from one"
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="What changed this month, and why"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label="Enquiries recorded" value={count(summary?.total)} />
            <Readout label="Excluding duplicates" value={count(summary?.totalExcludingDuplicates)} />
            <Readout label="Converted" value={count(summary?.converted)} />
            <Readout label="Still deciding" value={count(summary?.open)} hint="Not a failure, just unresolved" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout
              label="Conversion rate"
              value={pct(summary?.conversionRatePct)}
              hint="Converted of all enquiries, excluding duplicates"
            />
            <Readout
              label="Reportable rate"
              value={pct(summary?.reportableConversionRatePct)}
              hint="Excludes unverified contacts entirely"
            />
            <Readout label="Unverifiable contacts" value={count(summary?.unverifiable)} />
            <Readout label="Duplicates excluded" value={count(summary?.duplicates)} />
          </div>

          {summary && summary.outcomesRecorded === 0 && (
            <NoDataNote
              what="Conversion rate"
              reason={`No outcome has been recorded for any of the ${summary.totalExcludingDuplicates} enquiries. Reporting 0% would say every enquiry failed, which is not what is known, so the KPI will be left uncalculated.`}
            />
          )}

          <MarketingWarningPreview
            config={config}
            items={[
              {
                kpi: enqKpi,
                value: summary?.total ?? null,
                emptyNote: "No enquiries recorded.",
                label: "Student Enquiries",
              },
              {
                kpi: convKpi,
                value: summary?.reportableConversionRatePct ?? null,
                emptyNote: "No outcomes recorded, so no rate to calculate.",
                label: "Enquiry to Enrolment Conversion",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 - Campaigns
// ---------------------------------------------------------------------------

export function CampaignSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: MarketingReport;
  data: MarketingCampaignData;
  onChange: (data: MarketingCampaignData) => void;
  kpis: Kpi[];
  config: MarketingConfig;
}) {
  const summary = summariseCampaigns(report);
  const update = (id: string, patch: Partial<CampaignRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <MarketingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Campaign reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Campaigns"
          reason="Marked Not Applicable. No campaign KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Campaign register (typed)"
            description="One row per campaign. Spend is recorded here and the enquiries it produced are recorded on the enquiry register with the campaign named, which is what makes cost per enquiry derivable instead of typed."
          >
            <RecordTable<CampaignRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankCampaignRecord(), id: uid() }] })}
              addLabel="Add campaign"
              emptyText="No campaigns recorded yet."
              columns={[
                {
                  key: "name",
                  label: "Name",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Campaign name"
                      value={row.name}
                      required
                      onChange={(v) => patch({ name: v } as never)}
                      hint="Referenced by the enquiry register."
                    />
                  ),
                },
                {
                  key: "channel",
                  label: "Channel",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Channel"
                      value={row.channel}
                      options={config.campaignChannels}
                      required
                      onChange={(v) => patch({ channel: v } as never)}
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Status"
                      value={row.status}
                      options={config.campaignStatuses}
                      required
                      onChange={(v) => patch({ status: v } as never)}
                    />
                  ),
                },
                {
                  key: "startDate",
                  label: "Start date",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Start date"
                      type="date"
                      value={row.startDate}
                      required
                      onChange={(v) => patch({ startDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "endDate",
                  label: "End date",
                  render: (row, patch) => (
                    <TextField
                      label="End date"
                      type="date"
                      value={row.endDate}
                      onChange={(v) => patch({ endDate: v } as never)}
                      hint="Required once the campaign has completed."
                    />
                  ),
                },
                {
                  key: "budget",
                  label: "Budget",
                  render: (row, patch) => (
                    <NumberField
                      label="Budget"
                      value={row.budget}
                      onChange={(v) => patch({ budget: v } as never)}
                      suffix={config.currencySymbol}
                    />
                  ),
                },
                {
                  key: "spend",
                  label: "Spend",
                  render: (row, patch) => (
                    <NumberField
                      label="Spend"
                      value={row.spend}
                      onChange={(v) => patch({ spend: v } as never)}
                      suffix={config.currencySymbol}
                      hint="Actual, not committed."
                    />
                  ),
                },
                {
                  key: "reach",
                  label: "Reach",
                  render: (row, patch) => (
                    <NumberField label="Reach" value={row.reach} onChange={(v) => patch({ reach: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="What the campaigns were for and whether they worked"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label="Completed" value={count(summary?.completed)} />
            <Readout label="Active" value={count(summary?.active)} />
            <Readout label="Planned" value={count(summary?.planned)} />
            <Readout label="Cancelled" value={count(summary?.cancelled)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Readout label="Total spend" value={money(summary?.totalSpend, config.currencySymbol)} />
            <Readout label="Total budget" value={money(summary?.totalBudget, config.currencySymbol)} />
            <Readout
              label="Over budget"
              value={count(summary?.overBudget?.length)}
              hint={summary?.overBudget?.length ? summary.overBudget.map((o) => o.name).join(", ") : undefined}
            />
          </div>

          <Fieldset
            title="Cost per enquiry (derived)"
            description="Calculated only where the enquiry register names this campaign. Where nothing is attributed, that is stated rather than divided by zero."
          >
            {summary && summary.costPerEnquiry.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {summary.costPerEnquiry.map((c) => (
                  <Readout
                    key={c.name}
                    label={c.name}
                    value={money(c.cost, config.currencySymbol)}
                    hint={`${count(c.enquiries)} enquiries`}
                  />
                ))}
              </div>
            ) : (
              <NoDataNote
                what="Cost per enquiry"
                reason="No campaign is named on any enquiry, so no cost per enquiry can be derived. Reference the campaign name in the enquiry notes."
              />
            )}
            {summary && summary.unattributed.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-800">Spend with no attributed enquiries</p>
                <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
                  {summary.unattributed.map((u) => (
                    <li key={u.name}>
                      {u.name}: {money(u.spend, config.currencySymbol)} spent, nothing attributed
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Fieldset>

          <MarketingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === "kpi-campaigns-delivered"),
                value: summary?.completed ?? null,
                emptyNote: "No completed campaigns.",
                label: "Campaigns Delivered",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3 - Lead generation and conversion
// ---------------------------------------------------------------------------

export function LeadSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: MarketingReport;
  data: MarketingLeadData;
  onChange: (data: MarketingLeadData) => void;
  kpis: Kpi[];
  config: MarketingConfig;
}) {
  const summary = summariseLeads(report);
  const update = (id: string, patch: Partial<LeadSourceRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <MarketingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Lead generation reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Lead generation"
          reason="Marked Not Applicable. No lead KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Lead register (typed)"
            description="One row per source per period, with the three counts that make a funnel: generated, qualified, converted. The rates are calculated from these, and the ordering is checked, because a funnel where more leads convert than were generated is a typing mistake rather than a result."
          >
            <RecordTable<LeadSourceRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankLeadSourceRecord(), id: uid() }] })}
              addLabel="Add lead source"
              emptyText="No lead sources recorded yet."
              columns={[
                {
                  key: "source",
                  label: "Source",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Source"
                      value={row.source}
                      options={config.leadSources}
                      required
                      onChange={(v) => patch({ source: v } as never)}
                    />
                  ),
                },
                {
                  key: "period",
                  label: "Period",
                  required: true,
                  render: (row, patch) => <TextField label="Period" value={row.period} required onChange={(v) => patch({ period: v } as never)} />,
                },
                {
                  key: "leadsGenerated",
                  label: "Leads generated",
                  required: true,
                  render: (row, patch) => (
                    <NumberField label="Leads generated" value={row.leadsGenerated} required onChange={(v) => patch({ leadsGenerated: v } as never)} />
                  ),
                },
                {
                  key: "leadsQualified",
                  label: "Leads qualified",
                  render: (row, patch) => (
                    <NumberField label="Leads qualified" value={row.leadsQualified} onChange={(v) => patch({ leadsQualified: v } as never)} />
                  ),
                },
                {
                  key: "leadsConverted",
                  label: "Leads converted",
                  render: (row, patch) => (
                    <NumberField label="Leads converted" value={row.leadsConverted} onChange={(v) => patch({ leadsConverted: v } as never)} />
                  ),
                },
                {
                  key: "spend",
                  label: "Spend",
                  render: (row, patch) => (
                    <NumberField label="Spend" value={row.spend} suffix={config.currencySymbol} onChange={(v) => patch({ spend: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="Which sources worked and which wasted money"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label="Leads generated" value={count(summary?.generated)} />
            <Readout label="Qualified" value={count(summary?.qualified)} />
            <Readout label="Converted" value={count(summary?.converted)} />
            <Readout label="Spend" value={money(summary?.totalSpend, config.currencySymbol)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Readout label="Conversion rate" value={pct(summary?.conversionRatePct)} hint="Converted of generated" />
            <Readout
              label="Qualification rate"
              value={pct(summary?.qualificationRatePct)}
              hint="Qualified of generated"
            />
            <Readout
              label="Cost per lead"
              value={
                summary?.generated && summary.totalSpend !== null
                  ? money(summary.totalSpend / summary.generated, config.currencySymbol)
                  : "Not derivable yet"
              }
              hint="Spend of generated leads"
            />
          </div>

          {summary?.bestSource && summary?.worstSource && (
            <div className="grid grid-cols-2 gap-3">
              <Readout
                label="Best source"
                value={summary.bestSource ?? "Not derivable yet"}
                hint={pct(summary.bySource.find((b) => b.source === summary.bestSource)?.ratePct)}
              />
              <Readout
                label="Weakest source"
                value={summary.worstSource ?? "Not derivable yet"}
                hint={pct(summary.bySource.find((b) => b.source === summary.worstSource)?.ratePct)}
              />
            </div>
          )}

          {summary && summary.inconsistent.length > 0 && (
            <div className="rounded-xl bg-rose-50 px-3 py-2">
              <p className="text-xs font-semibold text-rose-800">The funnel does not add up</p>
              <ul className="mt-1 list-inside list-disc text-[11px] text-rose-700">
                {summary.inconsistent.map((i) => (
                  <li key={i.id}>
                    {i.source || "Unnamed source"}: {count(i.leadsConverted)} converted of{" "}
                    {count(i.leadsGenerated)} generated
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MarketingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === "kpi-leads-generated"),
                value: summary?.generated ?? null,
                emptyNote: "No leads recorded.",
                label: "Leads Generated",
              },
              {
                kpi: kpis.find((k) => k.id === "kpi-lead-conversion-rate"),
                value: summary?.conversionRatePct ?? null,
                emptyNote: "No leads generated, so there is no rate.",
                label: "Lead Conversion Rate",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4 - Partnerships
// ---------------------------------------------------------------------------

export function PartnershipSection({
  report,
  data,
  onChange,
  kpis,
  config,
  today = new Date(),
}: {
  report: MarketingReport;
  data: MarketingPartnershipData;
  onChange: (data: MarketingPartnershipData) => void;
  kpis: Kpi[];
  config: MarketingConfig;
  today?: Date;
}) {
  const summary = summarisePartnerships(report, today);
  const update = (id: string, patch: Partial<PartnershipRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <MarketingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Partnership reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Partnerships"
          reason="Marked Not Applicable. No partnership KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Partnership register (typed)"
            description="One row per partner relationship. Lapsed partnerships stay in the register rather than being deleted, because one that ended is a fact worth reporting. A partnership running since January belongs in this month, not in January."
          >
            <RecordTable<PartnershipRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankPartnershipRecord(), id: uid() }] })}
              addLabel="Add partnership"
              emptyText="No partnerships recorded yet."
              columns={[
                {
                  key: "partner",
                  label: "Partner",
                  required: true,
                  render: (row, patch) => <TextField label="Partner" value={row.partner} required onChange={(v) => patch({ partner: v } as never)} />,
                },
                {
                  key: "type",
                  label: "Type",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Type"
                      value={row.type}
                      options={config.partnershipTypes}
                      required
                      onChange={(v) => patch({ type: v } as never)}
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Status"
                      value={row.status}
                      options={config.partnershipStatuses}
                      required
                      onChange={(v) => patch({ status: v } as never)}
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
                  key: "endDate",
                  label: "End date",
                  render: (row, patch) => (
                    <TextField
                      label="End date"
                      type="date"
                      value={row.endDate}
                      onChange={(v) => patch({ endDate: v } as never)}
                      hint="Required if the agreement has a fixed term."
                    />
                  ),
                },
                {
                  key: "contribution",
                  label: "Contribution",
                  render: (row, patch) => (
                    <SelectField
                      label="Contribution"
                      value={row.contribution}
                      options={config.partnershipContributions}
                      onChange={(v) => patch({ contribution: v } as never)}
                    />
                  ),
                },
                {
                  key: "value",
                  label: "Value",
                  render: (row, patch) => (
                    <NumberField
                      label="Value"
                      value={row.value}
                      suffix={config.currencySymbol}
                      onChange={(v) => patch({ value: v } as never)}
                      hint="Required for cash contributions."
                    />
                  ),
                },
                {
                  key: "contactPerson",
                  label: "Contact",
                  render: (row, patch) => (
                    <TextField label="Contact person" value={row.contactPerson} onChange={(v) => patch({ contactPerson: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="What each partner actually did this month"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label="Active" value={count(summary?.active)} />
            <Readout label="Prospects" value={count(summary?.prospects)} />
            <Readout label="Ended" value={count(summary?.ended)} hint="Lapsed or terminated" />
            <Readout label="Open-ended" value={count(summary?.openEnded)} hint="Active with no end date" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Readout label="Partnerships on record" value={count(summary?.total)} />
            <Readout
              label="Partnership value"
              value={money(summary?.totalValue, config.currencySymbol)}
              hint="Cash and in-kind combined"
            />
            <Readout
              label="Contributing nothing"
              value={count(summary?.inactiveActive?.length)}
              hint="Active but recorded no value"
            />
          </div>

          {summary && summary.expired.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">Marked active, but the agreement has ended</p>
              <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
                {summary.expired.map((e) => (
                  <li key={e.partner}>
                    {e.partner}: ended {e.endDate}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MarketingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === "kpi-active-partnerships"),
                value: summary?.active ?? null,
                emptyNote: "No active partnerships.",
                label: "Active Partnerships",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5 - Website activity
// ---------------------------------------------------------------------------

export function WebsiteSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: MarketingReport;
  data: MarketingWebsiteData;
  onChange: (data: MarketingWebsiteData) => void;
  kpis: Kpi[];
  config: MarketingConfig;
}) {
  const summary = summariseWebsite(report);
  const update = (id: string, patch: Partial<WebsiteActivityRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <MarketingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Website activity reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Website activity"
          reason="Marked Not Applicable. No website KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Website register (typed from analytics)"
            description="One row per analytics period, copied from the analytics tool by hand. The site enquiry figure is checked against the enquiry register, because the two describe the same month and if they disagree neither can be reported yet."
          >
            <RecordTable<WebsiteActivityRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() =>
                onChange({ ...data, records: [...data.records, { ...blankWebsiteActivityRecord(), id: uid() }] })
              }
              addLabel="Add analytics period"
              emptyText="No website activity recorded yet."
              columns={[
                {
                  key: "period",
                  label: "Period",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Period"
                      value={row.period}
                      required
                      onChange={(v) => patch({ period: v } as never)}
                      placeholder="2026-09"
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
                  key: "endDate",
                  label: "End date",
                  required: true,
                  render: (row, patch) => (
                    <TextField label="End date" type="date" value={row.endDate} required onChange={(v) => patch({ endDate: v } as never)} />
                  ),
                },
                {
                  key: "sessions",
                  label: "Sessions",
                  required: true,
                  render: (row, patch) => (
                    <NumberField label="Sessions" value={row.sessions} required onChange={(v) => patch({ sessions: v } as never)} />
                  ),
                },
                {
                  key: "uniqueVisitors",
                  label: "Unique visitors",
                  render: (row, patch) => (
                    <NumberField label="Unique visitors" value={row.uniqueVisitors} onChange={(v) => patch({ uniqueVisitors: v } as never)} />
                  ),
                },
                {
                  key: "enquiriesFromSite",
                  label: "Enquiries from site",
                  render: (row, patch) => (
                    <NumberField
                      label="Enquiries from site"
                      value={row.enquiriesFromSite}
                      onChange={(v) => patch({ enquiriesFromSite: v } as never)}
                      hint="Must be at least the site-raised enquiries on the enquiry register."
                    />
                  ),
                },
                {
                  key: "conversions",
                  label: "Conversions",
                  render: (row, patch) => (
                    <NumberField label="Conversions" value={row.conversions} onChange={(v) => patch({ conversions: v } as never)} />
                  ),
                },
                {
                  key: "topLandingPage",
                  label: "Top landing page",
                  render: (row, patch) => (
                    <TextField label="Top landing page" value={row.topLandingPage} onChange={(v) => patch({ topLandingPage: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Commentary
            value={data.commentary}
            onChange={(v) => onChange({ ...data, commentary: v })}
            hint="What the traffic did, and whether the numbers reconcile"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label="Sessions" value={count(summary?.sessions)} />
            <Readout label="Unique visitors" value={count(summary?.uniqueVisitors)} />
            <Readout label="Enquiries from site" value={count(summary?.enquiriesFromSite)} />
            <Readout label="Conversions" value={count(summary?.conversions)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Readout
              label="Site enquiry rate"
              value={pct(summary?.enquiryRatePct)}
              hint="Site enquiries of sessions"
            />
            <Readout label="Returning visitor share" value={pct(summary?.returningSharePct)} />
            <Readout
              label="Site vs enquiry register"
              value={
                !summary
                  ? "Not derivable yet"
                  : summary.unmatchedSiteEnquiries
                    ? `${summary.unmatchedSiteEnquiries} missing`
                    : "Reconciles"
              }
              hint="Site-raised enquiries the enquiry register does not hold"
            />
          </div>

          {summary && (summary.unmatchedSiteEnquiries ?? 0) > 0 && (
            <NoDataNote
              what="Website enquiry rate"
              reason={`Analytics records ${summary.enquiriesFromSite ?? 0} site-raised enquiries but the enquiry register holds ${(summary.enquiriesFromSite ?? 0) - (summary.unmatchedSiteEnquiries ?? 0)}. Add the missing enquiries, or correct the analytics figure, before the rate is reported.`}
            />
          )}

          <MarketingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === "kpi-website-sessions"),
                value: summary?.sessions ?? null,
                emptyNote: "No sessions recorded.",
                label: "Website Sessions",
              },
              {
                kpi: kpis.find((k) => k.id === "kpi-website-enquiry-rate"),
                value: summary?.enquiryRatePct ?? null,
                emptyNote: "No sessions recorded, so there is no rate.",
                label: "Website Enquiry Rate",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}