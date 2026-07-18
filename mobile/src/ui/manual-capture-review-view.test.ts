import { describe, expect, it, vi } from "vitest";

import {
  buildManualCaptureReviewContinuation,
} from "../application/manual-capture-review-continuation";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  bindManualCaptureReviewFailure,
  bindManualCaptureReviewView,
  manualCaptureReviewFailure,
  manualCaptureReviewSection,
} from "./manual-capture-review-view";

const EXECUTION_ID = "manual-execution:continuation-view";

function trade(symbol: string): TradePreview {
  const candidate = DEMO_WORKSPACE.trades.find((item) => item.symbol === symbol);
  if (candidate === undefined) throw new Error(`Missing demo trade ${symbol}.`);
  const execution = candidate.executions[0];
  if (execution === undefined) throw new Error(`Missing demo execution ${symbol}.`);
  return {
    ...candidate,
    executions: [{ ...execution, executionId: EXECUTION_ID }],
  };
}

function reversalTargets(): readonly [TradePreview, TradePreview] {
  const source = trade("AAPL");
  const entrySource = trade("META");
  const allocation = source.executions[0];
  if (allocation === undefined) throw new Error("AAPL has no reversal fixture allocation.");
  const common = {
    ...allocation,
    executionId: EXECUTION_ID,
    side: "sell" as const,
    occurredAt: "2026-07-09T15:30:00Z",
    price: "110",
    currency: "USD",
  };
  return [{
    ...source,
    side: "long",
    status: "closed",
    reviewStatus: "pending",
    executions: [{ ...common, allocationId: "reversal-exit", effect: "exit" }],
  }, {
    ...entrySource,
    accountId: source.accountId,
    accountLabel: source.accountLabel,
    symbol: source.symbol,
    assetClass: source.assetClass,
    side: "short",
    status: "open",
    reviewStatus: "draft",
    executions: [{ ...common, allocationId: "reversal-entry", effect: "entry" }],
  }];
}

function localSnapshot(trades: readonly TradePreview[]): JournalWorkspaceSnapshot {
  const counts = new Map<string, number>();
  for (const candidate of trades) {
    counts.set(candidate.accountId, (counts.get(candidate.accountId) ?? 0) + 1);
  }
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    accountOptions: DEMO_WORKSPACE.accountOptions.map((account) => ({
      ...account,
      tradeCount: counts.get(account.id) ?? 0,
    })),
    trades,
  };
}

describe("manual capture review continuation view", () => {
  it("renders every exact affected trade with state-qualified review actions", () => {
    const [aapl, reversal] = reversalTargets();
    const rest = DEMO_WORKSPACE.trades.filter((candidate) => (
      candidate.tradeSubjectId !== aapl.tradeSubjectId
      && candidate.tradeSubjectId !== reversal.tradeSubjectId
    ));
    const snapshot = localSnapshot([aapl, ...rest, reversal]);
    const continuation = buildManualCaptureReviewContinuation(snapshot, {
      outcome: "committed",
      executionId: EXECUTION_ID,
    });
    const html = manualCaptureReviewSection(snapshot, continuation);

    expect(html).toContain('data-manual-capture-review-continuation');
    expect(html).toContain('id="manual-capture-review-title"');
    expect(html).toContain("Review trades linked to this execution");
    expect(html).toContain("2 current trades");
    expect(html).toContain(continuation.accountLabel);
    expect(html).toContain(`${continuation.scope.evidence.length} current trades in this account`);
    expect(html).toContain('data-manual-capture-review-trade="demo-subject-aapl"');
    expect(html).toContain('data-manual-capture-review-trade="demo-subject-meta"');
    expect(html).toContain("Long · Closed · Pending");
    expect(html).toContain("Short · Open · Draft");
    expect(html).toContain(">Review trade</button>");
    expect(html).toContain(">Continue draft</button>");
    expect(html.match(/data-trade-review-origin="manual-capture-review"/gu)).toHaveLength(2);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Dashboard and governed Reports remain whole-workspace");
    expect(html).toContain("Dismiss saved execution guide");
  });

  it("renders reconciled duplicate and completed-review copy without exposing IDs", () => {
    const hostileLabel = '<Broker & "private">';
    const captured = {
      ...trade("AAPL"),
      accountLabel: hostileLabel,
      reviewStatus: "completed" as const,
    };
    const trades = DEMO_WORKSPACE.trades.map((candidate) => {
      const source = candidate.tradeSubjectId === captured.tradeSubjectId
        ? captured
        : candidate;
      return source.accountId === captured.accountId
        ? { ...source, accountLabel: hostileLabel }
        : source;
    });
    const snapshot = localSnapshot(trades).accountOptions.map((account) => ({
      ...account,
      label: account.id === captured.accountId ? hostileLabel : account.label,
    }));
    const local = {
      ...localSnapshot(trades),
      accountOptions: snapshot,
    };
    const continuation = buildManualCaptureReviewContinuation(local, {
      outcome: "duplicate",
      executionId: EXECUTION_ID,
    });
    const html = manualCaptureReviewSection(local, continuation);

    expect(html).toContain("This execution was already saved; no duplicate was created.");
    expect(html).toContain("Open completed review");
    expect(html).toContain("&lt;Broker &amp; &quot;private&quot;&gt;");
    expect(html).not.toContain(hostileLabel);
    expect(html).not.toContain(EXECUTION_ID);
    expect(html).not.toContain(`>${continuation.tradeSubjectIds[0]!}<`);
  });

  it("binds an exact dismiss action and rejects detached or tampered structure", () => {
    const aapl = trade("AAPL");
    const snapshot = localSnapshot([aapl, ...DEMO_WORKSPACE.trades.slice(1)]);
    const continuation = buildManualCaptureReviewContinuation(snapshot, {
      outcome: "committed",
      executionId: EXECUTION_ID,
    });
    const dismiss = vi.fn();
    const listeners: Array<() => void> = [];
    const rootListeners: Array<(event: Event) => void> = [];
    let duplicateSections = false;
    const heading = { id: "manual-capture-review-title" };
    const reviewButton = {
      dataset: { reviewTrade: aapl.tradeSubjectId },
    };
    const row = {
      dataset: {
        manualCaptureReviewTrade: aapl.tradeSubjectId,
        manualCaptureReviewPosition: "0",
      },
      querySelectorAll(selector: string): readonly unknown[] {
        return selector === "button[data-review-trade]" ? [reviewButton] : [];
      },
      contains(candidate: unknown): boolean {
        return candidate === reviewButton;
      },
    };
    const dismissButton = {
      dataset: { manualCaptureReviewDismiss: "" },
      addEventListener(type: string, listener: () => void): void {
        expect(type).toBe("click");
        listeners.push(listener);
      },
    };
    const section = {
      contains(candidate: unknown): boolean {
        return candidate === heading
          || candidate === row
          || candidate === reviewButton
          || candidate === dismissButton;
      },
    };
    const root = {
      querySelectorAll(selector: string): readonly unknown[] {
        if (selector === "[data-manual-capture-review-continuation]") {
          return duplicateSections ? [section, section] : [section];
        }
        if (selector === "[data-manual-capture-review-title]") return [heading];
        if (selector === "button[data-manual-capture-review-dismiss]") return [dismissButton];
        if (selector === "[data-manual-capture-review-trade]") return [row];
        return [];
      },
      contains(candidate: unknown): boolean {
        return section.contains(candidate) || candidate === section;
      },
      addEventListener(_type: string, listener: (event: Event) => void): void {
        rootListeners.push(listener);
      },
    } as unknown as HTMLElement;

    bindManualCaptureReviewView(root, snapshot, continuation, { dismiss });
    expect(listeners).toHaveLength(1);
    expect(rootListeners).toHaveLength(1);
    listeners[0]?.();
    expect(dismiss).toHaveBeenCalledOnce();

    duplicateSections = true;
    expect(() => bindManualCaptureReviewView(
      root,
      snapshot,
      continuation,
      { dismiss },
    )).toThrow(/structure is inconsistent/i);
  });

  it("renders and binds a retry-only known-commit failure", async () => {
    const html = manualCaptureReviewFailure();
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('aria-labelledby="manual-capture-review-failure-title"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Execution saved, but Hermes could not reconcile its exact current trade.");
    expect(html).toContain("No Trades scope changed");
    expect(html).toContain("Retry review continuation");

    const retry = vi.fn(async () => undefined);
    const listeners: Array<() => Promise<void>> = [];
    const attributes = new Map<string, string>();
    const status = { textContent: "" };
    const alert = {
      contains(candidate: unknown): boolean {
        return candidate === button || candidate === status;
      },
      setAttribute(name: string, value: string): void {
        attributes.set(name, value);
      },
      removeAttribute(name: string): void {
        attributes.delete(name);
      },
    };
    const button = {
      disabled: false,
      textContent: "Retry review continuation",
      addEventListener(type: string, listener: () => Promise<void>): void {
        expect(type).toBe("click");
        listeners.push(listener);
      },
    };
    const root = {
      querySelectorAll(selector: string): readonly unknown[] {
        if (selector === "[data-manual-capture-review-failure]") return [alert];
        if (selector === "button[data-manual-capture-review-retry]") return [button];
        if (selector === "[data-manual-capture-review-retry-status]") return [status];
        return [];
      },
      contains(candidate: unknown): boolean {
        return candidate === alert || candidate === button || candidate === status;
      },
    } as unknown as HTMLElement;

    bindManualCaptureReviewFailure(root, { retry });
    const completion = listeners[0]?.();
    expect(attributes.get("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Retrying…");
    expect(status.textContent).toContain("Retrying");
    await completion;
    expect(retry).toHaveBeenCalledOnce();
    expect(attributes.has("aria-busy")).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Retry review continuation");
    expect(status.textContent).toContain("still pending");
  });
});
