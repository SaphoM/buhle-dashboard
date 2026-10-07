// Business Development types - MVP proposed KPIs

import type { ReportingFrequency } from "./index";

export const BUSINESS_DEVELOPMENT_DEPARTMENT = "Business Development" as const;

export const BD_SECTION_KEYS = [
  "leads",
  "opportunities",
  "proposals",
  "newBusiness",
  "clients",
  "partnerships",
  "commentary",
] as const;

export type BdSectionKey = (typeof BD_SECTION_KEYS)[number];

export const BD_SECTION_LABELS: Record<BdSectionKey, string> = {
  leads: "Leads",
  opportunities: "Opportunities",
  proposals: "Proposals",
  newBusiness: "New Business",
  clients: "Clients",
  partnerships: "Partnerships",
  commentary: "Commentary",
};

/** One-line explanation shown on each section, so a manager knows what the
 *  register is for before opening it. */
export const BD_SECTION_PURPOSE: Record<BdSectionKey, string> = {
  leads: "Who asked about Buhle this period, where they came from, and what happened next.",
  opportunities: "Live deals, their value, how likely they are to close, and how long since anyone touched them.",
  proposals: "Proposals actually sent, and which of the decided ones were won.",
  newBusiness: "Contracts won, what they are worth, and when they started.",
  clients: "New paying clients brought in through the work above.",
  partnerships: "Partners in discussion or live, and what each is worth to Buhle.",
  commentary:
    "The written half of the submission: the wins, the losses, what is stuck and what support is needed.",
};

export type BdSectionState = "complete" | "incomplete" | "attention" | "not_available" | "not_applicable";

export type BdReportStatus = "Not Submitted" | "Draft" | "Submitted";

export type BdSourceKind = "Manual Entry" | "Not Submitted";

export interface BdDataSource {
  kind: BdSourceKind;
  enteredBy?: string;
  enteredAt?: string;
}

export interface BdSectionEnvelope {
  commentary: string;
  notApplicable: boolean;
}

export type OpportunityStage = "Lead" | "Qualified" | "Opportunity" | "Proposal" | "Negotiation" | "Won" | "Lost";

export type ProposalStatus = "Draft" | "Submitted" | "Under Review" | "Negotiation" | "Won" | "Lost" | "Withdrawn";

export type LeadSource = "Website" | "Referral" | "Partnership" | "Existing client" | "Tender" | "Direct enquiry" | "Event" | "Other";

export type PartnershipStatus = "Identified" | "Contacted" | "Discussion" | "Proposal" | "Active" | "Closed" | "Not Proceeding";

export interface Lead {
  id: string;
  dateReceived: string;
  organisation: string;
  contact: string;
  source: LeadSource;
  estimatedValue?: number | null;
  owner: string;
  status: string;
  nextAction?: string;
  nextActionDate?: string;
}

export interface Opportunity {
  id: string;
  opportunityName: string;
  client: string;
  contact?: string;
  dateCreated: string;
  source?: LeadSource;
  opportunityType?: string;
  estimatedValue: number | null;
  probability: number | null; // 0-100
  weightedValue: number | null;
  stage: OpportunityStage;
  expectedCloseDate?: string;
  owner: string;
  status?: string;
  lastActivityDate?: string;
  nextAction?: string;
  nextActionDate?: string;
  notes?: string;
  wonDate?: string;
  lostDate?: string;
  lostReason?: string;
}

export interface Proposal {
  id: string;
  client: string;
  opportunityId?: string;
  dateSubmitted: string;
  proposalValue: number | null;
  expectedDecisionDate?: string;
  owner: string;
  status: ProposalStatus;
  won: boolean | null;
  lostReason?: string;
  notes?: string;
}

export interface NewBusiness {
  id: string;
  client: string;
  opportunityId?: string;
  businessService?: string;
  awardDate: string;
  contractStartDate?: string;
  wonValue: number | null;
  owner: string;
  businessCategory?: string;
  notes?: string;
}

export interface ClientAcquired {
  id: string;
  clientName: string;
  opportunityId?: string;
  newBusinessId?: string;
  awardDate: string;
  owner?: string;
}

export interface Partnership {
  id: string;
  partner: string;
  partnershipType?: string;
  dateInitiated: string;
  opportunityId?: string;
  potentialValue?: number | null;
  status: PartnershipStatus;
  owner: string;
  nextAction?: string;
  nextActionDate?: string;
  outcome?: string;
  notes?: string;
}

export interface BdLeadsData extends BdSectionEnvelope {
  leads: Lead[];
}

export interface BdOpportunitiesData extends BdSectionEnvelope {
  opportunities: Opportunity[];
}

export interface BdProposalsData extends BdSectionEnvelope {
  proposals: Proposal[];
}

export interface BdNewBusinessData extends BdSectionEnvelope {
  newBusiness: NewBusiness[];
}

export interface BdClientsData extends BdSectionEnvelope {
  clients: ClientAcquired[];
}

export interface BdPartnershipsData extends BdSectionEnvelope {
  partnerships: Partnership[];
}

export interface BdCommentaryData extends BdSectionEnvelope {
  keyOpportunities: string;
  majorWins: string;
  lostOpportunities: string;
  pipelineConcerns: string;
  clientConcerns: string;
  partnershipDevelopments: string;
  keyAchievements: string;
  supportRequired: string;
  nextPriorities: string;
}

export interface BdReport {
  reportId: string;
  /** The reporting cycle this report answers. One report per cycle, matched by
   *  this id the same way every other department's reports are matched. */
  cycleId: string;
  department: typeof BUSINESS_DEVELOPMENT_DEPARTMENT;
  reportingPeriod: string;
  dueDate: string;
  status: BdReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  dataSource?: BdDataSource;
  leads: BdLeadsData;
  opportunities: BdOpportunitiesData;
  proposals: BdProposalsData;
  newBusiness: BdNewBusinessData;
  clients: BdClientsData;
  partnerships: BdPartnershipsData;
  commentary: BdCommentaryData;
  sectionStates?: Record<BdSectionKey, BdSectionState>;
}

export const BD_KPI_IDS = {
  activeOpportunities: "bd-active-opportunities",
  pipelineValue: "bd-pipeline-value",
  weightedPipelineValue: "bd-weighted-pipeline",
  newLeads: "bd-new-leads",
  proposalsSubmitted: "bd-proposals-submitted",
  proposalWinRate: "bd-proposal-win-rate",
  newBusinessWon: "bd-new-business-won",
  newBusinessWonCount: "bd-new-business-won-count",
  newClients: "bd-new-clients",
  bdRevenue: "bd-revenue",
  opportunitiesStalled: "bd-opportunities-stalled",
  avgDaysToClose: "bd-avg-days-close",
  opportunityConversionRate: "bd-opportunity-conversion",
  proposalConversionRate: "bd-proposal-conversion",
  leadToOpportunityConversion: "bd-lead-to-opportunity",
} as const;

export interface BdConfig {
  leadSources: readonly LeadSource[] | string[];
  /** What may be recorded as a lead's status. Kept in configuration rather
   *  than in the validation code, because "what counts as converted" is a
   *  policy question that belongs in Administration. */
  leadStatuses: string[];
  opportunityStages: readonly OpportunityStage[] | string[];
  proposalStatuses: readonly ProposalStatus[] | string[];
  partnershipStatuses: readonly PartnershipStatus[] | string[];
  opportunityTypes: string[];
  businessCategories: string[];
  reportingFrequency: ReportingFrequency;
  stalledThresholdDays: number;
  greenTargetOverride: number | null;
}
