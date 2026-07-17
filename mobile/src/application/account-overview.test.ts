import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildAccountOverview,
  buildExactAccountTradeScope,
} from "./account-overview";
import { EMPTY_WORKSPACE } from "./workspace-snapshot";

describe("account overview", () => {
  it("projects every retained account in stable snapshot order without financial fields", () => {
    const overview = buildAccountOverview(DEMO_WORKSPACE);

    expect(overview).toEqual({
      provenance: "demo",
      accountCount: 2,
      accountsWithActivity: 2,
      accounts: [
        {
          accountId: "demo-account-primary",
          label: "Demo Brokerage",
          tradeCount: 5,
        },
        {
          accountId: "demo-account-swing",
          label: "Demo Swing",
          tradeCount: 3,
        },
      ],
    });
    expect(JSON.stringify(overview)).not.toMatch(
      /pnl|profit|loss|return|balance|equity|win rate/iu,
    );
    expect(Object.isFrozen(overview)).toBe(true);
    expect(Object.isFrozen(overview.accounts)).toBe(true);
    expect(overview.accounts.every(Object.isFrozen)).toBe(true);
  });

  it("keeps a retained zero-trade account visible and leaves the empty workspace empty", () => {
    const retained: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: [
        ...DEMO_WORKSPACE.accountOptions,
        { id: "retained-account", label: "Retained archive", tradeCount: 0 },
      ],
    };

    expect(buildAccountOverview(retained)).toMatchObject({
      accountCount: 3,
      accountsWithActivity: 2,
      accounts: [
        { accountId: "demo-account-primary", tradeCount: 5 },
        { accountId: "demo-account-swing", tradeCount: 3 },
        { accountId: "retained-account", label: "Retained archive", tradeCount: 0 },
      ],
    });
    expect(buildAccountOverview(EMPTY_WORKSPACE)).toEqual({
      provenance: "empty",
      accountCount: 0,
      accountsWithActivity: 0,
      accounts: [],
    });
  });

  it("builds one exact all-activity Trade Browser target from the stable account ID", () => {
    const target = buildExactAccountTradeScope(
      DEMO_WORKSPACE,
      "demo-account-swing",
    );

    expect(target.state).toMatchObject({
      accountId: "demo-account-swing",
      activityFrom: null,
      activityThrough: null,
      selectedDay: null,
      query: "",
      assetClass: "all",
      direction: "all",
      positionState: "all",
      reviewState: "all",
      setup: null,
      mistake: null,
      emotion: null,
      tag: null,
    });
    expect(target.accountLabel).toBe("Demo Swing");
    expect(target.dateLabel).toBe("All activity dates");
    expect(target.evidence).toHaveLength(3);
    expect(target.visibleEvidence).toHaveLength(3);

    const duplicateLabels: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: DEMO_WORKSPACE.accountOptions.map((account) => ({
        ...account,
        label: "Same account",
      })),
      trades: DEMO_WORKSPACE.trades.map((trade) => ({
        ...trade,
        accountLabel: "Same account",
      })),
    };
    expect(buildExactAccountTradeScope(
      duplicateLabels,
      "demo-account-primary",
    ).accountLabel).toBe("Same account · account 1 of 2");
  });

  it("fails closed on stale, duplicate, or count-disagreeing account identity", () => {
    expect(() => buildExactAccountTradeScope(
      DEMO_WORKSPACE,
      "missing-account",
    )).toThrow("not available");

    expect(() => buildAccountOverview({
      ...DEMO_WORKSPACE,
      accountOptions: [
        ...DEMO_WORKSPACE.accountOptions,
        DEMO_WORKSPACE.accountOptions[0]!,
      ],
    })).toThrow(/appears more than once|duplicate/iu);

    expect(() => buildAccountOverview({
      ...DEMO_WORKSPACE,
      accountOptions: DEMO_WORKSPACE.accountOptions.map((account) => (
        account.id === "demo-account-swing"
          ? { ...account, tradeCount: account.tradeCount + 1 }
          : account
      )),
    })).toThrow(/trade count does not reconcile/iu);
  });
});
