import type { JournalWorkspaceSnapshot } from "../core/types";
import {
  buildTradeBrowser,
  EMPTY_TRADE_BROWSER_STATE,
  type TradeBrowserResult,
} from "./trade-browser";

export interface AccountOverviewItem {
  /** Stable ledger identity used only by the exact in-app continuation. */
  readonly accountId: string;
  readonly label: string;
  readonly tradeCount: number;
}

export interface AccountOverview {
  readonly provenance: JournalWorkspaceSnapshot["provenance"];
  readonly accountCount: number;
  readonly accountsWithActivity: number;
  readonly accounts: readonly AccountOverviewItem[];
}

/**
 * Projects account identity and current trade-group counts only.
 *
 * The existing Trade Browser validator is intentionally the gate: account IDs,
 * labels, trade ownership, and counts must reconcile before this overview can
 * render. No account-level financial metric is introduced or retained here.
 */
export function buildAccountOverview(
  snapshot: JournalWorkspaceSnapshot,
): AccountOverview {
  buildTradeBrowser(snapshot, EMPTY_TRADE_BROWSER_STATE);
  const accounts = Object.freeze(
    snapshot.accountOptions.map((account) => Object.freeze({
      accountId: account.id,
      label: account.label,
      tradeCount: account.tradeCount,
    })),
  );
  return Object.freeze({
    provenance: snapshot.provenance,
    accountCount: accounts.length,
    accountsWithActivity: accounts.filter((account) => account.tradeCount > 0).length,
    accounts,
  });
}

/**
 * Creates an all-activity account target from a stable ledger ID.
 *
 * Starting from EMPTY_TRADE_BROWSER_STATE is the deep-link contract: dates,
 * selected day, search, and every card facet are cleared rather than inherited
 * as hidden state from a prior browser session.
 */
export function buildExactAccountTradeScope(
  snapshot: JournalWorkspaceSnapshot,
  accountId: string,
): TradeBrowserResult {
  const overview = buildAccountOverview(snapshot);
  const account = overview.accounts.find((candidate) => (
    candidate.accountId === accountId
  ));
  if (account === undefined) {
    throw new Error("The selected account is not available in this journal.");
  }
  const target = buildTradeBrowser(snapshot, {
    ...EMPTY_TRADE_BROWSER_STATE,
    accountId: account.accountId,
  });
  if (
    target.state.accountId !== account.accountId
    || target.evidence.length !== account.tradeCount
    || target.visibleEvidence.length !== account.tradeCount
  ) {
    throw new Error("The selected account trade scope does not reconcile.");
  }
  return target;
}
