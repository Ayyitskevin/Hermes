import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { browserPreferences } from "./adapters/browser-preferences";
import { SessionJournalStore } from "./adapters/session-journal-store";
import { NativeJournalOpenCleanupError } from "./adapters/sqlite/native-journal-open-error";
import {
  MOBILE_SCHEMA_MIGRATIONS,
  createCapacitorSchemaUpgrades,
} from "./adapters/sqlite/schema";
import { JournalApplication } from "./application/journal-application";
import { OnboardingPreferences } from "./application/onboarding-preferences";
import { createStartupView, startWithRecovery } from "./ui/startup";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Hermes could not find its application root.");
}

async function createApplication(): Promise<JournalApplication> {
  if (!Capacitor.isNativePlatform()) {
    return new JournalApplication(new SessionJournalStore(), "browser-session");
  }
  const [{ NativeJournalDatabaseFactory }, { SqliteJournalStore }] = await Promise.all([
    import("./adapters/sqlite/connection"),
    import("./adapters/sqlite/sqlite-journal-store"),
  ]);
  const currentSchema = MOBILE_SCHEMA_MIGRATIONS.at(-1);
  if (currentSchema === undefined) throw new Error("Hermes has no mobile database schema.");
  const database = await new NativeJournalDatabaseFactory({
    version: currentSchema.toVersion,
    upgrades: createCapacitorSchemaUpgrades(),
  }).open();
  return new JournalApplication(new SqliteJournalStore(database), "encrypted-device");
}

void startWithRecovery({
  view: createStartupView(root),
  createApplication,
  canRetryCreationFailure: (failure) => !(failure instanceof NativeJournalOpenCleanupError),
  startApplication: async (application) => {
    const { startApp } = await import("./ui/app");
    return startApp({
      root,
      application,
      onboarding: new OnboardingPreferences(browserPreferences),
    });
  },
  reload: () => window.location.reload(),
});
