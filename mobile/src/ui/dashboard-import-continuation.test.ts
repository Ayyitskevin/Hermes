import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildDashboardImportContinuation,
  dashboardImportContinuationCard,
} from "./dashboard-import-continuation";

const LOCAL_WORKSPACE: JournalWorkspaceSnapshot = Object.freeze({
  ...DEMO_WORKSPACE,
  provenance: "local",
  provenanceLabel: "ON-DEVICE JOURNAL",
});

describe("Dashboard import continuation", () => {
  it("exists only for a nonempty private journal and ignores ordinary history guidance", () => {
    expect(buildDashboardImportContinuation(DEMO_WORKSPACE, null)).toBeNull();
    expect(buildDashboardImportContinuation({
      ...LOCAL_WORKSPACE,
      provenance: "empty",
      provenanceLabel: "EMPTY JOURNAL",
    }, null)).toBeNull();
    expect(buildDashboardImportContinuation(LOCAL_WORKSPACE, null)).toEqual({
      kind: "import",
    });
    expect(buildDashboardImportContinuation(LOCAL_WORKSPACE, {
      receiptId: "receipt:history",
      origin: "history-review",
    })).toEqual({ kind: "import" });
  });

  it("renders a bounded generic-CSV route without a file input or write control", () => {
    const continuation = buildDashboardImportContinuation(LOCAL_WORKSPACE, null);
    if (continuation === null) throw new Error("Expected a local continuation.");
    const html = dashboardImportContinuationCard(continuation);

    expect(html).toContain('data-dashboard-import-continuation="import"');
    expect(html).toContain('data-dashboard-import-action="import"');
    expect(html).toContain("RECURRING CAPTURE");
    expect(html).toContain("GENERIC STOCK CSV");
    expect(html).toContain("Keep your journal current");
    expect(html).toContain(">Import latest session</button>");
    expect(html).toContain('class="secondary-button"');
    expect(html).toContain("Reconcile its preview before one atomic commit");
    expect(html).toContain("reversible receipt");
    expect(html).toContain("never asks for broker credentials or places an order");
    expect(html).toContain("data-dashboard-import-continuation-error");
    expect(html).not.toContain("csv-import-form");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("data-dashboard-import-receipt");
  });

  it("renders an escaped, retry-only confirmed-receipt route", () => {
    const continuation = buildDashboardImportContinuation(LOCAL_WORKSPACE, {
      receiptId: 'receipt:<unsafe & "one">',
      origin: "confirmed-post-commit",
    });
    if (continuation === null) throw new Error("Expected a recovery continuation.");
    const html = dashboardImportContinuationCard(continuation);

    expect(continuation).toEqual({
      kind: "confirmed-recovery",
      receiptId: 'receipt:<unsafe & "one">',
    });
    expect(html).toContain('data-dashboard-import-continuation="confirmed-recovery"');
    expect(html).toContain(
      'data-dashboard-import-receipt="receipt:&lt;unsafe &amp; &quot;one&quot;&gt;"',
    );
    expect(html).toContain("Finish saved import");
    expect(html).toContain("RECOVERY REQUIRED");
    expect(html).toContain('class="primary-button"');
    expect(html).toContain("The CSV commit is already confirmed");
    expect(html).toContain("do not choose or import the file again");
    expect(html).not.toContain('receipt:<unsafe & "one">');
    expect(html).not.toContain("Import latest session");
    expect(html).not.toContain('type="file"');
    expect(buildDashboardImportContinuation({
      ...LOCAL_WORKSPACE,
      provenance: "empty",
      provenanceLabel: "STALE EMPTY SNAPSHOT",
    }, {
      receiptId: "receipt:confirmed-after-stale-refresh",
      origin: "confirmed-post-commit",
    })).toEqual({
      kind: "confirmed-recovery",
      receiptId: "receipt:confirmed-after-stale-refresh",
    });
  });

  it("rejects an incoherent confirmed receipt identity", () => {
    expect(() => buildDashboardImportContinuation(LOCAL_WORKSPACE, {
      receiptId: "",
      origin: "confirmed-post-commit",
    })).toThrow(/stable receipt identity/i);
    expect(() => buildDashboardImportContinuation(LOCAL_WORKSPACE, {
      receiptId: " padded ",
      origin: "confirmed-post-commit",
    })).toThrow(/stable receipt identity/i);
  });
});
