import { describe, expect, it } from "vitest";

import type {
  ReviewClearPlanCheckContinuation,
} from "../application/review-clear-plan-check-continuation";
import {
  reviewClearPlanCheckAction,
  reviewClearPlanCheckFailure,
} from "./review-clear-plan-check-continuation";

function continuation(
  origin: ReviewClearPlanCheckContinuation["origin"],
): ReviewClearPlanCheckContinuation {
  return Object.freeze({
    origin,
    completedTradeCount: 3,
    reportTargetId: "plan-check-title",
  });
}

describe("review-clear Plan Check continuation view", () => {
  it.each(["dashboard", "journal"] as const)(
    "renders one explicit %s action without a generic route or write marker",
    (origin) => {
      const html = reviewClearPlanCheckAction(continuation(origin));

      expect(html).toContain(`data-review-clear-plan-check="${origin}"`);
      expect(html).toContain('data-review-clear-completed="3"');
      expect(html).toContain('data-review-clear-report-target="plan-check-title"');
      expect(html).toContain("Open plan check");
      expect(html).toContain("3 completed reviewed trades");
      expect(html).not.toContain("data-route=");
      expect(html).not.toContain("data-review-trade=");
      expect(html).not.toContain("data-daily-entry");
    },
  );

  it("renders a dedicated, initially hidden origin-qualified failure target", () => {
    const html = reviewClearPlanCheckFailure(continuation("journal"));

    expect(html).toContain('data-review-clear-plan-check-error="journal"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("hidden");
  });

  it("rejects malformed continuation evidence before rendering a control", () => {
    expect(() => reviewClearPlanCheckAction({
      ...continuation("dashboard"),
      completedTradeCount: 0,
    })).toThrow(/invalid/u);
    expect(() => reviewClearPlanCheckFailure({
      ...continuation("journal"),
      reportTargetId: "other" as "plan-check-title",
    })).toThrow(/invalid/u);
  });
});
