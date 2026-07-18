import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import { EMPTY_WORKSPACE } from "../application/workspace-snapshot";
import {
  PLAYBOOK_SCOPE_UNAVAILABLE_MESSAGE,
  PLAYBOOK_SCOPE_RECONCILIATION_MESSAGE,
  playbookTradeScopeSection,
  preparePlaybookTradeScope,
} from "./playbook-trade-scope-view";

function renderPlaybookScope(snapshot: JournalWorkspaceSnapshot): string {
  return playbookTradeScopeSection(preparePlaybookTradeScope(snapshot));
}

describe("playbook trade scope view", () => {
  it("renders one reconciled, semantic action for every playbook card", () => {
    const html = renderPlaybookScope(DEMO_WORKSPACE);

    expect(html).toContain("data-playbook-trade-scope");
    expect(html).toContain('id="playbooks-title"');
    expect(html).toContain('id="playbook-trade-scope-status"');
    expect(html.match(/data-playbook-trade-scope-card=/g)).toHaveLength(3);
    expect(html.match(/data-playbook-trade-scope-route=/g)).toHaveLength(3);
    expect(html).toContain('data-playbook-trade-scope-card="Breakout"');
    expect(html).toContain('data-playbook-trade-scope-position="2"');
    expect(html).toContain('data-playbook-trade-scope-count="3"');
    expect(html).toContain(
      'aria-label="Open Breakout completed reviews in Trades, playbook 2 of 3"',
    );
    expect(html).toContain("Open completed reviews");
    expect(html).toContain("card count and visible Trades agree");
  });

  it("escapes hostile playbook identity and rule text in cards and actions", () => {
    const hostileName = '<Playbook & "breakout">';
    const hostileRule = '<Rule & "wait">';
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      trades: DEMO_WORKSPACE.trades.map((trade) => (
        trade.playbook === "Breakout" ? { ...trade, playbook: hostileName } : trade
      )),
      playbooks: DEMO_WORKSPACE.playbooks.map((playbook) => (
        playbook.name === "Breakout"
          ? { ...playbook, name: hostileName, rules: [hostileRule] }
          : playbook
      )),
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        playbooks: DEMO_WORKSPACE.reviewOptions.playbooks.map((playbook) => (
          playbook.name === "Breakout"
            ? { name: hostileName, rules: [hostileRule] }
            : playbook
        )),
      },
    };

    const html = renderPlaybookScope(snapshot);
    expect(html).toContain("&lt;Playbook &amp; &quot;breakout&quot;&gt;");
    expect(html).toContain("&lt;Rule &amp; &quot;wait&quot;&gt;");
    expect(html).not.toContain(hostileName);
    expect(html).not.toContain(hostileRule);
  });

  it("keeps a retained zero-result playbook actionable and renders empty vocabulary honestly", () => {
    const retained: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      playbooks: [
        ...DEMO_WORKSPACE.playbooks,
        {
          name: "Draft process",
          tradeCount: 0,
          netR: null,
          winRatePct: 0,
          rules: ["Wait for confirmation"],
        },
      ],
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        playbooks: [
          ...DEMO_WORKSPACE.reviewOptions.playbooks,
          { name: "Draft process", rules: ["Wait for confirmation"] },
        ],
      },
    };

    const retainedHtml = renderPlaybookScope(retained);
    expect(retainedHtml).toContain("0 trades");
    expect(retainedHtml).toContain('data-playbook-trade-scope-route="Draft process"');
    expect(retainedHtml).toContain(
      "Open Draft process completed reviews in Trades, playbook 4 of 4",
    );

    const emptyHtml = renderPlaybookScope(EMPTY_WORKSPACE);
    expect(emptyHtml).toContain("No playbooks yet");
    expect(emptyHtml).not.toContain("data-playbook-trade-scope-route=");
  });

  it("exposes one exact visible recovery message for stale or tampered actions", () => {
    expect(PLAYBOOK_SCOPE_UNAVAILABLE_MESSAGE).toBe(
      "This playbook link is no longer available. No Trade Browser filters changed.",
    );
  });

  it("keeps Journal available with a visible status when playbook evidence cannot reconcile", () => {
    const projection = preparePlaybookTradeScope({
      ...DEMO_WORKSPACE,
      playbooks: DEMO_WORKSPACE.playbooks.map((playbook) => (
        playbook.name === "Breakout"
          ? { ...playbook, tradeCount: playbook.tradeCount + 1 }
          : playbook
      )),
    });
    const html = playbookTradeScopeSection(projection);

    expect(projection.status).toBe("unavailable");
    expect(html).toContain("Playbook links unavailable");
    expect(html).toContain(PLAYBOOK_SCOPE_RECONCILIATION_MESSAGE);
    expect(html).not.toContain("data-playbook-trade-scope-route=");
    expect(html).not.toContain('id="playbook-trade-scope-status" role="status" tabindex="-1" hidden');
  });
});
