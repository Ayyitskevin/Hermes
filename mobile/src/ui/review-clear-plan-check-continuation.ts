import {
  buildReviewClearPlanCheckContinuation,
  REVIEW_CLEAR_PLAN_CHECK_TARGET_ID,
  type ReviewClearPlanCheckContinuation,
} from "../application/review-clear-plan-check-continuation";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { focusChromeSafeElement } from "./focus-chrome-safe";
import { focusReportSection, reportsView } from "./reports-view";

export interface ReviewClearPlanCheckContinuationActions {
  readonly open: (continuation: ReviewClearPlanCheckContinuation) => void;
  readonly fail: (continuation: ReviewClearPlanCheckContinuation) => void;
}

const reviewClearBindings = new WeakMap<HTMLElement, AbortController>();

interface BoundOriginStructure {
  readonly screen: HTMLElement;
  readonly layers: readonly Readonly<{
    readonly parent: HTMLElement;
    readonly child: Element;
    readonly index: number;
    readonly previous: Element | null;
    readonly next: Element | null;
  }>[];
}

const DISPLACED_REVIEW_CLEAR_SELECTOR = [
  "[data-dashboard-review-progress]",
  "[data-review-queue]",
  "[data-review-clear-plan-check-origin]",
  "[data-review-clear-plan-check]",
  "[data-review-clear-plan-check-error]",
  "[data-plan-check]",
  `#${REVIEW_CLEAR_PLAN_CHECK_TARGET_ID}`,
  ".plan-check-meta",
  ".plan-check-groups",
  ".plan-check-disclosure",
  "[data-plan-check-group]",
  "[data-plan-check-evidence-list]",
  "[data-plan-check-showing]",
  "[data-plan-check-more]",
].join(", ");

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function validateContinuation(continuation: ReviewClearPlanCheckContinuation): void {
  if (
    (continuation.origin !== "dashboard" && continuation.origin !== "journal")
    || !Number.isSafeInteger(continuation.completedTradeCount)
    || continuation.completedTradeCount < 1
    || continuation.reportTargetId !== REVIEW_CLEAR_PLAN_CHECK_TARGET_ID
  ) {
    throw new Error("The review-clear Plan Check continuation is invalid.");
  }
}

export function reviewClearPlanCheckAction(
  continuation: ReviewClearPlanCheckContinuation,
): string {
  validateContinuation(continuation);
  const completed = countNoun(
    continuation.completedTradeCount,
    "completed reviewed trade",
  );
  return `<button class="secondary-button" type="button" data-review-clear-plan-check="${continuation.origin}" data-review-clear-completed="${continuation.completedTradeCount}" data-review-clear-report-target="${continuation.reportTargetId}" aria-label="Open Plan Check for ${completed}">Open plan check</button>`;
}

export function reviewClearPlanCheckFailure(
  continuation: ReviewClearPlanCheckContinuation,
): string {
  validateContinuation(continuation);
  return `<p class="form-error review-clear-plan-check-error" data-review-clear-plan-check-error="${continuation.origin}" role="alert" tabindex="-1" hidden></p>`;
}

export function clearReviewClearPlanCheckContinuationBinding(root: HTMLElement): void {
  reviewClearBindings.get(root)?.abort();
  reviewClearBindings.delete(root);
}

export function removeDisplacedReviewClearPlanCheckArtifacts(root: HTMLElement): void {
  const screen = root.querySelector<HTMLElement>("#screen");
  root.querySelectorAll<HTMLElement>(DISPLACED_REVIEW_CLEAR_SELECTOR)
    .forEach((artifact) => {
      if (screen === null || !screen.contains(artifact)) artifact.remove();
    });
}

function isRenderedElement(element: HTMLElement, checkOpacity = true): boolean {
  if (
    !element.isConnected
    || element.closest('[hidden], [inert], [aria-hidden="true"]') !== null
  ) return false;
  let current: HTMLElement | null = element;
  while (current !== null) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || (checkOpacity && Number.parseFloat(style.opacity) === 0)
      || style.contentVisibility === "hidden"
    ) return false;
    current = current.parentElement;
  }
  return element.getClientRects().length > 0;
}

function isVisibleWithinChrome(root: HTMLElement, element: HTMLElement): boolean {
  if (!isRenderedElement(element)) return false;
  const bounds = element.getBoundingClientRect();
  const topbar = root.querySelector<HTMLElement>(".topbar");
  const tabbar = root.querySelector<HTMLElement>(".tabbar");
  const topbarBounds = topbar?.getBoundingClientRect();
  const tabbarBounds = tabbar?.getBoundingClientRect();
  const topbarPosition = topbar === null ? "static" : window.getComputedStyle(topbar).position;
  const tabbarPosition = tabbar === null ? "static" : window.getComputedStyle(tabbar).position;
  const topBoundary = (
    (topbarPosition === "fixed" || topbarPosition === "sticky")
    && topbarBounds !== undefined
    && topbarBounds.bottom > 0
  ) ? topbarBounds.bottom : 0;
  const bottomBoundary = (
    (tabbarPosition === "fixed" || tabbarPosition === "sticky")
    && tabbarBounds !== undefined
    && tabbarBounds.top < window.innerHeight
  ) ? tabbarBounds.top : window.innerHeight;
  if (
    bounds.width <= 0
    || bounds.height <= 0
    || bounds.left < 0
    || bounds.right > window.innerWidth
    || bounds.top < topBoundary
    || bounds.bottom > bottomBoundary
  ) return false;
  const centerX = Math.min(window.innerWidth - 1, Math.max(0, bounds.left + bounds.width / 2));
  const centerY = Math.min(
    window.innerHeight - 1,
    Math.max(0, bounds.top + bounds.height / 2),
  );
  return root.ownerDocument.elementsFromPoint(centerX, centerY)
    .some((candidate) => candidate === element || element.contains(candidate));
}

function captureBoundOriginStructure(
  root: HTMLElement,
  button: HTMLButtonElement,
): BoundOriginStructure | null {
  const screens = Array.from(root.querySelectorAll<HTMLElement>("#screen"));
  const screen = screens[0];
  if (screens.length !== 1 || screen === undefined || !screen.contains(button)) return null;
  const layers: Array<Readonly<{
    readonly parent: HTMLElement;
    readonly child: Element;
    readonly index: number;
    readonly previous: Element | null;
    readonly next: Element | null;
  }>> = [];
  let child: Element = button;
  while (child !== screen) {
    const parent = child.parentElement;
    if (parent === null) return null;
    layers.push(Object.freeze({
      parent,
      child,
      index: Array.from(parent.children).indexOf(child),
      previous: child.previousElementSibling,
      next: child.nextElementSibling,
    }));
    child = parent;
  }
  return Object.freeze({ screen, layers: Object.freeze(layers) });
}

function boundOriginStructureMatches(
  root: HTMLElement,
  structure: BoundOriginStructure,
): boolean {
  const screens = Array.from(root.querySelectorAll<HTMLElement>("#screen"));
  if (screens.length !== 1 || screens[0] !== structure.screen) return false;
  return structure.layers.every((layer) => {
    if (!layer.parent.isConnected || layer.child.parentElement !== layer.parent) return false;
    const current = Array.from(layer.parent.children);
    return current.indexOf(layer.child) === layer.index
      && layer.child.previousElementSibling === layer.previous
      && layer.child.nextElementSibling === layer.next;
  });
}

function normalizedPlanCheckHtml(section: HTMLElement): string | null {
  const comparable = section.cloneNode(true) as HTMLElement;
  const title = comparable.querySelector<HTMLElement>(
    `#${REVIEW_CLEAR_PLAN_CHECK_TARGET_ID}`,
  );
  if (title === null) return null;
  title.style.removeProperty("scroll-margin-top");
  if (title.getAttribute("style")?.trim() === "") title.removeAttribute("style");
  return comparable.outerHTML;
}

function continuationMatches(
  snapshot: JournalWorkspaceSnapshot,
  continuation: ReviewClearPlanCheckContinuation,
): boolean {
  try {
    const current = buildReviewClearPlanCheckContinuation(snapshot, continuation.origin);
    return current !== null
      && current.origin === continuation.origin
      && current.completedTradeCount === continuation.completedTradeCount
      && current.reportTargetId === continuation.reportTargetId;
  } catch {
    return false;
  }
}

function dashboardStructureMatches(
  root: HTMLElement,
  button: HTMLButtonElement,
  error: HTMLElement,
): boolean {
  const cards = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-review-progress]",
  ));
  const headings = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-review-progress-title]",
  ));
  const origins = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-review-clear-plan-check-origin="dashboard"]',
  ));
  const reviewActions = Array.from(root.querySelectorAll<HTMLButtonElement>(
    'button[data-trade-review-origin="dashboard-review-progress"]',
  ));
  const card = cards[0];
  const heading = headings[0];
  const origin = origins[0];
  const screen = root.querySelector<HTMLElement>("#screen");
  const stack = screen?.firstElementChild;
  const actions = card === undefined
    ? null
    : card.querySelector<HTMLElement>(".review-progress-actions");
  const sessionEvidence = actions === null
    ? null
    : actions.querySelector<HTMLButtonElement>(
      'button[data-route="reports"][data-report-target="review-session-coverage-title"]',
    );
  return cards.length === 1
    && headings.length === 1
    && origins.length === 1
    && reviewActions.length === 0
    && card !== undefined
    && heading !== undefined
    && origin === card
    && stack instanceof HTMLElement
    && stack.classList.contains("screen-stack")
    && stack.getAttribute("aria-labelledby") === "dashboard-title"
    && card.parentElement === stack
    && card.previousElementSibling?.matches("[data-dashboard-net-result]") === true
    && card.nextElementSibling?.matches("[data-dashboard-import-continuation]") === true
    && card.dataset.dashboardReviewProgress === "clear"
    && card.dataset.dashboardReviewSubject === undefined
    && heading.id === "dashboard-review-progress-title"
    && heading.dataset.dashboardReviewProgressTitle === "clear"
    && heading.dataset.dashboardReviewSubject === undefined
    && card.contains(heading)
    && actions !== null
    && actions.children.length === 2
    && actions.children[0] === button
    && actions.children[1] === sessionEvidence
    && button.parentElement === actions
    && sessionEvidence !== null
    && !sessionEvidence.disabled
    && error.parentElement === card
    && error.previousElementSibling === actions;
}

function journalStructureMatches(
  root: HTMLElement,
  button: HTMLButtonElement,
  error: HTMLElement,
): boolean {
  const queues = Array.from(root.querySelectorAll<HTMLElement>("[data-review-queue]"));
  const queueTitles = Array.from(root.querySelectorAll<HTMLElement>("#review-queue-title"));
  const clearTitles = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-review-queue-clear-title]",
  ));
  const origins = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-review-clear-plan-check-origin="journal"]',
  ));
  const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-review-queue-group]"));
  const quickReviews = Array.from(root.querySelectorAll<HTMLElement>("[data-quick-review]"));
  const batchForms = Array.from(root.querySelectorAll<HTMLElement>("#batch-review-form"));
  const queue = queues[0];
  const queueTitle = queueTitles[0];
  const clearTitle = clearTitles[0];
  const origin = origins[0];
  const screen = root.querySelector<HTMLElement>("#screen");
  const stack = screen?.firstElementChild;
  const actions = origin === undefined
    ? null
    : origin.querySelector<HTMLElement>(".quick-actions");
  return queues.length === 1
    && queueTitles.length === 1
    && clearTitles.length === 1
    && origins.length === 1
    && groups.length === 0
    && quickReviews.length === 0
    && batchForms.length === 0
    && queue !== undefined
    && queueTitle !== undefined
    && clearTitle !== undefined
    && origin !== undefined
    && stack instanceof HTMLElement
    && stack.classList.contains("screen-stack")
    && stack.getAttribute("aria-labelledby") === "journal-title"
    && queue.parentElement === stack
    && queue.previousElementSibling?.matches(".review-queue-summary") === true
    && queue.nextElementSibling?.matches("[data-daily-reflection-rhythm]") === true
    && queue.dataset.reviewQueueWaiting === "0"
    && queue.contains(queueTitle)
    && origin.parentElement === queue
    && clearTitle.id === "review-queue-clear-title"
    && clearTitle.parentElement === origin
    && actions !== null
    && actions.children.length === 1
    && actions.firstElementChild === button
    && button.parentElement === actions
    && error.parentElement === origin
    && error.previousElementSibling === actions;
}

function triggerMatches(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  continuation: ReviewClearPlanCheckContinuation,
  button: HTMLButtonElement,
  requireVisible = true,
): boolean {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-review-clear-plan-check]",
  ));
  const errors = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-review-clear-plan-check-error]",
  ));
  const error = errors[0];
  const visible = !requireVisible || isVisibleWithinChrome(root, button);
  if (
    buttons.length !== 1
    || buttons[0] !== button
    || errors.length !== 1
    || error === undefined
    || !visible
    || button.disabled
    || button.dataset.reviewClearPlanCheck !== continuation.origin
    || button.dataset.reviewClearCompleted !== String(continuation.completedTradeCount)
    || button.dataset.reviewClearReportTarget !== continuation.reportTargetId
    || error.dataset.reviewClearPlanCheckError !== continuation.origin
    || !continuationMatches(snapshot, continuation)
  ) {
    return false;
  }
  return continuation.origin === "dashboard"
    ? dashboardStructureMatches(root, button, error)
    : journalStructureMatches(root, button, error);
}

export function bindReviewClearPlanCheckContinuation(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  continuation: ReviewClearPlanCheckContinuation,
  actions: ReviewClearPlanCheckContinuationActions,
): void {
  clearReviewClearPlanCheckContinuationBinding(root);
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-review-clear-plan-check]",
  ));
  const button = buttons[0];
  if (
    buttons.length !== 1
    || button === undefined
    || !triggerMatches(root, snapshot, continuation, button, false)
  ) {
    throw new Error("The review-clear Plan Check continuation structure is inconsistent.");
  }
  const binding = new AbortController();
  reviewClearBindings.set(root, binding);
  let boundStructure: BoundOriginStructure | null = null;
  queueMicrotask(() => {
    if (
      binding.signal.aborted
      || !triggerMatches(root, snapshot, continuation, button, false)
    ) return;
    boundStructure = captureBoundOriginStructure(root, button);
  });
  let activating = false;
  root.addEventListener("click", (event) => {
    const eventTarget = event.target;
    const trigger = eventTarget instanceof Element
      ? eventTarget.closest<HTMLButtonElement>("button")
      : null;
    if (
      trigger === null
      || (
        trigger !== button
        && !trigger.hasAttribute("data-review-clear-plan-check")
      )
    ) return;
    if (activating) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activating = true;
    button.closest<HTMLElement>(".screen-stack")?.style.setProperty("animation", "none");
    if (
      trigger !== button
      || boundStructure === null
      || !boundOriginStructureMatches(root, boundStructure)
      || !triggerMatches(root, snapshot, continuation, button)
    ) {
      actions.fail(continuation);
      return;
    }
    try {
      actions.open(continuation);
    } catch {
      actions.fail(continuation);
    }
  }, { capture: true, signal: binding.signal });
}

function exactPlanCheckDestination(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  requireVisibleWithinChrome = false,
): HTMLElement | null {
  const screens = Array.from(root.querySelectorAll<HTMLElement>("#screen"));
  const reportTitles = Array.from(root.querySelectorAll<HTMLElement>("#reports-title"));
  const planSections = Array.from(root.querySelectorAll<HTMLElement>("[data-plan-check]"));
  const planTitles = Array.from(root.querySelectorAll<HTMLElement>(
    `#${REVIEW_CLEAR_PLAN_CHECK_TARGET_ID}`,
  ));
  const screen = screens[0];
  const stack = screen?.firstElementChild;
  const screenHeading = stack?.firstElementChild;
  const reportsTitle = reportTitles[0];
  const planSection = planSections[0];
  const planTitle = planTitles[0];
  const sectionTitles = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check] > .section-title",
  ));
  const metadata = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check] > .plan-check-meta",
  ));
  const groupShells = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check] > .plan-check-groups",
  ));
  const disclosures = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check] > .plan-check-disclosure",
  ));
  const groups = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check-group]",
  ));
  const evidenceLists = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check-evidence-list]",
  ));
  const showingStatuses = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-plan-check-showing]",
  ));
  const moreActions = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-plan-check-more]",
  ));
  const sectionTitle = sectionTitles[0];
  const metadataList = metadata[0];
  const groupShell = groupShells[0];
  const disclosure = disclosures[0];
  let expectedPlanCheckHtml: string;
  let expectedPlanIndex: number;
  let expectedStackChildCount: number;
  try {
    const template = root.ownerDocument.createElement("template");
    template.innerHTML = reportsView(snapshot);
    const expectedStack = template.content.querySelector<HTMLElement>(".screen-stack");
    const expectedSections = template.content.querySelectorAll<HTMLElement>(
      "[data-plan-check]",
    );
    const expectedSection = expectedSections[0];
    if (
      expectedStack === null
      || expectedSections.length !== 1
      || expectedSection === undefined
      || expectedSection.parentElement !== expectedStack
    ) return null;
    const normalized = normalizedPlanCheckHtml(expectedSection);
    if (normalized === null) return null;
    expectedPlanCheckHtml = normalized;
    expectedPlanIndex = Array.from(expectedStack.children).indexOf(expectedSection);
    expectedStackChildCount = expectedStack.children.length;
  } catch {
    return null;
  }
  const expectedGroups = ["followed", "broken"] as const;
  const completeGroups = expectedGroups.every((classification, index) => {
    const group = groups[index];
    const evidenceList = evidenceLists[index];
    const showingStatus = showingStatuses[index];
    const moreAction = moreActions[index];
    const body = group?.querySelector<HTMLElement>(":scope > .plan-check-group-body");
    return group !== undefined
      && evidenceList !== undefined
      && showingStatus !== undefined
      && moreAction !== undefined
      && group.dataset.planCheckGroup === classification
      && group.parentElement === groupShell
      && group.querySelectorAll(":scope > summary").length === 1
      && body !== null
      && evidenceList.dataset.planCheckEvidenceList === classification
      && evidenceList.id === `plan-check-evidence-${classification}`
      && evidenceList.parentElement === body
      && showingStatus.dataset.planCheckShowing === classification
      && showingStatus.parentElement === body
      && moreAction.dataset.planCheckMore === classification
      && moreAction.getAttribute("aria-controls") === evidenceList.id
      && moreAction.parentElement === body;
  });
  if (
    screens.length !== 1
    || reportTitles.length !== 1
    || planSections.length !== 1
    || planTitles.length !== 1
    || sectionTitles.length !== 1
    || metadata.length !== 1
    || groupShells.length !== 1
    || disclosures.length !== 1
    || groups.length !== 2
    || evidenceLists.length !== 2
    || showingStatuses.length !== 2
    || moreActions.length !== 2
    || screen === undefined
    || !(stack instanceof HTMLElement)
    || !stack.classList.contains("screen-stack")
    || stack.getAttribute("aria-labelledby") !== "reports-title"
    || !(screenHeading instanceof HTMLElement)
    || !screenHeading.classList.contains("screen-heading")
    || reportsTitle === undefined
    || !screenHeading.contains(reportsTitle)
    || planSection === undefined
    || planTitle === undefined
    || sectionTitle === undefined
    || metadataList === undefined
    || groupShell === undefined
    || disclosure === undefined
    || planSection.parentElement !== stack
    || stack.children.length !== expectedStackChildCount
    || Array.from(stack.children).indexOf(planSection) !== expectedPlanIndex
    || planSection.previousElementSibling?.matches("[data-opening-weekday-mix]") !== true
    || planSection.nextElementSibling?.matches("[data-mistake-patterns]") !== true
    || planSection.getAttribute("aria-labelledby") !== REVIEW_CLEAR_PLAN_CHECK_TARGET_ID
    || planSection.children.length !== 5
    || planSection.children[0] !== sectionTitle
    || planSection.children[1]?.tagName !== "P"
    || planSection.children[2] !== metadataList
    || planSection.children[3] !== groupShell
    || planSection.children[4] !== disclosure
    || metadataList.children.length !== 9
    || groupShell.children.length !== 2
    || !completeGroups
    || !sectionTitle.contains(planTitle)
    || normalizedPlanCheckHtml(planSection) !== expectedPlanCheckHtml
    || planTitle.id !== REVIEW_CLEAR_PLAN_CHECK_TARGET_ID
    || planTitle.textContent?.trim() !== "Plan check"
    || planTitle.tabIndex !== -1
    || !planTitle.classList.contains("report-target")
    || !isRenderedElement(planTitle, requireVisibleWithinChrome)
    || (requireVisibleWithinChrome && !isVisibleWithinChrome(root, planTitle))
  ) return null;
  return planTitle;
}

export function focusReviewClearPlanCheckDestination(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const target = exactPlanCheckDestination(root, snapshot);
  if (target === null) {
    throw new Error("The exact Plan Check destination is unavailable.");
  }
  const stack = root.querySelector<HTMLElement>("#screen > .screen-stack");
  if (stack === null) {
    throw new Error("The exact Plan Check screen is unavailable.");
  }
  stack.style.animation = "none";
  focusReportSection(root, REVIEW_CLEAR_PLAN_CHECK_TARGET_ID);
  const confirmed = exactPlanCheckDestination(root, snapshot, true);
  if (confirmed !== target || root.ownerDocument.activeElement !== target) {
    throw new Error("The exact Plan Check destination changed during focus.");
  }
}

export function showReviewClearPlanCheckFailure(
  root: HTMLElement,
  continuation: ReviewClearPlanCheckContinuation,
): void {
  const errors = Array.from(root.querySelectorAll<HTMLElement>(
    `[data-review-clear-plan-check-error="${continuation.origin}"]`,
  ));
  const error = errors[0];
  if (errors.length !== 1 || error === undefined) {
    throw new Error("The review-clear Plan Check failure target is unavailable.");
  }
  error.hidden = false;
  error.textContent = "Hermes could not open the exact Plan Check continuation. Your journal did not change.";
  focusChromeSafeElement(root, error);
}
