export type TabId = "dashboard" | "trades" | "journal" | "reports" | "more";
export type TradeSide = "long" | "short";
export type TradeStatus = "open" | "closed";

export interface TradePreview {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: "stock" | "etf";
  readonly side: TradeSide;
  readonly status: TradeStatus;
  readonly quantity: number;
  readonly averageEntry: number;
  readonly averageExit: number | null;
  readonly resultPnl: number | null;
  readonly resultR: number | null;
  readonly setup: string;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly accountLabel: string;
  readonly note: string;
  readonly tags: readonly string[];
  readonly followedPlan: boolean;
}

export interface PerformanceSnapshot {
  readonly netPnl: number;
  readonly netR: number | null;
  readonly winRatePct: number;
  readonly profitFactor: number | null;
  readonly averageR: number | null;
  readonly rTradeCount: number;
  readonly ruleAdherencePct: number;
  readonly tradeCount: number;
}

export interface ImportSummary {
  readonly sourceLabel: string;
  readonly importedAtLabel: string;
  readonly trades: number;
  readonly accounts: number;
  readonly rejectedRows: number;
}

export interface CalendarSession {
  readonly isoDate: string;
  readonly dayLabel: string;
  readonly dateLabel: string;
  readonly pnl: number;
  readonly tradeCount: number;
}

export interface DailyJournalPreview {
  readonly dateLabel: string;
  readonly title: string;
  readonly note: string;
  readonly emotion: string;
  readonly disciplineScore: number;
  readonly tags: readonly string[];
}

export interface PlaybookPreview {
  readonly name: string;
  readonly tradeCount: number;
  readonly netR: number;
  readonly winRatePct: number;
  readonly rules: readonly string[];
}

export interface JournalWorkspaceSnapshot {
  readonly provenance: "demo";
  readonly provenanceLabel: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly performance: PerformanceSnapshot;
  readonly importSummary: ImportSummary;
  readonly equityCurve: readonly number[];
  readonly calendar: readonly CalendarSession[];
  readonly trades: readonly TradePreview[];
  readonly dailyJournal: readonly DailyJournalPreview[];
  readonly playbooks: readonly PlaybookPreview[];
}
