import type { JournalWorkspaceSnapshot, PlaybookPreview } from "../core/types";
import {
  buildTradeBrowser,
  EMPTY_TRADE_BROWSER_STATE,
  normalizedTradeReviewLabel,
  type TradeBrowserResult,
} from "./trade-browser";

export interface PlaybookLibrary {
  readonly provenance: JournalWorkspaceSnapshot["provenance"];
  readonly playbooks: readonly PlaybookPreview[];
}

function playbookIdentity(name: string): string {
  return name.toLocaleLowerCase("en-US");
}

function canonicalPlaybookName(raw: unknown, label: string): string {
  const normalized = normalizedTradeReviewLabel(raw, label);
  if (normalized !== raw) {
    throw new Error(`${label} does not reconcile with its normalized identity.`);
  }
  return normalized;
}

function freezeRules(raw: unknown, label: string): readonly string[] {
  if (!Array.isArray(raw) || raw.some((rule) => typeof rule !== "string")) {
    throw new Error(`${label} rules are unavailable.`);
  }
  return Object.freeze([...raw]);
}

function rulesReconcile(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((rule, index) => rule === right[index]);
}

/**
 * Projects immutable playbook cards after reconciling their retained vocabulary,
 * current assignments, and completed-review counts. No durable state is created.
 */
export function buildPlaybookLibrary(
  snapshot: JournalWorkspaceSnapshot,
): PlaybookLibrary {
  buildTradeBrowser(snapshot, EMPTY_TRADE_BROWSER_STATE);

  const optionByIdentity = new Map<string, {
    readonly name: string;
    readonly rules: readonly string[];
  }>();
  for (const option of snapshot.reviewOptions.playbooks) {
    const name = canonicalPlaybookName(option.name, "Playbook option name");
    const identity = playbookIdentity(name);
    if (optionByIdentity.has(identity)) {
      throw new Error(`Playbook option ${name} appears more than once.`);
    }
    optionByIdentity.set(identity, Object.freeze({
      name,
      rules: freezeRules(option.rules, `Playbook option ${name}`),
    }));
  }

  const previewByIdentity = new Map<string, PlaybookPreview>();
  const playbooks = snapshot.playbooks.map((playbook) => {
    const name = canonicalPlaybookName(playbook.name, "Playbook name");
    const identity = playbookIdentity(name);
    if (previewByIdentity.has(identity)) {
      throw new Error(`Playbook ${name} appears more than once.`);
    }
    if (!Number.isSafeInteger(playbook.tradeCount) || playbook.tradeCount < 0) {
      throw new Error(`Playbook ${name} trade count is invalid.`);
    }
    if (playbook.netR !== null && !Number.isFinite(playbook.netR)) {
      throw new Error(`Playbook ${name} net R is invalid.`);
    }
    if (
      !Number.isFinite(playbook.winRatePct)
      || playbook.winRatePct < 0
      || playbook.winRatePct > 100
    ) {
      throw new Error(`Playbook ${name} win rate is invalid.`);
    }
    const rules = freezeRules(playbook.rules, `Playbook ${name}`);
    const option = optionByIdentity.get(identity);
    if (
      option === undefined
      || option.name !== name
      || !rulesReconcile(option.rules, rules)
    ) {
      throw new Error(`Playbook ${name} does not reconcile with its retained option.`);
    }
    const frozen = Object.freeze({
      name,
      tradeCount: playbook.tradeCount,
      netR: playbook.netR,
      winRatePct: playbook.winRatePct,
      rules,
    });
    previewByIdentity.set(identity, frozen);
    return frozen;
  });

  if (previewByIdentity.size !== optionByIdentity.size) {
    throw new Error("Playbook cards do not reconcile with retained options.");
  }

  const completedCounts = new Map<string, number>();
  for (const trade of snapshot.trades) {
    if (trade.playbook === null) continue;
    const identity = playbookIdentity(trade.playbook);
    const preview = previewByIdentity.get(identity);
    if (preview === undefined || preview.name !== trade.playbook) {
      throw new Error(`Trade playbook ${trade.playbook} is not available.`);
    }
    if (trade.reviewStatus === "completed") {
      completedCounts.set(identity, (completedCounts.get(identity) ?? 0) + 1);
    }
  }
  for (const playbook of playbooks) {
    if ((completedCounts.get(playbookIdentity(playbook.name)) ?? 0) !== playbook.tradeCount) {
      throw new Error(`Playbook ${playbook.name} completed trade count does not reconcile.`);
    }
  }

  return Object.freeze({
    provenance: snapshot.provenance,
    playbooks: Object.freeze(playbooks),
  });
}

/**
 * Opens the exact completed-review cohort represented by one playbook card.
 * Every prior Trade Browser scope and view filter is intentionally discarded.
 */
export function buildExactPlaybookTradeScope(
  snapshot: JournalWorkspaceSnapshot,
  playbookName: string,
): TradeBrowserResult {
  const library = buildPlaybookLibrary(snapshot);
  const playbook = library.playbooks.find(({ name }) => name === playbookName);
  if (playbook === undefined) {
    throw new Error("The selected playbook is not available in this journal.");
  }
  const target = buildTradeBrowser(snapshot, {
    ...EMPTY_TRADE_BROWSER_STATE,
    reviewState: "completed",
    playbook: playbook.name,
  });
  const state = target.state;
  if (
    state.accountId !== null
    || state.activityFrom !== null
    || state.activityThrough !== null
    || state.selectedDay !== null
    || state.query !== ""
    || state.assetClass !== "all"
    || state.direction !== "all"
    || state.positionState !== "all"
    || state.reviewState !== "completed"
    || state.setup !== null
    || state.mistake !== null
    || state.emotion !== null
    || state.tag !== null
    || state.playbook !== playbook.name
    || target.invalidatedSelectedDay !== null
    || target.visibleEvidence.length !== playbook.tradeCount
    || target.visibleEvidence.some(({ trade }) => (
      trade.reviewStatus !== "completed" || trade.playbook !== playbook.name
    ))
  ) {
    throw new Error("The selected playbook trade count or scope does not reconcile.");
  }
  return target;
}
