export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const ONBOARDING_KEY = "hermes.mobile.onboarding.v1";

export class OnboardingPreferences {
  constructor(private readonly store: KeyValueStore) {}

  isComplete(): boolean {
    return this.store.get(ONBOARDING_KEY) === "complete";
  }

  complete(): void {
    this.store.set(ONBOARDING_KEY, "complete");
  }

  reset(): void {
    this.store.remove(ONBOARDING_KEY);
  }
}
