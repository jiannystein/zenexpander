import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "client");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

test("release contains the static app and bookmarklet bridge", async () => {
  for (const relative of [
    "index.html",
    "zenexpander-bookmarklet.txt",
    "zenexpander-bridge.html",
    "zenexpander-bridge.js",
    "zenexpander-bridge-worker.js",
    "zenexpander-leaf.png",
  ]) {
    assert.equal(await exists(path.join(output, relative)), true, `Missing ${relative}`);
  }

  assert.equal(await exists(path.join(root, "dist", "server")), false, "Server output must not ship");
  assert.equal(await exists(path.join(root, "dist", ".openai")), false, "Prototype hosting metadata must not ship");
  assert.equal(await exists(path.join(output, "dynamics-editor-lab.html")), false, "Test-only Dynamics fixture must not ship");
  assert.equal(await exists(path.join(root, "public", "zenexpander-bookmarklet.min.js")), false, "Intermediate bundle must stay out of public assets");
});

test("release uses subpath-safe assets and stays within the bookmarklet budget", async () => {
  const html = await readFile(path.join(output, "index.html"), "utf8");
  assert.match(html, /(?:src|href)="\.\/assets\//, "Vite assets must be relative for GitHub Pages");
  assert.match(html, /rel="icon"[^>]+href="\.\/zenexpander-leaf\.png"/, "Leaf favicon must be subpath-safe");
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "Root-relative assets break repository Pages sites");

  const bookmarklet = (await readFile(path.join(output, "zenexpander-bookmarklet.txt"), "utf8")).trim();
  assert.match(bookmarklet, /^javascript:/);
  assert.ok(Buffer.byteLength(bookmarklet, "utf8") <= 32 * 1024, "Bookmarklet exceeds 32 KiB");
});

test("release text contains no local paths, personal identifiers, or prototype hosts", async () => {
  const files = (await listFiles(output)).filter((file) => /\.(?:css|html|js|json|map|txt)$/i.test(file));
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const releaseText = contents.join("\n");
  for (const forbidden of [
    /C:\\Users\\/i,
    /OneDrive\s*-/i,
    /Wenjian\s+Khor/i,
    /\bJabil\b/i,
    /terminal\.local/i,
    /localhost:\d+/i,
    /\.openai\/hosting\.json/i,
  ]) {
    assert.doesNotMatch(releaseText, forbidden);
  }
});
