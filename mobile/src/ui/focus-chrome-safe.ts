/** Focuses a rebuilt inline destination without leaving it behind sticky app chrome. */
export function focusChromeSafeElement(
  root: HTMLElement,
  target: HTMLElement,
  block: "start" | "nearest" = "start",
): void {
  const screenStack = target.closest<HTMLElement>(".screen-stack");
  if (screenStack !== null) {
    // A focused destination must not keep moving after its geometry is measured.
    screenStack.style.animation = "none";
  }
  const topbar = root.querySelector<HTMLElement>(".topbar");
  const topbarRect = topbar?.getBoundingClientRect();
  const topbarPosition = topbar === null
    ? "static"
    : window.getComputedStyle(topbar).position;
  const topBoundary = (
    (topbarPosition === "sticky" || topbarPosition === "fixed")
    && topbarRect !== undefined
    && topbarRect.bottom > 0
  ) ? topbarRect.bottom : 0;
  const tabbar = root.querySelector<HTMLElement>(".tabbar");
  const tabbarRect = tabbar?.getBoundingClientRect();
  const tabbarPosition = tabbar === null
    ? "static"
    : window.getComputedStyle(tabbar).position;
  const bottomBoundary = (
    (tabbarPosition === "sticky" || tabbarPosition === "fixed")
    && tabbarRect !== undefined
    && tabbarRect.top < window.innerHeight
  ) ? tabbarRect.top : window.innerHeight;
  const margin = 12;
  const minimumTop = topBoundary + margin;
  const maximumBottom = bottomBoundary - margin;
  target.style.scrollMarginTop = `${Math.ceil(minimumTop)}px`;
  target.style.scrollMarginBottom = `${Math.ceil(Math.max(0, window.innerHeight - maximumBottom))}px`;
  target.scrollIntoView({ behavior: "auto", block });
  const rect = target.getBoundingClientRect();
  const availableHeight = Math.max(0, maximumBottom - minimumTop);
  const desiredTop = rect.height > availableHeight || block === "start"
    ? minimumTop
    : Math.min(Math.max(rect.top, minimumTop), maximumBottom - rect.height);
  const delta = rect.top - desiredTop;
  if (Math.abs(delta) > 1) {
    window.scrollBy({ top: delta, left: 0, behavior: "auto" });
  }
  target.focus({ preventScroll: true });
}
