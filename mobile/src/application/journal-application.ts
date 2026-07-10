import type { CsvHeaderMapping } from "../core/csv";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import type {
  CsvImportCommitResult,
  JournalStore,
  PreparedCsvImport,
} from "./journal-store";
import {
  prepareCsvImport,
  type PrepareCsvImportInput,
} from "./prepare-csv-import";
import {
  workspaceSnapshotFromLedger,
} from "./workspace-snapshot";

export interface CsvImportSelection {
  readonly rawInput: string;
  readonly sourceName: string;
  readonly accountName: string;
  readonly timeZone: string;
  readonly defaultCurrency: string;
  readonly mapping?: CsvHeaderMapping;
}

export class JournalApplication {
  private viewMode: "local" | "demo" = "local";

  constructor(
    private readonly store: JournalStore,
    readonly persistence: "encrypted-device" | "browser-session",
  ) {}

  async loadWorkspace(): Promise<JournalWorkspaceSnapshot> {
    if (this.viewMode === "demo") return DEMO_WORKSPACE;
    return workspaceSnapshotFromLedger(await this.store.load());
  }

  async startJournal(): Promise<JournalWorkspaceSnapshot> {
    this.viewMode = "local";
    return this.loadWorkspace();
  }

  async exploreDemo(): Promise<JournalWorkspaceSnapshot> {
    this.viewMode = "demo";
    return DEMO_WORKSPACE;
  }

  prepareCsv(selection: CsvImportSelection): PreparedCsvImport {
    const input: PrepareCsvImportInput = selection;
    return prepareCsvImport(input);
  }

  async commitCsv(prepared: PreparedCsvImport): Promise<CsvImportCommitResult> {
    const result = await this.store.commitCsvImport(prepared);
    this.viewMode = "local";
    return result;
  }

  async rollbackImport(receiptId: string, reason: string): Promise<JournalWorkspaceSnapshot> {
    const ledger = await this.store.rollbackImport(receiptId, reason);
    this.viewMode = "local";
    return workspaceSnapshotFromLedger(ledger);
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
