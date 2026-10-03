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
import type { CreditorRecord, FinanceConfig, FinanceCreditorsData, FinanceReport } from "../../../types/finance";
import { FINANCE_KPI_IDS, calculateCreditors, daysOverdue, formatCurrency } from "../../../data/financeEngine";
import { blankCreditorRecord } from "../../../data/financeSeed";

/**
 * Section 18 - Creditors.
 *
 * Section 20 is explicit that owing money is not itself a problem: a creditor
 * can be healthy, overdue and being chased, or simply due next month. So this
 * section presents the same ageing facts as Debtors and leaves every judgement
 * to the KPI thresholds in Administration.
 */
export function CreditorsSection({
  report,
  data,
  onChange,
  kpis,
  config,
  departmentOptions,
}: {
  report: FinanceReport;
  data: FinanceCreditorsData;
  onChange: (data: FinanceCreditorsData) => void;
  kpis: Kpi[];
  config: FinanceConfig;
  departmentOptions: readonly Department[];
}) {
  const summary = calculateCreditors(data, config.ageingBuckets);

  const update = (id: string, patch: Partial<CreditorRecord>) =>
    onChange({ ...data, records: data.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const kpi = (id: string) => kpis.find((k) => k.id === id);

  return (
    <div className="flex flex-col gap-4">
      <FinanceSourceTag source={report.dataSource} reportingPeriod={report.reportingPeriod} />

      <FinanceNotApplicableToggle
        checked={data.notApplicable}
        onChange={(notApplicable) => onChange({ ...data, notApplicable })}
        what="Creditors reporting"
      />

      {data.notApplicable ? (
        <FinEmptyRow text="Creditors marked Not Applicable. No creditor KPI will be derived and submission will not be blocked." />
      ) : (
        <>
          <AgeingPanel summary={summary} config={config} audience="Creditors" obligationLabel="money Buhle owes" />

          <FinRecordList
            title="Supplier invoices"
            description="Every unpaid supplier invoice at period end."
            addLabel="Add creditor"
            onAdd={() => onChange({ ...data, records: [...data.records, blankCreditorRecord()] })}
          >
            {data.records.length === 0 ? (
              <FinEmptyRow text="No creditor records yet. Add one, or import the creditors sheet from the Budget Monitor workbook." />
            ) : (
              <FinRecordScroll>
                {data.records.map((record) => {
                  const outstanding =
                    record.invoiceAmount === null ? null : record.invoiceAmount - (record.amountPaid ?? 0);
                  const days = daysOverdue(record.dueDate);
                  return (
                    <FinRecordCard
                      key={record.id}
                      title={record.supplier || record.invoiceNumber || "New creditor"}
                      onRemove={() => onChange({ ...data, records: data.records.filter((r) => r.id !== record.id) })}
                      removeLabel={`Remove creditor ${record.supplier || ""}`}
                    >
                      <FinTextField label="Supplier" value={record.supplier} onChange={(supplier) => update(record.id, { supplier })} required />
                      <FinTextField label="Invoice number" value={record.invoiceNumber} onChange={(invoiceNumber) => update(record.id, { invoiceNumber })} required />
                      <FinSelectField
                        label="Department"
                        value={record.department}
                        options={departmentOptions}
                        onChange={(department) => update(record.id, { department })}
                      />
                      <FinTextField label="Cost centre" value={record.costCentre} onChange={(costCentre) => update(record.id, { costCentre })} />
                      <FinTextField label="Project" value={record.project} onChange={(project) => update(record.id, { project })} />
                      <FinTextField label="Invoice date" type="date" value={record.invoiceDate} onChange={(invoiceDate) => update(record.id, { invoiceDate })} required />
                      <FinTextField label="Due date" type="date" value={record.dueDate} onChange={(dueDate) => update(record.id, { dueDate })} required />
                      <FinNumberField label="Invoice amount" value={record.invoiceAmount} onChange={(invoiceAmount) => update(record.id, { invoiceAmount })} prefix={config.currencySymbol} required />
                      <FinNumberField label="Amount paid" value={record.amountPaid} onChange={(amountPaid) => update(record.id, { amountPaid })} prefix={config.currencySymbol} hint="0 if unpaid." />
                      <FinNumberField
                        label="Previous period outstanding"
                        value={record.previousPeriodOutstanding}
                        onChange={(previousPeriodOutstanding) => update(record.id, { previousPeriodOutstanding })}
                        prefix={config.currencySymbol}
                        hint="Needed to detect a growing balance."
                      />
                      <FinTextField label="Payment date" type="date" value={record.paymentDate} onChange={(paymentDate) => update(record.id, { paymentDate })} hint="Optional." />
                      <FinTextField label="Responsible owner" value={record.responsibleOwner} onChange={(responsibleOwner) => update(record.id, { responsibleOwner })} />
                      <FinTextField label="Notes" value={record.notes} onChange={(notes) => update(record.id, { notes })} />
                      <div className="sm:col-span-2 lg:col-span-4">
                        <LineReadout
                          label="Derived"
                          text={
                            outstanding === null
                              ? "An invoice amount is needed to derive the outstanding balance."
                              : `Outstanding ${formatCurrency(outstanding, config.currencySymbol)}, ${days === null ? "cannot be aged without a due date" : days <= 0 ? "not yet due" : `${days} days overdue`}${record.paymentDate ? ", payment recorded" : ""}.`
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
                label="Creditors commentary"
                rows={3}
                value={data.commentary}
                onChange={(commentary) => onChange({ ...data, commentary })}
                placeholder="Payment arrangements, disputes, suppliers on stop-supply, anything affecting due dates."
              />
            </div>
          </FinFieldset>

          <FinanceWarningPreview
            currencySymbol={config.currencySymbol}
            items={[
              {
                kpi: kpi(FINANCE_KPI_IDS.creditorsTotal),
                value: summary?.totalOutstanding ?? null,
                emptyNote: "No creditor records supplied yet.",
                label: "Total creditors",
              },
              {
                kpi: kpi(FINANCE_KPI_IDS.creditors90Plus),
                value: summary?.severeOverdue ?? null,
                emptyNote: "No creditor records supplied yet.",
                label: `Creditors ${summary?.severeBucketLabel ?? "90 days"} and beyond`,
              },
            ]}
          />
        </>
      )}
    </div>
  );
}