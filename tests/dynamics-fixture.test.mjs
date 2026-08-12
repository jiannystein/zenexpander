import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("Dynamics editor lab covers primary fields and browser boundary cases", async () => {
  const lab = await readFile(path.join(root, "tests", "fixtures", "dynamics-editor-lab.html"), "utf8");
  for (const marker of [
    'data-case="description"',
    'data-case="timeline-comment"',
    'id="internal-notes-frame"',
    'id="sandboxed-notes-frame"',
    'data-case="controlled-input"',
    'data-case="plain-contenteditable"',
    'data-case="open-shadow"',
    'data-case="closed-shadow"',
  ]) assert.match(lab, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(lab, /sandbox="allow-scripts"/);
  assert.match(lab, /attachShadow\(\{ mode \}\)/);
  assert.match(lab, /host-revert/);
  assert.match(lab, /window\.__dynamicsLab/);
});

test("Dynamics fixtures are local, data-minimizing, and non-submitting", async () => {
  const files = await Promise.all([
    readFile(path.join(root, "tests", "fixtures", "dynamics-editor-lab.html"), "utf8"),
    readFile(path.join(root, "tests", "fixtures", "dynamics-editor-frame.html"), "utf8"),
  ]);
  const source = files.join("\n");
  assert.doesNotMatch(source, /<form\b/i);
  assert.doesNotMatch(source, /\.submit\s*\(|requestSubmit|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.match(source, /Field contents are never logged/);
  assert.match(source, /nothing saves or sends/);
});

test("bookmarklet covers reachable embedded editors and keeps blocked insertion visible", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.match(runtime, /event\.composedPath\(\)\.find\(isEditable\)/);
  assert.match(runtime, /frame\.contentDocument/);
  assert.match(runtime, /MutationObserver/);
  assert.match(runtime, /target\?\.ownerDocument/);
  assert.match(runtime, /function viewportRect/);
  assert.match(runtime, /if \(this\.inserting\)/);
  assert.match(runtime, /this\.pendingInputTarget = target/);
  assert.match(runtime, /this\.notice = "This editor blocked direct insertion/);
  assert.match(runtime, /this\.open\(false\)/);
});
