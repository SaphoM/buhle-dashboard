import { describe, expect, it } from "vitest";
import {
  applyOperationsImport,
  buildOperationsPreview,
  recordOperationsImportFailure,
  suggestMapping,
  OPERATIONS_TARGET_FIELDS,
  OPERATIONS_TARGET_LABELS,
  type OperationsImportTarget,
} from "./operationsImport";
import { blankOperationsReport } from "./operationsTestFixtures";
import { describeSheet } from "./workbookImport";
import type { OperationsReport } from "../types/operations";
import { OPERATIONS_SECTION_KEYS } from "../types/operations";

import { DEFAULT_OPERATIONS_CONFIG as CONFIG } from "./operationsSeed";
const STAMP = "2026-09-15T08:00:00.000Z";
const ACTOR = "Nomsa Dlamini";

function sheet(headers: string[], rows: unknown[][]) {
  return describeSheet([headers, ...rows], "Sheet1");
}

const report = blankOperationsReport;

const mappingFor = (target: OperationsImportTarget) =>
  Object.fromEntries(OPERATIONS_TARGET_FIELDS[target].map((f) => [f.key, f.label]));

/**
 * Import tests.
 *
 * The rule: nothing is guessed. A suggested mapping proposes, an unmapped
 * required column blocks, an unreadable cell rejects its row with a reason, and
 * an unapproved course is refused rather than imported as free text.
 */
describe("Operations workbook import", () => {
  describe("mapping suggestions", () => {
    it("suggests a mapping from real header spellings", () => {
      const fields = OPERATIONS_TARGET_FIELDS.enrolment;
      const { mapping, conflicts } = suggestMapping(
        ["Learner Name", "Programme", "Cohort", "Date Registered", "Enrolment Status"],
        fields
      );
      expect(mapping.learner).toBe("Learner Name");
      expect(mapping.course).toBe("Programme");
      expect(mapping.cohort).toBe("Cohort");
      expect(mapping.registrationDate).toBe("Date Registered");
      expect(mapping.status).toBe("Enrolment Status");
      // Two fields never claim the same column, or the mapping would be a guess.
      expect(conflicts).toEqual([]);
      expect(mapping.facilitator).toBeUndefined();
    });

    it("suggests nothing for a sheet with unrelated headers", () => {
      const { mapping } = suggestMapping(["Alpha", "Beta"], OPERATIONS_TARGET_FIELDS.assets);
      expect(Object.keys(mapping)).toHaveLength(0);
    });

    it("offers a target for each of the seven reporting areas", () => {
      expect(Object.keys(OPERATIONS_TARGET_LABELS).sort()).toEqual([...OPERATIONS_SECTION_KEYS].sort());
    });
  });

  describe("preview", () => {
    it("accepts a clean enrolment sheet and reports every column it used", () => {
      const s = sheet(
        ["Learner", "Course", "Cohort", "Registration Date", "Status", "New This Period"],
        [["A", CONFIG.programmes[0], "2026 A", "2026-07-05", "Enrolled", "Yes"]]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      expect(preview.acceptable).toHaveLength(1);
      expect(preview.rejected).toHaveLength(0);
      expect(preview.unmappedFields).toEqual([]);
      expect(preview.rows[0].values.status).toBe("Enrolled");
      expect(preview.rows[0].values.isNewThisPeriod).toBe(true);
    });

    it("rejects a row whose course is not an approved programme", () => {
      const s = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [["A", "Underwater Basket Weaving", "2026-07-05", "Enrolled"]]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      expect(preview.acceptable).toHaveLength(0);
      expect(preview.rejected[0].issues[0].message).toMatch(/not an approved course/);
    });

    it("rejects a row missing a required cell and names the row", () => {
      const s = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [
          ["A", CONFIG.programmes[0], "2026-07-05", "Enrolled"],
          ["B", CONFIG.programmes[0], "", "Enrolled"],
        ]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      expect(preview.acceptable).toHaveLength(1);
      expect(preview.rejected).toHaveLength(1);
      // Row 3 in the sheet: header is row 1, so the second data row is row 3.
      expect(preview.rejected[0].rowNumber).toBe(3);
      expect(preview.rejected[0].issues[0].message).toMatch(/Registration Date is required/);
    });

    it("refuses every row when a required column was never mapped", () => {
      const s = sheet(
        ["Learner", "Course", "Registration Date"],
        [["A", CONFIG.programmes[0], "2026-07-05"]]
      );
      const mapping = mappingFor("enrolment");
      delete mapping.status;
      const preview = buildOperationsPreview(s, "enrolment", mapping, CONFIG);
      expect(preview.unmappedFields).toContain("Status");
      expect(preview.acceptable).toHaveLength(0);
      expect(preview.rejected[0].issues.some((i) => /Status is not mapped/.test(i.message))).toBe(true);
    });

    it("rejects an unreadable number instead of importing a zero", () => {
      const s = sheet(
        ["Course", "Session Date", "Registered", "Attended"],
        [[CONFIG.programmes[0], "2026-07-10", "twenty", "many"]]
      );
      const preview = buildOperationsPreview(s, "attendance", mappingFor("attendance"), CONFIG);
      expect(preview.rejected[0].issues.map((i) => i.message).join(" ")).toMatch(/"twenty" is not a number/);
    });

    it("reads the day-first and serial date forms a real register contains", () => {
      const s = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [
          ["A", CONFIG.programmes[0], "05/07/2026", "Enrolled"],
          ["B", CONFIG.programmes[0], 45839, "Enrolled"],
        ]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      expect(preview.acceptable).toHaveLength(2);
      expect(preview.rows[0].values.registrationDate).toBe("2026-07-05");
      expect(String(preview.rows[1].values.registrationDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("refuses a date it cannot read rather than guessing a term", () => {
      const s = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [["A", CONFIG.programmes[0], "next Tuesday", "Enrolled"]]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      expect(preview.rejected[0].issues[0].message).toMatch(/"next Tuesday" is not a readable date/);
    });

    it("reads a rand amount out of a currency-formatted cell", () => {
      const s = sheet(
        ["Asset", "Asset Tag", "Category", "Status", "Replacement Value"],
        [["Laptop", "T-1", CONFIG.assetCategories[0], "Idle", "R 12 500,50"]]
      );
      const preview = buildOperationsPreview(s, "assets", mappingFor("assets"), CONFIG);
      expect(preview.acceptable).toHaveLength(1);
      expect(preview.rows[0].values.replacementValue).toBe(12500.5);
    });

    it("refuses an asset category that is not configured", () => {
      const s = sheet(
        ["Asset", "Asset Tag", "Category", "Status"],
        [["Hovercraft", "H-1", "Hovercraft", "In Use"]]
      );
      const preview = buildOperationsPreview(s, "assets", mappingFor("assets"), CONFIG);
      expect(preview.rejected[0].issues[0].message).toMatch(/not an approved category/);
    });

    it("ignores blank spacer rows rather than importing empty records", () => {
      const s = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [
          ["A", CONFIG.programmes[0], "2026-07-05", "Enrolled"],
          ["", "", "", ""],
          ["B", CONFIG.programmes[0], "2026-07-06", "Enrolled"],
        ]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      expect(preview.rows).toHaveLength(2);
    });
  });

  describe("applying a confirmed import", () => {
    const enrolmentSheet = () =>
      sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [
          ["A", CONFIG.programmes[0], "2026-07-05", "Enrolled"],
          ["B", CONFIG.programmes[0], "2026-07-06", "In Progress"],
        ]
      );

    it("writes the accepted rows and records where they came from", () => {
      const r = report();
      const preview = buildOperationsPreview(enrolmentSheet(), "enrolment", mappingFor("enrolment"), CONFIG);
      const out = applyOperationsImport(r, preview, { mode: "replace", fileName: "enrolment.xlsx", actor: ACTOR, stamp: STAMP });

      expect(out.report.enrolment.records).toHaveLength(2);
      expect(out.report.enrolment.records[0].id).not.toBe("");
      expect(out.report.enrolment.notApplicable).toBe(false);
      expect(out.accepted).toBe(2);
      expect(out.run.status).toBe("Imported");
      expect(out.run.sheetName).toBe("Sheet1");
      expect(out.run.importedBy).toBe(ACTOR);
      expect(out.report.dataSource.kind).toBe("Workbook Import");
      expect(out.report.dataSource.fileName).toBe("enrolment.xlsx");
      expect(out.report.importRuns).toHaveLength(1);
    });

    it("never applies a rejected row", () => {
      const r = report();
      const s = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [
          ["A", CONFIG.programmes[0], "2026-07-05", "Enrolled"],
          ["Bad", "Not A Course", "2026-07-06", "Enrolled"],
        ]
      );
      const preview = buildOperationsPreview(s, "enrolment", mappingFor("enrolment"), CONFIG);
      const out = applyOperationsImport(r, preview, { mode: "replace", fileName: "e.xlsx", actor: ACTOR, stamp: STAMP });

      expect(out.accepted).toBe(1);
      expect(out.rejected).toBe(1);
      expect(out.report.enrolment.records).toHaveLength(1);
      // A run with rejects is "Validated", not "Imported": the workbook was not
      // taken whole.
      expect(out.run.status).toBe("Validated");
    });

    it("appends to existing records by default", () => {
      const r = report();
      const first = buildOperationsPreview(enrolmentSheet(), "enrolment", mappingFor("enrolment"), CONFIG);
      const withData = applyOperationsImport(r, first, { mode: "append", fileName: "e.xlsx", actor: ACTOR, stamp: STAMP }).report;

      const more = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [["C", CONFIG.programmes[0], "2026-07-07", "Enrolled"]]
      );
      const second = buildOperationsPreview(more, "enrolment", mappingFor("enrolment"), CONFIG);
      const out = applyOperationsImport(withData, second, { mode: "append", fileName: "e2.xlsx", actor: ACTOR, stamp: STAMP });

      expect(out.report.enrolment.records).toHaveLength(3);
      expect(out.replacedSections).toEqual([]);
    });

    it("replaces a whole section on request and says it did", () => {
      const r = report();
      const first = buildOperationsPreview(enrolmentSheet(), "enrolment", mappingFor("enrolment"), CONFIG);
      const withData = applyOperationsImport(r, first, { mode: "append", fileName: "e.xlsx", actor: ACTOR, stamp: STAMP }).report;

      const more = sheet(
        ["Learner", "Course", "Registration Date", "Status"],
        [["Z", CONFIG.programmes[0], "2026-07-07", "Enrolled"]]
      );
      const second = buildOperationsPreview(more, "enrolment", mappingFor("enrolment"), CONFIG);
      const out = applyOperationsImport(withData, second, { mode: "replace", fileName: "e2.xlsx", actor: ACTOR, stamp: STAMP });

      expect(out.report.enrolment.records).toHaveLength(1);
      expect(out.report.enrolment.records[0].learner).toBe("Z");
      expect(out.replacedSections).toEqual(["enrolment"]);
      expect(out.run.notes).toMatch(/Replaced existing enrolment/);
    });

    it("imports attendance counts as numbers, never as a typed rate", () => {
      const r = report();
      const s = sheet(
        ["Course", "Session Date", "Registered", "Attended", "Excused Absences"],
        [[CONFIG.programmes[0], "2026-07-10", "20", "16", "2"]]
      );
      const preview = buildOperationsPreview(s, "attendance", mappingFor("attendance"), CONFIG);
      const out = applyOperationsImport(r, preview, { mode: "replace", fileName: "a.xlsx", actor: ACTOR, stamp: STAMP });
      const rec = out.report.attendance.records[0];

      expect(rec.registered).toBe(20);
      expect(rec.attended).toBe(16);
      expect(rec.excusedAbsences).toBe(2);
      expect(rec.sessionDate).toBe("2026-07-10");
    });

    it("imports every section into its own envelope", () => {
      const cases: [OperationsImportTarget, string[], unknown[][], (r: OperationsReport) => number][] = [
        [
          "enrolment",
          ["Learner", "Course", "Registration Date", "Status"],
          [["A", CONFIG.programmes[0], "2026-07-05", "Enrolled"]],
          (r) => r.enrolment.records.length,
        ],
        [
          "attendance",
          ["Course", "Session Date", "Registered", "Attended"],
          [[CONFIG.programmes[0], "2026-07-10", "20", "16"]],
          (r) => r.attendance.records.length,
        ],
        [
          "training",
          ["Course", "Delivery Mode", "Start Date", "Hours"],
          [[CONFIG.programmes[0], "Online", "2026-07-01", "20"]],
          (r) => r.training.records.length,
        ],
        [
          "completion",
          ["Learner", "Course", "Completion Date", "Outcome", "Certified"],
          [["A", CONFIG.programmes[0], "2026-08-01", "Completed", "Yes"]],
          (r) => r.completion.records.length,
        ],
        [
          "dropouts",
          ["Learner", "Course", "Withdrawal Date", "Reason", "Weeks Completed"],
          [["B", CONFIG.programmes[0], "2026-08-01", "Financial", "2"]],
          (r) => r.dropouts.records.length,
        ],
        [
          "projects",
          ["Project", "Type", "Status", "Start Date", "Last Reviewed"],
          [["P", "Internal", "On Track", "2026-07-01", "2026-08-01"]],
          (r) => r.projects.records.length,
        ],
        [
          "assets",
          ["Asset", "Asset Tag", "Category", "Status"],
          [["Laptop", "T-1", CONFIG.assetCategories[0], "In Use"]],
          (r) => r.assets.records.length,
        ],
      ];

      for (const [target, headers, rows, count] of cases) {
        const preview = buildOperationsPreview(sheet(headers, rows), target, mappingFor(target), CONFIG);
        const out = applyOperationsImport(report(), preview, {
          mode: "replace",
          fileName: `${target}.xlsx`,
          actor: ACTOR,
          stamp: STAMP,
        });
        expect(preview.rejected, `${target} rejected rows`).toHaveLength(0);
        expect(count(out.report), `${target} record count`).toBe(1);
        expect(out.report.importRuns.at(-1)!.target).toBe(target);
      }
    });

    it("gives imported records their own ids", () => {
      const r = report();
      const preview = buildOperationsPreview(enrolmentSheet(), "enrolment", mappingFor("enrolment"), CONFIG);
      const out = applyOperationsImport(r, preview, { mode: "replace", fileName: "e.xlsx", actor: ACTOR, stamp: STAMP });
      const ids = out.report.enrolment.records.map((x) => x.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe("failed imports", () => {
    it("records a refusal so the section does not look unsubmitted", () => {
      const r = report();
      const out = recordOperationsImportFailure(r, "enrolment", "File is not a workbook", {
        actor: ACTOR,
        fileName: "notes.txt",
        stamp: STAMP,
      });

      expect(out.importRuns).toHaveLength(1);
      expect(out.importRuns[0].status).toBe("Failed");
      expect(out.importRuns[0].notes).toBe("File is not a workbook");
      expect(out.importRuns[0].rowsAccepted).toBe(0);
      expect(out.dataSource.failureReason).toBe("File is not a workbook");
      // The records are untouched: a refused file changes nothing.
      expect(out.enrolment.records).toHaveLength(0);
    });

    it("keeps the previous successful import when a later file is refused", () => {
      const r = report();
      const preview = buildOperationsPreview(
        sheet(
          ["Learner", "Course", "Registration Date", "Status"],
          [["A", CONFIG.programmes[0], "2026-07-05", "Enrolled"]]
        ),
        "enrolment",
        mappingFor("enrolment"),
        CONFIG
      );
      const good = applyOperationsImport(r, preview, { mode: "replace", fileName: "e.xlsx", actor: ACTOR, stamp: STAMP }).report;
      const afterFailure = recordOperationsImportFailure(good, "enrolment", "Could not read the file", {
        actor: ACTOR,
        fileName: "broken.xlsx",
        stamp: STAMP,
      });

      expect(afterFailure.enrolment.records).toHaveLength(1);
      expect(afterFailure.importRuns.map((x) => x.status)).toEqual(["Imported", "Failed"]);
    });
  });
});