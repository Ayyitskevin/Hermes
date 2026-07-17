import { buildDailyReflectionRhythm } from "../application/daily-reflection-rhythm";
import type { DailyReflectionRhythmStatus } from "../application/daily-reflection-rhythm";
import type { JournalWorkspaceSnapshot } from "../core/types";

const FULL_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dateFromIso(isoDate: string): Date {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`Daily reflection rhythm date ${isoDate} is invalid.`);
  }
  return date;
}

function statusLabel(status: DailyReflectionRhythmStatus): string {
  return status === "completed" ? "Completed" : status === "draft" ? "Draft" : "Missing";
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function dailyReflectionRhythmSection(snapshot: JournalWorkspaceSnapshot): string {
  const rhythm = buildDailyReflectionRhythm(snapshot);
  if (rhythm.tradingSessions === 0) {
    return `<section aria-labelledby="daily-reflection-rhythm-title" data-daily-reflection-rhythm>
      <div class="section-title"><h2 id="daily-reflection-rhythm-title">Daily reflection rhythm</h2><span>0 sessions</span></div>
      <article class="empty-state"><h3>No trading sessions yet</h3><p>A session appears after an execution is recorded. No-trade reflections still remain available in Daily notes.</p></article>
    </section>`;
  }
  const runLabel = rhythm.currentCompletedRun === 0
    ? "No current completed run"
    : `${rhythm.currentCompletedRun}-session current run`;
  const sessionRows = rhythm.recentSessions.map((session) => {
    const date = dateFromIso(session.isoDate);
    const fullDate = FULL_DATE.format(date);
    return `<li class="reflection-rhythm-session reflection-${session.status}" data-reflection-session="${session.isoDate}" aria-label="${fullDate}: ${session.status} daily reflection">
      <span>${SHORT_DATE.format(date)}</span><strong>${statusLabel(session.status)}</strong>
    </li>`;
  }).join("");
  const boundedCopy = rhythm.recentSessions.length === rhythm.tradingSessions
    ? `Showing all ${countNoun(rhythm.tradingSessions, "trading session")}.`
    : `Showing the latest 7 of ${countNoun(rhythm.tradingSessions, "trading session")}.`;
  return `<section aria-labelledby="daily-reflection-rhythm-title" data-daily-reflection-rhythm>
    <div class="section-title"><h2 id="daily-reflection-rhythm-title">Daily reflection rhythm</h2><span>${rhythm.completedSessions} of ${rhythm.tradingSessions} completed</span></div>
    <article class="card reflection-rhythm-card">
      <div><p class="card-label">DAY-LEVEL ACCOUNTABILITY</p><h3>${runLabel}</h3><p>Reflection completion only—not performance, consecutive calendar days, or trade-review coverage.</p></div>
      <div class="reflection-rhythm-totals" aria-label="Daily reflection rhythm totals">
        <span><strong>${rhythm.completedSessions}</strong> completed</span>
        <span><strong>${rhythm.draftSessions}</strong> draft</span>
        <span><strong>${rhythm.missingSessions}</strong> missing</span>
      </div>
      <ol class="reflection-rhythm-strip" aria-label="Latest trading-session daily reflection status">${sessionRows}</ol>
      <p class="helper-text">${boundedCopy} No-trade reflections remain in Daily notes and do not change this trading-session run.</p>
    </article>
  </section>`;
}
