import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  MAX_JAVASCRIPT_CHUNK_BYTES,
  verifyMobileBundle,
} from "./verify-mobile-bundle.mjs";

let root;

function write(relativePath, bytes) {
  const target = join(root, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, Buffer.alloc(bytes));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hermes-mobile-bundle-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("accepts nested JavaScript chunks at or below the size contract", () => {
  write("assets/entry.js", 20);
  write("assets/lazy/app.js", MAX_JAVASCRIPT_CHUNK_BYTES);
  write("assets/font.ttf", MAX_JAVASCRIPT_CHUNK_BYTES + 1);

  assert.deepEqual(verifyMobileBundle({ webDir: root }), {
    chunkCount: 2,
    largestChunk: "assets/lazy/app.js",
    largestChunkBytes: MAX_JAVASCRIPT_CHUNK_BYTES,
    maxChunkBytes: MAX_JAVASCRIPT_CHUNK_BYTES,
  });
});

test("rejects an oversized JavaScript chunk with any emitted module extension", () => {
  write("assets/entry.js", 20);
  write("assets/lazy/app.mjs", MAX_JAVASCRIPT_CHUNK_BYTES + 1);
  assert.throws(
    () => verifyMobileBundle({ webDir: root }),
    /assets\/lazy\/app\.mjs \(500001\)/u,
  );
});

test("rejects a bundle with no JavaScript chunks", () => {
  write("index.html", 20);
  assert.throws(
    () => verifyMobileBundle({ webDir: root }),
    /contains no JavaScript chunks/u,
  );
});

test("rejects symbolic links instead of traversing outside the bundle", () => {
  write("target.txt", 10);
  symlinkSync(join(root, "target.txt"), join(root, "linked.js"));
  assert.throws(
    () => verifyMobileBundle({ webDir: root }),
    /symbolic link at linked\.js/u,
  );
});

test("rejects a symbolic link used as the bundle root", () => {
  write("real-bundle/entry.js", 20);
  const linkedRoot = join(root, "linked-bundle");
  symlinkSync(join(root, "real-bundle"), linkedRoot);
  assert.throws(
    () => verifyMobileBundle({ webDir: linkedRoot }),
    /bundle directory is a symbolic link/u,
  );
});

test("rejects invalid custom limits", () => {
  write("entry.js", 1);
  for (const maxChunkBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => verifyMobileBundle({ webDir: root, maxChunkBytes }),
      /positive safe integer/u,
    );
  }
});
