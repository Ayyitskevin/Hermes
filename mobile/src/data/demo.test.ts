import { afterEach, describe, expect, it, vi } from "vitest";

import { summarizeSetups } from "../core/performance";
import { multiplySignedDecimals, sumSignedDecimals } from "../core/signed-decimal";
import { demoDataSource } from "./demo";

describe("offline demo journal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("derives a coherent, conspicuously fictional fixture without a network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const workspace = await demoDataSource.loadWorkspace();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(workspace.provenance).toBe("demo");
    expect(workspace.provenanceLabel).toContain("FICTIONAL RESULTS");
    expect(workspace.provenanceLabel).toContain("NO REAL TRADES");
    expect(workspace.trades).toHaveLength(8);
    expect(workspace.performance.netPnl).toBe(310);
    expect(workspace.performance.netR).toBe(3.1);
    expect(workspace.performance.winRatePct).toBe(50);
    expect(workspace.performance.profitFactor).toBeCloseTo(1.97, 2);
    expect(workspace.performance.averageR).toBeCloseTo(0.39, 2);
    expect(workspace.importSummary.executions).toBe(workspace.trades.length);
  });

  it("reconciles immutable subjects, executions, exact metrics, and published playbooks", async () => {
    const workspace = await demoDataSource.loadWorkspace();
    const ids = new Set(workspace.trades.map((trade) => trade.id));
    const reviewIds = new Set(workspace.trades.map((trade) => trade.reviewId));
    const curve = [0];

    expect(ids.size).toBe(workspace.trades.length);
    expect(reviewIds.size).toBe(workspace.trades.length);
    for (const trade of workspace.trades) {
      expect(trade.id).toBe(trade.tradeSubjectId);
      expect(trade.tradeSubjectId).toMatch(/^demo-subject-/);
      expect(trade.reviewId).toMatch(/^demo-review-.*-v1$/);
      expect(trade.reviewStatus).toBe("completed");
      expect(trade.reviewVersion).toBe(1);
      expect(trade.averageExit).not.toBeNull();
      expect(trade.initialRisk).toEqual({ amount: "100", currency: "USD" });
      expect(trade.plannedStop).not.toBeNull();
      expect(trade.playbook).toBe(trade.setup);
      expect(trade.emotion).not.toBeNull();
      expect(trade.rules).toHaveLength(3);
      expect(trade.rules.every((rule) => rule.outcome !== "unreviewed")).toBe(true);
      expect(trade.rules.some((rule) => rule.outcome === "broken")).toBe(!trade.followedPlan);

      const [entry, exit] = trade.executions;
      expect(trade.executions).toHaveLength(2);
      expect(entry).toMatchObject({ effect: "entry", currency: "USD", fee: "0" });
      expect(exit).toMatchObject({ effect: "exit", currency: "USD", fee: "0" });
      expect(entry?.quantity).toBe(exit?.quantity);
      expect(entry?.quantity).toBe(String(trade.quantity));
      expect(entry?.side).toBe(trade.side === "long" ? "buy" : "sell");
      expect(exit?.side).toBe(trade.side === "long" ? "sell" : "buy");

      const direction = trade.side === "long" ? 1 : -1;
      const calculatedPnl = direction
        * (Number(exit?.price) - Number(entry?.price))
        * Number(entry?.quantity);
      expect(trade.resultPnl).toBeCloseTo(calculatedPnl, 8);
      expect(Number(trade.resultPnlExact)).toBe(trade.resultPnl);
      curve.push((curve.at(-1) ?? 0) + (trade.resultPnl ?? 0));

      expect(trade.resultRMetric).toMatchObject({
        metric: "result-r",
        definitionVersion: "result-r-v1",
        value: String(trade.resultR),
        nullReason: null,
        numerator: { amount: trade.resultPnlExact, currency: "USD" },
        denominator: trade.initialRisk,
        currency: "USD",
        isPartial: false,
      });
      expect(trade.percentReturnMetric).toMatchObject({
        metric: "percent-return",
        definitionVersion: "percent-return-v1",
        nullReason: null,
        denominator: {
          amount: multiplySignedDecimals(entry?.quantity ?? "0", entry?.price ?? "0"),
          currency: "USD",
        },
        currency: "USD",
        isPartial: false,
      });
      expect(Number(trade.percentReturnMetric.value)).toBe(trade.percentReturn);
    }

    expect(workspace.equityCurve).toEqual(curve);
    expect(summarizeSetups(workspace.trades).map((summary) => summary.name)).not.toContain(
      "Unclassified",
    );
    for (const playbook of workspace.playbooks) {
      const summary = summarizeSetups(workspace.trades).find((item) => item.name === playbook.name);
      expect(summary?.tradeCount).toBe(playbook.tradeCount);
      expect(summary?.netR).toBe(playbook.netR);
      expect(summary?.winRatePct).toBeCloseTo(playbook.winRatePct, 1);
      expect(playbook.rules).toHaveLength(3);
    }
  });

  it("publishes complete review progress and reusable review options", async () => {
    const workspace = await demoDataSource.loadWorkspace();

    expect(workspace.reviewProgress).toEqual({
      pendingTrades: 0,
      draftTrades: 0,
      completedTrades: 8,
      streakSessions: 6,
      reviewedSessions: 6,
      tradingSessions: 6,
    });
    expect(workspace.reviewOptions.setups).toEqual(["Breakout", "Pullback", "Reversal"]);
    expect(workspace.reviewOptions.mistakes).toEqual(["Chased entry", "Early entry"]);
    expect(workspace.reviewOptions.emotions).toContain("Calm");
    expect(workspace.reviewOptions.tags).toContain("Plan followed");
    for (const tag of workspace.trades.flatMap((trade) => trade.tags)) {
      expect(workspace.reviewOptions.tags).toContain(tag);
    }
    expect(workspace.reviewOptions.playbooks).toHaveLength(3);
    expect(workspace.reviewOptions.playbooks.every((playbook) => (
      playbook.rules.length === 3
    ))).toBe(true);
  });

  it("keeps calendar days aligned with the demo executions", async () => {
    const workspace = await demoDataSource.loadWorkspace();
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

    for (const session of workspace.calendar) {
      const trades = workspace.trades.filter((trade) => trade.tradedOn === session.isoDate);
      expect(session.dayLabel).toBe(weekday.format(new Date(`${session.isoDate}T12:00:00Z`)));
      expect(["Sat", "Sun"]).not.toContain(session.dayLabel);
      expect(session.tradeCount).toBe(trades.length);
      expect(session.pnl).toBe(trades.reduce((sum, trade) => sum + (trade.resultPnl ?? 0), 0));
      const expectedSubjectIds = trades
        .map((trade) => trade.tradeSubjectId)
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
      expect(session.contributions.map((contribution) => contribution.tradeSubjectId)).toEqual(
        expectedSubjectIds,
      );
      expect(session.allocationCount).toBe(trades.length * 2);
      expect(sumSignedDecimals(session.contributions.map((contribution) => contribution.pnlExact))).toBe(session.pnlExact);
      for (const contribution of session.contributions) {
        const trade = trades.find((candidate) => candidate.tradeSubjectId === contribution.tradeSubjectId);
        expect(trade).toBeDefined();
        expect(contribution).toMatchObject({
          pnlExact: trade?.resultPnlExact,
          pnl: trade?.resultPnl,
          allocationCount: 2,
        });
      }
    }

    expect(workspace.trades.map((trade) => trade.tradedOn)).not.toContain("2026-07-03");
    expect(workspace.calendar.reduce((sum, session) => sum + session.pnl, 0)).toBe(310);
  });
});
