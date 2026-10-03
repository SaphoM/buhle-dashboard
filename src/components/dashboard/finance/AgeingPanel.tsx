import { FinFieldset } from "./FinanceFields";
import { FinanceDataQualityNote, Readout } from "./FinanceSectionChrome";
import type { AgeingSummary } from "../../../data/financeEngine";
import type { AgeingBucket, FinanceConfig } from "../../../types/finance";
import { formatCurrency } from "../../../data/financeEngine";

/**
 * The ageing readout shared by Debtors (Sections 15-17) and Creditors
 * (Sections 18-20).
 *
 * Both sections present the same underlying analysis, so they share this
 * component rather than two copies that drift apart. The framing differs
 * slightly in the copy passed in, because Section 20 is explicit that a creditor
 * is not a risk merely by existing.
 */
export function AgeingPanel({
  summary,
  config,
  audience,
  obligationLabel,
}: {
  summary: AgeingSummary | null;
  config: FinanceConfig;
  /** "Debtors" or "Creditors" - changes the wording of the outstanding label. */
  audience: string;
  /** What the obligation represents, e.g. "money owed to Buhle". */
  obligationLabel: string;
}) {
  if (!summary) {
    return (
      <FinanceDataQualityNote
        state={`No ${audience.toLowerCase()} supplied`}
        detail="No records have been entered or imported for this section, so no ageing analysis and no KPI can be derived."
      />
    );
  }

  const buckets = config.ageingBuckets;
  const symbol = config.currencySymbol;

  return (
    <>
      <FinFieldset title={`${audience} ageing (calculated)`}>
        <Readout label={`Total outstanding (${obligationLabel})`} value={formatCurrency(summary.totalOutstanding, symbol)} />
        <Readout label="Total overdue" value={formatCurrency(summary.totalOverdue, symbol)} />
        <Readout
          label={`${summary.severeBucketLabel} and beyond`}
          value={formatCurrency(summary.severeOverdue, symbol)}
        />
        <Readout
          label="Collection / settlement rate"
          value={summary.collectionRatePct === null ? "Not derivable" : `${summary.collectionRatePct.toFixed(1)}%`}
        />
        <Readout
          label="Largest overdue account"
          value={
            summary.largestOverdueAccount
              ? `${summary.largestOverdueAccount.label}: ${formatCurrency(summary.largestOverdueAccount.amount, symbol)} (${summary.largestOverdueAccount.daysOverdue} days overdue)`
              : "Nothing overdue"
          }
        />
        <Readout label="Records" value={String(summary.recordCount)} />
      </FinFieldset>

      <FinFieldset title="Ageing distribution">
        {buckets.map((bucket: AgeingBucket) => {
          const amount = summary.byBucket[bucket.label] ?? 0;
          const count = summary.countByBucket[bucket.label] ?? 0;
          const total = summary.totalOutstanding ?? 0;
          const share = total > 0 ? Math.round((amount / total) * 100) : 0;
          return (
            <div key={bucket.label} className="rounded-xl bg-white px-3 py-2">
              <p className="flex items-baseline justify-between gap-2 text-[11px] text-ink-soft/45">
                <span>{bucket.label}</span>
                <span>
                  {count} record{count === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(amount, symbol)}</p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-ink/70" style={{ width: `${share}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-ink-soft/35">{share}% of outstanding</p>
            </div>
          );
        })}
      </FinFieldset>

      {summary.increasingBalance.length > 0 && (
        <FinanceDataQualityNote
          state={`${summary.increasingBalance.length} account(s) increased against the prior period`}
          detail={summary.increasingBalance
            .map((a) => `${a.label}: ${formatCurrency(a.previous, symbol)} to ${formatCurrency(a.current, symbol)}`)
            .join("; ")}
        />
      )}
    </>
  );
}