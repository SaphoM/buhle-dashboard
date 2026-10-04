import { useMemo, useState } from "react";
import { useToast } from "./ToastContext";
import { readWorkbookWithNames, suggestMapping } from "../../data/workbookImport";
import type { ColumnMapping, FieldSpec, ParsedRow, WorkbookSheet } from "../../data/workbookImport";

/**
 * The workbook import wizard, shared by Finance and Operations.
 *
 *     UPLOAD -> READ -> SHOW SHEETS -> MAP COLUMNS -> VALIDATE -> PREVIEW
 *            -> IMPORT
 *
 * Both departments face the same problem with the same shape of solution, and the
 * parts that matter are structural rather than cosmetic:
 *
 *  - Nothing is written until a manager has seen a preview and confirmed it.
 *  - A suggested mapping is proposed, never applied. Every field is shown and
 *    confirmed.
 *  - Existing rows are never overwritten silently. Replace or append is an
 *    explicit choice, and the choice is recorded.
 *  - A rejected row is listed with its reason, so the person who typed the
 *    register can see which line the application refused.
 *  - A file that cannot be read is recorded as a failed import rather than
 *    leaving the section looking unsubmitted.
 *
 * What differs between departments - which sections exist, which columns they
 * have, what a valid course or category is - is passed in. The wizard owns the
 * sequence and nothing about the data.
 */

export interface ImportRunLike {
  id: string;
  fileName: string;
  sheetName: string;
  rowsAccepted: number;
  rowsRejected: number;
  importedAt: string;
  status: string;
  notes?: string;
}

export interface ImportPreviewLike<T extends string = string> {
  target: T;
  rows: ParsedRow[];
  acceptable: ParsedRow[];
  rejected: ParsedRow[];
  mapping: ColumnMapping;
  unmappedFields: string[];
  headers: string[];
  sheetName: string;
}

const inputClass = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink";

export function WorkbookImportWizard<T extends string, Run extends ImportRunLike>({
  target,
  onTargetChange,
  targetLabels,
  fieldsFor,
  buildPreview,
  onCommit,
  onReadFailure,
  runs,
  notice,
  heading,
  intro,
}: {
  target: T;
  onTargetChange: (target: T) => void;
  targetLabels: Record<T, string>;
  fieldsFor: (target: T) => FieldSpec[];
  /** Builds the preview. The department owns the coercion rules. */
  buildPreview: (sheet: WorkbookSheet, target: T, mapping: ColumnMapping) => ImportPreviewLike<T>;
  /** Called on confirm with a confirmed preview and an explicit mode. */
  onCommit: (preview: ImportPreviewLike<T>, mode: "replace" | "append", sheetName: string, fileName: string) => void;
  /** Called when a file cannot be read at all. */
  onReadFailure: (reason: string, fileName: string) => void;
  runs: Run[];
  notice?: React.ReactNode;
  heading: string;
  intro: string;
}) {
  const toast = useToast();
  const [sheets, setSheets] = useState<WorkbookSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreviewLike<T> | null>(null);
  const [conflicts, setConflicts] = useState<{ header: string; claimedBy: string[] }[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"replace" | "append">("replace");

  const sheet = sheets[sheetIndex];
  const fields = fieldsFor(target);
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
      // A file that cannot be read is a state the department must be told about.
      // Leaving the section looking unsubmitted would let everyone assume the
      // numbers simply have not arrived yet.
      const reason = error instanceof Error ? error.message : "The file could not be read.";
      toast.error(`Import failed: ${reason}`);
      onReadFailure(reason, file.name);
      setBusy(false);
    }
  }

  /** Suggests a mapping when the sheet or the target section changes. Always
   *  shown for confirmation; never applied on the user's behalf. */
  function autoMap(next: WorkbookSheet | undefined, forTarget: T) {
    if (!next) {
      setMapping({});
      setConflicts([]);
      return;
    }
    const suggestion = suggestMapping(next.headers, fieldsFor(forTarget));
    setMapping(suggestion.mapping);
    setConflicts(suggestion.conflicts);
    setPreview(null);
  }

  function handleTarget(next: T) {
    onTargetChange(next);
    autoMap(sheet, next);
  }

  function handleSheet(next: WorkbookSheet, index: number) {
    setSheetIndex(index);
    autoMap(next, target);
  }

  function handlePreview() {
    if (!sheet) return;
    const built = buildPreview(sheet, target, mapping);
    setPreview(built);
    if (built.acceptable.length === 0) {
      toast.error("No rows could be read from this sheet with the current mapping.");
    }
  }

  function handleCommit() {
    if (!preview || !sheet) return;
    onCommit(preview, mode, sheet.name, fileName);
    setPreview(null);
    setSheets([]);
    setMapping({});
  }

  return (
    <div className="flex flex-col gap-4">
      {notice}

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">{heading}</p>
        <p className="mt-1 text-xs text-ink-soft/55">{intro}</p>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft/60">Target section</span>
            <select className={inputClass} value={target} onChange={(e) => handleTarget(e.target.value as T)}>
              {(Object.entries(targetLabels) as [T, string][]).map(([key, label]) => (
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
              className={`${inputClass} text-xs file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:text-xs file:text-butter`}
            />
          </label>

          {sheets.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft/60">Worksheet</span>
              <select
                className={inputClass}
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

      {runs.length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-white/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Import history</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {runs.map((run) => (
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