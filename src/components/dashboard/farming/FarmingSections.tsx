import {
  Checkbox,
  Fieldset,
  NumberField,
  Readout,
  RecordTable,
  SelectField,
  TextArea,
  TextField,
} from "../RegisterFields";
import { NoDataNote, NotApplicableToggle, SourceTag, WarningPreview } from "../RegisterChrome";
import type { Kpi } from "../../../types";
import type {
  CostRecord,
  DiseaseRecord,
  FarmingCostsData,
  FarmingConfig,
  FarmingDataSource,
  FarmingDiseaseData,
  FarmingLivestockData,
  FarmingMortalityData,
  FarmingProductionData,
  FarmingReport,
  FarmingSalesData,
  FarmingWaterData,
  LivestockRecord,
  MortalityRecord,
  ProductionRecord,
  SalesRecord,
  WaterRecord,
} from "../../../types/farming";
import {
  FARMING_KPI_IDS,
  blankCostRecord,
  blankDiseaseRecord,
  blankLivestockRecord,
  blankMortalityRecord,
  blankProductionRecord,
  blankSalesRecord,
  blankWaterRecord,
} from "../../../data/farmingSeed";
import {
  previewFarmingStatus,
  summariseCosts,
  summariseDisease,
  summariseLivestock,
  summariseMortality,
  summariseProduction,
  summariseSales,
  summariseWater,
} from "../../../data/farmingEngine";

/**
 * The seven Commercial Farming registers.
 *
 * Every section follows the same shape, and the shape is the point:
 *
 *  - The manager types what HAPPENED (heads, kilograms, dates, rand). Nothing
 *    derived is typeable. There is no mortality rate input, no total revenue
 *    input, no feed-cost-ratio input anywhere in this file, because a typed rate
 *    and the register behind it can disagree and then nobody can tell which one
 *    the board was shown.
 *
 *  - Each section shows what the engine derived from the rows just typed, so a
 *    mistake is visible before submission rather than after.
 *
 *  - Each section carries its own Not Applicable switch. An empty section blocks
 *    submission; a marked one does not. "We had no livestock this season" and
 *    "nobody filled this in" are different facts and the farm must be able to
 *    say the first one.
 *
 *  - Each section closes with the live Early Warning preview, computed by the
 *    farming engine, so what the manager is warned about is what submission will
 *    actually do.
 */

/** Ids for newly typed rows. A timestamp alone would collide when two rows are
 *  added in the same millisecond, which a fast operator can do. */
function uid(): string {
  return `farm-rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "Not derivable yet" : `${v.toFixed(1)}%`;
const count = (v: number | null | undefined) =>
  v === null || v === undefined ? "None recorded" : v.toLocaleString("en-ZA");
const money = (v: number | null | undefined, symbol: string) =>
  v === null || v === undefined ? "Not derivable yet" : `${symbol}${Math.round(v).toLocaleString("en-ZA")}`;
/** A quantity is only shown with its unit, because a bare number is not a
 *  measurement. Where units differ, the reader is told so rather than shown a
 *  total that does not exist. */
const qty = (v: number | null | undefined, unit: string | null) =>
  v === null || v === undefined ? "Not derivable yet" : unit ? `${v.toLocaleString("en-ZA")} ${unit}` : "No unit recorded";

function Commentary({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <TextArea
      label="Section commentary"
      value={value}
      onChange={onChange}
      hint={hint}
      rows={2}
      placeholder="What a reader needs to know about this season"
    />
  );
}

/** The provenance tag every section carries. Commercial Farming works from
 *  manual entry only: there is no meter feed and no sale till system behind
 *  these figures, and a reader who assumes otherwise will draw different
 *  conclusions from a season-old number. */
function FarmingSourceTag({ source, reportingPeriod }: { source: FarmingDataSource; reportingPeriod: string }) {
  const failed = Boolean(source.failureReason);
  return (
    <SourceTag
      kind={failed ? "Import failed" : source.kind === "Manual Entry" ? "Manual entry" : "Not submitted"}
      period={reportingPeriod}
      detail={
        failed
          ? source.failureReason
          : source.enteredAt
            ? `Entered ${new Date(source.enteredAt).toLocaleDateString("en-ZA")}${source.enteredBy ? ` by ${source.enteredBy}` : ""}`
            : undefined
      }
      footnote="Not a live meter, sales or veterinary feed"
    />
  );
}

function FarmingWarningPreview({
  items,
  config,
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string; label?: string }[];
  config: FarmingConfig;
}) {
  return <WarningPreview items={items} previewStatus={previewFarmingStatus} currencySymbol={config.currencySymbol} />;
}

/** Feed as a share of total cost. Derived the same way the engine derives it,
 *  so the preview cannot disagree with what submission will record. */
function feedCostRatioPct(summary: ReturnType<typeof summariseCosts>): number | null {
  const feed = summary?.feedAmount;
  const total = summary?.total;
  if (feed === null || feed === undefined || total === null || total === undefined || total <= 0) return null;
  return (feed / total) * 100;
}

function NotApplicable({
  checked,
  onChange,
  what,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  what: string;
}) {
  return <NotApplicableToggle checked={checked} onChange={onChange} what={what} />;
}

// ---------------------------------------------------------------------------
// Section 1 - Production
// ---------------------------------------------------------------------------

export function ProductionSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingProductionData;
  onChange: (data: FarmingProductionData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseProduction(report);
  const update = (id: string, patch: Partial<ProductionRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Production reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Production"
          reason="Marked Not Applicable. No production KPI will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Crop register (typed)"
            description="One row per planting. A yield needs its unit, and losses are recorded apart from yield so a good harvest that spoiled is not read as a bad harvest."
          >
            <RecordTable<ProductionRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankProductionRecord(), id: uid() }] })}
              addLabel="Add crop record"
              emptyText="No crops recorded. Harvest volume and area under production come from this table."
              columns={[
                {
                  key: "crop",
                  label: "Crop",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Crop"
                      value={row.crop}
                      options={config.crops}
                      onChange={(v) => patch({ crop: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "plot",
                  label: "Plot",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Plot"
                      value={row.plot}
                      options={config.plots}
                      onChange={(v) => patch({ plot: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "plantingDate",
                  label: "Planted",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Planting date"
                      type="date"
                      value={row.plantingDate}
                      onChange={(v) => patch({ plantingDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "areaHa",
                  label: "Area",
                  render: (row, patch) => (
                    <NumberField
                      label="Area"
                      value={row.areaHa}
                      onChange={(v) => patch({ areaHa: v } as never)}
                      suffix="ha"
                      step="0.01"
                      hint="Hectares planted"
                    />
                  ),
                },
                {
                  key: "harvestDate",
                  label: "Harvested",
                  render: (row, patch) => (
                    <TextField
                      label="Harvest date"
                      type="date"
                      value={row.harvestDate}
                      onChange={(v) => patch({ harvestDate: v } as never)}
                      hint="Blank while still standing"
                    />
                  ),
                },
                {
                  key: "yieldQuantity",
                  label: "Yield",
                  render: (row, patch) => (
                    <NumberField
                      label="Yield quantity"
                      value={row.yieldQuantity}
                      onChange={(v) => patch({ yieldQuantity: v } as never)}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "yieldUnit",
                  label: "Yield unit",
                  render: (row, patch) => (
                    <TextField
                      label="Yield unit"
                      value={row.yieldUnit}
                      onChange={(v) => patch({ yieldUnit: v } as never)}
                      placeholder="kg, tonnes, crates"
                      hint="Required with a yield"
                    />
                  ),
                },
                {
                  key: "lossQuantity",
                  label: "Loss",
                  render: (row, patch) => (
                    <NumberField
                      label="Loss quantity"
                      value={row.lossQuantity}
                      onChange={(v) => patch({ lossQuantity: v } as never)}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "lossReason",
                  label: "Loss reason",
                  render: (row, patch) => (
                    <TextField
                      label="Loss reason"
                      value={row.lossReason}
                      onChange={(v) => patch({ lossReason: v } as never)}
                      hint="Required with a loss"
                    />
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (row, patch) => (
                    <TextField label="Notes" value={row.notes} onChange={(v) => patch({ notes: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Harvest volume"
                value={qty(summary?.totalQuantity ?? null, summary?.totalUnit ?? null)}
                hint={
                  summary && summary.unitsPresent.length > 1
                    ? `Mixed units: ${summary.unitsPresent.join(", ")} - not totalled`
                    : "Totalled only when every harvest shares one unit"
                }
              />
              <Readout
                label="Area under production"
                value={
                  summary?.totalAreaHa === null || summary?.totalAreaHa === undefined
                    ? "Not derivable yet"
                    : `${summary.totalAreaHa.toLocaleString("en-ZA")} ha`
                }
              />
              <Readout label="Crops harvested" value={count(summary?.harvested ?? null)} />
              <Readout
                label="Still standing"
                value={count(summary?.standing ?? null)}
                hint="Planted, not yet harvested - not a failure"
              />
            </div>
            {summary && summary.unmeasured > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.unmeasured} harvest(s) recorded a quantity with no unit. They are excluded from every
                total until the unit is given.
              </p>
            )}
            {summary && summary.unitsPresent.length > 1 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Harvests are in more than one unit ({summary.unitsPresent.join(", ")}), so no total volume is
                derived. Totalling them would produce a number that means nothing.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.production),
                value: summary?.totalQuantity ?? null,
                emptyNote: "No harvested crop with a quantity and unit recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any losses, any standing crop, and why units differ if they do."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 - Livestock
// ---------------------------------------------------------------------------

export function LivestockSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingLivestockData;
  onChange: (data: FarmingLivestockData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseLivestock(report);
  const update = (id: string, patch: Partial<LivestockRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Livestock reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Livestock"
          reason="Marked Not Applicable. No stock denominator will exist, so the mortality and disease rates cannot be derived."
        />
      ) : (
        <>
          <Fieldset
            title="Livestock register (typed)"
            description="A count date is required on every row: this register is the denominator of both the mortality rate and the disease incidence rate, and a stock figure without a date cannot be used as one."
          >
            <RecordTable<LivestockRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankLivestockRecord(), id: uid() }] })}
              addLabel="Add livestock count"
              emptyText="No livestock recorded. Mortality rate and disease incidence both need this table before they can be calculated at all."
              columns={[
                {
                  key: "category",
                  label: "Category",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Category"
                      value={row.category}
                      options={config.livestockCategories}
                      onChange={(v) => patch({ category: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "breed",
                  label: "Breed",
                  render: (row, patch) => (
                    <TextField label="Breed" value={row.breed} onChange={(v) => patch({ breed: v } as never)} />
                  ),
                },
                {
                  key: "countDate",
                  label: "Count date",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Count date"
                      type="date"
                      value={row.countDate}
                      onChange={(v) => patch({ countDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "headCount",
                  label: "Head",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Head on hand"
                      value={row.headCount}
                      onChange={(v) => patch({ headCount: v } as never)}
                      hint="The rate denominator"
                    />
                  ),
                },
                {
                  key: "breedingFemales",
                  label: "Breeding females",
                  render: (row, patch) => (
                    <NumberField
                      label="Breeding females"
                      value={row.breedingFemales}
                      onChange={(v) => patch({ breedingFemales: v } as never)}
                    />
                  ),
                },
                {
                  key: "additions",
                  label: "Additions",
                  render: (row, patch) => (
                    <NumberField
                      label="Additions"
                      value={row.additions}
                      onChange={(v) => patch({ additions: v } as never)}
                      hint="Bought in or born"
                    />
                  ),
                },
                {
                  key: "soldOrRemoved",
                  label: "Sold / removed",
                  render: (row, patch) => (
                    <NumberField
                      label="Sold or removed"
                      value={row.soldOrRemoved}
                      onChange={(v) => patch({ soldOrRemoved: v } as never)}
                      hint="Kept apart from deaths"
                    />
                  ),
                },
                {
                  key: "location",
                  label: "Location",
                  render: (row, patch) => (
                    <TextField
                      label="Location"
                      value={row.location}
                      onChange={(v) => patch({ location: v } as never)}
                    />
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (row, patch) => (
                    <TextField label="Notes" value={row.notes} onChange={(v) => patch({ notes: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Head on hand"
                value={count(summary?.totalHead ?? null)}
                hint={
                  summary?.asAtDate
                    ? `Latest count per group, as at ${new Date(summary.asAtDate).toLocaleDateString("en-ZA")}`
                    : "Latest count per group"
                }
              />
              <Readout label="Additions" value={count(summary?.additions ?? null)} hint="Bought in or born" />
              <Readout
                label="Sold or removed"
                value={count(summary?.removedForSale ?? null)}
                hint="Deliberate sales, not deaths"
              />
              <Readout label="Groups recorded" value={count(summary?.byCategory.length ?? null)} />
            </div>
            {!summary && (
              <p className="mt-2 text-[11px] text-ink-soft/45">
                No livestock counts recorded, so the mortality rate and the disease incidence rate have no
                denominator and cannot be derived at all.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.livestock),
                value: summary?.totalHead ?? null,
                emptyNote: "No livestock counts recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any buying, selling or herd change during the season."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3 - Mortality
// ---------------------------------------------------------------------------

export function MortalitySection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingMortalityData;
  onChange: (data: FarmingMortalityData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseMortality(report, config);
  const update = (id: string, patch: Partial<MortalityRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Mortality reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Mortality"
          reason="Marked Not Applicable. The mortality rate will not be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Mortality register (typed)"
            description="The rate is derived from these deaths and the Livestock register, never typed. Unconfirmed deaths can be recorded but left out of the rate."
          >
            <RecordTable<MortalityRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankMortalityRecord(), id: uid() }] })}
              addLabel="Add mortality record"
              emptyText="No deaths recorded. That is a good season, not missing data - but say so here rather than leaving the section empty."
              columns={[
                {
                  key: "category",
                  label: "Category",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Category"
                      value={row.category}
                      options={config.livestockCategories}
                      onChange={(v) => patch({ category: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "date",
                  label: "Date",
                  required: true,
                  render: (row, patch) => (
                    <TextField label="Date" type="date" value={row.date} onChange={(v) => patch({ date: v } as never)} />
                  ),
                },
                {
                  key: "headCount",
                  label: "Deaths",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Head lost"
                      value={row.headCount}
                      onChange={(v) => patch({ headCount: v } as never)}
                    />
                  ),
                },
                {
                  key: "cause",
                  label: "Cause",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Cause"
                      value={row.cause}
                      options={config.mortalityCauses}
                      onChange={(v) => patch({ cause: v } as never)}
                      blankLabel="Not recorded"
                    />
                  ),
                },
                {
                  key: "causeDetail",
                  label: "Cause detail",
                  render: (row, patch) => (
                    <TextField
                      label="Cause detail"
                      value={row.causeDetail}
                      onChange={(v) => patch({ causeDetail: v } as never)}
                    />
                  ),
                },
                {
                  key: "postMortemDone",
                  label: "Post-mortem",
                  render: (row, patch) => (
                    <Checkbox
                      label="Post-mortem performed"
                      checked={row.postMortemDone}
                      onChange={(v) => patch({ postMortemDone: v } as never)}
                      hint="Without one the cause stays a guess"
                    />
                  ),
                },
                {
                  key: "countedInRate",
                  label: "In rate",
                  render: (row, patch) => (
                    <Checkbox
                      label="Include in the reported rate"
                      checked={row.countedInRate}
                      onChange={(v) => patch({ countedInRate: v } as never)}
                      hint="Tick only confirmed deaths"
                    />
                  ),
                },
                {
                  key: "disposalMethod",
                  label: "Disposal",
                  render: (row, patch) => (
                    <TextField
                      label="Disposal method"
                      value={row.disposalMethod}
                      onChange={(v) => patch({ disposalMethod: v } as never)}
                    />
                  ),
                },
                {
                  key: "reportedBy",
                  label: "Reported by",
                  render: (row, patch) => (
                    <TextField
                      label="Reported by"
                      value={row.reportedBy}
                      onChange={(v) => patch({ reportedBy: v } as never)}
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Mortality rate"
                value={pct(summary?.ratePct ?? null)}
                hint="Counted deaths over head on hand"
              />
              <Readout
                label="Deaths counted"
                value={count(summary?.counted ?? null)}
                hint={
                  summary && summary.excluded > 0
                    ? `${summary.excluded} excluded as unconfirmed`
                    : "All recorded deaths are in the rate"
                }
              />
              <Readout
                label="Without post-mortem"
                value={count(summary?.withoutPostMortem ?? null)}
                hint="The biosecurity gap"
              />
              <Readout
                label="Cause unknown"
                value={count(summary?.unknownCause ?? null)}
                hint="Deaths the farm cannot explain"
              />
            </div>
            {summary && !summary.byCategory.some((c) => c.ratePct !== null) && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Deaths are recorded but no livestock counts are, so there is no denominator and no rate can be
                calculated.
              </p>
            )}
            {summary && summary.withoutPostMortem > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.withoutPostMortem} death(s) had no post-mortem, so the cause breakdown above is a
                report of what was observed rather than a diagnosis.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.mortality),
                value: summary?.ratePct ?? null,
                emptyNote: "No confirmed deaths recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any cluster of deaths, and anything done about it."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4 - Disease
// ---------------------------------------------------------------------------

export function DiseaseSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingDiseaseData;
  onChange: (data: FarmingDiseaseData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseDisease(report);
  const update = (id: string, patch: Partial<DiseaseRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Disease reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Disease"
          reason="Marked Not Applicable. No disease incidence rate will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Disease register (typed)"
            description="A confirmed diagnosis and an unconfirmed suspicion are recorded differently, because they are different claims. Incidence is derived from these cases against the Livestock register."
          >
            <RecordTable<DiseaseRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankDiseaseRecord(), id: uid() }] })}
              addLabel="Add disease case"
              emptyText="No disease cases recorded. No outbreaks this season is worth stating here."
              columns={[
                {
                  key: "category",
                  label: "Category",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Category"
                      value={row.category}
                      options={config.livestockCategories}
                      onChange={(v) => patch({ category: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "onsetDate",
                  label: "Onset",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Onset date"
                      type="date"
                      value={row.onsetDate}
                      onChange={(v) => patch({ onsetDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "disease",
                  label: "Disease",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Disease"
                      value={row.disease}
                      options={config.diseases}
                      onChange={(v) => patch({ disease: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "headCount",
                  label: "Affected",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Animals affected"
                      value={row.headCount}
                      onChange={(v) => patch({ headCount: v } as never)}
                    />
                  ),
                },
                {
                  key: "diagnosisConfirmed",
                  label: "Confirmed",
                  render: (row, patch) => (
                    <Checkbox
                      label="Diagnosis confirmed"
                      checked={row.diagnosisConfirmed}
                      onChange={(v) => patch({ diagnosisConfirmed: v } as never)}
                    />
                  ),
                },
                {
                  key: "outcome",
                  label: "Outcome",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Outcome"
                      value={row.outcome}
                      options={["Recovered", "Died", "Ongoing", "Unknown"] as const}
                      onChange={(v) => patch({ outcome: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
                {
                  key: "treatmentGiven",
                  label: "Treatment",
                  render: (row, patch) => (
                    <TextField
                      label="Treatment given"
                      value={row.treatmentGiven}
                      onChange={(v) => patch({ treatmentGiven: v } as never)}
                    />
                  ),
                },
                {
                  key: "treatmentEndDate",
                  label: "Treatment ended",
                  render: (row, patch) => (
                    <TextField
                      label="Treatment end date"
                      type="date"
                      value={row.treatmentEndDate}
                      onChange={(v) => patch({ treatmentEndDate: v } as never)}
                      hint="Blank if ongoing"
                    />
                  ),
                },
                {
                  key: "vetConsulted",
                  label: "Vet",
                  render: (row, patch) => (
                    <Checkbox
                      label="Veterinarian consulted"
                      checked={row.vetConsulted}
                      onChange={(v) => patch({ vetConsulted: v } as never)}
                    />
                  ),
                },
                {
                  key: "reportedToStateVet",
                  label: "Reported to state vet",
                  render: (row, patch) => (
                    <TextField
                      label="Reported to state vet"
                      type="date"
                      value={row.reportedToStateVet}
                      onChange={(v) => patch({ reportedToStateVet: v } as never)}
                      hint="Where notifiable"
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Incidence rate"
                value={pct(summary?.incidencePct ?? null)}
                hint="Animals affected over head on hand"
              />
              <Readout label="Cases" value={count(summary?.cases ?? null)} />
              <Readout
                label="Confirmed"
                value={count(summary?.confirmedCases ?? null)}
                hint={
                  summary && summary.unconfirmedCases > 0
                    ? `${summary.unconfirmedCases} unconfirmed`
                    : "All cases confirmed"
                }
              />
              <Readout label="Ongoing" value={count(summary?.ongoing ?? null)} />
            </div>
            {summary && summary.notReportedToStateVet > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.notReportedToStateVet} confirmed case(s) were not reported to the state veterinarian.
                That is a compliance gap, not a performance figure.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.diseaseIncidence),
                value: summary?.incidencePct ?? null,
                emptyNote: "No disease cases recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any outbreak, the treatment used and how it ended."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5 - Water
// ---------------------------------------------------------------------------

export function WaterSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingWaterData;
  onChange: (data: FarmingWaterData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseWater(report);
  const update = (id: string, patch: Partial<WaterRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Water reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Water"
          reason="Marked Not Applicable. No abstraction figure will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Water register (typed)"
            description="Meter readings, abstracted volumes and licence references. Licence expiry is captured because an expired abstraction permit is a compliance finding, not a filing detail."
          >
            <RecordTable<WaterRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankWaterRecord(), id: uid() }] })}
              addLabel="Add water reading"
              emptyText="No water readings recorded. Abstraction volume comes from this table."
              columns={[
                {
                  key: "source",
                  label: "Source",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Source"
                      value={row.source}
                      options={config.waterSources}
                      onChange={(v) => patch({ source: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "readingDate",
                  label: "Reading date",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Reading date"
                      type="date"
                      value={row.readingDate}
                      onChange={(v) => patch({ readingDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "volumeUsed",
                  label: "Volume",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Volume used"
                      value={row.volumeUsed}
                      onChange={(v) => patch({ volumeUsed: v } as never)}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "volumeUnit",
                  label: "Volume unit",
                  render: (row, patch) => (
                    <TextField
                      label="Volume unit"
                      value={row.volumeUnit}
                      onChange={(v) => patch({ volumeUnit: v } as never)}
                      placeholder="m3, litres, ML"
                      hint="Required with a volume"
                    />
                  ),
                },
                {
                  key: "use",
                  label: "Use",
                  render: (row, patch) => (
                    <TextField
                      label="Main use"
                      value={row.use}
                      onChange={(v) => patch({ use: v } as never)}
                      placeholder="Irrigation, livestock drinking"
                    />
                  ),
                },
                {
                  key: "meterPoint",
                  label: "Meter",
                  render: (row, patch) => (
                    <TextField
                      label="Meter point"
                      value={row.meterPoint}
                      onChange={(v) => patch({ meterPoint: v } as never)}
                    />
                  ),
                },
                {
                  key: "licenceReference",
                  label: "Licence",
                  render: (row, patch) => (
                    <TextField
                      label="Licence reference"
                      value={row.licenceReference}
                      onChange={(v) => patch({ licenceReference: v } as never)}
                    />
                  ),
                },
                {
                  key: "licenceExpiry",
                  label: "Licence expiry",
                  render: (row, patch) => (
                    <TextField
                      label="Licence expiry"
                      type="date"
                      value={row.licenceExpiry}
                      onChange={(v) => patch({ licenceExpiry: v } as never)}
                    />
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (row, patch) => (
                    <TextField label="Notes" value={row.notes} onChange={(v) => patch({ notes: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Total abstracted"
                value={qty(summary?.totalVolume ?? null, summary?.totalUnit ?? null)}
                hint={
                  summary && summary.unitsPresent.length > 1
                    ? `Mixed units: ${summary.unitsPresent.join(", ")} - not totalled`
                    : "Totalled only when every reading shares one unit"
                }
              />
              <Readout label="Readings" value={count(summary?.records ?? null)} />
              <Readout
                label="Expired licences"
                value={count(summary?.expiredLicences ?? null)}
                hint="Compliance finding"
              />
              <Readout
                label="Unlicensed abstraction"
                value={count(summary?.unlicensed ?? null)}
                hint="No licence reference recorded"
              />
            </div>
            {summary && summary.expiredLicences > 0 && (
              <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
                {summary.expiredLicences} water licence(s) have passed their expiry date.
              </p>
            )}
            {summary && summary.unitsPresent.length > 1 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Volumes are in more than one unit ({summary.unitsPresent.join(", ")}), so no total is derived.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.waterUse),
                value: summary?.totalVolume ?? null,
                emptyNote: "No water volumes recorded.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any dry-season rationing, borehole failure or licence renewal."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 6 - Sales
// ---------------------------------------------------------------------------

export function SalesSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingSalesData;
  onChange: (data: FarmingSalesData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseSales(report);
  const update = (id: string, patch: Partial<SalesRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Sales reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Sales"
          reason="Marked Not Applicable. No revenue figure will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Sales register (typed)"
            description="Quantity and unit price only. Revenue is quantity times price, calculated by the engine. A line with no price is a real sale of unknown value, so it is recorded and left out of the total rather than valued at zero."
          >
            <RecordTable<SalesRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankSalesRecord(), id: uid() }] })}
              addLabel="Add sale"
              emptyText="No sales recorded. Farm revenue comes from this table."
              columns={[
                {
                  key: "saleDate",
                  label: "Date",
                  required: true,
                  render: (row, patch) => (
                    <TextField
                      label="Sale date"
                      type="date"
                      value={row.saleDate}
                      onChange={(v) => patch({ saleDate: v } as never)}
                    />
                  ),
                },
                {
                  key: "product",
                  label: "Product",
                  required: true,
                  render: (row, patch) => (
                    <TextField label="Product" value={row.product} onChange={(v) => patch({ product: v } as never)} />
                  ),
                },
                {
                  key: "channel",
                  label: "Channel",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Channel"
                      value={row.channel}
                      options={config.salesChannels}
                      onChange={(v) => patch({ channel: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "quantity",
                  label: "Quantity",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Quantity"
                      value={row.quantity}
                      onChange={(v) => patch({ quantity: v } as never)}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "unit",
                  label: "Unit",
                  render: (row, patch) => (
                    <TextField
                      label="Unit"
                      value={row.unit}
                      onChange={(v) => patch({ unit: v } as never)}
                      placeholder="kg, crate, dozen, head"
                      hint="Required with a quantity"
                    />
                  ),
                },
                {
                  key: "unitPrice",
                  label: "Unit price",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Price per unit"
                      value={row.unitPrice}
                      onChange={(v) => patch({ unitPrice: v } as never)}
                      prefix={config.currencySymbol}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "buyer",
                  label: "Buyer",
                  render: (row, patch) => (
                    <TextField label="Buyer" value={row.buyer} onChange={(v) => patch({ buyer: v } as never)} />
                  ),
                },
                {
                  key: "paymentStatus",
                  label: "Payment",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Payment status"
                      value={row.paymentStatus}
                      options={["Paid", "Outstanding", "Partially paid"] as const}
                      onChange={(v) => patch({ paymentStatus: v } as never)}
                      blankLabel="Not stated"
                    />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Revenue"
                value={money(summary?.revenue ?? null, config.currencySymbol)}
                hint="Quantity times price, per line"
              />
              <Readout
                label="Volume sold"
                value={qty(summary?.volume ?? null, summary?.volumeUnit ?? null)}
                hint={
                  summary && summary.unitsPresent.length > 1
                    ? `Mixed units: ${summary.unitsPresent.join(", ")} - not totalled`
                    : "Only when every line shares one unit"
                }
              />
              <Readout
                label="Outstanding"
                value={money(summary?.outstandingValue ?? null, config.currencySymbol)}
                hint="Sold but not yet paid"
              />
              <Readout label="Lines" value={count(summary?.lines ?? null)} />
            </div>
            {summary && summary.unpriced > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.unpriced} sale(s) have no unit price, so they are excluded from the revenue total. The
                figure above is understated by whatever those are worth.
              </p>
            )}
            {summary && summary.unitsPresent.length > 1 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Quantities are in more than one unit ({summary.unitsPresent.join(", ")}), so no sales volume is
                derived. Revenue is still calculated line by line.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.salesVolume),
                value: summary?.volume ?? null,
                emptyNote: "No sales quantities recorded.",
              },
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.farmRevenue),
                value: summary?.revenue ?? null,
                emptyNote: "No priced sales recorded, so no revenue can be derived.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any buyer, channel or price change, and any produce bought in to resell."
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 7 - Costs
// ---------------------------------------------------------------------------

export function CostsSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FarmingReport;
  data: FarmingCostsData;
  onChange: (data: FarmingCostsData) => void;
  kpis: Kpi[];
  config: FarmingConfig;
}) {
  const summary = summariseCosts(report);
  const update = (id: string, patch: Partial<CostRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-4">
      <FarmingSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />
      <NotApplicable
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Cost reporting"
      />

      {data.notApplicable ? (
        <NoDataNote
          what="Costs"
          reason="Marked Not Applicable. No cost total will be derived and submission is not blocked."
        />
      ) : (
        <>
          <Fieldset
            title="Cost register (typed)"
            description="One row per cost. The amount is required: a cost line with no amount makes the season total understate cost, which flatters the margin sitting beside it."
          >
            <RecordTable<CostRecord>
              rows={data.records}
              onUpdate={update}
              onRemove={(id) => onChange({ ...data, records: data.records.filter((r) => r.id !== id) })}
              onAdd={() => onChange({ ...data, records: [...data.records, { ...blankCostRecord(), id: uid() }] })}
              addLabel="Add cost"
              emptyText="No costs recorded. Total cost and feed ratio come from this table."
              columns={[
                {
                  key: "date",
                  label: "Date",
                  required: true,
                  render: (row, patch) => (
                    <TextField label="Date" type="date" value={row.date} onChange={(v) => patch({ date: v } as never)} />
                  ),
                },
                {
                  key: "category",
                  label: "Category",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Category"
                      value={row.category}
                      options={config.costCategories}
                      onChange={(v) => patch({ category: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "costCentre",
                  label: "Cost centre",
                  required: true,
                  render: (row, patch) => (
                    <SelectField
                      label="Cost centre"
                      value={row.costCentre}
                      options={config.costCentres}
                      onChange={(v) => patch({ costCentre: v } as never)}
                      blankLabel="Not selected"
                    />
                  ),
                },
                {
                  key: "amount",
                  label: "Amount",
                  required: true,
                  render: (row, patch) => (
                    <NumberField
                      label="Amount"
                      value={row.amount}
                      onChange={(v) => patch({ amount: v } as never)}
                      prefix={config.currencySymbol}
                      step="0.01"
                    />
                  ),
                },
                {
                  key: "supplier",
                  label: "Supplier",
                  render: (row, patch) => (
                    <TextField label="Supplier" value={row.supplier} onChange={(v) => patch({ supplier: v } as never)} />
                  ),
                },
                {
                  key: "reference",
                  label: "Reference",
                  render: (row, patch) => (
                    <TextField
                      label="Reference"
                      value={row.reference}
                      onChange={(v) => patch({ reference: v } as never)}
                      placeholder="Invoice or receipt"
                    />
                  ),
                },
                {
                  key: "paid",
                  label: "Paid",
                  render: (row, patch) => (
                    <Checkbox label="Paid" checked={row.paid} onChange={(v) => patch({ paid: v } as never)} />
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (row, patch) => (
                    <TextField label="Notes" value={row.notes} onChange={(v) => patch({ notes: v } as never)} />
                  ),
                },
              ]}
            />
          </Fieldset>

          <Fieldset title="Derived from this register" description="Calculated by the farming engine.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Readout
                label="Total cost"
                value={money(summary?.total ?? null, config.currencySymbol)}
                hint="Every line with an amount"
              />
              <Readout
                label="Feed"
                value={money(summary?.feedAmount ?? null, config.currencySymbol)}
                hint="Feeds and inputs, for the feed cost ratio"
              />
              <Readout
                label="Unpaid"
                value={money(summary?.unpaidValue ?? null, config.currencySymbol)}
                hint="Incurred but not yet settled"
              />
              <Readout label="Lines" value={count(summary?.lines ?? null)} />
            </div>
            {summary && summary.missingAmount > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {summary.missingAmount} cost line(s) have no amount, so the total above understates what the
                season cost.
              </p>
            )}
          </Fieldset>

          <FarmingWarningPreview
            config={config}
            items={[
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.totalCosts),
                value: summary?.total ?? null,
                emptyNote: "No cost amounts recorded.",
              },
              {
                kpi: kpis.find((k) => k.id === FARMING_KPI_IDS.feedCostRatio),
                value: feedCostRatioPct(summary),
                emptyNote:
                  "The feed cost ratio is a share of total cost, so it needs at least one valued cost line before it can be derived.",
              },
            ]}
          />

          <Commentary
            value={data.commentary}
            onChange={(commentary) => onChange({ ...data, commentary })}
            hint="Explain any cost that moved sharply, and what drove it."
          />
        </>
      )}
    </div>
  );
}