import { calculatePerformance, summarizeSetups } from "../core/performance";
import { addSignedDecimals, multiplySignedDecimals } from "../core/signed-decimal";
import { deriveTradeMetricsV1 } from "../core/trade-metrics";
import type {
  CalendarSession,
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeRuleReviewPreview,
} from "../core/types";

const DEMO_ACCOUNTS = Object.freeze({
  primary: Object.freeze({ id: "demo-account-primary", label: "Demo Brokerage" }),
  swing: Object.freeze({ id: "demo-account-swing", label: "Demo Swing" }),
});
const DEMO_ACCOUNT_LABEL = "2 demo accounts";
const DEMO_CURRENCY = "USD";
const DEMO_INITIAL_RISK = "100";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const PLAYBOOK_RULES = Object.freeze({
  Breakout: Object.freeze([
    "Base is clearly defined",
    "Volume confirms the move",
    "No chase beyond the entry zone",
  ]),
  Pullback: Object.freeze([
    "Trend is intact",
    "Entry is near support",
    "Invalidation is defined before entry",
  ]),
  Reversal: Object.freeze([
    "Wait for reversal confirmation",
    "Invalidation is defined before entry",
    "Risk stays inside the daily plan",
  ]),
});

type DemoSetup = keyof typeof PLAYBOOK_RULES;

interface DemoTradeInput {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: "stock" | "etf";
  readonly side: "long" | "short";
  readonly quantity: string;
  readonly entry: string;
  readonly exit: string;
  readonly netPnl: string;
  readonly setup: DemoSetup;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly note: string;
  readonly emotion: string;
  readonly mistakes: readonly string[];
  readonly tags: readonly string[];
  readonly followedPlan: boolean;
  readonly plannedStop: string;
  readonly account?: keyof typeof DEMO_ACCOUNTS;
  readonly brokenRuleIndex?: number;
}

function demoRules(input: DemoTradeInput, tradeSubjectId: string): readonly TradeRuleReviewPreview[] {
  return Object.freeze(PLAYBOOK_RULES[input.setup].map((text, index) => Object.freeze({
    ruleId: `${tradeSubjectId}:rule:${index + 1}`,
    text,
    outcome: index === input.brokenRuleIndex ? "broken" as const : "followed" as const,
  })));
}

function demoTrade(input: DemoTradeInput): TradePreview {
  const account = DEMO_ACCOUNTS[input.account ?? "primary"];
  const tradeSubjectId = `demo-subject-${input.id}`;
  const reviewId = `demo-review-${input.id}-v1`;
  const fullEntryNotional = multiplySignedDecimals(input.quantity, input.entry);
  const metrics = deriveTradeMetricsV1({
    assetClass: input.assetClass,
    netRealizedPnl: { amount: input.netPnl, currency: DEMO_CURRENCY },
    initialRisk: { amount: DEMO_INITIAL_RISK, currency: DEMO_CURRENCY },
    fullEntryNotional: { amount: fullEntryNotional, currency: DEMO_CURRENCY },
    isPartial: false,
  });
  const afternoon = input.sessionLabel.includes("Afternoon");
  const entryTime = afternoon ? "18:10:00.000Z" : "14:35:00.000Z";
  const exitTime = afternoon ? "19:15:00.000Z" : "15:50:00.000Z";
  const entrySide = input.side === "long" ? "buy" as const : "sell" as const;
  const exitSide = input.side === "long" ? "sell" as const : "buy" as const;

  return Object.freeze({
    id: tradeSubjectId,
    tradeSubjectId,
    accountId: account.id,
    reviewId,
    symbol: input.symbol,
    assetClass: input.assetClass,
    side: input.side,
    status: "closed",
    quantity: Number(input.quantity),
    averageEntry: Number(input.entry),
    averageExit: Number(input.exit),
    resultPnl: Number(input.netPnl),
    resultPnlExact: input.netPnl,
    resultR: metrics.resultR.value === null ? null : Number(metrics.resultR.value),
    percentReturn: metrics.percentReturn.value === null
      ? null
      : Number(metrics.percentReturn.value),
    resultRMetric: Object.freeze(metrics.resultR),
    percentReturnMetric: Object.freeze(metrics.percentReturn),
    setup: input.setup,
    hasClassifiedSetup: true,
    mistakes: Object.freeze([...input.mistakes]),
    emotion: input.emotion,
    tradedOn: input.tradedOn,
    reviewSessionDates: Object.freeze([input.tradedOn]),
    sessionLabel: input.sessionLabel,
    accountLabel: account.label,
    note: input.note,
    tags: Object.freeze([...input.tags]),
    followedPlan: input.followedPlan,
    playbook: input.setup,
    rules: demoRules(input, tradeSubjectId),
    initialRisk: Object.freeze({ amount: DEMO_INITIAL_RISK, currency: DEMO_CURRENCY }),
    plannedStop: input.plannedStop,
    reviewStatus: "completed",
    reviewVersion: 1,
    executions: Object.freeze([
      Object.freeze({
        allocationId: `${tradeSubjectId}:opening-allocation`,
        executionId: `${tradeSubjectId}:entry-execution`,
        effect: "entry" as const,
        side: entrySide,
        occurredAt: `${input.tradedOn}T${entryTime}`,
        quantity: input.quantity,
        price: input.entry,
        fee: "0",
        currency: DEMO_CURRENCY,
      }),
      Object.freeze({
        allocationId: `${tradeSubjectId}:closing-allocation`,
        executionId: `${tradeSubjectId}:exit-execution`,
        effect: "exit" as const,
        side: exitSide,
        occurredAt: `${input.tradedOn}T${exitTime}`,
        quantity: input.quantity,
        price: input.exit,
        fee: "0",
        currency: DEMO_CURRENCY,
      }),
    ]),
  });
}

const DEMO_TRADES: readonly TradePreview[] = Object.freeze([
  demoTrade({
    id: "aapl",
    symbol: "AAPL",
    assetClass: "stock",
    side: "long",
    quantity: "20",
    entry: "212.4",
    exit: "221.4",
    netPnl: "180",
    setup: "Breakout",
    tradedOn: "2026-07-01",
    sessionLabel: "Jul 1 · Morning",
    note: "Waited for the opening range to resolve before entering.",
    emotion: "Calm",
    mistakes: [],
    tags: ["Plan followed", "Opening range"],
    followedPlan: true,
    plannedStop: "207.4",
  }),
  demoTrade({
    id: "msft",
    symbol: "MSFT",
    assetClass: "stock",
    side: "long",
    quantity: "10",
    entry: "498.2",
    exit: "488.2",
    netPnl: "-100",
    setup: "Pullback",
    tradedOn: "2026-07-01",
    sessionLabel: "Jul 1 · Afternoon",
    note: "Stop respected; the pullback never reclaimed support.",
    emotion: "Calm",
    mistakes: [],
    tags: ["Plan followed", "Stop respected"],
    followedPlan: true,
    plannedStop: "488.2",
  }),
  demoTrade({
    id: "nvda",
    symbol: "NVDA",
    assetClass: "stock",
    side: "long",
    quantity: "20",
    entry: "158.1",
    exit: "169.1",
    netPnl: "220",
    setup: "Pullback",
    tradedOn: "2026-07-02",
    sessionLabel: "Jul 2 · Morning",
    note: "Held the planned target after a clean higher low.",
    emotion: "Patient",
    mistakes: [],
    tags: ["Plan followed", "Target held"],
    followedPlan: true,
    plannedStop: "153.1",
  }),
  demoTrade({
    id: "tsla",
    symbol: "TSLA",
    assetClass: "stock",
    side: "short",
    quantity: "10",
    entry: "318.4",
    exit: "325.4",
    netPnl: "-70",
    setup: "Reversal",
    tradedOn: "2026-07-02",
    sessionLabel: "Jul 2 · Afternoon",
    note: "Entered before confirmation and exited at the invalidation level.",
    emotion: "Impatient",
    mistakes: ["Early entry"],
    tags: ["Early entry", "Invalidation respected"],
    followedPlan: false,
    plannedStop: "328.4",
    account: "swing",
    brokenRuleIndex: 0,
  }),
  demoTrade({
    id: "amd",
    symbol: "AMD",
    assetClass: "stock",
    side: "long",
    quantity: "15",
    entry: "144.3",
    exit: "150.3",
    netPnl: "90",
    setup: "Breakout",
    tradedOn: "2026-07-06",
    sessionLabel: "Jul 6 · Morning",
    note: "Scaled at the first target and protected the remainder.",
    emotion: "Focused",
    mistakes: [],
    tags: ["Plan followed", "Protected remainder"],
    followedPlan: true,
    plannedStop: "137.63",
  }),
  demoTrade({
    id: "spy",
    symbol: "SPY",
    assetClass: "etf",
    side: "long",
    quantity: "5",
    entry: "622.6",
    exit: "602.6",
    netPnl: "-100",
    setup: "Breakout",
    tradedOn: "2026-07-07",
    sessionLabel: "Jul 7 · Afternoon",
    note: "Chased an extended move instead of waiting for a base.",
    emotion: "Impatient",
    mistakes: ["Chased entry"],
    tags: ["Chased entry", "Stopped on plan"],
    followedPlan: false,
    plannedStop: "602.6",
    account: "swing",
    brokenRuleIndex: 2,
  }),
  demoTrade({
    id: "meta",
    symbol: "META",
    assetClass: "stock",
    side: "long",
    quantity: "10",
    entry: "715.1",
    exit: "729.1",
    netPnl: "140",
    setup: "Pullback",
    tradedOn: "2026-07-08",
    sessionLabel: "Jul 8 · Morning",
    note: "Entry, stop, and exit matched the written plan.",
    emotion: "Calm",
    mistakes: [],
    tags: ["Plan followed", "Patient entry"],
    followedPlan: true,
    plannedStop: "705.1",
  }),
  demoTrade({
    id: "qqq",
    symbol: "QQQ",
    assetClass: "etf",
    side: "short",
    quantity: "5",
    entry: "557.2",
    exit: "567.2",
    netPnl: "-50",
    setup: "Reversal",
    tradedOn: "2026-07-09",
    sessionLabel: "Jul 9 · Morning",
    note: "Cut the trade early after recognizing weak confirmation.",
    emotion: "Hesitant",
    mistakes: [],
    tags: ["Early exit", "Risk reduced"],
    followedPlan: false,
    plannedStop: "577.2",
    account: "swing",
    brokenRuleIndex: 0,
  }),
]);

function demoCalendar(trades: readonly TradePreview[]): readonly CalendarSession[] {
  const sessions = new Map<string, {
    pnlExact: string;
    allocationCount: number;
    readonly contributions: CalendarSession["contributions"][number][];
  }>();
  for (const trade of trades) {
    const pnlExact = trade.resultPnlExact;
    if (pnlExact === null) {
      throw new Error(`Demo trade ${trade.tradeSubjectId} has no realized P&L.`);
    }
    if (trade.executions.some((execution) => !execution.occurredAt.startsWith(trade.tradedOn))) {
      throw new Error(`Demo trade ${trade.tradeSubjectId} crosses a calendar day.`);
    }
    const existing = sessions.get(trade.tradedOn);
    const contribution = Object.freeze({
      tradeSubjectId: trade.tradeSubjectId,
      pnlExact,
      pnl: Number(pnlExact),
      allocationCount: trade.executions.length,
    });
    const contributions = [...(existing?.contributions ?? []), contribution];
    sessions.set(trade.tradedOn, {
      pnlExact: addSignedDecimals(existing?.pnlExact ?? "0", pnlExact),
      allocationCount: (existing?.allocationCount ?? 0) + trade.executions.length,
      contributions,
    });
  }
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return Object.freeze(
    [...sessions.entries()]
      .sort(([left], [right]) => stableCompare(left, right))
      .map(([isoDate, session]) => Object.freeze({
        isoDate,
        dayLabel: weekday.format(new Date(`${isoDate}T12:00:00Z`)),
        dateLabel: date.format(new Date(`${isoDate}T12:00:00Z`)),
        pnlExact: session.pnlExact,
        pnl: Number(session.pnlExact),
        tradeCount: session.contributions.length,
        allocationCount: session.allocationCount,
        contributions: Object.freeze(
          [...session.contributions].sort((left, right) => (
            stableCompare(left.tradeSubjectId, right.tradeSubjectId)
          )),
        ),
      })),
  );
}

const DEMO_PLAYBOOKS = Object.freeze(
  (["Pullback", "Breakout", "Reversal"] as const).map((name) => {
    const summary = summarizeSetups(DEMO_TRADES).find((item) => item.name === name);
    if (summary === undefined) throw new Error(`Demo playbook ${name} has no trades.`);
    return Object.freeze({ ...summary, rules: PLAYBOOK_RULES[name] });
  }),
);

export const DEMO_WORKSPACE: JournalWorkspaceSnapshot = Object.freeze({
  provenance: "demo",
  provenanceLabel: "DEMO JOURNAL · FICTIONAL RESULTS · NO REAL TRADES",
  currencyCode: DEMO_CURRENCY,
  timeZone: "UTC",
  accountLabel: DEMO_ACCOUNT_LABEL,
  accountOptions: Object.freeze(
    Object.values(DEMO_ACCOUNTS).map((account) => Object.freeze({
      id: account.id,
      label: account.label,
      tradeCount: DEMO_TRADES.filter((trade) => trade.accountId === account.id).length,
    })),
  ),
  periodLabel: "Jul 1–9, 2026",
  performance: Object.freeze(calculatePerformance(DEMO_TRADES)),
  importSummary: Object.freeze({
    receiptId: "demo-import",
    accountLabel: DEMO_ACCOUNTS.primary.label,
    sourceLabel: "Generic broker CSV",
    importedAtLabel: "Demo import · Jul 9",
    executions: DEMO_TRADES.length,
    accounts: 2,
    rejectedRows: 0,
    skippedRows: 0,
    rolledBack: false,
  }),
  importHistory: Object.freeze([
    Object.freeze({
      receiptId: "demo-import",
      accountLabel: DEMO_ACCOUNTS.primary.label,
      sourceLabel: "Generic broker CSV",
      importedAtLabel: "Demo import · Jul 9",
      executions: DEMO_TRADES.length,
      accounts: 2,
      rejectedRows: 0,
      skippedRows: 0,
      rolledBack: false,
      warningCount: 0,
    }),
  ]),
  equityCurve: Object.freeze([0, 180, 80, 300, 230, 320, 220, 360, 310]),
  calendar: demoCalendar(DEMO_TRADES),
  trades: DEMO_TRADES,
  reviewProgress: Object.freeze({
    pendingTrades: 0,
    draftTrades: 0,
    completedTrades: DEMO_TRADES.length,
    streakSessions: 6,
    reviewedSessions: 6,
    tradingSessions: 6,
  }),
  reviewOptions: Object.freeze({
    setups: Object.freeze(["Breakout", "Pullback", "Reversal"]),
    mistakes: Object.freeze(["Chased entry", "Early entry"]),
    emotions: Object.freeze(["Calm", "Focused", "Hesitant", "Impatient", "Patient"]),
    tags: Object.freeze([
      "Chased entry",
      "Early entry",
      "Early exit",
      "Invalidation respected",
      "Opening range",
      "Patient entry",
      "Plan followed",
      "Protected remainder",
      "Risk reduced",
      "Stop respected",
      "Stopped on plan",
      "Target held",
    ]),
    playbooks: Object.freeze(
      (Object.keys(PLAYBOOK_RULES) as DemoSetup[]).map((name) => Object.freeze({
        name,
        rules: PLAYBOOK_RULES[name],
      })),
    ),
  }),
  dailyJournal: Object.freeze([
    Object.freeze({
      isoDate: "2026-07-09",
      dateLabel: "Jul 9",
      entryVersionId: "demo-daily-entry-2026-07-09-v1",
      version: 1,
      state: "completed",
      revision: "9".repeat(64),
      title: "Protected a slow morning",
      note: "The first reversal lacked confirmation. I recognized it early, reduced the loss, and stopped trading instead of forcing another setup.",
      emotion: "Hesitant",
      processScorePct: 88,
      tags: Object.freeze(["Early exit", "Reversal"]),
      recordedAtUs: "1783616400000000",
      completedAtUs: "1783616400000000",
    }),
    Object.freeze({
      isoDate: "2026-07-08",
      dateLabel: "Jul 8",
      entryVersionId: "demo-daily-entry-2026-07-08-v1",
      version: 1,
      state: "completed",
      revision: "8".repeat(64),
      title: "Patience paid",
      note: "Waited for the pullback to hold, entered inside the planned zone, and let the original target do the work.",
      emotion: "Calm",
      processScorePct: 100,
      tags: Object.freeze(["Plan followed", "Pullback"]),
      recordedAtUs: "1783530000000000",
      completedAtUs: "1783530000000000",
    }),
  ]),
  playbooks: DEMO_PLAYBOOKS,
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
