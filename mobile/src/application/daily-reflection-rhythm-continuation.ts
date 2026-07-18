import type { DailyJournalPreview, JournalWorkspaceSnapshot } from "../core/types";
import { buildDailyReflectionRhythm } from "./daily-reflection-rhythm";
import {
  validateDailyJournalIdentifier,
  validateDailyJournalIsoDate,
} from "./prepare-daily-journal";

export interface DailyReflectionRhythmEntryIdentity {
  readonly entryVersionId: string;
  readonly version: number;
  readonly revision: string;
  readonly state: DailyJournalPreview["state"];
}

export interface DailyReflectionRhythmContinuation {
  readonly isoDate: string;
  readonly status: "missing" | DailyJournalPreview["state"];
  readonly entry: DailyReflectionRhythmEntryIdentity | null;
}

function entryIdentity(entry: DailyJournalPreview): DailyReflectionRhythmEntryIdentity {
  const entryVersionId = validateDailyJournalIdentifier(
    entry.entryVersionId,
    "Daily reflection rhythm entry version ID",
  );
  if (!Number.isSafeInteger(entry.version) || entry.version < 1) {
    throw new Error("Daily reflection rhythm entry version must be a positive safe integer.");
  }
  if (typeof entry.revision !== "string" || !/^[a-f0-9]{64}$/.test(entry.revision)) {
    throw new Error(
      "Daily reflection rhythm revision must be a 256-bit lowercase hexadecimal value.",
    );
  }
  if (entry.state !== "draft" && entry.state !== "completed") {
    throw new Error("Daily reflection rhythm entry state is invalid.");
  }
  return Object.freeze({
    entryVersionId,
    version: entry.version,
    revision: entry.revision,
    state: entry.state,
  });
}

/**
 * Resolves one visible latest-seven rhythm row to its exact current journal head.
 *
 * The rhythm is a bounded projection, so dates outside that projection are not
 * valid continuation targets even when an older journal head still exists.
 */
export function resolveDailyReflectionRhythmContinuation(
  snapshot: JournalWorkspaceSnapshot,
  requestedIsoDate: string,
  maximumIsoDate: string,
): Readonly<DailyReflectionRhythmContinuation> {
  if (snapshot.provenance !== "local") {
    throw new Error("Daily reflection rhythm continuation requires a private local journal.");
  }
  const isoDate = validateDailyJournalIsoDate(requestedIsoDate);
  const maximumDate = validateDailyJournalIsoDate(maximumIsoDate);
  if (isoDate > maximumDate) {
    throw new Error("Future daily reflection rhythm sessions are not actionable.");
  }

  const rhythm = buildDailyReflectionRhythm(snapshot);
  const sessions = rhythm.recentSessions.filter((session) => session.isoDate === isoDate);
  if (sessions.length !== 1 || sessions[0] === undefined) {
    throw new Error("Daily reflection rhythm continuation requires one visible session row.");
  }
  const status = sessions[0].status;
  const entries = snapshot.dailyJournal.filter((entry) => entry.isoDate === isoDate);
  if (entries.length > 1) {
    throw new Error("Daily reflection rhythm continuation found multiple current heads.");
  }
  const entry = entries[0] ?? null;
  if (status === "missing") {
    if (entry !== null) {
      throw new Error("A missing rhythm row cannot have a current daily reflection head.");
    }
    return Object.freeze({ isoDate, status, entry: null });
  }
  if (entry === null || entry.state !== status) {
    throw new Error("The rhythm row does not match its current daily reflection head.");
  }
  const identity = entryIdentity(entry);
  return Object.freeze({ isoDate, status, entry: identity });
}
