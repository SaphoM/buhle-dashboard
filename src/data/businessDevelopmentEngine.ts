import { getStatusForValue } from "./kpiEngine";
import { BD_KPI_IDS, type BdConfig, type BdReport, type BdSectionKey } from "../types/businessDevelopment";
import type { Kpi } from "../types";

/**
 * ============================================================================
 * Business Development engine - derives every BD KPI from the six registers.
 * ============================================================================
 *
 * The governing rule every other register department applies, and the one the
 * BD dashboard was previously missing: nothing typed survives as a KPI, and a
 * figure the registers cannot support is left uncalculated with the reason
 * attached rather than reported as zero.
 *
 * The conversions deserve naming, because they are where a BD dashboard
 * usually goes wrong:
 *
 *  - WIN RATE vs CONVERSION RATE. "Proposal Win Rate" divides by proposals
 *    that have been DECIDED - a proposal awaiting the client's answer is not a
 *    loss. "Proposal Conversion Rate" divides by ALL proposals sent, which is
 *    the stricter number and the one that falls while work is in flight. Both
 *    are shown so neither can be quoted as "the" rate.
 *
 *  - STALLING IS MEASURED IN ACTIVITY, NOT AGE. An opportunity opened last
 *    month with no activity since is stalled; one opened last year that was
 *    touched yesterday is not. The configured threshold (default 30 days) is
 *    read from configuration rather than hard-coded.
 *
 *  - DAYS TO CLOSE COMES ONLY FROM WON OPPORTUNITIES. Averaging in deals still
 *    open would report a partial number as a completed one.
 */

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
const round1 = (v: number) => Math.round(v * 10) / 10;
const dayMs = 86_400_000;

// ---------------------------------------------------------------------------
// Section summaries - the read-only figures shown under each register
// ---------------------------------------------------------------------------

export interface BDLeadSummary {
  count: number;
  converted: number;
  convertedPct: number | null;
  bySource: { source: string; count: number }[];
  estimatedValue: number | null;
}

export interface BDOpportunitySummary {
  total: number;
  active: number;
  won: number;
  lost: number;
  pipelineValue: number;
  weightedPipelineValue: number;
  stalled: number;
  stalledThresholdDays: number;
  avgDaysToClose: number | null;
  byStage: { stage: string; count: number; value: number }[];
}

export interface BDProposalSummary {
  total: number;
  decided: number;
  won: number;
  lost: number;
  undecided: number;
  submittedValue: number | null;
  winRatePct: number | null;
  conversionRatePct: number | null;
}

export interface BDNewBusinessSummary {
  total: number;
  totalValue: number;
}

export interface BDClientSummary {
  total: number;
}

export interface BDPartnershipSummary {
  total: number;
  active: number;
  potentialValue: number | null;
}

export interface BdSummaries {
  leads: BDLeadSummary | null;
  opportunities: BDOpportunitySummary | null;
  proposals: BDProposalSummary | null;
  newBusiness: BDNewBusinessSummary | null;
  clients: BDClientSummary | null;
  partnerships: BDPartnershipSummary | null;
}

const sumOf = (values: (number | null | undefined)[]): number | null => {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length > 0 ? present.reduce((s, v) => s + v, 0) : null;
};

export function summariseLeads(report: BdReport): BDLeadSummary | null {
  const rows = report.leads.leads;
  if (rows.length === 0) return null;
  const converted = rows.filter((r) => r.status === "Converted").length;
  const bySource = new Map<string, number>();
  rows.forEach((r) => bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1));
  return {
    count: rows.length,
    converted,
    convertedPct: pct(converted, rows.length),
    bySource: [...bySource.entries()].map(([source, count]) => ({ source, count })),
    estimatedValue: sumOf(rows.map((r) => r.estimatedValue)),
  };
}

export function summariseOpportunities(
  report: BdReport,
  config: BdConfig,
  today: Date = new Date()
): BDOpportunitySummary | null {
  const rows = report.opportunities.opportunities;
  if (rows.length === 0) return null;

  const active = rows.filter((r) => r.stage !== "Won" && r.stage !== "Lost");
  const won = rows.filter((r) => r.stage === "Won");
  const lost = rows.filter((r) => r.stage === "Lost");
  const thresholdMs = config.stalledThresholdDays * dayMs;

  const stalled = active.filter((o) => {
    const last = o.lastActivityDate ? new Date(o.lastActivityDate).getTime() : new Date(o.dateCreated).getTime();
    return today.getTime() - last > thresholdMs;
  }).length;

  const closable = won.filter((o) => o.wonDate && o.dateCreated);
  const avgDaysToClose =
    closable.length > 0
      ? closable.reduce((sum, o) => sum + (new Date(o.wonDate!).getTime() - new Date(o.dateCreated).getTime()) / dayMs, 0) /
        closable.length
      : null;

  const byStage = new Map<string, { count: number; value: number }>();
  rows.forEach((r) => {
    const entry = byStage.get(r.stage) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += r.estimatedValue ?? 0;
    byStage.set(r.stage, entry);
  });

  return {
    total: rows.length,
    active: active.length,
    won: won.length,
    lost: lost.length,
    pipelineValue: active.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0),
    weightedPipelineValue: active.reduce((sum, o) => sum + (o.estimatedValue ?? 0) * ((o.probability ?? 0) / 100), 0),
    stalled,
    stalledThresholdDays: config.stalledThresholdDays,
    avgDaysToClose: avgDaysToClose === null ? null : round1(avgDaysToClose),
    byStage: [...byStage.entries()].map(([stage, v]) => ({ stage, ...v })),
  };
}

export function summariseProposals(report: BdReport): BDProposalSummary | null {
  const rows = report.proposals.proposals;
  if (rows.length === 0) return null;
  const decided = rows.filter((p) => p.status === "Won" || p.status === "Lost");
  const won = rows.filter((p) => p.status === "Won");
  return {
    total: rows.length,
    decided: decided.length,
    won: won.length,
    lost: rows.filter((p) => p.status === "Lost").length,
    undecided: rows.length - decided.length,
    submittedValue: sumOf(rows.map((p) => p.proposalValue)),
    winRatePct: pct(won.length, decided.length),
    conversionRatePct: pct(won.length, rows.length),
  };
}

export function summariseNewBusiness(report: BdReport): BDNewBusinessSummary | null {
  const rows = report.newBusiness.newBusiness;
  if (rows.length === 0) return null;
  return { total: rows.length, totalValue: rows.reduce((sum, r) => sum + (r.wonValue ?? 0), 0) };
}

export function summariseClients(report: BdReport): BDClientSummary | null {
  return report.clients.clients.length === 0 ? null : { total: report.clients.clients.length };
}

export function summarisePartnerships(report: BdReport): BDPartnershipSummary | null {
  const rows = report.partnerships.partnerships;
  if (rows.length === 0) return null;
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "Active").length,
    potentialValue: sumOf(rows.map((r) => r.potentialValue)),
  };
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

export interface SkippedBdKpi {
  kpiId: string;
  reason: "no_data";
  detail: string;
}

export interface BdComputation {
  summaries: BdSummaries;
  entries: { kpiId: string; value: number }[];
  skipped: SkippedBdKpi[];
}

/** Which section each KPI is derived from. Used by the submission modal to
 *  tell the manager which register a figure on the review page came from. */
export const BD_SECTION_KPIS: Record<BdSectionKey, string[]> = {
  leads: [BD_KPI_IDS.newLeads, BD_KPI_IDS.leadToOpportunityConversion],
  opportunities: [
    BD_KPI_IDS.activeOpportunities,
    BD_KPI_IDS.pipelineValue,
    BD_KPI_IDS.weightedPipelineValue,
    BD_KPI_IDS.opportunitiesStalled,
    BD_KPI_IDS.avgDaysToClose,
    BD_KPI_IDS.opportunityConversionRate,
  ],
  proposals: [BD_KPI_IDS.proposalsSubmitted, BD_KPI_IDS.proposalWinRate, BD_KPI_IDS.proposalConversionRate],
  newBusiness: [BD_KPI_IDS.newBusinessWon, BD_KPI_IDS.newBusinessWonCount],
  clients: [BD_KPI_IDS.newClients],
  partnerships: [],
  commentary: [],
};

export function computeBdKpis(
  report: BdReport,
  kpis: { id: string; name: string }[],
  config: BdConfig,
  today: Date = new Date()
): BdComputation {
  const summaries: BdSummaries = {
    leads: report.leads.notApplicable ? null : summariseLeads(report),
    opportunities: report.opportunities.notApplicable ? null : summariseOpportunities(report, config, today),
    proposals: report.proposals.notApplicable ? null : summariseProposals(report),
    newBusiness: report.newBusiness.notApplicable ? null : summariseNewBusiness(report),
    clients: report.clients.notApplicable ? null : summariseClients(report),
    partnerships: report.partnerships.notApplicable ? null : summarisePartnerships(report),
  };

  const { leads, opportunities, proposals, newBusiness, clients } = summaries;

  const values: Record<string, number | null> = {
    [BD_KPI_IDS.newLeads]: leads?.count ?? null,
    [BD_KPI_IDS.leadToOpportunityConversion]: leads?.convertedPct ?? null,
    [BD_KPI_IDS.activeOpportunities]: opportunities?.active ?? null,
    [BD_KPI_IDS.pipelineValue]: opportunities?.pipelineValue ?? null,
    [BD_KPI_IDS.weightedPipelineValue]: opportunities?.weightedPipelineValue ?? null,
    [BD_KPI_IDS.opportunitiesStalled]: opportunities?.stalled ?? null,
    [BD_KPI_IDS.avgDaysToClose]: opportunities?.avgDaysToClose ?? null,
    [BD_KPI_IDS.opportunityConversionRate]: opportunities ? pct(opportunities.won, opportunities.total) : null,
    [BD_KPI_IDS.proposalsSubmitted]: proposals?.total ?? null,
    [BD_KPI_IDS.proposalWinRate]: proposals?.winRatePct ?? null,
    [BD_KPI_IDS.proposalConversionRate]: proposals?.conversionRatePct ?? null,
    [BD_KPI_IDS.newBusinessWon]: newBusiness?.totalValue ?? null,
    [BD_KPI_IDS.newBusinessWonCount]: newBusiness?.total ?? null,
    [BD_KPI_IDS.newClients]: clients?.total ?? null,
  };

  const detailFor = (kpiId: string): string => {
    switch (kpiId) {
      case BD_KPI_IDS.newLeads:
      case BD_KPI_IDS.leadToOpportunityConversion:
        return report.leads.notApplicable
          ? "Lead reporting was marked Not Applicable for this period."
          : report.leads.leads.length === 0
            ? "No leads were recorded in the lead register."
            : "No lead carries a Converted status, so the conversion rate cannot be calculated.";
      case BD_KPI_IDS.avgDaysToClose:
        return opportunities && opportunities.won === 0
          ? "No opportunity was won in this period, so there is nothing to time a close from."
          : "No opportunities were recorded in the opportunity register.";
      case BD_KPI_IDS.proposalWinRate:
        return proposals && proposals.decided === 0
          ? "No proposal has been decided yet, so a win rate would divide by zero."
          : "No proposals were recorded in the proposal register.";
      case BD_KPI_IDS.proposalConversionRate:
        return "No proposals were recorded in the proposal register.";
      default: {
        const name = kpis.find((k) => k.id === kpiId)?.name ?? kpiId;
        return `${name} cannot be derived from this submission.`;
      }
    }
  };

  const entries: { kpiId: string; value: number }[] = [];
  const skipped: SkippedBdKpi[] = [];
  for (const [kpiId, value] of Object.entries(values)) {
    if (value === null || Number.isNaN(value)) skipped.push({ kpiId, reason: "no_data", detail: detailFor(kpiId) });
    else entries.push({ kpiId, value: round1(value) });
  }

  return { summaries, entries, skipped };
}

/** The status a figure would get, for the live preview. Same rule as the other
 *  register departments: an unset threshold yields "threshold_unset", never a
 *  fabricated Green. */
export function previewBdStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) return { status: "no_data" as const, thresholdNote: "" };
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

/** Figures that will raise an Early Warning on submission. */
export function bdKpisNeedingExplanation(
  computation: BdComputation,
  kpis: Kpi[]
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries.flatMap(({ kpiId, value }) => {
    const kpi = kpis.find((k) => k.id === kpiId);
    const status = previewBdStatus(kpi, value).status;
    if (status !== "amber" && status !== "red") return [];
    return [{ kpiId, name: kpi?.name ?? kpiId, value, status }];
  });
}
