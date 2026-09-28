// ============================================================================
// MASTER / REFERENCE DATA
// ----------------------------------------------------------------------------
// Shared identifiers so department codes, cost centres and funder codes are
// governed in one place rather than scattered as hard-coded strings across
// the app (per the Sept 2026 discovery brief, Sections 6–7).
//
// Every entry is labelled with its evidence status:
//   "confirmed" - verified against a real Buhle document supplied during
//                 discovery (the Finance budget monitor, HR KPI workbooks,
//                 or a department questionnaire).
//   "proposed"  - a sensible starting point suggested in the discovery brief,
//                 not yet evidenced in a real Buhle document.
// Nothing here should be treated as final until an administrator confirms it.
// ============================================================================

export type EvidenceStatus = "confirmed" | "proposed" | "to_confirm";

export interface MasterRecord {
  code: string;
  label: string;
  status: EvidenceStatus;
  note?: string;
}

// Confirmed directly from "Final Budget monitor for 2026 ending September
// 2026.xlsx" (Finance discovery submission, Sept 2026) - these are the three
// actual cost-centre tabs in Buhle's own budget monitor.
const BUDGET_MONITOR_NOTE =
  "Confirmed directly from Buhle's own 2026 Budget Monitor (Finance discovery submission, Sept 2026).";

export const COST_CENTRES: MasterRecord[] = [
  { code: "DELMAS", label: "Delmas Campus", status: "confirmed", note: BUDGET_MONITOR_NOTE },
  { code: "SUPPORT", label: "Support Office", status: "confirmed", note: BUDGET_MONITOR_NOTE },
  { code: "COMM_ENT", label: "Comm. Enterprises", status: "confirmed", note: BUDGET_MONITOR_NOTE },
];

// Listed in the discovery brief as example funder/project codes. Not present
// as a column in the actual Finance budget monitor supplied - the workbook
// only carries a Cost Centre column, not a funder/project tag. Treat these as
// proposed until Finance confirms how (or whether) they track this.
const FUNDER_CODE_NOTE =
  "Listed as an example funder in the discovery brief - not present as a column in the actual Finance budget monitor supplied. Treat as proposed until Finance confirms.";

export const FUNDER_CODES: MasterRecord[] = [
  { code: "TSHIKULULU", label: "Tshikululu", status: "proposed", note: FUNDER_CODE_NOTE },
  { code: "EXXARO", label: "Exxaro", status: "proposed", note: FUNDER_CODE_NOTE },
  { code: "HCI", label: "HCI", status: "proposed", note: FUNDER_CODE_NOTE },
];

// Enterprise codes actually seen as line items in the Finance budget monitor
// (Maize, Sweet Corn, Green Mealies, Vegetables, Broilers) are confirmed;
// the remainder are proposed in the discovery brief but not yet evidenced.
const ENTERPRISE_CONFIRMED_NOTE = "Confirmed as a line item in Buhle's Finance budget monitor.";
const ENTERPRISE_PROPOSED_NOTE =
  "Proposed in the discovery brief - not yet evidenced as a line item in a supplied Finance document.";

export const ENTERPRISE_CODES: MasterRecord[] = [
  { code: "MAIZE", label: "Maize", status: "confirmed", note: ENTERPRISE_CONFIRMED_NOTE },
  { code: "SWEET_CORN", label: "Sweet Corn", status: "confirmed", note: ENTERPRISE_CONFIRMED_NOTE },
  { code: "GREEN_MEALIES", label: "Green Mealies", status: "confirmed", note: ENTERPRISE_CONFIRMED_NOTE },
  { code: "VEGETABLES", label: "Vegetables", status: "confirmed", note: ENTERPRISE_CONFIRMED_NOTE },
  { code: "BROILERS", label: "Broilers", status: "confirmed", note: ENTERPRISE_CONFIRMED_NOTE },
  { code: "SOYA", label: "Soya", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "BARLEY", label: "Barley", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "DRY_BEANS", label: "Dry Beans", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "PEAS", label: "Peas", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "POTATOES", label: "Potatoes", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "HERBS", label: "Herbs", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "SEEDLINGS", label: "Seedlings", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "LAYERS", label: "Layers", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "PIGS", label: "Pigs", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
  { code: "SMALL_STOCK", label: "Small Stock", status: "proposed", note: ENTERPRISE_PROPOSED_NOTE },
];

export interface DepartmentRecord extends MasterRecord {
  manager?: string; // TO CONFIRM unless directly named in a questionnaire response
}

// Section 5 of the discovery brief names 8 operational areas but only ~7
// departmental managers, without resolving which areas share a manager.
// Finance and HR are confirmed (they returned questionnaires + real data
// during Sept 2026 discovery); the rest are named in the brief but have not
// yet submitted anything, so ownership/grouping stays open.
export const DEPARTMENTS: DepartmentRecord[] = [
  {
    code: "FINANCE",
    label: "Finance",
    status: "confirmed",
    manager: "Thabiso Nthane (Manager)",
    note: "Confirmed - Thabiso Nthane (Manager) returned the Finance questionnaire with real budget data, Sept 2026.",
  },
  {
    code: "HR",
    label: "Human Resources",
    status: "confirmed",
    manager: "Zintle Bebeza (HR Manager)",
    note: "Confirmed - Zintle Bebeza (HR Manager) returned the HR questionnaire with real KPI Calc workbook data, Sept 2026.",
  },
  {
    code: "OPERATIONS",
    label: "Training / Operations",
    status: "proposed",
    manager: "TO CONFIRM",
    note: "Proposed - named in the discovery brief; manager and data not yet confirmed.",
  },
  {
    code: "COMMERCIAL_FARMING",
    label: "Commercial Farming",
    status: "proposed",
    manager: "TO CONFIRM",
    note: "Proposed - named in the discovery brief; manager and data not yet confirmed.",
  },
  {
    code: "VEGETABLE_PRODUCTION",
    label: "Vegetable Production",
    status: "to_confirm",
    manager: "TO CONFIRM",
    note: "To Confirm - whether this shares a manager with Commercial Farming or Livestock is still open.",
  },
  {
    code: "LIVESTOCK",
    label: "Livestock",
    status: "to_confirm",
    manager: "TO CONFIRM",
    note: "To Confirm - whether this shares a manager with Commercial Farming or Vegetable Production is still open.",
  },
  {
    code: "MARKETING",
    label: "Marketing",
    status: "proposed",
    manager: "TO CONFIRM",
    note: "Proposed - no Marketing questionnaire submitted yet.",
  },
  {
    code: "ALUMNI",
    label: "Alumni",
    status: "proposed",
    manager: "TO CONFIRM",
    note: "Proposed - no Alumni questionnaire submitted yet.",
  },
];

// Where each figure actually originates today, per the Sept 2026 discovery
// questionnaires - used to label KPI cards so nobody mistakes a manually
// captured number for a live feed.
export const DATA_SOURCES: Record<string, string> = {
  finance: "Pastel (transactions) → Budget Monitor spreadsheet (manual)",
  hrTurnoverEtc: "HR KPI Calc workbook (manual)",
  hrLeave: "Praxima (leave only - does not track absenteeism)",
  hrAttendance: "Paper attendance registers, introduced 2026 - not yet digitised",
};

export const TO_CONFIRM_REGISTER: { item: string; note?: string }[] = [
  { item: "Final departmental structure", note: "8 areas named in discovery brief; grouping under ~7 managers unresolved." },
  { item: "Seventh departmental manager / ownership", note: "Which of Commercial Farming / Vegetable Production / Livestock share a manager." },
  { item: "Final KPI targets", note: "Only Finance (Pastel budget) and HR (KPI Calc workbook, SABPP benchmarks) have supplied real targets so far." },
  { item: "Final enterprise-specific farming thresholds" },
  { item: "Final enrolment / completion targets", note: "No Operations/Training questionnaire submitted yet." },
  { item: "Existing Marketing records", note: "No Marketing questionnaire submitted yet." },
  { item: "Existing Alumni records", note: "No Alumni questionnaire submitted yet." },
  { item: "Marketing vs Business Development ownership" },
  { item: "Board approval of threshold register" },
  { item: "Final reporting frequencies" },
  { item: "Finance system of record", note: "Confirmed as Pastel (not Sage) - see Finance questionnaire, 22 Sept 2026." },
  { item: "Exact hosting/deployment environment", note: "Currently a static demo on GitHub Pages with in-memory demo auth; no backend/database yet." },
  { item: "Final notification provider" },
  { item: "Final historical data availability", note: "HR has 2025 + 2026 data; Finance has 2026 budget monitor only, so far." },
  { item: "Funder/project code tracking", note: "Tshikululu/Exxaro/HCI proposed in the brief but not present as a field in the actual Finance workbook supplied." },
];
