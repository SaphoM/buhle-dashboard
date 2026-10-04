import {
  DataQualityNote,
  NoDataNote,
  NotApplicableToggle,
  SourceTag,
  WarningPreview,
} from "../RegisterChrome";
import type { Kpi } from "../../../types";
import type { OperationsDataSource } from "../../../types/operations";
import { previewOperationsStatus } from "../../../data/operationsEngine";

/**
 * Operations-facing names for the shared register chrome.
 *
 * These live in `RegisterChrome` because Commercial Farming's sections need the
 * same components. `OperationsWarningPreview` is the Operations binding: it
 * passes the Operations status rule, which is what keeps the preview honest.
 * Operations treats a stored "no data" differently from a live preview with no
 * value, and only the Operations engine knows that rule.
 */
export function OperationsWarningPreview({
  items,
  currencySymbol = "R",
}: {
  items: { kpi: Kpi | undefined; value: number | null; emptyNote: string; label?: string }[];
  currencySymbol?: string;
}) {
  return <WarningPreview items={items} previewStatus={previewOperationsStatus} currencySymbol={currencySymbol} />;
}

/** N/A toggle for an Operations section. */
export function OperationsNotApplicableToggle({
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

/** Where the numbers in this Operations submission came from. */
export function OperationsSourceTag({
  source,
  reportingPeriod,
}: {
  source: OperationsDataSource;
  reportingPeriod: string;
}) {
  const failed = Boolean(source.failureReason);
  const imported = source.kind === "Workbook Import";
  const kind = failed
    ? "Import failed"
    : imported
      ? "Workbook import"
      : source.kind === "Manual Entry"
        ? "Manual entry"
        : "Not submitted";
  const detail = failed
    ? source.failureReason
    : imported
      ? `${source.fileName ?? "file unknown"}${source.sheetName ? ` / ${source.sheetName}` : ""}`
      : undefined;

  return <SourceTag kind={kind} period={reportingPeriod} detail={detail} footnote="Not a live learner management feed" />;
}

export { DataQualityNote as OperationsDataQualityNote, NoDataNote as OperationsNoDataNote };