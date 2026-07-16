import { describe, expect, it } from "vitest";

import type { CalendarSession, JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  EMPTY_TRADE_BROWSER_STATE,
  buildTradeBrowser,
} from "../application/trade-browser";
import {
  calendarDayAnnouncement,
  calendarDayFilterCard,
  calendarDaySection,
  calendarDayStepper,
  calendarFullDate,
  calendarTradeContributionCard,
  selectCalendarDay,
} from "./calendar-day-view";

function demoTrade(symbol: string): TradePreview {
  const trade = DEMO_WORKSPACE.trades.find((candidate) => candidate.symbol === symbol);
  if (trade === undefined) throw new Error(`Missing demo trade ${symbol}.`);
  return trade;
}

describe("calendar day view", () => {
  it("renders native day controls and maps reconciled contributors in stable order", () => {
    const html = calendarDaySection(DEMO_WORKSPACE);
    expect(html.match(/data-calendar-day=/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Open Wednesday, July 1, 2026: +$80.00 allocation-day P&amp;L from 2 contributing trades"');
    expect(html).toContain('id="calendar-month-title" tabindex="-1">July 2026');
    expect(html).toContain('class="calendar-month-nav" role="group" aria-label="Activity month"');
    expect(html).toContain("Account/date filters change this calendar and Trades only");
    expect(html.match(/data-calendar-month=""/g)).toHaveLength(2);
    expect(html).not.toContain('<article class="calendar-day');

    const selected = selectCalendarDay(DEMO_WORKSPACE, "2026-07-01");
    expect(selected).not.toBeNull();
    expect(selected?.session).toMatchObject({
      pnlExact: "80",
      pnl: 80,
      tradeCount: 2,
      allocationCount: 4,
    });
    expect(selected?.trades.map(({ trade }) => trade.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected?.trades)).toBe(true);
    expect(selectCalendarDay(DEMO_WORKSPACE, "2026-07-03")).toBeNull();
    expect(calendarDayAnnouncement(selected?.session as CalendarSession, "USD")).toBe(
      "Trades for Wednesday, July 1, 2026. 2 contributing trades, 4 allocations, +$80.00 allocation-day P&L.",
    );
  });

  it("labels the filtered scope and distinguishes day contribution from full-trade result", () => {
    const selected = selectCalendarDay(DEMO_WORKSPACE, "2026-07-01");
    if (selected === null) throw new Error("Missing Jul 1 demo day.");
    const filter = calendarDayFilterCard(selected.session, "USD", "Demo Brokerage");
    expect(filter).toContain('id="calendar-day-filter-title" data-calendar-day-filter-title="2026-07-01" tabindex="-1"');
    expect(filter).toContain("+$80.00");
    expect(filter).toContain("whole trade's realized-to-date result");
    expect(filter).toContain("data-calendar-day-clear");
    expect(filter).toContain("Trade browser scope: Demo Brokerage");

    const aapl = selected.trades.find(({ trade }) => trade.symbol === "AAPL");
    if (aapl === undefined) throw new Error("Missing AAPL contribution.");
    const contribution = calendarTradeContributionCard(
      selected.session,
      aapl.contribution,
      "USD",
    );
    expect(contribution).toContain('data-calendar-day-pnl-exact="180"');
    expect(contribution).toContain("+$180.00");
    expect(contribution).toContain("2 allocations on Wednesday, July 1, 2026");
  });

  it("renders exact scoped activity-day position, full-date targets, and native boundaries", () => {
    const first = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      activityFrom: "2026-07-07",
      activityThrough: "2026-07-09",
      selectedDay: "2026-07-07",
    });
    const firstHtml = calendarDayStepper(first);
    expect(firstHtml).toContain('role="group" aria-label="Scoped activity day navigation"');
    expect(firstHtml).toContain('data-calendar-day-stepper="2026-07-07"');
    expect(firstHtml).toContain("Activity day 1 of 2 in retained trade-browser scope.");
    expect(firstHtml).toContain('data-calendar-day-step="previous"');
    expect(firstHtml).toContain('aria-label="Previous activity day: none in retained scope" disabled');
    expect(firstHtml).toContain('data-calendar-day-step="next" data-calendar-day-current="2026-07-07" data-calendar-day-target="2026-07-09"');
    expect(firstHtml).toContain('aria-label="Next activity day: Thursday, July 9, 2026"');
    expect(firstHtml).toContain('id="calendar-day-step-error"');
    expect(firstHtml.match(/data-calendar-day-step=/g)).toHaveLength(2);

    const last = buildTradeBrowser(DEMO_WORKSPACE, {
      ...first.state,
      selectedDay: "2026-07-09",
    });
    const lastHtml = calendarDayStepper(last);
    expect(lastHtml).toContain("Activity day 2 of 2 in retained trade-browser scope.");
    expect(lastHtml).toContain('aria-label="Previous activity day: Tuesday, July 7, 2026"');
    expect(lastHtml).toContain('data-calendar-day-target="2026-07-07"');
    expect(lastHtml).toContain('aria-label="Next activity day: none in retained scope" disabled');
    expect(calendarDayStepper(buildTradeBrowser(DEMO_WORKSPACE))).toBe("");
  });

  it("escapes derived markup and fails loudly for missing or unreconciled evidence", () => {
    const base = demoTrade("AAPL");
    const subject = `subject-" onclick="<hostile>&\'`;
    const contribution = {
      tradeSubjectId: subject,
      pnlExact: "1.25",
      pnl: 1.25,
      allocationCount: 1,
    };
    const session: CalendarSession = {
      isoDate: "2026-07-10",
      dayLabel: `<Fri & "x">`,
      dateLabel: `<Jul 10 & "x">`,
      pnlExact: "1.25",
      pnl: 1.25,
      tradeCount: 1,
      allocationCount: 1,
      contributions: [contribution],
    };
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: [{
        id: base.accountId,
        label: base.accountLabel,
        tradeCount: 1,
      }],
      calendar: [session],
      trades: [{ ...base, id: subject, tradeSubjectId: subject }],
    };

    const section = calendarDaySection(snapshot);
    expect(section).toContain("&lt;Fri &amp; &quot;x&quot;&gt;");
    expect(section).not.toContain('onclick="<hostile>');
    const card = calendarTradeContributionCard(session, contribution, "USD");
    expect(card).toContain("subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;");
    expect(selectCalendarDay(snapshot, session.isoDate)?.trades[0]?.trade.tradeSubjectId).toBe(subject);
    expect(() => selectCalendarDay({ ...snapshot, trades: [] }, session.isoDate)).toThrow(
      /references missing trade subject/,
    );
    const unreconciled: CalendarSession = { ...session, pnlExact: "2", pnl: 2 };
    expect(() => calendarDayFilterCard(unreconciled, "USD", "Broker")).toThrow(/do not reconcile/);
    expect(() => calendarFullDate("2026-02-30")).toThrow(/invalid/);
  });
});
