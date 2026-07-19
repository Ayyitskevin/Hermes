import { describe, expect, it } from "vitest";

import type {
  JournalAccountOption,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  ACCOUNT_REVIEW_COVERAGE_UNAVAILABLE_MESSAGE,
  accountReviewCoverageSection,
} from "./account-review-coverage-view";

function coherentSnapshot(
  trades: readonly TradePreview[],
  extraAccounts: readonly JournalAccountOption[] = [],
): JournalWorkspaceSnapshot {
  const accountOptions = [
    ...DEMO_WORKSPACE.accountOptions.map((account) => ({
      ...account,
      tradeCount: trades.filter((trade) => trade.accountId === account.id).length,
    })),
    ...extraAccounts,
  ].sort((left, right) => (
    left.label < right.label ? -1
      : left.label > right.label ? 1
        : left.id < right.id ? -1
          : left.id > right.id ? 1
            : 0
  ));
  const closed = trades.filter((trade) => trade.status === "closed");
  return {
    ...DEMO_WORKSPACE,
    accountOptions,
    trades,
    reviewProgress: {
      ...DEMO_WORKSPACE.reviewProgress,
      pendingTrades: closed.filter((trade) => trade.reviewStatus !== "completed").length,
      draftTrades: closed.filter((trade) => trade.reviewStatus === "draft").length,
      completedTrades: closed.filter((trade) => trade.reviewStatus === "completed").length,
    },
  };
}

function mixedSnapshot(): JournalWorkspaceSnapshot {
  return coherentSnapshot(DEMO_WORKSPACE.trades.map((trade) => {
    if (trade.symbol === "AAPL") {
      return {
        ...trade,
        reviewStatus: "pending" as const,
        reviewId: null,
        reviewVersion: null,
      };
    }
    if (trade.symbol === "MSFT") return { ...trade, reviewStatus: "draft" as const };
    if (trade.symbol === "NVDA") return { ...trade, status: "open" as const };
    return trade;
  }), [{ id: "retained-account", label: "Retained archive", tradeCount: 0 }]);
}

describe("account review coverage presentation", () => {
  it("renders the checksum-pinned demo accounts with exact completed actions", () => {
    const html = accountReviewCoverageSection(DEMO_WORKSPACE);

    expect(html).toContain("data-account-review-coverage");
    expect(html).toContain(
      '<h2 id="account-review-coverage-title" class="report-target" tabindex="-1">Account review coverage</h2>',
    );
    expect(html).toContain("account-review-coverage-report-v1");
    expect(html).toContain(
      "a4c1021010d1c854db7b10d05475ef4cbe696c4a09e20d8c9e8f83fc711d308a",
    );
    expect(html.match(/data-account-review-coverage-account=/g)).toHaveLength(2);
    expect(html.match(/data-account-review-coverage-route=/g)).toHaveLength(2);
    expect(html).toContain('data-account-review-coverage-account="demo-account-primary"');
    expect(html).toContain('data-account-review-coverage-position="1"');
    expect(html).toContain('data-account-review-coverage-trade-count="5"');
    expect(html).toContain('data-account-review-coverage-completed-count="5"');
    expect(html).toContain('data-account-review-coverage-review-state="completed"');
    expect(html).toContain('data-account-review-coverage-count="5"');
    expect(html).toContain(
      'aria-label="Open Demo Brokerage completed reviews in Trades, account 1 of 2"',
    );
    expect(html).toContain(
      'aria-label="Open Demo Swing completed reviews in Trades, account 2 of 2"',
    );
    expect(html).toContain("0 draft · 0 not started · 8 completed");
    expect(html).toContain("0 open positions");
    expect(html).toContain("Open completed");
    expect(html).not.toContain("Open drafts");
    expect(html).not.toContain("Open not-started");
  });

  it("renders mixed workflow counts and keeps zero cohorts non-actionable", () => {
    const html = accountReviewCoverageSection(mixedSnapshot());

    expect(html.match(/data-account-review-coverage-account=/g)).toHaveLength(3);
    expect(html.match(/data-account-review-coverage-route=/g)).toHaveLength(4);
    expect(html).toContain("Retained archive");
    expect(html).toContain("Account 3 of 3 · 0 current trades");
    expect(html).toContain('data-account-review-coverage-draft-count="1"');
    expect(html).toContain('data-account-review-coverage-pending-count="1"');
    expect(html).toContain('data-account-review-coverage-open-count="1"');
    expect(html).toContain(
      'aria-label="Open Demo Brokerage draft reviews in Trades, account 1 of 3"',
    );
    expect(html).toContain(
      'aria-label="Open Demo Brokerage not-started reviews in Trades, account 1 of 3"',
    );
    expect(html).toContain("1 open position is counted in this account total");
    expect(html).not.toMatch(
      /data-account-review-coverage-route="retained-account"/u,
    );
  });

  it("renders the dedicated no-retained-account state without actions", () => {
    const snapshot: JournalWorkspaceSnapshot = {
      ...coherentSnapshot([]),
      accountLabel: "No retained accounts",
      periodLabel: "No trades yet",
      accountOptions: [],
    };
    const html = accountReviewCoverageSection(snapshot);

    expect(html).toContain("No retained accounts");
    expect(html).toContain(
      "Account review coverage appears after the first local account is established.",
    );
    expect(html).toContain("<dt>Retained accounts</dt><dd>0 accounts</dd>");
    expect(html).toContain("<dt>Current trades</dt><dd>0 trades</dd>");
    expect(html).not.toContain("data-account-review-coverage-account=");
    expect(html).not.toContain("data-account-review-coverage-route=");
  });

  it("escapes hostile identity and distinguishes duplicate account labels by position", () => {
    const hostileLabel = '<Account & "one">';
    const base = mixedSnapshot();
    const hostile: JournalWorkspaceSnapshot = {
      ...base,
      accountOptions: base.accountOptions.map((account) => ({
        ...account,
        label: account.id === "retained-account" ? account.label : hostileLabel,
      })).sort((left, right) => (
        left.label < right.label ? -1
          : left.label > right.label ? 1
            : left.id < right.id ? -1
              : left.id > right.id ? 1
                : 0
      )),
      trades: base.trades.map((trade) => ({ ...trade, accountLabel: hostileLabel })),
    };
    const html = accountReviewCoverageSection(hostile);

    expect(html).toContain("&lt;Account &amp; &quot;one&quot;&gt;");
    expect(html).not.toContain(hostileLabel);
    expect(html).toContain("account 1 of 3");
    expect(html).toContain("account 2 of 3");
    expect(html).toContain('data-account-review-coverage-route="demo-account-primary"');
    expect(html).toContain('data-account-review-coverage-route="demo-account-swing"');
  });

  it("keeps the report count-only, neutral, and explicit about navigation", () => {
    const html = accountReviewCoverageSection(mixedSnapshot());

    expect(html).toContain("never open a review automatically or change journal data");
    expect(html).toContain("does not calculate rates");
    expect(html).toContain("rank accounts");
    expect(html).toContain("recommend activity");
    expect(html).not.toMatch(/P&amp;L|win rate|profit factor|average R|percent return/iu);
  });

  it("exposes one generic failure message for stale or tampered actions", () => {
    expect(ACCOUNT_REVIEW_COVERAGE_UNAVAILABLE_MESSAGE).toBe(
      "This account review link is no longer available. No Trade Browser filters changed.",
    );
  });
});
