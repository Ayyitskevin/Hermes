import type { TradeMetricEvidence } from "./trade-metrics";

export type TabId = "dashboard" | "trades" | "journal" | "reports" | "more";
export type TradeSide = "long" | "short";
export type TradeStatus = "open" | "closed";

export interface TradeExecutionPreview {
  readonly allocationId: string;
  readonly executionId: string;
  readonly effect: "entry" | "exit";
  readonly side: "buy" | "sell";
  readonly occurredAt: string;
  readonly quantity: string;
  readonly price: string;
  readonly fee: string;
  readonly currency: string;
}

export interface TradeRuleReviewPreview {
  readonly ruleId: string;
  readonly text: string;
  readonly outcome: "followed" | "broken" | "not_applicable" | "unreviewed";
}

export interface TradePreview {
  readonly id: string;
  readonly tradeSubjectId: string;
  /** Stable account identity for derived browsing scope; never filter by label. */
  readonly accountId: string;
  readonly symbol: string;
  readonly assetClass: "stock" | "etf";
  readonly side: TradeSide;
  readonly status: TradeStatus;
  readonly quantity: number;
  readonly averageEntry: number;
  readonly averageExit: number | null;
  readonly resultPnl: number | null;
  readonly resultPnlExact: string | null;
  readonly resultR: number | null;
  readonly percentReturn: number | null;
  readonly resultRMetric: TradeMetricEvidence;
  readonly percentReturnMetric: TradeMetricEvidence;
  readonly setup: string;
  readonly hasClassifiedSetup: boolean;
  readonly mistakes: readonly string[];
  readonly emotion: string | null;
  readonly tradedOn: string;
  /** Workspace-local execution dates this trade's versioned review can satisfy. */
  readonly reviewSessionDates: readonly string[];
  readonly sessionLabel: string;
  readonly accountLabel: string;
  readonly note: string;
  readonly tags: readonly string[];
  readonly followedPlan: boolean | null;
  readonly playbook: string | null;
  readonly rules: readonly TradeRuleReviewPreview[];
  readonly initialRisk: {
    readonly amount: string;
    readonly currency: string;
  } | null;
  readonly plannedStop: string | null;
  readonly reviewStatus: "pending" | "draft" | "completed";
  /** Current immutable review-head ID used for optimistic edits. */
  readonly reviewId: string | null;
  readonly reviewVersion: number | null;
  readonly executions: readonly TradeExecutionPreview[];
}

export interface PerformanceSnapshot {
  readonly netPnl: number;
  readonly netR: number | null;
  readonly winRatePct: number;
  readonly profitFactor: number | null;
  readonly averageR: number | null;
  readonly rTradeCount: number;
  readonly ruleAdherencePct: number | null;
  readonly ruleReviewCount: number;
  readonly tradeCount: number;
}

export interface JournalAccountOption {
  /** Stable ledger identity used by ephemeral account filters. */
  readonly id: string;
  readonly label: string;
  readonly tradeCount: number;
}

export interface ImportSummary {
  readonly receiptId: string | null;
  readonly accountLabel: string;
  readonly sourceLabel: string;
  readonly importedAtLabel: string;
  readonly executions: number;
  readonly accounts: number;
  readonly rejectedRows: number;
  readonly skippedRows: number;
  readonly rolledBack: boolean;
}

export interface ImportHistoryPreview extends ImportSummary {
  readonly warningCount: number;
}

export interface CalendarTradeContribution {
  /** Durable trade identity; never a display symbol or projection-only ID. */
  readonly tradeSubjectId: string;
  /** Exact allocation-day P&L contribution before display conversion. */
  readonly pnlExact: string;
  readonly pnl: number;
  readonly allocationCount: number;
}

export interface CalendarSession {
  readonly isoDate: string;
  readonly dayLabel: string;
  readonly dateLabel: string;
  /** Exact sum of every allocation event assigned to this workspace-local day. */
  readonly pnlExact: string;
  readonly pnl: number;
  readonly tradeCount: number;
  readonly allocationCount: number;
  readonly contributions: readonly CalendarTradeContribution[];
}

export interface DailyJournalPreview {
  readonly isoDate: string;
  readonly dateLabel: string;
  readonly entryVersionId: string;
  readonly version: number;
  readonly state: "draft" | "completed";
  readonly revision: string;
  readonly title: string | null;
  readonly note: string;
  readonly emotion: string | null;
  /** Optional self-report; never a derived performance or Plan Check metric. */
  readonly processScorePct: number | null;
  readonly tags: readonly string[];
  readonly recordedAtUs: string;
  readonly completedAtUs: string | null;
}

export interface PlaybookPreview {
  readonly name: string;
  readonly tradeCount: number;
  readonly netR: number | null;
  readonly winRatePct: number;
  readonly rules: readonly string[];
}

export interface ReviewProgressSnapshot {
  readonly pendingTrades: number;
  readonly draftTrades: number;
  readonly completedTrades: number;
  /** Consecutive reviewed trading sessions ending at the latest trading session. */
  readonly streakSessions: number;
  readonly reviewedSessions: number;
  readonly tradingSessions: number;
}

export interface ReviewOptionSnapshot {
  readonly setups: readonly string[];
  readonly mistakes: readonly string[];
  readonly emotions: readonly string[];
  readonly tags: readonly string[];
  readonly playbooks: readonly {
    readonly name: string;
    readonly rules: readonly string[];
  }[];
}

export interface JournalWorkspaceSnapshot {
  readonly provenance: "empty" | "demo" | "local";
  readonly provenanceLabel: string;
  /** One display currency. A workspace never silently aggregates currencies. */
  readonly currencyCode: string;
  readonly timeZone: string;
  readonly accountLabel: string;
  /** Active and retained ledger accounts available to the trade browser. */
  readonly accountOptions: readonly JournalAccountOption[];
  readonly periodLabel: string;
  readonly performance: PerformanceSnapshot;
  readonly importSummary: ImportSummary;
  readonly importHistory: readonly ImportHistoryPreview[];
  readonly equityCurve: readonly number[];
  readonly calendar: readonly CalendarSession[];
  readonly trades: readonly TradePreview[];
  readonly reviewProgress: ReviewProgressSnapshot;
  readonly reviewOptions: ReviewOptionSnapshot;
  readonly dailyJournal: readonly DailyJournalPreview[];
  readonly playbooks: readonly PlaybookPreview[];
}
