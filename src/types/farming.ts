// ============================================================================
// COMMERCIAL FARMING reporting domain.
//
// Commercial Farming runs Buhle's productive enterprise: crops, livestock, the
// animals and stock that die or fall ill, the water that makes production
// possible, what leaves the gate as sales, and what the whole thing costs.
//
// Design rules held throughout this file, mirroring the Finance and Operations
// modules:
//
//  - Underlying RECORDS are captured, not summary percentages. A farm manager
//    typing "6.8% mortality" into a box is asserting a number nobody can trace
//    back to a dead animal. Every rate on this dashboard is DERIVED from the
//    records in these seven sections.
//
//  - Every captured figure is nullable. "Not supplied" and "zero" are different
//    facts. A missing figure surfaces as no-data, never as a fabricated Green.
//
//  - NOTHING INVENTS A TARGET OR A THRESHOLD. Those live on the KPI record and
//    are admin-editable. The existing mortality threshold is carried through
//    unchanged because a live red risk already rests on it.
//
//  - Each section is explicitly markable Not Applicable, for a season in which
//    an activity genuinely did not occur. A winter with no sales must not read as
//    a winter where everything sold and nothing was left.
//
//  - There is NO approved Commercial Farming source system. Buhle has no farm
//    management or accounting system feeding this data, so provenance matters:
//    every section states whether its figures were typed or imported.
//
// Structure note: seven sections, one per reporting area, in submission order.
// They are deliberately NOT grouped. Production is crop records, livestock is
// stock records, mortality and disease are animal-health events, water is
// abstraction records, and sales and costs are commercial records. They are
// captured by different people on different days, and merging them would let one
// incomplete section hide five complete ones.
// ============================================================================

import type { Department, ReportingFrequency } from "./index";

export const FARMING_DEPARTMENT = "Commercial Farming" as const satisfies Department;

// ---------------------------------------------------------------------------
// The seven Commercial Farming reporting areas, in submission order.
// ---------------------------------------------------------------------------

export const FARMING_SECTION_KEYS = [
  "production",
  "livestock",
  "mortality",
  "disease",
  "water",
  "sales",
  "costs",
] as const;

export type FarmingSectionKey = (typeof FARMING_SECTION_KEYS)[number];

export const FARMING_SECTION_LABELS: Record<FarmingSectionKey, string> = {
  production: "Production",
  livestock: "Livestock",
  mortality: "Mortality",
  disease: "Disease",
  water: "Water",
  sales: "Sales",
  costs: "Costs",
};

/** Per-section completion state in the modal's progress strip.
 *
 *  Deliberately there is no "not_available" state. Commercial Farming CAN report
 *  all seven areas from its own registers, so a genuinely missing figure is
 *  `incomplete` - a data gap - and must not hide behind a capability message. */
export type FarmingSectionState = "complete" | "incomplete" | "attention" | "not_applicable";

/** Shared section envelope: records, commentary, and the explicit N/A switch. */
export interface FarmingSectionEnvelope {
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Production - crops and harvest
// ---------------------------------------------------------------------------

/**
 * What was planted and what came off it.
 *
 * Yield is recorded as a quantity and a unit rather than as a pre-computed
 * "yield per hectare" figure, because the two halves can disagree when someone
 * revises an area after harvest. The application derives the ratio.
 */
export interface ProductionRecord {
  id: string;
  /** Configured crop or enterprise. */
  crop: string;
  /** Configured production area/plot reference. */
  plot: string;
  /** Hectares planted. Null when the register carries area in another unit; the
   *  application never converts between area units on its own. */
  areaHa: number | null;
  plantingDate: string;
  /** ISO harvest date. Blank while a crop is still standing. */
  harvestDate: string;
  /** Quantity harvested, in `yieldUnit`. */
  yieldQuantity: number | null;
  /** e.g. kg, tonnes, crates, bunches. Required whenever a yield is given,
   *  because "1,200" with no unit is not a measurement. */
  yieldUnit: string;
  /** Whether the harvest was lost, damaged or otherwise not saleable. Kept apart
   *  from yield so a good harvest that spoiled is not recorded as a bad
   *  harvest. */
  lossQuantity: number | null;
  lossReason: string;
  notes: string;
}

export interface FarmingProductionData extends FarmingSectionEnvelope {
  records: ProductionRecord[];
}

// ---------------------------------------------------------------------------
// Livestock - the stock on the farm
// ---------------------------------------------------------------------------

export type LivestockCategory = "Cattle" | "Chickens" | "Goats" | "Sheep" | "Pigs" | "Other";

/**
 * A count of animals, not a list of individuals.
 *
 * Buhle's livestock register is a head count per group per date. Recording
 * individual animals would be unusable at farm scale and is not what the
 * register holds, so this captures the count the register actually keeps.
 */
export interface LivestockRecord {
  id: string;
  /** Configured species group. */
  category: LivestockCategory | "";
  /** Breed within the category. */
  breed: string;
  /** ISO date the count was taken. */
  countDate: string;
  /** Head on hand at that date. */
  headCount: number | null;
  /** Females of breeding age. Lets the flock/herd structure be reported. */
  breedingFemales: number | null;
  /** Animals added during the period, from purchase or birth. */
  additions: number | null;
  /** Animals removed from the group for sale. Kept distinct from mortality so
   *  deliberate sales never inflate the mortality rate. */
  soldOrRemoved: number | null;
  location: string;
  notes: string;
}

export interface FarmingLivestockData extends FarmingSectionEnvelope {
  records: LivestockRecord[];
}

// ---------------------------------------------------------------------------
// Mortality - animals that died
// ---------------------------------------------------------------------------

export type MortalityCause =
  | "Disease"
  | "Predation"
  | "Accident"
  | "Extreme weather"
  | "Starvation / feed"
  | "Old age"
  | "Unknown";

/**
 * Every death, because the mortality rate is deaths over stock on hand and a
 * count without a stock figure is not a rate.
 *
 * `countedInRate` exists so a suspected or unconfirmed death is recorded for
 * investigation without inflating the mortality KPI. Suppressing a suspected
 * death to make the number look better is the one thing this section must not
 * make easy.
 */
export interface MortalityRecord {
  id: string;
  category: LivestockCategory | "";
  /** ISO date the death was found or confirmed. */
  date: string;
  headCount: number | null;
  cause: MortalityCause | "";
  /** Free-text detail behind the cause category. */
  causeDetail: string;
  /** Whether a veterinary or laboratory post-mortem was performed. */
  postMortemDone: boolean;
  /** Whether this death is included in the reported mortality rate. False for
   *  suspected, disputed or pending-confirmation deaths. */
  countedInRate: boolean;
  /** Disposal method, e.g. burial, rendering. Matters for biosecurity. */
  disposalMethod: string;
  reportedBy: string;
  notes: string;
}

export interface FarmingMortalityData extends FarmingSectionEnvelope {
  records: MortalityRecord[];
}

// ---------------------------------------------------------------------------
// Disease - animals that fell ill
// ---------------------------------------------------------------------------

export interface DiseaseRecord {
  id: string;
  category: LivestockCategory | "";
  /** ISO date the case was first seen. */
  onsetDate: string;
  /** Configured disease name, from the approved list. */
  disease: string;
  headCount: number | null;
  /** Whether a veterinarian or laboratory confirmed the diagnosis. An
   *  unconfirmed outbreak is a different claim from a confirmed one. */
  diagnosisConfirmed: boolean;
  treatmentGiven: string;
  /** ISO date treatment ended, or blank if ongoing. */
  treatmentEndDate: string;
  /** Whether the animals recovered, died, or the outcome is unknown. Kept
   *  explicit because "recovered" and "we stopped looking" are different. */
  outcome: "Recovered" | "Died" | "Ongoing" | "Unknown" | "";
  /** ISO date the case was reported to the state veterinarian, where
   *  notifiable. Blank when not notifiable. */
  reportedToStateVet: string;
  vetConsulted: boolean;
  notes: string;
}

export interface FarmingDiseaseData extends FarmingSectionEnvelope {
  records: DiseaseRecord[];
}

// ---------------------------------------------------------------------------
// Water - abstraction and availability
// ---------------------------------------------------------------------------

export type WaterSource = "Borehole" | "Dam / reservoir" | "River" | "Municipal" | "Rainwater harvesting" | "Other";

/**
 * Water is a production input and a compliance matter, so the record carries
 * both the volume used and the licence it was drawn under.
 *
 * Volume is recorded in the unit the meter actually reads, and the unit travels
 * with the number. Converting megalitres to cubic metres silently would let a
 * hundredfold error pass unnoticed.
 */
export interface WaterRecord {
  id: string;
  source: WaterSource | "";
  /** ISO reading date. */
  readingDate: string;
  /** Volume used, in `volumeUnit`. */
  volumeUsed: number | null;
  /** e.g. m3, litres, ML. */
  volumeUnit: string;
  /** Meter or borehole identifier. */
  meterPoint: string;
  /** Water licence or permit reference, where abstraction is licensed. */
  licenceReference: string;
  /** Licence expiry, where one exists. An expired licence is a compliance
   *  finding, so it is captured rather than left in a filing cabinet. */
  licenceExpiry: string;
  /** Main use of the water: irrigation, livestock drinking, domestic, processing. */
  use: string;
  notes: string;
}

export interface FarmingWaterData extends FarmingSectionEnvelope {
  records: WaterRecord[];
}

// ---------------------------------------------------------------------------
// Sales - what left the gate
// ---------------------------------------------------------------------------

/**
 * One sale line.
 *
 * Quantity, unit and unit price are recorded separately and the value is
 * derived from them, because a single mistyped total in a spreadsheet is the most
 * common way a farm's revenue quietly stops matching its stock.
 */
export interface SalesRecord {
  id: string;
  /** ISO sale date. */
  saleDate: string;
  /** What was sold: a crop, eggs, livestock, produce. */
  product: string;
  /** Configured sales channel. */
  channel: string;
  quantity: number | null;
  /** Unit the quantity is counted in, e.g. kg, crate, dozen, head. */
  unit: string;
  /** Price per unit in rand. */
  unitPrice: number | null;
  buyer: string;
  paymentStatus: "Paid" | "Outstanding" | "Partially paid" | "";
  notes: string;
}

export interface FarmingSalesData extends FarmingSectionEnvelope {
  records: SalesRecord[];
}

// ---------------------------------------------------------------------------
// Costs - what the enterprise consumed
// ---------------------------------------------------------------------------

export type FarmingCostCategory =
  | "Feed"
  | "Veterinary"
  | "Seed / seedlings"
  | "Fertiliser"
  | "Labour"
  | "Water"
  | "Fuel"
  | "Equipment"
  | "Infrastructure"
  | "Transport"
  | "Other";

/**
 * A cost line, categorised.
 *
 * Feeding is deliberately the largest category on any livestock enterprise, so
 * the feed/production relationship is derivable from these records rather than
 * asserted separately.
 */
export interface CostRecord {
  id: string;
  /** ISO date the cost was incurred. */
  date: string;
  category: FarmingCostCategory | "";
  /** Configured cost centre, e.g. which enterprise or plot. */
  costCentre: string;
  /** Amount in rand. */
  amount: number | null;
  supplier: string;
  /** Purchase or invoice reference, so the cost can be traced. */
  reference: string;
  paid: boolean;
  notes: string;
}

export interface FarmingCostsData extends FarmingSectionEnvelope {
  records: CostRecord[];
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

export type FarmingReportStatus = "Draft" | "Submitted";

export interface FarmingReport {
  id: string;
  cycleId: string;
  department: typeof FARMING_DEPARTMENT;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  production: FarmingProductionData;
  livestock: FarmingLivestockData;
  mortality: FarmingMortalityData;
  disease: FarmingDiseaseData;
  water: FarmingWaterData;
  sales: FarmingSalesData;
  costs: FarmingCostsData;
  commentary: FarmingCommentary;
  dataSource: FarmingDataSource;
  status: FarmingReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  /** KPI values derived from this submission - the audit record of what was
   *  calculated. */
  computedKpis: Record<string, number | null>;
}

/** Commentary, with a slot per reporting area so a Farm Manager can explain
 *  each section rather than one overall paragraph that hides the problem area. */
export interface FarmingCommentary {
  overall: string;
  keyIssue: string;
  keyAchievement: string;
  productionCommentary: string;
  livestockCommentary: string;
  mortalityCommentary: string;
  diseaseCommentary: string;
  waterCommentary: string;
  salesCommentary: string;
  costsCommentary: string;
  /** Per-KPI explanation, keyed by KPI id, for Amber/Red figures. */
  kpiExplanations: Record<string, string>;
}

/** "Not Submitted" is the honest initial state. A report that has never been
 *  typed must not present as a manual entry, because a reader would assume
 *  somebody entered the figures deliberately. */
export type FarmingSourceKind = "Manual Entry" | "Not Submitted";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface FarmingDataSource {
  kind: FarmingSourceKind;
  /** Person who entered the figures, when typed manually. */
  enteredBy?: string;
  enteredAt?: string;
  /** Set when entry was attempted and failed. The section then reports the
   *  failure rather than reading as empty-and-fine. */
  failedAt?: string;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Config - cadence and vocabularies are configuration, never constants
// ---------------------------------------------------------------------------

export interface FarmingConfig {
  /** Cadence of the Commercial Farming reporting cycle. Per SEASON by default,
   *  because a crop cycle and a livestock cycle are both seasonal: a monthly
   *  cycle would report the same standing herd and the same standing water
   *  meter reading twelve times and make them look like they moved. */
  reportingFrequency: ReportingFrequency;
  /** Currency symbol for sales and costs. Comes from configuration. */
  currencySymbol: string;
  /** The approved crop and enterprise list. */
  crops: string[];
  /** Approved plot / area references. */
  plots: string[];
  /** Approved livestock species groups. */
  livestockCategories: LivestockCategory[];
  /** Approved mortality cause categories. */
  mortalityCauses: MortalityCause[];
  /** Approved disease names, from the veterinary record. */
  diseases: string[];
  /** Approved water sources. */
  waterSources: WaterSource[];
  /** Approved sales channels. */
  salesChannels: string[];
  /** Approved cost categories. */
  costCategories: FarmingCostCategory[];
  /** Approved cost centres. */
  costCentres: string[];
  /** Whether a livestock mortality record counts toward the mortality KPI.
   *  Held here because excluding or including suspected deaths produces a
   *  materially different rate, and that is a policy decision, not an
   *  arithmetic one. */
  mortalityCountsSuspected: boolean;
}