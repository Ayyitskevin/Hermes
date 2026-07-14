import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_APP_ID = "app.hermesjournal.mobile";
const EXPECTED_APP_NAME = "Hermes Journal";
const EXPECTED_WEB_DIR = "dist-mobile";
const EXPECTED_PUBLIC_EXTRAS = new Set(["cordova.js", "cordova_plugins.js"]);

function fail(message) {
  throw new Error("iOS sync evidence failed: " + message);
}

function listFiles(root, prefix = "") {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    fail("missing directory " + root);
  }
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = prefix.length === 0
        ? entry.name
        : prefix + "/" + entry.name;
      return entry.isDirectory()
        ? listFiles(join(root, entry.name), relativePath)
        : [relativePath];
    })
    .sort();
}

function digestFiles(root, paths) {
  const digest = createHash("sha256");
  for (const relativePath of paths) {
    digest.update(relativePath);
    digest.update("\0");
    digest.update(readFileSync(join(root, ...relativePath.split("/"))));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function readGeneratedConfig(configPath) {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    fail("generated Capacitor config is missing or invalid JSON");
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    fail("generated Capacitor config must be an object");
  }
  return config;
}

function exactStrings(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

export function verifyIosSync({
  webDir,
  nativePublicDir,
  generatedConfigPath,
}) {
  const webFiles = listFiles(webDir);
  if (webFiles.length === 0) fail("production web bundle is empty");
  const nativeFiles = listFiles(nativePublicDir);

  for (const relativePath of webFiles) {
    const source = readFileSync(join(webDir, ...relativePath.split("/")));
    const destinationPath = join(nativePublicDir, ...relativePath.split("/"));
    if (!existsSync(destinationPath)) {
      fail("copied bundle is missing " + relativePath);
    }
    const destination = readFileSync(destinationPath);
    if (!source.equals(destination)) {
      fail("copied bundle differs at " + relativePath);
    }
  }

  const webSet = new Set(webFiles);
  const unexpectedExtras = nativeFiles.filter((relativePath) => (
    !webSet.has(relativePath) && !EXPECTED_PUBLIC_EXTRAS.has(relativePath)
  ));
  if (unexpectedExtras.length > 0) {
    fail("unexpected generated public assets: " + unexpectedExtras.join(", "));
  }

  const config = readGeneratedConfig(generatedConfigPath);
  if (Object.hasOwn(config, "server")) {
    fail("generated Capacitor config contains a remote server boundary");
  }
  if (config.appId !== EXPECTED_APP_ID || config.appName !== EXPECTED_APP_NAME) {
    fail("generated Capacitor app identity does not match the provisional native contract");
  }
  if (config.webDir !== EXPECTED_WEB_DIR) {
    fail("generated Capacitor webDir is not " + EXPECTED_WEB_DIR);
  }
  if (!exactStrings(config.packageClassList, ["CapacitorSQLitePlugin"])) {
    fail("generated native plugin registration is not exactly CapacitorSQLitePlugin");
  }
  const pluginNames = config.plugins !== null && typeof config.plugins === "object"
    ? Object.keys(config.plugins).sort()
    : [];
  if (!exactStrings(pluginNames, ["CapacitorSQLite"])) {
    fail("generated plugin configuration contains an unexpected plugin");
  }
  const sqlite = config.plugins.CapacitorSQLite;
  if (
    sqlite === null
    || typeof sqlite !== "object"
    || sqlite.iosDatabaseLocation !== "Documents"
    || sqlite.iosIsEncryption !== true
    || sqlite.iosKeychainPrefix !== EXPECTED_APP_ID
  ) {
    fail("generated SQLite registration does not match the encrypted iOS contract");
  }

  return {
    bundleDigest: digestFiles(webDir, webFiles),
    bundleFileCount: webFiles.length,
    generatedPublicExtras: nativeFiles.filter((path) => !webSet.has(path)),
  };
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail("tracked repository drift check failed"
      + (result.stdout.length > 0 ? ": " + result.stdout.trim() : "")
      + (result.stderr.length > 0 ? ": " + result.stderr.trim() : ""));
  }
  return result.stdout.trim();
}

export function verifyTrackedNativeDrift(repoRoot) {
  runGit(repoRoot, [
    "diff",
    "--exit-code",
    "--",
    "mobile/ios",
    "mobile/package-lock.json",
  ]);
  const status = runGit(repoRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    "mobile/ios",
    "mobile/package-lock.json",
  ]);
  if (status.length > 0) {
    fail("tracked or untracked native/lock drift remains: " + status);
  }
}

export function iosHandoffReport(evidence, platform = process.platform) {
  return [
    "### Hermes pre-native iOS handoff evidence",
    "",
    "| Evidence | Result | Scope |",
    "|---|---|---|",
    "| TypeScript production bundle | PASS | " + evidence.bundleFileCount + " files; SHA-256 " + evidence.bundleDigest + " |",
    "| Bundle copied into iOS public assets | PASS | Every production file matched byte-for-byte |",
    "| Generated Capacitor identity / SQLite registration | PASS | Registration evidence only; not plugin runtime evidence |",
    "| Tracked native and lockfile drift | PASS | Git diff/status were clean at verification |",
    "| CocoaPods resolution / native dependency compile | NOT RUN | Requires the reviewed Mac handoff |",
    "| Xcode build / Simulator / physical iPhone | NOT RUN | Requires current Xcode and recorded device evidence |",
    "| SQLCipher / Keychain / lifecycle / VoiceOver / Dynamic Type | NOT RUN | Requires Mac/iPhone acceptance |",
    "",
    "- Host platform: " + platform + ".",
    "- Capacitor-only public additions: "
      + (evidence.generatedPublicExtras.length === 0
        ? "none"
        : evidence.generatedPublicExtras.join(", "))
      + ".",
    "- A PASS above proves pre-native bundle/config/copy contracts only. It is not native readiness.",
  ].join("\n");
}

function main() {
  const mobileRoot = process.cwd();
  const repoRoot = resolve(mobileRoot, "..");
  const evidence = verifyIosSync({
    webDir: resolve(mobileRoot, "dist-mobile"),
    nativePublicDir: resolve(mobileRoot, "ios/App/App/public"),
    generatedConfigPath: resolve(mobileRoot, "ios/App/App/capacitor.config.json"),
  });
  verifyTrackedNativeDrift(repoRoot);
  const report = iosHandoffReport(evidence);
  process.stdout.write(report + "\n");
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath.length > 0) {
    appendFileSync(summaryPath, report + "\n", "utf8");
  }
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
