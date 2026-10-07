import type { ReactNode } from "react";
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
  BD_KPI_IDS,
  BD_SECTION_PURPOSE,
  type BdClientsData,
  type BdCommentaryData,
  type BdConfig,
  type BdLeadsData,
  type BdNewBusinessData,
  type BdOpportunitiesData,
  type BdPartnershipsData,
  type BdProposalsData,
  type BdReport,
  type ClientAcquired,
  type Lead,
  type NewBusiness,
  type Opportunity,
  type Partnership,
  type Proposal,
} from "../../../types/businessDevelopment";
import {
  blankClient,
  blankLead,
  blankNewBusiness,
  blankOpportunity,
  blankPartnership,
  blankProposal,
} from "../../../data/businessDevelopmentSeed";
import {
  previewBdStatus,
  summariseClients,
  summariseLeads,
  summariseNewBusiness,
  summariseOpportunities,
  summarisePartnerships,
  summariseProposals,
} from "../../../data/businessDevelopmentEngine";

/**
 * The six Business Development registers plus the written commentary.
 *
 * Same shape as the Marketing, Operations, Alumni and Academy sections: rows
 * are typed, every rate is derived from them and shown read-only beneath the
 * register, and each section can be marked Not Applicable for a period in
 * which the activity genuinely did not happen. There is no percentage input
 * anywhere in this file - the win rate in particular is the figure a BD
 * manager is most tempted to type, and the one the engine must own.
 */

function uid(): string {
  return `bd-rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "Not derived yet"
    : `R ${Math.round(v).toLocaleString("en-ZA").replace(/,/g, " ")}`;

const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "Not derived yet" : v.toLocaleString("en-ZA");

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "Not derived yet" : `${v.toFixed(1)}%`);

const days = (v: number | null | undefined) =>
  v === null || v === undefined ? "Not derivable yet" : `${Math.round(v)} days`;

interface SectionProps<T> {
  report: BdReport;
  data: T;
  onChange: (data: T) => void;
  kpis: Kpi[];
  config: BdConfig;
}

function SectionShell({
  report,
  notApplicable,
  onNotApplicable,
  what,
  purpose,
  children,
}: {
  report: BdReport;
  notApplicable: boolean;
  onNotApplicable: (v: boolean) => void;
  what: string;
  purpose: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SourceTag
        kind={report.dataSource?.kind === "Manual Entry" ? "Manual entry" : "Not submitted"}
        period={report.reportingPeriod}
        footnote="Typed by the Business Development office from the pipeline record"
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

function Preview({ items }: { items: { kpi: Kpi | undefined; value: number | null; emptyNote: string }[] }) {
  return <WarningPreview items={items} previewStatus={previewBdStatus} />;
}

// ---------------------------------------------------------------------------
// Section 1 - Leads
// ---------------------------------------------------------------------------

export function LeadSection({ report, data, onChange, kpis, config }: SectionProps<BdLeadsData>) {
  const summary = summariseLeads(report);
  const update = (id: string, patch: Partial<Lead>) =>
    onChange({ ...data, leads: data.leads.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Lead reporting"
      purpose={BD_SECTION_PURPOSE.leads}
    >
      <Fieldset
        title="Lead register (typed)"
        description="One row per enquiry received. The status vocabulary - including Converted - is configured in Administration, and the conversion rate below is read from these statuses rather than typed."
      >
        <RecordTable<Lead>
          rows={data.leads}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, leads: data.leads.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, leads: [...data.leads, { ...blankLead(), id: uid() }] })}
          addLabel="Add lead"
          emptyText="No leads recorded yet."
          columns={[
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
              key: "organisation",
              label: "Organisation",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Organisation"
                  value={row.organisation}
                  required
                  onChange={(v) => patch({ organisation: v } as never)}
                />
              ),
            },
            {
              key: "contact",
              label: "Contact person",
              render: (row, patch) => (
                <TextField label="Contact person" value={row.contact} onChange={(v) => patch({ contact: v } as never)} />
              ),
            },
            {
              key: "source",
              label: "Source",
              required: true,
              render: (row, patch) => (
                <SelectField
                  label="Source"
                  value={row.source}
                  options={config.leadSources as string[]}
                  required
                  onChange={(v) => patch({ source: v } as never)}
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
                  options={config.leadStatuses}
                  required
                  onChange={(v) => patch({ status: v } as never)}
                />
              ),
            },
            {
              key: "estimatedValue",
              label: "Estimated value",
              render: (row, patch) => (
                <NumberField
                  label="Estimated value"
                  prefix="R"
                  value={row.estimatedValue ?? null}
                  onChange={(v) => patch({ estimatedValue: v } as never)}
                />
              ),
            },
            {
              key: "owner",
              label: "Owner",
              render: (row, patch) => (
                <TextField label="Owner" value={row.owner} onChange={(v) => patch({ owner: v } as never)} />
              ),
            },
            {
              key: "nextAction",
              label: "Next action",
              render: (row, patch) => (
                <TextField label="Next action" value={row.nextAction ?? ""} onChange={(v) => patch({ nextAction: v } as never)} />
              ),
            },
            {
              key: "nextActionDate",
              label: "Next action date",
              render: (row, patch) => (
                <TextField
                  label="Next action date"
                  type="date"
                  value={row.nextActionDate ?? ""}
                  onChange={(v) => patch({ nextActionDate: v } as never)}
                />
              ),
            },
          ]}
        />
      </Fieldset>

      <TextArea
        label="Section commentary"
        value={data.commentary}
        onChange={(v) => onChange({ ...data, commentary: v })}
        hint="What changed this period, and why"
        rows={2}
        placeholder="Where the leads came from, and what happened to them"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Leads received" value={num(summary?.count)} />
        <Readout label="Converted" value={num(summary?.converted)} hint="Status = Converted" />
        <Readout label="Conversion rate" value={pct(summary?.convertedPct)} />
        <Readout label="Estimated value" value={money(summary?.estimatedValue)} />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.newLeads),
            value: summary?.count ?? null,
            emptyNote: "No leads recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.leadToOpportunityConversion),
            value: summary?.convertedPct ?? null,
            emptyNote: "No leads recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 2 - Opportunities
// ---------------------------------------------------------------------------

export function OpportunitySection({ report, data, onChange, kpis, config }: SectionProps<BdOpportunitiesData>) {
  const summary = summariseOpportunities(report, config);
  // The weighted value is derived from value x probability, so it is rewritten
  // alongside them rather than left to drift: a stale weighted value in the
  // record would contradict what the engine calculates from the same row.
  const update = (id: string, patch: Partial<Opportunity>) =>
    onChange({
      ...data,
      opportunities: data.opportunities.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (next.estimatedValue !== null && next.probability !== null) {
          next.weightedValue = Math.round(next.estimatedValue * (next.probability / 100));
        }
        return next;
      }),
    });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Opportunity reporting"
      purpose={BD_SECTION_PURPOSE.opportunities}
    >
      <Fieldset
        title="Opportunity register (typed)"
        description="One row per deal. The pipeline value, the weighted value and the stall count are all calculated from these rows - the weighted value is never typed, it is value x probability."
      >
        <RecordTable<Opportunity>
          rows={data.opportunities}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, opportunities: data.opportunities.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, opportunities: [...data.opportunities, { ...blankOpportunity(), id: uid() }] })}
          addLabel="Add opportunity"
          emptyText="No opportunities recorded yet."
          columns={[
            {
              key: "opportunityName",
              label: "Opportunity",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Opportunity"
                  value={row.opportunityName}
                  required
                  onChange={(v) => patch({ opportunityName: v } as never)}
                />
              ),
            },
            {
              key: "client",
              label: "Client",
              required: true,
              render: (row, patch) => (
                <TextField label="Client" value={row.client} required onChange={(v) => patch({ client: v } as never)} />
              ),
            },
            {
              key: "dateCreated",
              label: "Date created",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Date created"
                  type="date"
                  value={row.dateCreated}
                  required
                  onChange={(v) => patch({ dateCreated: v } as never)}
                />
              ),
            },
            {
              key: "stage",
              label: "Stage",
              required: true,
              render: (row, patch) => (
                <SelectField
                  label="Stage"
                  value={row.stage}
                  options={config.opportunityStages as string[]}
                  required
                  onChange={(v) => patch({ stage: v } as never)}
                />
              ),
            },
            {
              key: "estimatedValue",
              label: "Estimated value",
              render: (row, patch) => (
                <NumberField
                  label="Estimated value"
                  prefix="R"
                  value={row.estimatedValue}
                  required={row.stage !== "Won" && row.stage !== "Lost"}
                  onChange={(v) => patch({ estimatedValue: v } as never)}
                />
              ),
            },
            {
              key: "probability",
              label: "Probability (%)",
              render: (row, patch) => (
                <NumberField
                  label="Probability"
                  suffix="%"
                  value={row.probability}
                  required={row.stage !== "Won" && row.stage !== "Lost"}
                  hint="0 - 100"
                  onChange={(v) => patch({ probability: v } as never)}
                />
              ),
            },
            {
              key: "lastActivityDate",
              label: "Last activity",
              render: (row, patch) => (
                <TextField
                  label="Last activity"
                  type="date"
                  value={row.lastActivityDate ?? ""}
                  onChange={(v) => patch({ lastActivityDate: v } as never)}
                  hint="Drives the stall count."
                />
              ),
            },
            {
              key: "owner",
              label: "Owner",
              required: true,
              render: (row, patch) => (
                <TextField label="Owner" value={row.owner} required onChange={(v) => patch({ owner: v } as never)} />
              ),
            },
            {
              key: "wonDate",
              label: "Won date",
              render: (row, patch) => (
                <TextField
                  label="Won date"
                  type="date"
                  value={row.wonDate ?? ""}
                  required={row.stage === "Won"}
                  hint="Required when the stage is Won"
                  onChange={(v) => patch({ wonDate: v } as never)}
                />
              ),
            },
            {
              key: "lostDate",
              label: "Lost date",
              render: (row, patch) => (
                <TextField
                  label="Lost date"
                  type="date"
                  value={row.lostDate ?? ""}
                  required={row.stage === "Lost"}
                  hint="Required when the stage is Lost"
                  onChange={(v) => patch({ lostDate: v } as never)}
                />
              ),
            },
            {
              key: "lostReason",
              label: "Lost reason",
              render: (row, patch) => (
                <TextField
                  label="Lost reason"
                  value={row.lostReason ?? ""}
                  required={row.stage === "Lost"}
                  hint="Required when the stage is Lost"
                  onChange={(v) => patch({ lostReason: v } as never)}
                />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (row, patch) => (
                <TextArea label="Notes" value={row.notes ?? ""} rows={1} onChange={(v) => patch({ notes: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <TextArea
        label="Section commentary"
        value={data.commentary}
        onChange={(v) => onChange({ ...data, commentary: v })}
        hint="What changed this period, and why"
        rows={2}
        placeholder="Which deals moved, which stalled, and what happens next"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Open opportunities" value={num(summary?.active)} hint="Excludes Won and Lost" />
        <Readout label="Pipeline value" value={money(summary?.pipelineValue)} />
        <Readout label="Weighted pipeline" value={money(summary?.weightedPipelineValue)} hint="Value x probability" />
        <Readout label="Stalled" value={num(summary?.stalled)} hint={`${summary?.stalledThresholdDays ?? 30}-day threshold`} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Won" value={num(summary?.won)} />
        <Readout label="Lost" value={num(summary?.lost)} />
        <Readout label="Average days to close" value={days(summary?.avgDaysToClose)} hint="Won opportunities only" />
        <Readout
          label="Win rate"
          value={pct(summary && summary.total > 0 ? (summary.won / summary.total) * 100 : null)}
        />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.activeOpportunities),
            value: summary?.active ?? null,
            emptyNote: "No opportunities recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.pipelineValue),
            value: summary?.pipelineValue ?? null,
            emptyNote: "No opportunities recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.weightedPipelineValue),
            value: summary?.weightedPipelineValue ?? null,
            emptyNote: "No opportunities recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.opportunitiesStalled),
            value: summary?.stalled ?? null,
            emptyNote: "No opportunities recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.avgDaysToClose),
            value: summary?.avgDaysToClose ?? null,
            emptyNote: "No opportunity has been won yet.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 3 - Proposals
// ---------------------------------------------------------------------------

export function ProposalSection({ report, data, onChange, kpis, config }: SectionProps<BdProposalsData>) {
  const summary = summariseProposals(report);
  const update = (id: string, patch: Partial<Proposal>) =>
    onChange({ ...data, proposals: data.proposals.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Proposal reporting"
      purpose={BD_SECTION_PURPOSE.proposals}
    >
      <Fieldset
        title="Proposal register (typed)"
        description="One row per proposal sent. The win rate divides by DECIDED proposals only - one still under review is not a loss - and the conversion rate divides by all of them. Neither is typed."
      >
        <RecordTable<Proposal>
          rows={data.proposals}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, proposals: data.proposals.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, proposals: [...data.proposals, { ...blankProposal(), id: uid() }] })}
          addLabel="Add proposal"
          emptyText="No proposals recorded yet."
          columns={[
            {
              key: "client",
              label: "Client",
              required: true,
              render: (row, patch) => (
                <TextField label="Client" value={row.client} required onChange={(v) => patch({ client: v } as never)} />
              ),
            },
            {
              key: "dateSubmitted",
              label: "Date submitted",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Date submitted"
                  type="date"
                  value={row.dateSubmitted}
                  required
                  onChange={(v) => patch({ dateSubmitted: v } as never)}
                />
              ),
            },
            {
              key: "proposalValue",
              label: "Proposal value",
              render: (row, patch) => (
                <NumberField
                  label="Proposal value"
                  prefix="R"
                  value={row.proposalValue}
                  onChange={(v) => patch({ proposalValue: v } as never)}
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
                  options={config.proposalStatuses as string[]}
                  required
                  onChange={(v) => patch({ status: v } as never)}
                />
              ),
            },
            {
              key: "won",
              label: "Marked won",
              render: (row, patch) => (
                <Checkbox
                  label="Marked won"
                  checked={row.won === true}
                  onChange={(v) => patch({ won: v } as never)}
                  hint="Must agree with the status."
                />
              ),
            },
            {
              key: "lostReason",
              label: "Lost reason",
              render: (row, patch) => (
                <TextField
                  label="Lost reason"
                  value={row.lostReason ?? ""}
                  required={row.status === "Lost"}
                  onChange={(v) => patch({ lostReason: v } as never)}
                />
              ),
            },
            {
              key: "expectedDecisionDate",
              label: "Expected decision",
              render: (row, patch) => (
                <TextField
                  label="Expected decision"
                  type="date"
                  value={row.expectedDecisionDate ?? ""}
                  onChange={(v) => patch({ expectedDecisionDate: v } as never)}
                />
              ),
            },
            {
              key: "owner",
              label: "Owner",
              required: true,
              render: (row, patch) => (
                <TextField label="Owner" value={row.owner} required onChange={(v) => patch({ owner: v } as never)} />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (row, patch) => (
                <TextArea label="Notes" value={row.notes ?? ""} rows={1} onChange={(v) => patch({ notes: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <TextArea
        label="Section commentary"
        value={data.commentary}
        onChange={(v) => onChange({ ...data, commentary: v })}
        hint="What changed this period, and why"
        rows={2}
        placeholder="Which proposals went out, which were decided, and how they went"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Proposals sent" value={num(summary?.total)} />
        <Readout label="Decided" value={num(summary?.decided)} hint="Won or lost" />
        <Readout label="Still open" value={num(summary?.undecided)} />
        <Readout label="Submitted value" value={money(summary?.submittedValue)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Win rate (decided)" value={pct(summary?.winRatePct)} />
        <Readout label="Conversion (all sent)" value={pct(summary?.conversionRatePct)} />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.proposalsSubmitted),
            value: summary?.total ?? null,
            emptyNote: "No proposals recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.proposalWinRate),
            value: summary?.winRatePct ?? null,
            emptyNote: "No proposal has been decided yet.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.proposalConversionRate),
            value: summary?.conversionRatePct ?? null,
            emptyNote: "No proposals recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 4 - New Business
// ---------------------------------------------------------------------------

export function NewBusinessSection({ report, data, onChange, kpis, config }: SectionProps<BdNewBusinessData>) {
  const summary = summariseNewBusiness(report);
  const update = (id: string, patch: Partial<NewBusiness>) =>
    onChange({ ...data, newBusiness: data.newBusiness.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="New business reporting"
      purpose={BD_SECTION_PURPOSE.newBusiness}
    >
      <Fieldset
        title="New business register (typed)"
        description="One row per contract won. Value and count are kept apart: one large contract is one win, not three."
      >
        <RecordTable<NewBusiness>
          rows={data.newBusiness}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, newBusiness: data.newBusiness.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, newBusiness: [...data.newBusiness, { ...blankNewBusiness(), id: uid() }] })}
          addLabel="Add win"
          emptyText="No new business recorded yet."
          columns={[
            {
              key: "client",
              label: "Client",
              required: true,
              render: (row, patch) => (
                <TextField label="Client" value={row.client} required onChange={(v) => patch({ client: v } as never)} />
              ),
            },
            {
              key: "businessService",
              label: "What was won",
              render: (row, patch) => (
                <TextField
                  label="What was won"
                  value={row.businessService ?? ""}
                  onChange={(v) => patch({ businessService: v } as never)}
                />
              ),
            },
            {
              key: "awardDate",
              label: "Award date",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Award date"
                  type="date"
                  value={row.awardDate}
                  required
                  onChange={(v) => patch({ awardDate: v } as never)}
                />
              ),
            },
            {
              key: "contractStartDate",
              label: "Contract start",
              render: (row, patch) => (
                <TextField
                  label="Contract start"
                  type="date"
                  value={row.contractStartDate ?? ""}
                  onChange={(v) => patch({ contractStartDate: v } as never)}
                />
              ),
            },
            {
              key: "wonValue",
              label: "Won value",
              required: true,
              render: (row, patch) => (
                <NumberField
                  label="Won value"
                  prefix="R"
                  value={row.wonValue}
                  required
                  onChange={(v) => patch({ wonValue: v } as never)}
                />
              ),
            },
            {
              key: "businessCategory",
              label: "Category",
              render: (row, patch) => (
                <SelectField
                  label="Category"
                  value={row.businessCategory ?? ""}
                  options={config.businessCategories}
                  onChange={(v) => patch({ businessCategory: v } as never)}
                />
              ),
            },
            {
              key: "owner",
              label: "Owner",
              required: true,
              render: (row, patch) => (
                <TextField label="Owner" value={row.owner} required onChange={(v) => patch({ owner: v } as never)} />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (row, patch) => (
                <TextArea label="Notes" value={row.notes ?? ""} rows={1} onChange={(v) => patch({ notes: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <TextArea
        label="Section commentary"
        value={data.commentary}
        onChange={(v) => onChange({ ...data, commentary: v })}
        hint="What changed this period, and why"
        rows={2}
        placeholder="What was won this period, and on what terms"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Contracts won" value={num(summary?.total)} />
        <Readout label="Value won" value={money(summary?.totalValue)} />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.newBusinessWon),
            value: summary?.totalValue ?? null,
            emptyNote: "No new business recorded.",
          },
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.newBusinessWonCount),
            value: summary?.total ?? null,
            emptyNote: "No new business recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 5 - Clients
// ---------------------------------------------------------------------------

export function ClientSection({ report, data, onChange, kpis }: SectionProps<BdClientsData>) {
  const summary = summariseClients(report);
  const update = (id: string, patch: Partial<ClientAcquired>) =>
    onChange({ ...data, clients: data.clients.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Client reporting"
      purpose={BD_SECTION_PURPOSE.clients}
    >
      <Fieldset
        title="New client register (typed)"
        description="Only clients who were not clients before. A second contract with an existing client belongs in New Business, not here - otherwise the client count inflates without anyone noticing."
      >
        <RecordTable<ClientAcquired>
          rows={data.clients}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, clients: data.clients.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, clients: [...data.clients, { ...blankClient(), id: uid() }] })}
          addLabel="Add client"
          emptyText="No new clients recorded yet."
          columns={[
            {
              key: "clientName",
              label: "Client name",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Client name"
                  value={row.clientName}
                  required
                  onChange={(v) => patch({ clientName: v } as never)}
                />
              ),
            },
            {
              key: "awardDate",
              label: "First award date",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="First award date"
                  type="date"
                  value={row.awardDate}
                  required
                  onChange={(v) => patch({ awardDate: v } as never)}
                />
              ),
            },
            {
              key: "owner",
              label: "Owner",
              render: (row, patch) => (
                <TextField label="Owner" value={row.owner ?? ""} onChange={(v) => patch({ owner: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <TextArea
        label="Section commentary"
        value={data.commentary}
        onChange={(v) => onChange({ ...data, commentary: v })}
        hint="What changed this period, and why"
        rows={2}
        placeholder="Who the new clients are, and how they were won"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="New clients" value={num(summary?.total)} />
      </div>

      <Preview
        items={[
          {
            kpi: kpis.find((k) => k.id === BD_KPI_IDS.newClients),
            value: summary?.total ?? null,
            emptyNote: "No new clients recorded.",
          },
        ]}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 6 - Partnerships
// ---------------------------------------------------------------------------

export function PartnershipSection({ report, data, onChange, config }: SectionProps<BdPartnershipsData>) {
  const summary = summarisePartnerships(report);
  const update = (id: string, patch: Partial<Partnership>) =>
    onChange({ ...data, partnerships: data.partnerships.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Partnership reporting"
      purpose={BD_SECTION_PURPOSE.partnerships}
    >
      <Fieldset
        title="Partnership register (typed)"
        description="One row per partnership Buhle is pursuing or running. Potential value is what it could be worth, not revenue - it is never added to the pipeline figure."
      >
        <RecordTable<Partnership>
          rows={data.partnerships}
          onUpdate={update}
          onRemove={(id) => onChange({ ...data, partnerships: data.partnerships.filter((r) => r.id !== id) })}
          onAdd={() => onChange({ ...data, partnerships: [...data.partnerships, { ...blankPartnership(), id: uid() }] })}
          addLabel="Add partnership"
          emptyText="No partnerships recorded yet."
          columns={[
            {
              key: "partner",
              label: "Partner",
              required: true,
              render: (row, patch) => (
                <TextField label="Partner" value={row.partner} required onChange={(v) => patch({ partner: v } as never)} />
              ),
            },
            {
              key: "partnershipType",
              label: "Type",
              render: (row, patch) => (
                <TextField
                  label="Type"
                  value={row.partnershipType ?? ""}
                  onChange={(v) => patch({ partnershipType: v } as never)}
                />
              ),
            },
            {
              key: "dateInitiated",
              label: "Date initiated",
              required: true,
              render: (row, patch) => (
                <TextField
                  label="Date initiated"
                  type="date"
                  value={row.dateInitiated}
                  required
                  onChange={(v) => patch({ dateInitiated: v } as never)}
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
                  options={config.partnershipStatuses as string[]}
                  required
                  onChange={(v) => patch({ status: v } as never)}
                />
              ),
            },
            {
              key: "potentialValue",
              label: "Potential value",
              render: (row, patch) => (
                <NumberField
                  label="Potential value"
                  prefix="R"
                  value={row.potentialValue ?? null}
                  onChange={(v) => patch({ potentialValue: v } as never)}
                />
              ),
            },
            {
              key: "owner",
              label: "Owner",
              render: (row, patch) => (
                <TextField label="Owner" value={row.owner} onChange={(v) => patch({ owner: v } as never)} />
              ),
            },
            {
              key: "outcome",
              label: "Outcome",
              render: (row, patch) => (
                <TextField label="Outcome" value={row.outcome ?? ""} onChange={(v) => patch({ outcome: v } as never)} />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (row, patch) => (
                <TextArea label="Notes" value={row.notes ?? ""} rows={1} onChange={(v) => patch({ notes: v } as never)} />
              ),
            },
          ]}
        />
      </Fieldset>

      <TextArea
        label="Section commentary"
        value={data.commentary}
        onChange={(v) => onChange({ ...data, commentary: v })}
        hint="What changed this period, and why"
        rows={2}
        placeholder="Which partnerships moved, and which lapsed"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Partnerships" value={num(summary?.total)} />
        <Readout label="Active" value={num(summary?.active)} />
        <Readout label="Potential value" value={money(summary?.potentialValue)} />
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section 7 - Commentary
// ---------------------------------------------------------------------------

const COMMENTARY_FIELDS: { key: keyof BdCommentaryData; label: string; hint: string }[] = [
  { key: "keyOpportunities", label: "Key opportunities", hint: "The ones most likely to close next period" },
  { key: "majorWins", label: "Major wins", hint: "What was won, and what made the difference" },
  { key: "lostOpportunities", label: "Lost opportunities", hint: "What was lost, and the honest reason why" },
  { key: "pipelineConcerns", label: "Pipeline concerns", hint: "Deals going cold, thin coverage, stalled work" },
  { key: "clientConcerns", label: "Client concerns", hint: "Dissatisfaction, non-payment, silence" },
  { key: "partnershipDevelopments", label: "Partnership developments", hint: "What moved with partners" },
  { key: "keyAchievements", label: "Key achievements", hint: "Beyond the numbers on this form" },
  { key: "supportRequired", label: "Support required", hint: "What the department needs from management" },
  { key: "nextPriorities", label: "Next period priorities", hint: "What the team will work on next" },
];

export function CommentarySection({ report, data, onChange }: SectionProps<BdCommentaryData>) {
  return (
    <SectionShell
      report={report}
      notApplicable={data.notApplicable}
      onNotApplicable={(notApplicable) => onChange({ ...data, notApplicable })}
      what="Commentary"
      purpose={BD_SECTION_PURPOSE.commentary}
    >
      <Fieldset
        title="Written commentary"
        description="The half of the submission no KPI can carry. Read above the figures in every board pack, so a thin month with a good reason and a thin month with no reason do not look the same."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {COMMENTARY_FIELDS.map((field) => (
            <TextArea
              key={field.key}
              label={field.label}
              value={(data[field.key] as string) ?? ""}
              onChange={(v) => onChange({ ...data, [field.key]: v })}
              hint={field.hint}
              rows={2}
            />
          ))}
        </div>
      </Fieldset>
    </SectionShell>
  );
}
