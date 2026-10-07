import { getStatusForValue } from "./kpiEngine";
import { ACADEMY_KPI_IDS, type AcademyConfig, type AcademyReport, type AcademySectionKey } from "../types/academy";
import type { Kpi } from "../types";

/**
 * ============================================================================
 * Academy engine - derives every Academy KPI from the four registers.
 * ============================================================================
 *
 * Same governing rule as every other register department: nothing typed
 * survives as a KPI, and a figure the registers cannot support is left
 * uncalculated with the reason attached rather than reported as zero.
 *
 * The decisions worth naming:
 *
 *  - Accreditation is judged on the DATE, not only the status. A programme
 *    marked Accredited whose accreditation expired last month is not
 *    accredited, and counting it as such is how a lapse goes unnoticed.
 *    Programmes that need no accreditation are excluded from the denominator.
 *
 *  - Absentees are excluded from the competency denominator. A learner who did
 *    not sit an assessment has not been found not competent.
 *
 *  - Withheld certificates stay IN the certification denominator. A learner
 *    who completed but whose certificate is withheld is exactly the case the
 *    rate exists to surface.
 */

const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

const sumOf = <T>(rows: T[], pick: (r: T) => number | null) => {
  const present = rows.map(pick).filter((v): v is number => v !== null);
  return present.length > 0 ? present.reduce((s, v) => s + v, 0) : null;
};

// ---------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------

export interface ProgrammeSummary {
  total: number;
  active: number;
  /** Active programmes that need accreditation. The denominator. */
  accreditable: number;
  /** Active, accreditable programmes with current, unexpired accreditation. */
  accredited: number;
  pending: number;
  /** Marked Accredited, but the expiry date has passed. */
  lapsed: { name: string; expiry: string }[];
  /** Accredited, expiring within 90 days. A warning, not a KPI. */
  expiringSoon: { name: string; expiry: string }[];
  accreditedRatePct: number | null;
}

export function summariseProgrammes(report: AcademyReport, today: Date = new Date()): ProgrammeSummary | null {
  const records = report.programmes.records;
  if (records.length === 0) return null;

  const active = records.filter((r) => r.status === "Active");
  const accreditable = active.filter((r) => r.accreditationStatus !== "Not required" && r.accreditationStatus !== "");
  const isCurrent = (expiry: string) => !expiry || new Date(expiry).getTime() >= today.getTime();
  const accredited = accreditable.filter((r) => r.accreditationStatus === "Accredited" && isCurrent(r.accreditationExpiry));
  const lapsed = accreditable
    .filter((r) => r.accreditationStatus === "Accredited" && !isCurrent(r.accreditationExpiry))
    .map((r) => ({ name: r.name, expiry: r.accreditationExpiry }));
  const soon = today.getTime() + 90 * 86400000;
  const expiringSoon = accredited
    .filter((r) => r.accreditationExpiry && new Date(r.accreditationExpiry).getTime() <= soon)
    .map((r) => ({ name: r.name, expiry: r.accreditationExpiry }));

  return {
    total: records.length,
    active: active.length,
    accreditable: accreditable.length,
    accredited: accredited.length,
    pending: accreditable.filter((r) => r.accreditationStatus === "Pending").length,
    lapsed,
    expiringSoon,
    accreditedRatePct: rate(accredited.length, accreditable.length),
  };
}

// ---------------------------------------------------------------------------
// Intakes
// ---------------------------------------------------------------------------

export interface IntakeSummary {
  intakes: number;
  capacity: number | null;
  applications: number | null;
  accepted: number | null;
  registered: number | null;
  acceptanceRatePct: number | null;
  fillRatePct: number | null;
  /** Accepted applicants who did not register. */
  noShows: number | null;
  byProgramme: { programme: string; capacity: number | null; registered: number | null; fillPct: number | null }[];
}

export function summariseIntakes(report: AcademyReport): IntakeSummary | null {
  const records = report.intakes.records;
  if (records.length === 0) return null;

  const capacity = sumOf(records, (r) => r.capacity);
  const applications = sumOf(records, (r) => r.applicationsReceived);
  const accepted = sumOf(records, (r) => r.applicationsAccepted);
  const registered = sumOf(records, (r) => r.learnersRegistered);

  return {
    intakes: records.length,
    capacity,
    applications,
    accepted,
    registered,
    acceptanceRatePct: accepted !== null && applications !== null ? rate(accepted, applications) : null,
    fillRatePct: registered !== null && capacity !== null ? rate(registered, capacity) : null,
    noShows: accepted !== null && registered !== null ? Math.max(0, accepted - registered) : null,
    byProgramme: records
      .filter((r) => r.programme)
      .map((r) => ({
        programme: r.programme,
        capacity: r.capacity,
        registered: r.learnersRegistered,
        fillPct:
          r.capacity !== null && r.learnersRegistered !== null ? rate(r.learnersRegistered, r.capacity) : null,
      })),
  };
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export interface AssessmentSummary {
  total: number;
  /** Results excluding Absent: the competency denominator. */
  assessed: number;
  competent: number;
  notYetCompetent: number;
  absent: number;
  moderated: number;
  reassessments: number;
  /** Rows with no result recorded yet. */
  pending: number;
  competencyRatePct: number | null;
  moderationCoveragePct: number | null;
}

export function summariseAssessments(report: AcademyReport): AssessmentSummary | null {
  const records = report.assessments.records;
  if (records.length === 0) return null;

  const withResult = records.filter((r) => r.result !== "");
  const assessed = withResult.filter((r) => r.result !== "Absent");
  const competent = assessed.filter((r) => r.result === "Competent").length;

  return {
    total: records.length,
    assessed: assessed.length,
    competent,
    notYetCompetent: assessed.filter((r) => r.result === "Not Yet Competent").length,
    absent: withResult.filter((r) => r.result === "Absent").length,
    moderated: assessed.filter((r) => r.moderated).length,
    reassessments: records.filter((r) => r.reassessment).length,
    pending: records.length - withResult.length,
    competencyRatePct: rate(competent, assessed.length),
    moderationCoveragePct: rate(assessed.filter((r) => r.moderated).length, assessed.length),
  };
}

// ---------------------------------------------------------------------------
// Certification
// ---------------------------------------------------------------------------

export interface CertificationSummary {
  completers: number;
  certified: number;
  awaitingSeta: number;
  eligible: number;
  withheld: number;
  graduated: number;
  certificationRatePct: number | null;
}

export function summariseCertification(report: AcademyReport): CertificationSummary | null {
  const records = report.certification.records;
  if (records.length === 0) return null;

  const withStatus = records.filter((r) => r.status !== "");
  const certified = withStatus.filter((r) => r.status === "Certified").length;

  return {
    completers: records.length,
    certified,
    awaitingSeta: withStatus.filter((r) => r.status === "Submitted to SETA").length,
    eligible: withStatus.filter((r) => r.status === "Eligible").length,
    withheld: withStatus.filter((r) => r.status === "Withheld").length,
    graduated: records.filter((r) => r.graduated).length,
    certificationRatePct: rate(certified, withStatus.length),
  };
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

export interface SkippedAcademyKpi {
  kpiId: string;
  reason: "no_data";
  detail: string;
}

export interface AcademyComputation {
  programmes: ProgrammeSummary | null;
  intakes: IntakeSummary | null;
  assessments: AssessmentSummary | null;
  certification: CertificationSummary | null;
  entries: { kpiId: string; value: number }[];
  skipped: SkippedAcademyKpi[];
}

export function computeAcademyKpis(
  report: AcademyReport,
  kpis: { id: string; name: string }[],
  _config: AcademyConfig,
  today: Date = new Date()
): AcademyComputation {
  const programmes = report.programmes.notApplicable ? null : summariseProgrammes(report, today);
  const intakes = report.intakes.notApplicable ? null : summariseIntakes(report);
  const assessments = report.assessments.notApplicable ? null : summariseAssessments(report);
  const certification = report.certification.notApplicable ? null : summariseCertification(report);

  const values: Record<string, number | null> = {
    [ACADEMY_KPI_IDS.accreditedProgrammes]: programmes?.accreditedRatePct ?? null,
    [ACADEMY_KPI_IDS.applicationAcceptance]: intakes?.acceptanceRatePct ?? null,
    [ACADEMY_KPI_IDS.intakeFillRate]: intakes?.fillRatePct ?? null,
    [ACADEMY_KPI_IDS.competencyRate]: assessments?.competencyRatePct ?? null,
    [ACADEMY_KPI_IDS.moderationCoverage]: assessments?.moderationCoveragePct ?? null,
    [ACADEMY_KPI_IDS.certificationRate]: certification?.certificationRatePct ?? null,
    [ACADEMY_KPI_IDS.graduates]: certification ? certification.graduated : null,
  };

  const detailFor = (kpiId: string): string => {
    switch (kpiId) {
      case ACADEMY_KPI_IDS.accreditedProgrammes:
        return programmes
          ? "No active programme requiring accreditation was recorded, so there is no accreditation rate to calculate."
          : "No programmes were recorded in the programme register.";
      case ACADEMY_KPI_IDS.applicationAcceptance:
        return intakes
          ? "Applications received or accepted were not recorded, so the acceptance rate cannot be calculated."
          : "No intakes were recorded in the intake register.";
      case ACADEMY_KPI_IDS.intakeFillRate:
        return intakes
          ? "Capacity or registrations were not recorded, so the fill rate cannot be calculated."
          : "No intakes were recorded in the intake register.";
      case ACADEMY_KPI_IDS.competencyRate:
        return assessments
          ? "No assessment carries a Competent or Not Yet Competent result, so there is no competency rate."
          : "No assessments were recorded in the assessment register.";
      case ACADEMY_KPI_IDS.moderationCoverage:
        return assessments
          ? "No assessment carries a result, so moderation coverage cannot be calculated."
          : "No assessments were recorded in the assessment register.";
      case ACADEMY_KPI_IDS.certificationRate:
        return certification
          ? "No completer has a certification status recorded, so there is no certification rate."
          : "No completers were recorded in the certification register.";
      case ACADEMY_KPI_IDS.graduates:
        return "No completers were recorded in the certification register, so no graduates can be counted.";
      default:
        return `${kpis.find((k) => k.id === kpiId)?.name ?? kpiId} could not be derived from this submission.`;
    }
  };

  const entries: { kpiId: string; value: number }[] = [];
  const skipped: SkippedAcademyKpi[] = [];
  for (const [kpiId, value] of Object.entries(values)) {
    if (value === null) skipped.push({ kpiId, reason: "no_data", detail: detailFor(kpiId) });
    else entries.push({ kpiId, value: Math.round(value * 10) / 10 });
  }

  return { programmes, intakes, assessments, certification, entries, skipped };
}

/** Which section each KPI is derived from. */
export const ACADEMY_SECTION_KPIS: Record<AcademySectionKey, string[]> = {
  programmes: [ACADEMY_KPI_IDS.accreditedProgrammes],
  intakes: [ACADEMY_KPI_IDS.applicationAcceptance, ACADEMY_KPI_IDS.intakeFillRate],
  assessments: [ACADEMY_KPI_IDS.competencyRate, ACADEMY_KPI_IDS.moderationCoverage],
  certification: [ACADEMY_KPI_IDS.certificationRate, ACADEMY_KPI_IDS.graduates],
};

/** The status a figure would get, for the live preview. Same rule as the other
 *  register departments: the stored `dataAvailable` flag does not suppress a
 *  live preview value. */
export function previewAcademyStatus(kpi: Kpi | undefined, value: number | null) {
  if (!kpi || value === null) return { status: "no_data" as const, thresholdNote: "" };
  const status = getStatusForValue(kpi, value);
  if (status === "threshold_unset") {
    return {
      status,
      thresholdNote:
        "Threshold not configured - no approved limit has been set for this KPI, so no Green/Amber/Red verdict can be given. The figure will be recorded and monitored only.",
    };
  }
  return { status, thresholdNote: "" };
}

/** Figures that will raise an Early Warning on submission. */
export function academyKpisNeedingExplanation(
  computation: AcademyComputation,
  kpis: Kpi[]
): { kpiId: string; name: string; value: number; status: "amber" | "red" }[] {
  return computation.entries.flatMap(({ kpiId, value }) => {
    const kpi = kpis.find((k) => k.id === kpiId);
    const status = previewAcademyStatus(kpi, value).status;
    if (status !== "amber" && status !== "red") return [];
    return [{ kpiId, name: kpi?.name ?? kpiId, value, status }];
  });
}
