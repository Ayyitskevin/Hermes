import { describe, expect, it } from "vitest";

import { DEMO_WORKSPACE } from "../data/demo";
import { dailyReflectionRhythmSection } from "./daily-reflection-rhythm-view";

describe("daily reflection rhythm view", () => {
  it("renders truthful day-level completion without performance or write controls", () => {
    const html = dailyReflectionRhythmSection(DEMO_WORKSPACE);

    expect(html).toContain('id="daily-reflection-rhythm-title"');
    expect(html).toContain("2 of 6 completed");
    expect(html).toContain("2-session current run");
    expect(html.match(/data-reflection-session=/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Wednesday, July 8, 2026: completed daily reflection"');
    expect(html).toContain('aria-label="Tuesday, July 7, 2026: missing daily reflection"');
    expect(html).toContain("Reflection completion only—not performance, consecutive calendar days, or trade-review coverage.");
    expect(html).toContain("No-trade reflections remain in Daily notes and do not change this trading-session run.");
    expect(html).not.toContain("+$");
    expect(html).not.toContain("process");
    expect(html).not.toContain("button");
  });

  it("renders an honest zero state when no trading session exists", () => {
    const html = dailyReflectionRhythmSection({
      ...DEMO_WORKSPACE,
      calendar: [],
      dailyJournal: [],
    });

    expect(html).toContain("No trading sessions yet");
    expect(html).toContain("A session appears after an execution is recorded");
    expect(html).not.toContain("data-reflection-session=");
  });

  it("shows a broken latest run without rewarding historical completions", () => {
    const html = dailyReflectionRhythmSection({
      ...DEMO_WORKSPACE,
      dailyJournal: [DEMO_WORKSPACE.dailyJournal[1]!],
    });

    expect(html).toContain("No current completed run");
    expect(html).toContain("<strong>1</strong> completed");
    expect(html).toContain("<strong>5</strong> missing");
  });

  it("renders exact local missing and draft actions while completed and future rows stay read only", () => {
    const draft = {
      ...DEMO_WORKSPACE.dailyJournal[0]!,
      isoDate: "2026-07-08",
      dateLabel: "Jul 8",
      entryVersionId: "daily-2026-07-08",
      state: "draft" as const,
      completedAtUs: null,
    };
    const html = dailyReflectionRhythmSection({
      ...DEMO_WORKSPACE,
      provenance: "local",
      provenanceLabel: "ON-DEVICE JOURNAL",
      calendar: [
        { ...DEMO_WORKSPACE.calendar[0]!, isoDate: "2026-07-07" },
        { ...DEMO_WORKSPACE.calendar[1]!, isoDate: "2026-07-08" },
        { ...DEMO_WORKSPACE.calendar[2]!, isoDate: "2026-07-09" },
        { ...DEMO_WORKSPACE.calendar[3]!, isoDate: "2026-07-10" },
      ],
      dailyJournal: [
        draft,
        { ...DEMO_WORKSPACE.dailyJournal[1]!, isoDate: "2026-07-09" },
      ],
    }, "2026-07-09");

    expect(html).toContain('data-reflection-session="2026-07-07" data-reflection-session-status="missing"');
    expect(html).toContain('data-daily-entry-rhythm-date="2026-07-07"');
    expect(html).toContain('aria-label="Write reflection — July 7, 2026"');
    expect(html).toContain('data-reflection-session="2026-07-08" data-reflection-session-status="draft"');
    expect(html).toContain('data-daily-entry-rhythm-entry-id="daily-2026-07-08"');
    expect(html).toContain('aria-label="Continue reflection draft — July 8, 2026"');
    expect(html).not.toMatch(/data-reflection-session="2026-07-09"[^]*data-daily-entry-rhythm-date="2026-07-09"/u);
    expect(html).not.toMatch(/data-reflection-session="2026-07-10"[^]*data-daily-entry-rhythm-date="2026-07-10"/u);
    expect(html.match(/data-daily-entry-rhythm-date=/g)).toHaveLength(2);
    expect(html).toContain('id="daily-reflection-rhythm-title" tabindex="-1"');
    expect(html.match(/data-reflection-session=[^>]*tabindex="-1"/g)).toHaveLength(4);
  });

  it("requires an explicit maximum workspace date before rendering local actions", () => {
    expect(() => dailyReflectionRhythmSection({
      ...DEMO_WORKSPACE,
      provenance: "local",
      provenanceLabel: "ON-DEVICE JOURNAL",
    })).toThrow("maximum workspace date");
  });
});
