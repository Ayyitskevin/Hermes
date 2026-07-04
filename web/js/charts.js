// Hand-rolled SVG charts following the dataviz method: thin marks, recessive
// grids, hover crosshair + tooltip, and a keyboard scrubber (range input)
// mirroring the hover readout — no hover-only information.

import { esc, fmtTime } from "./util.js";

const NS = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, text = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== null) node.textContent = text;
  return node;
}

// ── Regime strip — the signature element ─────────────────────────────────
// A strip-chart recorder: classifier states as lanes, one stepped ink trace
// jumping between lanes on regime flips (identity by POSITION — CVD-proof by
// construction), behind it a Course Magenta confidence ribbon whose height
// tracks the classifier's confidence bar by bar.

export const LANES = [
  { key: "bull_trend", label: "BULL" },
  { key: "chop", label: "RANGE" },
  { key: "bear_trend", label: "BEAR" },
  { key: "stress", label: "STRESS" },
];

export function regimeStrip(container, history, { headWidth = 0 } = {}) {
  container.textContent = "";
  const width = Math.max(container.clientWidth || 600, 320);
  const H = 92, gutter = 66, padR = 10 + headWidth;
  const laneY = { bull_trend: 16, chop: 38, bear_trend: 60, stress: 82 };
  const svg = el("svg", {
    class: "strip-svg", viewBox: `0 0 ${width} ${H}`, width, height: H,
    role: "img",
    "aria-label": history.length
      ? `Regime history, ${history.length} readings, latest ${history[history.length - 1].label}`
      : "No regime history yet",
  });

  for (const lane of LANES) {
    const y = laneY[lane.key];
    svg.appendChild(el("line", { class: "lane-rule", x1: gutter, y1: y, x2: width - padR, y2: y }));
    svg.appendChild(el("text", { class: "lane-label", x: 4, y: y + 3 }, lane.label));
  }

  if (history.length >= 2) {
    const x0 = gutter + 6, x1 = width - padR - 4;
    const n = history.length;
    const xAt = (i) => x0 + (i * (x1 - x0)) / (n - 1);

    // Confidence ribbon (closed path around the trace)
    const top = [], bottom = [];
    history.forEach((h, i) => {
      const y = laneY[h.label] ?? laneY.chop;
      const half = 3 + (h.confidence ?? 0) * 8;
      top.push(`${i ? "L" : "M"}${xAt(i).toFixed(1)},${(y - half).toFixed(1)}`);
      bottom.push(`L${xAt(n - 1 - i).toFixed(1)},${(laneY[history[n - 1 - i].label] ?? laneY.chop) + 3 + (history[n - 1 - i].confidence ?? 0) * 8}`);
    });
    svg.appendChild(el("path", { class: "ribbon", d: top.join("") + bottom.join("") + "Z" }));

    // Stepped ink trace
    let d = "";
    history.forEach((h, i) => {
      const x = xAt(i), y = laneY[h.label] ?? laneY.chop;
      if (i === 0) d += `M${x.toFixed(1)},${y}`;
      else {
        const prevY = laneY[history[i - 1].label] ?? laneY.chop;
        if (prevY !== y) d += `L${x.toFixed(1)},${prevY}L${x.toFixed(1)},${y}`;
        else d += `L${x.toFixed(1)},${y}`;
      }
    });
    svg.appendChild(el("path", { class: "trace", d }));

    attachScrub(container, svg, history, xAt, (h) =>
      `${fmtTime(h.ts).slice(0, 10)} · ${h.label.replace("_", " ")} · conf ${(h.confidence ?? 0).toFixed(2)}`);
    return svg;
  }

  if (history.length === 1) {
    // A single reading: one honest dot on its lane, ringed by confidence.
    const h = history[0];
    const y = laneY[h.label] ?? laneY.chop;
    const x = gutter + 24;
    svg.appendChild(el("circle", {
      class: "ribbon", cx: x, cy: y, r: 3 + (h.confidence ?? 0) * 8,
    }));
    svg.appendChild(el("circle", { cx: x, cy: y, r: 4, fill: "var(--ink)" }));
    svg.appendChild(el("text", {
      class: "lane-label", x: x + 14, y: y + 3,
    }, `${fmtTime(h.ts).slice(0, 10)} — history accrues one reading per day`));
  } else {
    svg.appendChild(el("text", {
      class: "lane-label", x: gutter + 14, y: 44,
    }, "no readings yet — run the daily check; history accrues one reading per day"));
  }
  container.appendChild(svg);
  return svg;
}

// ── Price chart with regime tape glued to the same x-scale ──────────────
export function priceChart(container, series, regimeByDate = {}) {
  container.textContent = "";
  if (!series || series.length < 2) {
    container.innerHTML = `<p class="micro">no bar history cached — run a sync</p>`;
    return;
  }
  const width = Math.max(container.clientWidth || 600, 320);
  const H = 240, padL = 8, padR = 58, padT = 10, plotH = 190, tapeY = plotH + 16, tapeH = 12;
  const closes = series.map((p) => p.c);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const span = hi - lo || 1;
  const x0 = padL, x1 = width - padR;
  const xAt = (i) => x0 + (i * (x1 - x0)) / (series.length - 1);
  const yAt = (v) => padT + (plotH - padT) * (1 - (v - lo) / span);

  const svg = el("svg", {
    class: "chart-svg", viewBox: `0 0 ${width} ${H}`, width, height: H,
    role: "img", "aria-label": `Price history, ${series.length} daily bars`,
  });

  // Recessive grid: three hairlines + value labels (skip a grid label that
  // would collide with the bold last-price label)
  const lastY = yAt(series[series.length - 1].c);
  for (const frac of [0, 0.5, 1]) {
    const v = lo + span * frac, y = yAt(v);
    svg.appendChild(el("line", { class: "grid-line", x1: x0, y1: y, x2: x1, y2: y }));
    if (Math.abs(y - lastY) > 12) {
      svg.appendChild(el("text", { class: "axis-text", x: x1 + 6, y: y + 3 }, v.toFixed(0)));
    }
  }

  const d = series.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p.c).toFixed(1)}`).join("");
  svg.appendChild(el("path", { class: "price-line", d }));

  // Last-price direct label
  const last = series[series.length - 1];
  svg.appendChild(el("text", {
    class: "axis-text", x: x1 + 6, y: yAt(last.c) + 3, "font-weight": "700",
  }, last.c.toFixed(2)));

  // Regime tape: constant-gray cells (identity by lightness, outlined),
  // sharing the price x-scale — regime history glued to price history.
  const GRAY = { bull_trend: "var(--rg-bull)", chop: "var(--rg-chop)",
                 bear_trend: "var(--rg-bear)", stress: "var(--rg-stress)" };
  const cellW = (x1 - x0) / (series.length - 1);
  let tapeAny = false;
  series.forEach((p, i) => {
    const label = regimeByDate[p.t.slice(0, 10)];
    if (!label) return;
    tapeAny = true;
    svg.appendChild(el("rect", {
      x: (xAt(i) - cellW / 2).toFixed(1), y: tapeY, width: Math.max(cellW, 1).toFixed(1),
      height: tapeH, fill: GRAY[label] ?? "var(--rg-chop)", class: "tape-cell-outline",
    }));
  });
  svg.appendChild(el("text", { class: "axis-text", x: x0, y: tapeY + tapeH + 11 },
    tapeAny ? "regime tape (same x-scale)" : "regime tape: no readings for this window yet"));

  attachScrub(container, svg, series, xAt, (p) => {
    const label = regimeByDate[p.t.slice(0, 10)];
    return `${p.t.slice(0, 10)} · close ${p.c.toFixed(2)}${label ? " · " + label.replace("_", " ") : ""}`;
  }, { yTop: padT, yBottom: tapeY + tapeH });
}

// ── Sparkline ────────────────────────────────────────────────────────────
export function sparkline(values, w = 110, h = 26) {
  if (!values || values.length < 2) return `<span class="micro">no data</span>`;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) =>
    `${i ? "L" : "M"}${((i * (w - 4)) / (values.length - 1) + 2).toFixed(1)},${(2 + (h - 4) * (1 - (v - lo) / span)).toFixed(1)}`);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${pts.join("")}"/></svg>`;
}

// ── Shared hover + keyboard scrub layer ──────────────────────────────────
function attachScrub(container, svg, items, xAt, describe, opts = {}) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  container.appendChild(wrap);
  wrap.appendChild(svg);

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  wrap.appendChild(tip);

  const vb = svg.viewBox.baseVal;
  const cross = el("line", {
    class: "crosshair", y1: opts.yTop ?? 8, y2: opts.yBottom ?? vb.height - 8, x1: 0, x2: 0,
  });
  cross.setAttribute("visibility", "hidden");
  svg.appendChild(cross);

  const show = (i, clientX = null) => {
    const item = items[i];
    if (!item) return;
    const x = xAt(i);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x);
    cross.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = describe(item);
    const rect = wrap.getBoundingClientRect();
    const px = clientX !== null ? clientX - rect.left : (x / vb.width) * rect.width;
    tip.style.left = `${Math.min(Math.max(px + 8, 0), rect.width - tip.offsetWidth - 4)}px`;
    tip.style.top = "4px";
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; };

  svg.addEventListener("pointermove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const xView = ((ev.clientX - rect.left) / rect.width) * vb.width;
    let best = 0, bestD = Infinity;
    items.forEach((_, i) => {
      const d = Math.abs(xAt(i) - xView);
      if (d < bestD) { bestD = d; best = i; }
    });
    show(best, ev.clientX);
  });
  svg.addEventListener("pointerleave", hide);

  // Keyboard path: a visible range scrubber mirroring the hover readout.
  if (items.length >= 2) {
    const scrub = document.createElement("input");
    scrub.type = "range";
    scrub.className = "scrub";
    scrub.min = 0; scrub.max = items.length - 1; scrub.value = items.length - 1;
    scrub.setAttribute("aria-label", "Scrub history; readout appears above the chart");
    scrub.setAttribute("aria-valuetext", describe(items[items.length - 1]));
    scrub.addEventListener("input", () => {
      const i = Number(scrub.value);
      show(i);
      scrub.setAttribute("aria-valuetext", describe(items[i]));
    });
    scrub.addEventListener("blur", hide);
    container.appendChild(scrub);
  }
}

export { esc };
