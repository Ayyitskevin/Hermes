import type { DashboardSnapshot } from "../core/types";

export const SAMPLE_SNAPSHOT: DashboardSnapshot = Object.freeze({
  provenance: "sample",
  provenanceLabel: "SAMPLE JOURNAL · NOT LIVE DATA · NOT YOUR TRADES",
  freshnessLabel: "Frozen teaching workspace",
  risk: Object.freeze({
    level: "ok",
    openRiskPct: 1.7,
    limitPct: 4,
    bindingLimit: "Open-risk budget",
  }),
  performance: Object.freeze({
    netR: 3.4,
    winRatePct: 57.1,
    profitFactor: 1.62,
    averageR: 0.28,
    ruleAdherencePct: 83,
    tradeCount: 12,
  }),
  importSummary: Object.freeze({
    sourceLabel: "Generic CSV teaching file",
    trades: 24,
    accounts: 1,
    rejectedRows: 0,
  }),
  posture: "ALLOW",
  regime: "Confirmed bull",
  confidencePct: 82,
  processBrief:
    "The sample journal is positive when its breakout rules are followed and negative when entries are chased. Keep risk fixed and review the mistake tag before the next session.",
  journal: Object.freeze([
    Object.freeze({
      symbol: "NVDA",
      side: "long",
      status: "open",
      plannedRiskPct: 0.7,
      resultR: null,
      setup: "Breakout continuation",
      sessionLabel: "Jul 9 · Morning",
      thesis: "Leadership continuation while price holds the planned invalidation level.",
    }),
    Object.freeze({
      symbol: "META",
      side: "long",
      status: "resolved",
      plannedRiskPct: 0.5,
      resultR: 1.8,
      setup: "Pullback",
      sessionLabel: "Jul 8 · Afternoon",
      thesis: "Pullback held above the rising trend structure in the sample tape.",
    }),
    Object.freeze({
      symbol: "XLE",
      side: "long",
      status: "resolved",
      plannedRiskPct: 0.5,
      resultR: -0.7,
      setup: "Late breakout",
      sessionLabel: "Jul 7 · Morning",
      thesis: "Entry chased beyond the playbook zone; tagged as a process mistake.",
    }),
  ]),
});

export interface DashboardDataSource {
  readonly mode: "sample";
  loadSnapshot(): Promise<DashboardSnapshot>;
}

export const sampleDataSource: DashboardDataSource = Object.freeze({
  mode: "sample",
  async loadSnapshot() {
    return SAMPLE_SNAPSHOT;
  },
});
