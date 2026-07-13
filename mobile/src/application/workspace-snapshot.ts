import { canonicalizeDecimal } from "../core/decimal";
import type { CurrencyMoneyTotal, TradeAllocation, TradeProjection } from "../core/ledger";
import { normalizeTrades } from "../core/normalize-trades";
import { calculatePerformance } from "../core/performance";
import { deriveTradeMetricsV1 } from "../core/trade-metrics";
import {
  absoluteSignedDecimal,
  addSignedDecimals,
  compareSignedDecimals,
  divideSignedDecimals,
  negateSignedDecimal,
  sumSignedDecimals,
} from "../core/signed-decimal";
import type {
  CalendarSession,
  ImportHistoryPreview,
  ImportSummary,
  JournalWorkspaceSnapshot,
  PerformanceSnapshot,
  TradePreview,
} from "../core/types";
import type {
  JournalAccountRecord,
  JournalImportReceipt,
  JournalInstrumentRecord,
  JournalLedgerSnapshot,
  JournalTradeReviewRecord,
} from "./journal-store";

const EMPTY_IMPORT_SUMMARY: ImportSummary = Object.freeze({
  receiptId: null,
  accountLabel: "No account",
  sourceLabel: "No imports yet",
  importedAtLabel: "Import a broker CSV to begin",
  executions: 0,
  accounts: 0,
  rejectedRows: 0,
  skippedRows: 0,
  rolledBack: false,
});

export const EMPTY_WORKSPACE: JournalWorkspaceSnapshot = Object.freeze({
  provenance: "empty",
  provenanceLabel: "EMPTY JOURNAL",
  currencyCode: "USD",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  accountLabel: "No account",
  periodLabel: "No trades yet",
  performance: Object.freeze(calculatePerformance([])),
  importSummary: EMPTY_IMPORT_SUMMARY,
  importHistory: Object.freeze([]),
  equityCurve: Object.freeze([0]),
  calendar: Object.freeze([]),
  trades: Object.freeze([]),
  reviewProgress: Object.freeze({
    pendingTrades: 0,
    draftTrades: 0,
    completedTrades: 0,
    streakSessions: 0,
    reviewedSessions: 0,
    tradingSessions: 0,
  }),
  reviewOptions: Object.freeze({
    setups: Object.freeze([]),
    mistakes: Object.freeze([]),
    emotions: Object.freeze([]),
    tags: Object.freeze([]),
    playbooks: Object.freeze([]),
  }),
  dailyJournal: Object.freeze([]),
  playbooks: Object.freeze([]),
});

interface ZonedDay {
  readonly isoDate: string;
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly monthLabel: string;
  readonly dayLabel: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
}

interface MappedTrade {
  readonly preview: TradePreview;
  readonly resultPnlExact: string | null;
  readonly resultRExact: string | null;
}

interface LedgerPnlEvent {
  readonly id: string;
  readonly tradeId: string;
  readonly occurredAtUs: string;
  readonly pnlExact: string;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Cannot build journal workspace: ${message}`);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateTimeZone(timeZone: string): void {
  invariant(timeZone.length > 0 && timeZone.trim() === timeZone, "workspace time zone is missing");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw new Error(`Cannot build journal workspace: unsupported time zone ${timeZone}`);
  }
}

function parseTimestampUs(raw: string, label: string): bigint {
  invariant(/^(?:0|[1-9][0-9]*)$/.test(raw), `${label} must be a canonical microsecond timestamp`);
  const value = BigInt(raw);
  const date = new Date(Number(value / 1_000n));
  invariant(Number.isFinite(date.getTime()), `${label} is outside the displayable date range`);
  return value;
}

function part(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((candidate) => candidate.type === type)?.value;
  invariant(value !== undefined, `date formatter did not return ${type}`);
  return value;
}

function zonedDay(timestampUs: string, timeZone: string, label: string): ZonedDay {
  const value = parseTimestampUs(timestampUs, label);
  const date = new Date(Number(value / 1_000n));
  const numericParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = part(numericParts, "year");
  const month = part(numericParts, "month");
  const day = part(numericParts, "day");
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
  }).format(date);
  return {
    isoDate: `${year}-${month}-${day}`,
    year,
    month,
    day,
    monthLabel,
    dayLabel: new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(date),
    dateLabel: `${monthLabel} ${Number(day)}`,
    timeLabel: new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  };
}

function displayNumber(raw: string, label: string): number {
  const value = Number(raw);
  invariant(Number.isFinite(value), `${label} is not finite enough to display`);
  return value;
}

function finiteResult(value: number, label: string): number {
  invariant(Number.isFinite(value), `${label} is not finite enough to display`);
  return value;
}

function exactPerformance(
  trades: readonly MappedTrade[],
  workspaceNetPnlExact: string,
): PerformanceSnapshot {
  const realized = trades.filter((trade) => trade.resultPnlExact !== null);
  const exactValues = realized.map((trade) => trade.resultPnlExact ?? "0");
  const wins = exactValues.filter((value) => compareSignedDecimals(value, "0") > 0);
  const grossProfit = sumSignedDecimals(wins);
  const grossLoss = absoluteSignedDecimal(sumSignedDecimals(
    exactValues.filter((value) => compareSignedDecimals(value, "0") < 0),
  ));
  const reviewed = realized.filter((trade) => trade.preview.followedPlan !== null);
  const followed = reviewed.filter((trade) => trade.preview.followedPlan === true);
  const exactRValues = realized
    .map((trade) => trade.resultRExact)
    .filter((value): value is string => value !== null);
  const netRExact = exactRValues.length === 0 ? null : sumSignedDecimals(exactRValues);
  const averageRExact = netRExact === null
    ? null
    : divideSignedDecimals(netRExact, String(exactRValues.length));
  return {
    netPnl: displayNumber(workspaceNetPnlExact, "workspace net P&L"),
    netR: netRExact === null ? null : displayNumber(netRExact, "workspace net R"),
    winRatePct: realized.length === 0 ? 0 : (wins.length / realized.length) * 100,
    profitFactor: compareSignedDecimals(grossLoss, "0") === 0
      ? null
      : displayNumber(divideSignedDecimals(grossProfit, grossLoss), "workspace profit factor"),
    averageR: averageRExact === null ? null : displayNumber(averageRExact, "workspace average R"),
    rTradeCount: exactRValues.length,
    ruleAdherencePct: reviewed.length === 0 ? null : (followed.length / reviewed.length) * 100,
    ruleReviewCount: reviewed.length,
    tradeCount: realized.length,
  };
}

function exactAverage(
  notional: string,
  quantity: string,
  multiplier: string,
  label: string,
): number {
  const displayNotional = displayNumber(notional, `${label} notional`);
  const displayQuantity = displayNumber(quantity, `${label} quantity`);
  const displayMultiplier = displayNumber(multiplier, `${label} multiplier`);
  const denominator = finiteResult(displayQuantity * displayMultiplier, `${label} denominator`);
  invariant(denominator > 0, `${label} denominator must be positive`);
  return finiteResult(displayNotional / denominator, `${label} average`);
}

function lookupById<T extends { readonly id: string }>(
  records: readonly T[],
  label: string,
): ReadonlyMap<string, T> {
  const lookup = new Map<string, T>();
  for (const record of records) {
    invariant(record.id.length > 0 && record.id.trim() === record.id, `${label} has an invalid ID`);
    invariant(!lookup.has(record.id), `${label} ID ${record.id} appears more than once`);
    lookup.set(record.id, record);
  }
  return lookup;
}

function quoteTotal(trade: TradeProjection): CurrencyMoneyTotal {
  const total = trade.moneyTotals.find((candidate) => candidate.currency === trade.quoteCurrency);
  invariant(total !== undefined, `trade ${trade.id} has no ${trade.quoteCurrency} money total`);
  return total;
}

function isPreviewInstrument(
  instrument: JournalInstrumentRecord,
): instrument is JournalInstrumentRecord & { readonly assetClass: "stock" | "etf" } {
  return instrument.assetClass === "stock" || instrument.assetClass === "etf";
}

function compatibleInstrument(
  trade: TradeProjection,
  instruments: ReadonlyMap<string, JournalInstrumentRecord>,
): JournalInstrumentRecord & { readonly assetClass: "stock" | "etf" } {
  const instrument = instruments.get(trade.instrumentId);
  invariant(instrument !== undefined, `trade ${trade.id} references missing instrument ${trade.instrumentId}`);
  invariant(
    isPreviewInstrument(instrument),
    `asset class ${instrument.assetClass} cannot be represented by TradePreview`,
  );
  const multiplier = canonicalizeDecimal(instrument.multiplier, {
    allowZero: false,
    maxIntegerDigits: 38,
    maxFractionDigits: 18,
    maxTotalDigits: 38,
  });
  invariant(multiplier.ok, `instrument ${instrument.id} has an invalid multiplier`);
  invariant(multiplier.value === trade.multiplier, `instrument ${instrument.id} multiplier differs from its executions`);
  invariant(instrument.quoteCurrency === trade.quoteCurrency, `instrument ${instrument.id} quote currency differs from its executions`);
  return instrument;
}

function followedPlanForReview(review: JournalTradeReviewRecord | null): boolean | null {
  if (review === null) return null;
  if (review.rules.some((rule) => rule.outcome === "broken")) return false;
  return review.rules.some((rule) => rule.outcome === "followed") ? true : null;
}

function mapTrade(
  trade: TradeProjection,
  tradeSubjectId: string,
  review: JournalTradeReviewRecord | null,
  allocations: readonly TradeAllocation[],
  accounts: ReadonlyMap<string, JournalAccountRecord>,
  instruments: ReadonlyMap<string, JournalInstrumentRecord>,
  timeZone: string,
): MappedTrade {
  const account = accounts.get(trade.accountId);
  invariant(account !== undefined, `trade ${trade.id} references missing account ${trade.accountId}`);
  const instrument = compatibleInstrument(trade, instruments);
  const openedDay = zonedDay(trade.openedAtUs, timeZone, `trade ${trade.id} open time`);
  const exitedQuantity = displayNumber(trade.exitedQuantity, `trade ${trade.id} exited quantity`);
  const resultPnlExact = exitedQuantity === 0 ? null : quoteTotal(trade).netPnl;
  const resultPnl = resultPnlExact === null
    ? null
    : displayNumber(resultPnlExact, `trade ${trade.id} net P&L`);
  const isPartial = resultPnlExact !== null && trade.status === "OPEN";
  const metrics = deriveTradeMetricsV1({
    assetClass: instrument.assetClass,
    netRealizedPnl: resultPnlExact === null
      ? null
      : { amount: resultPnlExact, currency: trade.quoteCurrency },
    initialRisk: review?.initialRisk ?? null,
    fullEntryNotional: {
      amount: trade.entryNotional,
      currency: trade.quoteCurrency,
    },
    isPartial,
  });
  const averageExit = exitedQuantity === 0
    ? null
    : exactAverage(
      trade.exitNotional,
      trade.exitedQuantity,
      trade.multiplier,
      `trade ${trade.id} exit`,
    );
  const reviewRecordedAtUs = review === null
    ? null
    : parseTimestampUs(review.recordedAtUs, "trade review time");
  const reviewSessionDates = new Set<string>();
  const executionPreviews = allocations
    .filter((allocation) => allocation.tradeId === trade.id)
    .sort((left, right) => (
      BigInt(left.occurredAtUs) < BigInt(right.occurredAtUs) ? -1
        : BigInt(left.occurredAtUs) > BigInt(right.occurredAtUs) ? 1
          : left.fragmentIndex - right.fragmentIndex
            || stableCompare(left.id, right.id)
    ))
    .map((allocation) => {
      const occurred = zonedDay(
        allocation.occurredAtUs,
        timeZone,
        `allocation ${allocation.id} time`,
      );
      const allocationOccurredAtUs = parseTimestampUs(
        allocation.occurredAtUs,
        "review allocation time",
      );
      if (
        reviewRecordedAtUs !== null
        && allocationOccurredAtUs <= reviewRecordedAtUs
      ) {
        reviewSessionDates.add(occurred.isoDate);
      }
      const fee = sumSignedDecimals(allocation.fees.map((component) => (
        minorUnitsDecimal(component.costMinor, component.minorUnit)
      )));
      return {
        allocationId: allocation.id,
        executionId: allocation.executionId,
        effect: allocation.effect === "ENTRY" ? "entry" as const : "exit" as const,
        side: allocation.side === "BUY" ? "buy" as const : "sell" as const,
        occurredAt: `${occurred.dateLabel}, ${occurred.year} · ${occurred.timeLabel}`,
        quantity: allocation.quantity,
        price: allocation.price,
        fee,
        currency: trade.quoteCurrency,
      };
    });
  return {
    preview: {
      id: tradeSubjectId,
      tradeSubjectId,
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      side: trade.direction === "LONG" ? "long" : "short",
      status: trade.status === "CLOSED" ? "closed" : "open",
      quantity: displayNumber(trade.enteredQuantity, `trade ${trade.id} entered quantity`),
      averageEntry: exactAverage(
        trade.entryNotional,
        trade.enteredQuantity,
        trade.multiplier,
        `trade ${trade.id} entry`,
      ),
      averageExit,
      resultPnl,
      resultPnlExact,
      resultR: metrics.resultR.value === null
        ? null
        : displayNumber(metrics.resultR.value, `trade ${trade.id} result R`),
      percentReturn: metrics.percentReturn.value === null
        ? null
        : displayNumber(metrics.percentReturn.value, `trade ${trade.id} percent return`),
      resultRMetric: metrics.resultR,
      percentReturnMetric: metrics.percentReturn,
      setup: review?.setup ?? "Unclassified",
      mistakes: review?.mistakes ?? [],
      emotion: review?.emotion ?? null,
      tradedOn: openedDay.isoDate,
      reviewSessionDates: [...reviewSessionDates].sort(stableCompare),
      sessionLabel: `${openedDay.dateLabel} · ${openedDay.timeLabel}`,
      accountLabel: account.name,
      note: review?.note || "No journal note added.",
      tags: review?.tags ?? [],
      followedPlan: followedPlanForReview(review),
      playbook: review?.playbookName ?? null,
      rules: review?.rules ?? [],
      initialRisk: review?.initialRisk ?? null,
      plannedStop: review?.plannedStop ?? null,
      reviewStatus: review?.state ?? "pending",
      reviewId: review?.id ?? null,
      reviewVersion: review?.version ?? null,
      executions: executionPreviews,
    },
    resultPnlExact,
    resultRExact: metrics.resultR.value,
  };
}

function minorUnitsDecimal(costMinor: string, exponent: number): string {
  invariant(/^(?:0|-?[1-9][0-9]*)$/.test(costMinor), `fee ${costMinor} is not a canonical integer`);
  invariant(Number.isInteger(exponent) && exponent >= 0 && exponent <= 8, "fee exponent is invalid");
  const negative = costMinor.startsWith("-");
  const digits = (negative ? costMinor.slice(1) : costMinor).padStart(exponent + 1, "0");
  if (exponent === 0) return `${negative ? "-" : ""}${digits}`;
  const fraction = digits.slice(-exponent).replace(/0+$/, "");
  const unsigned = fraction.length === 0 ? digits.slice(0, -exponent) : `${digits.slice(0, -exponent)}.${fraction}`;
  return unsigned === "0" ? "0" : `${negative ? "-" : ""}${unsigned}`;
}

function buildPnlEvents(
  allocations: readonly TradeAllocation[],
  lotMatches: readonly { readonly id: string; readonly exitAllocationId: string; readonly grossPnl: string }[],
): readonly LedgerPnlEvent[] {
  const grossByExit = new Map<string, string>();
  for (const match of lotMatches) {
    grossByExit.set(
      match.exitAllocationId,
      addSignedDecimals(grossByExit.get(match.exitAllocationId) ?? "0", match.grossPnl),
    );
  }
  return allocations.map((allocation) => {
    const feeCost = sumSignedDecimals(allocation.fees.map((fee) => (
      minorUnitsDecimal(fee.costMinor, fee.minorUnit)
    )));
    return {
      id: allocation.id,
      tradeId: allocation.tradeId,
      occurredAtUs: allocation.occurredAtUs,
      pnlExact: addSignedDecimals(
        grossByExit.get(allocation.id) ?? "0",
        negateSignedDecimal(feeCost),
      ),
    };
  });
}

function buildCalendar(events: readonly LedgerPnlEvent[], timeZone: string): readonly CalendarSession[] {
  const sessions = new Map<string, { readonly day: ZonedDay; pnl: string; readonly tradeIds: Set<string> }>();
  for (const event of events) {
    const day = zonedDay(event.occurredAtUs, timeZone, `allocation ${event.id} time`);
    const existing = sessions.get(day.isoDate);
    const tradeIds = existing?.tradeIds ?? new Set<string>();
    tradeIds.add(event.tradeId);
    sessions.set(day.isoDate, {
      day,
      pnl: addSignedDecimals(existing?.pnl ?? "0", event.pnlExact),
      tradeIds,
    });
  }
  return [...sessions.values()]
    .map((session) => ({
      isoDate: session.day.isoDate,
      dayLabel: session.day.dayLabel,
      dateLabel: session.day.dateLabel,
      pnl: displayNumber(session.pnl, `calendar P&L for ${session.day.isoDate}`),
      tradeCount: session.tradeIds.size,
    }))
    .sort((left, right) => stableCompare(left.isoDate, right.isoDate));
}

function buildEquityCurve(events: readonly LedgerPnlEvent[]): readonly number[] {
  const ordered = [...events]
    .sort((left, right) => (
      parseTimestampUs(left.occurredAtUs, `allocation ${left.id} time`)
        < parseTimestampUs(right.occurredAtUs, `allocation ${right.id} time`) ? -1
        : parseTimestampUs(left.occurredAtUs, `allocation ${left.id} time`)
          > parseTimestampUs(right.occurredAtUs, `allocation ${right.id} time`) ? 1
          : stableCompare(left.id, right.id)
    ));
  const exactCurve: string[] = ["0"];
  for (const event of ordered) {
    exactCurve.push(addSignedDecimals(exactCurve.at(-1) ?? "0", event.pnlExact));
  }
  return exactCurve.map((value) => displayNumber(value, "cumulative equity curve"));
}

function periodLabel(days: readonly ZonedDay[]): string {
  if (days.length === 0) return "No trades yet";
  const localDates = new Map<string, ZonedDay>();
  for (const day of days) localDates.set(day.isoDate, day);
  const ordered = [...localDates.values()].sort((left, right) => stableCompare(left.isoDate, right.isoDate));
  const first = ordered[0];
  const last = ordered.at(-1);
  invariant(first !== undefined && last !== undefined, "trade period has no dates");
  if (first.isoDate === last.isoDate) return `${first.dateLabel}, ${first.year}`;
  if (first.year === last.year && first.month === last.month) {
    return `${first.monthLabel} ${Number(first.day)}–${Number(last.day)}, ${first.year}`;
  }
  if (first.year === last.year) {
    return `${first.dateLabel}–${last.dateLabel}, ${first.year}`;
  }
  return `${first.dateLabel}, ${first.year}–${last.dateLabel}, ${last.year}`;
}

function buildReviewProgress(
  trades: readonly TradePreview[],
  executionDays: readonly ZonedDay[],
): JournalWorkspaceSnapshot["reviewProgress"] {
  const closed = trades.filter((trade) => trade.status === "closed");
  const tradingDates = [...new Set(executionDays.map((day) => day.isoDate))]
    .sort(stableCompare);
  const reviewedDates = new Set(
    trades
      .filter((trade) => trade.reviewStatus !== "pending")
      .flatMap((trade) => trade.reviewSessionDates),
  );
  let streakSessions = 0;
  for (const date of [...tradingDates].reverse()) {
    if (!reviewedDates.has(date)) break;
    streakSessions += 1;
  }
  return {
    pendingTrades: closed.filter((trade) => trade.reviewStatus !== "completed").length,
    draftTrades: closed.filter((trade) => trade.reviewStatus === "draft").length,
    completedTrades: closed.filter((trade) => trade.reviewStatus === "completed").length,
    streakSessions,
    reviewedSessions: tradingDates.filter((date) => reviewedDates.has(date)).length,
    tradingSessions: tradingDates.length,
  };
}

function buildReviewOptions(
  ledger: JournalLedgerSnapshot,
): JournalWorkspaceSnapshot["reviewOptions"] {
  const terms = (category: "setup" | "mistake" | "emotion" | "tag") => (
    ledger.reviewTerms
      .filter((term) => term.category === category)
      .map((term) => term.name)
      .sort((left, right) => left.localeCompare(right, "en-US"))
  );
  return {
    setups: terms("setup"),
    mistakes: terms("mistake"),
    emotions: terms("emotion"),
    tags: terms("tag"),
    playbooks: ledger.playbooks.map((playbook) => ({
      name: playbook.name,
      rules: playbook.rules.map((rule) => rule.text),
    })),
  };
}

function buildPlaybookPreviews(
  trades: readonly TradePreview[],
  ledger: JournalLedgerSnapshot,
): JournalWorkspaceSnapshot["playbooks"] {
  return ledger.playbooks.map((playbook) => {
    const assigned = trades.filter((trade) => (
      trade.playbook === playbook.name && trade.reviewStatus === "completed"
    ));
    const realized = assigned.filter((trade) => trade.resultPnlExact !== null);
    const exactR = assigned
      .map((trade) => trade.resultRMetric.value)
      .filter((value): value is string => value !== null);
    const winners = realized.filter((trade) => (
      compareSignedDecimals(trade.resultPnlExact ?? "0", "0") > 0
    )).length;
    const netRExact = exactR.length === 0 ? null : sumSignedDecimals(exactR);
    return {
      name: playbook.name,
      tradeCount: assigned.length,
      netR: netRExact === null ? null : displayNumber(netRExact, `playbook ${playbook.name} net R`),
      winRatePct: realized.length === 0 ? 0 : winners / realized.length * 100,
      rules: playbook.rules.map((rule) => rule.text),
    };
  });
}

function validateReceiptCount(value: number, label: string): number {
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer`);
  return value;
}

function mapImport(
  receipt: JournalImportReceipt,
  accountCount: number,
  timeZone: string,
): ImportHistoryPreview {
  invariant(receipt.id.length > 0 && receipt.id.trim() === receipt.id, "import receipt has an invalid ID");
  invariant(receipt.accountId.length > 0 && receipt.accountId.trim() === receipt.accountId, `import ${receipt.id} has no account ID`);
  invariant(receipt.accountName.length > 0 && receipt.accountName.trim() === receipt.accountName, `import ${receipt.id} has no account name`);
  invariant(receipt.sourceName.length > 0 && receipt.sourceName.trim() === receipt.sourceName, `import ${receipt.id} has no source name`);
  const imported = zonedDay(receipt.importedAtUs, timeZone, `import ${receipt.id} time`);
  validateReceiptCount(receipt.sourceRows, `import ${receipt.id} source rows`);
  validateReceiptCount(receipt.acceptedRows, `import ${receipt.id} accepted rows`);
  validateReceiptCount(receipt.rejectedRows, `import ${receipt.id} rejected rows`);
  validateReceiptCount(receipt.skippedRows, `import ${receipt.id} skipped rows`);
  validateReceiptCount(receipt.warningCount, `import ${receipt.id} warning count`);
  validateReceiptCount(receipt.executionCount, `import ${receipt.id} execution count`);
  if (receipt.rolledBackAtUs !== null) {
    const rolledBack = parseTimestampUs(receipt.rolledBackAtUs, `import ${receipt.id} rollback time`);
    const importedAt = parseTimestampUs(receipt.importedAtUs, `import ${receipt.id} time`);
    invariant(rolledBack >= importedAt, `import ${receipt.id} rollback predates its import`);
  }
  return {
    receiptId: receipt.id,
    accountLabel: receipt.accountName,
    sourceLabel: receipt.sourceName,
    importedAtLabel: `Imported ${imported.dateLabel}, ${imported.year} · ${imported.timeLabel}`,
    executions: receipt.acceptedRows,
    accounts: accountCount,
    rejectedRows: receipt.rejectedRows,
    skippedRows: receipt.skippedRows,
    rolledBack: receipt.rolledBackAtUs !== null,
    warningCount: receipt.warningCount,
  };
}

function withoutWarnings(history: ImportHistoryPreview): ImportSummary {
  return {
    receiptId: history.receiptId,
    accountLabel: history.accountLabel,
    sourceLabel: history.sourceLabel,
    importedAtLabel: history.importedAtLabel,
    executions: history.executions,
    accounts: history.accounts,
    rejectedRows: history.rejectedRows,
    skippedRows: history.skippedRows,
    rolledBack: history.rolledBack,
  };
}

function validateSingleCurrency(
  ledger: JournalLedgerSnapshot,
  defaultCurrency: string,
  accounts: ReadonlyMap<string, JournalAccountRecord>,
  instruments: ReadonlyMap<string, JournalInstrumentRecord>,
): ReadonlySet<string> {
  const activeAccountIds = new Set<string>();
  for (const execution of ledger.executions) {
    const account = accounts.get(execution.accountId);
    invariant(account !== undefined, `execution ${execution.id} references missing account ${execution.accountId}`);
    const instrument = instruments.get(execution.instrumentId);
    invariant(instrument !== undefined, `execution ${execution.id} references missing instrument ${execution.instrumentId}`);
    activeAccountIds.add(account.id);
    invariant(instrument.quoteCurrency === defaultCurrency, `instrument ${instrument.id} requires FX from ${instrument.quoteCurrency}`);
    invariant(execution.quoteCurrency === defaultCurrency, `execution ${execution.id} requires FX from ${execution.quoteCurrency}`);
    for (const fee of execution.fees ?? []) {
      invariant(fee.currency === defaultCurrency, `execution ${execution.id} fee requires FX from ${fee.currency}`);
    }
  }
  return activeAccountIds;
}

export function workspaceSnapshotFromLedger(ledger: JournalLedgerSnapshot): JournalWorkspaceSnapshot {
  if (ledger.workspace === null) {
    invariant(
      ledger.accounts.length === 0
      && ledger.instruments.length === 0
      && ledger.executions.length === 0
      && ledger.tradeSubjects.length === 0
      && ledger.tradeReviews.length === 0
      && ledger.reviewTerms.length === 0
      && ledger.playbooks.length === 0
      && ledger.imports.length === 0,
      "ledger facts exist without a workspace",
    );
    return EMPTY_WORKSPACE;
  }

  const workspace = ledger.workspace;
  invariant(/^[A-Z][A-Z0-9]{2,11}$/.test(workspace.defaultCurrency), "workspace default currency is invalid");
  validateTimeZone(workspace.timeZone);
  const accounts = lookupById(ledger.accounts, "account");
  const instruments = lookupById(ledger.instruments, "instrument");
  const activeAccountIds = validateSingleCurrency(
    ledger,
    workspace.defaultCurrency,
    accounts,
    instruments,
  );
  const projection = normalizeTrades(ledger.executions);
  for (const trade of projection.trades) {
    invariant(trade.quoteCurrency === workspace.defaultCurrency, `trade ${trade.id} requires FX from ${trade.quoteCurrency}`);
    for (const money of trade.moneyTotals) {
      invariant(money.currency === workspace.defaultCurrency, `trade ${trade.id} money requires FX from ${money.currency}`);
    }
  }
  for (const money of projection.moneyTotals) {
    invariant(money.currency === workspace.defaultCurrency, `workspace money requires FX from ${money.currency}`);
  }

  const subjectByProjectionId = new Map<string, string>();
  for (const subject of ledger.tradeSubjects) {
    invariant(
      !subjectByProjectionId.has(subject.projectionTradeId),
      `projection trade ${subject.projectionTradeId} has duplicate subject mappings`,
    );
    subjectByProjectionId.set(subject.projectionTradeId, subject.tradeSubjectId);
  }
  invariant(
    subjectByProjectionId.size === projection.trades.length,
    "durable trade-subject mappings do not match the current projection",
  );
  const reviewBySubjectId = new Map<string, JournalTradeReviewRecord>();
  for (const review of ledger.tradeReviews) {
    invariant(
      !reviewBySubjectId.has(review.tradeSubjectId),
      `trade subject ${review.tradeSubjectId} has more than one current review`,
    );
    reviewBySubjectId.set(review.tradeSubjectId, review);
  }
  const mappedTrades = projection.trades.map((trade) => {
    const tradeSubjectId = subjectByProjectionId.get(trade.id);
    invariant(tradeSubjectId !== undefined, `trade ${trade.id} has no durable subject`);
    return mapTrade(
      trade,
      tradeSubjectId,
      reviewBySubjectId.get(tradeSubjectId) ?? null,
      projection.allocations,
      accounts,
      instruments,
      workspace.timeZone,
    );
  });
  const pnlEvents = buildPnlEvents(projection.allocations, projection.lotMatches);
  const workspaceMoney = projection.moneyTotals.find((money) => (
    money.currency === workspace.defaultCurrency
  ));
  const workspaceNetPnlExact = workspaceMoney?.netPnl ?? "0";
  invariant(
    compareSignedDecimals(
      sumSignedDecimals(pnlEvents.map((event) => event.pnlExact)),
      workspaceNetPnlExact,
    ) === 0,
    "allocation P&L events do not reconcile with the workspace money total",
  );
  const executionDays = projection.executions.map((execution) => zonedDay(
    execution.occurredAtUs,
    workspace.timeZone,
    `execution ${execution.id} time`,
  ));
  const previews = mappedTrades.map((trade) => trade.preview);
  const receiptIds = new Set<string>();
  const history = [...ledger.imports]
    .sort((left, right) => {
      const leftTime = parseTimestampUs(left.importedAtUs, `import ${left.id} time`);
      const rightTime = parseTimestampUs(right.importedAtUs, `import ${right.id} time`);
      return leftTime > rightTime ? -1 : leftTime < rightTime ? 1 : stableCompare(left.id, right.id);
    })
    .map((receipt) => {
      invariant(!receiptIds.has(receipt.id), `import receipt ID ${receipt.id} appears more than once`);
      receiptIds.add(receipt.id);
      const receiptAccount = accounts.get(receipt.accountId);
      invariant(receiptAccount !== undefined, `import ${receipt.id} references missing account ${receipt.accountId}`);
      invariant(receiptAccount.name === receipt.accountName, `import ${receipt.id} account name is inconsistent`);
      return mapImport(receipt, activeAccountIds.size, workspace.timeZone);
    });
  const activeAccounts = [...activeAccountIds]
    .map((id) => accounts.get(id))
    .filter((account): account is JournalAccountRecord => account !== undefined);
  const accountLabel = activeAccounts.length === 1
    ? activeAccounts[0]?.name ?? workspace.name
    : activeAccounts.length > 1
      ? `${activeAccounts.length} accounts`
      : ledger.accounts[0]?.name ?? workspace.name;

  return {
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    currencyCode: workspace.defaultCurrency,
    timeZone: workspace.timeZone,
    accountLabel,
    periodLabel: periodLabel(executionDays),
    performance: exactPerformance(mappedTrades, workspaceNetPnlExact),
    importSummary: history[0] === undefined ? EMPTY_IMPORT_SUMMARY : withoutWarnings(history[0]),
    importHistory: history,
    equityCurve: buildEquityCurve(pnlEvents),
    calendar: buildCalendar(pnlEvents, workspace.timeZone),
    trades: previews,
    reviewProgress: buildReviewProgress(previews, executionDays),
    reviewOptions: buildReviewOptions(ledger),
    dailyJournal: [],
    playbooks: buildPlaybookPreviews(previews, ledger),
  };
}
