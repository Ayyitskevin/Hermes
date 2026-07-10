import { describe, expect, it } from "vitest";

import { OnboardingPreferences, type KeyValueStore } from "./onboarding-preferences";

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();
  get(key: string): string | null { return this.values.get(key) ?? null; }
  set(key: string, value: string): void { this.values.set(key, value); }
  remove(key: string): void { this.values.delete(key); }
}

describe("onboarding preferences", () => {
  it("persists completion across application instances and can reset it", () => {
    const store = new MemoryStore();
    const firstLaunch = new OnboardingPreferences(store);
    expect(firstLaunch.isComplete()).toBe(false);
    firstLaunch.complete();
    expect(new OnboardingPreferences(store).isComplete()).toBe(true);
    firstLaunch.reset();
    expect(new OnboardingPreferences(store).isComplete()).toBe(false);
  });
});
