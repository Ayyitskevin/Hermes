import type { JournalWorkspaceSnapshot } from "../core/types";

export type DailyReflectionRhythmStatus = "completed" | "draft" | "missing";

export interface DailyReflectionRhythmSession {
  readonly isoDate: string;
  readonly status: DailyReflectionRhythmStatus;
}

export interface DailyReflectionRhythm {
  readonly tradingSessions: number;
  readonly completedSessions: number;
  readonly draftSessions: number;
  readonly missingSessions: number;
  /** Maximal completed suffix ending at the latest trading-session date. */
  readonly currentCompletedRun: number;
  /** Current daily heads on dates with no recorded trading session. */
  readonly noTradeReflections: number;
  /** Oldest-to-newest, bounded to the latest seven trading sessions. */
  readonly recentSessions: readonly DailyReflectionRhythmSession[];
}

function canonicalIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} is not a canonical ISO date.`);
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid Gregorian date.`);
  }
  return value;
}

export function buildDailyReflectionRhythm(
  snapshot: JournalWorkspaceSnapshot,
): Readonly<DailyReflectionRhythm> {
  const sessionDates: string[] = [];
  const sessionDateSet = new Set<string>();
  let previousDate: string | null = null;
  for (const session of snapshot.calendar) {
    const isoDate = canonicalIsoDate(session.isoDate, "Trading-session date");
    if (sessionDateSet.has(isoDate)) {
      throw new Error(`Trading-session date ${isoDate} appears more than once.`);
    }
    if (previousDate !== null && isoDate <= previousDate) {
      throw new Error("Trading-session dates must be in strict chronological order.");
    }
    sessionDateSet.add(isoDate);
    sessionDates.push(isoDate);
    previousDate = isoDate;
  }

  const dailyStateByDate = new Map<string, "completed" | "draft">();
  for (const entry of snapshot.dailyJournal) {
    const isoDate = canonicalIsoDate(entry.isoDate, "Daily-reflection date");
    if (dailyStateByDate.has(isoDate)) {
      throw new Error(`Daily-reflection date ${isoDate} has more than one current head.`);
    }
    if (entry.state !== "completed" && entry.state !== "draft") {
      throw new Error(`Daily-reflection date ${isoDate} has an invalid state.`);
    }
    if ((entry.state === "completed") !== (entry.completedAtUs !== null)) {
      throw new Error(`Daily-reflection date ${isoDate} has inconsistent completion evidence.`);
    }
    dailyStateByDate.set(isoDate, entry.state);
  }

  const sessions = sessionDates.map((isoDate): DailyReflectionRhythmSession => Object.freeze({
    isoDate,
    status: dailyStateByDate.get(isoDate) ?? "missing",
  }));
  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const draftSessions = sessions.filter((session) => session.status === "draft").length;
  const missingSessions = sessions.length - completedSessions - draftSessions;
  let currentCompletedRun = 0;
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    if (sessions[index]?.status !== "completed") break;
    currentCompletedRun += 1;
  }
  const noTradeReflections = [...dailyStateByDate.keys()].filter(
    (isoDate) => !sessionDateSet.has(isoDate),
  ).length;
  const recentSessions = Object.freeze(sessions.slice(-7));

  return Object.freeze({
    tradingSessions: sessions.length,
    completedSessions,
    draftSessions,
    missingSessions,
    currentCompletedRun,
    noTradeReflections,
    recentSessions,
  });
}
