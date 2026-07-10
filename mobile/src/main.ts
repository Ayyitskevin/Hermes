import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { browserPreferences } from "./adapters/browser-preferences";
import { SessionJournalStore } from "./adapters/session-journal-store";
import { NativeJournalDatabaseFactory } from "./adapters/sqlite/connection";
import {
  MOBILE_SCHEMA_MIGRATIONS,
  createCapacitorSchemaUpgrades,
} from "./adapters/sqlite/schema";
import { SqliteJournalStore } from "./adapters/sqlite/sqlite-journal-store";
import { JournalApplication } from "./application/journal-application";
import { OnboardingPreferences } from "./application/onboarding-preferences";
import { startApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Hermes could not find its application root.");
}

async function createApplication(): Promise<JournalApplication> {
  if (!Capacitor.isNativePlatform()) {
    return new JournalApplication(new SessionJournalStore(), "browser-session");
  }
  const currentSchema = MOBILE_SCHEMA_MIGRATIONS.at(-1);
  if (currentSchema === undefined) throw new Error("Hermes has no mobile database schema.");
  const database = await new NativeJournalDatabaseFactory({
    version: currentSchema.toVersion,
    upgrades: createCapacitorSchemaUpgrades(),
  }).open();
  return new JournalApplication(new SqliteJournalStore(database), "encrypted-device");
}

createApplication().then((application) => startApp({
  root,
  application,
  onboarding: new OnboardingPreferences(browserPreferences),
})).catch((error: unknown) => {
  root.textContent = error instanceof Error ? error.message : "Hermes could not start.";
});
