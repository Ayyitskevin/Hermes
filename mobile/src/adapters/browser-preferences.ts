import type { KeyValueStore } from "../application/onboarding-preferences";

export const browserPreferences: KeyValueStore = {
  get(key) {
    return window.localStorage.getItem(key);
  },
  set(key, value) {
    window.localStorage.setItem(key, value);
  },
  remove(key) {
    window.localStorage.removeItem(key);
  },
};
