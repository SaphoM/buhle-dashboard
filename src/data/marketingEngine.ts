import { getStatusForValue } from "./kpiEngine";
import {
  MARKETING_KPI_IDS,
  type CampaignRecord,
  type EnquiryRecord,
  type LeadSourceRecord,
  type MarketingConfig,
  type MarketingReport,
} from "../types/marketing";
import type { Kpi } from "../types";

/**
 * ============================================================================
 * Marketing engine - derives every Marketing KPI from the five registers.
 * ============================================================================
 *
 * The governing rule, the same one HR, Finance, Operations and Commercial
 * Farming apply: nothing is derived here that was typed, and nothing typed
 * anywhere survives as a KPI.
 *
 * The conversions deserve naming, because they are where a marketing dashboard
 * usually goes wrong:
 *
 *  - "148 enquiries, 28% conversion" in the demo data was two independent typed
 *    numbers that happened to be plausible. Under this engine the conversion
 *    rate is the share of *recorded enquiries* whose outcome is Enrolled. If
 *    nobody records outcomes, there is no conversion rate at all - which is the
 *    correct answer, and a much more useful one than a green 28%.
 *
 *  - Duplicates are excluded from the conversion denominator. Counting the same
 *    person twice because they phoned and then emailed is the single most
 *    common way a conversion rate gets flattered.
 *
 *  - Unverifiable contacts cannot convert. An enquiry whose details were never
 *    confirmed cannot become an enrolment, so allowing it to count as a
 *    conversion would let the rate be improved by recording less.
 *
 *  - Still-open enquiries are reported as open, not as failures. "Deciding" is
 *    not "rejected", and treating it as a rejection penalises a pipeline that
 *    is merely young.
 *
 *  - Campaign cost per enquiry is only derived for campaigns whose spend is
 *    known AND which are named on at least one enquiry. Dividing spend by
 *    enquiries the campaign never produced would invent a cost per enquiry and
 *    then act on it.
 */

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export interface EnquirySummary {
  /** Every enquiry row recorded. */
  total: number;
  /** Enquiries excluding duplicates, i.e. the real count of interested people. */
  totalExcludingDuplicates: number;
  duplicates: number;
  /** Enquiries with no outcome recorded yet. */
  open: number;
  /** Enquiries whose outcome is Enrolled, out of the non-duplicate total. */
  converted: number;
  /** The conversion rate as a percentage of non-duplicate enquiries, or null
   *  when there is nothing to divide by. */
  conversionRatePct: number | null;
  /** The conversion rate the application counts toward the KPI: same
   *  arithmetic, but unverifiable contacts are moved out of the denominator
   *  because they cannot convert. */
  reportableConversionRatePct: number | null;
  /** Enquiries excluded from the reportable denominator for being unverifiable. */
  unverifiable: number;
  /** How many enquiries carry a recorded outcome at all. Zero means the
   *  conversion rate is unknown rather than zero. */
  outcomesRecorded: number;
  byChannel: { channel: string; total: number; converted: number; ratePct: number | null }[];
  byProgramme: { programme: string; total: number; converted: number }[];
  byProvince: { province: string; total: number; converted: number }[];
  /** Outcome breakdown, so "no" and "could not reach" stay distinguishable. */
  byOutcome: { outcome: string; count: number }[];
}

function isBlankOutcome(r: EnquiryRecord): boolean {
  return r.outcome === "" || r.outcome === undefined;
}

/** An enquiry that has been resolved one way or another. Everything else is
 *  still in play. */
const RESOLVED_BY_OUTCOME = new Set([
  "Enrolled",
  "Not enrolled - chose elsewhere",
  "Not enrolled - could not afford",
  "Not enrolled - no programme fit",
  "Withdrawn",
]);

export function summariseEnquiries(report: MarketingReport): EnquirySummary | null {
  const records = report.enquiries.records;
  if (records.length === 0) return null;

  const duplicates = records.filter((r) => r.outcome === "Duplicate");
  const real = records.filter((r) => r.outcome !== "Duplicate");

  // A verified contact is the only kind that can become an enrolment.
  const reportable = real.filter((r) => r.contactVerified);
  const unverifiable = real.length - reportable.length;

  const isConverted = (r: EnquiryRecord) => r.outcome === "Enrolled";
  const open = real.filter((r) => !RESOLVED_BY_OUTCOME.has(r.outcome)).length;
  const converted = real.filter(isConverted).length;
  const reportableConverted = reportable.filter(isConverted).length;
  const outcomesRecorded = real.filter((r) => !isBlankOutcome(r)).length;

  // A recorded outcome includes "Awaiting decision" and "Unreachable", so this
  // counts any decision, not just a conversion.
  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

  // If nobody has recorded a single outcome, there is no conversion rate to
  // calculate. Returning 0% here would be the single most misleading figure this
  // engine could produce: it would read as "every enquiry failed" when the truth
  // is "nobody has said what happened to any of them yet".
  const conversionKnown = outcomesRecorded > 0;

  const group = <T extends string>(rows: EnquiryRecord[], key: (r: EnquiryRecord) => T) => {
    const map = new Map<T, { total: number; converted: number }>();
    for (const r of rows) {
      const k = key(r);
      if (!k) continue;
      const entry = map.get(k) ?? { total: 0, converted: 0 };
      entry.total += 1;
      if (isConverted(r)) entry.converted += 1;
      map.set(k, entry);
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v }));
  };

  const channels = group(real, (r) => r.channel);
  const programmes = group(real, (r) => r.programmeInterest);
  const provinces = group(real, (r) => r.province);

  const byOutcome = new Map<string, number>();
  for (const r of records) {
    const key = r.outcome || "Still open";
    byOutcome.set(key, (byOutcome.get(key) ?? 0) + 1);
  }

  return {
    total: records.length,
    totalExcludingDuplicates: real.length,
    duplicates: duplicates.length,
    open,
    converted,
    conversionRatePct: conversionKnown ? rate(converted, real.length) : null,
    reportableConversionRatePct: conversionKnown ? rate(reportableConverted, reportable.length) : null,
    unverifiable,
    outcomesRecorded,
    byChannel: channels
      .map((c) => ({
        channel: c.name,
        total: c.total,
        converted: c.converted,
        ratePct: rate(c.converted, c.total),
      }))
      .sort((a, b) => b.total - a.total),
    byProgramme: programmes.map((p) => ({ programme: p.name, total: p.total, converted: p.converted })),
    byProvince: provinces.map((p) => ({ province: p.name, total: p.total, converted: p.converted })),
    byOutcome: [...byOutcome.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CampaignSummary {
  total: number;
  planned: number;
  active: number;
  completed: number;
  cancelled: number;
  /** Combined spend across campaigns whose spend is known. */
  totalSpend: number | null;
  /** Campaigns whose spend was never recorded, so the spend total is partial. */
  missingSpend: number;
  totalBudget: number | null;
  /** Campaigns where spend exceeded the budget. A governance signal, not a KPI. */
  overBudget: { name: string; budget: number; spend: number }[];
  byChannel: { channel: string; campaigns: number; spend: number | null }[];
  /**
   * Cost per enquiry, only where a campaign's spend is known AND at least one
   * enquiry names it. Campaigns nobody has attributed enquiries to are listed
   * with null rather than being given an invented figure.
   */
  costPerEnquiry: { name: string; spend: number; enquiries: number; cost: number }[];
  /** Campaigns with a spend and no attributed enquiries: money out, nothing
   *  recorded coming back. Worth naming, because it is invisible in a total. */
  unattributed: { name: string; spend: number }[];
}

export function summariseCampaigns(report: MarketingReport): CampaignSummary | null {
  const records = report.campaigns.records;
  if (records.length === 0) return null;

  const spendRows = records.filter((r) => r.spend !== null);
  const totalSpend = spendRows.length > 0 ? spendRows.reduce((s, r) => s + (r.spend ?? 0), 0) : null;
  const budgetRows = records.filter((r) => r.budget !== null);
  const totalBudget = budgetRows.length > 0 ? budgetRows.reduce((s, r) => s + (r.budget ?? 0), 0) : null;

  const overBudget = records
    .filter((r): r is CampaignRecord & { budget: number; spend: number } => r.budget !== null && r.spend !== null && r.spend > r.budget)
    .map((r) => ({ name: r.name, budget: r.budget, spend: r.spend }));

  const channelMap = new Map<string, { campaigns: number; spend: number }>();
  for (const r of records) {
    if (!r.channel) continue;
    const entry = channelMap.get(r.channel) ?? { campaigns: 0, spend: 0 };
    entry.campaigns += 1;
    entry.spend += r.spend ?? 0;
    channelMap.set(r.channel, entry);
  }

  // An enquiry only counts against a campaign when it names one in its notes or
  // programme field. Marketing records the campaign reference as free text in
  // the enquiry notes, so the match is on the campaign name appearing there.
  const enquiryText = report.enquiries.records.map((r) => `${r.notes} ${r.programmeInterest}`.toLowerCase());
  const attributed = (name: string) => {
    const needle = name.trim().toLowerCase();
    if (!needle) return 0;
    return enquiryText.filter((t) => t.includes(needle)).length;
  };

  const costPerEnquiry: CampaignSummary["costPerEnquiry"] = [];
  const unattributed: CampaignSummary["unattributed"] = [];
  for (const r of records) {
    if (r.spend === null) continue;
    const count = attributed(r.name);
    if (count > 0) costPerEnquiry.push({ name: r.name, spend: r.spend, enquiries: count, cost: r.spend / count });
    else unattributed.push({ name: r.name, spend: r.spend });
  }

  return {
    total: records.length,
    planned: records.filter((r) => r.status === "Planned").length,
    active: records.filter((r) => r.status === "Active").length,
    completed: records.filter((r) => r.status === "Completed").length,
    cancelled: records.filter((r) => r.status === "Cancelled").length,
    totalSpend,
    missingSpend: records.length - spendRows.length,
    totalBudget,
    overBudget,
    byChannel: [...channelMap.entries()].map(([channel, v]) => ({
      channel,
      campaigns: v.campaigns,
      spend: v.spend > 0 ? v.spend : null,
    })),
    costPerEnquiry,
    unattributed,
  };
}

// ---------------------------------------------------------------------------
// Lead generation
// ---------------------------------------------------------------------------

export interface LeadSummary {
  /** Raw leads captured across all sources. */
  generated: number | null;
  qualified: number | null;
  converted: number | null;
  /** Converted as a share of generated, or null with no denominator. */
  conversionRatePct: number | null;
  /** Qualified as a share of generated. The drop between these two is where
   *  lead quality fails, and it is invisible in the conversion rate alone. */
  qualificationRatePct: number | null;
  /** Rows whose converted count exceeds their generated count. */
  inconsistent: LeadSourceRecord[];
  bySource: {
    source: string;
    generated: number | null;
    qualified: number | null;
    converted: number | null;
    ratePct: number | null;
    spend: number | null;
    costPerLead: number | null;
  }[];
  /** Sources producing leads, ranked by conversion rate. Only sources with both
   *  a numerator and a denominator appear. */
  bestSource: string | null;
  worstSource: string | null;
  totalSpend: number | null;
}

export function summariseLeads(report: MarketingReport): LeadSummary | null {
  const records = report.leads.records;
  if (records.length === 0) return null;

  const sum = (key: "leadsGenerated" | "leadsQualified" | "leadsConverted") => {
    const rows = records.filter((r) => r[key] !== null);
    // Any row left blank makes the total partial rather than wrong.
    return rows.length > 0 ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null;
  };

  const generated = sum("leadsGenerated");
  const qualified = sum("leadsQualified");
  const converted = sum("leadsConverted");
  const rate = (num: number | null, den: number | null) =>
    num !== null && den !== null && den > 0 ? (num / den) * 100 : null;

  const inconsistent = records.filter(
    (r) =>
      r.leadsConverted !== null && r.leadsGenerated !== null && r.leadsConverted > r.leadsGenerated
  );

  const bySource = records
    .filter((r) => r.source)
    .map((r) => ({
      source: r.source,
      generated: r.leadsGenerated,
      qualified: r.leadsQualified,
      converted: r.leadsConverted,
      ratePct: rate(r.leadsConverted, r.leadsGenerated),
      spend: r.spend,
      costPerLead:
        r.spend !== null && r.leadsGenerated !== null && r.leadsGenerated > 0 ? r.spend / r.leadsGenerated : null,
    }))
    .sort((a, b) => (b.generated ?? 0) - (a.generated ?? 0));

  const ranked = bySource.filter((s) => s.ratePct !== null).sort((a, b) => b.ratePct! - a.ratePct!);
  const spendRows = records.filter((r) => r.spend !== null);

  return {
    generated,
    qualified,
    converted,
    conversionRatePct: rate(converted, generated),
    qualificationRatePct: rate(qualified, generated),
    inconsistent,
    bySource,
    bestSource: ranked[0]?.source ?? null,
    worstSource: ranked.length > 1 ? ranked[ranked.length - 1].source : null,
    totalSpend: spendRows.length > 0 ? spendRows.reduce((s, r) => s + (r.spend ?? 0), 0) : null,
  };
}

// ---------------------------------------------------------------------------
// Partnerships
// ---------------------------------------------------------------------------

export interface PartnershipSummary {
  total: number;
  active: number;
  prospects: number;
  /** Lapsed and terminated, reported rather than deleted. */
  ended: number;
  /** Active partnerships past their end date: a live relationship that has
   *  actually expired. A compliance finding, not a performance figure. */
  expired: { partner: string; endDate: string }[];
  /** Active partnerships with no end date recorded: the ones nobody is
   *  tracking to renewal. */
  openEnded: number;
  totalValue: number | null;
  byType: { type: string; active: number; total: number }[];
  /** Active partners that contributed nothing at all. */
  inactiveActive: string[];
}

export function summarisePartnerships(report: MarketingReport, today: Date = new Date()): PartnershipSummary | null {
  const records = report.partnerships.records;
  if (records.length === 0) return null;

  const active = records.filter((r) => r.status === "Active");
  const expired = active
    .filter((r) => r.endDate && new Date(r.endDate).getTime() < today.getTime())
    .map((r) => ({ partner: r.partner, endDate: r.endDate }));

  const valueRows = records.filter((r) => r.value !== null);
  const typeMap = new Map<string, { active: number; total: number }>();
  for (const r of records) {
    if (!r.type) continue;
    const entry = typeMap.get(r.type) ?? { active: 0, total: 0 };
    entry.total += 1;
    if (r.status === "Active") entry.active += 1;
    typeMap.set(r.type, entry);
  }

  return {
    total: records.length,
    active: active.length,
    prospects: records.filter((r) => r.status === "Prospect").length,
    ended: records.filter((r) => r.status === "Lapsed" || r.status === "Terminated").length,
    expired,
    openEnded: active.filter((r) => !r.endDate).length,
    totalValue: valueRows.length > 0 ? valueRows.reduce((s, r) => s + (r.value ?? 0), 0) : null,
    byType: [...typeMap.entries()].map(([type, v]) => ({ type, ...v })),
    inactiveActive: active.filter((r) => r.contribution === "None").map((r) => r.partner),
  };
}

// ---------------------------------------------------------------------------
// Website activity
// ---------------------------------------------------------------------------

export interface WebsiteSummary {
  /** Records with any period of analytics. */
  periods: number;
  sessions: number | null;
  uniqueVisitors: number | null;
  /** Share of sessions that were repeat visitors. */
  returningSharePct: number | null;
  enquiriesFromSite: number | null;
  conversions: number | null;
  /** Website enquiries as a share of sessions, or null with no denominator.
   *  This is the figure that says whether the website is working. */
  enquiryRatePct: number | null;
  /** Enquiries in the website register that are missing from the enquiry
   *  register, i.e. the two systems disagree about what the site produced. */
  unmatchedSiteEnquiries: number | null;
  topLandingPages: { page: string; periods: number }[];
  /** Periods whose sessions figure was never recorded. */
  missingSessions: number;
}

export function summariseWebsite(report: MarketingReport): WebsiteSummary | null {
  const records = report.website.records;
  if (records.length === 0) return null;

  const sum = (key: "sessions" | "uniqueVisitors" | "enquiriesFromSite" | "conversions") => {
    const rows = records.filter((r) => r[key] !== null);
    return rows.length > 0 ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null;
  };

  const sessions = sum("sessions");
  const uniqueVisitors = sum("uniqueVisitors");
  const enquiriesFromSite = sum("enquiriesFromSite");
  const conversions = sum("conversions");

  const pageMap = new Map<string, number>();
  for (const r of records) {
    if (!r.topLandingPage) continue;
    pageMap.set(r.topLandingPage, (pageMap.get(r.topLandingPage) ?? 0) + 1);
  }

  // The enquiry register and the website register are two descriptions of the
  // same month. If the site says it produced 40 enquiries and the enquiry
  // register holds 30 web enquiries, the gap is named rather than absorbed.
  const webChannelEnquiries = report.enquiries.records.filter((r) => r.channel === "Website form").length;
  const unmatched =
    enquiriesFromSite !== null && enquiriesFromSite > 0 ? Math.max(0, enquiriesFromSite - webChannelEnquiries) : null;

  return {
    periods: records.length,
    sessions,
    uniqueVisitors,
    returningSharePct:
      sessions !== null && uniqueVisitors !== null && uniqueVisitors > 0
        ? ((sessions - uniqueVisitors) / sessions) * 100
        : null,
    enquiriesFromSite,
    conversions,
    enquiryRatePct:
      sessions !== null && enquiriesFromSite !== null && sessions > 0 ? (enquiriesFromSite / sessions) * 100 : null,
    unmatchedSiteEnquiries: unmatched,
    topLandingPages: [...pageMap.entries()]
      .map(([page, periods]) => ({ page, periods }))
      .sort((a, b) => b.periods - a.periods),
    missingSessions: records.filter((r) => r.sessions === null).length,
  };
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

export interface SkippedMarketingKpi {
  kpiId: string;
  reason: "no_data";
  /** A sentence naming the specific obstacle, not "no data". */
  detail: string;
}

export interface MarketingComputation {
  enquiries: EnquirySummary | null;
  campaigns: CampaignSummary | null;
  leads: LeadSummary | null;
  partnerships: PartnershipSummary | null;
  website: WebsiteSummary | null;
  /** KPI id and value, for every figure that could be derived. */
  entries: { kpiId: string; value: number }[];
  /** KPI id and the reason it could not be derived. */
  skipped: SkippedMarketingKpi[];
}

/**
 * The two pre-existing KPIs are derived from the ENQUIRY register, not from the
 * lead register: `kpi-enquiries` counts enquiries and `kpi-conversion` is an
 * enquiry-to-enrolment rate, so the enquiry register is its only honest
 * denominator. The lead register has its own, separate conversion rate, because
 * a lead and an enquiry are not the same population.
 */
export function computeMarketingKpis(
  report: MarketingReport,
  kpis: { id: string; name: string }[],
  _config: MarketingConfig
): MarketingComputation {
  const enquiries = summariseEnquiries(report);
  const campaigns = summariseCampaigns(report);
  const leads = summariseLeads(report);
  const partnerships = summarisePartnerships(report);
  const website = summariseWebsite(report);

  const values: Record<string, number | null> = {
    [MARKETING_KPI_IDS.enquiries]: enquiries?.totalExcludingDuplicates ?? null,
    [MARKETING_KPI_IDS.conversion]: enquiries?.reportableConversionRatePct ?? null,
    [MARKETING_KPI_IDS.campaignsDelivered]: campaigns?.completed ?? null,
    [MARKETING_KPI_IDS.leadsGenerated]: leads?.generated ?? null,
    [MARKETING_KPI_IDS.leadConversionRate]: leads?.conversionRatePct ?? null,
    [MARKETING_KPI_IDS.activePartnerships]: partnerships?.active ?? null,
    [MARKETING_KPI_IDS.websiteSessions]: website?.sessions ?? null,
    [MARKETING_KPI_IDS.websiteEnquiryRate]: website?.enquiryRatePct ?? null,
  };

  const detailFor = (kpiId: string): string | null => {
    switch (kpiId) {
      case MARKETING_KPI_IDS.enquiries:
        return "No enquiries were recorded in the enquiry register, so there is nothing to count.";
      case MARKETING_KPI_IDS.conversion:
        return !enquiries
          ? "No enquiries recorded, so there is no conversion rate to calculate."
          : enquiries.totalExcludingDuplicates === 0
            ? "No enquiries recorded, so there is no conversion rate to calculate."
            : `No outcomes were recorded for any of the ${enquiries.totalExcludingDuplicates} enquiries, so there is no conversion rate. Reporting 0% would say every enquiry failed, which is not what is known.`;
      case MARKETING_KPI_IDS.campaignsDelivered:
        return "No campaigns were recorded as Completed, so no delivered-campaign count can be derived.";
      case MARKETING_KPI_IDS.leadsGenerated:
        return "No lead sources were recorded, so no lead count can be derived.";
      case MARKETING_KPI_IDS.leadConversionRate:
        return leads?.generated
          ? "Leads were recorded but none were recorded as converted, so there is no conversion rate."
          : "No leads were recorded, so there is no conversion rate to calculate.";
      case MARKETING_KPI_IDS.activePartnerships:
        return "No partnerships were recorded with a status of Active.";
      case MARKETING_KPI_IDS.websiteSessions:
        return "No website sessions were recorded in the website activity register.";
      case MARKETING_KPI_IDS.websiteEnquiryRate:
        return website?.sessions
          ? "Website sessions were recorded but no website-raised enquiries, so the rate cannot be calculated."
          : "No website sessions were recorded, so there is no enquiry rate to calculate.";
      default:
        return null;
    }
  };

  const entries: { kpiId: string; value: number }[] = [];
  const skipped: SkippedMarketingKpi[] = [];

  for (const [kpiId, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      const name = kpis.find((k) => k.id === kpiId)?.name ?? kpiId;
      skipped.push({
        kpiId,
        reason: "no_data",
        detail: detailFor(kpiId) ?? `${name} could not be derived from this submission.`,
      });
      continue;
    }
    entries.push({ kpiId, value });
  }

  return { enquiries, campaigns, leads, partnerships, website, entries, skipped };
}

/** Which section a KPI comes from, so the review page and the progress strip
 *  can attribute it without a second hard-coded table. */
export function sectionForMarketingKpi(kpiId: string) {
  switch (kpiId) {
    case MARKETING_KPI_IDS.enquiries:
    case MARKETING_KPI_IDS.conversion:
      return "enquiries" as const;
    case MARKETING_KPI_IDS.campaignsDelivered:
      return "campaigns" as const;
    case MARKETING_KPI_IDS.leadsGenerated:
    case MARKETING_KPI_IDS.leadConversionRate:
      return "leads" as const;
    case MARKETING_KPI_IDS.activePartnerships:
      return "partnerships" as const;
    case MARKETING_KPI_IDS.websiteSessions:
    case MARKETING_KPI_IDS.websiteEnquiryRate:
      return "website" as const;
    default:
      return null;
  }
}

/**
 * The status a figure would get, for the live preview.
 *
 * The rule matches the other departments: `dataAvailable` describes the STORED
 * KPI, not this live preview. Every derived Marketing KPI ships
 * `dataAvailable: false` and stays false until a submission lands, so letting
 * that flag win here would show "Not Yet Available" for a figure the manager
 * has just typed, and would suppress the threshold warning on the very preview
 * that exists to warn them.
 */
export function previewMarketingStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) {
    if (kpi && kpi.dataAvailable === false && kpi.notAvailableReason) {
      return { status: "not_available" as const, thresholdNote: kpi.notAvailableReason };
    }
    return { status: "no_data" as const, thresholdNote: "" };
  }
  const status = getStatusForValue(kpi, value);
  if (status === "threshold_unset") {
    return {
      status,
      thresholdNote:
        "Threshold not configured - no approved limit has been set for this KPI, so no Green/Amber/Red verdict can be given. The figure will be recorded and monitored only.",
    };
  }
  return { status, thresholdNote: "" };
}

/** Figures that will raise an Early Warning, so the manager can explain them
 *  before submitting rather than being asked afterwards. */
export function marketingKpisNeedingExplanation(
  computation: MarketingComputation,
  kpis: Kpi[]
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries.flatMap(({ kpiId, value }) => {
    const kpi = kpis.find((k) => k.id === kpiId);
    const status = previewMarketingStatus(kpi, value).status;
    if (status !== "amber" && status !== "red") return [];
    return [{ kpiId, name: kpi?.name ?? kpiId, value, status }];
  });
}