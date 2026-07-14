import {
  compareSignedDecimals,
  sumSignedDecimals,
} from "../core/signed-decimal";
import { escapeHtml } from "../core/html";
import type {
  CalendarSession,
  CalendarTradeContribution,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";

export interface SelectedCalendarDay {
  readonly session: CalendarSession;
  readonly trades: readonly {
    readonly trade: TradePreview;
    readonly contribution: CalendarTradeContribution;
  }[];
}

const FULL_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function signedCurrency(value: number, currency: string): string {
  if (!Number.isFinite(value)) throw new Error("Calendar P&L is not finite enough to display.");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(value);
}

function resultClass(value: number): "gain" | "loss" | "" {
  return value > 0 ? "gain" : value < 0 ? "loss" : "";
}

export function calendarFullDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`Calendar date ${isoDate} is not a canonical ISO date.`);
  }
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== isoDate
  ) {
    throw new Error(`Calendar date ${isoDate} is invalid.`);
  }
  return FULL_DATE.format(date);
}

function validateCalendarSession(session: CalendarSession): void {
  calendarFullDate(session.isoDate);
  if (!Number.isSafeInteger(session.tradeCount) || session.tradeCount <= 0) {
    throw new Error(`Calendar day ${session.isoDate} has an invalid trade count.`);
  }
  if (session.tradeCount !== session.contributions.length) {
    throw new Error(
      `Calendar day ${session.isoDate} trade count does not match its contributions.`,
    );
  }
  if (!Number.isSafeInteger(session.allocationCount) || session.allocationCount <= 0) {
    throw new Error(`Calendar day ${session.isoDate} has an invalid allocation count.`);
  }
  if (!Number.isFinite(session.pnl) || Number(session.pnlExact) !== session.pnl) {
    throw new Error(`Calendar day ${session.isoDate} has inconsistent display P&L.`);
  }

  const subjects = new Set<string>();
  let allocationCount = 0;
  for (const contribution of session.contributions) {
    if (contribution.tradeSubjectId.length === 0) {
      throw new Error(`Calendar day ${session.isoDate} has an empty trade subject.`);
    }
    if (subjects.has(contribution.tradeSubjectId)) {
      throw new Error(
        `Calendar day ${session.isoDate} repeats trade subject ${contribution.tradeSubjectId}.`,
      );
    }
    subjects.add(contribution.tradeSubjectId);
    if (
      !Number.isSafeInteger(contribution.allocationCount)
      || contribution.allocationCount <= 0
    ) {
      throw new Error(
        `Calendar trade ${contribution.tradeSubjectId} has an invalid allocation count.`,
      );
    }
    if (
      !Number.isFinite(contribution.pnl)
      || Number(contribution.pnlExact) !== contribution.pnl
    ) {
      throw new Error(
        `Calendar trade ${contribution.tradeSubjectId} has inconsistent display P&L.`,
      );
    }
    allocationCount += contribution.allocationCount;
  }
  if (allocationCount !== session.allocationCount) {
    throw new Error(
      `Calendar day ${session.isoDate} allocation count does not reconcile.`,
    );
  }
  if (
    compareSignedDecimals(
      sumSignedDecimals(session.contributions.map((contribution) => contribution.pnlExact)),
      session.pnlExact,
    ) !== 0
  ) {
    throw new Error(`Calendar day ${session.isoDate} P&L contributions do not reconcile.`);
  }
}

export function selectCalendarDay(
  snapshot: JournalWorkspaceSnapshot,
  isoDate: string,
): SelectedCalendarDay | null {
  calendarFullDate(isoDate);
  const matches = snapshot.calendar.filter((session) => session.isoDate === isoDate);
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    throw new Error(`Workspace contains more than one calendar day for ${isoDate}.`);
  }
  const session = matches[0];
  if (session === undefined) return null;
  validateCalendarSession(session);

  const tradeBySubject = new Map<string, TradePreview>();
  for (const trade of snapshot.trades) {
    if (tradeBySubject.has(trade.tradeSubjectId)) {
      throw new Error(`Workspace repeats trade subject ${trade.tradeSubjectId}.`);
    }
    tradeBySubject.set(trade.tradeSubjectId, trade);
  }
  const trades = session.contributions.map((contribution) => {
    const trade = tradeBySubject.get(contribution.tradeSubjectId);
    if (trade === undefined) {
      throw new Error(
        `Calendar day ${session.isoDate} references missing trade subject ${contribution.tradeSubjectId}.`,
      );
    }
    return Object.freeze({ trade, contribution });
  });
  return Object.freeze({
    session,
    trades: Object.freeze(trades),
  });
}

export function calendarDayAnnouncement(
  session: CalendarSession,
  currency: string,
): string {
  validateCalendarSession(session);
  return `Trades for ${calendarFullDate(session.isoDate)}. ${countNoun(session.tradeCount, "contributing trade")}, ${countNoun(session.allocationCount, "allocation")}, ${signedCurrency(session.pnl, currency)} allocation-day P&L.`;
}

export function calendarDaySection(snapshot: JournalWorkspaceSnapshot): string {
  const days = snapshot.calendar.map((session) => {
    validateCalendarSession(session);
    const money = signedCurrency(session.pnl, snapshot.currencyCode);
    const label = `Open ${calendarFullDate(session.isoDate)}: ${money} allocation-day P&L from ${countNoun(session.tradeCount, "contributing trade")}`;
    return `<button class="calendar-day ${resultClass(session.pnl)}" type="button" data-calendar-day="${escapeHtml(session.isoDate)}" aria-label="${escapeHtml(label)}">
      <span>${escapeHtml(session.dayLabel)}</span><strong>${escapeHtml(session.dateLabel)}</strong><small>${escapeHtml(money)} · ${countNoun(session.tradeCount, "trade")}</small>
    </button>`;
  }).join("");
  return `<section aria-labelledby="calendar-title" data-calendar-day-section>
    <div class="section-title"><h2 id="calendar-title">Trading days</h2><span>${snapshot.provenance === "demo" ? "Demo journal" : "Local journal"}</span></div>
    <div class="calendar-grid">${days || "<p>No trading days yet.</p>"}</div>
  </section>`;
}

export function calendarDayFilterCard(
  session: CalendarSession,
  currency: string,
  accountLabel: string,
): string {
  validateCalendarSession(session);
  const fullDate = calendarFullDate(session.isoDate);
  return `<article class="card calendar-day-filter" aria-labelledby="calendar-day-filter-title" data-calendar-day-filter="${escapeHtml(session.isoDate)}">
    <div class="section-title"><div><p class="card-label">CALENDAR DAY</p><h2 id="calendar-day-filter-title" tabindex="-1">${escapeHtml(fullDate)}</h2></div><strong class="${resultClass(session.pnl)}">${escapeHtml(signedCurrency(session.pnl, currency))}</strong></div>
    <p>${countNoun(session.tradeCount, "contributing trade")} · ${countNoun(session.allocationCount, "allocation")} · Workspace scope: ${escapeHtml(accountLabel)}. The day total and contribution labels use allocation-day P&amp;L; each card's main result remains the whole trade's realized-to-date result.</p>
    <button class="secondary-button" type="button" data-calendar-day-clear>Clear day filter</button>
  </article>`;
}

export function calendarTradeContributionCard(
  session: CalendarSession,
  contribution: CalendarTradeContribution,
  currency: string,
): string {
  validateCalendarSession(session);
  const current = session.contributions.find((candidate) => (
    candidate.tradeSubjectId === contribution.tradeSubjectId
  ));
  if (
    current === undefined
    || current.pnlExact !== contribution.pnlExact
    || current.pnl !== contribution.pnl
    || current.allocationCount !== contribution.allocationCount
  ) {
    throw new Error(
      `Calendar day ${session.isoDate} does not contain the supplied trade contribution.`,
    );
  }
  return `<div class="calendar-trade-contribution ${resultClass(contribution.pnl)}" data-calendar-trade-contribution="${escapeHtml(contribution.tradeSubjectId)}" data-calendar-day="${escapeHtml(session.isoDate)}" data-calendar-day-pnl-exact="${escapeHtml(contribution.pnlExact)}">
    <span>Allocation-day contribution</span><strong>${escapeHtml(signedCurrency(contribution.pnl, currency))}</strong><small>${countNoun(contribution.allocationCount, "allocation")} on ${escapeHtml(calendarFullDate(session.isoDate))}</small>
  </div>`;
}
