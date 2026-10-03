import {
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
import type { BudgetLine, BudgetStatus, FinanceBudgetData, FinanceConfig, FinanceReport } from "../../../types/finance";
import { FINANCE_KPI_IDS, calculateBudgets, formatCurrency } from "../../../data/financeEngine";
import { blankBudgetLine } from "../../../data/financeSeed";

const STATUSES: BudgetStatus[] = ["Approved", "Revised", "Pending Revision"];

/**
 * Section 12 & 13 - Budgets.
 *
 * Line-item budget monitoring with the workbook's own arithmetic preserved
 * (Section 13). The one judgement call the specification hands to Finance -
 * whether committed spend eats into remaining budget - is surfaced as an
 * explicit, recorded toggle on this section rather than being decided in code,
 * because the two conventions produce materially different warnings.
 */
export function BudgetsSection({
  report,
  data,
  onChange,
  kpis,
  config,
  departmentOptions,
}: {
  report: FinanceReport;
  data: FinanceBudgetData;
  onChange: (data: FinanceBudgetData) => void;
  kpis: Kpi[];
  config: FinanceConfig;
  departmentOptions: readonly Department[];
}) {
  const summary = calculateBudgets(data);

  const update = (id: string, patch: Partial<BudgetLine>) =>
    onChange({ ...data, lines: data.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const kpi = (id: string) => kpis.find((k) => k.id === id);

  return (
    <div className="flex flex-col gap-4">
      <FinanceSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <FinanceNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Budget monitoring"
      />

      {data.notApplicable ? (
        <FinEmptyRow text="Budgets marked Not Applicable. No budget KPI will be derived and submission will not be blocked." />
      ) : (
        <>
          <FinFieldset
            title="Remaining budget calculation"
            description="Section 13 requires the workbook's approved method to be preserved, not replaced."
          >
            <div className="col-span-full">
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={data.committedCountsAgainstBudget}
                  onChange={(e) => onChange({ ...data, committedCountsAgainstBudget: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-ink/20 accent-ink"
                />
                <span>
                  <span className="text-xs font-semibold text-ink-soft/70">
                    Committed expenditure reduces remaining budget
                  </span>
                  <span className="block text-[11px] text-ink-soft/45">
                    On: remaining = budget - actual - committed. Off: remaining = budget - actual, with
                    committed reported alongside. This must match the Budget Monitor workbook - Finance has not
                    confirmed its convention yet, so this is recorded as an explicit decision.
                  </span>
                </span>
              </label>
            </div>
          </FinFieldset>

          {summary && (
            <FinFieldset title="Budget totals (calculated)">
              <Readout label="Total budget in force" value={formatCurrency(summary.totalBudget, config.currencySymbol)} />
              <Readout label="Total actual expenditure" value={formatCurrency(summary.totalActual, config.currencySymbol)} />
              <Readout label="Total committed" value={formatCurrency(summary.totalCommitted, config.currencySymbol)} />
              <Readout label="Total remaining" value={formatCurrency(summary.totalRemaining, config.currencySymbol)} />
              <Readout
                label="Portfolio utilisation"
                value={summary.utilisationPct === null ? "Not derivable" : `${summary.utilisationPct.toFixed(1)}%`}
              />
              <Readout
                label="Tightest remaining line"
                value={
                  summary.lowestRemaining
                    ? `${summary.lowestRemaining.label}: ${formatCurrency(summary.lowestRemaining.remaining, config.currencySymbol)}`
                    : "No line has a remaining balance yet"
                }
              />
            </FinFieldset>
          )}

          {(summary?.overspentLines.length ?? 0) > 0 && (
            <FinanceDataQualityNote
              state={`${summary!.overspentLines.length} budget line(s) overspent`}
              detail={summary!.overspentLines.map((l) => l.label).join(", ") + ". A portfolio-level percentage can look acceptable while a single line has already exceeded its budget."}
            />
          )}

          <FinRecordList
            title="Budget lines"
            description="One row per budget line, as structured in the Budget Monitor workbook."
            addLabel="Add budget line"
            onAdd={() => onChange({ ...data, lines: [...data.lines, blankBudgetLine()] })}
          >
            {data.lines.length === 0 ? (
              <FinEmptyRow text="No budget lines yet. Add one, or import the budget sheet from the Budget Monitor workbook." />
            ) : (
              <FinRecordScroll>
                {data.lines.map((line, index) => {
                  const derived = summary?.lines[index];
                  return (
                    <FinRecordCard
                      key={line.id}
                      title={line.budgetLine || line.category || "New budget line"}
                      onRemove={() => onChange({ ...data, lines: data.lines.filter((l) => l.id !== line.id) })}
                      removeLabel={`Remove budget line ${line.budgetLine || ""}`}
                    >
                      <FinTextField label="Budget ID" value={line.budgetId} onChange={(budgetId) => update(line.id, { budgetId })} required />
                      <FinTextField label="Budget line" value={line.budgetLine} onChange={(budgetLine) => update(line.id, { budgetLine })} required />
                      <FinTextField label="Category" value={line.category} onChange={(category) => update(line.id, { category })} />
                      <FinSelectField
                        label="Department"
                        value={line.department}
                        options={departmentOptions}
                        onChange={(department) => update(line.id, { department })}
                      />
                      <FinTextField label="Cost centre" value={line.costCentre} onChange={(costCentre) => update(line.id, { costCentre })} />
                      <FinTextField label="Project" value={line.project} onChange={(project) => update(line.id, { project })} />
                      <FinTextField label="Funder" value={line.funder} onChange={(funder) => update(line.id, { funder })} />
                      <FinSelectField
                        label="Status"
                        value={line.status}
                        options={STATUSES}
                        onChange={(status) => update(line.id, { status })}
                        placeholder="Not stated"
                      />
                      <FinNumberField label="Approved budget" value={line.approvedBudget} onChange={(approvedBudget) => update(line.id, { approvedBudget })} prefix={config.currencySymbol} required />
                      <FinNumberField label="Revised budget" value={line.revisedBudget} onChange={(revisedBudget) => update(line.id, { revisedBudget })} prefix={config.currencySymbol} hint="Takes precedence over the approved figure." />
                      <FinNumberField label="Actual expenditure" value={line.actualExpenditure} onChange={(actualExpenditure) => update(line.id, { actualExpenditure })} prefix={config.currencySymbol} required />
                      <FinNumberField label="Committed expenditure" value={line.committedExpenditure} onChange={(committedExpenditure) => update(line.id, { committedExpenditure })} prefix={config.currencySymbol} hint="Purchase orders and contracts signed but not yet invoiced." />
                      <FinNumberField label="Forecast expenditure" value={line.forecastExpenditure} onChange={(forecastExpenditure) => update(line.id, { forecastExpenditure })} prefix={config.currencySymbol} />
                      <FinTextField label="Notes" value={line.notes} onChange={(notes) => update(line.id, { notes })} />
                      <div className="sm:col-span-2 lg:col-span-4">
                        <LineReadout
                          label="Derived"
                          text={
                            derived?.remaining === null || derived === undefined
                              ? "Budget and actual are both needed to derive remaining budget."
                              : `Remaining ${formatCurrency(derived.remaining, config.currencySymbol)}, utilisation ${derived.utilisationPct === null ? "not derivable" : `${derived.utilisationPct.toFixed(1)}%`}, variance ${formatCurrency(derived.variance, config.currencySymbol)}${derived.overspent ? " - OVERSPENT" : ""}.`
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
                label="Budget commentary"
                rows={3}
                value={data.commentary}
                onChange={(commentary) => onChange({ ...data, commentary })}
                placeholder="Budget revisions, lines approaching their limit, overspends and their causes."
              />
            </div>
          </FinFieldset>

          <FinanceWarningPreview
            currencySymbol={config.currencySymbol}
            items={[
              {
                kpi: kpi(FINANCE_KPI_IDS.budgetUtilisation),
                value: summary?.utilisationPct ?? null,
                emptyNote: "No budget lines supplied yet.",
                label: "Budget utilisation",
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.budgetRemaining),
                value: summary?.lowestRemaining?.remaining ?? null,
                emptyNote: "No budget line has a remaining balance yet.",
                label: "Tightest remaining budget line",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}