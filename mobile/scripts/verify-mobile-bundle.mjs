import {
  existsSync,
  lstatSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_JAVASCRIPT_CHUNK_BYTES = 500_000;

function fail(message) {
  throw new Error("Mobile bundle size verification failed: " + message);
}

function listJavaScriptChunks(root, prefix = "") {
  if (!existsSync(root)) {
    fail("missing production bundle directory " + root);
  }
  const rootStatus = lstatSync(root);
  if (rootStatus.isSymbolicLink()) {
    fail("production bundle directory is a symbolic link at " + (prefix || root));
  }
  if (!rootStatus.isDirectory()) fail("production bundle path is not a directory " + root);
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = prefix.length === 0
        ? entry.name
        : prefix + "/" + entry.name;
      const absolutePath = join(root, entry.name);
      if (entry.isSymbolicLink()) {
        fail("production bundle contains a symbolic link at " + relativePath);
      }
      if (entry.isDirectory()) {
        return listJavaScriptChunks(absolutePath, relativePath);
      }
      if (!entry.isFile() || !/\.(?:c|m)?js$/u.test(entry.name)) return [];
      return [{ relativePath, bytes: statSync(absolutePath).size }];
    });
}

export function verifyMobileBundle({
  webDir,
  maxChunkBytes = MAX_JAVASCRIPT_CHUNK_BYTES,
}) {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes <= 0) {
    fail("maxChunkBytes must be a positive safe integer");
  }
  const chunks = listJavaScriptChunks(webDir)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (chunks.length === 0) fail("production bundle contains no JavaScript chunks");
  const oversized = chunks.filter((chunk) => chunk.bytes > maxChunkBytes);
  if (oversized.length > 0) {
    fail("JavaScript chunks exceed " + maxChunkBytes + " bytes: "
      + oversized.map((chunk) => chunk.relativePath + " (" + chunk.bytes + ")").join(", "));
  }
  const largest = chunks.reduce((current, candidate) => (
    candidate.bytes > current.bytes ? candidate : current
  ));
  return {
    chunkCount: chunks.length,
    largestChunk: largest.relativePath,
    largestChunkBytes: largest.bytes,
    maxChunkBytes,
  };
}

function main() {
  const evidence = verifyMobileBundle({
    webDir: resolve(process.cwd(), "dist-mobile"),
  });
  process.stdout.write(
    "Mobile bundle size verification passed: "
      + evidence.chunkCount
      + " JavaScript chunks; largest "
      + evidence.largestChunk
      + " ("
      + evidence.largestChunkBytes
      + "/"
      + evidence.maxChunkBytes
      + " bytes).\n",
  );
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
