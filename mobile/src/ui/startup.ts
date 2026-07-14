export interface StartupApplication {
  close(): Promise<void>;
}

export interface StartupView {
  showOpening(): void;
  showCleanup(): void;
  showFailure(retry: (() => void) | null): void;
  showReloading(): void;
  showReady(): void;
}

interface StartupDependencies<TApplication extends StartupApplication> {
  readonly view: StartupView;
  readonly createApplication: () => Promise<TApplication>;
  readonly canRetryCreationFailure: (failure: unknown) => boolean;
  readonly startApplication: (application: TApplication) => Promise<void>;
  readonly reload: () => void;
}

export type StartupOutcome = "ready" | "retryable-failure" | "restart-required";

export function startupOpeningView(
  phase: "opening" | "cleanup" = "opening",
): string {
  const title = phase === "opening"
    ? "Opening Hermes Journal"
    : "Hermes couldn’t finish opening";
  const status = phase === "opening"
    ? "Checking local journal storage and journal integrity."
    : "Closing the incomplete journal connection before recovery is offered.";
  return '<main class="startup-screen" data-startup-view="opening" aria-labelledby="startup-title">'
    + '<section class="card startup-card">'
    + '<p class="eyebrow">PRIVATE LOCAL JOURNAL</p>'
    + '<h1 id="startup-title">' + title + '</h1>'
    + '<p id="startup-status" class="startup-status" role="status" aria-live="polite" aria-atomic="true">'
    + status
    + '</p></section></main>';
}

export function startupFailureView(canRetry: boolean): string {
  const recovery = canRetry
    ? '<button class="primary-button" id="startup-retry" type="button">Try opening again</button>'
      + '<p id="startup-retry-status" class="startup-status" role="status" aria-live="polite" aria-atomic="true"></p>'
    : '<p class="startup-guidance">Hermes could not close the incomplete journal connection safely. Fully close Hermes, then open it again. Do not clear app data or reinstall the app.</p>';
  return '<main class="startup-screen" data-startup-view="failure" aria-labelledby="startup-error-title" aria-describedby="startup-error-copy">'
    + '<section class="card startup-card startup-failure">'
    + '<p class="eyebrow">LOCAL JOURNAL UNAVAILABLE</p>'
    + '<h1 id="startup-error-title" tabindex="-1">Hermes couldn’t open your journal</h1>'
    + '<p id="startup-error-copy" class="startup-error" role="alert">Hermes stopped before journal actions became available. No fallback journal was opened, and Hermes did not display the technical failure detail.</p>'
    + '<p class="startup-guidance">Opening may have completed a safe local migration. Do not clear app data or reinstall Hermes.</p>'
    + recovery
    + '</section></main>';
}

export function createStartupView(root: HTMLElement): StartupView {
  const setState = (state: string, busy: boolean) => {
    root.dataset.startupState = state;
    root.setAttribute("aria-busy", String(busy));
  };

  return {
    showOpening() {
      document.body.classList.remove("modal-open");
      setState("opening", true);
      if (root.querySelector('[data-startup-view="opening"]') === null) {
        root.innerHTML = startupOpeningView();
      }
    },
    showCleanup() {
      document.body.classList.remove("modal-open");
      setState("closing-incomplete-startup", true);
      root.innerHTML = startupOpeningView("cleanup");
    },
    showFailure(retry) {
      document.body.classList.remove("modal-open");
      root.innerHTML = startupFailureView(retry !== null);
      setState(retry === null ? "restart-required" : "failed", false);
      root.querySelector<HTMLElement>("#startup-error-title")?.focus({ preventScroll: true });
      if (retry === null) return;
      const button = root.querySelector<HTMLButtonElement>("#startup-retry");
      button?.addEventListener("click", () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = "Opening again…";
        retry();
      });
    },
    showReloading() {
      setState("reloading", false);
      const status = root.querySelector<HTMLElement>("#startup-retry-status");
      if (status !== null) status.textContent = "Reloading Hermes and checking the same local journal again.";
    },
    showReady() {
      setState("ready", false);
      root.removeAttribute("aria-busy");
      const active = document.activeElement;
      if (!(active instanceof HTMLElement && root.contains(active))) {
        root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
      }
    },
  };
}

export async function startWithRecovery<TApplication extends StartupApplication>({
  view,
  createApplication,
  canRetryCreationFailure,
  startApplication,
  reload,
}: StartupDependencies<TApplication>): Promise<StartupOutcome> {
  view.showOpening();
  let application: TApplication | null = null;
  let retryable = true;
  try {
    application = await createApplication();
    await startApplication(application);
    view.showReady();
    return "ready";
  } catch (failure) {
    if (application === null) retryable = canRetryCreationFailure(failure);
    view.showCleanup();
  }

  if (application !== null) {
    try {
      await application.close();
    } catch {
      retryable = false;
    }
  }

  let reloadRequested = false;
  const retry = retryable
    ? () => {
      if (reloadRequested) return;
      reloadRequested = true;
      view.showReloading();
      reload();
    }
    : null;
  view.showFailure(retry);
  return retryable ? "retryable-failure" : "restart-required";
}
