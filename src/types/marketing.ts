import type { Kpi, ReportingFrequency } from "../types";

/**
 * ============================================================================
 * MARKETING - the department's data model.
 * ============================================================================
 *
 * Marketing answers five questions every reporting period:
 *
 *  - How many people asked about us, and what happened to them?
 *  - What did we run, what did it cost, and what did it produce?
 *  - How many leads did each source generate, and how many converted?
 *  - Which partnerships are live, and which have lapsed?
 *  - What is the website doing, and is it turning visitors into enquiries?
 *
 * Every Marketing KPI is DERIVED from the rows in those five registers. None is
 * typed. That is the whole design, and it matters most here of all: conversion
 * rate is the one figure in this department that is trivially, invisibly
 * faked. Somebody who wants a green conversion rate can simply type a green
 * conversion rate. Built from the enquiry register instead, the figure is the
 * arithmetic of what actually happened to real enquiries, and nobody can move it
 * without moving the underlying record.
 *
 * Two existing KPI ids are carried through unchanged - `kpi-enquiries` and
 * `kpi-conversion` - because an open Board risk (`risk-5`, "Declining
 * enquiries") points at `kpi-enquiries` and both already carry approved
 * thresholds. Changing an id would silently orphan the risk.
 */

export const MARKETING_DEPARTMENT = "Marketing" as const;

export const MARKETING_SECTION_KEYS = [
  "enquiries",
  "campaigns",
  "leads",
  "partnerships",
  "website",
] as const;

export type MarketingSectionKey = (typeof MARKETING_SECTION_KEYS)[number];

export const MARKETING_SECTION_LABELS: Record<MarketingSectionKey, string> = {
  enquiries: "Enquiries",
  campaigns: "Campaigns",
  leads: "Lead Generation",
  partnerships: "Partnerships",
  website: "Website Activity",
};

/** Per-section completion state in the modal's progress strip.
 *
 *  There is deliberately no "not_available" state. Marketing can report all five
 *  areas from its own records, so a genuinely missing figure is `incomplete` -
 *  a data gap - and must not hide behind a capability message. */
export type MarketingSectionState = "complete" | "incomplete" | "attention" | "not_applicable";

/** Shared section envelope: records, commentary, and the explicit N/A switch. */
export interface MarketingSectionEnvelope {
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Approved vocabularies
// ---------------------------------------------------------------------------

/** Where an enquiry came from. Drives the per-channel breakdown, so it is a
 *  closed list rather than free text. */
export type EnquiryChannel =
  | "Website form"
  | "Phone"
  | "WhatsApp"
  | "Email"
  | "Walk-in"
  | "Social media"
  | "Referral"
  | "School visit"
  | "Open day"
  | "Other";

/** What happened to the enquiry. The conversion rate is the share of enquiries
 *  whose outcome is "Enrolled", so the list deliberately separates "the person
 *  said no" from "we never reached them" and from "they are still deciding".
 *  Collapsing those three into one "lost" is what makes most conversion figures
 *  meaningless. */
export type EnquiryOutcome =
  | "Enrolled"
  | "Awaiting decision"
  | "Not enrolled - chose elsewhere"
  | "Not enrolled - could not afford"
  | "Not enrolled - no programme fit"
  | "Unreachable"
  | "Withdrawn"
  | "Duplicate";

/** Whether the contact details were verified. An unverifiable enquiry cannot
 *  become an enrolment, so it must not sit in the conversion denominator. */
export type EnquiryStatus = "New" | "Contacted" | "Follow-up" | "Closed";

export type CampaignChannel =
  | "Digital"
  | "Social media"
  | "Radio"
  | "Print"
  | "Outdoor"
  | "Email"
  | "Events"
  | "Schools"
  | "Partner";

export type CampaignStatus = "Planned" | "Active" | "Completed" | "Cancelled";

export type LeadSource =
  | "Website"
  | "Social media"
  | "Referral"
  | "School visit"
  | "Open day"
  | "Radio"
  | "Print"
  | "Partner"
  | "Walk-in"
  | "Other";

export type PartnershipType =
  | "Referral"
  | "Co-delivery"
  | "Sponsorship"
  | "Placement"
  | "Funding"
  | "Membership";

export type PartnershipStatus = "Prospect" | "Active" | "Lapsed" | "Terminated";

export type PartnershipContribution = "Cash" | "In kind" | "Both" | "None";

// ---------------------------------------------------------------------------
// Section 1 - Enquiries
// ---------------------------------------------------------------------------

/**
 * One row per person who asked about the organisation.
 *
 * The OUTCOME field is what makes conversion rate derivable rather than typed.
 * An enquiry with no outcome is still open, and the engine reports how many are
 * still open rather than counting them as failures.
 */
export interface EnquiryRecord {
  id: string;
  /** Configured source of the enquiry. */
  channel: EnquiryChannel | "";
  /** ISO date the enquiry was received. */
  dateReceived: string;
  /** Programme or qualification the person asked about. */
  programmeInterest: string;
  /** Province or region the person is in, for the geographic read. */
  province: string;
  /** Whether the contact details were verified. Required before an enquiry can
   *  be counted as having converted. */
  contactVerified: boolean;
  /** Configured workflow state. */
  status: EnquiryStatus | "";
  /** Configured outcome, or blank while the enquiry is still open. */
  outcome: EnquiryOutcome | "";
  /** ISO date the outcome was recorded. */
  outcomeDate: string;
  /** Name of the staff member who handled it. */
  handledBy: string;
  notes: string;
}

export interface MarketingEnquiryData extends MarketingSectionEnvelope {
  records: EnquiryRecord[];
}

// ---------------------------------------------------------------------------
// Section 2 - Campaigns
// ---------------------------------------------------------------------------

/**
 * One row per campaign.
 *
 * Spend is recorded against the campaign and the enquiries it produced are
 * recorded on the enquiry register, with the campaign named. That link is what
 * makes cost per enquiry derivable rather than a number somebody worked out in
 * a spreadsheet and typed in.
 */
export interface CampaignRecord {
  id: string;
  /** Campaign name, which the enquiry register references. */
  name: string;
  channel: CampaignChannel | "";
  status: CampaignStatus | "";
  /** ISO start date. */
  startDate: string;
  /** ISO end date, blank while active. */
  endDate: string;
  /** Planned budget in rand. */
  budget: number | null;
  /** Actual spend in rand. Null means "not known yet", which is not zero. */
  spend: number | null;
  /** People reached. Not convertible with clicks; recorded as reported. */
  reach: number | null;
  notes: string;
}

export interface MarketingCampaignData extends MarketingSectionEnvelope {
  records: CampaignRecord[];
}

// ---------------------------------------------------------------------------
// Section 3 - Lead generation and conversion
// ---------------------------------------------------------------------------

/**
 * Lead generation by source.
 *
 * Leads GENERATED, QUALIFIED and CONVERTED are three different numbers and are
 * kept as three separate columns rather than one funnel percentage. A lead that
 * nobody followed up is generated but neither qualified nor converted, and
 * collapsing the three into a single conversion figure hides exactly the
 * failures worth seeing.
 *
 * Spend per source is recorded here rather than derived from the campaign
 * register, because a campaign often serves several sources and the split is a
 * judgement the marketing team makes, not an arithmetic fact.
 */
export interface LeadSourceRecord {
  id: string;
  /** Configured lead source. */
  source: LeadSource | "";
  /** ISO period the figures cover. */
  period: string;
  /** Raw leads captured. The denominator of the conversion rate. */
  leadsGenerated: number | null;
  /** Leads that passed the qualification check. */
  leadsQualified: number | null;
  /** Leads that became enrolments or applications. The numerator. */
  leadsConverted: number | null;
  /** Spend attributed to this source in rand. Null when not apportioned. */
  spend: number | null;
  notes: string;
}

export interface MarketingLeadData extends MarketingSectionEnvelope {
  records: LeadSourceRecord[];
}

// ---------------------------------------------------------------------------
// Section 4 - Partnerships
// ---------------------------------------------------------------------------

/**
 * One row per partner relationship.
 *
 * A lapsed partnership is reported, not deleted. "We had three partnerships" and
 * "we have two partnerships and one died in March" are different facts, and only
 * the second one is useful.
 */
export interface PartnershipRecord {
  id: string;
  /** Partner organisation or person. */
  partner: string;
  type: PartnershipType | "";
  status: PartnershipStatus | "";
  /** ISO start date. */
  startDate: string;
  /** ISO end date, or licence/contract expiry. Blank while open-ended. */
  endDate: string;
  /** Configured contribution type. */
  contribution: PartnershipContribution | "";
  /** Cash value of the contribution in rand, where it has one. */
  value: number | null;
  contactPerson: string;
  notes: string;
}

export interface MarketingPartnershipData extends MarketingSectionEnvelope {
  records: PartnershipRecord[];
}

// ---------------------------------------------------------------------------
// Section 5 - Website activity
// ---------------------------------------------------------------------------

/**
 * One row per period of web analytics.
 *
 * Sessions, enquiries and conversions are all counts from the same analytics
 * period, which is what lets the site enquiry rate be derived instead of typed.
 * `conversions` is recorded separately from `enquiriesFromSite` because a site
 * conversion is not always an enquiry: a download or a bursary-form completion is
 * a conversion but not somebody asking to study.
 */
export interface WebsiteActivityRecord {
  id: string;
  /** Period label exactly as the analytics tool reports it, e.g. "2026-09". */
  period: string;
  /** ISO first day of the period. */
  startDate: string;
  /** ISO last day of the period. */
  endDate: string;
  sessions: number | null;
  /** Distinct visitors. */
  uniqueVisitors: number | null;
  /** Total enquiries raised by the site in the period. */
  enquiriesFromSite: number | null;
  /** Completed conversion actions of any kind. */
  conversions: number | null;
  /** Top landing page in the period, for the content read. */
  topLandingPage: string;
  notes: string;
}

export interface MarketingWebsiteData extends MarketingSectionEnvelope {
  records: WebsiteActivityRecord[];
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

/** "Not Submitted" is the honest initial state. A report that has never been
 *  typed must not present as a manual entry, because a reader would assume
 *  somebody entered the figures deliberately. */
export type MarketingReportStatus = "Not Submitted" | "Draft" | "Submitted";

export type MarketingSourceKind = "Manual Entry" | "Not Submitted";

export interface MarketingDataSource {
  kind: MarketingSourceKind;
  /** Person who entered the figures, when typed manually. */
  enteredBy?: string;
  enteredAt?: string;
  /** Set when entry was attempted and failed, so the section reports the failure
   *  rather than reading as empty-and-fine. */
  failedAt?: string;
  failureReason?: string;
}

export interface MarketingReport {
  id: string;
  cycleId: string;
  department: typeof MARKETING_DEPARTMENT;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  /** ISO first day of the reporting window. Bounds which records belong here. */
  startDate: string;
  /** ISO submission due date. Doubles as the end of the reporting window. */
  dueDate: string;
  enquiries: MarketingEnquiryData;
  campaigns: MarketingCampaignData;
  leads: MarketingLeadData;
  partnerships: MarketingPartnershipData;
  website: MarketingWebsiteData;
  commentary: MarketingCommentary;
  dataSource: MarketingDataSource;
  status: MarketingReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  /** KPI values derived from this submission - the audit record of what was
   *  calculated. */
  derivedValues?: Record<string, number>;
}

export interface MarketingCommentary {
  overall: string;
  keyIssue: string;
  keyAchievement: string;
  enquiriesCommentary: string;
  campaignsCommentary: string;
  leadsCommentary: string;
  partnershipsCommentary: string;
  websiteCommentary: string;
  /** Per-KPI explanation, keyed by KPI id, for Amber/Red figures. */
  kpiExplanations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Configuration - Section 4: the approved vocabularies and cadence
// ---------------------------------------------------------------------------

export interface MarketingConfig {
  /** Cadence of the Marketing reporting cycle. Monthly by default, because
   *  enquiry volume is the one Marketing figure that moves on a timescale of
   *  days and a seasonal cadence would report the same pipeline for a whole
   *  quarter and make it look stalled. */
  reportingFrequency: ReportingFrequency;
  /** Currency symbol for campaign spend and partnership value. */
  currencySymbol: string;
  /** Approved enquiry sources. */
  enquiryChannels: EnquiryChannel[];
  /** Approved enquiry outcomes. The conversion rate is derived from these, so an
   *  outcome added here immediately changes what counts as a conversion. */
  enquiryOutcomes: EnquiryOutcome[];
  /** Approved workflow states for an enquiry. */
  enquiryStatuses: EnquiryStatus[];
  /** Approved campaign channels. */
  campaignChannels: CampaignChannel[];
  /** Approved campaign states. */
  campaignStatuses: CampaignStatus[];
  /** Approved lead sources. */
  leadSources: LeadSource[];
  /** Approved partnership types. */
  partnershipTypes: PartnershipType[];
  /** Approved partnership states. */
  partnershipStatuses: PartnershipStatus[];
  /** Approved contribution types. */
  partnershipContributions: PartnershipContribution[];
  /** Approved programmes or qualifications, for the enquiry interest field. */
  programmes: string[];
  /** Approved provinces. */
  provinces: string[];
}

// ---------------------------------------------------------------------------
// KPI ids
// ---------------------------------------------------------------------------

/** The KPI ids this department owns. Named once so the seed, the engine, the
 *  modal and the tests cannot drift apart. */
export const MARKETING_KPI_IDS = {
  /** Pre-existing. Carried through with its approved thresholds intact. */
  enquiries: "kpi-enquiries",
  /** Pre-existing. Carried through with its approved thresholds intact. */
  conversion: "kpi-conversion",
  campaignsDelivered: "kpi-campaigns-delivered",
  leadsGenerated: "kpi-leads-generated",
  leadConversionRate: "kpi-lead-conversion-rate",
  activePartnerships: "kpi-active-partnerships",
  websiteSessions: "kpi-website-sessions",
  websiteEnquiryRate: "kpi-website-enquiry-rate",
} as const satisfies Record<string, string>;

export type MarketingKpiId = (typeof MARKETING_KPI_IDS)[keyof typeof MARKETING_KPI_IDS];

/** Convenience for building a KPI the department derives. */
export type MarketingSubmissionKpi = Kpi;