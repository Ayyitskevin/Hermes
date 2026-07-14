import { describe, expect, it } from "vitest";

import {
  PERCENT_RETURN_METRIC_VERSION,
  RESULT_R_METRIC_VERSION,
  TRADE_REVIEW_LIST_LIMIT,
  TRADE_REVIEW_NOTE_LIMIT,
  createTradeReviewSubmissionId,
  prepareTradeReview,
  tradeReviewBatchRevision,
  tradeReviewRevision,
  verifyPreparedTradeReview,
  type PreparedTradeReview,
  type TradeReviewInput,
} from "./prepare-trade-review";

function input(overrides: Partial<TradeReviewInput> = {}): TradeReviewInput {
  return {
    submissionId: "a".repeat(64),
    tradeSubjectId: "trade-subject-1",
    expectedPreviousReviewId: null,
    state: "completed",
    note: "Waited for confirmation.",
    setup: "Opening range break",
    mistakes: ["Entered early"],
    tags: ["A setup"],
    emotion: "Focused",
    playbook: {
      name: "ORB",
      rules: [
        { name: "Wait for volume", outcome: "followed" },
        { name: "Respect stop", outcome: "broken" },
      ],
    },
    initialRisk: { amount: "100.00", currency: "usd" },
    plannedStop: "  182.5000 ",
    ...overrides,
  };
}

function withRevision(
  prepared: PreparedTradeReview,
  overrides: Partial<PreparedTradeReview>,
): PreparedTradeReview {
  const changed = { ...prepared, ...overrides };
  const { revision: _revision, ...payload } = changed;
  return {
    ...changed,
    revision: tradeReviewRevision(payload),
  };
}

describe("prepared trade review", () => {
  it("creates a canonical immutable revision and reverifies it", () => {
    const prepared = prepareTradeReview(input({
      note: "  First line\r\nSecond line  ",
      setup: "  Opening   range break ",
      mistakes: ["Entered early", " entered early ", "Chased"],
      tags: ["A setup", "a SETUP", "Morning"],
      emotion: "  Calm  ",
      playbook: {
        name: "  Opening Range  ",
        rules: [
          { name: "Wait for volume", outcome: "followed" },
          { name: " wait for volume ", outcome: "followed" },
        ],
      },
    }));

    expect(prepared).toMatchObject({
      note: "First line\nSecond line",
      setup: "Opening range break",
      mistakes: ["Entered early", "Chased"],
      tags: ["A setup", "Morning"],
      emotion: "Calm",
      playbook: {
        name: "Opening Range",
        rules: [{ name: "Wait for volume", outcome: "followed" }],
      },
      initialRisk: { amount: "100", currency: "USD" },
      plannedStop: "182.5",
      resultRVersion: RESULT_R_METRIC_VERSION,
      percentReturnVersion: PERCENT_RETURN_METRIC_VERSION,
    });
    expect(prepared.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.tags)).toBe(true);
    expect(verifyPreparedTradeReview(prepared)).toEqual(prepared);
  });

  it("bounds case-insensitive SQLite vocabulary identities", () => {
    expect(() => prepareTradeReview(input({
      emotion: "İ".repeat(120),
    }))).toThrow(/1-120 visible characters/i);
    expect(() => prepareTradeReview(input({
      playbook: { name: "İ".repeat(120), rules: [] },
    }))).toThrow(/1-120 visible characters/i);
  });

  it("detects direct and rehashed post-review tampering", () => {
    const prepared = prepareTradeReview(input());
    expect(() => verifyPreparedTradeReview({
      ...prepared,
      note: "Changed",
    })).toThrow(/changed after review/);

    const metricTamper = withRevision(prepared, {
      resultRVersion: 2 as typeof RESULT_R_METRIC_VERSION,
    });
    expect(() => verifyPreparedTradeReview(metricTamper))
      .toThrow(/metric definitions/);

    const nonCanonicalRisk = withRevision(prepared, {
      initialRisk: {
        amount: "0100.00",
        currency: "usd",
      } as unknown as PreparedTradeReview["initialRisk"],
    });
    expect(() => verifyPreparedTradeReview(nonCanonicalRisk))
      .toThrow(/normalized values/);
  });

  it("includes identity, predecessor, nested rule, and risk values in the digest", () => {
    const prepared = prepareTradeReview(input());
    const changedPayloads: PreparedTradeReview[] = [
      { ...prepared, tradeSubjectId: "trade-subject-2" },
      { ...prepared, expectedPreviousReviewId: "review-previous" },
      {
        ...prepared,
        playbook: {
          ...prepared.playbook!,
          rules: [{ name: "Wait for volume", outcome: "unreviewed" }],
        },
      },
      { ...prepared, plannedStop: "181" as PreparedTradeReview["plannedStop"] },
    ];
    for (const changed of changedPayloads) {
      expect(() => verifyPreparedTradeReview(changed)).toThrow(/changed after review/);
    }
  });

  it("hashes reusable vocabulary by its case-insensitive identity", () => {
    const canonical = prepareTradeReview(input());
    const alternateCase = prepareTradeReview(input({
      setup: "opening RANGE break",
      mistakes: ["entered EARLY"],
      tags: ["a SETUP"],
      emotion: "FOCUSED",
      playbook: {
        name: "orb",
        rules: [
          { name: "wait FOR volume", outcome: "followed" },
          { name: "respect STOP", outcome: "broken" },
        ],
      },
    }));

    expect(alternateCase.revision).toBe(canonical.revision);
    expect(prepareTradeReview(input({ note: "waited for confirmation." })).revision)
      .not.toBe(canonical.revision);
  });

  it("requires secure submission IDs and visible bounded record IDs", () => {
    expect(() => prepareTradeReview(input({ submissionId: "A".repeat(64) })))
      .toThrow(/256-bit lowercase hexadecimal/);
    expect(() => prepareTradeReview(input({ submissionId: "a".repeat(63) })))
      .toThrow(/256-bit lowercase hexadecimal/);
    expect(() => prepareTradeReview(input({ tradeSubjectId: " trade-subject-1" })))
      .toThrow(/trimmed visible/);
    expect(() => prepareTradeReview(input({ expectedPreviousReviewId: "review\u0000id" })))
      .toThrow(/trimmed visible/);
  });

  it("creates independent cryptographically shaped identifiers", () => {
    const first = createTradeReviewSubmissionId();
    const second = createTradeReviewSubmissionId();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it("fingerprints the batch identity and ordered reviewed-command pairs", () => {
    const first = prepareTradeReview(input({ submissionId: "1".repeat(64) }));
    const second = prepareTradeReview(input({ submissionId: "2".repeat(64) }));
    const revision = tradeReviewBatchRevision("batch-1", [first, second]);

    expect(revision).toMatch(/^[a-f0-9]{64}$/);
    expect(tradeReviewBatchRevision("batch-1", [first, second])).toBe(revision);
    expect(tradeReviewBatchRevision("batch-1", [second, first])).not.toBe(revision);
    expect(tradeReviewBatchRevision("batch-2", [first, second])).not.toBe(revision);
    expect(tradeReviewBatchRevision("batch-1", [
      { ...first, revision: "f".repeat(64) },
      second,
    ])).not.toBe(revision);
  });

  it("requires a trimmed visible batch identity", () => {
    const review = prepareTradeReview(input());
    expect(() => tradeReviewBatchRevision(" batch-1", [review]))
      .toThrow(/trimmed visible/);
    expect(() => tradeReviewBatchRevision("batch\u0000id", [review]))
      .toThrow(/trimmed visible/);
  });

  it("caps notes and every repeated classification list before deduplication", () => {
    expect(() => prepareTradeReview(input({
      note: "n".repeat(TRADE_REVIEW_NOTE_LIMIT + 1),
    }))).toThrow(/at most 5000/);
    expect(() => prepareTradeReview(input({
      mistakes: Array.from({ length: TRADE_REVIEW_LIST_LIMIT + 1 }, () => "Same"),
    }))).toThrow(/at most 20/);
    expect(() => prepareTradeReview(input({
      tags: Array.from({ length: TRADE_REVIEW_LIST_LIMIT + 1 }, (_, index) => `Tag ${index}`),
    }))).toThrow(/at most 20/);
    expect(() => prepareTradeReview(input({
      playbook: {
        name: "ORB",
        rules: Array.from(
          { length: TRADE_REVIEW_LIST_LIMIT + 1 },
          (_, index) => ({ name: `Rule ${index}`, outcome: "unreviewed" as const }),
        ),
      },
    }))).toThrow(/at most 20/);
  });

  it("rejects control characters and conflicting case-insensitive rules", () => {
    expect(() => prepareTradeReview(input({ note: "Visible\u0000hidden" })))
      .toThrow(/control character/);
    expect(() => prepareTradeReview(input({ tags: ["Multi\nline"] })))
      .toThrow(/single-line/);
    expect(() => prepareTradeReview(input({
      playbook: {
        name: "ORB",
        rules: [
          { name: "Respect stop", outcome: "followed" },
          { name: " respect STOP ", outcome: "broken" },
        ],
      },
    }))).toThrow(/conflicting outcomes/);
    expect(() => prepareTradeReview(input({
      playbook: {
        name: "ORB",
        rules: [{
          name: "Respect stop",
          outcome: "violated" as unknown as "broken",
        }],
      },
    }))).toThrow(/followed, broken, not_applicable, or unreviewed/);
  });

  it("requires paired, positive, supported exact risk and gates planned stops", () => {
    expect(() => prepareTradeReview(input({
      initialRisk: { amount: "0", currency: "USD" },
    }))).toThrow(/greater than zero/);
    expect(() => prepareTradeReview(input({
      initialRisk: { amount: "1e2", currency: "USD" },
    }))).toThrow(/signs and exponents/);
    expect(() => prepareTradeReview(input({
      initialRisk: { amount: "100", currency: "XYZ" },
    }))).toThrow(/not supported/);
    expect(() => prepareTradeReview(input({
      initialRisk: { amount: "100" } as TradeReviewInput["initialRisk"],
    }))).toThrow(/include a supported currency/);
    expect(() => prepareTradeReview(input({
      initialRisk: null,
      plannedStop: "180",
    }))).toThrow(/only be saved with an initial-risk basis/);
    expect(() => prepareTradeReview(input({
      plannedStop: "-1",
    }))).toThrow(/signs and exponents/);
  });

  it("allows an empty draft but requires a completed reflection or risk signal", () => {
    const empty = {
      note: " ",
      setup: null,
      mistakes: [],
      tags: [],
      emotion: null,
      playbook: null,
      initialRisk: null,
      plannedStop: null,
    } as const;
    expect(prepareTradeReview(input({ state: "draft", ...empty }))).toMatchObject({
      state: "draft",
      note: "",
    });
    expect(() => prepareTradeReview(input({ state: "completed", ...empty })))
      .toThrow(/needs at least one reflection/);
    expect(prepareTradeReview(input({
      state: "completed",
      ...empty,
      initialRisk: { amount: "75", currency: "USD" },
    }))).toMatchObject({ state: "completed", initialRisk: { amount: "75" } });
  });

  it("rejects multiple values smuggled into singular controls", () => {
    expect(() => prepareTradeReview(input({
      setup: ["Breakout", "Pullback"] as unknown as string,
    }))).toThrow(/visible single-line text/);
    expect(() => prepareTradeReview(input({
      emotion: ["Calm", "Anxious"] as unknown as string,
    }))).toThrow(/visible single-line text/);
  });
});
