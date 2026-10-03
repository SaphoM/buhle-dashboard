import { useMemo, useState } from "react";
import { useToast } from "../../common/ToastContext";
import {
  TARGET_FIELDS,
  TARGET_LABELS,
  applyImport,
  buildPreview,
  readWorkbookWithNames,
  recordImportFailure,
  suggestMapping,
  type ColumnMapping,
  type ImportPreview,
  type ImportTarget,
  type WorkbookSheet,
} from "../../../data/financeImport";
import type { FinanceConfig, FinanceReport } from "../../../types/finance";
import { FinanceWorkbookDependencyNotice } from "./FinanceSectionChrome";
import { FINANCE_WORKBOOK_DEPENDENCY } from "../../../types/finance";

/**
 * ============================================================================
 * Finance workbook import (Section 26).
 * ============================================================================
 *
 *     UPLOAD -> READ -> SHOW SHEETS -> MAP COLUMNS -> VALIDATE -> PREVIEW
 *            -> IMPORT
 *
 * Import is an alternative way of FILLING the submission, not a second
 * submission system. Whatever arrives here lands in the same FinanceReport the
 * manual sections write to, and from there the same engine, KPIs, Early Warning
 * System and audit trail apply. That is why this component returns an updated
 * report to its parent instead of writing anywhere itself.
 *
 * Section 26's two hard rules are enforced structurally here:
 *  - Nothing is committed until Finance has seen a preview and confirmed it.
 *  - Existing figures are never overwritten silently; the mode is an explicit
 *    choice and the choice is recorded on the ImportRun.
 */
export function FinanceImportWizard({
  report,
  config,
  onApply,
}: {
  report: FinanceReport;
  config: FinanceConfig;
  /** Receives the updated report once Finance confirms an import. */
  onApply: (report: FinanceReport, summary: string) => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<ImportTarget>("revenue");
  const [sheets, setSheets] = useState<WorkbookSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [conflicts, setConflicts] = useState<{ header: string; claimedBy: string[] }[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"replace" | "append">("replace");

  const sheet = sheets[sheetIndex];
  const fields = TARGET_FIELDS[target];

  /** A mapping can only be judged once a sheet is loaded. */
  const canMap = Boolean(sheet && sheet.headers.length > 0);

  const unmappedRequired = useMemo(
    () =>
      canMap
        ? fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label)
        : fields.filter((f) => f.required).map((f) => f.label),
    [fields, mapping, canMap]
  );

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setSheets([]);
    setPreview(null);
    setFileName(file.name);
    try {
      const read = await readWorkbookWithNames(file);
      if (read.length === 0) {
        toast.error(`${file.name} contains no readable worksheets.`);
        setBusy(false);
        return;
      }
      setSheets(read);
      setSheetIndex(0);
      autoMap(read[0], target);
    } catch (error) {
      // Section 33: a failed import is a state Finance must be told about, not a
      // silently empty section.
      const reason = error instanceof Error ? error.message : "The file could not be read.";
      toast.error(`Import failed: ${reason}`);
      onApply(
          recordImportFailure(report, reason, file.name, target),
          `Import failed: ${reason} (${file.name}).`
        );
      setBusy(false);
    }
  }

  /** Suggests a mapping when the sheet or the target section changes. The
   *  suggestion is always shown for confirmation - never applied silently. */
  function autoMap(next: WorkbookSheet | undefined, forTarget: ImportTarget) {
    if (!next) {
      setMapping({});
      setConflicts([]);
      return;
    }
    const suggestion = suggestMapping(next.headers, TARGET_FIELDS[forTarget]);
    setMapping(suggestion.mapping);
    setConflicts(suggestion.conflicts);
    setPreview(null);
  }

  function handleTarget(next: ImportTarget) {
    setTarget(next);
    autoMap(sheet, next);
  }

  function handleSheet(next: WorkbookSheet, index: number) {
    setSheetIndex(index);
    autoMap(next, target);
  }

  function handlePreview() {
    if (!sheet) return;
    const built = buildPreview(sheet, target, mapping, {
      revenueCategories: config.revenueCategories,
      expenseCategories: config.expenseCategories,
    });
    setPreview(built);
    if (built.acceptable.length === 0) {
      toast.error("No rows could be read from this sheet with the current mapping.");
    }
  }

  function handleCommit() {
    if (!preview || !sheet) return;
    const result = applyImport(report, preview, { fileName, actor: "Finance", mode });
    const replaced = result.replacedSections.length > 0 ? ` Replaced existing ${result.replacedSections.join(", ")} rows.` : "";
    const summary = `${result.accepted} row(s) imported into ${TARGET_LABELS[target]} from "${sheet.name}" in ${fileName}; ${result.rejected} rejected.${replaced}`;
    onApply(result.report, summary);
    setPreview(null);
    setSheets([]);
    setMapping({});
    toast.success(summary);
  }

  return (
    <div className="flex flex-col gap-4">
      <FinanceWorkbookDependencyNotice dependency={FINANCE_WORKBOOK_DEPENDENCY} />

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
          Import from the Finance workbook
        </p>
        <p className="mt-1 text-xs text-ink-soft/55">
          Upload the Budget Monitor workbook, choose which worksheet feeds which section, confirm the column
          mapping, then review exactly what will be imported. Nothing is written until you confirm.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">Target section</span>
            <select
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
              value={target}
              onChange={(e) => handleTarget(e.target.value as ImportTarget)}
            >
              {Object.entries(TARGET_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">Workbook file</span>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs text-ink file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:text-xs file:text-butter"
            />
          </label>

          {sheets.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Worksheet</span>
              <select
                className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
                value={sheetIndex}
                onChange={(e) => handleSheet(sheets[Number(e.target.value)], Number(e.target.value))}
              >
                {sheets.map((s, i) => (
                  <option key={`${s.name}-${i}`} value={i}>
                    {s.name} ({s.dataRows.length} rows)
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {canMap && sheet && (
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Column mapping</p>
            <p className="text-[11px] text-ink-soft/40">Suggested from the headers - check each one</p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-soft/60">
                  {field.label}
                  {field.required && <span className="ml-1 text-rose-500">*</span>}
                </span>
                <select
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink"
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => {
                    setMapping((prev) => {
                      const next = { ...prev };
                      if (e.target.value === "") delete next[field.key];
                      else next[field.key] = e.target.value;
                      return next;
                    });
                    setPreview(null);
                  }}
                >
                  <option value="">Not mapped</option>
                  {sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {conflicts.length > 0 && (
            <p className="mt-3 rounded-xl bg-butter/20 px-3 py-2 text-[11px] text-ink-soft/70">
              Two fields are pointing at the same column: {conflicts.map((c) => c.header).join(", ")}. One of
              them is probably wrong - check the mapping.
            </p>
          )}

          {unmappedRequired.length > 0 && (
            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              Still unmapped: {unmappedRequired.join(", ")}. Rows will be rejected until these are mapped.
            </p>
          )}

          <button
            type="button"
            onClick={handlePreview}
            className="mt-3 rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5"
          >
            Preview import
          </button>
        </div>
      )}

      {preview && (
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
            Preview - nothing has been saved yet
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-soft/60">
            <span>
              <strong className="text-ink">{preview.acceptable.length}</strong> row(s) will be imported
            </span>
            <span>
              <strong className="text-ink">{preview.rejected.length}</strong> row(s) will be skipped
            </span>
            <span>
              <strong className="text-ink">{preview.headers.length}</strong> column(s) read
            </span>
          </div>

          {preview.unmappedFields.length > 0 && (
            <p className="mt-2 rounded-xl bg-butter/20 px-3 py-2 text-[11px] text-ink-soft/70">
              Not covered by the mapping: {preview.unmappedFields.join(", ")}. These will be left blank rather
              than guessed.
            </p>
          )}

          {preview.rejected.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                Show the {preview.rejected.length} row(s) that will be skipped
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {preview.rejected.map((row) => (
                  <li key={row.rowNumber} className="text-[11px] text-ink-soft/60">
                    Row {row.rowNumber}: {row.issues.map((i) => `${i.field} - ${i.message}`).join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-3">
            <p className="text-xs font-medium text-ink-soft/60">If rows already exist for this section</p>
            <div className="mt-1 flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft/70">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="accent-ink"
                />
                Replace them with the imported rows (the existing rows are recorded as replaced)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft/70">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "append"}
                  onChange={() => setMode("append")}
                  className="accent-ink"
                />
                Keep them and add the imported rows below
              </label>
            </div>
          </div>

          <button
            type="button"
            disabled={preview.acceptable.length === 0}
            onClick={handleCommit}
            className="mt-3 rounded-full bg-ink px-5 py-2 text-xs font-semibold text-butter disabled:opacity-40"
          >
            Confirm import of {preview.acceptable.length} row(s)
          </button>
        </div>
      )}

      {report.importRuns.length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Import history</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {report.importRuns.map((run) => (
              <li key={run.id} className="text-[11px] text-ink-soft/60">
                <span className="font-semibold text-ink">{run.fileName}</span> · {run.sheetName} ·{" "}
                {run.rowsAccepted} accepted, {run.rowsRejected} rejected ·{" "}
                {new Date(run.importedAt).toLocaleString("en-ZA")} ·{" "}
                <span className={run.status === "Failed" ? "text-rose-600" : ""}>{run.status}</span>
                {run.notes ? ` - ${run.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}