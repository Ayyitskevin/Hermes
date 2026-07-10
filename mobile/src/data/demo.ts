import { calculatePerformance } from "../core/performance";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";

const DEMO_TRADES: readonly TradePreview[] = Object.freeze([
  Object.freeze({ id: "demo-aapl", symbol: "AAPL", assetClass: "stock", side: "long", status: "closed", quantity: 20, averageEntry: 212.40, averageExit: 221.40, resultPnl: 180, resultR: 1.8, setup: "Breakout", tradedOn: "2026-07-01", sessionLabel: "Jul 1 · Morning", accountLabel: "Demo Brokerage", note: "Waited for the opening range to resolve before entering.", tags: Object.freeze(["Calm", "Plan followed"]), followedPlan: true }),
  Object.freeze({ id: "demo-msft", symbol: "MSFT", assetClass: "stock", side: "long", status: "closed", quantity: 10, averageEntry: 498.20, averageExit: 488.20, resultPnl: -100, resultR: -1, setup: "Pullback", tradedOn: "2026-07-01", sessionLabel: "Jul 1 · Afternoon", accountLabel: "Demo Brokerage", note: "Stop respected; the pullback never reclaimed support.", tags: Object.freeze(["Calm", "Plan followed"]), followedPlan: true }),
  Object.freeze({ id: "demo-nvda", symbol: "NVDA", assetClass: "stock", side: "long", status: "closed", quantity: 20, averageEntry: 158.10, averageExit: 169.10, resultPnl: 220, resultR: 2.2, setup: "Pullback", tradedOn: "2026-07-02", sessionLabel: "Jul 2 · Morning", accountLabel: "Demo Brokerage", note: "Held the planned target after a clean higher low.", tags: Object.freeze(["Patient", "Plan followed"]), followedPlan: true }),
  Object.freeze({ id: "demo-tsla", symbol: "TSLA", assetClass: "stock", side: "short", status: "closed", quantity: 10, averageEntry: 318.40, averageExit: 325.40, resultPnl: -70, resultR: -0.7, setup: "Reversal", tradedOn: "2026-07-02", sessionLabel: "Jul 2 · Afternoon", accountLabel: "Demo Brokerage", note: "Entered before confirmation and exited at the invalidation level.", tags: Object.freeze(["Impatient", "Early entry"]), followedPlan: false }),
  Object.freeze({ id: "demo-amd", symbol: "AMD", assetClass: "stock", side: "long", status: "closed", quantity: 15, averageEntry: 144.30, averageExit: 150.30, resultPnl: 90, resultR: 0.9, setup: "Breakout", tradedOn: "2026-07-06", sessionLabel: "Jul 6 · Morning", accountLabel: "Demo Brokerage", note: "Scaled at the first target and protected the remainder.", tags: Object.freeze(["Focused", "Plan followed"]), followedPlan: true }),
  Object.freeze({ id: "demo-spy", symbol: "SPY", assetClass: "etf", side: "long", status: "closed", quantity: 5, averageEntry: 622.60, averageExit: 602.60, resultPnl: -100, resultR: -1, setup: "Breakout", tradedOn: "2026-07-07", sessionLabel: "Jul 7 · Afternoon", accountLabel: "Demo Brokerage", note: "Chased an extended move instead of waiting for a base.", tags: Object.freeze(["Impatient", "Chased entry"]), followedPlan: false }),
  Object.freeze({ id: "demo-meta", symbol: "META", assetClass: "stock", side: "long", status: "closed", quantity: 10, averageEntry: 715.10, averageExit: 729.10, resultPnl: 140, resultR: 1.4, setup: "Pullback", tradedOn: "2026-07-08", sessionLabel: "Jul 8 · Morning", accountLabel: "Demo Brokerage", note: "Entry, stop, and exit matched the written plan.", tags: Object.freeze(["Calm", "Plan followed"]), followedPlan: true }),
  Object.freeze({ id: "demo-qqq", symbol: "QQQ", assetClass: "etf", side: "short", status: "closed", quantity: 5, averageEntry: 557.20, averageExit: 567.20, resultPnl: -50, resultR: -0.5, setup: "Reversal", tradedOn: "2026-07-09", sessionLabel: "Jul 9 · Morning", accountLabel: "Demo Brokerage", note: "Cut the trade early after recognizing weak confirmation.", tags: Object.freeze(["Hesitant", "Early exit"]), followedPlan: true }),
]);

export const DEMO_WORKSPACE: JournalWorkspaceSnapshot = Object.freeze({
  provenance: "demo",
  provenanceLabel: "DEMO JOURNAL · FICTIONAL RESULTS",
  currencyCode: "USD",
  timeZone: "UTC",
  accountLabel: "Demo Brokerage",
  periodLabel: "Jul 1–9, 2026",
  performance: Object.freeze(calculatePerformance(DEMO_TRADES)),
  importSummary: Object.freeze({
    receiptId: "demo-import",
    accountLabel: "Demo Brokerage",
    sourceLabel: "Generic broker CSV",
    importedAtLabel: "Demo import · Jul 9",
    executions: DEMO_TRADES.length,
    accounts: 1,
    rejectedRows: 0,
    skippedRows: 0,
    rolledBack: false,
  }),
  importHistory: Object.freeze([
    Object.freeze({
      receiptId: "demo-import",
      accountLabel: "Demo Brokerage",
      sourceLabel: "Generic broker CSV",
      importedAtLabel: "Demo import · Jul 9",
      executions: DEMO_TRADES.length,
      accounts: 1,
      rejectedRows: 0,
      skippedRows: 0,
      rolledBack: false,
      warningCount: 0,
    }),
  ]),
  equityCurve: Object.freeze([0, 180, 80, 300, 230, 320, 220, 360, 310]),
  calendar: Object.freeze([
    Object.freeze({ isoDate: "2026-07-01", dayLabel: "Wed", dateLabel: "Jul 1", pnl: 80, tradeCount: 2 }),
    Object.freeze({ isoDate: "2026-07-02", dayLabel: "Thu", dateLabel: "Jul 2", pnl: 150, tradeCount: 2 }),
    Object.freeze({ isoDate: "2026-07-06", dayLabel: "Mon", dateLabel: "Jul 6", pnl: 90, tradeCount: 1 }),
    Object.freeze({ isoDate: "2026-07-07", dayLabel: "Tue", dateLabel: "Jul 7", pnl: -100, tradeCount: 1 }),
    Object.freeze({ isoDate: "2026-07-08", dayLabel: "Wed", dateLabel: "Jul 8", pnl: 140, tradeCount: 1 }),
    Object.freeze({ isoDate: "2026-07-09", dayLabel: "Thu", dateLabel: "Jul 9", pnl: -50, tradeCount: 1 }),
  ]),
  trades: DEMO_TRADES,
  dailyJournal: Object.freeze([
    Object.freeze({ dateLabel: "Jul 9", title: "Protected a slow morning", note: "The first reversal lacked confirmation. I recognized it early, reduced the loss, and stopped trading instead of forcing another setup.", emotion: "Hesitant", disciplineScore: 88, tags: Object.freeze(["Early exit", "Reversal"]) }),
    Object.freeze({ dateLabel: "Jul 8", title: "Patience paid", note: "Waited for the pullback to hold, entered inside the planned zone, and let the original target do the work.", emotion: "Calm", disciplineScore: 100, tags: Object.freeze(["Plan followed", "Pullback"]) }),
  ]),
  playbooks: Object.freeze([
    Object.freeze({ name: "Pullback", tradeCount: 3, netR: 2.6, winRatePct: 66.7, rules: Object.freeze(["Trend is intact", "Entry is near support", "Invalidation is defined before entry"]) }),
    Object.freeze({ name: "Breakout", tradeCount: 3, netR: 1.7, winRatePct: 66.7, rules: Object.freeze(["Base is clearly defined", "Volume confirms the move", "No chase beyond the entry zone"]) }),
  ]),
});

export interface JournalDataSource {
  readonly mode: "demo";
  loadWorkspace(): Promise<JournalWorkspaceSnapshot>;
}

export const demoDataSource: JournalDataSource = Object.freeze({
  mode: "demo",
  async loadWorkspace() {
    return DEMO_WORKSPACE;
  },
});
