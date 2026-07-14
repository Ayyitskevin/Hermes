import { describe, expect, it } from "vitest";

import {
  EMPTY_TRADE_BROWSER_STATE,
  buildTradeBrowser,
} from "../application/trade-browser";
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
    expect(html).toContain('type="search" maxlength="200" aria-describedby="trade-search-error"');
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
});
