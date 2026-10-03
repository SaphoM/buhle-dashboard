import {
  FinCheckbox,
  FinEmptyRow,
  FinFieldset,
  FinNumberField,
  FinRecordCard,
  FinRecordList,
  FinRecordScroll,
  FinSelectField,
  FinTextArea,
  FinTextField,
} from "./FinanceFields";
import {
  FinanceNotApplicableToggle,
  FinanceSourceTag,
  FinanceWarningPreview,
  LineReadout,
  Readout,
} from "./FinanceSectionChrome";
import type { Kpi } from "../../../types";
import type { FinanceConfig, FinanceReport, FinanceRevenueData, RevenueLine } from "../../../types/finance";
import { FINANCE_KPI_IDS, calculateRevenue, formatCurrency } from "../../../data/financeEngine";
import { blankRevenueLine } from "../../../data/financeSeed";

/**
 * Section 6 - Revenue.
 *
 * Finance types the raw figures (budget, actual, previous period, YTD budget,
 * YTD actual) and the engine derives everything else. Section 7 is explicit
 * that Finance never types a variance or an achievement percentage, so this
 * component renders no percentage input and no editable variance.
 */
export function RevenueSection({
  report,
  data,
  onChange,
  kpis,
  config,
}: {
  report: FinanceReport;
  data: FinanceRevenueData;
  onChange: (data: FinanceRevenueData) => void;
  kpis: Kpi[];
  config: FinanceConfig;
}) {
  const summary = calculateRevenue(data, config.revenueCategories);

  const update = (id: string, patch: Partial<RevenueLine>) =>
    onChange({ ...data, lines: data.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const remove = (id: string) => onChange({ ...data, lines: data.lines.filter((l) => l.id !== id) });

  const kpi = (id: string) => kpis.find((k) => k.id === id);

  return (
    <div className="flex flex-col gap-4">
      <FinanceSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <FinanceNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Revenue reporting"
      />

      {data.notApplicable ? (
        <FinEmptyRow text="Revenue marked Not Applicable for this period. No revenue KPI will be derived and submission will not be blocked." />
      ) : (
        <>
          {summary && (
            <FinFieldset title="Revenue totals (calculated)" description="Derived by the Finance engine. These are never typed by Finance.">
              <Readout label="Budgeted revenue" value={formatCurrency(summary.budget, config.currencySymbol)} />
              <Readout label="Actual revenue" value={formatCurrency(summary.currentPeriodRevenue, config.currencySymbol)} />
              <Readout label="Variance" value={formatCurrency(summary.variance, config.currencySymbol)} />
              <Readout label="Achievement" value={summary.achievementPct === null ? "Not derivable" : `${summary.achievementPct.toFixed(1)}%`} />
              <Readout label="Growth vs previous period" value={summary.growthPct === null ? "No prior period supplied" : `${summary.growthPct.toFixed(1)}%`} />
              <Readout label="Donor / funder income" value={formatCurrency(summary.donorFunding, config.currencySymbol)} />
              <Readout label="Commercial farming income" value={formatCurrency(summary.farmingRevenue, config.currencySymbol)} />
              <Readout label="Internal transfers (excluded from surplus)" value={formatCurrency(summary.transferAmount, config.currencySymbol)} />
              <Readout label="Revenue lines counted" value={String(summary.lineCount)} />
            </FinFieldset>
          )}

          <FinRecordList
            title="Revenue lines"
            description="One line per income source. Mark internal transfers so they stay out of the core operations surplus."
            addLabel="Add revenue line"
            onAdd={() =>
              onChange({
                ...data,
                lines: [...data.lines, blankRevenueLine(config.revenueCategories[0]?.id ?? "other")],
              })
            }
          >
            {data.lines.length === 0 ? (
              <FinEmptyRow text="No revenue lines yet. Add one, or import the revenue sheet from the Budget Monitor workbook." />
            ) : (
              <FinRecordScroll>
                {data.lines.map((line) => {
                  const category = config.revenueCategories.find((c) => c.id === line.categoryId);
                  return (
                    <FinRecordCard
                      key={line.id}
                      title={line.description || line.counterparty || "New revenue line"}
                      onRemove={() => remove(line.id)}
                      removeLabel={`Remove revenue line ${line.description || ""}`}
                    >
                      <FinSelectField
                        label="Category"
                        value={line.categoryId}
                        options={config.revenueCategories.map((c) => ({ value: c.id, label: c.label }))}
                        onChange={(categoryId) => update(line.id, { categoryId })}
                        required
                      />
                      <FinTextField label="Description" value={line.description} onChange={(description) => update(line.id, { description })} required />
                      <FinTextField label="Customer / funder" value={line.counterparty} onChange={(counterparty) => update(line.id, { counterparty })} />
                      <FinTextField label="Cost centre" value={line.costCentre} onChange={(costCentre) => update(line.id, { costCentre })} />
                      <FinTextField label="Project" value={line.project} onChange={(project) => update(line.id, { project })} />
                      <FinTextField label="Programme / course" value={line.programme} onChange={(programme) => update(line.id, { programme })} hint="Optional" />
                      <FinNumberField label="Budget" value={line.budget} onChange={(budget) => update(line.id, { budget })} prefix={config.currencySymbol} required />
                      <FinNumberField label="Actual" value={line.actual} onChange={(actual) => update(line.id, { actual })} prefix={config.currencySymbol} required />
                      <FinNumberField label="Previous period" value={line.previousPeriod} onChange={(previousPeriod) => update(line.id, { previousPeriod })} prefix={config.currencySymbol} />
                      <FinNumberField label="YTD budget" value={line.ytdBudget} onChange={(ytdBudget) => update(line.id, { ytdBudget })} prefix={config.currencySymbol} />
                      <FinNumberField label="YTD actual" value={line.ytdActual} onChange={(ytdActual) => update(line.id, { ytdActual })} prefix={config.currencySymbol} />
                      <FinCheckbox
                        label="Internal transfer"
                        checked={line.isTransfer}
                        onChange={(isTransfer) => update(line.id, { isTransfer })}
                        hint="Excluded from the core operations surplus and from external revenue."
                      />
                      <FinTextField label="Notes" value={line.notes} onChange={(notes) => update(line.id, { notes })} />
                      <div className="sm:col-span-2 lg:col-span-4">
                        <LineReadout
                          label={`Derived for ${category?.label ?? "this line"}`}
                          text={
                            line.actual === null || line.budget === null
                              ? "Budget and actual are both needed to derive a variance."
                              : `Variance ${formatCurrency(line.budget - line.actual, config.currencySymbol)} against budget of ${formatCurrency(line.budget, config.currencySymbol)}.`
                          }
                        />
                      </div>
                    </FinRecordCard>
                  );
                })}
              </FinRecordScroll>
            )}
          </FinRecordList>

          <FinFieldset title="Section commentary">
            <div className="col-span-full">
              <FinTextArea
                label="Revenue commentary"
                rows={3}
                value={data.commentary}
                onChange={(commentary) => onChange({ ...data, commentary })}
                placeholder="Material variances, new or lost income streams, funding decisions pending."
              />
            </div>
          </FinFieldset>

          <FinanceWarningPreview
            currencySymbol={config.currencySymbol}
            items={[
              {
                kpi: kpi(FINANCE_KPI_IDS.revenue),
                value: summary?.currentPeriodRevenue ?? null,
                emptyNote: "No revenue lines supplied yet.",
                label: "Total revenue",
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.donorFunding),
                value: summary?.donorFunding ?? null,
                emptyNote: "No donor or funder lines supplied yet.",
                label: "Donor / funder funding",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}