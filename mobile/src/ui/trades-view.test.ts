import { describe, expect, it } from "vitest";

import {
  EMPTY_TRADE_BROWSER_STATE,
  buildTradeBrowser,
} from "../application/trade-browser";
import { EMPTY_WORKSPACE } from "../application/workspace-snapshot";
import { DEMO_WORKSPACE } from "../data/demo";
import { tradesView } from "./trades-view";

describe("trades view", () => {
  it("renders stable account and inclusive activity-date scope with exact evidence", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      activityFrom: "2026-07-07",
      activityThrough: "2026-07-09",
    });
    const html = tradesView(DEMO_WORKSPACE, browser);

    expect(html).toContain('option value="demo-account-swing" selected');
    expect(html).toContain('name="account" aria-describedby="trade-scope-error"');
    expect(html).toContain('type="search" maxlength="200" aria-describedby="trade-search-error trade-view-filter-boundary"');
    expect(html).toContain('value="2026-07-07"');
    expect(html).toContain('value="2026-07-09"');
    expect(html).toContain("Demo Swing · Jul 7, 2026–Jul 9, 2026");
    expect(html).toContain("-$150.00");
    expect(html).toContain("2 contributing trades · 4 allocations · 2 activity days");
    expect(html).toContain('data-trade-scope-pnl-exact="-100"');
    expect(html).toContain('data-trade-scope-pnl-exact="-50"');
    expect(html).toContain("<h2>SPY</h2>");
    expect(html).toContain("<h2>QQQ</h2>");
    expect(html).not.toContain("<h2>AAPL</h2>");
    expect(html.match(/<p class="trade-account">Demo Swing<\/p>/g)).toHaveLength(2);
    expect(html).toContain("Whole trade");
    expect(html).toContain("governed report totals");
    expect(html).toContain("remain whole-workspace");
    expect(html).toContain("Emotion Patterns, Tag Patterns, and Setup Breakdown");
  });

  it("renders exact card facets separately from allocation scope", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      assetClass: "etf",
      direction: "long",
      positionState: "closed",
      reviewState: "completed",
      setup: "Breakout",
      mistake: "Chased entry",
      emotion: "Impatient",
      tag: "Stopped on plan",
    });
    const html = tradesView(DEMO_WORKSPACE, browser);

    expect(html).toContain('id="trade-filter-asset-class"');
    expect(html).toMatch(/<details[^>]*data-trade-filter-disclosure[^>]* open>/);
    expect(html).toContain("· 8 active filters");
    expect(html).toContain('<option value="etf" selected>ETF</option>');
    expect(html).toContain('<option value="long" selected>Long</option>');
    expect(html).toContain('<option value="closed" selected>Closed</option>');
    expect(html).toContain('<option value="completed" selected>Completed</option>');
    expect(html).toContain("<label>Setup");
    expect(html).toContain('id="trade-filter-setup"');
    expect(html).toContain('<option value="Breakout" selected>Breakout</option>');
    expect(html).toContain('id="trade-filter-mistake"');
    expect(html).toContain('<option value="Chased entry" selected>Chased entry</option>');
    expect(html).toContain('id="trade-filter-emotion"');
    expect(html).toContain('<option value="Impatient" selected>Impatient</option>');
    expect(html).toContain('id="trade-filter-tag"');
    expect(html).toContain('<option value="Stopped on plan" selected>Stopped on plan</option>');
    expect(html).toContain("change visible cards and search results");
    expect(html).toContain("never change allocation scope");
    expect(html).toContain("Showing 1 of 8 trades");
    expect(html).toMatch(/data-trade-subject="demo-subject-spy" >/);
    expect(html).toMatch(/data-trade-subject="demo-subject-qqq" hidden>/);
    expect(html).toContain('<span class="status-chip">ETF</span>');
    expect(html).toContain("+$310.00");
    expect(html).toContain("8 contributing trades · 16 allocations · 6 activity days");
    expect(html).toContain("data-trade-view-clear");
    expect(html).not.toContain("data-trade-view-clear disabled");
  });

  it("escapes current review labels and preserves a selected stale value", () => {
    const escapedTrade = {
      ...DEMO_WORKSPACE.trades[0]!,
      setup: 'Opening <range> & "fast"',
      mistakes: ['Late <scale-out> & "hesitation"'],
      emotion: "Focused & calm",
      tags: ["A+ <setup>"],
    };
    const snapshot = {
      ...DEMO_WORKSPACE,
      trades: [escapedTrade, ...DEMO_WORKSPACE.trades.slice(1)],
    };
    const browser = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      setup: "Retired <setup>",
      mistake: "Retired <mistake>",
    });
    const html = tradesView(snapshot, browser);

    expect(html).toContain(
      'value="Opening &lt;range&gt; &amp; &quot;fast&quot;"',
    );
    expect(html).toContain(
      '<option value="Retired &lt;setup&gt;" selected>Retired &lt;setup&gt; (not currently assigned)</option>',
    );
    expect(html).toContain(
      'value="Late &lt;scale-out&gt; &amp; &quot;hesitation&quot;"',
    );
    expect(html).toContain("Late &lt;scale-out&gt; &amp; &quot;hesitation&quot;");
    expect(html).toContain(
      'value="Focused &amp; calm"',
    );
    expect(html).toContain('value="A+ &lt;setup&gt;"');
    expect(html).toContain(
      '<option value="Retired &lt;mistake&gt;" selected>Retired &lt;mistake&gt; (not currently assigned)</option>',
    );
    expect(html).toMatch(/<details[^>]*data-trade-filter-disclosure[^>]* open>/);
    expect(html).toContain("· 2 active filters");
    expect(html).toContain("Showing 0 of 8 trades");
  });

  it("collapses exact facets by default without counting search or allocation scope", () => {
    const defaultHtml = tradesView(DEMO_WORKSPACE, buildTradeBrowser(DEMO_WORKSPACE));
    const scopeOnlyHtml = tradesView(DEMO_WORKSPACE, buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
    }));
    const searchAndScopeHtml = tradesView(DEMO_WORKSPACE, buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      query: "qqq",
    }));

    expect(defaultHtml).not.toMatch(/<details[^>]*data-trade-filter-disclosure[^>]* open>/);
    expect(defaultHtml).toContain("· none active");
    expect(scopeOnlyHtml).not.toMatch(
      /<details[^>]*data-trade-filter-disclosure[^>]* open>/,
    );
    expect(searchAndScopeHtml).not.toMatch(
      /<details[^>]*data-trade-filter-disclosure[^>]* open>/,
    );
    expect(searchAndScopeHtml).toContain("· none active");
    expect(searchAndScopeHtml).toContain("Showing 1 of 3 trades");
    expect(searchAndScopeHtml).toContain("data-trade-view-clear >Clear search and filters");
    expect(searchAndScopeHtml.indexOf("</details>")).toBeLessThan(
      searchAndScopeHtml.indexOf("data-trade-view-clear"),
    );
  });

  it("disables empty review facet categories without disabling a stale selection", () => {
    const snapshot = {
      ...DEMO_WORKSPACE,
      trades: DEMO_WORKSPACE.trades.map((trade) => ({
        ...trade,
        setup: "Unclassified",
        hasClassifiedSetup: false,
        mistakes: [],
        emotion: null,
        tags: [],
      })),
    };
    const emptyHtml = tradesView(snapshot, buildTradeBrowser(snapshot));

    expect(emptyHtml).toMatch(/id="trade-filter-setup"[^>]* disabled/);
    expect(emptyHtml).not.toContain('<option value="Unclassified"');
    expect(emptyHtml).toMatch(/id="trade-filter-mistake"[^>]* disabled/);
    expect(emptyHtml).toMatch(/id="trade-filter-emotion"[^>]* disabled/);
    expect(emptyHtml).toMatch(/id="trade-filter-tag"[^>]* disabled/);

    const classifiedSnapshot = {
      ...snapshot,
      trades: snapshot.trades.map((trade, index) => (
        index === 0
          ? { ...trade, hasClassifiedSetup: true }
          : trade
      )),
    };
    const classifiedHtml = tradesView(
      classifiedSnapshot,
      buildTradeBrowser(classifiedSnapshot),
    );
    expect(classifiedHtml).not.toMatch(/id="trade-filter-setup"[^>]* disabled/);
    expect(classifiedHtml).toMatch(
      /<option value="Unclassified"[^>]*>Unclassified<\/option>/,
    );

    const staleHtml = tradesView(snapshot, buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      setup: "Retired setup",
      tag: "Retired tag",
    }));
    expect(staleHtml).not.toMatch(/id="trade-filter-setup"[^>]* disabled/);
    expect(staleHtml).not.toMatch(/id="trade-filter-tag"[^>]* disabled/);
    expect(staleHtml).toMatch(/<details[^>]*data-trade-filter-disclosure[^>]* open>/);
    expect(staleHtml).toContain(
      '<option value="Retired setup" selected>Retired setup (not currently assigned)</option>',
    );
    expect(staleHtml).toContain(
      '<option value="Retired tag" selected>Retired tag (not currently assigned)</option>',
    );
  });

  it("qualifies same-symbol card headings and review actions by asset class", () => {
    const stockTwin = { ...DEMO_WORKSPACE.trades[0]!, symbol: "QQQ" };
    const snapshot = {
      ...DEMO_WORKSPACE,
      trades: [stockTwin, ...DEMO_WORKSPACE.trades.slice(1)],
    };
    const html = tradesView(snapshot, buildTradeBrowser(snapshot));

    expect(html).toContain('<h2>QQQ<span class="sr-only"> · Stock ·');
    expect(html).toContain('<h2>QQQ<span class="sr-only"> · ETF ·');
    expect(html).toContain("for QQQ Stock,");
    expect(html).toContain("for QQQ ETF,");
  });

  it("renders selected-day allocation evidence without relabeling whole-trade P&L", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      activityFrom: "2026-07-07",
      activityThrough: "2026-07-09",
      selectedDay: "2026-07-07",
    });
    const html = tradesView(DEMO_WORKSPACE, browser);

    expect(html).toContain("Tuesday, July 7, 2026");
    expect(html).toContain("Trade browser scope: Demo Swing · Jul 7, 2026–Jul 9, 2026");
    expect(html).toContain('data-calendar-day-pnl-exact="-100"');
    expect(html).toContain('aria-labelledby="trade-scope-summary-title"');
    expect(html).toContain("1 contributing trade · 2 allocations · 1 activity day");
    expect(html).toContain("1 ALLOCATION-DAY CONTRIBUTOR");
    expect(html).not.toContain("1 ALLOCATION-DAY CONTRIBUTORS");
    expect(html).toContain("Search Jul 7 scoped trades");
    expect(html).toContain("Clear day filter");
  });

  it("keeps search presentation separate from the exact account scope summary", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      query: "qqq",
    });
    const html = tradesView(DEMO_WORKSPACE, browser);

    expect(html).toContain("Showing 1 of 3 trades");
    expect(html).toContain("-$220.00");
    expect(html).toMatch(/data-trade-subject="demo-subject-qqq" >/);
    expect(html).toMatch(/data-trade-subject="demo-subject-spy" hidden>/);
    expect(html).toMatch(/data-trade-subject="demo-subject-tsla" hidden>/);
    expect(html).toContain('value="qqq"');
    expect(html).toContain("data-trade-view-clear");
  });

  it("renders a reconciled empty scope with a useful recovery path", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2026-08-01",
      activityThrough: "2026-08-31",
    });
    const html = tradesView(DEMO_WORKSPACE, browser);

    expect(html).toContain("+$0.00");
    expect(html).toContain("0 contributing trades · 0 allocations · 0 activity days");
    expect(html).toContain("No activity matches this scope");
    expect(html).toContain("Clear or widen the account and activity-date scope.");
    expect(html).toContain("Clear all");
  });

  it("does not reference the absent facet description in an empty workspace", () => {
    const html = tradesView(EMPTY_WORKSPACE, buildTradeBrowser(EMPTY_WORKSPACE));

    expect(html).toContain('aria-describedby="trade-search-error"');
    expect(html).not.toContain('aria-describedby="trade-search-error trade-view-filter-boundary"');
    expect(html).not.toContain('id="trade-view-filter-boundary"');
  });
});
