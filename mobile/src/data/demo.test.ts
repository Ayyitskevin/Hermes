import { afterEach, describe, expect, it, vi } from "vitest";

import { summarizeSetups } from "../core/performance";
import { demoDataSource } from "./demo";

describe("offline demo journal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("derives a coherent, persistently labeled fixture without a network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const workspace = await demoDataSource.loadWorkspace();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(workspace.provenance).toBe("demo");
    expect(workspace.provenanceLabel).toContain("FICTIONAL RESULTS");
    expect(workspace.trades).toHaveLength(8);
    expect(workspace.performance.netPnl).toBe(310);
    expect(workspace.performance.netR).toBeCloseTo(3.1);
    expect(workspace.performance.winRatePct).toBe(50);
    expect(workspace.performance.profitFactor).toBeCloseTo(1.97, 2);
    expect(workspace.performance.averageR).toBeCloseTo(0.39, 2);
    expect(workspace.importSummary.executions).toBe(workspace.trades.length);
  });

  it("reconciles executions, the cumulative curve, and published playbooks", async () => {
    const workspace = await demoDataSource.loadWorkspace();
    const ids = new Set(workspace.trades.map((trade) => trade.id));
    const curve = [0];

    expect(ids.size).toBe(workspace.trades.length);
    for (const trade of workspace.trades) {
      expect(trade.averageExit).not.toBeNull();
      const direction = trade.side === "long" ? 1 : -1;
      const calculatedPnl = direction * ((trade.averageExit ?? trade.averageEntry) - trade.averageEntry) * trade.quantity;
      expect(trade.resultPnl).toBeCloseTo(calculatedPnl, 8);
      curve.push((curve.at(-1) ?? 0) + (trade.resultPnl ?? 0));
    }

    expect(workspace.equityCurve).toEqual(curve);
    for (const playbook of workspace.playbooks) {
      const summary = summarizeSetups(workspace.trades).find((item) => item.name === playbook.name);
      expect(summary?.tradeCount).toBe(playbook.tradeCount);
      expect(summary?.netR).toBeCloseTo(playbook.netR);
      expect(summary?.winRatePct).toBeCloseTo(playbook.winRatePct, 1);
    }
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
    }

    expect(workspace.trades.map((trade) => trade.tradedOn)).not.toContain("2026-07-03");
    expect(workspace.calendar.reduce((sum, session) => sum + session.pnl, 0)).toBe(310);
  });
});
