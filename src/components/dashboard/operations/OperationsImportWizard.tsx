import { useState } from "react";
import { useToast } from "../../common/ToastContext";
import { WorkbookImportWizard } from "../../common/WorkbookImportWizard";
import {
  OPERATIONS_TARGET_FIELDS,
  OPERATIONS_TARGET_LABELS,
  applyOperationsImport,
  buildOperationsPreview,
  recordOperationsImportFailure,
  type OperationsImportPreview,
  type OperationsImportTarget,
} from "../../../data/operationsImport";
import type { OperationsConfig, OperationsReport } from "../../../types/operations";

/**
 * ============================================================================
 * Operations workbook import.
 * ============================================================================
 *
 *     UPLOAD -> READ -> SHOW SHEETS -> MAP COLUMNS -> VALIDATE -> PREVIEW
 *            -> IMPORT
 *
 * Import is an alternative way of FILLING the submission, not a second
 * submission system. Whatever arrives here lands in the same OperationsReport
 * the manual sections write to, and from there the same engine, KPIs, Early
 * Warning System and audit trail apply. That is why this component returns an
 * updated report to its parent instead of writing anywhere itself.
 *
 * One rule is specific to Operations and enforced here rather than left to the
 * user: a course or asset category that is not in the configured vocabulary is
 * refused, not imported as free text. A figure that cannot be grouped with the
 * same figure next term is worse than a refused row, because it looks
 * importable.
 */
export function OperationsImportWizard({
  report,
  config,
  actor,
  onApply,
}: {
  report: OperationsReport;
  config: OperationsConfig;
  actor: string;
  /** Receives the updated report once Operations confirms an import. */
  onApply: (report: OperationsReport, summary: string) => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<OperationsImportTarget>("enrolment");

  return (
    <WorkbookImportWizard
      target={target}
      onTargetChange={setTarget}
      targetLabels={OPERATIONS_TARGET_LABELS}
      fieldsFor={(t) => OPERATIONS_TARGET_FIELDS[t]}
      heading="Import from an Operations workbook"
      intro="Upload a register, choose which worksheet feeds which reporting area, confirm the column mapping, then review exactly what will be imported. Nothing is written until you confirm."
      notice={
        <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">Before the first import</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft/70">
            The column mapping below is suggested from whatever headers the file happens to carry. Until Buhle&apos;s
            registers have been seen, that suggestion is a starting point rather than an approved mapping - check
            every column, and add any course or asset category that gets refused under{" "}
            <strong>Administration → Operations</strong>.
          </p>
        </div>
      }
      runs={report.importRuns}
      buildPreview={(sheet, t, mapping) =>
        buildOperationsPreview(sheet, t, mapping, config) as OperationsImportPreview
      }
      onCommit={(preview, mode, sheetName, fileName) => {
        const result = applyOperationsImport(report, preview as OperationsImportPreview, {
          mode,
          fileName,
          actor,
        });
        const replaced =
          result.replacedSections.length > 0 ? ` Replaced existing ${result.replacedSections.join(", ")} records.` : "";
        const summary = `${result.accepted} row(s) imported into ${OPERATIONS_TARGET_LABELS[preview.target]} from "${sheetName}" in ${fileName}; ${result.rejected} rejected.${replaced}`;
        onApply(result.report, summary);
        toast.success(summary);
      }}
      onReadFailure={(reason, fileName) => {
        onApply(
          recordOperationsImportFailure(report, target, reason, { actor, fileName }),
          `Import failed: ${reason} (${fileName}).`
        );
      }}
    />
  );
}