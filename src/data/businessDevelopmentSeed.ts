// ============================================================================
// DEMO / SAMPLE DATA - NOT REAL BUHLE BUSINESS DEVELOPMENT PERFORMANCE.
// Business Development vocabularies, blank record factories, the KPI
// templates their registers feed, and a demo draft submission so the BD
// dashboard has something to show before live data is connected.
// ============================================================================
import type { Kpi } from "../types";
import {
  BD_KPI_IDS,
  BUSINESS_DEVELOPMENT_DEPARTMENT,
  type BdCommentaryData,
  type BdConfig,
  type BdReport,
  type ClientAcquired,
  type Lead,
  type LeadSource,
  type NewBusiness,
  type Opportunity,
  type OpportunityStage,
  type Partnership,
  type PartnershipStatus,
  type Proposal,
  type ProposalStatus,
} from "../types/businessDevelopment";

export const DEFAULT_LEAD_SOURCES = [
  "Website",
  "Referral",
  "Partnership",
  "Existing client",
  "Tender",
  "Direct enquiry",
  "Event",
  "Other",
] as const satisfies readonly LeadSource[];

/**
 * What may be recorded as a lead's status. "Converted" is the vocabulary the
 * lead-to-opportunity rate is built from, so it is named here rather than
 * assumed by the engine: a department that calls it "Won" changes it here.
 */
export const DEFAULT_LEAD_STATUSES = ["New", "Contacted", "Qualified", "Converted", "Closed - Lost"] as const;

export const DEFAULT_OPPORTUNITY_STAGES = [
  "Lead",
  "Qualified",
  "Opportunity",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const satisfies readonly OpportunityStage[];

export const DEFAULT_PROPOSAL_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Negotiation",
  "Won",
  "Lost",
  "Withdrawn",
] as const satisfies readonly ProposalStatus[];

export const DEFAULT_PARTNERSHIP_STATUSES = [
  "Identified",
  "Contacted",
  "Discussion",
  "Proposal",
  "Active",
  "Closed",
  "Not Proceeding",
] as const satisfies readonly PartnershipStatus[];

export const DEFAULT_OPPORTUNITY_TYPES = ["New business", "Upsell", "Renewal", "Partnership"] as const;

export const DEFAULT_BUSINESS_CATEGORIES = ["Agriculture", "Training", "Consultancy", "Other"] as const;

export const DEFAULT_BD_CONFIG: BdConfig = {
  leadSources: [...DEFAULT_LEAD_SOURCES],
  leadStatuses: [...DEFAULT_LEAD_STATUSES],
  opportunityStages: [...DEFAULT_OPPORTUNITY_STAGES],
  proposalStatuses: [...DEFAULT_PROPOSAL_STATUSES],
  partnershipStatuses: [...DEFAULT_PARTNERSHIP_STATUSES],
  opportunityTypes: [...DEFAULT_OPPORTUNITY_TYPES],
  businessCategories: [...DEFAULT_BUSINESS_CATEGORIES],
  // Monthly: BD reviews its pipeline every month, and a quarter of pipeline
  // movement is three months of stall the dashboard never sees.
  reportingFrequency: "Monthly",
  stalledThresholdDays: 30,
  greenTargetOverride: null,
};

// ---------------------------------------------------------------------------
// Blank record factories
// ---------------------------------------------------------------------------

const rid = (prefix: string) => `bd-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const blankLead = (): Lead => ({
  id: rid("lead"),
  dateReceived: "",
  organisation: "",
  contact: "",
  source: "Direct enquiry",
  estimatedValue: null,
  owner: "",
  status: "New",
  nextAction: "",
  nextActionDate: "",
});

export const blankOpportunity = (): Opportunity => ({
  id: rid("opp"),
  opportunityName: "",
  client: "",
  contact: "",
  dateCreated: "",
  source: "Direct enquiry",
  opportunityType: "New business",
  estimatedValue: null,
  probability: null,
  weightedValue: null,
  stage: "Lead",
  expectedCloseDate: "",
  owner: "",
  lastActivityDate: "",
  nextAction: "",
  nextActionDate: "",
  notes: "",
});

export const blankProposal = (): Proposal => ({
  id: rid("prop"),
  client: "",
  opportunityId: "",
  dateSubmitted: "",
  proposalValue: null,
  expectedDecisionDate: "",
  owner: "",
  status: "Draft",
  won: null,
  lostReason: "",
  notes: "",
});

export const blankNewBusiness = (): NewBusiness => ({
  id: rid("win"),
  client: "",
  opportunityId: "",
  businessService: "",
  awardDate: "",
  contractStartDate: "",
  wonValue: null,
  owner: "",
  businessCategory: "Agriculture",
  notes: "",
});

export const blankClient = (): ClientAcquired => ({
  id: rid("client"),
  clientName: "",
  opportunityId: "",
  newBusinessId: "",
  awardDate: "",
  owner: "",
});

export const blankPartnership = (): Partnership => ({
  id: rid("ptnr"),
  partner: "",
  partnershipType: "",
  dateInitiated: "",
  opportunityId: "",
  potentialValue: null,
  status: "Identified",
  owner: "",
  nextAction: "",
  nextActionDate: "",
  outcome: "",
  notes: "",
});

export const blankBdCommentary = (): BdCommentaryData => ({
  keyOpportunities: "",
  majorWins: "",
  lostOpportunities: "",
  pipelineConcerns: "",
  clientConcerns: "",
  partnershipDevelopments: "",
  keyAchievements: "",
  supportRequired: "",
  nextPriorities: "",
  notApplicable: false,
  commentary: "",
});

/** A new, empty submission. Registers start empty rather than with a blank
 *  row, so a draft cannot "report" a record that says nothing. */
export function createBlankBdReport(params: {
  cycleId: string;
  reportingPeriod: string;
  dueDate: string;
}): BdReport {
  const envelope = () => ({ commentary: "", notApplicable: false });
  return {
    reportId: `bd-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: BUSINESS_DEVELOPMENT_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    dueDate: params.dueDate,
    status: "Not Submitted",
    leads: { ...envelope(), leads: [] },
    opportunities: { ...envelope(), opportunities: [] },
    proposals: { ...envelope(), proposals: [] },
    newBusiness: { ...envelope(), newBusiness: [] },
    clients: { ...envelope(), clients: [] },
    partnerships: { ...envelope(), partnerships: [] },
    commentary: blankBdCommentary(),
    dataSource: { kind: "Not Submitted" },
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

const PERIODS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const hist = (values: number[]) => values.map((value, i) => ({ period: PERIODS[i], value }));

const base = {
  department: BUSINESS_DEVELOPMENT_DEPARTMENT,
  measurementFrequency: "monthly" as const,
  owner: "Business Development Manager",
  lastUpdated: "2026-10-05",
  thresholdApproval: "proposed" as const,
  dataAvailable: true,
};

/**
 * Business Development KPIs, seeded with demo figures for the last submitted
 * month so the dashboard has a position to show. Every figure is recalculated
 * from the seven registers the moment a BD submission lands.
 *
 * Thresholds are PROPOSED starting points, not Board-approved. The five
 * conversion and turnaround figures ship with no threshold at all and report
 * "threshold not set" rather than an invented verdict: nobody has approved a
 * win-rate target for Buhle yet, and inventing one would manufacture a colour.
 */
export const BD_SUBMISSION_KPIS: Kpi[] = [
  {
    ...base,
    id: BD_KPI_IDS.activeOpportunities,
    name: "Active Opportunities",
    unit: "count",
    currentValue: 7,
    previousValue: 6,
    target: 15,
    greenThreshold: 12,
    amberThreshold: 8,
    history: hist([4, 5, 5, 6, 6, 7]),
    insight:
      "Deals open in the pipeline - every stage except Won or Lost. Derived from the opportunity register, so a deal nobody closed is still counted.",
    sourceSystem: "BD submission - opportunity register",
  },
  {
    ...base,
    id: BD_KPI_IDS.pipelineValue,
    name: "Pipeline Value",
    unit: "currency",
    currentValue: 3800000,
    previousValue: 3150000,
    target: 3000000,
    greenThreshold: 2400000,
    amberThreshold: 1800000,
    history: hist([2100000, 2450000, 2600000, 2900000, 3150000, 3800000]),
    insight:
      "Sum of the estimated value of every open opportunity. Unweighted: it says what the pipeline is worth if everything in it closes.",
    sourceSystem: "BD submission - opportunity register",
  },
  {
    ...base,
    id: BD_KPI_IDS.weightedPipelineValue,
    name: "Weighted Pipeline Value",
    unit: "currency",
    currentValue: 1575000,
    previousValue: 1340000,
    target: 1500000,
    greenThreshold: 1200000,
    amberThreshold: 900000,
    history: hist([840000, 960000, 1040000, 1180000, 1340000, 1575000]),
    insight:
      "Each open opportunity's value multiplied by its probability. The honest version of the pipeline figure, because it charges each deal for how unlikely it is.",
    sourceSystem: "BD submission - opportunity register",
  },
  {
    ...base,
    id: BD_KPI_IDS.newLeads,
    name: "New Leads / Enquiries",
    unit: "count",
    currentValue: 6,
    previousValue: 5,
    target: 8,
    greenThreshold: 6,
    amberThreshold: 4,
    history: hist([3, 4, 4, 5, 5, 6]),
    insight: "Enquiries recorded in the period, whatever happened to them afterwards.",
    sourceSystem: "BD submission - lead register",
  },
  {
    ...base,
    id: BD_KPI_IDS.proposalsSubmitted,
    name: "Proposals Submitted",
    unit: "count",
    currentValue: 5,
    previousValue: 4,
    target: 6,
    greenThreshold: 4,
    amberThreshold: 2,
    history: hist([2, 3, 3, 4, 4, 5]),
    insight: "Proposals sent in the period, including those still under review.",
    sourceSystem: "BD submission - proposal register",
  },
  {
    ...base,
    id: BD_KPI_IDS.proposalWinRate,
    name: "Proposal Win Rate",
    unit: "percent",
    currentValue: 50,
    previousValue: 42.9,
    target: 35,
    greenThreshold: 35,
    amberThreshold: 25,
    history: hist([33.3, 40, 37.5, 42.9, 42.9, 50]),
    insight:
      "Proposals won out of proposals that have been decided. Drafts and those under review are excluded, because counting them would punish a proposal for not being answered yet.",
    sourceSystem: "BD submission - proposal register",
  },
  {
    ...base,
    id: BD_KPI_IDS.proposalConversionRate,
    name: "Proposal Conversion Rate",
    unit: "percent",
    currentValue: 20,
    previousValue: 18.2,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([14.3, 16.7, 15.8, 18.2, 18.2, 20]),
    insight:
      "Proposals won out of ALL proposals sent, decided or not. The stricter companion to the win rate. No approved target yet.",
    sourceSystem: "BD submission - proposal register",
  },
  {
    ...base,
    id: BD_KPI_IDS.opportunityConversionRate,
    name: "Opportunity Win Rate",
    unit: "percent",
    currentValue: 11.1,
    previousValue: 9.1,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([8.3, 9.1, 9.5, 9.1, 9.1, 11.1]),
    insight:
      "Opportunities won out of every opportunity opened, however old. No approved target yet, so this is monitored rather than graded.",
    sourceSystem: "BD submission - opportunity register",
  },
  {
    ...base,
    id: BD_KPI_IDS.leadToOpportunityConversion,
    name: "Lead-to-Opportunity Conversion",
    unit: "percent",
    currentValue: 33.3,
    previousValue: 28.6,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([22.2, 25, 26.3, 28.6, 28.6, 33.3]),
    insight:
      "Leads recorded as Converted out of all leads received. Only meaningful once the lead register records an outcome for each enquiry. No approved target yet.",
    sourceSystem: "BD submission - lead register",
  },
  {
    ...base,
    id: BD_KPI_IDS.newBusinessWon,
    name: "New Business Won",
    unit: "currency",
    currentValue: 950000,
    previousValue: 415000,
    target: 1000000,
    greenThreshold: 800000,
    amberThreshold: 500000,
    history: hist([180000, 240000, 310000, 265000, 415000, 950000]),
    insight: "Contracted value of the new business won in the period, from the new business register.",
    sourceSystem: "BD submission - new business register",
  },
  {
    ...base,
    id: BD_KPI_IDS.newBusinessWonCount,
    name: "New Contracts Won",
    unit: "count",
    currentValue: 2,
    previousValue: 1,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([1, 1, 1, 1, 1, 2]),
    insight: "Number of separate contracts won. Counted apart from their value: one large contract is not three wins.",
    sourceSystem: "BD submission - new business register",
  },
  {
    ...base,
    id: BD_KPI_IDS.newClients,
    name: "New Clients Acquired",
    unit: "count",
    currentValue: 2,
    previousValue: 1,
    target: 4,
    greenThreshold: 3,
    amberThreshold: 2,
    history: hist([1, 1, 1, 1, 1, 2]),
    insight:
      "Clients who became paying clients this period. Fewer than contracts won, because a second contract with an existing client is not a new client.",
    sourceSystem: "BD submission - client register",
  },
  {
    ...base,
    id: BD_KPI_IDS.opportunitiesStalled,
    name: "Opportunities Stalled",
    unit: "count",
    currentValue: 1,
    previousValue: 2,
    target: 0,
    greenThreshold: 0,
    amberThreshold: 2,
    lowerIsBetter: true,
    history: hist([4, 3, 3, 2, 2, 1]),
    insight:
      "Open opportunities with no recorded activity for more than the configured threshold (30 days). Lower is better: a stalled deal is a deal nobody is working.",
    sourceSystem: "BD submission - opportunity register",
  },
  {
    ...base,
    id: BD_KPI_IDS.avgDaysToClose,
    name: "Average Days to Close",
    unit: "days",
    currentValue: 97,
    previousValue: 104,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: hist([118, 112, 109, 106, 104, 97]),
    insight:
      "Average days from opening an opportunity to it being won. Derived only from opportunities that were actually won. No approved target yet.",
    sourceSystem: "BD submission - opportunity register",
  },
];

// ---------------------------------------------------------------------------
// Demo draft submission for the open BD cycle
// ---------------------------------------------------------------------------

export const BD_DEMO_CYCLE_ID = "cyc-bd-2026-10";

let seq = 0;
const did = (prefix: string) => `bd-demo-${prefix}-${++seq}`;

const lead = (
  dateReceived: string,
  organisation: string,
  contact: string,
  source: LeadSource,
  status: string,
  estimatedValue: number | null,
  owner = "Thabo Molefe"
): Lead => ({
  id: did("lead"),
  dateReceived,
  organisation,
  contact,
  source,
  estimatedValue,
  owner,
  status,
  nextAction: "",
  nextActionDate: "",
});

const opportunity = (
  opportunityName: string,
  client: string,
  dateCreated: string,
  estimatedValue: number,
  probability: number,
  stage: OpportunityStage,
  lastActivityDate: string,
  extra: Partial<Opportunity> = {}
): Opportunity => ({
  id: did("opp"),
  opportunityName,
  client,
  dateCreated,
  estimatedValue,
  probability,
  weightedValue: Math.round(estimatedValue * (probability / 100)),
  stage,
  lastActivityDate,
  owner: "Thabo Molefe",
  opportunityType: "New business",
  source: "Referral",
  expectedCloseDate: "",
  nextAction: "",
  nextActionDate: "",
  notes: "",
  ...extra,
});

const proposal = (
  client: string,
  dateSubmitted: string,
  proposalValue: number,
  status: ProposalStatus,
  extra: Partial<Proposal> = {}
): Proposal => ({
  id: did("prop"),
  client,
  dateSubmitted,
  proposalValue,
  owner: "Thabo Molefe",
  status,
  won: status === "Won" ? true : status === "Lost" ? false : null,
  lostReason: "",
  notes: "",
  ...extra,
});

const win = (client: string, businessService: string, awardDate: string, wonValue: number, category: string): NewBusiness => ({
  id: did("win"),
  client,
  businessService,
  awardDate,
  contractStartDate: awardDate,
  wonValue,
  owner: "Thabo Molefe",
  businessCategory: category,
  notes: "",
});

/**
 * A draft for October 2026, pre-filled with sample rows so the BD submission
 * opens with realistic data. It is a DRAFT: none of these rows count towards
 * the KPIs until Thabo reviews and submits it.
 */
export function createDemoBdDraft(): BdReport {
  const report = createBlankBdReport({
    cycleId: BD_DEMO_CYCLE_ID,
    reportingPeriod: "October 2026",
    dueDate: "2026-10-31",
  });

  return {
    ...report,
    status: "Draft",
    savedAt: "2026-10-06T08:15:00.000Z",
    leads: {
      ...report.leads,
      leads: [
        lead("2026-09-28", "Kgatelopele Co-op", "P. Marumo", "Referral", "Qualified", 250000),
        lead("2026-09-30", "Mahlathi Trading", "S. Mahlathi", "Website", "Converted", 320000),
        lead("2026-10-01", "Waterfall Estate", "A. Naidoo", "Direct enquiry", "Contacted", 180000),
        lead("2026-10-02", "Mvezo Ventures", "T. Mpondo", "Event", "Converted", 260000),
        lead("2026-10-04", "KwaZulu Dairy", "N. Zulu", "Partnership", "Qualified", 540000),
        lead("2026-10-06", "Siyazisiza Co-operative", "B. Ndlovu", "Tender", "New", 450000),
      ],
    },
    opportunities: {
      ...report.opportunities,
      opportunities: [
        opportunity("Thornhill training contract", "Thornhill Agri Services", "2026-08-12", 850000, 60, "Negotiation", "2026-10-01"),
        opportunity("AgriSETA learner placement", "AgriSETA", "2026-09-05", 1200000, 40, "Proposal", "2026-09-28"),
        opportunity("Mahlathi poultry unit", "Mahlathi Trading", "2026-09-20", 320000, 25, "Qualified", "2026-10-03"),
        opportunity("Waterfall irrigation audit", "Waterfall Estate", "2026-10-01", 180000, 15, "Opportunity", "2026-10-05"),
        opportunity("Siyazisiza enterprise support", "Siyazisiza Co-operative", "2026-07-15", 450000, 50, "Qualified", "2026-08-20", {
          nextAction: "Chase the co-operative's board resolution - no contact since August.",
          nextActionDate: "2026-10-10",
        }),
        opportunity("Mvezo vegetable supply", "Mvezo Ventures", "2026-09-12", 260000, 35, "Proposal", "2026-10-02"),
        opportunity("KwaZulu dairy skills programme", "KwaZulu Dairy", "2026-09-25", 540000, 30, "Qualified", "2026-10-04"),
        opportunity("Nkosi kraal restock project", "Nkosi Livestock", "2026-06-10", 640000, 100, "Won", "2026-09-15", {
          wonDate: "2026-09-15",
        }),
        opportunity("Drakensberg eco-tourism pilot", "Drakensberg Trails", "2026-05-20", 220000, 0, "Lost", "2026-08-30", {
          lostDate: "2026-08-30",
          lostReason: "Client withdrew the budget after their season closed.",
        }),
      ],
    },
    proposals: {
      ...report.proposals,
      proposals: [
        proposal("Thornhill Agri Services", "2026-09-18", 850000, "Won"),
        proposal("AgriSETA", "2026-09-30", 1200000, "Under Review"),
        proposal("Mvezo Ventures", "2026-10-02", 260000, "Submitted"),
        proposal("Drakensberg Trails", "2026-07-22", 220000, "Lost", {
          lostReason: "Chose a cheaper provider.",
        }),
        proposal("Waterfall Estate", "2026-10-05", 180000, "Draft"),
      ],
    },
    newBusiness: {
      ...report.newBusiness,
      newBusiness: [
        win("Nkosi Livestock", "Kraal restock and handling training", "2026-09-15", 640000, "Agriculture"),
        win("AgriSETA", "Short-course delivery partnership", "2026-10-03", 310000, "Training"),
      ],
    },
    clients: {
      ...report.clients,
      clients: [
        { id: did("client"), clientName: "Nkosi Livestock", awardDate: "2026-09-15", owner: "Thabo Molefe" },
        { id: did("client"), clientName: "AgriSETA", awardDate: "2026-10-03", owner: "Thabo Molefe" },
      ],
    },
    partnerships: {
      ...report.partnerships,
      partnerships: [
        {
          id: did("ptnr"),
          partner: "AgriSETA",
          partnershipType: "Sector education authority",
          dateInitiated: "2026-03-10",
          potentialValue: 1200000,
          status: "Active",
          owner: "Thabo Molefe",
          notes: "",
        },
        {
          id: did("ptnr"),
          partner: "Waterfall Estate",
          partnershipType: "Commercial landowner",
          dateInitiated: "2026-09-22",
          potentialValue: 180000,
          status: "Discussion",
          owner: "Thabo Molefe",
          notes: "",
        },
        {
          id: did("ptnr"),
          partner: "Siyazisiza Co-operative",
          partnershipType: "Farmer co-operative",
          dateInitiated: "2026-08-05",
          potentialValue: 450000,
          status: "Proposal",
          owner: "Thabo Molefe",
          notes: "Awaiting the co-operative's board resolution.",
        },
      ],
    },
    commentary: {
      ...report.commentary,
      majorWins:
        "Thornhill training contract signed at R850k and the AgriSETA short-course partnership awarded at R310k.",
      pipelineConcerns:
        "Siyazisiza enterprise support has had no activity since August and is now past the 30-day stall threshold.",
      supportRequired: "Executive introduction to KwaZulu Dairy to move the skills programme past qualification.",
    },
    dataSource: { kind: "Manual Entry", enteredBy: "Thabo Molefe", enteredAt: "2026-10-06T08:15:00.000Z" },
  };
}
