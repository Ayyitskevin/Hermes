export class NativeJournalOpenCleanupError extends AggregateError {
  constructor(openFailure: unknown, cleanupFailures: readonly unknown[]) {
    super(
      [openFailure, ...cleanupFailures],
      "Hermes could not confirm that the native journal connection closed after startup failed.",
    );
    this.name = "NativeJournalOpenCleanupError";
  }
}
