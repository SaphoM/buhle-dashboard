import { BD_KPI_IDS, type BdReport } from "../types/businessDevelopment";
import type { Kpi } from "../types";

export interface BdComputation {
  kpis: Kpi[];
  alerts: Array<{ kpiId: string; message: string; severity: "amber" | "red" }>;
  warnings: Array<{ title: string; detail: string; severity: "amber" | "red" }>;
}

export function computeBdKpis(report: BdReport, existingKpis: Kpi[], config: { stalledThresholdDays: number }): BdComputation {
  const kpis = existingKpis.map((k) => ({ ...k }));
  
  const opportunities = report.opportunities.opportunities || [];
  const activeOpportunities = opportunities.filter((o) => 
    o.stage !== "Won" && o.stage !== "Lost"
  );
  
  const pipelineValue = activeOpportunities.reduce((sum, o) => sum + (o.estimatedValue || 0), 0);
  const weightedPipelineValue = activeOpportunities.reduce((sum, o) => 
    sum + ((o.estimatedValue || 0) * ((o.probability || 0) / 100)), 0
  );
  
  const leads = report.leads.leads || [];
  const newLeads = leads.length;
  
  const proposals = report.proposals.proposals || [];
  const proposalsSubmitted = proposals.length;
  const decidedProposals = proposals.filter((p) => p.status === "Won" || p.status === "Lost");
  const wonProposals = proposals.filter((p) => p.status === "Won");
  const proposalWinRate = decidedProposals.length > 0 ? (wonProposals.length / decidedProposals.length) * 100 : 0;
  
  const newBusiness = report.newBusiness.newBusiness || [];
  const newBusinessWon = newBusiness.reduce((sum, nb) => sum + (nb.wonValue || 0), 0);
  const newBusinessWonCount = newBusiness.length;
  
  const clients = report.clients.clients || [];
  const newClients = clients.length;
  
  const bdRevenue = newBusinessWon;
  
  const now = Date.now();
  const stalledThresholdMs = config.stalledThresholdDays * 24 * 60 * 60 * 1000;
  const stalled = activeOpportunities.filter((o) => {
    const last = o.lastActivityDate ? new Date(o.lastActivityDate).getTime() : new Date(o.dateCreated).getTime();
    return now - last > stalledThresholdMs;
  }).length;
  
  const wonOpps = opportunities.filter((o) => o.stage === "Won" && o.wonDate && o.dateCreated);
  const avgDaysToClose = wonOpps.length > 0
    ? wonOpps.reduce((sum, o) => {
        const days = (new Date(o.wonDate!).getTime() - new Date(o.dateCreated).getTime()) / (24 * 60 * 60 * 1000);
        return sum + days;
      }, 0) / wonOpps.length
    : 0;
  
  const update = (id: string, value: number) => {
    const k = kpis.find((x) => x.id === id);
    if (k) k.currentValue = value;
  };
  
  update(BD_KPI_IDS.activeOpportunities, activeOpportunities.length);
  update(BD_KPI_IDS.pipelineValue, pipelineValue);
  update(BD_KPI_IDS.weightedPipelineValue, weightedPipelineValue);
  update(BD_KPI_IDS.newLeads, newLeads);
  update(BD_KPI_IDS.proposalsSubmitted, proposalsSubmitted);
  update(BD_KPI_IDS.proposalWinRate, proposalWinRate);
  update(BD_KPI_IDS.newBusinessWon, newBusinessWon);
  update(BD_KPI_IDS.newBusinessWonCount, newBusinessWonCount);
  update(BD_KPI_IDS.newClients, newClients);
  update(BD_KPI_IDS.bdRevenue, bdRevenue);
  update(BD_KPI_IDS.opportunitiesStalled, stalled);
  update(BD_KPI_IDS.avgDaysToClose, avgDaysToClose);
  
  return { kpis, alerts: [], warnings: [] };
}
