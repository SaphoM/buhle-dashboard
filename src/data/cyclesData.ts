// ============================================================================
// DEMO / SAMPLE DATA - Data Collection Cycles.
// Frequencies and engagement levels are grounded in the real Sept 2026
// discovery evidence: Finance (Pastel → Budget Monitor, updated monthly)
// and HR (KPI Calc workbook, run quarterly - Q1/Q2/Q3 2026 sheets already
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
    description: "Income and expense actuals by cost centre (Delmas Campus, Support Office, Comm. Enterprises), captured through the six-section Finance submission or imported from the Budget Monitor workbook.",
    frequency: "Monthly",
    reportingPeriod: "September 2026",
    startDate: "2026-09-01",
    dueDate: "2026-10-05",
    status: "In Progress",
    owner: "Finance Manager",
    completionPct: 65,
    notes: "Confirmed cadence - the real Budget Monitor workbook is updated monthly per the Finance discovery questionnaire.",
    // Closest existing analogue to "Budget Remaining" (Section 52's Finance
    // example) - the app does not yet model a literal budget-remaining KPI.
    primaryKpiId: "kpi-surplus",
  },
  {
    // The consolidated HR Data Submission cycle introduced by the HR spec
    // (Section 1/2). It replaces the two ad-hoc HR packs below, which only
    // covered part of the picture: turnover and recruitment sat in one
    // quarterly pack while absenteeism sat in a separate register cycle.
    // One monthly cycle now drives all six HR sections and every HR KPI.
    cycleId: "cyc-hr-data-2026-09",
    department: "Human Resources",
    dataset: "HR Data Submission (Attendance, Leave, Performance, Turnover, Skills, Vacancies)",
    description:
      "Monthly consolidated HR report: attendance and absenteeism, leave, performance, turnover, skills and training, and the recruitment pipeline.",
    frequency: "Monthly",
    reportingPeriod: "September 2026",
    startDate: "2026-09-01",
    dueDate: "2026-09-30",
    status: "In Progress",
    owner: "HR Manager",
    completionPct: 0,
    notes: "Cadence is configurable in Administration → HR Configuration; monthly is the proposed default.",
    primaryKpiId: "kpi-absenteeism",
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
    // Superseded by cyc-hr-data-2026-09, which reports the same KPIs from the
    // underlying records instead of as a pre-calculated pack. Retained closed
    // rather than deleted so the quarterly history stays auditable.
    status: "Closed",
    owner: "HR Manager",
    completionPct: 100,
    notes: "Superseded by the consolidated monthly HR Data Submission cycle; figures now flow from HR records, not a manual pack.",
    primaryKpiId: "kpi-turnover",
  },
  {
    cycleId: "cyc-hr-attendance-2026-09",
    department: "Human Resources",
    dataset: "Staff Attendance Register",
    description: "Digitised daily attendance - not yet possible; paper registers only.",
    frequency: "Daily",
    reportingPeriod: "September 2026",
    startDate: "2026-09-01",
    dueDate: "2026-09-20",
    // Baseline status is "Open", not "Overdue" - getEffectiveStatus derives
    // Overdue automatically once the due date passes, per Section 48
    // ("the system must calculate these automatically where possible").
    // Superseded by cyc-hr-data-2026-09: attendance is now one of six
    // sections in the monthly report rather than its own daily cycle.
    status: "Closed",
    owner: "HR Manager",
    completionPct: 100,
    notes: "Superseded by the consolidated monthly HR Data Submission cycle. Paper registers are still the source - see the Staff Absenteeism Rate KPI and the Administration → To Confirm Register.",
    primaryKpiId: "kpi-absenteeism",
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
    primaryKpiId: "kpi-enrolment",
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
    primaryKpiId: "kpi-mortality",
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
    primaryKpiId: "kpi-enquiries",
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
    primaryKpiId: "kpi-alumni",
  },
];
