import {
  FARMING_SECTION_KEYS,
  FARMING_SECTION_LABELS,
  type FarmingConfig,
  type FarmingReport,
  type FarmingSectionKey,
  type MortalityCause,
} from "../types/farming";

/**
 * ============================================================================
 * Commercial Farming submission validation.
 * ============================================================================
 *
 * The governing rule is the same one Finance and Operations apply: a Commercial
 * Farming submission either carries what the configured rules require, or it is
 * refused with a precise list naming the section and the field.
 *
 * What makes farming validation distinctive is that most of the conflicts that
 * matter are BETWEEN registers, because a farm's registers describe the same
 * animals and the same season from different angles:
 *
 *  - A mortality rate with no stock behind it. Deaths divided by nothing is not
 *    a rate, so a submission that records deaths but no head count cannot
 *    produce the KPI the live Board escalation is measured against.
 *
 *  - More animals dying in a group than were counted in it. The livestock
 *    register and the mortality register disagree about the size of the herd.
 *
 *  - A disease case recorded for animals that were never on the books, or a
 *    mortality date before the animal could plausibly have been born or bought.
 *
 *  - Harvest quantities in mixed units summed into one total, which the engine
 *    refuses to produce and which no reader could act on.
 *
 *  - Sales with no unit price and costs with no amount. Both produce a total
 *    that looks complete and is not, which is the most dangerous failure on a
 *    farm because it flatters the margin beside it.
 *
 *  - A crop, plot, species, disease, water source, channel or cost category
 *    that is no longer approved, because the approved list is configuration and
 *    a register that has drifted from it cannot be aggregated across seasons.
 *
 * Required fields are deliberately limited to what a calculation actually
 * consumes. Requiring a supplier or a reference that nothing reads would train
 * managers to type junk to get past the gate.
 */

export interface FarmingValidationIssue {
  section: FarmingSectionKey;
  field: string;
  message: string;
  kind?: "missing" | "inconsistent";
}

export interface FarmingSectionValidation {
  state: "complete" | "incomplete" | "not_applicable";
  issues: FarmingValidationIssue[];
}

export interface FarmingValidationResult {
  valid: boolean;
  issues: FarmingValidationIssue[];
  bySection: Record<FarmingSectionKey, FarmingSectionValidation>;
}

export interface ValidateFarmingOptions {
  config: FarmingConfig;
  today?: Date;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/** A negative count or amount is never a real observation. */
function isNegative(value: number | null | undefined): boolean {
  return typeof value === "number" && value < 0;
}

function missing(section: FarmingSectionKey, field: string): FarmingValidationIssue {
  return { section, field, message: `${field} is required`, kind: "missing" };
}

function inconsistent(section: FarmingSectionKey, field: string, message: string): FarmingValidationIssue {
  return { section, field, message, kind: "inconsistent" };
}

/**
 * The approved vocabulary has drifted from the record. Named rather than
 * silently accepted, because a crop or species that exists only in this
 * submission cannot be aggregated against the same category next season.
 */
function notApproved(section: FarmingSectionKey, field: string, value: string): FarmingValidationIssue {
  return {
    section,
    field,
    message: `"${value}" is not an approved ${field.toLowerCase()} - add it in Administration or correct the record`,
    kind: "inconsistent",
  };
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

function validateProduction(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { crops, plots } = options.config;

  report.production.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.crop)) issues.push(missing("production", `Production ${n} - Crop`));
    else if (crops.length > 0 && !crops.includes(r.crop)) issues.push(notApproved("production", `Production ${n} - Crop`, r.crop));

    if (isBlank(r.plot)) issues.push(missing("production", `Production ${n} - Plot`));
    else if (plots.length > 0 && !plots.includes(r.plot)) issues.push(notApproved("production", `Production ${n} - Plot`, r.plot));

    if (isBlank(r.plantingDate)) issues.push(missing("production", `Production ${n} - Planting date`));
    if (isNegative(r.areaHa)) {
      issues.push(inconsistent("production", `Production ${n} - Area (ha)`, "Area cannot be negative"));
    }
    if (isNegative(r.yieldQuantity)) {
      issues.push(inconsistent("production", `Production ${n} - Yield quantity`, "Yield cannot be negative"));
    }
    if (isNegative(r.lossQuantity)) {
      issues.push(inconsistent("production", `Production ${n} - Loss quantity`, "Loss cannot be negative"));
    }

    // A quantity with no unit is not a measurement, and a unit with no quantity
    // is a stray label. The engine refuses to total either, so it is refused
    // here where the manager can still fix it.
    if (r.yieldQuantity !== null && isBlank(r.yieldUnit)) {
      issues.push(missing("production", `Production ${n} - Yield unit`));
    }
    if (r.yieldQuantity === null && !isBlank(r.yieldUnit)) {
      issues.push(
        inconsistent("production", `Production ${n} - Yield quantity`, "A unit is recorded but no quantity - the figure cannot be measured")
      );
    }
    if (isNegative(r.lossQuantity) === false && r.lossQuantity !== null && r.lossQuantity > 0 && isBlank(r.lossReason)) {
      issues.push(missing("production", `Production ${n} - Loss reason`));
    }
  });

  // Mixed units cannot be totalled. Not fatal on its own - a farm genuinely
  // harvests in several units - but it means the production KPI cannot be
  // derived, so the manager is told now rather than surprised on the review page.
  const harvestedUnits = new Set(
    report.production.records.filter((r) => r.harvestDate && r.yieldQuantity !== null).map((r) => r.yieldUnit)
  );
  if (harvestedUnits.size > 1) {
    issues.push(
      inconsistent(
        "production",
        "Harvest units",
        `Harvests are recorded in more than one unit (${[...harvestedUnits].join(", ")}), so no total production figure can be calculated. Record every harvest in one unit, or leave each crop's quantity for reporting only.`
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Livestock
// ---------------------------------------------------------------------------

function validateLivestock(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { livestockCategories } = options.config;

  report.livestock.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.category)) issues.push(missing("livestock", `Livestock ${n} - Category`));
    else if (livestockCategories.length > 0 && !livestockCategories.includes(r.category as never)) {
      issues.push(notApproved("livestock", `Livestock ${n} - Category`, r.category));
    }
    if (isBlank(r.countDate)) issues.push(missing("livestock", `Livestock ${n} - Count date`));
    if (r.headCount === null) issues.push(missing("livestock", `Livestock ${n} - Head count`));
    if (isNegative(r.headCount)) {
      issues.push(inconsistent("livestock", `Livestock ${n} - Head count`, "Head count cannot be negative"));
    }
    if (isNegative(r.additions)) {
      issues.push(inconsistent("livestock", `Livestock ${n} - Additions`, "Additions cannot be negative"));
    }
    if (isNegative(r.soldOrRemoved)) {
      issues.push(inconsistent("livestock", `Livestock ${n} - Sold / removed`, "Sold or removed cannot be negative"));
    }
    // Breeding females are a subset of the head on hand. More breeding females
    // than animals is a counting error, not a rich flock.
    if (typeof r.breedingFemales === "number" && typeof r.headCount === "number" && r.breedingFemales > r.headCount) {
      issues.push(
        inconsistent(
          "livestock",
          `Livestock ${n} - Breeding females`,
          `${r.breedingFemales} breeding females recorded out of ${r.headCount} head on hand`
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Mortality
// ---------------------------------------------------------------------------

function validateMortality(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { livestockCategories } = options.config;

  report.mortality.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.category)) issues.push(missing("mortality", `Mortality ${n} - Category`));
    else if (livestockCategories.length > 0 && !livestockCategories.includes(r.category as never)) {
      issues.push(notApproved("mortality", `Mortality ${n} - Category`, r.category));
    }
    if (isBlank(r.date)) issues.push(missing("mortality", `Mortality ${n} - Date`));
    if (r.headCount === null) issues.push(missing("mortality", `Mortality ${n} - Head count`));
    if (isNegative(r.headCount)) {
      issues.push(inconsistent("mortality", `Mortality ${n} - Head count`, "Deaths cannot be negative"));
    }
    if (isBlank(r.cause)) {
      issues.push(missing("mortality", `Mortality ${n} - Cause`));
    } else if (r.cause !== "Unknown" && !options.config.mortalityCauses.includes(r.cause as MortalityCause)) {
      issues.push(notApproved("mortality", `Mortality ${n} - Cause`, r.cause));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Disease
// ---------------------------------------------------------------------------

function validateDisease(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { livestockCategories, diseases } = options.config;
  const today = options.today ?? new Date();

  report.disease.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.category)) issues.push(missing("disease", `Disease ${n} - Category`));
    else if (livestockCategories.length > 0 && !livestockCategories.includes(r.category as never)) {
      issues.push(notApproved("disease", `Disease ${n} - Category`, r.category));
    }
    if (isBlank(r.onsetDate)) issues.push(missing("disease", `Disease ${n} - Onset date`));
    if (isBlank(r.disease)) issues.push(missing("disease", `Disease ${n} - Disease`));
    else if (diseases.length > 0 && !diseases.includes(r.disease)) {
      issues.push(notApproved("disease", `Disease ${n} - Disease`, r.disease));
    }
    if (r.headCount === null) issues.push(missing("disease", `Disease ${n} - Head count`));
    if (isNegative(r.headCount)) {
      issues.push(inconsistent("disease", `Disease ${n} - Head count`, "Animals affected cannot be negative"));
    }
    if (isBlank(r.outcome)) issues.push(missing("disease", `Disease ${n} - Outcome`));

    if (r.onsetDate && new Date(r.onsetDate).getTime() > today.getTime()) {
      issues.push(inconsistent("disease", `Disease ${n} - Onset date`, "Onset date is in the future"));
    }
    // A case cannot end before it began.
    if (
      r.onsetDate &&
      r.treatmentEndDate &&
      new Date(r.treatmentEndDate).getTime() < new Date(r.onsetDate).getTime()
    ) {
      issues.push(inconsistent("disease", `Disease ${n} - Treatment end date`, "Treatment ended before the case began"));
    }
    // A disease recorded with a case count larger than the whole farm's stock is
    // a counting error worth catching before it becomes an incidence rate.
    const farmStock = report.livestock.records.reduce((s, r2) => s + (r2.headCount ?? 0), 0);
    if (farmStock > 0 && typeof r.headCount === "number" && r.headCount > farmStock) {
      issues.push(
        inconsistent(
          "disease",
          `Disease ${n} - Head count`,
          `${r.headCount} animals affected, but only ${farmStock} head are recorded on the Livestock register`
        )
      );
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

function validateWater(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { waterSources } = options.config;

  report.water.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.source)) issues.push(missing("water", `Water ${n} - Source`));
    else if (waterSources.length > 0 && !waterSources.includes(r.source as never)) {
      issues.push(notApproved("water", `Water ${n} - Source`, r.source));
    }
    if (isBlank(r.readingDate)) issues.push(missing("water", `Water ${n} - Reading date`));
    if (r.volumeUsed === null) issues.push(missing("water", `Water ${n} - Volume used`));
    if (isNegative(r.volumeUsed)) {
      issues.push(inconsistent("water", `Water ${n} - Volume used`, "Volume cannot be negative"));
    }
    // Same rule as production: a volume with no unit cannot be totalled.
    if (r.volumeUsed !== null && isBlank(r.volumeUnit)) {
      issues.push(missing("water", `Water ${n} - Volume unit`));
    }
    if (r.readingDate && new Date(r.readingDate).getTime() > (options.today ?? new Date()).getTime()) {
      issues.push(inconsistent("water", `Water ${n} - Reading date`, "Reading date is in the future"));
    }
  });

  const units = new Set(report.water.records.filter((r) => r.volumeUsed !== null).map((r) => r.volumeUnit));
  if (units.size > 1) {
    issues.push(
      inconsistent(
        "water",
        "Water units",
        `Volumes are recorded in more than one unit (${[...units].join(", ")}), so no total abstraction figure can be calculated. Record every reading in one unit.`
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

function validateSales(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { salesChannels } = options.config;
  const today = options.today ?? new Date();

  report.sales.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.saleDate)) issues.push(missing("sales", `Sales ${n} - Sale date`));
    if (isBlank(r.product)) issues.push(missing("sales", `Sales ${n} - Product`));
    if (isBlank(r.channel)) issues.push(missing("sales", `Sales ${n} - Channel`));
    else if (salesChannels.length > 0 && !salesChannels.includes(r.channel)) {
      issues.push(notApproved("sales", `Sales ${n} - Channel`, r.channel));
    }
    if (r.quantity === null) issues.push(missing("sales", `Sales ${n} - Quantity`));
    if (isNegative(r.quantity)) {
      issues.push(inconsistent("sales", `Sales ${n} - Quantity`, "Quantity sold cannot be negative"));
    }
    if (r.quantity !== null && isBlank(r.unit)) issues.push(missing("sales", `Sales ${n} - Unit`));
    // A price is required, because revenue is derived from quantity x price and a
    // sale without one is an unvalued sale, not a free one.
    if (r.unitPrice === null) issues.push(missing("sales", `Sales ${n} - Unit price`));
    if (isNegative(r.unitPrice)) {
      issues.push(inconsistent("sales", `Sales ${n} - Unit price`, "Unit price cannot be negative"));
    }
    if (isBlank(r.paymentStatus)) issues.push(missing("sales", `Sales ${n} - Payment status`));
    if (r.saleDate && new Date(r.saleDate).getTime() > today.getTime()) {
      issues.push(inconsistent("sales", `Sales ${n} - Sale date`, "Sale date is in the future"));
    }
  });

  const units = new Set(report.sales.records.filter((r) => r.quantity !== null).map((r) => r.unit));
  if (units.size > 1) {
    issues.push(
      inconsistent(
        "sales",
        "Sales units",
        `Quantities are recorded in more than one unit (${[...units].join(", ")}), so no total sales volume can be calculated. Revenue is still calculated per line.`
      )
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

function validateCosts(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const { costCategories, costCentres } = options.config;
  const today = options.today ?? new Date();

  report.costs.records.forEach((r, i) => {
    const n = i + 1;
    if (isBlank(r.date)) issues.push(missing("costs", `Costs ${n} - Date`));
    if (isBlank(r.category)) issues.push(missing("costs", `Costs ${n} - Category`));
    else if (costCategories.length > 0 && !costCategories.includes(r.category as never)) {
      issues.push(notApproved("costs", `Costs ${n} - Category`, r.category));
    }
    if (isBlank(r.costCentre)) issues.push(missing("costs", `Costs ${n} - Cost centre`));
    else if (costCentres.length > 0 && !costCentres.includes(r.costCentre)) {
      issues.push(notApproved("costs", `Costs ${n} - Cost centre`, r.costCentre));
    }
    // The amount is the whole point of a cost line. Without it the season total
    // would understate cost and flatter the margin beside it.
    if (r.amount === null) issues.push(missing("costs", `Costs ${n} - Amount`));
    if (isNegative(r.amount)) {
      issues.push(inconsistent("costs", `Costs ${n} - Amount`, "Cost cannot be negative"));
    }
    if (r.date && new Date(r.date).getTime() > today.getTime()) {
      issues.push(inconsistent("costs", `Costs ${n} - Date`, "Cost date is in the future"));
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-section
// ---------------------------------------------------------------------------

function validateCrossSection(report: FarmingReport, options: ValidateFarmingOptions): FarmingValidationIssue[] {
  const issues: FarmingValidationIssue[] = [];
  const today = options.today ?? new Date();

  // Head count per species, from the livestock register. This is the denominator
  // of both the mortality and the disease rate.
  const stockByCategory = new Map<string, number>();
  for (const r of report.livestock.records) {
    if (isBlank(r.category)) continue;
    stockByCategory.set(r.category, (stockByCategory.get(r.category) ?? 0) + (r.headCount ?? 0));
  }
  const totalStock = report.livestock.records.reduce((s, r) => s + (r.headCount ?? 0), 0);

  // The mortality register and the livestock register disagree about the size of
  // a herd. Catch it here, where it is still a data-entry error, rather than
  // letting it produce a mortality rate over 300%.
  report.mortality.records.forEach((r, i) => {
    if (isBlank(r.category) || typeof r.headCount !== "number") return;
    const catStock = stockByCategory.get(r.category);
    if (catStock !== undefined && r.headCount > catStock) {
      issues.push(
        inconsistent(
          "mortality",
          `Mortality ${i + 1} - Head count`,
          `${r.headCount} ${r.category} died, but only ${catStock} head are recorded for that category`
        )
      );
    }
  });

  // A death or a diagnosis before the animal could have been on the farm: a
  // count date later than the event.
  const earliestCount = report.livestock.records
    .map((r) => r.countDate)
    .filter(Boolean)
    .sort()[0];
  report.mortality.records.forEach((r, i) => {
    if (!r.date || !earliestCount) return;
    if (new Date(r.date).getTime() < new Date(earliestCount).getTime()) {
      issues.push(
        inconsistent(
          "mortality",
          `Mortality ${i + 1} - Date`,
          `Death dated ${r.date}, before the earliest livestock count on ${earliestCount}. Check which animal this was.`
        )
      );
    }
  });

  // Deaths recorded with no stock anywhere: the mortality KPI cannot be derived
  // at all, and that KPI is the one a live Board escalation rests on.
  const countedDeaths = report.mortality.records.filter((r) => r.countedInRate).reduce((s, r) => s + (r.headCount ?? 0), 0);
  if (countedDeaths > 0 && totalStock <= 0) {
    issues.push(
      inconsistent(
        "livestock",
        "Head count",
        "Deaths are recorded but no livestock head counts are, so the mortality rate cannot be calculated. Record the stock on hand in the Livestock register."
      )
    );
  }

  // Disease recorded with no stock: the incidence rate has no denominator.
  const diseaseAnimals = report.disease.records.reduce((s, r) => s + (r.headCount ?? 0), 0);
  if (diseaseAnimals > 0 && totalStock <= 0) {
    issues.push(
      inconsistent(
        "livestock",
        "Head count",
        "Disease cases are recorded but no livestock head counts are, so the disease incidence rate cannot be calculated."
      )
    );
  }

  // A disease case that ends in death should also appear in the mortality
  // register. Not fatal - the two registers are kept separately on purpose - but
  // worth naming, because an animal that died of disease recorded only as a
  // disease case inflates recovery and hides the cause.
  const diseaseDeaths = report.disease.records.filter((r) => r.outcome === "Died");
  if (diseaseDeaths.length > 0 && report.mortality.records.length === 0) {
    issues.push(
      inconsistent(
        "mortality",
        "Deaths from disease",
        `${diseaseDeaths.length} disease case(s) ended in death but no mortality records were entered. Record the deaths so the mortality rate and cause breakdown are complete.`
      )
    );
  }

  // Sales lines with no matching production: the farm sold something it does not
  // say it grew. Legitimate for bought-in resale, so this is reported as a note
  // against the section rather than a blocker on the sale itself.
  const products = new Set(report.production.records.map((r) => r.crop).filter(Boolean));
  if (products.size > 0) {
    report.sales.records.forEach((r, i) => {
      if (isBlank(r.product)) return;
      const known = [...products].some((p) => p.toLowerCase() === r.product.toLowerCase());
      if (!known) {
        issues.push(
          inconsistent(
            "sales",
            `Sales ${i + 1} - Product`,
            `"${r.product}" does not appear in the Production register. If it was bought in for resale, note that in the commentary so the revenue is not read as farm production.`
          )
        );
      }
    });
  }

  // A harvest dated before it was planted, or in the future.
  report.production.records.forEach((r, i) => {
    if (!r.plantingDate || !r.harvestDate) return;
    const planted = new Date(r.plantingDate).getTime();
    const harvested = new Date(r.harvestDate).getTime();
    if (Number.isFinite(planted) && Number.isFinite(harvested) && harvested < planted) {
      issues.push(
        inconsistent("production", `Production ${i + 1} - Harvest date`, "Harvest date is before the planting date")
      );
    }
    if (Number.isFinite(harvested) && harvested > today.getTime()) {
      issues.push(inconsistent("production", `Production ${i + 1} - Harvest date`, "Harvest date is in the future"));
    }
  });

  // Sales and cost dates outside the cycle window. A figure from another season
  // in this season's register double-counts it.
  const start = new Date(report.startDate).getTime();
  const due = new Date(report.dueDate).getTime();
  const outOfWindow = (label: string, section: FarmingSectionKey, date: string, index: number) => {
    const t = new Date(date).getTime();
    if (!Number.isFinite(t)) return;
    if (t < start || t > due) {
      issues.push(
        inconsistent(
          section,
          `${label} ${index} - Date`,
          `${date} falls outside this reporting period (${report.startDate} to ${report.dueDate}). Move it to the period it belongs to, or the season totals will double-count it.`
        )
      );
    }
  };
  report.sales.records.forEach((r, i) => {
    if (r.saleDate) outOfWindow("Sales", "sales", r.saleDate, i + 1);
  });
  report.costs.records.forEach((r, i) => {
    if (r.date) outOfWindow("Costs", "costs", r.date, i + 1);
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const SECTION_VALIDATORS: Record<
  FarmingSectionKey,
  (report: FarmingReport, options: ValidateFarmingOptions) => FarmingValidationIssue[]
> = {
  production: validateProduction,
  livestock: validateLivestock,
  mortality: validateMortality,
  disease: validateDisease,
  water: validateWater,
  sales: validateSales,
  costs: validateCosts,
};

function isNotApplicable(report: FarmingReport, key: FarmingSectionKey): boolean {
  switch (key) {
    case "production":
      return report.production.notApplicable;
    case "livestock":
      return report.livestock.notApplicable;
    case "mortality":
      return report.mortality.notApplicable;
    case "disease":
      return report.disease.notApplicable;
    case "water":
      return report.water.notApplicable;
    case "sales":
      return report.sales.notApplicable;
    case "costs":
      return report.costs.notApplicable;
  }
}

export function validateFarmingReport(
  report: FarmingReport,
  options: ValidateFarmingOptions
): FarmingValidationResult {
  const bySection = {} as Record<FarmingSectionKey, FarmingSectionValidation>;

  FARMING_SECTION_KEYS.forEach((key) => {
    const issues = SECTION_VALIDATORS[key](report, options);
    bySection[key] = {
      state: issues.length > 0 ? "incomplete" : isNotApplicable(report, key) ? "not_applicable" : "complete",
      issues,
    };
  });

  // Cross-section issues are attributed to the section they concern, so the
  // progress strip reflects them too.
  for (const issue of validateCrossSection(report, options)) {
    bySection[issue.section].issues.push(issue);
    if (bySection[issue.section].state === "complete") bySection[issue.section].state = "incomplete";
  }

  const issues = Object.values(bySection).flatMap((s) => s.issues);
  return { valid: issues.length === 0, issues, bySection };
}

/** Issues grouped by section, for the refusal panel. */
export function summariseFarmingIssues(
  issues: FarmingValidationIssue[]
): { section: FarmingSectionKey; label: string; lines: string[] }[] {
  const grouped = new Map<FarmingSectionKey, string[]>();
  for (const i of issues) {
    const list = grouped.get(i.section) ?? [];
    list.push(`${i.field} - ${i.message}`);
    grouped.set(i.section, list);
  }
  return [...grouped.entries()].map(([section, lines]) => ({
    section,
    label: FARMING_SECTION_LABELS[section],
    lines,
  }));
}