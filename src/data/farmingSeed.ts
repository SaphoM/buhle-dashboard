import type { Kpi, ReportingFrequency } from "../types";
import type {
  CostRecord,
  DiseaseRecord,
  FarmingCommentary,
  FarmingConfig,
  FarmingReport,
  LivestockRecord,
  MortalityRecord,
  ProductionRecord,
  SalesRecord,
  WaterRecord,
} from "../types/farming";
import { FARMING_DEPARTMENT } from "../types/farming";

/**
 * Commercial Farming defaults.
 *
 * Every list here is CONFIGURATION, not a domain constant. Buhle's approved crop
 * list, plot layout, livestock groups, veterinary disease list and sales channels
 * have not been confirmed against a farm register, so what follows is a
 * defensible starting set an administrator edits in Administration -> Commercial
 * Farming Configuration. Nothing here is presented to an executive as Buhle's
 * approved structure.
 *
 * The starting lists describe a mixed enterprise (crops plus livestock plus
 * poultry), which is what the discovery material indicates Buhle runs, rather
 * than a pure crop or pure livestock farm.
 */

export const DEFAULT_CROPS = [
  "Maize",
  "Soya beans",
  "Sunflower",
  "Vegetables",
  "Fodder / hay",
] as const;

export const DEFAULT_PLOTS = ["Field 1", "Field 2", "Field 3", "Garden", "Orchard"] as const;

export const DEFAULT_LIVESTOCK_CATEGORIES = ["Cattle", "Chickens", "Goats", "Sheep", "Pigs"] as const;

export const DEFAULT_MORTALITY_CAUSES = [
  "Disease",
  "Predation",
  "Accident",
  "Extreme weather",
  "Starvation / feed",
  "Old age",
  "Unknown",
] as const;

export const DEFAULT_DISEASES = [
  "Newcastle Disease",
  "Avian Influenza",
  "Foot and Mouth Disease",
  "Coccidiosis",
  "Mastitis",
  "Diarrhoea",
  "Pneumonia",
  "Parasites",
] as const;

export const DEFAULT_WATER_SOURCES = ["Borehole", "Dam / reservoir", "River", "Municipal", "Rainwater harvesting"] as const;

export const DEFAULT_SALES_CHANNELS = [
  "Formal market",
  "On-farm sale",
  "Retail",
  "Restaurant / catering",
  "School feeding scheme",
  "Contract buyer",
] as const;

export const DEFAULT_COST_CATEGORIES = [
  "Feed",
  "Veterinary",
  "Seed / seedlings",
  "Fertiliser",
  "Labour",
  "Water",
  "Fuel",
  "Equipment",
  "Infrastructure",
  "Transport",
  "Other",
] as const;

export const DEFAULT_COST_CENTRES = ["Crops", "Livestock", "Poultry", "Shared / farm-wide"] as const;

let sequence = 0;

function newId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export const DEFAULT_FARMING_CONFIG: FarmingConfig = {
  reportingFrequency: "Per Season",
  currencySymbol: "R",
  crops: [...DEFAULT_CROPS],
  plots: [...DEFAULT_PLOTS],
  livestockCategories: [...DEFAULT_LIVESTOCK_CATEGORIES],
  mortalityCauses: [...DEFAULT_MORTALITY_CAUSES],
  diseases: [...DEFAULT_DISEASES],
  waterSources: [...DEFAULT_WATER_SOURCES],
  salesChannels: [...DEFAULT_SALES_CHANNELS],
  costCategories: [...DEFAULT_COST_CATEGORIES],
  costCentres: [...DEFAULT_COST_CENTRES],
  // Suspected deaths are recorded but excluded from the reported rate by
  // default. Excluding them is the conservative reading; an administrator flips
  // this once Buhle's veterinary practice is confirmed.
  mortalityCountsSuspected: false,
};

export function blankProductionRecord(): ProductionRecord {
  return {
    id: newId("prd"),
    crop: "",
    plot: "",
    areaHa: null,
    plantingDate: "",
    harvestDate: "",
    yieldQuantity: null,
    yieldUnit: "",
    lossQuantity: null,
    lossReason: "",
    notes: "",
  };
}

export function blankLivestockRecord(): LivestockRecord {
  return {
    id: newId("lsv"),
    category: "",
    breed: "",
    countDate: "",
    headCount: null,
    breedingFemales: null,
    additions: null,
    soldOrRemoved: null,
    location: "",
    notes: "",
  };
}

export function blankMortalityRecord(): MortalityRecord {
  return {
    id: newId("mrt"),
    category: "",
    date: "",
    headCount: null,
    cause: "",
    causeDetail: "",
    postMortemDone: false,
    countedInRate: false,
    disposalMethod: "",
    reportedBy: "",
    notes: "",
  };
}

export function blankDiseaseRecord(): DiseaseRecord {
  return {
    id: newId("dsz"),
    category: "",
    onsetDate: "",
    disease: "",
    headCount: null,
    diagnosisConfirmed: false,
    treatmentGiven: "",
    treatmentEndDate: "",
    outcome: "",
    reportedToStateVet: "",
    vetConsulted: false,
    notes: "",
  };
}

export function blankWaterRecord(): WaterRecord {
  return {
    id: newId("wtr"),
    source: "",
    readingDate: "",
    volumeUsed: null,
    volumeUnit: "",
    meterPoint: "",
    licenceReference: "",
    licenceExpiry: "",
    use: "",
    notes: "",
  };
}

export function blankSalesRecord(): SalesRecord {
  return {
    id: newId("sal"),
    saleDate: "",
    product: "",
    channel: "",
    quantity: null,
    unit: "",
    unitPrice: null,
    buyer: "",
    paymentStatus: "",
    notes: "",
  };
}

export function blankCostRecord(): CostRecord {
  return {
    id: newId("cst"),
    date: "",
    category: "",
    costCentre: "",
    amount: null,
    supplier: "",
    reference: "",
    paid: false,
    notes: "",
  };
}

export function blankCommentary(): FarmingCommentary {
  return {
    overall: "",
    keyIssue: "",
    keyAchievement: "",
    productionCommentary: "",
    livestockCommentary: "",
    mortalityCommentary: "",
    diseaseCommentary: "",
    waterCommentary: "",
    salesCommentary: "",
    costsCommentary: "",
    kpiExplanations: {},
  };
}

export function createBlankFarmingReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
}): FarmingReport {
  return {
    id: `farm-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: FARMING_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    production: { records: [], commentary: "", notApplicable: false },
    livestock: { records: [], commentary: "", notApplicable: false },
    mortality: { records: [], commentary: "", notApplicable: false },
    disease: { records: [], commentary: "", notApplicable: false },
    water: { records: [], commentary: "", notApplicable: false },
    sales: { records: [], commentary: "", notApplicable: false },
    costs: { records: [], commentary: "", notApplicable: false },
    commentary: blankCommentary(),
    dataSource: { kind: "Not Submitted" },
    status: "Draft",
    computedKpis: {},
  };
}

/**
 * The KPI ids the Commercial Farming submission is responsible for.
 *
 * `kpi-farmrevenue` and `kpi-mortality` keep the ids already in the demo data,
 * because the Executive roll-up and a live red risk reference them by id. Their
 * shape changes: they become derived from records rather than typed by hand.
 *
 * `kpi-mortality` ALSO keeps its existing thresholds (green 4%, amber 6%, lower
 * is better). Those are carried through unchanged on purpose: a red risk is
 * currently open against that KPI and an escalation to Board level rests on it,
 * so silently resetting its limits while rebuilding the source would remove the
 * basis of a live escalation. Its prior hand-typed figure is discarded, because
 * the mortality register is about to become the authority.
 */
export const FARMING_KPI_IDS = {
  farmRevenue: "kpi-farmrevenue",
  mortality: "kpi-mortality",
  production: "kpi-farm-production",
  livestock: "kpi-farm-livestock",
  diseaseIncidence: "kpi-farm-disease",
  waterUse: "kpi-farm-water",
  salesVolume: "kpi-farm-sales-volume",
  totalCosts: "kpi-farm-costs",
  feedCostRatio: "kpi-farm-feed-cost-ratio",
} as const;

/**
 * Commercial Farming KPIs.
 *
 * Every NEW threshold here is null, and that is the honest starting position
 * rather than an omission. Buhle's Commercial Farming targets have not been
 * confirmed, and the demo figures that carried proposed thresholds were typed by
 * hand rather than derived from any register. A KPI with no approved limit reports
 * `threshold_unset`: recorded, displayed, monitored, and issuing no Green/Amber/
 * Red verdict. The moment an administrator sets a limit in Administration, the
 * Early Warning System starts working with no code change.
 *
 * The one exception is kpi-mortality, whose approved thresholds are carried
 * through from the existing demo data so the live Board escalation stands.
 */
export const FARMING_SUBMISSION_KPIS: Kpi[] = [
  {
    id: FARMING_KPI_IDS.farmRevenue,
    name: "Commercial Farm Revenue",
    department: FARMING_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "seasonly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Sales value for the season, derived from every sales line (quantity x unit price). No approved revenue target has been confirmed yet.",
    sourceSystem: "Commercial Farming submission - sales register",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.mortality,
    name: "Livestock Mortality Rate",
    department: FARMING_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    // Carried through unchanged: a Board-level escalation is open against this
    // KPI, so the limits that triggered it must survive the rebuild.
    target: 3,
    greenThreshold: 4,
    amberThreshold: 6,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "weekly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Deaths as a percentage of stock on hand, derived from the mortality register over the livestock register. Confirmed deaths only unless an administrator includes suspected ones.",
    sourceSystem: "Commercial Farming submission - mortality and livestock registers",
    thresholdApproval: "confirmed",
  },
  {
    id: FARMING_KPI_IDS.production,
    name: "Total Production Volume",
    department: FARMING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "seasonly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Quantity harvested across all crops, derived from the production register. Mixed-unit harvests are reported as a total count of recorded quantities, so the unit is read alongside the figure rather than converted away.",
    sourceSystem: "Commercial Farming submission - production register",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.livestock,
    name: "Livestock on Hand",
    department: FARMING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Head on hand across all livestock groups at the latest count date. This is the denominator of the mortality rate, so it is recorded per group rather than as a single standing total.",
    sourceSystem: "Commercial Farming submission - livestock register",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.diseaseIncidence,
    name: "Disease Case Incidence",
    department: FARMING_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "weekly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Animals recorded ill as a percentage of stock on hand, derived from the disease register. Not the same as mortality: an animal can fall ill and recover, and that case still matters to biosecurity.",
    sourceSystem: "Commercial Farming submission - disease and livestock registers",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.waterUse,
    name: "Water Abstracted",
    department: FARMING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "monthly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Water drawn per season, derived from the water register in the units the meters read. Reported with its unit rather than converted, so an abstraction figure can be checked against the bill.",
    sourceSystem: "Commercial Farming submission - water register",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.salesVolume,
    name: "Sales Volume",
    department: FARMING_DEPARTMENT,
    unit: "count",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "seasonly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Total quantity sold across every line in the sales register. Kept separate from revenue so a price change cannot masquerade as a production change.",
    sourceSystem: "Commercial Farming submission - sales register",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.totalCosts,
    name: "Total Production Costs",
    department: FARMING_DEPARTMENT,
    unit: "currency",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: false,
    history: [],
    measurementFrequency: "seasonly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "All costs recorded for the season, derived from the cost register. Reported before any allocation, because the application does not know which cost centre each cost truly belongs to.",
    sourceSystem: "Commercial Farming submission - cost register",
    thresholdApproval: "proposed",
  },
  {
    id: FARMING_KPI_IDS.feedCostRatio,
    name: "Feed Cost Ratio",
    department: FARMING_DEPARTMENT,
    unit: "percent",
    currentValue: 0,
    previousValue: 0,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    lowerIsBetter: true,
    history: [],
    measurementFrequency: "seasonly",
    owner: "Farm Manager",
    dataAvailable: false,
    insight:
      "Feed as a percentage of total cost, derived from the cost register. On a livestock enterprise feed dominates cost, so this is the first figure to check when margin moves.",
    sourceSystem: "Commercial Farming submission - cost register",
    thresholdApproval: "proposed",
  },
];