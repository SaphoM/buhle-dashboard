import {
  MARKETING_SECTION_KEYS,
  MARKETING_SECTION_LABELS,
  type EnquiryChannel,
  type EnquiryOutcome,
  type EnquiryStatus,
  type LeadSource,
  type MarketingConfig,
  type MarketingReport,
  type MarketingSectionKey,
  type PartnershipStatus,
  type PartnershipType,
} from "../types/marketing";

/**
 * ============================================================================
 * Marketing submission validation.
 * ============================================================================
 *
 * The governing rule is the same one HR, Finance, Operations and Commercial
 * Farming apply: a Marketing submission either carries what the configured rules
 * require, or it is refused with a precise list naming the section and the field.
 *
 * Marketing's conflicts are almost all BETWEEN registers, because the five
 * registers describe the same month from different angles:
 *
 *  - A conversion rate that would exceed 100%, because converted leads exceed
 *    generated leads, or an enquiry marked Enrolled but never verified.
 *
 *  - Enquiries converted without a recorded outcome, or an outcome recorded
 *    without the date it was recorded, which makes the period the conversion
 *    belongs to unknowable.
 *
 *  - Website enquiries that the enquiry register does not contain. The site
 *    analytics and the enquiry log are two descriptions of the same month; if
 *    they disagree the gap is caught before either figure is trusted.
 *
 *  - Leads converted that do not exist, and campaigns whose spend is recorded
 *    but which produced nothing attributable.
 *
 *  - A partnership marked Active with an end date already in the past, which
 *    reads as a live relationship when the paperwork says otherwise.
 *
 *  - A campaign with an end date before its start date, or an enquiry dated
 *    outside the reporting window, either of which double-counts a period.
 *
 * Required fields are deliberately limited to what a calculation actually
 * consumes. Requiring a campaign reference that nothing reads would train
 * managers to type junk to get past the gate.
 */

export interface MarketingValidationIssue {
  section: MarketingSectionKey;
  field: string;
  message: string;
  kind?: "missing" | "inconsistent";
}

export interface MarketingSectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: MarketingValidationIssue[];
}

export interface MarketingValidationResult {
  valid: boolean;
  issues: MarketingValidationIssue[];
  bySection: Record<MarketingSectionKey, MarketingSectionValidation>;
}

export interface ValidateMarketingOptions {
  config: MarketingConfig;
  today?: Date;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function isNegative(value: number | null | undefined): boolean {
  return typeof value === "number" && value < 0;
}

function missing(section: MarketingSectionKey, field: string): MarketingValidationIssue {
  return { section, field, message: `${field} is required`, kind: "missing" };
}

function inconsistent(section: MarketingSectionKey, field: string, message: string): MarketingValidationIssue {
  return { section, field, message, kind: "inconsistent" };
}

/**
 * The approved vocabulary has drifted from the record. Named rather than
 * silently accepted, because an outcome that exists only in this submission
 * cannot be aggregated against the same category next month - and an unapproved
 * outcome is especially dangerous here, because the conversion rate is derived
 * from which outcomes count as conversions.
 */
function notApproved(section: MarketingSectionKey, field: string, value: string): MarketingValidationIssue {
  return {
    section,
    field,
    message: `"${value}" is not an approved ${field.toLowerCase()} - add it in Administration or correct the record`,
    kind: "inconsistent",
  };
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

function validateEnquiries(report: MarketingReport, options: ValidateMarketingOptions): MarketingValidationIssue[] {
  const issues: MarketingValidationIssue[] = [];
  const { enquiryChannels, enquiryOutcomes, enquiryStatuses, programmes, provinces } = options.config;
  const today = options.today ?? new Date();

  report.enquiries.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.channel)) issues.push(missing("enquiries", `Enquiry ${n} - Channel`));
    else if (enquiryChannels.length > 0 && !enquiryChannels.includes(r.channel as EnquiryChannel)) {
      issues.push(notApproved("enquiries", `Enquiry ${n} - Channel`, r.channel));
    }

    if (isBlank(r.dateReceived)) issues.push(missing("enquiries", `Enquiry ${n} - Date received`));
    else if (new Date(r.dateReceived).getTime() > today.getTime()) {
      issues.push(inconsistent("enquiries", `Enquiry ${n} - Date received`, "Date received is in the future"));
    }

    if (isBlank(r.programmeInterest)) issues.push(missing("enquiries", `Enquiry ${n} - Programme interest`));
    else if (programmes.length > 0 && !programmes.includes(r.programmeInterest)) {
      issues.push(notApproved("enquiries", `Enquiry ${n} - Programme interest`, r.programmeInterest));
    }

    if (!isBlank(r.province) && provinces.length > 0 && !provinces.includes(r.province)) {
      issues.push(notApproved("enquiries", `Enquiry ${n} - Province`, r.province));
    }

    if (isBlank(r.status)) issues.push(missing("enquiries", `Enquiry ${n} - Status`));
    else if (enquiryStatuses.length > 0 && !enquiryStatuses.includes(r.status as EnquiryStatus)) {
      issues.push(notApproved("enquiries", `Enquiry ${n} - Status`, r.status));
    }

    // An outcome drives the conversion rate, so an unapproved one is a much
    // bigger problem here than an unapproved province.
    if (!isBlank(r.outcome) && enquiryOutcomes.length > 0 && !enquiryOutcomes.includes(r.outcome as EnquiryOutcome)) {
      issues.push(notApproved("enquiries", `Enquiry ${n} - Outcome`, r.outcome));
    }

    // An enquiry cannot become an enrolment if nobody ever confirmed how to reach
    // the person, so a conversion on an unverified contact is a contradiction.
    if (r.outcome === "Enrolled" && !r.contactVerified) {
      issues.push(
        inconsistent(
          "enquiries",
          `Enquiry ${n} - Contact verified`,
          "Marked as enrolled, but the contact details were never verified. An unverified contact cannot be counted as a conversion."
        )
      );
    }

    // A recorded outcome with no date cannot be placed in a period.
    if (!isBlank(r.outcome) && isBlank(r.outcomeDate)) {
      issues.push(missing("enquiries", `Enquiry ${n} - Outcome date`));
    }
    if (!isBlank(r.outcomeDate) && new Date(r.outcomeDate).getTime() > today.getTime()) {
      issues.push(inconsistent("enquiries", `Enquiry ${n} - Outcome date`, "Outcome date is in the future"));
    }
    if (
      r.dateReceived &&
      r.outcomeDate &&
      new Date(r.outcomeDate).getTime() < new Date(r.dateReceived).getTime()
    ) {
      issues.push(
        inconsistent("enquiries", `Enquiry ${n} - Outcome date`, "Outcome was recorded before the enquiry arrived")
      );
    }

    // A closed enquiry with no outcome means the case was dropped rather than
    // resolved. Worth catching: it silently shrinks the denominator.
    if (r.status === "Closed" && isBlank(r.outcome)) {
      issues.push(
        inconsistent(
          "enquiries",
          `Enquiry ${n} - Outcome`,
          "The enquiry is marked Closed with no outcome recorded. A closed enquiry needs an outcome, otherwise it vanishes from the conversion rate."
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function validateCampaigns(report: MarketingReport, options: ValidateMarketingOptions): MarketingValidationIssue[] {
  const issues: MarketingValidationIssue[] = [];
  const { campaignChannels, campaignStatuses } = options.config;
  const today = options.today ?? new Date();

  report.campaigns.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.name)) issues.push(missing("campaigns", `Campaign ${n} - Name`));
    if (isBlank(r.channel)) issues.push(missing("campaigns", `Campaign ${n} - Channel`));
    else if (campaignChannels.length > 0 && !campaignChannels.includes(r.channel as never)) {
      issues.push(notApproved("campaigns", `Campaign ${n} - Channel`, r.channel));
    }
    if (isBlank(r.status)) issues.push(missing("campaigns", `Campaign ${n} - Status`));
    else if (campaignStatuses.length > 0 && !campaignStatuses.includes(r.status as never)) {
      issues.push(notApproved("campaigns", `Campaign ${n} - Status`, r.status));
    }

    if (isBlank(r.startDate)) issues.push(missing("campaigns", `Campaign ${n} - Start date`));
    if (isNegative(r.budget)) issues.push(inconsistent("campaigns", `Campaign ${n} - Budget`, "Budget cannot be negative"));
    if (isNegative(r.spend)) issues.push(inconsistent("campaigns", `Campaign ${n} - Spend`, "Spend cannot be negative"));
    if (isNegative(r.reach)) issues.push(inconsistent("campaigns", `Campaign ${n} - Reach`, "Reach cannot be negative"));

    if (r.startDate && r.endDate && new Date(r.endDate).getTime() < new Date(r.startDate).getTime()) {
      issues.push(inconsistent("campaigns", `Campaign ${n} - End date`, "End date is before the start date"));
    }
    if (r.startDate && new Date(r.startDate).getTime() > today.getTime()) {
      issues.push(inconsistent("campaigns", `Campaign ${n} - Start date`, "Start date is in the future"));
    }

    // "Completed" without an end date cannot be counted as delivered: there is
    // no date to say it was delivered by.
    if (r.status === "Completed" && isBlank(r.endDate)) {
      issues.push(missing("campaigns", `Campaign ${n} - End date`));
    }
    // An active campaign has not finished, so recording its spend is a
    // commitment rather than an actual, and the two must not be confused.
    if (r.status === "Active" && isBlank(r.endDate)) {
      issues.push(
        inconsistent(
          "campaigns",
          `Campaign ${n} - Spend`,
          "An active campaign with no end date has spend recorded against it. Confirm whether that is actual spend or committed budget, because it changes the cost per enquiry."
        )
      );
    }
    if (r.budget !== null && r.spend !== null && r.spend > r.budget) {
      issues.push(
        inconsistent(
          "campaigns",
          `Campaign ${n} - Spend`,
          `Spend of ${r.spend.toLocaleString("en-ZA")} exceeds the budget of ${r.budget.toLocaleString("en-ZA")}`
        )
      );
    }
  });

  // Two campaigns with the same name make cost per enquiry unattributable.
  const names = new Map<string, number>();
  for (const r of report.campaigns.records) {
    const key = r.name.trim().toLowerCase();
    if (!key) continue;
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  report.campaigns.records.forEach((r, i) => {
    const key = r.name.trim().toLowerCase();
    if (key && (names.get(key) ?? 0) > 1) {
      issues.push(
        inconsistent(
          "campaigns",
          `Campaign ${i + 1} - Name`,
          `"${r.name}" appears more than once. Campaigns must be uniquely named, because the enquiry register attributes enquiries to a campaign by name.`
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Lead generation
// ---------------------------------------------------------------------------

function validateLeads(report: MarketingReport, options: ValidateMarketingOptions): MarketingValidationIssue[] {
  const issues: MarketingValidationIssue[] = [];
  const { leadSources } = options.config;

  report.leads.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.source)) issues.push(missing("leads", `Lead source ${n} - Source`));
    else if (leadSources.length > 0 && !leadSources.includes(r.source as LeadSource)) {
      issues.push(notApproved("leads", `Lead source ${n} - Source`, r.source));
    }
    if (isBlank(r.period)) issues.push(missing("leads", `Lead source ${n} - Period`));

    if (r.leadsGenerated === null) issues.push(missing("leads", `Lead source ${n} - Leads generated`));
    if (isNegative(r.leadsGenerated)) {
      issues.push(inconsistent("leads", `Lead source ${n} - Leads generated`, "Leads generated cannot be negative"));
    }
    if (isNegative(r.leadsQualified)) {
      issues.push(inconsistent("leads", `Lead source ${n} - Leads qualified`, "Leads qualified cannot be negative"));
    }
    if (isNegative(r.leadsConverted)) {
      issues.push(inconsistent("leads", `Lead source ${n} - Leads converted`, "Leads converted cannot be negative"));
    }
    if (isNegative(r.spend)) issues.push(inconsistent("leads", `Lead source ${n} - Spend`, "Spend cannot be negative"));

    // The funnel has to run downwards. Converting more than were generated, or
    // qualifying more than were captured, is a data-entry error that would
    // otherwise produce a conversion rate above 100%.
    if (
      r.leadsGenerated !== null &&
      r.leadsConverted !== null &&
      r.leadsConverted > r.leadsGenerated
    ) {
      issues.push(
        inconsistent(
          "leads",
          `Lead source ${n} - Leads converted`,
          `${r.leadsConverted} converted from ${r.leadsGenerated} generated, which would be a conversion rate above 100%`
        )
      );
    }
    if (
      r.leadsGenerated !== null &&
      r.leadsQualified !== null &&
      r.leadsQualified > r.leadsGenerated
    ) {
      issues.push(
        inconsistent(
          "leads",
          `Lead source ${n} - Leads qualified`,
          `${r.leadsQualified} qualified from ${r.leadsGenerated} generated, which would be a qualification rate above 100%`
        )
      );
    }
    if (
      r.leadsQualified !== null &&
      r.leadsConverted !== null &&
      r.leadsConverted > r.leadsQualified
    ) {
      issues.push(
        inconsistent(
          "leads",
          `Lead source ${n} - Leads converted`,
          `${r.leadsConverted} converted from only ${r.leadsQualified} qualified. Leads cannot convert without being qualified first.`
        )
      );
    }
  });

  // One row per source per period: two rows for the same source and period would
  // be added together and produce a source total that matches no report.
  const seen = new Map<string, number>();
  report.leads.records.forEach((r, i) => {
    if (!r.source || !r.period) return;
    const key = `${r.source}|${r.period}`.toLowerCase();
    if (seen.has(key)) {
      issues.push(
        inconsistent(
          "leads",
          `Lead source ${i + 1} - Source`,
          `${r.source} already has a row for ${r.period}. Add the new figures to the existing row rather than starting a second one.`
        )
      );
    }
    seen.set(key, i + 1);
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Partnerships
// ---------------------------------------------------------------------------

function validatePartnerships(report: MarketingReport, options: ValidateMarketingOptions): MarketingValidationIssue[] {
  const issues: MarketingValidationIssue[] = [];
  const { partnershipTypes, partnershipStatuses, partnershipContributions } = options.config;
  const today = options.today ?? new Date();

  report.partnerships.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.partner)) issues.push(missing("partnerships", `Partnership ${n} - Partner`));
    if (isBlank(r.type)) issues.push(missing("partnerships", `Partnership ${n} - Type`));
    else if (partnershipTypes.length > 0 && !partnershipTypes.includes(r.type as PartnershipType)) {
      issues.push(notApproved("partnerships", `Partnership ${n} - Type`, r.type));
    }
    if (isBlank(r.status)) issues.push(missing("partnerships", `Partnership ${n} - Status`));
    else if (partnershipStatuses.length > 0 && !partnershipStatuses.includes(r.status as PartnershipStatus)) {
      issues.push(notApproved("partnerships", `Partnership ${n} - Status`, r.status));
    }

    if (isBlank(r.startDate)) issues.push(missing("partnerships", `Partnership ${n} - Start date`));
    if (isNegative(r.value)) {
      issues.push(inconsistent("partnerships", `Partnership ${n} - Value`, "Value cannot be negative"));
    }
    if (!isBlank(r.contribution) && partnershipContributions.length > 0 && !partnershipContributions.includes(r.contribution as never)) {
      issues.push(notApproved("partnerships", `Partnership ${n} - Contribution`, r.contribution));
    }

    if (r.startDate && r.endDate && new Date(r.endDate).getTime() < new Date(r.startDate).getTime()) {
      issues.push(inconsistent("partnerships", `Partnership ${n} - End date`, "End date is before the start date"));
    }

    // A partnership marked Active past its own end date reads as a live
    // relationship when the paperwork says otherwise. This is the single most
    // misleading thing a partnership register can contain.
    if (r.status === "Active" && r.endDate && new Date(r.endDate).getTime() < today.getTime()) {
      issues.push(
        inconsistent(
          "partnerships",
          `Partnership ${n} - Status`,
          `Marked Active, but the agreement ended on ${r.endDate}. Change the status to Lapsed or renew the end date.`
        )
      );
    }

    // A cash contribution with no value recorded leaves the partnership value
    // figure quietly understated.
    if ((r.contribution === "Cash" || r.contribution === "Both") && r.value === null) {
      issues.push(
        inconsistent(
          "partnerships",
          `Partnership ${n} - Value`,
          "A cash contribution is recorded with no value, so the partnership value total understates what came in."
        )
      );
    }

    // A live partnership nobody has a contact for is not a partnership anyone
    // can act on.
    if (r.status === "Active" && isBlank(r.contactPerson)) {
      issues.push(missing("partnerships", `Partnership ${n} - Contact person`));
    }
  });

  const partners = new Map<string, number>();
  for (const r of report.partnerships.records) {
    const key = r.partner.trim().toLowerCase();
    if (!key) continue;
    partners.set(key, (partners.get(key) ?? 0) + 1);
  }
  report.partnerships.records.forEach((r, i) => {
    const key = r.partner.trim().toLowerCase();
    if (key && (partners.get(key) ?? 0) > 1) {
      issues.push(
        inconsistent(
          "partnerships",
          `Partnership ${i + 1} - Partner`,
          `"${r.partner}" appears more than once. One row per partner relationship, otherwise the active count is inflated.`
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Website activity
// ---------------------------------------------------------------------------

function validateWebsite(report: MarketingReport, options: ValidateMarketingOptions): MarketingValidationIssue[] {
  const issues: MarketingValidationIssue[] = [];
  const today = options.today ?? new Date();

  report.website.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.period)) issues.push(missing("website", `Website ${n} - Period`));
    if (isBlank(r.startDate)) issues.push(missing("website", `Website ${n} - Start date`));
    if (isBlank(r.endDate)) issues.push(missing("website", `Website ${n} - End date`));

    for (const [key, label] of [
      ["sessions", "Sessions"],
      ["uniqueVisitors", "Unique visitors"],
      ["enquiriesFromSite", "Enquiries from site"],
      ["conversions", "Conversions"],
    ] as const) {
      if (r[key] === null) issues.push(missing("website", `Website ${n} - ${label}`));
      else if (isNegative(r[key])) {
        issues.push(inconsistent("website", `Website ${n} - ${label}`, `${label} cannot be negative`));
      }
    }

    if (r.startDate && r.endDate && new Date(r.endDate).getTime() < new Date(r.startDate).getTime()) {
      issues.push(inconsistent("website", `Website ${n} - End date`, "End date is before the start date"));
    }
    if (r.endDate && new Date(r.endDate).getTime() > today.getTime()) {
      issues.push(inconsistent("website", `Website ${n} - End date`, "End date is in the future"));
    }

    // More unique visitors than sessions is impossible: every unique visitor
    // generates at least one session.
    if (
      typeof r.sessions === "number" &&
      typeof r.uniqueVisitors === "number" &&
      r.uniqueVisitors > r.sessions
    ) {
      issues.push(
        inconsistent(
          "website",
          `Website ${n} - Unique visitors`,
          `${r.uniqueVisitors} unique visitors from ${r.sessions} sessions. Every unique visitor generates at least one session.`
        )
      );
    }

    // More enquiries than conversions is possible and normal, but more site
    // enquiries than sessions means the enquiry register and the analytics tool
    // disagree, which is worth naming.
    if (
      typeof r.sessions === "number" &&
      typeof r.enquiriesFromSite === "number" &&
      r.sessions > 0 &&
      r.enquiriesFromSite > r.sessions
    ) {
      issues.push(
        inconsistent(
          "website",
          `Website ${n} - Enquiries from site`,
          `${r.enquiriesFromSite} enquiries from ${r.sessions} sessions. More than one enquiry per session is possible, but this is more likely a mismatch between the analytics tool and the enquiry register.`
        )
      );
    }
  });

  const periods = new Map<string, number>();
  for (const r of report.website.records) {
    const key = r.period.trim().toLowerCase();
    if (!key) continue;
    periods.set(key, (periods.get(key) ?? 0) + 1);
  }
  report.website.records.forEach((r, i) => {
    const key = r.period.trim().toLowerCase();
    if (key && (periods.get(key) ?? 0) > 1) {
      issues.push(
        inconsistent("website", `Website ${i + 1} - Period`, `${r.period} appears more than once. One row per analytics period.`)
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-section
// ---------------------------------------------------------------------------

function validateCrossSection(report: MarketingReport): MarketingValidationIssue[] {
  const issues: MarketingValidationIssue[] = [];
  const start = new Date(report.startDate).getTime();
  const due = new Date(report.dueDate).getTime();

  /** A date outside the reporting window belongs to another period. Adding it
   *  here would double-count that month in both. */
  const outOfWindow = (label: string, section: MarketingSectionKey, field: string, date: string) => {
    const t = new Date(date).getTime();
    if (!Number.isFinite(t)) return;
    if (t < start || t > due) {
      issues.push(
        inconsistent(
          section,
          `${label} - ${field}`,
          `${date} falls outside this reporting period (${report.startDate} to ${report.dueDate}). Move it to the period it belongs to, or this period's totals will double-count it.`
        )
      );
    }
  };

  report.enquiries.records.forEach((r, i) => {
    if (r.dateReceived) outOfWindow(`Enquiry ${i + 1}`, "enquiries", "Date received", r.dateReceived);
  });
  report.campaigns.records.forEach((r, i) => {
    if (r.startDate) outOfWindow(`Campaign ${i + 1}`, "campaigns", "Start date", r.startDate);
  });
  report.website.records.forEach((r, i) => {
    if (r.startDate) outOfWindow(`Website ${i + 1}`, "website", "Start date", r.startDate);
  });
  // Partnerships are deliberately NOT window-checked. Enquiries, campaigns,
  // leads and website periods are flows: a date outside this month belongs to
  // another month's figures. A partnership is a standing position, so one that
  // started in January is still correctly reported as active in September, and
  // rejecting it would push a real, long-running agreement out of the register
  // it is supposed to appear in. Only the end date is checked, and only for
  // consistency and for a status that disagrees with it.

  // The website register and the enquiry register describe the same month. If
  // analytics says the site produced more enquiries than the enquiry register
  // holds, one of them is wrong and neither figure can be trusted yet.
  const siteClaimed = report.website.records.reduce((s, r) => s + (r.enquiriesFromSite ?? 0), 0);
  const registerHolds = report.enquiries.records.filter((r) => r.channel === "Website form").length;
  if (siteClaimed > 0 && siteClaimed > registerHolds) {
    issues.push(
      inconsistent(
        "enquiries",
        "Channel",
        `The website register records ${siteClaimed} site-raised enquiries, but the enquiry register holds ${registerHolds} with a channel of Website form. ${siteClaimed - registerHolds} of them are missing.`
      )
    );
  }

  // Marketing's own conversion rate and the lead register's conversion rate must
  // come from the same population. If the enquiry register reports conversions
  // that exceed every lead the lead register knows about, one register has not
  // been filled in.
  const leadsGenerated = report.leads.records.reduce((s, r) => s + (r.leadsGenerated ?? 0), 0);
  const enquiriesHeld = report.enquiries.records.filter((r) => r.outcome !== "Duplicate").length;
  if (leadsGenerated > 0 && enquiriesHeld === 0) {
    issues.push(
      inconsistent(
        "enquiries",
        "Channel",
        `${leadsGenerated} leads were recorded, but the enquiry register is empty. Leads and enquiries are counted separately and both registers are needed to report conversion.`
      )
    );
  }

  // Campaign spend with no enquiry attributed to it is not an error, but it is
  // the thing a marketing review exists to find, so it is surfaced rather than
  // left to a total nobody interrogates.
  const enquiryText = report.enquiries.records.map((r) => `${r.notes} ${r.programmeInterest}`.toLowerCase());
  report.campaigns.records.forEach((r, i) => {
    if (r.spend === null || r.spend <= 0) return;
    const needle = r.name.trim().toLowerCase();
    if (!needle) return;
    const attributed = enquiryText.filter((t) => t.includes(needle)).length;
    if (attributed === 0 && enquiryText.length > 0) {
      issues.push(
        inconsistent(
          "campaigns",
          `Campaign ${i + 1} - Name`,
          `Spend of ${r.spend.toLocaleString("en-ZA")} is recorded against "${r.name}", but no enquiry names it, so no cost per enquiry can be derived. Reference the campaign in the enquiry notes, or record the reason it produced no enquiries.`
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const SECTION_VALIDATORS: Record<
  MarketingSectionKey,
  (report: MarketingReport, options: ValidateMarketingOptions) => MarketingValidationIssue[]
> = {
  enquiries: validateEnquiries,
  campaigns: validateCampaigns,
  leads: validateLeads,
  partnerships: validatePartnerships,
  website: validateWebsite,
};

function isNotApplicable(report: MarketingReport, key: MarketingSectionKey): boolean {
  switch (key) {
    case "enquiries":
      return report.enquiries.notApplicable;
    case "campaigns":
      return report.campaigns.notApplicable;
    case "leads":
      return report.leads.notApplicable;
    case "partnerships":
      return report.partnerships.notApplicable;
    case "website":
      return report.website.notApplicable;
  }
}

export function validateMarketingReport(
  report: MarketingReport,
  options: ValidateMarketingOptions
): MarketingValidationResult {
  const bySection = {} as Record<MarketingSectionKey, MarketingSectionValidation>;

  MARKETING_SECTION_KEYS.forEach((key) => {
    const issues = SECTION_VALIDATORS[key](report, options);
    bySection[key] = {
      state: issues.length > 0 ? "incomplete" : isNotApplicable(report, key) ? "not_applicable" : "complete",
      issues,
    };
  });

  // Cross-section issues are attributed to the section they concern, so the
  // progress strip reflects them too.
  for (const issue of validateCrossSection(report)) {
    bySection[issue.section].issues.push(issue);
    if (bySection[issue.section].state === "complete") bySection[issue.section].state = "incomplete";
  }

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  return { valid: issues.length === 0, issues, bySection };
}

/** Issues grouped by section, for the refusal panel. */
export function summariseMarketingIssues(
  issues: MarketingValidationIssue[]
): { section: MarketingSectionKey; label: string; lines: string[] }[] {
  const grouped = new Map<MarketingSectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({
    section,
    label: MARKETING_SECTION_LABELS[section],
    lines,
  }));
}