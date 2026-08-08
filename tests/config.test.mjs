import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONFIG,
  cloneConfig,
  displayTemplate,
  importPreview,
  renderChoice,
  searchExpansions,
  storedTemplate,
  validateConfig,
} from "../src/config.js";

test("default config validates and contains all MVP expansion types", () => {
  assert.equal(validateConfig(DEFAULT_CONFIG).valid, true);
  assert.deepEqual(new Set(DEFAULT_CONFIG.expansions.map((item) => item.type)), new Set(["direct", "choice", "random"]));
});

test("choice templates round-trip through layman bracket notation", () => {
  const stored = "Hey, we have {{Meal}} with {{Side}}.";
  assert.equal(displayTemplate(stored), "Hey, we have [Meal] with [Side].");
  assert.equal(storedTemplate(displayTemplate(stored)), stored);
});

test("choice renderer fills every configured field", () => {
  const choice = DEFAULT_CONFIG.expansions.find((item) => item.type === "choice");
  assert.equal(renderChoice(choice, { Meal: "Turkey", Side: "Fries" }), "Hey, we have Turkey in the menu today with Fries.");
});

test("search prefers an exact shortcut and searches labels", () => {
  assert.equal(searchExpansions(DEFAULT_CONFIG, "options")[0].shortcut, "options");
  assert.equal(searchExpansions(DEFAULT_CONFIG, "goodbye")[0].shortcut, "bye");
});

test("validator rejects duplicates and newer schemas without mutating current config", () => {
  const duplicate = cloneConfig(DEFAULT_CONFIG);
  duplicate.expansions[2].shortcut = "hello";
  assert.equal(validateConfig(duplicate).valid, false);

  const newer = cloneConfig(DEFAULT_CONFIG);
  newer.schemaVersion = 99;
  const current = cloneConfig(DEFAULT_CONFIG);
  const before = JSON.stringify(current);
  const preview = importPreview(current, newer);
  assert.equal(preview.valid, false);
  assert.match(preview.errors[0], /newer ZenExpander/i);
  assert.equal(JSON.stringify(current), before);
});

test("validator bounds configurable arrays before they reach the page runtime", () => {
  const tooManyVariants = cloneConfig(DEFAULT_CONFIG);
  tooManyVariants.expansions[2].variants = Array.from({ length: 101 }, (_, index) => `Option ${index + 1}`);
  assert.match(validateConfig(tooManyVariants).errors.join(" "), /at most 100 random options/i);

  const tooManyFields = cloneConfig(DEFAULT_CONFIG);
  const choice = tooManyFields.expansions[1];
  choice.fields = Array.from({ length: 21 }, (_, index) => ({ id: `field-${index}`, name: `Field ${index}`, options: ["A"] }));
  choice.template = choice.fields.map((field) => `{{${field.name}}}`).join(" ");
  assert.match(validateConfig(tooManyFields).errors.join(" "), /at most 20 choice fields/i);

  const tooManyOptions = cloneConfig(DEFAULT_CONFIG);
  tooManyOptions.expansions[1].fields[0].options = Array.from({ length: 101 }, (_, index) => `Option ${index + 1}`);
  assert.match(validateConfig(tooManyOptions).errors.join(" "), /at most 100 options/i);
});

test("import preview classifies additions, replacements and unchanged shortcuts", () => {
  const incoming = cloneConfig(DEFAULT_CONFIG);
  incoming.expansions[0].text = "Hello there";
  incoming.expansions.push({ id: "thanks", shortcut: "thanks", label: "Thanks", type: "direct", text: "Thank you" });
  const preview = importPreview(DEFAULT_CONFIG, incoming);
  assert.deepEqual(
    { valid: preview.valid, additions: preview.additions, replacements: preview.replacements, unchanged: preview.unchanged },
    { valid: true, additions: 1, replacements: 1, unchanged: 2 },
  );
});
