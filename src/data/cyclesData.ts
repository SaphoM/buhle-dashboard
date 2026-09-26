// ============================================================================
// DEMO / SAMPLE DATA — Data Collection Cycles.
// Frequencies and engagement levels are grounded in the real Sept 2026
// discovery evidence: Finance (Pastel → Budget Monitor, updated monthly)
// and HR (KPI Calc workbook, run quarterly — Q1/Q2/Q3 2026 sheets already
// exist) have actually engaged. Operations, Commercial Farming, Marketing
// and Alumni have not yet submitted a discovery questionnaire, which this
// dataset reflects honestly (Upcoming/Overdue rather than In Progress).
// ============================================================================
import type { DataCollectionCycle } from "../types";

export const DEMO_CYCLES: DataCollectionCycle[] = [
  {
    cycleId: "cyc-finance-2026-09",
    department: "Finance",
    dataset: "Budget Monitor (Actuals)",
    description: "Income and expense actuals by cost centre (Delmas Campus, Support Office, Comm. Enterprises), reconciled against Pastel.",
    frequency: "Monthly",
    reportingPeriod: "September 2026",
    startDate: "2026-09-01",
    dueDate: "2026-10-05",
    status: "In Progress",
    owner: "Finance Manager",
    completionPct: 65,
    notes: "Confirmed cadence — the real Budget Monitor workbook is updated monthly per the Finance discovery questionnaire.",
  },
  {
    cycleId: "cyc-hr-2026-q3",
    department: "Human Resources",
    dataset: "HR KPI Pack (Turnover, Time to Fill, Cost per Hire, Offer Acceptance)",
    description: "Quarterly headcount and recruitment KPI pack, per the HR KPI Calc workbook.",
    frequency: "Quarterly",
    reportingPeriod: "Q3 2026",
    startDate: "2026-07-01",
    dueDate: "2026-10-15",
    status: "In Progress",
    owner: "HR Manager",
    completionPct: 70,
    notes: "Confirmed cadence — Q1/Q2/Q3 2026 sheets already exist in the real HR workbook.",
  },
  {
    cycleId: "cyc-hr-attendance-2026-09",
    department: "Human Resources",
    dataset: "Staff Attendance Register",
    description: "Digitised daily attendance — not yet possible; paper registers only.",
    frequency: "Daily",
    reportingPeriod: "September 2026",
    startDate: "2026-09-01",
    dueDate: "2026-09-20",
    // Baseline status is "Open", not "Overdue" — getEffectiveStatus derives
    // Overdue automatically once the due date passes, per Section 48
    // ("the system must calculate these automatically where possible").
    status: "Open",
    owner: "HR Manager",
    completionPct: 0,
    notes: "No digital system exists yet — see the Staff Absenteeism Rate KPI (No Data) and the Administration → To Confirm Register.",
  },
  {
    cycleId: "cyc-operations-2026-t3",
    department: "Operations",
    dataset: "Enrolment, Attendance & Completion Pack",
    description: "Learner enrolment, attendance and course outcomes for the current cohort/term.",
    frequency: "Per Cohort",
    reportingPeriod: "Term 3 2026",
    startDate: "2026-08-01",
    dueDate: "2026-09-18",
    status: "Open",
    owner: "Head of Training",
    completionPct: 0,
    notes: "No Operations/Training discovery questionnaire has been submitted yet.",
  },
  {
    cycleId: "cyc-farming-2026-summer",
    department: "Commercial Farming",
    dataset: "Crop Plan & Production Pack",
    description: "Crop plan, planting/harvest activity, livestock register and sales volumes for the season.",
    frequency: "Per Season",
    reportingPeriod: "2026/27 Summer Season",
    startDate: "2026-10-01",
    dueDate: "2026-11-15",
    status: "Upcoming",
    owner: "Farm Manager",
    completionPct: 0,
    notes: "No Commercial Farming discovery questionnaire has been submitted yet.",
  },
  {
    cycleId: "cyc-marketing-2026-09",
    department: "Marketing",
    dataset: "Enquiry & Campaign Log",
    description: "Enquiry log, website/social analytics and campaign performance for the month.",
    frequency: "Monthly",
    reportingPeriod: "September 2026",
    startDate: "2026-09-01",
    dueDate: "2026-09-20",
    status: "Open",
    owner: "Marketing Manager",
    completionPct: 0,
    notes: "No Marketing discovery questionnaire has been submitted yet.",
  },
  {
    cycleId: "cyc-alumni-2026-h2",
    department: "Alumni",
    dataset: "Tracer Survey",
    description: "Employment/business status, farm outcome and engagement check for graduates reaching 6 months post-graduation.",
    frequency: "6 Months After Graduation",
    reportingPeriod: "H2 2026 Cohort",
    startDate: "2026-09-01",
    dueDate: "2026-11-01",
    status: "Upcoming",
    owner: "Alumni Coordinator",
    completionPct: 0,
    notes: "No Alumni discovery questionnaire has been submitted yet.",
  },
];
