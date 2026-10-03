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
  FinanceNotApplicableToggle,
  FinanceSourceTag,
  FinanceWarningPreview,
  LineReadout,
} from "./FinanceSectionChrome";
import { AgeingPanel } from "./AgeingPanel";
import type { Department, Kpi } from "../../../types";
import type { DebtorRecord, FinanceConfig, FinanceDebtorsData, FinanceReport } from "../../../types/finance";
import { FINANCE_KPI_IDS, calculateDebtors, daysOverdue, formatCurrency } from "../../../data/financeEngine";
import { blankDebtorRecord } from "../../../data/financeSeed";

/**
 * Section 15 - Debtors.
 *
 * One row per customer invoice. Days overdue is derived from the due date and
 * the outstanding balance from invoice less received, so Finance supplies facts
 * rather than ageing verdicts (Section 16).
 */
export function DebtorsSection({
  report,
  data,
  onChange,
  kpis,
  config,
  departmentOptions,
}: {
  report: FinanceReport;
  data: FinanceDebtorsData;
  onChange: (data: FinanceDebtorsData) => void;
  kpis: Kpi[];
  config: FinanceConfig;
  departmentOptions: readonly Department[];
}) {
  const summary = calculateDebtors(data, config.ageingBuckets);

  const update = (id: string, patch: Partial<DebtorRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const kpi = (id: string) => kpis.find((k) => k.id === id);

  return (
    <div className="flex flex-col gap-4">
      <FinanceSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <FinanceNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Debtors reporting"
      />

      {data.notApplicable ? (
        <FinEmptyRow text="Debtors marked Not Applicable. No debtor KPI will be derived and submission will not be blocked." />
      ) : (
        <>
          <AgeingPanel summary={summary} config={config} audience="Debtors" obligationLabel="money owed to Buhle" />

          <FinRecordList
            title="Customer invoices"
            description="Every unpaid or part-paid customer invoice at period end."
            addLabel="Add debtor"
            onAdd={() => onChange({ ...data, records: [...data.records, blankDebtorRecord()] })}
          >
            {data.records.length === 0 ? (
              <FinEmptyRow text="No debtor records yet. Add one, or import the debtors sheet from the Budget Monitor workbook." />
            ) : (
              <FinRecordScroll>
                {data.records.map((record) => {
                  const outstanding =
                    record.invoiceAmount === null ? null : record.invoiceAmount - (record.amountReceived ?? 0);
                  const days = daysOverdue(record.dueDate);
                  return (
                    <FinRecordCard
                      key={record.id}
                      title={record.customer || record.invoiceNumber || "New debtor"}
                      onRemove={() => onChange({ ...data, records: data.records.filter((r) => r.id !== record.id) })}
                      removeLabel={`Remove debtor ${record.customer || ""}`}
                    >
                      <FinTextField label="Customer" value={record.customer} onChange={(customer) => update(record.id, { customer })} required />
                      <FinTextField label="Invoice number" value={record.invoiceNumber} onChange={(invoiceNumber) => update(record.id, { invoiceNumber })} required />
                      <FinTextField label="Description" value={record.description} onChange={(description) => update(record.id, { description })} />
                      <FinSelectField
                        label="Department"
                        value={record.department}
                        options={departmentOptions}
                        onChange={(department) => update(record.id, { department })}
                      />
                      <FinTextField label="Project" value={record.project} onChange={(project) => update(record.id, { project })} />
                      <FinTextField label="Invoice date" type="date" value={record.invoiceDate} onChange={(invoiceDate) => update(record.id, { invoiceDate })} required />
                      <FinTextField label="Due date" type="date" value={record.dueDate} onChange={(dueDate) => update(record.id, { dueDate })} required />
                      <FinNumberField label="Invoice amount" value={record.invoiceAmount} onChange={(invoiceAmount) => update(record.id, { invoiceAmount })} prefix={config.currencySymbol} required />
                      <FinNumberField label="Amount received" value={record.amountReceived} onChange={(amountReceived) => update(record.id, { amountReceived })} prefix={config.currencySymbol} hint="0 if nothing received." />
                      <FinNumberField
                        label="Previous period outstanding"
                        value={record.previousPeriodOutstanding}
                        onChange={(previousPeriodOutstanding) => update(record.id, { previousPeriodOutstanding })}
                        prefix={config.currencySymbol}
                        hint="Needed to detect a growing balance."
                      />
                      <FinTextField label="Responsible owner" value={record.responsibleOwner} onChange={(responsibleOwner) => update(record.id, { responsibleOwner })} />
                      <FinTextField label="Follow-up date" type="date" value={record.followUpDate} onChange={(followUpDate) => update(record.id, { followUpDate })} />
                      <FinTextField label="Notes" value={record.notes} onChange={(notes) => update(record.id, { notes })} />
                      <div className="sm:col-span-2 lg:col-span-4">
                        <LineReadout
                          label="Derived"
                          text={
                            outstanding === null
                              ? "An invoice amount is needed to derive the outstanding balance."
                              : `Outstanding ${formatCurrency(outstanding, config.currencySymbol)}, ${days === null ? "cannot be aged without a due date" : days <= 0 ? "not yet due" : `${days} days overdue`}.`
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
                label="Debtors commentary"
                rows={3}
                value={data.commentary}
                onChange={(commentary) => onChange({ ...data, commentary })}
                placeholder="Dispute status, collection action taken, credit notes, customers expected to pay late."
              />
            </div>
          </FinFieldset>

          <FinanceWarningPreview
            currencySymbol={config.currencySymbol}
            items={[
              {
                kpi: kpi(FINANCE_KPI_IDS.debtorsTotal),
                value: summary?.totalOutstanding ?? null,
                emptyNote: "No debtor records supplied yet.",
                label: "Total debtors",
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.debtors90Plus),
                value: summary?.severeOverdue ?? null,
                emptyNote: "No debtor records supplied yet.",
                label: `Debtors ${summary?.severeBucketLabel ?? "90 days"} and beyond`,
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.collectionRate),
                value: summary?.collectionRatePct ?? null,
                emptyNote: "No debtor amounts supplied yet.",
                label: "Collection rate",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}