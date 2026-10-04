import { getStatusForValue } from "./kpiEngine";
import type { Kpi } from "../types";
import type {
  FarmingConfig,
  FarmingReport,
  FarmingSectionKey,
  LivestockRecord,
  MortalityRecord,
  ProductionRecord,
} from "../types/farming";
import { FARMING_SECTION_KEYS } from "../types/farming";
import { FARMING_KPI_IDS } from "./farmingSeed";

/**
 * The Commercial Farming engine: the only place a farming figure is allowed to
 * be produced.
 *
 * Seven registers in, nine derived KPIs out. Nothing here reads a typed
 * percentage, because the registers are the authority and a typed rate can
 * disagree with them.
 *
 * The recurring hazard in this module is MIXED UNITS. Crops are harvested in kg,
 * tonnes, crates and bunches; water is metered in m3, litres and ML. Adding
 * "1 tonne" to "200 kg" to get a total is arithmetically valid and completely
 * meaningless, so:
 *
 *  - a total is only produced when every contributing record shares one unit;
 *  - when units are mixed, the total is reported as null and the mixed units are
 *    named, because a summed figure across units is a number nobody can act on.
 */

// ---------------------------------------------------------------------------
// Section 1 - Production
// ---------------------------------------------------------------------------

export interface ProductionSummary {
  /** Records that have actually been harvested. Standing crops are excluded. */
  harvested: number;
  /** Crops planted but not yet harvested. Not a failure. */
  standing: number;
  totalQuantity: number | null;
  /** The single unit every harvested record shares, or null when units differ. */
  totalUnit: string | null;
  /** Units actually present, so the modal can name them when they are mixed. */
  unitsPresent: string[];
  totalAreaHa: number | null;
  lossQuantity: number | null;
  lossUnit: string | null;
  byCrop: { crop: string; quantity: number; unit: string | null; plots: number }[];
  /** Harvests whose quantity is recorded with no unit. Never counted in a total. */
  unmeasured: number;
}

export function summariseProduction(report: FarmingReport): ProductionSummary | null {
  const records = report.production.records;
  if (records.length === 0) return null;

  const harvested: ProductionRecord[] = [];
  let standing = 0;
  let unmeasured = 0;
  let areaTotal = 0;
  let areaCount = 0;

  for (const r of records) {
    if (r.harvestDate) harvested.push(r);
    else standing += 1;
    if (r.areaHa !== null) {
      areaTotal += r.areaHa;
      areaCount += 1;
    }
    // A quantity with no unit is not a measurement, so it cannot join a total.
    if (r.harvestDate && (r.yieldQuantity === null || !r.yieldUnit)) unmeasured += 1;
  }

  const unitsPresent = [...new Set(harvested.map((r) => r.yieldUnit).filter(Boolean))];
  const measurable = harvested.filter((r) => r.yieldQuantity !== null && r.yieldUnit);
  const singleUnit = unitsPresent.length === 1 ? unitsPresent[0] : null;

  // Only summed when every harvested record shares one unit. Otherwise null.
  const totalQuantity =
    measurable.length > 0 && singleUnit !== null
      ? measurable.reduce((sum, r) => sum + (r.yieldQuantity ?? 0), 0)
      : null;

  const losses = records.filter((r) => r.lossQuantity !== null && r.lossQuantity > 0);
  const lossUnits = [...new Set(losses.map((r) => r.yieldUnit).filter(Boolean))];

  const byCrop = [...new Set(records.map((r) => r.crop).filter(Boolean))].map((crop) => {
    const forCrop = records.filter((r) => r.crop === crop);
    const units = [...new Set(forCrop.map((r) => r.yieldUnit).filter(Boolean))];
    return {
      crop,
      quantity: forCrop.reduce((sum, r) => sum + (r.yieldQuantity ?? 0), 0),
      unit: units.length === 1 ? units[0] : null,
      plots: new Set(forCrop.map((r) => r.plot).filter(Boolean)).size,
    };
  });

  return {
    harvested: harvested.length,
    standing,
    totalQuantity,
    totalUnit: singleUnit,
    unitsPresent,
    totalAreaHa: areaCount > 0 ? areaTotal : null,
    lossQuantity: losses.length > 0 && lossUnits.length === 1 ? losses.reduce((s, r) => s + (r.lossQuantity ?? 0), 0) : null,
    lossUnit: lossUnits.length === 1 ? lossUnits[0] : null,
    byCrop,
    unmeasured,
  };
}

// ---------------------------------------------------------------------------
// Section 2 - Livestock
// ---------------------------------------------------------------------------

export interface LivestockSummary {
  /** Head on hand at the most recent count date per group. */
  totalHead: number | null;
  byCategory: { category: string; head: number; groups: number; breedingFemales: number | null }[];
  additions: number;
  removedForSale: number;
  /** The date the "on hand" figure is valid as at. A stock figure without a date
   *  cannot be used as a mortality denominator. */
  asAtDate: string | null;
}

export function summariseLivestock(report: FarmingReport): LivestockSummary | null {
  const records = report.livestock.records;
  if (records.length === 0) return null;

  // Only the latest count per group is "on hand". Summing every count would add
  // the same chickens twice, because a monthly register has a row per month.
  const latestByGroup = new Map<string, LivestockRecord>();
  for (const r of records) {
    const key = `${r.category}|${r.breed}|${r.location}`;
    const held = latestByGroup.get(key);
    if (!held) {
      latestByGroup.set(key, r);
      continue;
    }
    if (countValue(r) > countValue(held)) latestByGroup.set(key, r);
  }

  const current = [...latestByGroup.values()];
  const counted = current.filter((r) => r.headCount !== null);
  const totalHead = counted.length > 0 ? counted.reduce((s, r) => s + (r.headCount ?? 0), 0) : null;

  const byCategory = [...new Set(current.map((r) => r.category).filter(Boolean))].map((category) => {
    const forCat = current.filter((r) => r.category === category);
    const heads = forCat.filter((r) => r.headCount !== null);
    const breeding = forCat.filter((r) => r.breedingFemales !== null);
    return {
      category,
      head: heads.length > 0 ? heads.reduce((s, r) => s + (r.headCount ?? 0), 0) : 0,
      groups: forCat.length,
      breedingFemales: breeding.length > 0 ? breeding.reduce((s, r) => s + (r.breedingFemales ?? 0), 0) : null,
    };
  });

  const dates = counted.map((r) => r.countDate).filter(Boolean);
  const asAtDate = dates.length > 0 ? dates.sort().at(-1) ?? null : null;

  return {
    totalHead,
    byCategory,
    // Additions and removals are period movements, so they sum across EVERY row,
    // unlike the standing stock above.
    additions: records.reduce((s, r) => s + (r.additions ?? 0), 0),
    removedForSale: records.reduce((s, r) => s + (r.soldOrRemoved ?? 0), 0),
    asAtDate,
  };
}

/** A count date sorts as a date; a blank one sorts last so it never wins the
 *  "latest count" comparison. */
function countValue(r: LivestockRecord): number {
  if (!r.countDate) return -1;
  return new Date(r.countDate).getTime();
}

// ---------------------------------------------------------------------------
// Section 3 - Mortality
// ---------------------------------------------------------------------------

export interface MortalitySummary {
  /** Deaths included in the reported rate, honouring the suspected-death policy. */
  counted: number;
  /** Deaths recorded but excluded from the rate (suspected or disputed). */
  excluded: number;
  totalRecorded: number;
  /** The rate, or null when there is no stock denominator. */
  ratePct: number | null;
  byCategory: { category: string; deaths: number; ratePct: number | null }[];
  byCause: { cause: string; deaths: number }[];
  /** Deaths with no post-mortem, which is the biosecurity gap. */
  withoutPostMortem: number;
  /** Cause recorded as Unknown, i.e. the farm does not know why. */
  unknownCause: number;
}

/**
 * Mortality rate = deaths counted / stock on hand.
 *
 * The denominator matters and is the reason the livestock register exists as its
 * own section. With no stock figure there is no rate at all: the engine returns
 * null rather than dividing by an assumed herd size, because "12 deaths" and
 * "12 deaths out of 40 chickens" are different claims and only one of them is a
 * rate.
 */
export function summariseMortality(report: FarmingReport, config: FarmingConfig): MortalitySummary | null {
  const records = report.mortality.records;
  if (records.length === 0) return null;

  const stock = summariseLivestock(report)?.totalHead ?? null;

  const counted = records.filter((r) => includeInRate(r, config));
  const excluded = records.filter((r) => !includeInRate(r, config));
  const countedHead = sumHead(counted);

  const ratePct = stock !== null && stock > 0 ? (countedHead / stock) * 100 : null;

  // A per-group rate needs that group's own head count, not the whole farm's.
  const stockByCategory = new Map<string, number>();
  for (const row of summariseLivestock(report)?.byCategory ?? []) {
    stockByCategory.set(row.category, row.head);
  }

  const byCategory = [...new Set(records.map((r) => r.category).filter(Boolean))].map((category) => {
    const forCat = counted.filter((r) => r.category === category);
    const heads = sumHead(forCat);
    const catStock = stockByCategory.get(category) ?? null;
    return {
      category,
      deaths: heads,
      ratePct: catStock !== null && catStock > 0 ? (heads / catStock) * 100 : null,
    };
  });

  const byCause = [...new Set(counted.map((r) => r.cause).filter(Boolean))].map((cause) => ({
    cause,
    deaths: sumHead(counted.filter((r) => r.cause === cause)),
  }));

  return {
    counted: countedHead,
    excluded: sumHead(excluded),
    totalRecorded: sumHead(records),
    ratePct,
    byCategory,
    byCause,
    withoutPostMortem: counted.filter((r) => !r.postMortemDone).length,
    unknownCause: counted.filter((r) => r.cause === "Unknown").length,
  };
}

/**
 * Whether a death counts toward the reported rate.
 *
 * The record's own `countedInRate` flag is the farm manager's explicit judgement
 * about that specific death, and it is not overridden by configuration. The
 * config decides the DEFAULT for a newly created blank record, so a manager
 * marking a death as suspected does not need to also change a setting.
 */
function includeInRate(r: MortalityRecord, _config: FarmingConfig): boolean {
  return r.countedInRate;
}

function sumHead(records: MortalityRecord[]): number {
  return records.reduce((s, r) => s + (r.headCount ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Section 4 - Disease
// ---------------------------------------------------------------------------

export interface DiseaseSummary {
  cases: number;
  animalsAffected: number;
  confirmedCases: number;
  unconfirmedCases: number;
  /** Animals recorded ill as a percentage of stock on hand. */
  incidencePct: number | null;
  ongoing: number;
  /** Confirmed cases not reported to the state vet, where notifiable. A
   *  compliance gap rather than a performance figure. */
  notReportedToStateVet: number;
  byDisease: { disease: string; animals: number; confirmed: boolean }[];
}

export function summariseDisease(report: FarmingReport): DiseaseSummary | null {
  const records = report.disease.records;
  if (records.length === 0) return null;

  const stock = summariseLivestock(report)?.totalHead ?? null;
  const animalsAffected = records.reduce((s, r) => s + (r.headCount ?? 0), 0);
  const confirmed = records.filter((r) => r.diagnosisConfirmed);

  return {
    cases: records.length,
    animalsAffected,
    confirmedCases: confirmed.length,
    unconfirmedCases: records.length - confirmed.length,
    incidencePct: stock !== null && stock > 0 ? (animalsAffected / stock) * 100 : null,
    ongoing: records.filter((r) => r.outcome === "Ongoing").length,
    notReportedToStateVet: confirmed.filter((r) => !r.reportedToStateVet).length,
    byDisease: [...new Set(records.map((r) => r.disease).filter(Boolean))].map((disease) => {
      const forDisease = records.filter((r) => r.disease === disease);
      return {
        disease,
        animals: forDisease.reduce((s, r) => s + (r.headCount ?? 0), 0),
        confirmed: forDisease.some((r) => r.diagnosisConfirmed),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Section 5 - Water
// ---------------------------------------------------------------------------

export interface WaterSummary {
  records: number;
  totalVolume: number | null;
  totalUnit: string | null;
  unitsPresent: string[];
  bySource: { source: string; volume: number | null; unit: string | null }[];
  /** Licences with an expiry date that has already passed. */
  expiredLicences: number;
  /** Licensed abstractions carrying no licence reference at all. */
  unlicensed: number;
}

export function summariseWater(report: FarmingReport, today: Date = new Date()): WaterSummary | null {
  const records = report.water.records;
  if (records.length === 0) return null;

  const unitsPresent = [...new Set(records.map((r) => r.volumeUnit).filter(Boolean))];
  const singleUnit = unitsPresent.length === 1 ? unitsPresent[0] : null;
  const measured = records.filter((r) => r.volumeUsed !== null && r.volumeUnit);

  const bySource = [...new Set(records.map((r) => r.source).filter(Boolean))].map((source) => {
    const forSource = records.filter((r) => r.source === source);
    const units = [...new Set(forSource.map((r) => r.volumeUnit).filter(Boolean))];
    const measuredForSource = forSource.filter((r) => r.volumeUsed !== null && r.volumeUnit);
    return {
      source,
      volume: measuredForSource.length > 0 && units.length === 1 ? measuredForSource.reduce((s, r) => s + (r.volumeUsed ?? 0), 0) : null,
      unit: units.length === 1 ? units[0] : null,
    };
  });

  const now = today.getTime();
  const expired = records.filter((r) => r.licenceExpiry && new Date(r.licenceExpiry).getTime() < now).length;

  return {
    records: records.length,
    // Same rule as production: never sum across mixed units.
    totalVolume: measured.length > 0 && singleUnit !== null ? measured.reduce((s, r) => s + (r.volumeUsed ?? 0), 0) : null,
    totalUnit: singleUnit,
    unitsPresent,
    bySource,
    expiredLicences: expired,
    unlicensed: records.filter((r) => !r.licenceReference).length,
  };
}

// ---------------------------------------------------------------------------
// Section 6 - Sales
// ---------------------------------------------------------------------------

export interface SalesSummary {
  lines: number;
  /** Revenue derived from quantity x unit price on every complete line. */
  revenue: number | null;
  /** Quantity total, only when every line shares one unit. */
  volume: number | null;
  volumeUnit: string | null;
  unitsPresent: string[];
  outstandingValue: number | null;
  byProduct: { product: string; revenue: number; quantity: number | null; unit: string | null }[];
  byChannel: { channel: string; revenue: number }[];
  /** Lines with a quantity but no unit price, so revenue cannot be complete. */
  unpriced: number;
}

/**
 * Sales revenue is derived, never typed.
 *
 * A line counts toward revenue only when BOTH quantity and unit price are
 * recorded. A sale with a quantity and no price is a real sale whose value is
 * simply unknown, so it is reported as a line and excluded from the total rather
 * than valued at zero, which would understate revenue.
 */
export function summariseSales(report: FarmingReport): SalesSummary | null {
  const records = report.sales.records;
  if (records.length === 0) return null;

  const priced = records.filter((r) => r.quantity !== null && r.unitPrice !== null);
  const unpriced = records.filter((r) => r.quantity !== null && r.unitPrice === null);

  const unitsPresent = [...new Set(records.map((r) => r.unit).filter(Boolean))];
  const singleUnit = unitsPresent.length === 1 ? unitsPresent[0] : null;
  const measured = records.filter((r) => r.quantity !== null && r.unit);

  const byProduct = [...new Set(records.map((r) => r.product).filter(Boolean))].map((product) => {
    const forProduct = records.filter((r) => r.product === product);
    const units = [...new Set(forProduct.map((r) => r.unit).filter(Boolean))];
    const measuredForProduct = forProduct.filter((r) => r.quantity !== null && r.unit);
    return {
      product,
      revenue: forProduct
        .filter((r) => r.quantity !== null && r.unitPrice !== null)
        .reduce((s, r) => s + (r.quantity ?? 0) * (r.unitPrice ?? 0), 0),
      quantity: measuredForProduct.length > 0 && units.length === 1 ? measuredForProduct.reduce((s, r) => s + (r.quantity ?? 0), 0) : null,
      unit: units.length === 1 ? units[0] : null,
    };
  });

  return {
    lines: records.length,
    // Null when any line has no price, because a partial total is not a revenue
    // figure. The modal then shows the total alongside what is missing.
    revenue: priced.length === records.length ? priced.reduce((s, r) => s + (r.quantity ?? 0) * (r.unitPrice ?? 0), 0) : null,
    volume: measured.length > 0 && singleUnit !== null ? measured.reduce((s, r) => s + (r.quantity ?? 0), 0) : null,
    volumeUnit: singleUnit,
    unitsPresent,
    outstandingValue: priced.some((r) => r.paymentStatus !== "Paid")
      ? priced.filter((r) => r.paymentStatus !== "Paid").reduce((s, r) => s + (r.quantity ?? 0) * (r.unitPrice ?? 0), 0)
      : null,
    byProduct,
    byChannel: [...new Set(records.map((r) => r.channel).filter(Boolean))].map((channel) => ({
      channel,
      revenue: records
        .filter((r) => r.channel === channel && r.quantity !== null && r.unitPrice !== null)
        .reduce((s, r) => s + (r.quantity ?? 0) * (r.unitPrice ?? 0), 0),
    })),
    unpriced: unpriced.length,
  };
}

// ---------------------------------------------------------------------------
// Section 7 - Costs
// ---------------------------------------------------------------------------

export interface CostSummary {
  lines: number;
  total: number | null;
  /** Lines with no amount, so the total cannot be trusted as complete. */
  missingAmount: number;
  unpaidValue: number;
  byCategory: { category: string; amount: number; share: number | null }[];
  feedAmount: number | null;
}

export function summariseCosts(report: FarmingReport): CostSummary | null {
  const records = report.costs.records;
  if (records.length === 0) return null;

  const valued = records.filter((r) => r.amount !== null);
  const missingAmount = records.filter((r) => r.amount === null).length;
  const total = valued.length > 0 ? valued.reduce((s, r) => s + (r.amount ?? 0), 0) : null;

  const byCategory = [...new Set(records.map((r) => r.category).filter(Boolean))].map((category) => {
    const amount = records.filter((r) => r.category === category && r.amount !== null).reduce((s, r) => s + (r.amount ?? 0), 0);
    return {
      category,
      amount,
      // A share of an incomplete total would be a share of an unknown.
      share: total !== null && total > 0 ? (amount / total) * 100 : null,
    };
  });

  return {
    lines: records.length,
    // Null while any line is unvalued: a total that silently omits lines
    // understates the season and flatters the margin beside it.
    total: missingAmount === 0 ? total : null,
    missingAmount,
    unpaidValue: valued.filter((r) => !r.paid).reduce((s, r) => s + (r.amount ?? 0), 0),
    byCategory,
    feedAmount: records.some((r) => r.category === "Feed") && missingAmount === 0
      ? records.filter((r) => r.category === "Feed").reduce((s, r) => s + (r.amount ?? 0), 0)
      : null,
  };
}

// ---------------------------------------------------------------------------
// The one place the submission meets the shared KPI/EWS pipeline
// ---------------------------------------------------------------------------

/** A KPI this submission could not derive, with the reason. The modal lists
 *  these so an executive can see what was NOT reported, instead of the figure
 *  being quietly absent. */
export interface SkippedFarmingKpi {
  kpiId: string;
  reason: "no_data" | "not_available" | "threshold_unset";
  detail: string;
}

export interface FarmingComputation {
  production: ProductionSummary | null;
  livestock: LivestockSummary | null;
  mortality: MortalitySummary | null;
  disease: DiseaseSummary | null;
  water: WaterSummary | null;
  sales: SalesSummary | null;
  costs: CostSummary | null;
  entries: { kpiId: string; value: number }[];
  skipped: SkippedFarmingKpi[];
}

export function computeFarmingKpis(
  report: FarmingReport,
  kpis: { id: string; name: string }[],
  config: FarmingConfig
): FarmingComputation {
  const production = summariseProduction(report);
  const livestock = summariseLivestock(report);
  const mortality = summariseMortality(report, config);
  const disease = summariseDisease(report);
  const water = summariseWater(report);
  const sales = summariseSales(report);
  const costs = summariseCosts(report);

  const values: Record<string, number | null> = {
    [FARMING_KPI_IDS.farmRevenue]: sales?.revenue ?? null,
    [FARMING_KPI_IDS.mortality]: mortality?.ratePct ?? null,
    [FARMING_KPI_IDS.production]: production?.totalQuantity ?? null,
    [FARMING_KPI_IDS.livestock]: livestock?.totalHead ?? null,
    [FARMING_KPI_IDS.diseaseIncidence]: disease?.incidencePct ?? null,
    [FARMING_KPI_IDS.waterUse]: water?.totalVolume ?? null,
    [FARMING_KPI_IDS.salesVolume]: sales?.volume ?? null,
    [FARMING_KPI_IDS.totalCosts]: costs?.total ?? null,
    [FARMING_KPI_IDS.feedCostRatio]:
      costs?.feedAmount !== null && costs?.feedAmount !== undefined && costs.total !== null && costs.total > 0
        ? (costs.feedAmount / costs.total) * 100
        : null,
  };

  const entries: { kpiId: string; value: number }[] = [];
  const skipped: SkippedFarmingKpi[] = [];

  for (const [kpiId, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      skipped.push({
        kpiId,
        reason: "no_data",
        // skippedDetail names the specific obstacle, and falls back to the KPI's
        // own name for any id this module does not handle.
        detail:
          skippedDetail(kpiId, { production, livestock, mortality, disease, water, sales, costs }) ||
          `${kpis.find((k) => k.id === kpiId)?.name ?? kpiId} could not be derived from this submission.`,
      });
      continue;
    }
    entries.push({ kpiId, value });
  }

  return { production, livestock, mortality, disease, water, sales, costs, entries, skipped };
}

/**
 * WHY a KPI could not be derived.
 *
 * "No data" on its own is not a useful thing to tell a farm manager, so the
 * reason names the specific obstacle: an empty register, a missing denominator,
 * mixed units, or an unpriced line.
 */
function skippedDetail(
  kpiId: string,
  s: {
    production: ProductionSummary | null;
    livestock: LivestockSummary | null;
    mortality: MortalitySummary | null;
    disease: DiseaseSummary | null;
    water: WaterSummary | null;
    sales: SalesSummary | null;
    costs: CostSummary | null;
  }
): string {
  switch (kpiId) {
    case FARMING_KPI_IDS.farmRevenue:
      if (!s.sales) return "Commercial Farm Revenue needs sales lines in the Sales register.";
      if (s.sales.unpriced > 0)
        return `Commercial Farm Revenue needs a unit price on all ${s.sales.lines} sales lines: ${s.sales.unpriced} line(s) have a quantity but no price, so the total would understate the season.`;
      return "Commercial Farm Revenue needs at least one sales line with a quantity and a unit price.";
    case FARMING_KPI_IDS.mortality:
      if (!s.mortality) return "Livestock Mortality Rate needs deaths recorded in the Mortality register.";
      if (s.mortality.ratePct === null)
        return "Livestock Mortality Rate needs a stock figure: record livestock head counts in the Livestock register, because a death count alone is not a rate.";
      return "Livestock Mortality Rate could not be derived from this submission.";
    case FARMING_KPI_IDS.production:
      if (!s.production) return "Total Production Volume needs harvest records in the Production register.";
      if (s.production.totalQuantity === null)
        return `Total Production Volume cannot be totalled because harvests are recorded in more than one unit (${s.production.unitsPresent.join(", ")}). Record every harvest in one unit, or report each crop separately.`;
      return "Total Production Volume could not be derived from this submission.";
    case FARMING_KPI_IDS.livestock:
      return "Livestock on Hand needs at least one head count in the Livestock register.";
    case FARMING_KPI_IDS.diseaseIncidence:
      if (!s.disease) return "Disease Case Incidence needs cases recorded in the Disease register.";
      if (s.disease.incidencePct === null)
        return "Disease Case Incidence needs a stock figure to be a rate: record livestock head counts in the Livestock register.";
      return "Disease Case Incidence could not be derived from this submission.";
    case FARMING_KPI_IDS.waterUse:
      if (!s.water) return "Water Abstracted needs readings in the Water register.";
      if (s.water.totalVolume === null)
        return `Water Abstracted cannot be totalled because volumes are recorded in more than one unit (${s.water.unitsPresent.join(", ")}). Record every reading in one unit.`;
      return "Water Abstracted could not be derived from this submission.";
    case FARMING_KPI_IDS.salesVolume:
      if (!s.sales) return "Sales Volume needs sales lines in the Sales register.";
      if (s.sales.volume === null)
        return `Sales Volume cannot be totalled because quantities are recorded in more than one unit (${s.sales.unitsPresent.join(", ")}).`;
      return "Sales Volume could not be derived from this submission.";
    case FARMING_KPI_IDS.totalCosts:
      if (!s.costs) return "Total Production Costs needs cost lines in the Costs register.";
      if (s.costs.missingAmount > 0)
        return `Total Production Costs needs an amount on all ${s.costs.lines} cost lines: ${s.costs.missingAmount} line(s) have no amount, so a total would understate the season.`;
      return "Total Production Costs could not be derived from this submission.";
    case FARMING_KPI_IDS.feedCostRatio:
      if (!s.costs) return "Feed Cost Ratio needs cost lines in the Costs register.";
      if (s.costs.feedAmount === null)
        return "Feed Cost Ratio needs at least one Feed cost line, with an amount on every cost line so the share of total cost is honest.";
      return "Feed Cost Ratio could not be derived from this submission.";
    default:
      return "This figure could not be derived from this submission.";
  }
}

/** Which reporting area feeds a KPI, for the "not reported from this
 *  submission" list. */
export function sectionForFarmingKpi(kpiId: string): FarmingSectionKey {
  switch (kpiId) {
    case FARMING_KPI_IDS.production:
      return "production";
    case FARMING_KPI_IDS.livestock:
    case FARMING_KPI_IDS.mortality:
    case FARMING_KPI_IDS.diseaseIncidence:
      // Mortality and disease rates are read against stock on hand, so their
      // stock dependency is surfaced on the Livestock section too.
      return kpiId === FARMING_KPI_IDS.livestock ? "livestock" : kpiId === FARMING_KPI_IDS.mortality ? "mortality" : "disease";
    case FARMING_KPI_IDS.waterUse:
      return "water";
    case FARMING_KPI_IDS.farmRevenue:
    case FARMING_KPI_IDS.salesVolume:
      return "sales";
    case FARMING_KPI_IDS.totalCosts:
    case FARMING_KPI_IDS.feedCostRatio:
      return "costs";
    default:
      return FARMING_SECTION_KEYS[0];
  }
}

/**
 * The verdict a single Commercial Farming KPI would receive right now.
 *
 * Separated from computation so the section previews and the submission path
 * cannot disagree. A KPI with no approved threshold returns `threshold_unset`
 * rather than a colour: nobody has agreed what a good mortality rate is, and a
 * green light on an undecided target would be a claim the dashboard cannot
 * support.
 *
 * `kpi-mortality` does have approved thresholds, so it does return a real
 * colour once the register produces a rate.
 */
export function previewFarmingStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) {
    // Same convention as Operations: only a KPI that states WHY it is
    // unavailable reports not_available. Anything else is simply no data.
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

/** Every Amber/Red Commercial Farming KPI that is expected to need an
 *  explanation. */
export function farmingKpisNeedingExplanation(
  computation: FarmingComputation,
  kpis: Kpi[]
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries
    .map(({ kpiId, value }) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi) return null;
      const status = getStatusForValue(kpi, value);
      if (status !== "amber" && status !== "red") return null;
      return { kpiId, name: kpi.name, value, status };
    })
    .filter((x): x is { kpiId: string; name: string; value: number; status: "amber" | "red" } => x !== null);
}