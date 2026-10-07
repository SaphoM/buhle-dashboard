import { describe, expect, it } from "vitest";
import { computeAcademyKpis, summariseAssessments, summariseProgrammes } from "./academyEngine";
import { validateAcademyReport } from "./academyValidation";
import {
  ACADEMY_SUBMISSION_KPIS,
  DEFAULT_ACADEMY_CONFIG,
  createBlankAcademyReport,
  createDemoAcademyDraft,
} from "./academySeed";
import { ACADEMY_KPI_IDS, type AcademyReport } from "../types/academy";

const TODAY = new Date("2026-10-07T12:00:00");

const blank = (): AcademyReport =>
  createBlankAcademyReport({
    cycleId: "cyc-test",
    reportingPeriod: "Q3 2026",
    frequency: "Quarterly",
    startDate: "2026-07-01",
    dueDate: "2026-10-15",
  });

const valueOf = (report: AcademyReport, kpiId: string) =>
  computeAcademyKpis(report, ACADEMY_SUBMISSION_KPIS, DEFAULT_ACADEMY_CONFIG, TODAY).entries.find(
    (e) => e.kpiId === kpiId
  )?.value;

describe("Academy demo draft", () => {
  it("passes validation, so Grace can submit the mock data as-is", () => {
    const result = validateAcademyReport(createDemoAcademyDraft(), { config: DEFAULT_ACADEMY_CONFIG, today: TODAY });
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("derives every Academy KPI from the registers", () => {
    const draft = createDemoAcademyDraft();
    const computation = computeAcademyKpis(draft, ACADEMY_SUBMISSION_KPIS, DEFAULT_ACADEMY_CONFIG, TODAY);
    expect(computation.skipped).toEqual([]);
    expect(valueOf(draft, ACADEMY_KPI_IDS.accreditedProgrammes)).toBe(85.7); // 6 of 7 accreditable
    expect(valueOf(draft, ACADEMY_KPI_IDS.applicationAcceptance)).toBe(47.6); // 131 / 275
    expect(valueOf(draft, ACADEMY_KPI_IDS.intakeFillRate)).toBe(88.8); // 111 / 125
    expect(valueOf(draft, ACADEMY_KPI_IDS.competencyRate)).toBe(81.8); // 9 / 11, absentee excluded
    expect(valueOf(draft, ACADEMY_KPI_IDS.moderationCoverage)).toBe(27.3); // 3 / 11
    expect(valueOf(draft, ACADEMY_KPI_IDS.certificationRate)).toBe(62.5); // 5 / 8
    expect(valueOf(draft, ACADEMY_KPI_IDS.graduates)).toBe(6);
  });
});

describe("Academy engine rules", () => {
  it("does not count an accreditation that has passed its expiry date", () => {
    const report = blank();
    report.programmes.records = [
      {
        id: "p1",
        name: "Lapsed",
        nqfLevel: 2,
        accreditingBody: "AgriSETA",
        accreditationStatus: "Accredited",
        accreditationExpiry: "2026-01-31",
        status: "Active",
        notes: "",
      },
    ];
    const summary = summariseProgrammes(report, TODAY)!;
    expect(summary.accredited).toBe(0);
    expect(summary.lapsed).toHaveLength(1);
    expect(summary.accreditedRatePct).toBe(0);
  });

  it("excludes absentees from the competency denominator", () => {
    const report = blank();
    const row = (id: string, result: "Competent" | "Not Yet Competent" | "Absent") => ({
      id,
      learner: id,
      programme: "P",
      module: "M",
      assessmentDate: "2026-08-01",
      result,
      moderated: false,
      reassessment: false,
      notes: "",
    });
    report.assessments.records = [row("a", "Competent"), row("b", "Absent"), row("c", "Not Yet Competent")];
    expect(summariseAssessments(report)!.competencyRatePct).toBe(50);
  });

  it("leaves a KPI uncalculated rather than reporting zero when a register is empty", () => {
    const computation = computeAcademyKpis(blank(), ACADEMY_SUBMISSION_KPIS, DEFAULT_ACADEMY_CONFIG, TODAY);
    expect(computation.entries).toEqual([]);
    expect(computation.skipped).toHaveLength(Object.keys(ACADEMY_KPI_IDS).length);
  });
});

describe("Academy validation", () => {
  it("refuses an empty register unless the section is marked Not Applicable", () => {
    const report = blank();
    expect(validateAcademyReport(report, { config: DEFAULT_ACADEMY_CONFIG, today: TODAY }).valid).toBe(false);

    for (const key of ["programmes", "intakes", "assessments", "certification"] as const) {
      report[key].notApplicable = true;
    }
    expect(validateAcademyReport(report, { config: DEFAULT_ACADEMY_CONFIG, today: TODAY }).valid).toBe(true);
  });

  it("refuses more registrations than acceptances", () => {
    const report = createDemoAcademyDraft();
    report.intakes.records[0] = { ...report.intakes.records[0], learnersRegistered: 99 };
    const result = validateAcademyReport(report, { config: DEFAULT_ACADEMY_CONFIG, today: TODAY });
    expect(result.bySection.intakes.state).toBe("incomplete");
    expect(result.issues.some((i) => i.field.includes("Learners registered"))).toBe(true);
  });

  it("requires a certificate date once a learner is Certified", () => {
    const report = createDemoAcademyDraft();
    report.certification.records[0] = { ...report.certification.records[0], certificateDate: "" };
    const result = validateAcademyReport(report, { config: DEFAULT_ACADEMY_CONFIG, today: TODAY });
    expect(result.issues.some((i) => i.field.includes("Certificate date"))).toBe(true);
  });
});
