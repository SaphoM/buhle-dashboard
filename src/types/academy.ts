import type { Kpi, ReportingFrequency } from "./index";

/**
 * ============================================================================
 * ACADEMY - the academic side of Buhle Farmers' Academy.
 * ============================================================================
 *
 * Academy sits on the same dashboard as Alumni, owned by the same manager,
 * because the two are one pipeline: Academy is what happens to a learner while
 * they are with Buhle (which programme, which intake, how they were assessed,
 * whether they were certified), and Alumni is what happens to them after they
 * leave. The Academy certification register is where a learner becomes a
 * graduate, and that graduate count is the population the Alumni tracer study
 * then tries to reach.
 *
 * Academy is deliberately NOT a copy of Operations. Operations reports
 * delivery: enrolment, attendance, contact hours, dropouts, projects, assets.
 * Academy reports academic quality and outcomes:
 *
 *   - Programmes: what Buhle is accredited to offer, and whether that
 *     accreditation is current.
 *   - Intakes: how many applied, how many were accepted, how many registered
 *     against the capacity on offer.
 *   - Assessments: competency outcomes per learner per module, and whether
 *     the result was moderated.
 *   - Certification: who completed, who was certified, who graduated.
 *
 * The rules are the same as every other register department:
 *
 *  - Every KPI is DERIVED from rows. There is no percentage input anywhere.
 *  - Every captured figure is nullable. "Not supplied" is not zero.
 *  - Every section can be marked Not Applicable for a period in which the
 *    activity genuinely did not happen (no intake this term is a real fact).
 */

export const ACADEMY_DEPARTMENT = "Academy" as const;

export const ACADEMY_SECTION_KEYS = ["programmes", "intakes", "assessments", "certification"] as const;

export type AcademySectionKey = (typeof ACADEMY_SECTION_KEYS)[number];

export const ACADEMY_SECTION_LABELS: Record<AcademySectionKey, string> = {
  programmes: "Programmes",
  intakes: "Intakes",
  assessments: "Assessments",
  certification: "Certification",
};

/** One-line explanation shown on each section, so a manager knows what the
 *  register is for before opening it. */
export const ACADEMY_SECTION_PURPOSE: Record<AcademySectionKey, string> = {
  programmes: "What Buhle is accredited to offer, and whether that accreditation is current.",
  intakes: "Applications, acceptances and registrations against the capacity offered.",
  assessments: "Competency outcomes per learner per module, and whether each was moderated.",
  certification: "Who completed, who was certified, and who graduated into the Alumni population.",
};

/** Per-section completion state in the modal's progress strip. */
export type AcademySectionState = "complete" | "incomplete" | "attention" | "not_applicable";

/** Shared section envelope: records, commentary, and the explicit N/A switch. */
export interface AcademySectionEnvelope {
  commentary: string;
  notApplicable: boolean;
}

// ---------------------------------------------------------------------------
// Approved vocabularies
// ---------------------------------------------------------------------------

export type AccreditationStatus = "Accredited" | "Pending" | "Expired" | "Not required";

export type ProgrammeStatus = "Active" | "Paused" | "Discontinued";

export type AssessmentResult = "Competent" | "Not Yet Competent" | "Absent";

export type CertificationStatus = "Eligible" | "Submitted to SETA" | "Certified" | "Withheld";

// ---------------------------------------------------------------------------
// Section 1 - Programmes
// ---------------------------------------------------------------------------

/**
 * One row per programme Buhle offers.
 *
 * Accreditation is recorded with its expiry date, because "Accredited" on a
 * register and "accredited until last March" are different facts, and only one
 * of them lets Buhle legally certify a learner.
 */
export interface ProgrammeRecord {
  id: string;
  name: string;
  /** NQF level, where the programme is a registered qualification. */
  nqfLevel: number | null;
  /** Accrediting or quality-assurance body, e.g. AgriSETA, QCTO. */
  accreditingBody: string;
  accreditationStatus: AccreditationStatus | "";
  /** ISO date the accreditation lapses. Blank where none is required. */
  accreditationExpiry: string;
  status: ProgrammeStatus | "";
  notes: string;
}

export interface AcademyProgrammeData extends AcademySectionEnvelope {
  records: ProgrammeRecord[];
}

// ---------------------------------------------------------------------------
// Section 2 - Intakes
// ---------------------------------------------------------------------------

/**
 * One row per programme intake.
 *
 * Applications, acceptances and registrations are three separate counts rather
 * than one funnel percentage: an applicant who was accepted but never arrived
 * is a different failure from one who was never accepted, and collapsing them
 * hides which one Buhle has.
 */
export interface IntakeRecord {
  id: string;
  /** Programme, matched against the programme register. */
  programme: string;
  /** Intake label, e.g. "2026 Intake B". */
  intake: string;
  startDate: string;
  /** Places offered on this intake. The denominator of the fill rate. */
  capacity: number | null;
  applicationsReceived: number | null;
  applicationsAccepted: number | null;
  /** Learners who actually registered. */
  learnersRegistered: number | null;
  notes: string;
}

export interface AcademyIntakeData extends AcademySectionEnvelope {
  records: IntakeRecord[];
}

// ---------------------------------------------------------------------------
// Section 3 - Assessments
// ---------------------------------------------------------------------------

/**
 * One row per learner per module assessed.
 *
 * "Absent" is its own result rather than Not Yet Competent: a learner who did
 * not sit the assessment has not been found not competent, and counting them
 * as a failure would understate the competency rate of those who were assessed.
 */
export interface AssessmentRecord {
  id: string;
  learner: string;
  programme: string;
  module: string;
  assessmentDate: string;
  result: AssessmentResult | "";
  /** Whether this result was internally or externally moderated. */
  moderated: boolean;
  /** Whether this was a re-assessment after an earlier Not Yet Competent. */
  reassessment: boolean;
  notes: string;
}

export interface AcademyAssessmentData extends AcademySectionEnvelope {
  records: AssessmentRecord[];
}

// ---------------------------------------------------------------------------
// Section 4 - Certification
// ---------------------------------------------------------------------------

/**
 * One row per learner who finished a programme this period.
 *
 * Eligible, submitted and certified are separate states because certificates
 * are issued by the SETA, not by Buhle: a learner Buhle has signed off can wait
 * months for the certificate, and that wait is the thing worth seeing.
 */
export interface CertificationRecord {
  id: string;
  learner: string;
  programme: string;
  cohort: string;
  completionDate: string;
  status: CertificationStatus | "";
  /** ISO date the certificate was issued. Required once Certified. */
  certificateDate: string;
  /** Whether the learner graduated, joining the Alumni population. */
  graduated: boolean;
  notes: string;
}

export interface AcademyCertificationData extends AcademySectionEnvelope {
  records: CertificationRecord[];
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

export type AcademyReportStatus = "Not Submitted" | "Draft" | "Submitted";

export type AcademySourceKind = "Manual Entry" | "Not Submitted";

export interface AcademyDataSource {
  kind: AcademySourceKind;
  enteredBy?: string;
  enteredAt?: string;
}

export interface AcademyCommentary {
  overall: string;
  keyIssue: string;
  keyAchievement: string;
  /** Per-KPI explanation, keyed by KPI id, for Amber/Red figures. */
  kpiExplanations: Record<string, string>;
}

export interface AcademyReport {
  id: string;
  cycleId: string;
  department: typeof ACADEMY_DEPARTMENT;
  reportingPeriod: string;
  frequency: ReportingFrequency;
  startDate: string;
  dueDate: string;
  programmes: AcademyProgrammeData;
  intakes: AcademyIntakeData;
  assessments: AcademyAssessmentData;
  certification: AcademyCertificationData;
  commentary: AcademyCommentary;
  dataSource: AcademyDataSource;
  status: AcademyReportStatus;
  savedAt?: string;
  submittedAt?: string;
  submittedBy?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AcademyConfig {
  reportingFrequency: ReportingFrequency;
  accreditationStatuses: AccreditationStatus[];
  programmeStatuses: ProgrammeStatus[];
  assessmentResults: AssessmentResult[];
  certificationStatuses: CertificationStatus[];
  accreditingBodies: string[];
}

// ---------------------------------------------------------------------------
// KPI ids
// ---------------------------------------------------------------------------

export const ACADEMY_KPI_IDS = {
  accreditedProgrammes: "kpi-academy-accredited-programmes",
  applicationAcceptance: "kpi-academy-application-acceptance",
  intakeFillRate: "kpi-academy-intake-fill-rate",
  competencyRate: "kpi-academy-competency-rate",
  moderationCoverage: "kpi-academy-moderation-coverage",
  certificationRate: "kpi-academy-certification-rate",
  graduates: "kpi-academy-graduates",
} as const satisfies Record<string, string>;

export type AcademyKpiId = (typeof ACADEMY_KPI_IDS)[keyof typeof ACADEMY_KPI_IDS];

export type AcademySubmissionKpi = Kpi;
