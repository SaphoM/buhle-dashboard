import { useState } from "react";
import { Modal } from "../../common/Modal";
import type { BdReport } from "../../../types/businessDevelopment";
import { BLANK_BD_REPORT } from "../../../data/businessDevelopmentSeed";

interface Props {
  open: boolean;
  onClose: () => void;
  reportingPeriod?: string;
  dueDate?: string;
}

export function BdSubmitDataModal({ open, onClose, reportingPeriod, dueDate }: Props) {
  const [report] = useState<BdReport>(() => ({
    ...BLANK_BD_REPORT,
    reportId: `bd-${Date.now()}`,
    reportingPeriod: reportingPeriod || "",
    dueDate: dueDate || "",
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Business Development Data"
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft/70">
          Business Development submission modal scaffolded. Reporting period: {report.reportingPeriod || "TBD"}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-ink/5 text-ink hover:bg-ink/10">
            Cancel
          </button>
          <button onClick={() => {}} className="px-3 py-1.5 text-sm rounded bg-brand text-white hover:bg-brand-strong">
            Save Draft
          </button>
        </div>
      </div>
    </Modal>
  );
  );
}
