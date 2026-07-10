export type RiskLevel = "ok" | "warn" | "breach";
export type Posture = "ALLOW" | "RESTRICT" | "CASH PRIORITY";
export type TabId = "today" | "trades" | "journal" | "insights" | "more";

export interface RiskSnapshot {
  readonly level: RiskLevel;
  readonly openRiskPct: number;
  readonly limitPct: number;
  readonly bindingLimit: string;
}

export interface PerformanceSnapshot {
  readonly netR: number;
  readonly winRatePct: number;
  readonly profitFactor: number;
  readonly averageR: number;
  readonly ruleAdherencePct: number;
  readonly tradeCount: number;
}

export interface ImportSummary {
  readonly sourceLabel: string;
  readonly trades: number;
  readonly accounts: number;
  readonly rejectedRows: number;
}

export interface JournalPreview {
  readonly symbol: string;
  readonly side: "long" | "short";
  readonly status: "open" | "resolved";
  readonly plannedRiskPct: number;
  readonly resultR: number | null;
  readonly setup: string;
  readonly sessionLabel: string;
  readonly thesis: string;
}

export interface DashboardSnapshot {
  readonly provenance: "sample";
  readonly provenanceLabel: string;
  readonly freshnessLabel: string;
  readonly risk: RiskSnapshot;
  readonly performance: PerformanceSnapshot;
  readonly importSummary: ImportSummary;
  readonly posture: Posture;
  readonly regime: string;
  readonly confidencePct: number;
  readonly processBrief: string;
  readonly journal: readonly JournalPreview[];
}
