import { describe, expect, it } from "vitest";

import { deriveRiskPresentation } from "./risk-presentation";

describe("risk presentation", () => {
  it("makes a breach assertive and blocks the decision surface", () => {
    expect(deriveRiskPresentation({
      level: "breach",
      openRiskPct: 5,
      limitPct: 4,
      bindingLimit: "Open-risk budget",
    })).toEqual({
      label: "Risk breach",
      contentInert: true,
      liveMode: "assertive",
    });
  });

  it("leaves clear and warning states usable", () => {
    for (const level of ["ok", "warn"] as const) {
      expect(deriveRiskPresentation({
        level,
        openRiskPct: 2,
        limitPct: 4,
        bindingLimit: "Open-risk budget",
      }).contentInert).toBe(false);
    }
  });
});
