import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");

test("built bookmarklet stays within budget and keeps pairing placeholders", async () => {
  const bookmarklet = (await readFile(path.join(root, "public", "zenexpander-bookmarklet.txt"), "utf8")).trim();
  assert.equal(bookmarklet.startsWith("javascript:"), true);
  assert.equal((bookmarklet.match(/__ZENEXPANDER_PAIRING_TOKEN__/g) ?? []).length, 1);
  assert.equal((bookmarklet.match(/__ZENEXPANDER_BRIDGE_URL__/g) ?? []).length, 1);
  const distributed = bookmarklet
    .replace("__ZENEXPANDER_PAIRING_TOKEN__", "a".repeat(64))
    .replace("__ZENEXPANDER_BRIDGE_URL__", encodeURIComponent("https://example.github.io/ZenExpander/zenexpander-bridge.html"));
  assert.ok(Buffer.byteLength(distributed, "utf8") <= 32 * 1024);
  assert.doesNotThrow(() => new vm.Script(decodeURI(distributed.slice("javascript:".length))));
  assert.match(decodeURI(distributed), /data:image\/png;base64,/);
});

test("bridge is data-only and avoids timer-based false disconnects", async () => {
  const worker = await readFile(path.join(root, "public", "zenexpander-bridge-worker.js"), "utf8");
  assert.doesNotMatch(worker, /HEARTBEAT_TTL/);
  assert.doesNotMatch(worker, /configurator-closed/);
  assert.match(worker, /config-unavailable/);
  assert.match(worker, /room\.config/);
  assert.doesNotMatch(worker, /\bfetch\s*\(/);
  assert.doesNotMatch(worker, /\beval\s*\(/);
  assert.doesNotMatch(worker, /new Function/);
});

test("runtime includes sensitive-field guards and never sends forms", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.match(runtime, /type === "password"/);
  assert.match(runtime, /one-time-code/);
  assert.equal(runtime.includes("credit.?card"), true);
  assert.doesNotMatch(runtime, /\.submit\s*\(/);
  assert.doesNotMatch(runtime, /requestSubmit/);
});

test("runtime avoids Trusted Types-blocked HTML sinks used by Google Chat", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.doesNotMatch(runtime, /\.innerHTML\s*=/);
  assert.match(runtime, /replaceChildren/);
  assert.match(runtime, /createElement/);
});

test("runtime keeps prefix filtering stable and positions away from the editor", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.match(runtime, /this\.query = String\(query\)/);
  assert.match(runtime, /this\.renderResults\(this\.query\)/);
  assert.match(runtime, /aboveSpace >= belowSpace/);
  assert.match(runtime, /rect\.top - gap - height/);
  assert.match(runtime, /rect\.bottom \+ gap/);
  assert.match(runtime, /rect\.right - width/);
  assert.match(runtime, /innerHeight - edge - height/);
  assert.match(runtime, /\.body\{min-height:0;overflow:auto/);
});

test("runtime uses the paired leaf launcher and lets Escape close every popup state", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.match(runtime, /import LEAF_ICON/);
  assert.match(runtime, /launcherLogo\.src = LEAF_ICON/);
  assert.match(runtime, /document\.createTextNode\(" to close"\)/);
  const keyHandler = runtime.slice(runtime.indexOf("handleKeydown(event) {"), runtime.indexOf("handleInput(event) {"));
  assert.ok(keyHandler.indexOf('event.key === "Escape"') < keyHandler.indexOf("if (this.choice) {"));
});

test("choice popup uses one primary action and exposes safe Escape and Enter shortcuts", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.doesNotMatch(runtime, /textContent = "Back"/);
  assert.match(runtime, /aria-keyshortcuts", "Enter"/);
  assert.match(runtime, /enterKey\.textContent = "Enter"/);
  assert.match(runtime, /event\.composedPath\(\).*HTMLSelectElement/);
  assert.match(runtime, /this\.confirmChoice\?\.\(\)/);
});

test("configurator groups shortcut hints and mirrors the single choice action", async () => {
  const app = await readFile(path.join(root, "src", "App.jsx"), "utf8");
  const styles = await readFile(path.join(root, "src", "styles.css"), "utf8");
  assert.match(app, /className="shortcut-hint"/);
  assert.match(app, /<kbd aria-hidden="true">Esc<\/kbd><span>to close<\/span>/);
  assert.match(app, /<span>Confirm & paste<\/span><kbd aria-hidden="true">Enter<\/kbd>/);
  assert.doesNotMatch(app, />Back<\/button>/);
  assert.match(app, /event\.target instanceof HTMLSelectElement/);
  assert.match(styles, /\.command-meta \{ display: flex; justify-content: flex-end;/);
  assert.match(styles, /\.button-shortcut kbd/);
});

test("choice editor supports consistent chips, field renaming, independent disclosure, and bounded option-aware widths", async () => {
  const app = await readFile(path.join(root, "src", "App.jsx"), "utf8");
  const styles = await readFile(path.join(root, "src", "styles.css"), "utf8");
  assert.match(app, /renameChoiceField/);
  assert.match(app, /new Set\(\[\.\.\.current, field\.id\]\)/);
  assert.match(app, /open=\{openFields\.has\(field\.id\)\}/);
  assert.match(app, /Math\.min\(260, Math\.max\(112/);
  assert.match(styles, /\.choice-field-name/);
  assert.doesNotMatch(styles, /\.sentence-token:nth-of-type\(even\)/);
  assert.doesNotMatch(styles, /\.inline-select:nth-of-type\(even\)/);
  assert.match(styles, /text-overflow: ellipsis/);
});

test("configurator and widget preserve user-authored line breaks", async () => {
  const app = await readFile(path.join(root, "src", "App.jsx"), "utf8");
  const styles = await readFile(path.join(root, "src", "styles.css"), "utf8");
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.match(app, /Keep a recovery copy\./);
  assert.doesNotMatch(app, /Install bookmarklet/);
  assert.match(app, /\(\{field\.options\.length\}/);
  assert.match(styles, /\.sentence-preview[^}]*white-space: pre-wrap/);
  assert.match(styles, /\.preview-sentence[^}]*white-space: pre-wrap/);
  assert.match(styles, /\.scratchpad[^}]*white-space: pre-wrap/);
  assert.match(runtime, /function normalizeNewlines/);
  assert.match(runtime, /function containsInsertedText/);
  assert.match(runtime, /blocks\.every\(\(node\) => node\.nodeType === 1 && \/\^\(DIV\|P\)\$\//);
  assert.match(runtime, /\.preview\{[^}]*white-space:pre-wrap/);
  assert.match(runtime, /target instanceof HTMLInputElement && text\.includes\("\\n"\)/);
});

test("runtime reads Google Chat block editors as the same logical newlines", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  const helpers = runtime.slice(
    runtime.indexOf("function normalizeNewlines"),
    runtime.indexOf("function waitForEditor"),
  );
  const context = {
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
  };
  vm.runInNewContext(`${helpers}\nthis.readEditor = editableText; this.containsText = containsInsertedText;`, context);
  const googleChatEditor = {
    childNodes: [
      { nodeType: 1, nodeName: "DIV", textContent: "First line", innerText: "First line" },
      { nodeType: 1, nodeName: "DIV", textContent: "", innerText: "" },
      { nodeType: 1, nodeName: "DIV", textContent: "Third line", innerText: "Third line" },
    ],
  };

  assert.equal(context.readEditor(googleChatEditor), "First line\n\nThird line");
  assert.equal(context.containsText(googleChatEditor, "First line\r\n\r\nThird line"), true);
});

test("runtime reconstructs a live editor range and verifies insertion", async () => {
  const runtime = await readFile(path.join(root, "src", "bookmarklet", "runtime.js"), "utf8");
  assert.match(runtime, /function rangeFromOffsets/);
  assert.match(runtime, /beforeCaret\.toString\(\)\.length/);
  assert.match(runtime, /const liveRange = rangeFromOffsets/);
  assert.match(runtime, /await waitForEditor\(\)/);
  assert.match(runtime, /setTimeout\(resolve, 260\)/);
  assert.match(runtime, /containsInsertedText\(target, text\)/);
  assert.match(runtime, /press Ctrl\+V to replace the shortcut/);
});
