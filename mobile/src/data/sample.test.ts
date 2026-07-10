import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleDataSource } from "./sample";

describe("offline sample source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads a persistently labeled fixture without making a network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const snapshot = await sampleDataSource.loadSnapshot();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(snapshot.provenance).toBe("sample");
    expect(snapshot.provenanceLabel).toContain("NOT LIVE DATA");
    expect(snapshot.journal).toHaveLength(3);
    expect(snapshot.importSummary.trades).toBe(24);
  });
});
