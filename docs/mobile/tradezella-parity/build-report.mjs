#!/usr/bin/env node

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function resolvePluginRoot() {
  if (process.env.DATA_ANALYTICS_PLUGIN_ROOT) {
    return resolve(process.env.DATA_ANALYTICS_PLUGIN_ROOT);
  }

  const cacheRoot = join(
    homedir(),
    ".codex",
    "plugins",
    "cache",
    "openai-curated-remote",
    "data-analytics",
  );
  const candidates = readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const selected = candidates.find((candidate) =>
    existsSync(join(cacheRoot, candidate, "skills", "build-report", "scripts")));
  if (!selected) {
    throw new Error(
      "No installed Data Analytics plugin was found. Set DATA_ANALYTICS_PLUGIN_ROOT.",
    );
  }
  return join(cacheRoot, selected);
}

const pluginRoot = resolvePluginRoot();
const scripts = join(pluginRoot, "skills", "build-report", "scripts");
const {
  buildPortableArtifact,
  readPackagedReaderRuntime,
} = await import(pathToFileURL(join(scripts, "build_portable_artifact.mjs")).href);
const { deliverPortableArtifact } = await import(
  pathToFileURL(join(scripts, "deliver_portable_artifact.mjs")).href
);
const { resolveChromiumExecutable } = await import(
  pathToFileURL(join(scripts, "portable_browser_helpers.mjs")).href
);
const { chromiumDumpArguments, spawnChromiumDump } = await import(
  pathToFileURL(join(scripts, "portable_browser_cli.mjs")).href
);

const runtime = readPackagedReaderRuntime().html;
// Data Analytics 0.2.8 uses a 100vw full-bleed top bar. In a tall report,
// Chromium's non-overlay vertical scrollbar makes that rule eight pixels wider
// than the document client area. Correct only that audited rule in memory; do
// not modify the installed plugin or the canonical artifact payload.
const unsafeFullBleed = [
  "  width: 100vw;",
  "  height: 48px;",
  "  min-height: 48px;",
  "  margin-right: calc(50% - 50vw);",
  "  margin-left: calc(50% - 50vw);",
].join("\n");
const scrollbarSafeFullBleed = [
  "  width: calc(100% + var(--ds-gutter) + var(--ds-gutter));",
  "  height: 48px;",
  "  min-height: 48px;",
  "  margin-right: calc(0px - var(--ds-gutter));",
  "  margin-left: calc(0px - var(--ds-gutter));",
].join("\n");
const unsafeFallbackFullBleed =
  "width:100vw;height:48px;min-height:48px;" +
  "margin-right:calc(50% - 50vw);margin-left:calc(50% - 50vw);";
const scrollbarSafeFallbackFullBleed =
  "width:calc(100% + 64px);height:48px;min-height:48px;" +
  "margin-right:-32px;margin-left:-32px;";

function replaceExactly(source, unsafe, safe, label) {
  const matches = source.split(unsafe).length - 1;
  if (matches !== 1) {
    throw new Error(
      `Expected one known ${label} top-bar rule, found ${matches}; re-audit before building.`,
    );
  }
  return source.replace(unsafe, safe);
}

const patchedRuntime = replaceExactly(
  runtime,
  unsafeFullBleed,
  scrollbarSafeFullBleed,
  "enhanced-runtime",
);

function patchSemanticFallback(html) {
  const patched = replaceExactly(
    html,
    unsafeFallbackFullBleed,
    scrollbarSafeFallbackFullBleed,
    "semantic-fallback",
  );
  if (patched.includes("width:100vw")) {
    throw new Error(
      "A 100vw rule remains after the audited top-bar patches; re-audit before building.",
    );
  }
  return patched;
}

function fallbackQaError(message) {
  const error = new Error(message);
  error.code = "semantic_fallback_qa_failed";
  return error;
}

function parseFallbackProbe(dom, viewportName) {
  const match = /<meta\b(?=[^>]*\bid="hermes-semantic-fallback-qa")(?=[^>]*\bdata-result="([^"]+)")[^>]*>/i.exec(
    dom,
  );
  if (!match) {
    throw fallbackQaError(
      `Semantic fallback returned no QA result at the ${viewportName} viewport.`,
    );
  }
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch (error) {
    throw fallbackQaError(
      `Semantic fallback returned an unreadable QA result at the ${viewportName} viewport: ${error.message}`,
    );
  }
}

async function verifySemanticFallback(outputPath) {
  const html = readFileSync(outputPath, "utf8");
  const scriptCount = html.match(/<script\b/gi)?.length ?? 0;
  if (scriptCount === 0) {
    throw fallbackQaError("Portable report has no scripts to remove for fallback QA.");
  }
  const semanticOnly = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const executablePath = resolveChromiumExecutable();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-report-fallback-"));
  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const results = [];

  try {
    for (const viewport of viewports) {
      const probe = `<script data-hermes-semantic-fallback-qa>
(() => {
  const fallback = document.querySelector("[data-portable-fallback]");
  const root = document.documentElement;
  const result = {
    viewport: ${JSON.stringify(viewport.name)},
    visible: fallback instanceof HTMLElement &&
      getComputedStyle(fallback).display !== "none",
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
  };
  const meta = document.createElement("meta");
  meta.id = "hermes-semantic-fallback-qa";
  meta.dataset.result = encodeURIComponent(JSON.stringify(result));
  document.head.append(meta);
})();
</script>`;
      const instrumented = semanticOnly.replace("</body>", `${probe}\n</body>`);
      if (instrumented === semanticOnly) {
        throw fallbackQaError("Portable report has no body close for fallback QA.");
      }
      const htmlPath = join(temporaryDirectory, `${viewport.name}.html`);
      writeFileSync(htmlPath, instrumented, "utf8");
      const browserResult = await spawnChromiumDump({
        arguments: chromiumDumpArguments({
          ...viewport,
          profilePath: join(temporaryDirectory, `profile-${viewport.name}`),
          url: pathToFileURL(htmlPath).href,
          virtualTimeBudgetMs: 750,
        }),
        executablePath,
        timeoutMs: 10_000,
      });
      const result = parseFallbackProbe(browserResult.stdout, viewport.name);
      if (!result.visible) {
        throw fallbackQaError(
          `Semantic fallback was not visible at the ${viewport.name} viewport.`,
        );
      }
      if (result.scrollWidth > result.clientWidth + 1) {
        throw fallbackQaError(
          `Semantic fallback overflowed at the ${viewport.name} viewport: ` +
          `${result.scrollWidth}px scroll width > ${result.clientWidth}px client width.`,
        );
      }
      results.push(result);
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }

  return {
    ok: true,
    scriptsRemoved: scriptCount,
    viewports: results,
  };
}

const build = (input, options = {}) => {
  const html = buildPortableArtifact(input, {
    ...options,
    runtimeHtml: patchedRuntime,
  });
  return patchSemanticFallback(html);
};

try {
  const outputPath = resolve(process.argv[3] ?? "report.html");
  const result = await deliverPortableArtifact(
    {
      inputPath: resolve(process.argv[2] ?? "artifact.json"),
      outputPath,
    },
    { build },
  );
  const semanticFallbackQa = await verifySemanticFallback(outputPath);
  process.stdout.write(
    `${JSON.stringify({ ...result, semanticFallbackQa })}\n`,
  );
} catch (error) {
  const result = error?.deliveryResult ?? {
    ok: false,
    stage: "invocation",
    code: error?.code ?? "invalid_invocation",
    error: error?.message ?? String(error),
  };
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 1;
}
