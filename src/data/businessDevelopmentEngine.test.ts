import { describe, expect, it } from "vitest";
import { bdKpisNeedingExplanation, computeBdKpis, previewBdStatus, summariseOpportunities } from "./businessDevelopmentEngine";
import { validateBdReport } from "./businessDevelopmentValidation";
import {
  BD_SUBMISSION_KPIS,
  DEFAULT_BD_CONFIG,
  createBlankBdReport,
  createDemoBdDraft,
} from "./businessDevelopmentSeed";
import { BD_KPI_IDS, type BdConfig, type BdReport } from "../types/businessDevelopment";

const TODAY = new Date("2026-10-07T12:00:00");

const blank = (): BdReport =>
  createBlankBdReport({
    cycleId: "cyc-test",
    reportingPeriod: "October 2026",
    dueDate: "2026-10-31",
  });

const compute = (report: BdReport, config: BdConfig = DEFAULT_BD_CONFIG) =>
  computeBdKpis(report, BD_SUBMISSION_KPIS, config, TODAY);

const valueOf = (report: BdReport, kpiId: string) =>
  compute(report).entries.find((e) => e.kpiId === kpiId)?.value;

describe("Business Development demo draft", () => {
  it("passes validation, so Thabo can submit the mock data as-is", () => {
    const result = validateBdReport(createDemoBdDraft(), { config: DEFAULT_BD_CONFIG, today: TODAY });
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("derives every BD KPI from the six registers", () => {
    const draft = createDemoBdDraft();
    const computation = compute(draft);
    expect(computation.skipped).toEqual([]);
    expect(valueOf(draft, BD_KPI_IDS.newLeads)).toBe(6);
    expect(valueOf(draft, BD_KPI_IDS.leadToOpportunityConversion)).toBe(33.3); // 2 converted of 6
    expect(valueOf(draft, BD_KPI_IDS.activeOpportunities)).toBe(7); // 9 rows, 1 Won + 1 Lost
    expect(valueOf(draft, BD_KPI_IDS.pipelineValue)).toBe(3800000);
    expect(valueOf(draft, BD_KPI_IDS.weightedPipelineValue)).toBe(1575000); // value x probability
    expect(valueOf(draft, BD_KPI_IDS.opportunitiesStalled)).toBe(1); // 30-day threshold
    expect(valueOf(draft, BD_KPI_IDS.avgDaysToClose)).toBe(97); // won only, 10 Jun -> 15 Sep
    expect(valueOf(draft, BD_KPI_IDS.opportunityConversionRate)).toBe(11.1); // 1 won of 9 opened
    expect(valueOf(draft, BD_KPI_IDS.proposalsSubmitted)).toBe(5);
    expect(valueOf(draft, BD_KPI_IDS.proposalWinRate)).toBe(50); // 1 of 2 decided
    expect(valueOf(draft, BD_KPI_IDS.proposalConversionRate)).toBe(20); // 1 of 5 sent
    expect(valueOf(draft, BD_KPI_IDS.newBusinessWon)).toBe(950000);
    expect(valueOf(draft, BD_KPI_IDS.newBusinessWonCount)).toBe(2);
    expect(valueOf(draft, BD_KPI_IDS.newClients)).toBe(2);
  });

  it("flags the figures that will raise an Early Warning on submit", () => {
    const needsExplanation = bdKpisNeedingExplanation(compute(createDemoBdDraft()), BD_SUBMISSION_KPIS);
    const ids = needsExplanation.map((n) => n.kpiId);
    // 7 active opportunities sits below the amber threshold of 8.
    expect(ids).toContain(BD_KPI_IDS.activeOpportunities);
    expect(needsExplanation.find((n) => n.kpiId === BD_KPI_IDS.activeOpportunities)?.status).toBe("red");
  });
});

describe("Business Development engine rules", () => {
  it("leaves a KPI uncalculated rather than reporting zero when a register is empty", () => {
    const computation = compute(blank());
    expect(computation.entries).toEqual([]);
    expect(computation.skipped).toHaveLength(BD_SUBMISSION_KPIS.length);
    expect(computation.skipped.every((s) => s.reason === "no_data")).toBe(true);
  });

  it("does not divide by zero when no proposal has been decided", () => {
    const report = blank();
    report.proposals.proposals = [
      {
        id: "p1",
        client: "Kgatelopele Co-op",
        dateSubmitted: "2026-10-02",
        proposalValue: 100000,
        owner: "Thabo Molefe",
        status: "Under Review",
        won: null,
        lostReason: "",
        notes: "",
      },
    ];
    const computation = compute(report);
    expect(computation.entries.find((e) => e.kpiId === BD_KPI_IDS.proposalsSubmitted)?.value).toBe(1);
    const skipped = computation.skipped.find((s) => s.kpiId === BD_KPI_IDS.proposalWinRate);
    expect(skipped?.detail).toMatch(/divide by zero/);
  });

  it("measures stall against the configured threshold, not a hard-coded one", () => {
    const config: BdConfig = { ...DEFAULT_BD_CONFIG, stalledThresholdDays: 30 };
    const report = blank();
    const base = {
      estimatedValue: 100000,
      probability: 50,
      weightedValue: 50000,
      stage: "Qualified" as const,
      owner: "Thabo Molefe",
      dateCreated: "2026-06-01",
    };
    report.opportunities.opportunities = [
      { ...base, id: "o1", opportunityName: "A", client: "A", lastActivityDate: "2026-09-01" }, // 36 days
      { ...base, id: "o2", opportunityName: "B", client: "B", lastActivityDate: "2026-10-05" }, // 2 days
    ];
    expect(summariseOpportunities(report, config, TODAY)!.stalled).toBe(1);

    const lenient: BdConfig = { ...config, stalledThresholdDays: 60 };
    expect(summariseOpportunities(report, lenient, TODAY)!.stalled).toBe(0);
  });

  it("skips a section marked Not Applicable instead of reporting it as nothing", () => {
    const report = createDemoBdDraft();
    report.leads.notApplicable = true;
    const computation = compute(report);
    const skippedIds = computation.skipped.map((s) => s.kpiId);
    expect(skippedIds).toContain(BD_KPI_IDS.newLeads);
    expect(skippedIds).toContain(BD_KPI_IDS.leadToOpportunityConversion);
    expect(skippedIds).not.toContain(BD_KPI_IDS.pipelineValue);
    expect(computation.skipped[0].detail).toMatch(/Not Applicable/);
  });

  it("reports an unapproved threshold as threshold_unset, never as a colour", () => {
    const kpi = BD_SUBMISSION_KPIS.find((k) => k.id === BD_KPI_IDS.newBusinessWonCount)!;
    expect(previewBdStatus(kpi, 2).status).toBe("threshold_unset");
    const graded = BD_SUBMISSION_KPIS.find((k) => k.id === BD_KPI_IDS.pipelineValue)!;
    expect(previewBdStatus(graded, 3800000).status).toBe("green");
    expect(previewBdStatus(undefined, 1).status).toBe("no_data");
  });
});

describe("Business Development validation", () => {
  it("refuses an empty submission", () => {
    const result = validateBdReport(blank(), { config: DEFAULT_BD_CONFIG, today: TODAY });
    expect(result.valid).toBe(false);
    expect(result.bySection.leads.state).toBe("incomplete");
    expect(result.bySection.commentary.state).toBe("complete"); // prose is never a blocker

    const undated = validateBdReport(
      { ...blank(), reportingPeriod: "", dueDate: "" },
      { config: DEFAULT_BD_CONFIG, today: TODAY }
    );
    expect(undated.issues.some((i) => i.section === "general")).toBe(true);
  });

  it("accepts an empty section only when it is marked Not Applicable", () => {
    const report = blank();
    for (const key of ["leads", "opportunities", "proposals", "newBusiness", "clients", "partnerships"] as const) {
      report[key].notApplicable = true;
    }
    report.reportingPeriod = "October 2026";
    report.dueDate = "2026-10-31";
    expect(validateBdReport(report, { config: DEFAULT_BD_CONFIG, today: TODAY }).valid).toBe(true);
  });

  it("refuses a proposal whose status and won flag disagree", () => {
    const report = createDemoBdDraft();
    report.proposals.proposals[0] = { ...report.proposals.proposals[0], won: false };
    const result = validateBdReport(report, { config: DEFAULT_BD_CONFIG, today: TODAY });
    expect(result.bySection.proposals.state).toBe("incomplete");
    expect(result.issues.some((i) => i.message.includes("Status is Won"))).toBe(true);
  });

  it("refuses a probability outside 0 - 100", () => {
    const report = createDemoBdDraft();
    report.opportunities.opportunities[0] = { ...report.opportunities.opportunities[0], probability: 140 };
    const result = validateBdReport(report, { config: DEFAULT_BD_CONFIG, today: TODAY });
    expect(result.issues.some((i) => i.message.includes("between 0 and 100"))).toBe(true);
  });

  it("refuses an unapproved stage rather than silently dropping the record", () => {
    const report = createDemoBdDraft();
    report.opportunities.opportunities[0] = {
      ...report.opportunities.opportunities[0],
      stage: "Almost Closed" as never,
    };
    const result = validateBdReport(report, { config: DEFAULT_BD_CONFIG, today: TODAY });
    expect(result.issues.some((i) => i.message.includes("not an approved stage"))).toBe(true);
  });

  it("refuses an opportunity won before it was created", () => {
    const report = createDemoBdDraft();
    const won = report.opportunities.opportunities.find((o) => o.stage === "Won")!;
    report.opportunities.opportunities = report.opportunities.opportunities.map((o) =>
      o.id === won.id ? { ...o, wonDate: "2026-01-01" } : o
    );
    const result = validateBdReport(report, { config: DEFAULT_BD_CONFIG, today: TODAY });
    expect(result.issues.some((i) => i.message.includes("before the opportunity was created"))).toBe(true);
  });
});
