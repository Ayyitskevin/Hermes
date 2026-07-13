import { describe, expect, it, vi } from "vitest";
import { JOURNAL_ARCHIVE_MAX_BYTES } from "../application/journal-archive";
import {
  readJournalRestoreFile,
  userDataRestoreCard,
} from "./user-data-restore";

describe("user data restore UI contract", () => {
  it("renders an explicitly labeled, confirmed empty-journal flow", () => {
    const card = userDataRestoreCard(true, "encrypted-device");

    expect(card).toContain('for="user-data-restore-file"');
    expect(card).toContain('accept=".json,application/json,application/vnd.hermes.journal+json"');
    expect(card).toContain("64 MiB maximum");
    expect(card).toContain("ADAPTER-VERIFIED PREVIEW");
    expect(card).toContain('id="user-data-restore-confirm"');
    expect(card).toContain('id="user-data-restore-commit"');
    expect(card).toContain('role="status"');
    expect(card).toContain('role="alert"');
    expect(card).toContain("native SQLite-table archive");
  });

  it("renders no chooser or restore action for a nonempty local journal", () => {
    const card = userDataRestoreCard(false, "encrypted-device");

    expect(card).toContain("never merges or overwrites");
    expect(card).toContain("Delete All Data is not available yet");
    expect(card).not.toContain('type="file"');
    expect(card).not.toContain('id="user-data-restore-preview"');
    expect(card).not.toContain('id="user-data-restore-commit"');
  });

  it("keeps browser archives explicitly separate from native recovery evidence", () => {
    const card = userDataRestoreCard(true, "browser-session");

    expect(card).toContain("browser-session archive");
    expect(card).toContain("not native iOS recovery evidence");
  });

  it("checks the 64 MiB boundary before reading selected file text", async () => {
    const atLimitText = vi.fn(async () => "archive");
    await expect(readJournalRestoreFile({
      name: "journal.json",
      size: JOURNAL_ARCHIVE_MAX_BYTES,
      text: atLimitText,
    })).resolves.toBe("archive");
    expect(atLimitText).toHaveBeenCalledOnce();

    const oversizedText = vi.fn(async () => "must not be read");
    await expect(readJournalRestoreFile({
      name: "too-large.json",
      size: JOURNAL_ARCHIVE_MAX_BYTES + 1,
      text: oversizedText,
    })).rejects.toThrow(/no larger than 64 MiB/);
    expect(oversizedText).not.toHaveBeenCalled();
  });
});
