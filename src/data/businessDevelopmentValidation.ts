import type { BdReport } from "../types/businessDevelopment";

export interface BdValidationIssue {
  section: string;
  message: string;
  path?: string;
}

export function validateBdReport(report: BdReport): BdValidationIssue[] {
  const issues: BdValidationIssue[] = [];
  
  if (!report.reportingPeriod?.trim()) {
    issues.push({ section: "general", message: "Reporting period is required" });
  }
  if (!report.dueDate?.trim()) {
    issues.push({ section: "general", message: "Due date is required" });
  }
  
  return issues;
}
