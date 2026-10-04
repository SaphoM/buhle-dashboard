import type { Kpi } from "../types";
import {
  MARKETING_DEPARTMENT,
  type CampaignChannel,
  type CampaignStatus,
  type EnquiryChannel,
  type EnquiryOutcome,
  type EnquiryStatus,
  type LeadSource,
  type MarketingCampaignData,
  type MarketingCommentary,
  type MarketingConfig,
  type MarketingEnquiryData,
  type MarketingLeadData,
  type MarketingPartnershipData,
  type MarketingReport,
  type MarketingWebsiteData,
  type PartnershipContribution,
  type PartnershipStatus,
  type PartnershipType,
} from "../types/marketing";

/**
 * Marketing seed data: the approved vocabularies, blank record factories, and
 * the KPI templates the submission registers.
 *
 * Every vocabulary the validation checks against lives here rather than in the
 * validation code, because "is this an approved outcome" is a policy question
 * that belongs in Administration, not in a source file nobody can change.
 */

export const DEFAULT_ENQUIRY_CHANNELS = [
  "Website form",
  "Phone",
  "WhatsApp",
  "Email",
  "Walk-in",
  "Social media",
  "Referral",
  "School visit",
  "Open day",
  "Other",
] as const satisfies readonly EnquiryChannel[];

export const DEFAULT_ENQUIRY_OUTCOMES = [
  "Enrolled",
  "Awaiting decision",
  "Not enrolled - chose elsewhere",
  "Not enrolled - could not afford",
  "Not enrolled - no programme fit",
  "Unreachable",
  "Withdrawn",
  "Duplicate",
] as const satisfies readonly EnquiryOutcome[];

export const DEFAULT_ENQUIRY_STATUSES = [
  "New",
  "Contacted",
  "Follow-up",
  "Closed",
] as const satisfies readonly EnquiryStatus[];

export const DEFAULT_CAMPAIGN_CHANNELS = [
  "Digital",
  "Social media",
  "Radio",
  "Print",
  "Outdoor",
  "Email",
  "Events",
  "Schools",
  "Partner",
] as const satisfies readonly CampaignChannel[];

export const DEFAULT_CAMPAIGN_STATUSES = [
  "Planned",
  "Active",
  "Completed",
  "Cancelled",
] as const satisfies readonly CampaignStatus[];

export const DEFAULT_LEAD_SOURCES = [
  "Website",
  "Social media",
  "Referral",
  "School visit",
  "Open day",
  "Radio",
  "Print",
  "Partner",
  "Walk-in",
  "Other",
] as const satisfies readonly LeadSource[];

export const DEFAULT_PARTNERSHIP_TYPES = [
  "Referral",
  "Co-delivery",
  "Sponsorship",
  "Placement",
  "Funding",
  "Membership",
] as const satisfies readonly PartnershipType[];

export const DEFAULT_PARTNERSHIP_STATUSES = [
  "Prospect",
  "Active",
  "Lapsed",
  "Terminated",
] as const satisfies readonly PartnershipStatus[];

export const DEFAULT_PARTNERSHIP_CONTRIBUTIONS = [
  "Cash",
  "In kind",
  "Both",
  "None",
] as const satisfies readonly PartnershipContribution[];

export const DEFAULT_PROGRAMMES = [
  "Learnership",
  "Apprenticeship",
  "Bursary programme",
  "Short course",
  "Enterprise development",
] as const;

export const DEFAULT_PROVINCES = [
  "Gauteng",
  "Mpumalanga",
  "Limpopo",
  "North West",
  "KwaZulu-Natal",
  "Free State",
  "Northern Cape",
  "Eastern Cape",
  "Western Cape",
] as const;

export const DEFAULT_MARKETING_CONFIG: MarketingConfig = {
  // Monthly, unlike Commercial Farming's seasonal cadence: enquiry volume moves
  // week to week, and a monthly cycle is the shortest one that is still a
  // reporting cycle rather than a daily tally.
  reportingFrequency: "Monthly",
  currencySymbol: "R",
  enquiryChannels: [...DEFAULT_ENQUIRY_CHANNELS],
  enquiryOutcomes: [...DEFAULT_ENQUIRY_OUTCOMES],
  enquiryStatuses: [...DEFAULT_ENQUIRY_STATUSES],
  campaignChannels: [...DEFAULT_CAMPAIGN_CHANNELS],
  campaignStatuses: [...DEFAULT_CAMPAIGN_STATUSES],
  leadSources: [...DEFAULT_LEAD_SOURCES],
  partnershipTypes: [...DEFAULT_PARTNERSHIP_TYPES],
  partnershipStatuses: [...DEFAULT_PARTNERSHIP_STATUSES],
  partnershipContributions: [...DEFAULT_PARTNERSHIP_CONTRIBUTIONS],
  programmes: [...DEFAULT_PROGRAMMES],
  provinces: [...DEFAULT_PROVINCES],
};

export function blankEnquiryRecord() {
  return {
    id: "",
    channel: "" as EnquiryChannel | "",
    dateReceived: "",
    programmeInterest: "",
    province: "",
    contactVerified: false,
    status: "" as EnquiryStatus | "",
    outcome: "" as EnquiryOutcome | "",
    outcomeDate: "",
    handledBy: "",
    notes: "",
  };
}

export function blankCampaignRecord() {
  return {
    id: "",
    name: "",
    channel: "" as CampaignChannel | "",
    status: "" as CampaignStatus | "",
    startDate: "",
    endDate: "",
    budget: null,
    spend: null,
    reach: null,
    notes: "",
  };
}

export function blankLeadSourceRecord() {
  return {
    id: "",
    source: "" as LeadSource | "",
    period: "",
    leadsGenerated: null,
    leadsQualified: null,
    leadsConverted: null,
    spend: null,
    notes: "",
  };
}

export function blankPartnershipRecord() {
  return {
    id: "",
    partner: "",
    type: "" as PartnershipType | "",
    status: "" as PartnershipStatus | "",
    startDate: "",
    endDate: "",
    contribution: "" as PartnershipContribution | "",
    value: null,
    contactPerson: "",
    notes: "",
  };
}

export function blankWebsiteActivityRecord() {
  return {
    id: "",
    period: "",
    startDate: "",
    endDate: "",
    sessions: null,
    uniqueVisitors: null,
    enquiriesFromSite: null,
    conversions: null,
    topLandingPage: "",
    notes: "",
  };
}

export function blankCommentary(): MarketingCommentary {
  return {
    overall: "",
    keyIssue: "",
    keyAchievement: "",
    enquiriesCommentary: "",
    campaignsCommentary: "",
    leadsCommentary: "",
    partnershipsCommentary: "",
    websiteCommentary: "",
    kpiExplanations: {},
  };
}

/**
 * A new, empty submission.
 *
 * Every register starts empty rather than with one blank row. A report that
 * opens with an empty row invites somebody to save a draft containing a record
 * that says nothing, which then counts as "reported".
 */
export function createBlankMarketingReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: MarketingReport["frequency"];
  startDate: string;
  dueDate: string;
}): MarketingReport {
  const id = `mkt-report-${params.cycleId}`;
  return {
    id,
    cycleId: params.cycleId,
    department: MARKETING_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    enquiries: { records: [], ...blankCommentarySlice("enquiriesCommentary") } as MarketingEnquiryData,
    campaigns: { records: [], ...blankCommentarySlice("campaignsCommentary") } as MarketingCampaignData,
    leads: { records: [], ...blankCommentarySlice("leadsCommentary") } as MarketingLeadData,
    partnerships: { records: [], ...blankCommentarySlice("partnershipsCommentary") } as MarketingPartnershipData,
    website: { records: [], ...blankCommentarySlice("websiteCommentary") } as MarketingWebsiteData,
    commentary: blankCommentary(),
    dataSource: { kind: "Not Submitted" },
    status: "Not Submitted",
  };
}

/** Each section envelope carries its own commentary key, taken from the same
 *  blank commentary object so the two cannot drift. */
function blankCommentarySlice(key: keyof MarketingCommentary) {
  const c = blankCommentary();
  return { commentary: c[key] as string, notApplicable: false };
}

export const MARKETING_KPI_IDS = {
  enquiries: "kpi-enquiries",
  conversion: "kpi-conversion",
  campaignsDelivered: "kpi-campaigns-delivered",
  leadsGenerated: "kpi-leads-generated",
  leadConversionRate: "kpi-lead-conversion-rate",
  activePartnerships: "kpi-active-partnerships",
  websiteSessions: "kpi-website-sessions",
  websiteEnquiryRate: "kpi-website-enquiry-rate",
} as const;

/**
 * Marketing KPIs.
 *
 * `kpi-enquiries` and `kpi-conversion` already exist in the demo data with
 * Board-approved thresholds, and an open risk (`risk-5`, "Declining enquiries")
 * rests on `kpi-enquiries`. Those two entries therefore exist here only as
 * documentation of the derived definition, NOT as KPI records: the store
 * de-duplicates by id, and a second record with the same id and different
 * thresholds would quietly change what the board was shown. The live KPI
 * definitions stay where they are.
 *
 * Every NEW threshold is null. That is the honest position: no Marketing target
 * for campaigns, leads, partnerships or website traffic has been approved, so
 * those KPIs report `threshold_unset` - recorded, displayed, monitored, and
 * issuing no Green/Amber/Red verdict - until an administrator sets a limit.
 */
export const MARKETING_SUBMISSION_KPIS: Kpi[] = [
  {
    id: MARKETING_KPI_IDS.campaignsDelivered,
    name: "Campaigns Delivered",
    department: MARKETING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Marketing Manager",
    dataAvailable: false,
    insight:
      "Campaigns completed in the period, derived from the campaign register. No approved target has been confirmed yet.",
    sourceSystem: "Marketing submission - campaign register",
    thresholdApproval: "proposed",
  },
  {
    id: MARKETING_KPI_IDS.leadsGenerated,
    name: "Leads Generated",
    department: MARKETING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Marketing Manager",
    dataAvailable: false,
    insight:
      "Raw leads captured per source, derived from the lead generation register. No approved target has been confirmed yet.",
    sourceSystem: "Marketing submission - lead generation register",
    thresholdApproval: "proposed",
  },
  {
    id: MARKETING_KPI_IDS.leadConversionRate,
    name: "Lead Conversion Rate",
    department: MARKETING_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Marketing Manager",
    dataAvailable: false,
    insight:
      "Converted leads as a share of leads generated, derived from the lead generation register. No approved target has been confirmed yet.",
    sourceSystem: "Marketing submission - lead generation register",
    thresholdApproval: "proposed",
  },
  {
    id: MARKETING_KPI_IDS.activePartnerships,
    name: "Active Partnerships",
    department: MARKETING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Marketing Manager",
    dataAvailable: false,
    insight:
      "Partnerships with a status of Active, derived from the partnership register. Lapsed and terminated partners are reported separately, not hidden.",
    sourceSystem: "Marketing submission - partnership register",
    thresholdApproval: "proposed",
  },
  {
    id: MARKETING_KPI_IDS.websiteSessions,
    name: "Website Sessions",
    department: MARKETING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Marketing Manager",
    dataAvailable: false,
    insight:
      "Website sessions recorded for the period, derived from the website activity register. No approved target has been confirmed yet.",
    sourceSystem: "Marketing submission - website activity register",
    thresholdApproval: "proposed",
  },
  {
    id: MARKETING_KPI_IDS.websiteEnquiryRate,
    name: "Website Enquiry Rate",
    department: MARKETING_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Marketing Manager",
    dataAvailable: false,
    insight:
      "Website-raised enquiries as a share of website sessions, derived from the website activity register. No approved target has been confirmed yet.",
    sourceSystem: "Marketing submission - website activity register",
    thresholdApproval: "proposed",
  },
];