import { describe, expect, it } from "vitest";
import { validateOperationsReport } from "./operationsValidation";
import { blankOperationsReport } from "./operationsTestFixtures";
import {
  blankAssetRecord,
  blankAttendanceRecord,
  blankCompletionRecord,
  blankDropoutRecord,
  blankEnrolmentRecord,
  blankProjectRecord,
  blankTrainingRecord,
} from "./operationsSeed";
import type { AssetRecord, OperationsReport, TrainingRecord } from "../types/operations";
import { OPERATIONS_SECTION_KEYS } from "../types/operations";

import { DEFAULT_OPERATIONS_CONFIG as CONFIG } from "./operationsSeed";
const TODAY = new Date("2026-09-15");

const report = blankOperationsReport;

/**
 * A record holding a value the type system would forbid, built the way a
 * spreadsheet can still produce it. TypeScript cannot stop an untyped file
 * arriving with "Carrier Pigeon" in the delivery column, which is exactly why
 * these values have to be constructible in a test.
 */
const fromWorkbook = <T>(record: Record<string, unknown>) => record as T;

/** Flat issue list, which is what most of these tests care about. */
const run = (r: OperationsReport) => validateOperationsReport(r, { config: CONFIG, today: TODAY }).issues;

function seedValid(): OperationsReport {
  const r = report();
  r.enrolment.records = [
    {
      ...blankEnrolmentRecord(),
      learner: "A",
      course: CONFIG.programmes[0],
      registrationDate: "2026-07-05",
      status: "Enrolled",
    },
  ];
  return r;
}

/**
 * Validation tests.
 *
 * The rule: anything that would silently corrupt a reported figure is refused,
 * and anything a human must judge (a vocabulary that has drifted, a duplicate
 * registration, a linked course that does not exist) is named explicitly rather
 * than guessed at.
 */
describe("Operations validation", () => {
  it("accepts a report whose every section is Not Applicable but one", () => {
    const r = seedValid();
    for (const key of OPERATIONS_SECTION_KEYS) {
      if (key !== "enrolment") r[key].notApplicable = true;
    }
    expect(run(r)).toEqual([]);
  });

  it("refuses an empty section rather than reporting zero", () => {
    const r = report();
    const issues = run(r);
    expect(issues.some((i) => i.section === "enrolment" && /At least one enrolment record/.test(i.message))).toBe(true);
  });

  describe("enrolment", () => {
    it("requires a learner, course, date and status", () => {
      const r = report();
      r.enrolment.records = [blankEnrolmentRecord()];
      const messages = run(r).map((i) => i.message);
      expect(messages.some((m) => /Learner/.test(m))).toBe(true);
      expect(messages.some((m) => /Course/.test(m))).toBe(true);
      expect(messages.some((m) => /Registration date/.test(m))).toBe(true);
      expect(messages.some((m) => /Status/.test(m))).toBe(true);
    });

    it("refuses a course that is not in the approved list", () => {
      const r = report();
      r.enrolment.records = [
        { ...(blankEnrolmentRecord()), learner: "A", course: "Underwater Basket Weaving", registrationDate: "2026-07-05", status: "Enrolled" },
      ];
      expect(run(r).some((i) => /not an approved course/.test(i.message))).toBe(true);
    });

    it("refuses a registration dated in the future", () => {
      const r = report();
      r.enrolment.records = [
        { ...(blankEnrolmentRecord()), learner: "A", course: CONFIG.programmes[0], registrationDate: "2027-01-01", status: "Enrolled" },
      ];
      expect(run(r).some((i) => /in the future/.test(i.message))).toBe(true);
    });

    it("names a duplicate registration and says where a re-enrolment belongs", () => {
      const r = seedValid();
      r.enrolment.records.push({ ...r.enrolment.records[0], id: "2" });
      const issue = run(r).find((i) => /Duplicate registration/.test(i.message));
      expect(issue).toBeDefined();
      expect(issue!.message).toContain("Dropouts");
    });
  });

  describe("attendance", () => {
    it("refuses attended learners exceeding the register", () => {
      const r = report();
      r.attendance.records = [
        { ...blankAttendanceRecord(), course: CONFIG.programmes[0], sessionDate: "2026-07-10", registered: 10, attended: 12 },
      ];
      expect(run(r).some((i) => /exceeds registered/.test(i.message))).toBe(true);
    });

    it("refuses a negative count", () => {
      const r = report();
      r.attendance.records = [
        { ...blankAttendanceRecord(), course: CONFIG.programmes[0], sessionDate: "2026-07-10", registered: 10, attended: -1 },
      ];
      expect(run(r).some((i) => /negative/i.test(i.message))).toBe(true);
    });

    it("allows attendance with no excused absences recorded", () => {
      const r = report();
      r.attendance.records = [
        { ...blankAttendanceRecord(), course: CONFIG.programmes[0], sessionDate: "2026-07-10", registered: 10, attended: 9, excusedAbsences: null },
      ];
      r.enrolment.notApplicable = true;
      expect(run(r).filter((i) => i.section === "attendance")).toEqual([]);
    });
  });

  describe("training", () => {
    it("refuses an end date before the start date", () => {
      const r = report();
      r.training.records = [
        {
          ...blankTrainingRecord(),
          course: CONFIG.programmes[0],
          deliveryMode: "Online",
          startDate: "2026-07-20",
          endDate: "2026-07-01",
          hours: 10,
        },
      ];
      expect(run(r).some((i) => /before/i.test(i.message))).toBe(true);
    });

    it("refuses a delivery mode outside the configured vocabulary", () => {
      const r = report();
      r.training.records = [
        fromWorkbook<TrainingRecord>({
          ...blankTrainingRecord(),
          course: CONFIG.programmes[0],
          deliveryMode: "Carrier Pigeon",
          startDate: "2026-07-01",
          endDate: "2026-07-20",
          hours: 10,
        }),
      ];
      expect(run(r).some((i) => /not an approved delivery mode/i.test(i.message))).toBe(true);
    });

    it("refuses zero contact hours", () => {
      const r = report();
      r.training.records = [
        { ...blankTrainingRecord(), course: CONFIG.programmes[0], deliveryMode: "Online", startDate: "2026-07-01", endDate: "2026-07-20", hours: 0 },
      ];
      expect(run(r).some((i) => /hours/i.test(i.message))).toBe(true);
    });
  });

  describe("completion", () => {
    it("requires an outcome and a completion date", () => {
      const r = report();
      r.completion.records = [
        { ...blankCompletionRecord(), learner: "A", course: CONFIG.programmes[0] },
      ];
      const messages = run(r).map((i) => i.message);
      expect(messages.some((m) => /outcome/i.test(m))).toBe(true);
      expect(messages.some((m) => /completion date/i.test(m))).toBe(true);
    });

    it("refuses a completion date in the future", () => {
      const r = report();
      r.completion.records = [
        { ...blankCompletionRecord(), learner: "A", course: CONFIG.programmes[0], outcome: "Completed", completionDate: "2027-05-01" },
      ];
      expect(run(r).some((i) => /in the future/.test(i.message))).toBe(true);
    });

    it("refuses a certificate claimed with no completed outcome", () => {
      const r = report();
      r.completion.records = [
        { ...blankCompletionRecord(), learner: "A", course: CONFIG.programmes[0], outcome: "Not Completed", completionDate: "2026-08-01", certified: true },
      ];
      expect(run(r).some((i) => /certified/i.test(i.message))).toBe(true);
    });
  });

  describe("dropouts", () => {
    it("requires a reason and a withdrawal date", () => {
      const r = report();
      r.dropouts.records = [{ ...blankDropoutRecord(), learner: "A", course: CONFIG.programmes[0] }];
      const messages = run(r).map((i) => i.message);
      expect(messages.some((m) => /withdrawal date/i.test(m))).toBe(true);
      expect(messages.some((m) => /reason/i.test(m))).toBe(true);
    });

    it("refuses weeks completed beyond the length of the course", () => {
      const r = report();
      r.training.records = [
        { ...blankTrainingRecord(), course: CONFIG.programmes[0], deliveryMode: "Online", startDate: "2026-07-01", endDate: "2026-07-28", hours: 20 },
      ];
      r.dropouts.records = [
        { ...blankDropoutRecord(), learner: "A", course: CONFIG.programmes[0], withdrawalDate: "2026-08-01", reason: "Financial", weeksCompleted: 52 },
      ];
      expect(run(r).some((i) => /weeks completed/i.test(i.message))).toBe(true);
    });

    it("does not block a dropout whose learner is missing from a partial register", () => {
      const r = seedValid();
      r.dropouts.records = [
        { ...blankDropoutRecord(), learner: "Someone Else", course: CONFIG.programmes[0], withdrawalDate: "2026-08-01", reason: "Financial" },
      ];
      const messages = run(r).map((i) => i.message);
      expect(messages.some((m) => /not on this submission/.test(m))).toBe(false);
    });
  });

  describe("projects", () => {
    it("requires a project name, type, status and review date", () => {
      const r = report();
      r.projects.records = [blankProjectRecord()];
      const messages = run(r).map((i) => i.message);
      expect(messages.some((m) => /project/i.test(m))).toBe(true);
      expect(messages.some((m) => /type/i.test(m))).toBe(true);
      expect(messages.some((m) => /status/i.test(m))).toBe(true);
      expect(messages.some((m) => /last reviewed/i.test(m))).toBe(true);
    });

    it("refuses a project completing before it started", () => {
      const r = report();
      r.projects.records = [
        {
          ...blankProjectRecord(),
          projectName: "P",
          type: "Internal",
          status: "Completed",
          startDate: "2026-08-01",
          actualEndDate: "2026-07-01",
          lastReviewed: "2026-08-10",
        },
      ];
      expect(run(r).some((i) => /before/i.test(i.message))).toBe(true);
    });

    it("refuses a linked course that is not a programme", () => {
      const r = report();
      r.projects.records = [
        {
          ...blankProjectRecord(),
          projectName: "P",
          type: "Internal",
          status: "On Track",
          startDate: "2026-08-01",
          lastReviewed: "2026-08-10",
          linkedCourse: "Not A Programme",
        },
      ];
      expect(run(r).some((i) => /course/i.test(i.message))).toBe(true);
    });
  });

  describe("assets", () => {
    it("requires a name, tag, category and status", () => {
      const r = report();
      r.assets.records = [blankAssetRecord()];
      const messages = run(r).map((i) => i.message);
      expect(messages.some((m) => /asset/i.test(m))).toBe(true);
      expect(messages.some((m) => /tag/i.test(m))).toBe(true);
      expect(messages.some((m) => /category/i.test(m))).toBe(true);
      expect(messages.some((m) => /status/i.test(m))).toBe(true);
    });

    it("refuses a category that is not in the approved list", () => {
      const r = report();
      r.assets.records = [
        { ...blankAssetRecord(), assetName: "Laptop", assetTag: "T-1", category: "Hovercraft", status: "In Use" },
      ];
      expect(run(r).some((i) => /not an approved category/i.test(i.message))).toBe(true);
    });

    it("requires a disposal date once an asset is disposed of", () => {
      const r = report();
      r.assets.records = [
        { ...blankAssetRecord(), assetName: "Laptop", assetTag: "T-1", category: CONFIG.assetCategories[0], status: "Disposed" },
      ];
      expect(run(r).some((i) => /disposal date/i.test(i.message))).toBe(true);
    });

    it("refuses an acquisition date in the future", () => {
      const r = report();
      r.assets.records = [
        {
          ...blankAssetRecord(),
          assetName: "Laptop",
          assetTag: "T-1",
          category: CONFIG.assetCategories[0],
          status: "In Use",
          acquisitionDate: "2030-01-01",
        },
      ];
      expect(run(r).some((i) => /future/i.test(i.message))).toBe(true);
    });

    it("flags a duplicate asset tag", () => {
      const r = report();
      const rec: AssetRecord = {
        ...blankAssetRecord(),
        assetName: "Laptop",
        assetTag: "T-1",
        category: CONFIG.assetCategories[0],
        status: "In Use",
      };
      r.assets.records = [rec, { ...rec, id: "2" }];
      expect(run(r).some((i) => /asset tag/i.test(i.message))).toBe(true);
    });

    it("refuses a negative replacement value", () => {
      const r = report();
      r.assets.records = [
        {
          ...blankAssetRecord(),
          assetName: "Laptop",
          assetTag: "T-1",
          category: CONFIG.assetCategories[0],
          status: "In Use",
          replacementValue: -5000,
        },
      ];
      expect(run(r).some((i) => /negative/i.test(i.message))).toBe(true);
    });
  });

  it("reports the section each issue belongs to so the modal can point at it", () => {
    const r = report();
    r.assets.records = [blankAssetRecord()];
    expect(run(r).every((i) => OPERATIONS_SECTION_KEYS.includes(i.section))).toBe(true);
  });
});