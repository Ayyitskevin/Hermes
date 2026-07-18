import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildExactPlaybookTradeScope,
  buildPlaybookLibrary,
} from "./playbook-trade-scope";

describe("playbook trade scope", () => {
  it("projects stable playbook evidence without adding durable state", () => {
    const library = buildPlaybookLibrary(DEMO_WORKSPACE);

    expect(library.provenance).toBe("demo");
    expect(library.playbooks.map(({ name, tradeCount }) => [name, tradeCount]))
      .toEqual([
        ["Pullback", 3],
        ["Breakout", 3],
        ["Reversal", 2],
      ]);
    expect(Object.isFrozen(library)).toBe(true);
    expect(Object.isFrozen(library.playbooks)).toBe(true);
    expect(library.playbooks.every(Object.isFrozen)).toBe(true);
    expect(library.playbooks.every((playbook) => Object.isFrozen(playbook.rules)))
      .toBe(true);
  });

  it("keeps full-ledger validation constant across a large playbook vocabulary", () => {
    const extraPlaybooks = Array.from({ length: 200 }, (_, index) => ({
      name: `Unused process ${index}`,
      rules: [`Rule ${index}`],
    }));
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        playbooks: [...DEMO_WORKSPACE.reviewOptions.playbooks, ...extraPlaybooks],
      },
      playbooks: [
        ...DEMO_WORKSPACE.playbooks,
        ...extraPlaybooks.map(({ name, rules }) => ({
          name,
          rules,
          tradeCount: 0,
          netR: null,
          winRatePct: 0,
        })),
      ],
    };
    let tradeReads = 0;
    Object.defineProperty(snapshot, "trades", {
      get: () => {
        tradeReads += 1;
        return DEMO_WORKSPACE.trades;
      },
    });

    expect(buildPlaybookLibrary(snapshot).playbooks).toHaveLength(203);
    expect(tradeReads).toBe(2);
  });

  it("opens one exact completed-review playbook view from an empty browser state", () => {
    const target = buildExactPlaybookTradeScope(DEMO_WORKSPACE, "Breakout");

    expect(target.state).toEqual({
      accountId: null,
      activityFrom: null,
      activityThrough: null,
      selectedDay: null,
      calendarMonth: "2026-07",
      query: "",
      assetClass: "all",
      direction: "all",
      positionState: "all",
      reviewState: "completed",
      setup: null,
      mistake: null,
      emotion: null,
      tag: null,
      playbook: "Breakout",
    });
    expect(target.evidence).toHaveLength(8);
    expect(target.visibleEvidence).toHaveLength(3);
    expect(target.visibleEvidence.every(({ trade }) => (
      trade.reviewStatus === "completed" && trade.playbook === "Breakout"
    ))).toBe(true);
    expect(target.hasViewFilters).toBe(true);
  });

  it("supports an honest empty completed cohort for a retained draft-only playbook", () => {
    const retained: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      playbooks: [
        ...DEMO_WORKSPACE.playbooks,
        {
          name: "Draft process",
          tradeCount: 0,
          netR: null,
          winRatePct: 0,
          rules: ["Wait for confirmation"],
        },
      ],
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        playbooks: [
          ...DEMO_WORKSPACE.reviewOptions.playbooks,
          { name: "Draft process", rules: ["Wait for confirmation"] },
        ],
      },
    };

    const target = buildExactPlaybookTradeScope(retained, "Draft process");
    expect(target.state.playbook).toBe("Draft process");
    expect(target.visibleEvidence).toEqual([]);
    expect(buildPlaybookLibrary(retained).playbooks.at(-1)).toMatchObject({
      name: "Draft process",
      tradeCount: 0,
    });
  });

  it("fails closed on stale, duplicate, malformed, or count-disagreeing evidence", () => {
    expect(() => buildExactPlaybookTradeScope(
      DEMO_WORKSPACE,
      "Missing playbook",
    )).toThrow(/not available/iu);

    expect(() => buildPlaybookLibrary({
      ...DEMO_WORKSPACE,
      playbooks: [
        ...DEMO_WORKSPACE.playbooks,
        { ...DEMO_WORKSPACE.playbooks[1]!, name: "breakout" },
      ],
    })).toThrow(/more than once|duplicate/iu);

    expect(() => buildPlaybookLibrary({
      ...DEMO_WORKSPACE,
      playbooks: DEMO_WORKSPACE.playbooks.map((playbook) => (
        playbook.name === "Breakout"
          ? { ...playbook, name: " Breakout " }
          : playbook
      )),
    })).toThrow(/normalized|reconcile/iu);

    expect(() => buildPlaybookLibrary({
      ...DEMO_WORKSPACE,
      trades: DEMO_WORKSPACE.trades.map((trade) => (
        trade.playbook === "Breakout" ? { ...trade, playbook: "breakout" } : trade
      )),
    })).toThrow(/not available|reconcile/iu);

    expect(() => buildExactPlaybookTradeScope({
      ...DEMO_WORKSPACE,
      playbooks: DEMO_WORKSPACE.playbooks.map((playbook) => (
        playbook.name === "Breakout"
          ? { ...playbook, tradeCount: playbook.tradeCount + 1 }
          : playbook
      )),
    }, "Breakout")).toThrow(/count|reconcile/iu);
  });
});
