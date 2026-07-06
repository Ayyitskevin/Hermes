// Shared dashboard cache: the risk rail (shell) and the Desk both read one
// /api/dashboard fetch. Subscribers are notified on every refresh; a fetch
// failure is surfaced by the subscriber, never swallowed.

import { api } from "./util.js";

let _dash = null;
let _lastError = null;
const subs = new Set();

export function dashboard() { return _dash; }
export function lastError() { return _lastError; }

export function onDashboard(fn) {
  subs.add(fn);
  if (_dash || _lastError) fn(_dash, _lastError);
  return () => subs.delete(fn);
}

export async function refreshDashboard() {
  try {
    _dash = await api("/api/dashboard");
    _lastError = null;
  } catch (err) {
    _lastError = err;
  }
  subs.forEach((fn) => fn(_dash, _lastError));
  return _dash;
}
