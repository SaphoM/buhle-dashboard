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
      primaryAction={{ label: "Save Draft", onClick: () => {} }}
      secondaryActions={[{ label: "Cancel", onClick: onClose }]}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft/70">
          Business Development submission modal scaffolded. Reporting period: {report.reportingPeriod || "TBD"}
        </p>
      </div>
    </Modal>
  );
}
