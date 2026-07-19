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
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function requireReportNodeRuntime() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supported = (
    (major === 22 && minor >= 16)
    || (major === 23 && minor >= 11)
    || major >= 24
  );
  if (!supported) {
    throw new Error(
      "Portable report builds require Node >=22.16.0, >=23.11.0, or >=24.0.0 "
      + "for the fail-closed SQLite gate.",
    );
  }
}

requireReportNodeRuntime();
const { DatabaseSync } = await import("node:sqlite");

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
// Data Analytics 0.2.8 has two audited narrow-layout hazards in this report:
// the 100vw full-bleed top bar and unbroken portable-markdown text. Patch only
// those exact runtime rules in memory; never modify the installed plugin or
// the canonical artifact payload.
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
      `Expected one known ${label} rule, found ${matches}; re-audit before building.`,
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
  const portableMarkdownPatched = replaceExactly(
    patched,
    ".portable-markdown{max-width:820px}",
    ".portable-markdown{max-width:820px;overflow-wrap:anywhere}",
    "semantic-fallback portable-markdown",
  );
  if (portableMarkdownPatched.includes("width:100vw")) {
    throw new Error(
      "A 100vw rule remains after the audited top-bar patches; re-audit before building.",
    );
  }
  return portableMarkdownPatched;
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

function resolveArtifactSource(inputPath, sourcePath) {
  let cursor = dirname(inputPath);
  while (true) {
    const candidate = resolve(cursor, sourcePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new Error(`Artifact source path does not exist: ${sourcePath}`);
}

function canonicalSqlTokens(sql) {
  const tokens = [];
  let token = "";
  const flush = () => {
    if (token.length > 0) tokens.push(token);
    token = "";
  };

  for (let index = 0; index < sql.length;) {
    const character = sql[index];
    const next = sql[index + 1];
    if (character === "-" && next === "-") {
      flush();
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (character === "'") {
      flush();
      let literal = "'";
      index += 1;
      let closed = false;
      while (index < sql.length) {
        const literalCharacter = sql[index];
        literal += literalCharacter;
        index += 1;
        if (literalCharacter !== "'") continue;
        if (sql[index] === "'") {
          literal += "'";
          index += 1;
          continue;
        }
        closed = true;
        break;
      }
      if (!closed) throw new Error("A portable SQL source has an open string literal.");
      tokens.push(literal);
      continue;
    }
    if (/\s/u.test(character)) {
      flush();
      index += 1;
      continue;
    }
    if (character === "(" || character === ")" || character === "," || character === ";") {
      flush();
      tokens.push(character);
      index += 1;
      continue;
    }
    token += character;
    index += 1;
  }
  flush();
  return tokens.join(" ");
}

function executePortableSql(sql, sourceId) {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA query_only = ON;");
    const statement = database.prepare(sql);
    if (statement.columns().length === 0) {
      throw new Error("query returned no result columns");
    }
    return statement.all().map((row) => Object.fromEntries(Object.entries(row)));
  } catch (error) {
    throw new Error(
      `Portable report ${sourceId} SQL could not be executed: ${error.message}`,
    );
  } finally {
    database.close();
  }
}

function assertSqlRows(sourceId, actualRows, expectedRows) {
  if (!Array.isArray(actualRows) || actualRows.length !== expectedRows.length) {
    throw new Error(
      `Portable report ${sourceId} SQL returned the wrong row count.`,
    );
  }
  for (let index = 0; index < expectedRows.length; index += 1) {
    const actual = actualRows[index];
    const expected = expectedRows[index];
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      throw new Error(`Portable report ${sourceId} SQL row ${index + 1} is invalid.`);
    }
    const actualFields = Object.keys(actual);
    const expectedFields = Object.keys(expected);
    if (
      actualFields.length !== expectedFields.length
      || actualFields.some((field, fieldIndex) => field !== expectedFields[fieldIndex])
      || expectedFields.some((field) => actual[field] !== expected[field])
    ) {
      throw new Error(
        `Portable report ${sourceId} SQL row ${index + 1} does not match its dataset.`,
      );
    }
  }
}

function validateSqlLineage(inputPath, artifact) {
  const sourceIds = ["headline-query", "disposition-query", "priority-query"];
  const results = {};
  for (const sourceId of sourceIds) {
    const sources = artifact.sources?.filter((candidate) => candidate.id === sourceId);
    const manifestSources = artifact.manifest?.sources?.filter(
      (candidate) => candidate.id === sourceId,
    );
    if (sources?.length !== 1 || manifestSources?.length !== 1) {
      throw new Error(`Portable report must declare ${sourceId} exactly once per source list.`);
    }
    const [source] = sources;
    const [manifestSource] = manifestSources;
    if (
      typeof source?.path !== "string"
      || typeof source.query?.sql !== "string"
      || manifestSource?.path !== source.path
      || typeof manifestSource.query?.sql !== "string"
    ) {
      throw new Error(`Portable report is missing complete ${sourceId} SQL lineage.`);
    }
    const sourceSql = readFileSync(
      resolveArtifactSource(inputPath, source.path),
      "utf8",
    );
    const canonicalSource = canonicalSqlTokens(sourceSql);
    if (
      canonicalSource !== canonicalSqlTokens(source.query.sql)
      || canonicalSource !== canonicalSqlTokens(manifestSource.query.sql)
    ) {
      throw new Error(
        `Portable report ${sourceId} SQL file and embedded queries do not match.`,
      );
    }
    results[sourceId] = executePortableSql(sourceSql, sourceId);
  }
  return results;
}

function validateLedgerLineage(inputPath) {
  const artifact = JSON.parse(readFileSync(inputPath, "utf8"));
  const sqlResults = validateSqlLineage(inputPath, artifact);
  const ledgerSource = artifact.sources?.find((source) => source.id === "capability-ledger");
  if (typeof ledgerSource?.path !== "string") {
    throw new Error("Portable report is missing its capability-ledger source path.");
  }
  const ledgerPath = resolveArtifactSource(inputPath, ledgerSource.path);
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  if (!Array.isArray(ledger.capabilities)) {
    throw new Error("Capability ledger has no capability array.");
  }
  const ids = ledger.capabilities.map((capability) => capability.id);
  if (
    ids.some((id) => typeof id !== "string" || id.length === 0)
    || new Set(ids).size !== ids.length
  ) {
    throw new Error("Capability ledger IDs must be unique nonempty strings.");
  }

  const allowed = [
    "shipped",
    "prioritize-local",
    "gated-funded",
    "intentional-non-goal",
  ];
  const counts = Object.fromEntries(allowed.map((disposition) => [disposition, 0]));
  for (const capability of ledger.capabilities) {
    if (!allowed.includes(capability.disposition)) {
      throw new Error(`Capability ${capability.id} has an unknown disposition.`);
    }
    counts[capability.disposition] += 1;
  }

  const headline = artifact.snapshot?.datasets?.headline;
  if (!Array.isArray(headline) || headline.length !== 1) {
    throw new Error("Portable report headline dataset must contain exactly one row.");
  }
  const expectedHeadline = {
    domains: ledger.capabilities.length,
    shipped: counts.shipped,
    local_priorities: counts["prioritize-local"],
    gated_or_excluded: counts["gated-funded"] + counts["intentional-non-goal"],
  };
  for (const [field, expected] of Object.entries(expectedHeadline)) {
    if (headline[0]?.[field] !== expected) {
      throw new Error(
        `Portable report headline ${field}=${headline[0]?.[field]} does not match ledger ${expected}.`,
      );
    }
  }
  assertSqlRows("headline-query", sqlResults["headline-query"], [expectedHeadline]);

  const labelToDisposition = {
    "Shipped": "shipped",
    "Prioritize local": "prioritize-local",
    "Gated and funded": "gated-funded",
    "Intentional non-goal": "intentional-non-goal",
  };
  const dispositionRows = artifact.snapshot?.datasets?.disposition_summary;
  if (
    !Array.isArray(dispositionRows)
    || dispositionRows.length !== Object.keys(labelToDisposition).length
  ) {
    throw new Error("Portable report disposition dataset has the wrong row count.");
  }
  for (const [label, disposition] of Object.entries(labelToDisposition)) {
    const matches = dispositionRows.filter((row) => row.disposition === label);
    if (matches.length !== 1 || matches[0].count !== counts[disposition]) {
      throw new Error(`Portable report disposition ${label} does not match the ledger.`);
    }
  }
  assertSqlRows(
    "disposition-query",
    sqlResults["disposition-query"],
    allowed.map((disposition) => ({ disposition, count: counts[disposition] })),
  );

  const priorities = artifact.snapshot?.datasets?.priority_roadmap;
  if (
    !Array.isArray(priorities)
    || priorities.length !== counts["prioritize-local"]
    || priorities.some((row, index) => row.sequence !== index + 1)
  ) {
    throw new Error(
      "Portable report roadmap row count and sequence must match prioritize-local ledger count.",
    );
  }
  assertSqlRows("priority-query", sqlResults["priority-query"], priorities);
  return {
    capabilityDomains: ledger.capabilities.length,
    dispositionCounts: counts,
    priorityRows: priorities.length,
    sqlSources: Object.keys(sqlResults).length,
    sqlResultRows: Object.fromEntries(
      Object.entries(sqlResults).map(([sourceId, rows]) => [sourceId, rows.length]),
    ),
  };
}

try {
  const inputPath = resolve(process.argv[2] ?? "artifact.json");
  const outputPath = resolve(process.argv[3] ?? "report.html");
  const ledgerLineage = validateLedgerLineage(inputPath);
  const result = await deliverPortableArtifact(
    {
      inputPath,
      outputPath,
    },
    { build },
  );
  const semanticFallbackQa = await verifySemanticFallback(outputPath);
  process.stdout.write(
    `${JSON.stringify({ ...result, ledgerLineage, semanticFallbackQa })}\n`,
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
