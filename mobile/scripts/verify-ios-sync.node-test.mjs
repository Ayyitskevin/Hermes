import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";

import {
  iosHandoffReport,
  verifyIosSync,
  verifyTrackedNativeDrift,
} from "./verify-ios-sync.mjs";

let root;
let webDir;
let nativePublicDir;
let generatedConfigPath;

function write(relativeRoot, relativePath, contents) {
  const target = join(relativeRoot, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function validConfig(overrides = {}) {
  return {
    appId: "app.hermesjournal.mobile",
    appName: "Hermes Journal",
    webDir: "dist-mobile",
    plugins: {
      CapacitorSQLite: {
        iosDatabaseLocation: "Documents",
        iosIsEncryption: true,
        iosKeychainPrefix: "app.hermesjournal.mobile",
      },
    },
    packageClassList: ["CapacitorSQLitePlugin"],
    ...overrides,
  };
}

function sqliteConfig(overrides = {}) {
  return {
    iosDatabaseLocation: "Documents",
    iosIsEncryption: true,
    iosKeychainPrefix: "app.hermesjournal.mobile",
    ...overrides,
  };
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stdout}${result.stderr}`,
  );
}

function createCleanRepository() {
  const repoRoot = join(root, "repo");
  write(repoRoot, "mobile/package-lock.json", "locked\n");
  write(repoRoot, "mobile/ios/App/AppDelegate.swift", "baseline\n");
  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["add", "."]);
  runGit(repoRoot, [
    "-c",
    "user.name=Hermes Test",
    "-c",
    "user.email=hermes-test@example.invalid",
    "commit",
    "-m",
    "baseline",
  ]);
  return repoRoot;
}

function verify() {
  return verifyIosSync({ webDir, nativePublicDir, generatedConfigPath });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hermes-ios-sync-"));
  webDir = join(root, "dist-mobile");
  nativePublicDir = join(root, "ios-public");
  generatedConfigPath = join(root, "capacitor.config.json");
  write(webDir, "index.html", "<main>Hermes</main>");
  write(webDir, "assets/app.js", "console.log('local bundle');");
  write(nativePublicDir, "index.html", "<main>Hermes</main>");
  write(nativePublicDir, "assets/app.js", "console.log('local bundle');");
  write(nativePublicDir, "cordova.js", "");
  write(nativePublicDir, "cordova_plugins.js", "");
  writeFileSync(generatedConfigPath, JSON.stringify(validConfig()));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("verifies byte-identical bundle copy and keeps native rows NOT RUN", () => {
  const evidence = verify();
  assert.equal(evidence.bundleFileCount, 2);
  assert.match(evidence.bundleDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(evidence.generatedPublicExtras, ["cordova.js", "cordova_plugins.js"]);
  const report = iosHandoffReport(evidence, "linux");
  assert.match(report, /Bundle copied into iOS public assets \| PASS/u);
  for (const gate of [
    "CocoaPods resolution / native dependency compile",
    "Xcode build / Simulator / physical iPhone",
    "SQLCipher / Keychain / lifecycle / VoiceOver / Dynamic Type",
  ]) {
    assert.match(report, new RegExp(`\\| ${gate.replaceAll("/", "\\/")} \\| NOT RUN \\|`, "u"));
    assert.doesNotMatch(report, new RegExp(`\\| ${gate.replaceAll("/", "\\/")} \\| PASS \\|`, "u"));
  }
});

test("rejects a missing or changed copied asset", () => {
  write(nativePublicDir, "assets/app.js", "changed");
  assert.throws(() => verify(), /copied bundle differs at assets\/app\.js/u);
  rmSync(join(nativePublicDir, "assets/app.js"));
  assert.throws(() => verify(), /copied bundle is missing assets\/app\.js/u);
});

test("rejects unexpected generated public assets", () => {
  write(nativePublicDir, "unexpected.js", "unexpected");
  assert.throws(() => verify(), /unexpected generated public assets: unexpected\.js/u);
});

test("rejects a remote server or unexpected plugin registration", () => {
  writeFileSync(generatedConfigPath, JSON.stringify(validConfig({
    server: { url: "https://example.invalid" },
  })));
  assert.throws(() => verify(), /remote server boundary/u);
  writeFileSync(generatedConfigPath, JSON.stringify(validConfig({
    plugins: {
      CapacitorSQLite: validConfig().plugins.CapacitorSQLite,
      UnexpectedPlugin: {},
    },
  })));
  assert.throws(() => verify(), /unexpected plugin/u);
});

test("rejects every selected generated-config contract mismatch", () => {
  const invalidConfigs = [
    [validConfig({ appId: "app.example.wrong" }), /app identity/u],
    [validConfig({ appName: "Wrong Name" }), /app identity/u],
    [validConfig({ webDir: "remote-bundle" }), /webDir/u],
    [validConfig({ packageClassList: [] }), /native plugin registration/u],
    [validConfig({ plugins: { CapacitorSQLite: sqliteConfig({ iosIsEncryption: false }) } }), /encrypted iOS contract/u],
    [validConfig({ plugins: { CapacitorSQLite: sqliteConfig({ iosKeychainPrefix: "wrong.prefix" }) } }), /encrypted iOS contract/u],
    [validConfig({ plugins: { CapacitorSQLite: sqliteConfig({ iosDatabaseLocation: "Library" }) } }), /encrypted iOS contract/u],
  ];
  for (const [config, pattern] of invalidConfigs) {
    writeFileSync(generatedConfigPath, JSON.stringify(config));
    assert.throws(() => verify(), pattern);
  }
  writeFileSync(generatedConfigPath, "{not-json");
  assert.throws(() => verify(), /missing or invalid JSON/u);
});

test("rejects unstaged native or lockfile drift", () => {
  const repoRoot = createCleanRepository();
  write(repoRoot, "mobile/package-lock.json", "changed\n");
  assert.throws(() => verifyTrackedNativeDrift(repoRoot), /repository drift check failed/u);
});

test("rejects staged native or lockfile drift", () => {
  const repoRoot = createCleanRepository();
  write(repoRoot, "mobile/ios/App/AppDelegate.swift", "staged change\n");
  runGit(repoRoot, ["add", "mobile/ios/App/AppDelegate.swift"]);
  assert.throws(() => verifyTrackedNativeDrift(repoRoot), /native\/lock drift remains/u);
});

test("rejects untracked native or lockfile drift", () => {
  const repoRoot = createCleanRepository();
  write(repoRoot, "mobile/ios/App/Podfile.lock", "untracked\n");
  assert.throws(() => verifyTrackedNativeDrift(repoRoot), /native\/lock drift remains/u);
});
