import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import { EMPTY_WORKSPACE } from "../application/workspace-snapshot";
import { buildExactAccountTradeScope } from "../application/account-overview";
import { accountOverviewSection } from "./account-overview-view";
import { tradesView } from "./trades-view";

describe("account overview view", () => {
  it("renders a fictional read-only review path with exact, distinguishable account actions", () => {
    const html = accountOverviewSection(DEMO_WORKSPACE);

    expect(html).toContain('id="account-overview-title"');
    expect(html).toContain("Trace one review to its account evidence");
    expect(html).toContain("Fictional and read-only");
    expect(html).toContain("2 accounts");
    expect(html).toContain("2 with trade evidence");
    expect(html).toContain("Demo Brokerage");
    expect(html).toContain("5 current derived trades");
    expect(html).toContain("Demo Swing");
    expect(html).toContain("3 current derived trades");
    expect(html).toContain('data-account-overview-route="demo-account-primary"');
    expect(html).toContain(
      'aria-label="Open Demo Brokerage in Trades, account 1 of 2"',
    );
    expect(html).toContain(
      'aria-label="Open Demo Swing in Trades, account 2 of 2"',
    );
    expect(html).toContain(
      "Opening an account resets temporary dates, day, search, and card filters",
    );
    expect(html).not.toMatch(/\$|P&amp;L|win rate|profit|return|balance|equity/iu);
    expect(html).not.toContain("data-manual-execution");
    expect(html).not.toContain("data-import");
  });

  it("renders local guidance without persisting or claiming activation", () => {
    const local: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      provenance: "local",
      provenanceLabel: "ON-DEVICE JOURNAL",
    };
    const html = accountOverviewSection(local);

    expect(html).toContain("Current journal guidance");
    expect(html).toContain(
      "This path is derived from the journal in front of you and never marks activation complete.",
    );
    expect(html).not.toContain("Fictional and read-only");
  });

  it("keeps retained zero-trade accounts honest and omits the section for no accounts", () => {
    const retained: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: [
        ...DEMO_WORKSPACE.accountOptions,
        { id: "retained-account", label: "Retained archive", tradeCount: 0 },
      ],
    };
    const html = accountOverviewSection(retained);

    expect(html).toContain("Retained archive");
    expect(html).toContain("No current trade projection.");
    expect(html).toContain('data-account-overview-route="retained-account"');
    expect(accountOverviewSection(EMPTY_WORKSPACE)).toBe("");

    const zeroOnly: JournalWorkspaceSnapshot = {
      ...EMPTY_WORKSPACE,
      provenance: "local",
      provenanceLabel: "ON-DEVICE JOURNAL",
      accountOptions: [
        { id: "retained-account", label: "Retained archive", tradeCount: 0 },
      ],
    };
    const zeroHtml = accountOverviewSection(zeroOnly);
    expect(zeroHtml).toContain("Inspect retained accounts before a review exists");
    expect(zeroHtml).toContain("Add trade evidence before reviewing");
    expect(zeroHtml).toContain("cannot offer a review yet");
    expect(zeroHtml).not.toContain("Trace one review");
  });

  it("escapes hostile labels and keeps duplicate labels distinguishable by position", () => {
    const first = DEMO_WORKSPACE.accountOptions[0]!;
    const second = DEMO_WORKSPACE.accountOptions[1]!;
    const hostileLabel = '<Account & "one">';
    const duplicateLabel = "Same account";
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: [
        { ...first, label: hostileLabel },
        { ...second, label: duplicateLabel },
      ],
      trades: DEMO_WORKSPACE.trades.map((trade) => ({
        ...trade,
        accountLabel: trade.accountId === first.id ? hostileLabel : duplicateLabel,
      })),
    };
    const hostile = accountOverviewSection(snapshot);

    expect(hostile).toContain("&lt;Account &amp; &quot;one&quot;&gt;");
    expect(hostile).not.toContain(hostileLabel);

    const duplicate: JournalWorkspaceSnapshot = {
      ...snapshot,
      accountOptions: snapshot.accountOptions.map((account) => ({
        ...account,
        label: "Same account",
      })),
      trades: snapshot.trades.map((trade) => ({
        ...trade,
        accountLabel: "Same account",
      })),
    };
    const duplicateHtml = accountOverviewSection(duplicate);
    expect(duplicateHtml).toContain(
      'aria-label="Open Same account in Trades, account 1 of 2"',
    );
    expect(duplicateHtml).toContain(
      'aria-label="Open Same account in Trades, account 2 of 2"',
    );
    const duplicateBrowser = buildExactAccountTradeScope(
      duplicate,
      "demo-account-primary",
    );
    expect(tradesView(duplicate, duplicateBrowser)).toContain(
      "Same account · account 1 of 2 · 5 trades",
    );
    expect(duplicateBrowser.scopeLabel).toContain(
      "Same account · account 1 of 2 · All activity dates",
    );
  });
});
