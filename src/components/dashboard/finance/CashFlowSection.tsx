import {
  FinEmptyRow,
  FinFieldset,
  FinNumberField,
  FinTextArea,
} from "./FinanceFields";
import {
  FinanceDataQualityNote,
  FinanceNotApplicableToggle,
  FinanceSourceTag,
  FinanceWarningPreview,
  LineReadout,
  Readout,
} from "./FinanceSectionChrome";
import type { Kpi } from "../../../types";
import type {
  CashInflowType,
  CashOutflowType,
  FinanceCashFlowData,
  FinanceConfig,
  FinanceReport,
} from "../../../types/finance";
import { CASH_INFLOW_TYPES, CASH_OUTFLOW_TYPES } from "../../../types/finance";
import { FINANCE_KPI_IDS, calculateCashFlow, formatCurrency } from "../../../data/financeEngine";

/**
 * Section 9 & 10 - Cash Flow.
 *
 * The layout is fixed rows rather than free-form lines: Section 11 requires the
 * EWS to reason about cash consistently period to period, so the inflow and
 * outflow structure is a named taxonomy from config, not something the manager
 * invents each month.
 *
 * Closing cash is derived, not typed (Section 9). Finance may also record the
 * balance they read off the workbook, which validation reconciles - a
 * disagreement means the submission and the workbook differ, and that is worth
 * surfacing rather than silently preferring one figure.
 */
export function CashFlowSection({
  report,
  data,
  onChange,
  kpis,
  config,
  previousPeriodClosingCash,
}: {
  report: FinanceReport;
  data: FinanceCashFlowData;
  onChange: (data: FinanceCashFlowData) => void;
  kpis: Kpi[];
  config: FinanceConfig;
  previousPeriodClosingCash: number | null;
}) {
  const summary = calculateCashFlow(data, previousPeriodClosingCash);

  const setInflow = (type: CashInflowType, patch: { amount?: number | null; previousPeriod?: number | null }) =>
    onChange({ ...data, inflows: { ...data.inflows, [type]: { ...data.inflows[type], ...patch } } });

  const setOutflow = (type: CashOutflowType, patch: { amount?: number | null; previousPeriod?: number | null }) =>
    onChange({ ...data, outflows: { ...data.outflows, [type]: { ...data.outflows[type], ...patch } } });

  const kpi = (id: string) => kpis.find((k) => k.id === id);

  const difference =
    summary?.closingCash !== null &&
    summary?.closingCash !== undefined &&
    data.closingCashEntered !== null &&
    data.closingCashEntered !== undefined
      ? summary.closingCash - data.closingCashEntered
      : null;

  return (
    <div className="flex flex-col gap-4">
      <FinanceSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <FinanceNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Cash flow reporting"
      />

      {data.notApplicable ? (
        <FinEmptyRow text="Cash flow marked Not Applicable. No cash KPI will be derived and submission will not be blocked." />
      ) : (
        <>
          <FinFieldset
            title="Opening position"
            description="Balance carried into the period."
          >
            <FinNumberField
              label="Opening bank balance"
              value={data.openingBankBalance}
              onChange={(openingBankBalance) => onChange({ ...data, openingBankBalance })}
              prefix={config.currencySymbol}
              required
            />
            <FinNumberField
              label="Opening cash on hand"
              value={data.openingCashOnHand}
              onChange={(openingCashOnHand) => onChange({ ...data, openingCashOnHand })}
              prefix={config.currencySymbol}
              hint="Petty cash and cash on hand, if any."
            />
            <FinNumberField
              label="Previous period closing cash"
              value={previousPeriodClosingCash}
              onChange={() => undefined}
              prefix={config.currencySymbol}
              disabled
              hint="Carried in automatically from the prior submission."
            />
          </FinFieldset>

          <FinFieldset title="Cash inflows (Section 9)">
            {CASH_INFLOW_TYPES.map((type) => (
              <FinNumberField
                key={type}
                label={type}
                value={data.inflows[type].amount}
                onChange={(amount) => setInflow(type, { amount })}
                prefix={config.currencySymbol}
                required={type === "Revenue received"}
                hint={
                  data.inflows[type].previousPeriod !== null
                    ? `Previous period ${formatCurrency(data.inflows[type].previousPeriod, config.currencySymbol)}`
                    : undefined
                }
              />
            ))}
            <FinNumberField
              label="Previous period: revenue received"
              value={data.inflows["Revenue received"].previousPeriod}
              onChange={(previousPeriod) => setInflow("Revenue received", { previousPeriod })}
              prefix={config.currencySymbol}
              hint="Used for period-on-period movement."
            />
          </FinFieldset>

          <FinFieldset title="Cash outflows (Section 9)">
            {CASH_OUTFLOW_TYPES.map((type) => (
              <FinNumberField
                key={type}
                label={type}
                value={data.outflows[type].amount}
                onChange={(amount) => setOutflow(type, { amount })}
                prefix={config.currencySymbol}
                required={type === "Payroll"}
              />
            ))}
            <FinNumberField
              label="Previous period: payroll"
              value={data.outflows["Payroll"].previousPeriod}
              onChange={(previousPeriod) => setOutflow("Payroll", { previousPeriod })}
              prefix={config.currencySymbol}
              hint="Used for period-on-period movement."
            />
          </FinFieldset>

          <FinFieldset title="Forecast (Section 10)">
            <FinNumberField
              label="Forecast cash inflows"
              value={data.forecastInflows}
              onChange={(forecastInflows) => onChange({ ...data, forecastInflows })}
              prefix={config.currencySymbol}
            />
            <FinNumberField
              label="Forecast cash outflows"
              value={data.forecastOutflows}
              onChange={(forecastOutflows) => onChange({ ...data, forecastOutflows })}
              prefix={config.currencySymbol}
            />
            <div className="col-span-full">
              {!summary?.forecastAvailable ? (
                <FinanceDataQualityNote
                  state="Forecast data not available"
                  detail="No forecast closing balance will be projected. Section 10 forbids fabricating a forecast, so nothing is shown until Finance supplies approved forecast figures."
                />
              ) : (
                <LineReadout
                  label="Forecast closing cash"
                  text={`${formatCurrency(summary.forecastClosingCash, config.currencySymbol)}${summary.forecastShortfall ? " - forecast shortfall: the approved forecast puts the organisation below zero." : "."}`}
                />
              )}
            </div>
          </FinFieldset>

          {summary && (
            <FinFieldset title="Cash totals (calculated)" description="Derived by the Finance engine from the figures above.">
              <Readout label="Total cash inflows" value={formatCurrency(summary.totalInflows, config.currencySymbol)} />
              <Readout label="Total cash outflows" value={formatCurrency(summary.totalOutflows, config.currencySymbol)} />
              <Readout label="Net cash movement" value={formatCurrency(summary.netMovement, config.currencySymbol)} />
              <Readout label="Closing cash balance" value={formatCurrency(summary.closingCash, config.currencySymbol)} />
              <div className="col-span-full">
                <FinNumberField
                  label="Closing balance as shown in the workbook (reconciliation)"
                  value={data.closingCashEntered}
                  onChange={(closingCashEntered) => onChange({ ...data, closingCashEntered })}
                  prefix={config.currencySymbol}
                  hint="Optional, but if supplied it must agree with the calculated closing balance."
                />
              </div>
              {difference !== null && difference !== 0 && (
                <div className="col-span-full">
                  <FinanceDataQualityNote
                    state="Workbook and submission disagree on closing cash"
                    detail={`Calculated ${formatCurrency(summary.closingCash, config.currencySymbol)} against workbook ${formatCurrency(data.closingCashEntered, config.currencySymbol)} - a difference of ${formatCurrency(difference, config.currencySymbol)}. Submission will be blocked until this is reconciled.`}
                  />
                </div>
              )}
            </FinFieldset>
          )}

          <FinFieldset title="Section commentary">
            <div className="col-span-full">
              <FinTextArea
                label="Cash flow commentary"
                rows={3}
                value={data.commentary}
                onChange={(commentary) => onChange({ ...data, commentary })}
                placeholder="Timing of receipts and payments, funding decisions, anything affecting the closing position."
              />
            </div>
          </FinFieldset>

          <FinanceWarningPreview
            currencySymbol={config.currencySymbol}
            items={[
              {
                kpi: kpi(FINANCE_KPI_IDS.cashBalance),
                value: summary?.closingCash ?? null,
                emptyNote: "Cash flow figures not supplied yet.",
                label: "Closing cash balance",
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.netCashMovement),
                value: summary?.netMovement ?? null,
                emptyNote: "Cash flow figures not supplied yet.",
                label: "Net cash movement",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}