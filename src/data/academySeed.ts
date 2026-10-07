// ============================================================================
// DEMO / SAMPLE DATA - NOT REAL BUHLE FARMERS ACADEMY PERFORMANCE.
// Academy vocabularies, blank record factories, KPI templates, a demo risk and
// a demo draft submission so the Academy & Alumni dashboard has something to
// show before live data is connected.
// ============================================================================
import type { Kpi, Risk } from "../types";
import {
  ACADEMY_DEPARTMENT,
  ACADEMY_KPI_IDS,
  type AccreditationStatus,
  type AcademyCommentary,
  type AcademyConfig,
  type AcademyReport,
  type AssessmentRecord,
  type AssessmentResult,
  type CertificationRecord,
  type CertificationStatus,
  type IntakeRecord,
  type ProgrammeRecord,
  type ProgrammeStatus,
} from "../types/academy";

export const DEFAULT_ACCREDITATION_STATUSES = [
  "Accredited",
  "Pending",
  "Expired",
  "Not required",
] as const satisfies readonly AccreditationStatus[];

export const DEFAULT_PROGRAMME_STATUSES = ["Active", "Paused", "Discontinued"] as const satisfies readonly ProgrammeStatus[];

export const DEFAULT_ASSESSMENT_RESULTS = [
  "Competent",
  "Not Yet Competent",
  "Absent",
] as const satisfies readonly AssessmentResult[];

export const DEFAULT_CERTIFICATION_STATUSES = [
  "Eligible",
  "Submitted to SETA",
  "Certified",
  "Withheld",
] as const satisfies readonly CertificationStatus[];

export const DEFAULT_ACCREDITING_BODIES = ["AgriSETA", "QCTO", "None"] as const;

export const DEFAULT_ACADEMY_CONFIG: AcademyConfig = {
  // Quarterly: intakes, assessment rounds and SETA certification batches all
  // move on a term-sized timescale, so a monthly cycle would mostly report
  // empty registers.
  reportingFrequency: "Quarterly",
  accreditationStatuses: [...DEFAULT_ACCREDITATION_STATUSES],
  programmeStatuses: [...DEFAULT_PROGRAMME_STATUSES],
  assessmentResults: [...DEFAULT_ASSESSMENT_RESULTS],
  certificationStatuses: [...DEFAULT_CERTIFICATION_STATUSES],
  accreditingBodies: [...DEFAULT_ACCREDITING_BODIES],
};

// ---------------------------------------------------------------------------
// Blank record factories
// ---------------------------------------------------------------------------

export function blankProgrammeRecord(): ProgrammeRecord {
  return {
    id: "",
    name: "",
    nqfLevel: null,
    accreditingBody: "",
    accreditationStatus: "",
    accreditationExpiry: "",
    status: "",
    notes: "",
  };
}

export function blankIntakeRecord(): IntakeRecord {
  return {
    id: "",
    programme: "",
    intake: "",
    startDate: "",
    capacity: null,
    applicationsReceived: null,
    applicationsAccepted: null,
    learnersRegistered: null,
    notes: "",
  };
}

export function blankAssessmentRecord(): AssessmentRecord {
  return {
    id: "",
    learner: "",
    programme: "",
    module: "",
    assessmentDate: "",
    result: "",
    moderated: false,
    reassessment: false,
    notes: "",
  };
}

export function blankCertificationRecord(): CertificationRecord {
  return {
    id: "",
    learner: "",
    programme: "",
    cohort: "",
    completionDate: "",
    status: "",
    certificateDate: "",
    graduated: false,
    notes: "",
  };
}

export function blankAcademyCommentary(): AcademyCommentary {
  return { overall: "", keyIssue: "", keyAchievement: "", kpiExplanations: {} };
}

/** A new, empty submission. Registers start empty rather than with a blank
 *  row, so a draft cannot "report" a record that says nothing. */
export function createBlankAcademyReport(params: {
  cycleId: string;
  reportingPeriod: string;
  frequency: AcademyReport["frequency"];
  startDate: string;
  dueDate: string;
}): AcademyReport {
  const envelope = () => ({ commentary: "", notApplicable: false });
  return {
    id: `acad-report-${params.cycleId}`,
    cycleId: params.cycleId,
    department: ACADEMY_DEPARTMENT,
    reportingPeriod: params.reportingPeriod,
    frequency: params.frequency,
    startDate: params.startDate,
    dueDate: params.dueDate,
    programmes: { records: [], ...envelope() },
    intakes: { records: [], ...envelope() },
    assessments: { records: [], ...envelope() },
    certification: { records: [], ...envelope() },
    commentary: blankAcademyCommentary(),
    dataSource: { kind: "Not Submitted" },
    status: "Not Submitted",
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

const hist = (values: number[]) => values.map((value, i) => ({ period: `P${i + 1}`, value }));

const base = {
  department: ACADEMY_DEPARTMENT,
  measurementFrequency: "quarterly" as const,
  owner: "Academy & Alumni Manager",
  lastUpdated: "2026-07-10",
  thresholdApproval: "proposed" as const,
};

/**
 * Academy KPIs, seeded with demo values for the previous quarter so the
 * dashboard has a position to show. Every figure is recalculated from the
 * registers the moment an Academy submission lands.
 *
 * Thresholds are PROPOSED starting points, not Board-approved. The three
 * figures with no sensible default (acceptance rate, moderation coverage and
 * graduate count) ship with no threshold at all and report "threshold not
 * set" rather than an invented verdict.
 */
export const ACADEMY_SUBMISSION_KPIS: Kpi[] = [
  {
    ...base,
    id: ACADEMY_KPI_IDS.accreditedProgrammes,
    name: "Accredited Programme Rate",
    unit: "percent",
    currentValue: 85.7,
    previousValue: 100,
    target: 100,
    greenThreshold: 100,
    amberThreshold: 85,
    history: hist([100, 100, 100, 100, 100, 85.7]),
    insight:
      "One active programme (Animal Production NQF 4) is awaiting AgriSETA re-accreditation, so 6 of 7 accreditable programmes are currently accredited.",
    sourceSystem: "Academy submission - programme register",
  },
  {
    ...base,
    id: ACADEMY_KPI_IDS.applicationAcceptance,
    name: "Application Acceptance Rate",
    unit: "percent",
    currentValue: 51.2,
    previousValue: 48.6,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([44.1, 46.3, 47.9, 48.6, 50.2, 51.2]),
    insight:
      "Accepted applications as a share of applications received. Monitored only; no approved target yet.",
    sourceSystem: "Academy submission - intake register",
  },
  {
    ...base,
    id: ACADEMY_KPI_IDS.intakeFillRate,
    name: "Intake Fill Rate",
    unit: "percent",
    currentValue: 82,
    previousValue: 87.5,
    target: 95,
    greenThreshold: 90,
    amberThreshold: 75,
    history: hist([91, 93, 89, 90, 87.5, 82]),
    insight:
      "Registered learners as a share of places offered. Mixed Farming Systems registered well below capacity, pulling the overall fill rate into amber.",
    sourceSystem: "Academy submission - intake register",
  },
  {
    ...base,
    id: ACADEMY_KPI_IDS.competencyRate,
    name: "Assessment Competency Rate",
    unit: "percent",
    currentValue: 81.2,
    previousValue: 78.4,
    target: 85,
    greenThreshold: 80,
    amberThreshold: 70,
    history: hist([74.5, 76, 77.2, 79, 78.4, 81.2]),
    insight:
      "Competent results as a share of learners assessed (absentees excluded). Improving for a third consecutive quarter.",
    sourceSystem: "Academy submission - assessment register",
  },
  {
    ...base,
    id: ACADEMY_KPI_IDS.moderationCoverage,
    name: "Moderation Coverage",
    unit: "percent",
    currentValue: 24,
    previousValue: 21,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([15, 18, 20, 22, 21, 24]),
    insight:
      "Share of assessment results that were moderated. The required sampling level has not been confirmed with AgriSETA/QCTO yet.",
    sourceSystem: "Academy submission - assessment register",
  },
  {
    ...base,
    id: ACADEMY_KPI_IDS.certificationRate,
    name: "Certification Rate",
    unit: "percent",
    currentValue: 66.7,
    previousValue: 74.1,
    target: 90,
    greenThreshold: 85,
    amberThreshold: 70,
    history: hist([81, 79.5, 77, 75.2, 74.1, 66.7]),
    insight:
      "Certified learners as a share of learners who completed. SETA certificate turnaround has slowed, leaving completers waiting on certificates.",
    sourceSystem: "Academy submission - certification register",
  },
  {
    ...base,
    id: ACADEMY_KPI_IDS.graduates,
    name: "Graduates This Period",
    unit: "count",
    currentValue: 42,
    previousValue: 38,
    target: 0,
    greenThreshold: null,
    amberThreshold: null,
    history: hist([31, 35, 40, 36, 38, 42]),
    insight:
      "Learners who graduated this period. This is the population the Alumni tracer study will try to reach six months from now.",
    sourceSystem: "Academy submission - certification register",
  },
];

/** The open demo risk behind the red Certification Rate KPI. */
export const ACADEMY_DEMO_RISKS: Risk[] = [
  {
    id: "risk-academy-1",
    category: "Academic",
    department: ACADEMY_DEPARTMENT,
    name: "Certification backlog",
    description:
      "Certification rate has fallen to 66.7%, below the 70% amber threshold. Completers are waiting on SETA-issued certificates.",
    kpiId: ACADEMY_KPI_IDS.certificationRate,
    currentValue: 66.7,
    target: 90,
    threshold: 70,
    level: "red",
    reportingPeriod: "Q2 2026",
    dateDetected: "2026-07-10",
    owner: "Academy & Alumni Manager",
    recommendedAction: "Escalate outstanding certificate batches with AgriSETA and confirm expected issue dates.",
    escalationLevel: "Executive Management",
    status: "Active",
  },
];

// ---------------------------------------------------------------------------
// Demo draft submission for the open Academy cycle
// ---------------------------------------------------------------------------

export const ACADEMY_DEMO_CYCLE_ID = "cyc-academy-2026-q3";

let seq = 0;
const rid = (prefix: string) => `acad-demo-${prefix}-${++seq}`;

const programme = (
  name: string,
  nqfLevel: number | null,
  accreditingBody: string,
  accreditationStatus: AccreditationStatus,
  accreditationExpiry: string,
  notes = ""
): ProgrammeRecord => ({
  id: rid("prog"),
  name,
  nqfLevel,
  accreditingBody,
  accreditationStatus,
  accreditationExpiry,
  status: "Active",
  notes,
});

const assessment = (
  learner: string,
  programmeName: string,
  module: string,
  assessmentDate: string,
  result: AssessmentResult,
  moderated = false,
  reassessment = false
): AssessmentRecord => ({
  id: rid("asmt"),
  learner,
  programme: programmeName,
  module,
  assessmentDate,
  result,
  moderated,
  reassessment,
  notes: "",
});

const certification = (
  learner: string,
  programmeName: string,
  completionDate: string,
  status: CertificationStatus,
  certificateDate: string,
  graduated: boolean
): CertificationRecord => ({
  id: rid("cert"),
  learner,
  programme: programmeName,
  cohort: "2025 Intake B",
  completionDate,
  status,
  certificateDate,
  graduated,
  notes: "",
});

/**
 * A draft for Q3 2026, pre-filled with sample rows so the Academy submission
 * opens with realistic data. It is a DRAFT: none of these rows count towards
 * the KPIs until Grace reviews and submits it.
 */
export function createDemoAcademyDraft(): AcademyReport {
  const report = createBlankAcademyReport({
    cycleId: ACADEMY_DEMO_CYCLE_ID,
    reportingPeriod: "Q3 2026",
    frequency: DEFAULT_ACADEMY_CONFIG.reportingFrequency,
    startDate: "2026-07-01",
    dueDate: "2026-10-15",
  });

  return {
    ...report,
    status: "Draft",
    savedAt: "2026-10-02T09:30:00.000Z",
    programmes: {
      ...report.programmes,
      records: [
        programme("Plant Production NQF 2", 2, "AgriSETA", "Accredited", "2028-03-31"),
        programme("Plant Production NQF 4", 4, "AgriSETA", "Accredited", "2027-11-30"),
        programme("Animal Production NQF 2", 2, "AgriSETA", "Accredited", "2028-06-30"),
        programme(
          "Animal Production NQF 4",
          4,
          "AgriSETA",
          "Pending",
          "",
          "Re-accreditation submitted to AgriSETA in August 2026."
        ),
        programme("Mixed Farming Systems NQF 2", 2, "QCTO", "Accredited", "2029-01-31"),
        programme("Agri-Business Management NQF 5", 5, "QCTO", "Accredited", "2027-08-31"),
        programme("Poultry Production Skills Programme", null, "AgriSETA", "Accredited", "2026-12-31"),
        programme("Farm Enterprise Short Course", null, "None", "Not required", ""),
      ],
    },
    intakes: {
      ...report.intakes,
      records: [
        {
          id: rid("intk"),
          programme: "Plant Production NQF 2",
          intake: "2026 Intake B",
          startDate: "2026-07-14",
          capacity: 40,
          applicationsReceived: 112,
          applicationsAccepted: 44,
          learnersRegistered: 38,
          notes: "",
        },
        {
          id: rid("intk"),
          programme: "Animal Production NQF 2",
          intake: "2026 Intake B",
          startDate: "2026-07-14",
          capacity: 30,
          applicationsReceived: 74,
          applicationsAccepted: 32,
          learnersRegistered: 27,
          notes: "",
        },
        {
          id: rid("intk"),
          programme: "Mixed Farming Systems NQF 2",
          intake: "2026 Intake B",
          startDate: "2026-07-21",
          capacity: 30,
          applicationsReceived: 58,
          applicationsAccepted: 30,
          learnersRegistered: 22,
          notes: "Eight accepted applicants did not take up their place; transport cited.",
        },
        {
          id: rid("intk"),
          programme: "Farm Enterprise Short Course",
          intake: "September 2026",
          startDate: "2026-09-07",
          capacity: 25,
          applicationsReceived: 31,
          applicationsAccepted: 25,
          learnersRegistered: 24,
          notes: "",
        },
      ],
    },
    assessments: {
      ...report.assessments,
      records: [
        assessment("Sibusiso Nkosi", "Plant Production NQF 2", "Soil Preparation", "2026-08-20", "Competent", true),
        assessment("Lerato Mabena", "Plant Production NQF 2", "Soil Preparation", "2026-08-20", "Competent"),
        assessment("Mandla Sithole", "Plant Production NQF 2", "Soil Preparation", "2026-08-20", "Not Yet Competent"),
        assessment("Zanele Mthembu", "Plant Production NQF 2", "Crop Protection", "2026-09-10", "Competent"),
        assessment("Kagiso Mokoena", "Animal Production NQF 2", "Animal Handling", "2026-08-27", "Competent", true),
        assessment("Nokuthula Dube", "Animal Production NQF 2", "Animal Handling", "2026-08-27", "Competent"),
        assessment("Tshepo Ramaphosa", "Animal Production NQF 2", "Animal Handling", "2026-08-27", "Absent"),
        assessment("Palesa Khoza", "Animal Production NQF 2", "Feed & Nutrition", "2026-09-17", "Competent"),
        assessment("Bongani Ngcobo", "Mixed Farming Systems NQF 2", "Farm Planning", "2026-09-03", "Competent", true),
        assessment("Thandeka Zwane", "Mixed Farming Systems NQF 2", "Farm Planning", "2026-09-03", "Not Yet Competent"),
        assessment("Mandla Sithole", "Plant Production NQF 2", "Soil Preparation", "2026-09-24", "Competent", false, true),
        assessment("Ayanda Shabalala", "Mixed Farming Systems NQF 2", "Farm Planning", "2026-09-03", "Competent"),
      ],
    },
    certification: {
      ...report.certification,
      records: [
        certification("Musa Hlongwane", "Plant Production NQF 2", "2026-07-18", "Certified", "2026-09-12", true),
        certification("Precious Mahlangu", "Plant Production NQF 2", "2026-07-18", "Certified", "2026-09-12", true),
        certification("Themba Msimang", "Animal Production NQF 2", "2026-07-25", "Certified", "2026-09-19", true),
        certification("Refilwe Moloi", "Animal Production NQF 2", "2026-07-25", "Certified", "2026-09-19", true),
        certification("Sizwe Mabuza", "Mixed Farming Systems NQF 2", "2026-08-01", "Certified", "2026-09-26", true),
        certification("Nomsa Vilakazi", "Mixed Farming Systems NQF 2", "2026-08-01", "Submitted to SETA", "", true),
        certification("Lwazi Cele", "Agri-Business Management NQF 5", "2026-08-15", "Submitted to SETA", "", false),
        certification("Dineo Masilela", "Agri-Business Management NQF 5", "2026-08-15", "Eligible", "", false),
      ],
    },
    commentary: {
      ...report.commentary,
      overall:
        "Intake B registered 111 learners across four programmes. Competency is improving, but SETA certificate turnaround remains slow.",
    },
  };
}
