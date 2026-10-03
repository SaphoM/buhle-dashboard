import { describe, expect, it } from "vitest";
import {
  computeOperationsKpis,
  sectionForKpi,
  summariseAssets,
  summariseAttendance,
  summariseCompletion,
  summariseDropouts,
  summariseEnrolment,
  summariseProjects,
  summariseTraining,
  PROJECT_REVIEW_STALE_DAYS,
} from "./operationsEngine";
import {
  blankAssetRecord,
  blankAttendanceRecord,
  blankCompletionRecord,
  blankDropoutRecord,
  blankEnrolmentRecord,
  blankProjectRecord,
  blankTrainingRecord,
  DEFAULT_OPERATIONS_CONFIG,
  OPERATIONS_KPI_IDS,
} from "./operationsSeed";
import { blankOperationsReport } from "./operationsTestFixtures";
import type {
  AssetRecord,
  AttendanceRecord,
  CompletionRecord,
  DropoutRecord,
  EnrolmentRecord,
  ProjectRecord,
  TrainingRecord,
} from "../types/operations";
import { OPERATIONS_SECTION_KEYS } from "../types/operations";

const CONFIG = DEFAULT_OPERATIONS_CONFIG;

const report = blankOperationsReport;

function enrolment(overrides: Partial<EnrolmentRecord> & { learner: string }): EnrolmentRecord {
  return {
    ...blankEnrolmentRecord(),
    course: CONFIG.programmes[0],
    registrationDate: "2026-07-05",
    status: "Enrolled",
    ...overrides,
  };
}
function attendance(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    ...blankAttendanceRecord(),
    course: CONFIG.programmes[0],
    cohort: "2026 A",
    sessionDate: "2026-07-10",
    facilitator: "",
    venue: "",
    registered: 20,
    attended: 16,
    excusedAbsences: null,
    notes: "",
    ...overrides,
  };
}
function training(overrides: Partial<TrainingRecord>): TrainingRecord {
  return {
    ...blankTrainingRecord(),
    course: CONFIG.programmes[0],
    cohort: "2026 A",
    deliveryMode: "Face to Face",
    facilitator: "",
    startDate: "2026-07-01",
    endDate: "2026-07-28",
    hours: 40,
    capacity: 30,
    learnersStarted: 24,
    notes: "",
    ...overrides,
  };
}
function completion(overrides: Partial<CompletionRecord>): CompletionRecord {
  return {
    ...blankCompletionRecord(),
    learner: "L",
    course: CONFIG.programmes[0],
    cohort: "2026 A",
    completionDate: "2026-08-30",
    outcome: "Completed",
    assessmentResult: "",
    certified: false,
    notes: "",
    ...overrides,
  };
}
function dropout(overrides: Partial<DropoutRecord>): DropoutRecord {
  return {
    ...blankDropoutRecord(),
    learner: "L",
    course: CONFIG.programmes[0],
    cohort: "2026 A",
    withdrawalDate: "2026-08-10",
    reason: "Financial",
    reasonDetail: "",
    weeksCompleted: null,
    reEnrolled: false,
    ...overrides,
  };
}
function project(overrides: Partial<ProjectRecord>): ProjectRecord {
  return {
    ...blankProjectRecord(),
    projectName: "P",
    type: "Enterprise",
    status: "On Track",
    startDate: "2026-07-01",
    plannedEndDate: "2026-10-01",
    actualEndDate: "",
    lastReviewed: "2026-08-30",
    beneficiaries: 40,
    lead: "",
    notes: "",
    ...overrides,
  };
}
function asset(overrides: Partial<AssetRecord>): AssetRecord {
  return {
    ...blankAssetRecord(),
    assetName: "Laptop",
    assetTag: "T-1",
    category: CONFIG.assetCategories[0],
    location: "",
    acquisitionDate: "2025-02-01",
    replacementValue: 8000,
    condition: "Good",
    status: "In Use",
    custodian: "",
    disposalDate: "",
    notes: "",
    ...overrides,
  };
}

/**
 * Engine tests.
 *
 * The rule every test here enforces: a rate is derived from the records behind
 * it, an unknown input produces no figure rather than a zero, and a learner who
 * left is counted in the population the dropout rate is measured against.
 */
describe("Operations engine", () => {
  describe("enrolment", () => {
    it("counts only learners who are enrolled or in progress as active", () => {
      const r = report();
      r.enrolment.records = [
        enrolment({ learner: "A", status: "Enrolled" }),
        enrolment({ learner: "B", status: "In Progress" }),
        enrolment({ learner: "C", status: "Waitlisted" }),
        enrolment({ learner: "D", status: "Withdrawn" }),
        enrolment({ learner: "E", status: "Completed" }),
      ];
      const s = summariseEnrolment(r)!;
      expect(s.active).toBe(2);
      expect(s.totalOnRegister).toBe(5);
      expect(s.waitlisted).toBe(1);
      expect(s.withdrawn).toBe(1);
      expect(s.completed).toBe(1);
    });

    it("does not count an unstated status as an active learner", () => {
      const r = report();
      r.enrolment.records = [enrolment({ learner: "A", status: "" })];
      const s = summariseEnrolment(r)!;
      expect(s.active).toBeNull();
      expect(s.byStatus.Unspecified).toBe(1);
    });

    it("counts new registrations separately from the standing total", () => {
      const r = report();
      r.enrolment.records = [
        enrolment({ learner: "A", isNewThisPeriod: true }),
        enrolment({ learner: "B", isNewThisPeriod: false }),
      ];
      const s = summariseEnrolment(r)!;
      expect(s.newThisPeriod).toBe(1);
      expect(s.active).toBe(2);
    });

    it("reports duplicate registrations instead of quietly counting twice", () => {
      const r = report();
      r.enrolment.records = [
        enrolment({ learner: "Thandi M", status: "Enrolled" }),
        enrolment({ learner: "thandi m", status: "Enrolled" }),
      ];
      expect(summariseEnrolment(r)!.duplicateLearners).toEqual(["thandi m"]);
    });

    it("groups active learners by course, biggest first", () => {
      const r = report();
      r.enrolment.records = [
        enrolment({ learner: "A", course: CONFIG.programmes[0] }),
        enrolment({ learner: "B", course: CONFIG.programmes[0] }),
        enrolment({ learner: "C", course: CONFIG.programmes[1] }),
      ];
      expect(summariseEnrolment(r)!.byCourse).toEqual([
        { course: CONFIG.programmes[0], active: 2 },
        { course: CONFIG.programmes[1], active: 1 },
      ]);
    });

    it("returns nothing when the section is not applicable or empty", () => {
      const r = report();
      expect(summariseEnrolment(r)).toBeNull();
      r.enrolment.notApplicable = true;
      r.enrolment.records = [enrolment({ learner: "A" })];
      expect(summariseEnrolment(r)).toBeNull();
    });
  });

  describe("attendance", () => {
    it("derives the rate from learner-sessions across the period", () => {
      const r = report();
      r.attendance.records = [
        attendance({ registered: 20, attended: 16 }),
        attendance({ registered: 30, attended: 24 }),
      ];
      const s = summariseAttendance(r, CONFIG)!;
      expect(s.attended).toBe(40);
      expect(s.registered).toBe(50);
      expect(s.ratePct).toBe(80);
      expect(s.sessions).toBe(2);
    });

    it("gives no rate when no register counts were supplied", () => {
      const r = report();
      r.attendance.records = [attendance({ registered: null, attended: null })];
      const s = summariseAttendance(r, CONFIG)!;
      expect(s.ratePct).toBeNull();
      expect(s.sessions).toBe(1);
    });

    it("keeps sanctioned absences out of the attendance rate", () => {
      const r = report();
      r.attendance.records = [attendance({ registered: 20, attended: 16, excusedAbsences: 3 })];
      const s = summariseAttendance(r, CONFIG)!;
      expect(s.ratePct).toBe(80);
      expect(s.excusedAbsences).toBe(3);
    });

    it("counts sessions that fall below the lowest configured band", () => {
      const r = report();
      r.attendance.records = [
        attendance({ registered: 10, attended: 8 }),
        attendance({ registered: 10, attended: 4 }),
      ];
      const s = summariseAttendance(r, CONFIG)!;
      expect(s.sessionsBelowBand).toBe(1);
      // 70%, not the catch-all "Below 70%" band whose threshold is zero.
      expect(s.bandFloorPct).toBe(70);
      expect(s.bandFloorLabel).toBe("Below 70%");
    });

    it("surfaces sessions dated before the reporting period started", () => {
      const r = report();
      r.attendance.records = [attendance({ sessionDate: "2026-06-30" })];
      expect(summariseAttendance(r, CONFIG)!.sessionsOutsidePeriod).toBe(1);
    });

    it("ranks courses worst-attending first", () => {
      const r = report();
      r.attendance.records = [
        attendance({ course: CONFIG.programmes[0], registered: 10, attended: 9 }),
        attendance({ course: CONFIG.programmes[1], registered: 10, attended: 5 }),
      ];
      const byCourse = summariseAttendance(r, CONFIG)!.byCourse;
      expect(byCourse[0].course).toBe(CONFIG.programmes[1]);
      expect(byCourse[0].ratePct).toBe(50);
    });
  });

  describe("training delivery", () => {
    it("sums contact hours and derives the fill rate", () => {
      const r = report();
      r.training.records = [
        training({ hours: 40, capacity: 30, learnersStarted: 24 }),
        training({ hours: 20, capacity: 20, learnersStarted: 20, deliveryMode: "Online" }),
      ];
      const s = summariseTraining(r)!;
      expect(s.hours).toBe(60);
      expect(s.capacity).toBe(50);
      expect(s.learnersStarted).toBe(44);
      expect(s.fillRatePct).toBe(88);
      expect(s.byDeliveryMode).toEqual({ "Face to Face": 1, Online: 1 });
    });

    it("gives no fill rate when capacity was never recorded", () => {
      const r = report();
      r.training.records = [training({ capacity: null })];
      const s = summariseTraining(r)!;
      expect(s.learnersStarted).toBe(24);
      expect(s.fillRatePct).toBeNull();
    });
  });

  describe("completion", () => {
    it("measures completion against every recorded outcome, including withdrawals", () => {
      const r = report();
      r.completion.records = [
        completion({ learner: "A", outcome: "Completed", certified: true }),
        completion({ learner: "B", outcome: "Completed" }),
        completion({ learner: "C", outcome: "Withdrawn" }),
        completion({ learner: "D", outcome: "Not Completed" }),
      ];
      const s = summariseCompletion(r)!;
      expect(s.completed).toBe(2);
      expect(s.outcomesRecorded).toBe(4);
      expect(s.completionRatePct).toBe(50);
      expect(s.certified).toBe(1);
    });

    it("reports no completion figure when nobody completed anything", () => {
      const r = report();
      r.completion.records = [completion({ outcome: "Withdrawn" })];
      const s = summariseCompletion(r)!;
      expect(s.completed).toBe(0);
      expect(s.completionRatePct).toBe(0);
      expect(s.certified).toBeNull();
    });
  });

  describe("dropouts", () => {
    it("measures the rate against everyone who began, not those still enrolled", () => {
      const r = report();
      r.enrolment.records = [
        enrolment({ learner: "A", status: "Enrolled" }),
        enrolment({ learner: "B", status: "In Progress" }),
        enrolment({ learner: "C", status: "Withdrawn" }),
        enrolment({ learner: "D", status: "Completed" }),
        enrolment({ learner: "E", status: "Waitlisted" }),
      ];
      r.dropouts.records = [dropout({ learner: "C" })];
      const s = summariseDropouts(r, CONFIG)!;
      // 4 began study; the waitlisted learner never started, so is not at risk.
      expect(s.total).toBe(1);
      expect(s.counted).toBe(1);
      expect(s.dropoutRatePct).toBe(25);
    });

    it("excludes a re-enrolled learner from both sides when retention is counted as success", () => {
      const r = report();
      const kept = { ...CONFIG, reEnrolmentCountsAsDropout: false };
      r.enrolment.records = [
        enrolment({ learner: "A", status: "Enrolled" }),
        enrolment({ learner: "B", status: "Enrolled" }),
        enrolment({ learner: "C", status: "Withdrawn" }),
      ];
      r.dropouts.records = [dropout({ learner: "C", reEnrolled: true })];
      const s = summariseDropouts(r, kept)!;
      expect(s.total).toBe(1);
      expect(s.counted).toBe(0);
      expect(s.reEnrolled).toBe(1);
      expect(s.dropoutRatePct).toBe(0);
    });

    it("counts a re-enrolled learner against the programme when config says so", () => {
      const r = report();
      const strict = { ...CONFIG, reEnrolmentCountsAsDropout: true };
      r.enrolment.records = [
        enrolment({ learner: "A", status: "Enrolled" }),
        enrolment({ learner: "C", status: "Withdrawn" }),
      ];
      r.dropouts.records = [dropout({ learner: "C", reEnrolled: true })];
      const s = summariseDropouts(r, strict)!;
      expect(s.counted).toBe(1);
      expect(s.dropoutRatePct).toBe(50);
    });

    it("calls a dropout early only against the real length of the course", () => {
      const r = report();
      r.training.records = [training({ course: CONFIG.programmes[0], startDate: "2026-07-01", endDate: "2026-08-26" })];
      r.dropouts.records = [
        dropout({ learner: "A", weeksCompleted: 2 }),
        dropout({ learner: "B", weeksCompleted: 7 }),
      ];
      // The course ran 8 weeks, so half is 4: one learner left too early.
      expect(summariseDropouts(r, CONFIG)!.earlyDropouts).toBe(1);
    });

    it("gives no early-dropout figure when course lengths are unknown", () => {
      const r = report();
      r.dropouts.records = [dropout({ learner: "A", weeksCompleted: 2 })];
      expect(summariseDropouts(r, CONFIG)!.earlyDropouts).toBeNull();
    });

    it("names dropouts that are not on the enrolment register without blocking anything", () => {
      const r = report();
      r.dropouts.records = [dropout({ learner: "Ghost Learner" })];
      expect(summariseDropouts(r, CONFIG)!.unmatchedDropouts).toEqual([`Ghost Learner (${CONFIG.programmes[0]})`]);
    });

    it("gives no rate at all when the register is missing", () => {
      const r = report();
      r.dropouts.records = [dropout({ learner: "A" })];
      const s = summariseDropouts(r, CONFIG)!;
      expect(s.counted).toBe(1);
      expect(s.dropoutRatePct).toBeNull();
    });
  });

  describe("projects", () => {
    it("measures on-schedule share against live projects only", () => {
      const r = report();
      r.projects.records = [
        project({ projectName: "A", status: "On Track" }),
        project({ projectName: "B", status: "On Track" }),
        project({ projectName: "C", status: "At Risk" }),
        project({ projectName: "D", status: "Completed" }),
      ];
      const s = summariseProjects(r, new Date("2026-09-01"))!;
      expect(s.total).toBe(4);
      expect(s.active).toBe(3);
      expect(s.onSchedule).toBe(2);
      expect(s.onSchedulePct).toBe(66.7);
      expect(s.atRiskOrDelayed).toBe(1);
    });

    it("treats a project with no status as live rather than finished", () => {
      const r = report();
      r.projects.records = [project({ status: "" })];
      expect(summariseProjects(r, new Date("2026-09-01"))!.active).toBe(1);
    });

    it("flags a status nobody has refreshed", () => {
      const r = report();
      const today = new Date("2026-09-01");
      r.projects.records = [
        project({ projectName: "Stale", lastReviewed: "2026-05-01" }),
        project({ projectName: "Fresh", lastReviewed: "2026-08-30" }),
      ];
      const stale = summariseProjects(r, today)!.staleReviews;
      expect(stale).toHaveLength(1);
      expect(stale[0].projectName).toBe("Stale");
      expect(stale[0].daysSinceReview).toBeGreaterThan(PROJECT_REVIEW_STALE_DAYS);
    });
  });

  describe("assets", () => {
    it("excludes assets not yet in service and disposed assets from the in-service base", () => {
      const r = report();
      r.assets.records = [
        asset({ assetName: "A", status: "In Use" }),
        asset({ assetName: "B", status: "In Use" }),
        asset({ assetName: "C", status: "In Use" }),
        asset({ assetName: "D", status: "Not Yet In Service" }),
        asset({ assetName: "E", status: "Disposed" }),
      ];
      const s = summariseAssets(r)!;
      expect(s.total).toBe(5);
      expect(s.inUse).toBe(3);
      expect(s.notYetInService).toBe(1);
      expect(s.disposed).toBe(1);
      // 3 in use out of the 3 that exist and are in service, not 3 of 5.
      expect(s.inServiceRatePct).toBe(100);
    });

    it("counts capital sitting idle", () => {
      const r = report();
      r.assets.records = [
        asset({ assetName: "A", status: "Idle", replacementValue: 8000 }),
        asset({ assetName: "B", status: "In Use", replacementValue: 12000 }),
      ];
      const s = summariseAssets(r)!;
      expect(s.idle).toBe(1);
      expect(s.idleValue).toBe(8000);
      expect(s.replacementValue).toBe(20000);
    });

    it("gives no idle value when no asset carried a value", () => {
      const r = report();
      r.assets.records = [asset({ status: "Idle", replacementValue: null })];
      const s = summariseAssets(r)!;
      expect(s.idle).toBe(1);
      expect(s.idleValue).toBeNull();
    });
  });

  describe("KPI computation", () => {
    it("derives every Operations KPI from the records behind it", () => {
      const r = report();
      r.enrolment.records = [
        enrolment({ learner: "A", status: "Enrolled", isNewThisPeriod: true }),
        enrolment({ learner: "B", status: "In Progress" }),
      ];
      r.attendance.records = [attendance({ registered: 20, attended: 15 })];
      r.training.records = [training({ hours: 40 })];
      r.completion.records = [completion({ learner: "A", outcome: "Completed" })];
      r.dropouts.records = [dropout({ learner: "B" })];
      r.projects.records = [project({ status: "On Track" })];
      r.assets.records = [asset({ status: "In Use" })];

      const kpis = Object.values(OPERATIONS_KPI_IDS).map((id) => ({ id, name: id }));
      const out = computeOperationsKpis(r, kpis, CONFIG);
      const value = (id: string) => out.entries.find((e) => e.kpiId === id)?.value;

      expect(value(OPERATIONS_KPI_IDS.enrolment)).toBe(2);
      expect(value(OPERATIONS_KPI_IDS.newEnrolments)).toBe(1);
      expect(value(OPERATIONS_KPI_IDS.attendanceRate)).toBe(75);
      expect(value(OPERATIONS_KPI_IDS.sessionsDelivered)).toBe(1);
      expect(value(OPERATIONS_KPI_IDS.trainingHours)).toBe(40);
      expect(value(OPERATIONS_KPI_IDS.completion)).toBe(100);
      expect(value(OPERATIONS_KPI_IDS.dropouts)).toBe(1);
      expect(value(OPERATIONS_KPI_IDS.dropoutRate)).toBe(50);
      expect(value(OPERATIONS_KPI_IDS.activeProjects)).toBe(1);
      expect(value(OPERATIONS_KPI_IDS.projectsOnSchedule)).toBe(100);
      expect(value(OPERATIONS_KPI_IDS.assetsInService)).toBe(100);
      // No asset was idle, so the idle count could not be derived and is reported
      // as skipped rather than as a zero.
      expect(value(OPERATIONS_KPI_IDS.assetsIdle)).toBeUndefined();
      expect(out.skipped.map((s) => s.kpiId)).toEqual([OPERATIONS_KPI_IDS.assetsIdle]);
    });

    it("reports a KPI as skipped with a reason instead of inventing a zero", () => {
      const r = report();
      const kpis = Object.values(OPERATIONS_KPI_IDS).map((id) => ({ id, name: id }));
      const out = computeOperationsKpis(r, kpis, CONFIG);
      expect(out.entries).toHaveLength(0);
      expect(out.skipped).toHaveLength(Object.keys(OPERATIONS_KPI_IDS).length);
      expect(out.skipped.every((s) => s.reason === "no_data")).toBe(true);
      expect(out.skipped[0].detail).toContain("no enrolment records");
    });

    it("maps every KPI back to the reporting area that feeds it", () => {
      for (const key of OPERATIONS_SECTION_KEYS) expect(OPERATIONS_SECTION_KEYS).toContain(sectionForKpi(`kpi-${key}`));
      expect(sectionForKpi(OPERATIONS_KPI_IDS.attendanceRate)).toBe("attendance");
      expect(sectionForKpi(OPERATIONS_KPI_IDS.newEnrolments)).toBe("enrolment");
      expect(sectionForKpi(OPERATIONS_KPI_IDS.dropoutRate)).toBe("dropouts");
    });
  });
});