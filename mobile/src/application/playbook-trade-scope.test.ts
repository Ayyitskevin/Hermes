import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildExactPlaybookDraftTradeScope,
  buildExactPlaybookTradeScope,
  buildPlaybookLibrary,
} from "./playbook-trade-scope";

function snapshotWithBreakoutDraft(): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    trades: DEMO_WORKSPACE.trades.map((trade) => (
      trade.tradeSubjectId === "demo-subject-aapl"
        ? { ...trade, reviewStatus: "draft" }
        : trade
    )),
    playbooks: DEMO_WORKSPACE.playbooks.map((playbook) => (
      playbook.name === "Breakout"
        ? {
          ...playbook,
          tradeCount: playbook.tradeCount - 1,
          netR: -0.1,
          winRatePct: 50,
        }
        : playbook
    )),
    reviewProgress: {
      ...DEMO_WORKSPACE.reviewProgress,
      pendingTrades: 0,
      draftTrades: 1,
      completedTrades: DEMO_WORKSPACE.reviewProgress.completedTrades - 1,
    },
  };
}

function snapshotWithDraftOnlyPlaybook(): JournalWorkspaceSnapshot {
  const snapshot = snapshotWithBreakoutDraft();
  return {
    ...snapshot,
    trades: snapshot.trades.map((trade) => (
      trade.tradeSubjectId === "demo-subject-aapl"
        ? { ...trade, playbook: "Draft process" }
        : trade
    )),
    playbooks: [
      ...snapshot.playbooks,
      {
        name: "Draft process",
        tradeCount: 0,
        netR: null,
        winRatePct: 0,
        rules: ["Wait for confirmation"],
      },
    ],
    reviewOptions: {
      ...snapshot.reviewOptions,
      playbooks: [
        ...snapshot.reviewOptions.playbooks,
        { name: "Draft process", rules: ["Wait for confirmation"] },
      ],
    },
  };
}

describe("playbook trade scope", () => {
  it("projects stable playbook evidence without adding durable state", () => {
    const library = buildPlaybookLibrary(DEMO_WORKSPACE);

    expect(library.provenance).toBe("demo");
    expect(library.playbooks.map(({ name, tradeCount, draftTradeCount }) => (
      [name, tradeCount, draftTradeCount]
    ))).toEqual([
      ["Pullback", 3, 0],
      ["Breakout", 3, 0],
      ["Reversal", 2, 0],
    ]);
    expect(Object.isFrozen(library)).toBe(true);
    expect(Object.isFrozen(library.playbooks)).toBe(true);
    expect(library.playbooks.every(Object.isFrozen)).toBe(true);
    expect(library.playbooks.every((playbook) => Object.isFrozen(playbook.rules)))
      .toBe(true);
    expect(library.playbooks.every(({ draftTradeCount }) => draftTradeCount === 0))
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

  it("separates draft assignments from completed metrics and exact subjects", () => {
    const snapshot = snapshotWithBreakoutDraft();
    const breakout = buildPlaybookLibrary(snapshot).playbooks.find(({ name }) => (
      name === "Breakout"
    ));

    expect(breakout).toMatchObject({
      name: "Breakout",
      tradeCount: 2,
      draftTradeCount: 1,
      netR: -0.1,
      winRatePct: 50,
      rules: DEMO_WORKSPACE.playbooks.find(({ name }) => name === "Breakout")?.rules,
    });
    expect(Object.isFrozen(breakout)).toBe(true);

    const completed = buildExactPlaybookTradeScope(snapshot, "Breakout", 2);
    expect(completed.visibleEvidence.map(({ trade }) => trade.tradeSubjectId).sort())
      .toEqual(["demo-subject-amd", "demo-subject-spy"]);
    expect(completed.state.reviewState).toBe("completed");

    const draft = buildExactPlaybookDraftTradeScope(snapshot, "Breakout", 1);
    expect(draft.state).toEqual({
      accountId: null,
      activityFrom: null,
      activityThrough: null,
      selectedDay: null,
      calendarMonth: "2026-07",
      query: "",
      assetClass: "all",
      direction: "all",
      positionState: "all",
      reviewState: "draft",
      setup: null,
      mistake: null,
      emotion: null,
      tag: null,
      playbook: "Breakout",
    });
    expect(draft.evidence).toHaveLength(8);
    expect(draft.visibleEvidence.map(({ trade }) => trade.tradeSubjectId))
      .toEqual(["demo-subject-aapl"]);
    expect(draft.invalidatedSelectedDay).toBeNull();
  });

  it("keeps completed zero honest while opening a true draft-only playbook exactly", () => {
    const retained = snapshotWithDraftOnlyPlaybook();

    const completed = buildExactPlaybookTradeScope(retained, "Draft process", 0);
    expect(completed.state.playbook).toBe("Draft process");
    expect(completed.visibleEvidence).toEqual([]);

    const draft = buildExactPlaybookDraftTradeScope(retained, "Draft process", 1);
    expect(draft.state.reviewState).toBe("draft");
    expect(draft.visibleEvidence.map(({ trade }) => trade.tradeSubjectId))
      .toEqual(["demo-subject-aapl"]);
    expect(buildPlaybookLibrary(retained).playbooks.at(-1)).toMatchObject({
      name: "Draft process",
      tradeCount: 0,
      draftTradeCount: 1,
    });
  });

  it("rejects a stale last-draft action instead of broadening to an empty cohort", () => {
    const rendered = snapshotWithBreakoutDraft();
    expect(buildPlaybookLibrary(rendered).playbooks[1]?.draftTradeCount).toBe(1);

    expect(() => buildExactPlaybookDraftTradeScope(
      DEMO_WORKSPACE,
      "Breakout",
      1,
    )).toThrow(/count|available/iu);
    expect(() => buildExactPlaybookDraftTradeScope(
      DEMO_WORKSPACE,
      "Breakout",
      0,
    )).toThrow(/count|available/iu);
    expect(() => Reflect.apply(
      buildExactPlaybookDraftTradeScope,
      undefined,
      [rendered, "Breakout"],
    )).toThrow(/count|available/iu);
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
