import "./styles.css";
import { browserPreferences } from "./adapters/browser-preferences";
import { OnboardingPreferences } from "./application/onboarding-preferences";
import { demoDataSource } from "./data/demo";
import { startApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Hermes could not find its application root.");
}

startApp({
  root,
  dataSource: demoDataSource,
  onboarding: new OnboardingPreferences(browserPreferences),
}).catch((error: unknown) => {
  root.textContent = error instanceof Error ? error.message : "Hermes could not start.";
});
