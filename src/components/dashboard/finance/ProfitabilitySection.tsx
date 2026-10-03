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
  FinanceDataQualityNote,
  FinanceNotApplicableToggle,
  FinanceSourceTag,
  FinanceWarningPreview,
  LineReadout,
  Readout,
} from "./FinanceSectionChrome";
import type { Department, Kpi } from "../../../types";
import type {
  ExpenseLine,
  FinanceConfig,
  FinanceProfitabilityData,
  FinanceRevenueData,
  FinanceReport,
} from "../../../types/finance";
import { FINANCE_KPI_IDS, calculateProfitability, formatCurrency } from "../../../data/financeEngine";
import { blankExpenseLine } from "../../../data/financeSeed";

/**
 * Section 21 - Profitability.
 *
 * Only expenses are captured here. Revenue comes from the Revenue section, and
 * the surplus is computed once, here, on the Finance-approved core-operations
 * basis with internal transfers excluded. No other screen derives its own
 * version of this number (Section 39).
 */
export function ProfitabilitySection({
  report,
  data,
  revenue,
  onChange,
  kpis,
  config,
  departmentOptions,
}: {
  report: FinanceReport;
  data: FinanceProfitabilityData;
  revenue: FinanceRevenueData;
  onChange: (data: FinanceProfitabilityData) => void;
  kpis: Kpi[];
  config: FinanceConfig;
  departmentOptions: readonly Department[];
}) {
  const summary = calculateProfitability(revenue, data);

  const update = (id: string, patch: Partial<ExpenseLine>) =>
    onChange({ ...data, expenses: data.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const kpi = (id: string) => kpis.find((k) => k.id === id);

  return (
    <div className="flex flex-col gap-4">
      <FinanceSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <FinanceNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Profitability reporting"
      />

      {data.notApplicable ? (
        <FinEmptyRow text="Profitability marked Not Applicable. No surplus KPI will be derived and submission will not be blocked." />
      ) : (
        <>
          {summary && (
            <FinFieldset
              title="Operating result (calculated)"
              description="Core operations view. Internal transfers are excluded and reported separately."
            >
              <Readout label="Operating revenue" value={formatCurrency(summary.revenue, config.currencySymbol)} />
              <Readout label="Operating expenditure" value={formatCurrency(summary.operatingExpenses, config.currencySymbol)} />
              <Readout
                label="Operating surplus / (deficit)"
                value={formatCurrency(summary.operatingSurplus, config.currencySymbol)}
              />
              <Readout
                label="Operating margin"
                value={summary.operatingMarginPct === null ? "Not derivable" : `${summary.operatingMarginPct.toFixed(1)}%`}
              />
              <Readout
                label="Cost ratio"
                value={summary.costRatioPct === null ? "Not derivable" : `${summary.costRatioPct.toFixed(1)}%`}
              />
              <Readout label="Budgeted surplus" value={formatCurrency(summary.budgetedSurplus, config.currencySymbol)} />
              <Readout
                label="Surplus variance vs budget"
                value={formatCurrency(summary.surplusVariance, config.currencySymbol)}
              />
              <Readout
                label="Previous period surplus"
                value={
                  summary.previousPeriodSurplus === null
                    ? "No prior period figures supplied"
                    : formatCurrency(summary.previousPeriodSurplus, config.currencySymbol)
                }
              />
              <Readout label="Internal transfers (excluded)" value={formatCurrency(summary.transfers, config.currencySymbol)} />
            </FinFieldset>
          )}

          {summary && (
            <FinFieldset
              title="Gross position (calculated)"
              description="Section 21. Gross profit uses only costs classified as direct."
            >
              <Readout label="Direct costs" value={formatCurrency(summary.directExpenses, config.currencySymbol)} />
              <Readout label="Indirect costs / overhead" value={formatCurrency(summary.indirectExpenses, config.currencySymbol)} />
              <Readout
                label="Gross profit"
                value={formatCurrency(summary.grossProfit, config.currencySymbol)}
              />
              <Readout
                label="Gross margin"
                value={summary.grossMarginPct === null ? "Not derivable" : `${summary.grossMarginPct.toFixed(1)}%`}
              />
            </FinFieldset>
          )}

          {summary && summary.grossProfit === null && (
            <FinanceDataQualityNote
              state="Gross profit not reported"
              detail="No expense line has been classified as a direct cost, so gross profit and gross margin cannot be calculated. Classify at least one line as Direct to publish them. Unclassified lines are treated as overhead, and nothing is promoted into a direct cost on Finance's behalf."
            />
          )}

          {summary && !summary.complete && (
            <FinanceDataQualityNote
              state="Surplus cannot be calculated yet"
              detail="A surplus needs both revenue and expenditure. Until both are captured no surplus, no margin and no Executive profitability KPI can be produced - the application will not present half a result as though it were complete."
            />
          )}

          <FinRecordList
            title="Operating expenses"
            description="Actual expenditure by category. Budgets are captured separately in the Budgets section."
            addLabel="Add expense line"
            onAdd={() => onChange({ ...data, expenses: [...data.expenses, blankExpenseLine("")] })}
          >
            {data.expenses.length === 0 ? (
              <FinEmptyRow text="No expense lines yet. Add one, or import the expense sheet from the Budget Monitor workbook." />
            ) : (
              <FinRecordScroll>
                {data.expenses.map((line) => (
                  <FinRecordCard
                    key={line.id}
                    title={line.description || "New expense line"}
                    onRemove={() => onChange({ ...data, expenses: data.expenses.filter((e) => e.id !== line.id) })}
                    removeLabel={`Remove expense line ${line.description || ""}`}
                  >
                    <FinSelectField
                      label="Category"
                      value={line.categoryId}
                      options={config.expenseCategories.map((c) => ({ value: c, label: c }))}
                      onChange={(categoryId) => update(line.id, { categoryId })}
                      required
                    />
                    <FinSelectField
                      label="Cost type"
                      value={line.costType}
                      options={[{ value: "Direct", label: "Direct" }, { value: "Indirect", label: "Indirect" }]}
                      onChange={(costType) => update(line.id, { costType })}
                      placeholder="Unclassified (counted as overhead)"
                      hint="Direct costs feed gross profit. Unclassified lines count as overhead."
                    />
                    <FinTextField label="Description" value={line.description} onChange={(description) => update(line.id, { description })} required />
                    <FinTextField label="Cost centre" value={line.costCentre} onChange={(costCentre) => update(line.id, { costCentre })} />
                    <FinSelectField
                      label="Department"
                      value={line.department}
                      options={departmentOptions}
                      onChange={(department) => update(line.id, { department })}
                    />
                    <FinTextField label="Project" value={line.project} onChange={(project) => update(line.id, { project })} />
                    <FinNumberField label="Budget" value={line.budget} onChange={(budget) => update(line.id, { budget })} prefix={config.currencySymbol} />
                    <FinNumberField label="Actual" value={line.actual} onChange={(actual) => update(line.id, { actual })} prefix={config.currencySymbol} required />
                    <FinNumberField label="Previous period" value={line.previousPeriod} onChange={(previousPeriod) => update(line.id, { previousPeriod })} prefix={config.currencySymbol} />
                    <FinCheckbox
                      label="Internal transfer"
                      checked={line.isTransfer}
                      onChange={(isTransfer) => update(line.id, { isTransfer })}
                      hint="Excluded from the core operations result."
                    />
                    <FinTextField label="Notes" value={line.notes} onChange={(notes) => update(line.id, { notes })} />
                    <div className="sm:col-span-2 lg:col-span-4">
                      <LineReadout
                        label="Derived"
                        text={
                          line.actual === null
                            ? "An actual figure is needed."
                            : line.budget === null
                              ? `Actual ${formatCurrency(line.actual, config.currencySymbol)} with no budget captured, so no variance can be derived.`
                              : `Actual ${formatCurrency(line.actual, config.currencySymbol)} against budget ${formatCurrency(line.budget, config.currencySymbol)}, variance ${formatCurrency(line.budget - line.actual, config.currencySymbol)}.`
                        }
                      />
                    </div>
                  </FinRecordCard>
                ))}
              </FinRecordScroll>
            )}
          </FinRecordList>

          <FinFieldset title="Section commentary">
            <div className="col-span-full">
              <FinTextArea
                label="Profitability commentary"
                rows={3}
                value={data.commentary}
                onChange={(commentary) => onChange({ ...data, commentary })}
                placeholder="Cost drivers, one-off items, unrealised farming results, anything affecting the margin."
              />
            </div>
          </FinFieldset>

          <FinanceWarningPreview
            currencySymbol={config.currencySymbol}
            items={[
              {
                kpi: kpi(FINANCE_KPI_IDS.operatingSurplus),
                value: summary?.operatingSurplus ?? null,
                emptyNote: "Revenue and expense figures are both needed before a surplus exists.",
                label: "Operating surplus / (deficit)",
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.operatingMargin),
                value: summary?.operatingMarginPct ?? null,
                emptyNote: "Revenue and expense figures are both needed before a margin exists.",
                label: "Operating margin",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}