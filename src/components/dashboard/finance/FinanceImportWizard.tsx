import { useState } from "react";
import { useToast } from "../../common/ToastContext";
import { WorkbookImportWizard } from "../../common/WorkbookImportWizard";
import {
  TARGET_FIELDS,
  TARGET_LABELS,
  applyImport,
  buildPreview,
  recordImportFailure,
  type ImportPreview,
  type ImportTarget,
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
 * Section 26's two hard rules are enforced by the shared wizard rather than by
 * this file:
 *  - Nothing is committed until Finance has seen a preview and confirmed it.
 *  - Existing figures are never overwritten silently; the mode is an explicit
 *    choice and the choice is recorded on the ImportRun.
 *
 * What stays here is the Finance part: which sections exist, which columns each
 * one has, and the rule that a category must be a real configured category.
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

  return (
    <WorkbookImportWizard
      target={target}
      onTargetChange={setTarget}
      targetLabels={TARGET_LABELS}
      fieldsFor={(t) => TARGET_FIELDS[t]}
      heading="Import from the Finance workbook"
      intro="Upload the Budget Monitor workbook, choose which worksheet feeds which section, confirm the column mapping, then review exactly what will be imported. Nothing is written until you confirm."
      notice={<FinanceWorkbookDependencyNotice dependency={FINANCE_WORKBOOK_DEPENDENCY} />}
      runs={report.importRuns}
      buildPreview={(sheet, t, mapping) =>
        buildPreview(sheet, t, mapping, {
          revenueCategories: config.revenueCategories,
          expenseCategories: config.expenseCategories,
        })
      }
      onCommit={(preview, mode, sheetName, fileName) => {
        const result = applyImport(report, preview as ImportPreview, { fileName, actor: "Finance", mode });
        const replaced =
          result.replacedSections.length > 0 ? ` Replaced existing ${result.replacedSections.join(", ")} rows.` : "";
        const summary = `${result.accepted} row(s) imported into ${TARGET_LABELS[preview.target]} from "${sheetName}" in ${fileName}; ${result.rejected} rejected.${replaced}`;
        onApply(result.report, summary);
        toast.success(summary);
      }}
      onReadFailure={(reason, fileName) => {
        onApply(
          recordImportFailure(report, reason, fileName, target),
          `Import failed: ${reason} (${fileName}).`
        );
      }}
    />
  );
}