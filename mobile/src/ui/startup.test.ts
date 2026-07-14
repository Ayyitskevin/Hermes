import { describe, expect, it, vi } from "vitest";

import sourceHtml from "../../index.html?raw";
import {
  startWithRecovery,
  startupFailureView,
  startupOpeningView,
  type StartupApplication,
  type StartupView,
} from "./startup";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeView(): StartupView {
  return {
    showOpening: vi.fn(),
    showCleanup: vi.fn(),
    showFailure: vi.fn(),
    showReloading: vi.fn(),
    showReady: vi.fn(),
  };
}

describe("startup recovery controller", () => {
  it("shows opening synchronously and leaves a successful application owned by the app", async () => {
    const pending = deferred<StartupApplication>();
    const application = { close: vi.fn(async () => undefined) };
    const view = fakeView();
    const startApplication = vi.fn(async () => undefined);

    const outcome = startWithRecovery({
      view,
      createApplication: () => pending.promise,
      canRetryCreationFailure: () => true,
      startApplication,
      reload: vi.fn(),
    });
    expect(view.showOpening).toHaveBeenCalledOnce();
    expect(startApplication).not.toHaveBeenCalled();

    pending.resolve(application);
    await expect(outcome).resolves.toBe("ready");
    expect(startApplication).toHaveBeenCalledWith(application);
    expect(application.close).not.toHaveBeenCalled();
    expect(view.showReady).toHaveBeenCalledOnce();
    expect(view.showFailure).not.toHaveBeenCalled();
  });

  it("offers one guarded reload after a factory failure without exposing its detail", async () => {
    const view = fakeView();
    const reload = vi.fn();
    const secret = "private/native/path/from-plugin";

    await expect(startWithRecovery({
      view,
      createApplication: async () => { throw new Error(secret); },
      canRetryCreationFailure: () => true,
      startApplication: vi.fn(),
      reload,
    })).resolves.toBe("retryable-failure");

    expect(view.showFailure).toHaveBeenCalledWith(expect.any(Function));
    expect(JSON.stringify(vi.mocked(view.showFailure).mock.calls)).not.toContain(secret);
    const retry = vi.mocked(view.showFailure).mock.calls[0]?.[0];
    expect(retry).toEqual(expect.any(Function));
    retry?.();
    retry?.();
    expect(view.showReloading).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("closes a constructed application before making reload available", async () => {
    const close = deferred<void>();
    const application = { close: vi.fn(() => close.promise) };
    const view = fakeView();
    const outcome = startWithRecovery({
      view,
      createApplication: async () => application,
      canRetryCreationFailure: () => true,
      startApplication: async () => { throw new Error("workspace read failed"); },
      reload: vi.fn(),
    });

    await vi.waitFor(() => expect(view.showCleanup).toHaveBeenCalledOnce());
    expect(application.close).toHaveBeenCalledOnce();
    expect(view.showFailure).not.toHaveBeenCalled();
    close.resolve();

    await expect(outcome).resolves.toBe("retryable-failure");
    expect(view.showFailure).toHaveBeenCalledWith(expect.any(Function));
  });

  it("requires a full app restart when teardown cannot be confirmed", async () => {
    const application = {
      close: vi.fn(async () => { throw new Error("native close failed"); }),
    };
    const view = fakeView();
    const reload = vi.fn();

    await expect(startWithRecovery({
      view,
      createApplication: async () => application,
      canRetryCreationFailure: () => true,
      startApplication: async () => { throw new Error("workspace read failed"); },
      reload,
    })).resolves.toBe("restart-required");

    expect(view.showFailure).toHaveBeenCalledWith(null);
    expect(view.showReloading).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("withholds reload when application creation cannot confirm native cleanup", async () => {
    const view = fakeView();
    const reload = vi.fn();
    const cleanupUncertain = new Error("native cleanup was not confirmed");

    await expect(startWithRecovery({
      view,
      createApplication: async () => { throw cleanupUncertain; },
      canRetryCreationFailure: (failure) => failure !== cleanupUncertain,
      startApplication: vi.fn(),
      reload,
    })).resolves.toBe("restart-required");

    expect(view.showFailure).toHaveBeenCalledWith(null);
    expect(view.showReloading).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("renders semantic loading and privacy-safe recovery templates", () => {
    expect(sourceHtml).toContain('data-startup-state="opening" aria-busy="true"');
    expect(sourceHtml).toContain('data-startup-view="opening"');
    expect(startupOpeningView()).toContain('role="status"');
    expect(startupOpeningView()).toContain("Checking local journal storage");
    const retryable = startupFailureView(true);
    expect(retryable).toContain('role="alert"');
    expect(retryable).toContain('id="startup-error-title" tabindex="-1"');
    expect(retryable).toContain("Try opening again");
    expect(retryable).toContain("No fallback journal was opened");
    const restart = startupFailureView(false);
    expect(restart).not.toContain('id="startup-retry"');
    expect(restart).toContain("Fully close Hermes");
  });
});
