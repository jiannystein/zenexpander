export const SCHEMA_VERSION = 1;
export const CONFIG_FILE_NAME = "zenexpander-config.json";
export const MAX_CONFIG_FILE_BYTES = 1_000_000;

const MAX_EXPANSIONS = 500;
const MAX_RANDOM_VARIANTS = 100;
const MAX_CHOICE_FIELDS = 20;
const MAX_CHOICE_OPTIONS = 100;

export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  prefix: ";",
  hotkey: {
    ctrl: true,
    shift: true,
    alt: false,
    meta: false,
    key: "Space",
  },
  settings: {
    prefixTrigger: true,
    shortcutEnabled: true,
    experimentalCapsLock: false,
  },
  expansions: [
    {
      id: "hello",
      shortcut: "hello",
      label: "Friendly hello",
      type: "direct",
      text: "Hello, how are you?",
    },
    {
      id: "options",
      shortcut: "options",
      label: "Today's menu",
      type: "choice",
      template: "Hey, we have {{Meal}} in the menu today with {{Side}}.",
      fields: [
        { id: "meal", name: "Meal", options: ["Beef", "Chicken Wing", "Turkey"] },
        { id: "side", name: "Side", options: ["Fries", "Salad", "Rice"] },
      ],
    },
    {
      id: "bye",
      shortcut: "bye",
      label: "Friendly goodbye",
      type: "random",
      variants: ["Goodbye", "Bye bye", "See you"],
    },
  ],
});

export function cloneConfig(config = DEFAULT_CONFIG) {
  return JSON.parse(JSON.stringify(config));
}

export function makeId(prefix = "item") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function normalizeShortcut(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

export function displayTemplate(template) {
  return String(template ?? "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, "[$1]");
}

export function storedTemplate(template) {
  return String(template ?? "").replace(/\[\s*([^\[\]]+?)\s*\]/g, "{{$1}}");
}

export function templateParts(template) {
  const source = String(template ?? "");
  const parts = [];
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) parts.push({ type: "text", value: source.slice(cursor, match.index) });
    parts.push({ type: "field", value: match[1] });
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) parts.push({ type: "text", value: source.slice(cursor) });
  return parts;
}

export function renderChoice(expansion, values = {}) {
  return String(expansion?.template ?? "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name) => {
    const field = expansion?.fields?.find((item) => item.name === name);
    return String(values[name] ?? field?.options?.[0] ?? "");
  });
}

export function expansionPreview(expansion) {
  if (!expansion) return "";
  if (expansion.type === "direct") return expansion.text ?? "";
  if (expansion.type === "random") return expansion.variants?.[0] ?? "";
  return renderChoice(expansion);
}

export function searchExpansions(config, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  const expansions = Array.isArray(config?.expansions) ? config.expansions : [];
  if (!needle) return expansions;
  return expansions
    .map((item) => {
      const shortcut = String(item.shortcut ?? "").toLowerCase();
      const haystack = `${shortcut} ${item.label ?? ""} ${expansionPreview(item)}`.toLowerCase();
      let score = haystack.includes(needle) ? 2 : 0;
      if (shortcut.startsWith(needle)) score += 4;
      if (shortcut === needle) score += 8;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.shortcut.localeCompare(b.item.shortcut))
    .map(({ item }) => item);
}

function cleanString(value, maximum = 10_000) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function validateExpansion(expansion, index, shortcuts) {
  const errors = [];
  if (!expansion || typeof expansion !== "object" || Array.isArray(expansion)) {
    return [`Expansion ${index + 1} must be an object.`];
  }
  const shortcut = normalizeShortcut(expansion.shortcut);
  if (!shortcut) errors.push(`Expansion ${index + 1} needs a shortcut.`);
  if (shortcut && shortcut !== expansion.shortcut) errors.push(`Shortcut "${expansion.shortcut}" may use lowercase letters, numbers, - or _ only.`);
  if (shortcuts.has(shortcut)) errors.push(`Shortcut "${shortcut}" is duplicated.`);
  shortcuts.add(shortcut);
  if (!["direct", "choice", "random"].includes(expansion.type)) errors.push(`;${shortcut || index + 1} has an unsupported type.`);
  if (expansion.type === "direct" && !cleanString(expansion.text).trim()) errors.push(`;${shortcut} needs text to paste.`);
  if (expansion.type === "random") {
    if (!Array.isArray(expansion.variants) || expansion.variants.filter((item) => cleanString(item).trim()).length < 2) {
      errors.push(`;${shortcut} needs at least two random options.`);
    } else if (expansion.variants.length > MAX_RANDOM_VARIANTS) {
      errors.push(`;${shortcut} can contain at most ${MAX_RANDOM_VARIANTS} random options.`);
    }
  }
  if (expansion.type === "choice") {
    if (!cleanString(expansion.template).trim()) errors.push(`;${shortcut} needs a sentence.`);
    if (!Array.isArray(expansion.fields) || expansion.fields.length === 0) errors.push(`;${shortcut} needs at least one choice field.`);
    else if (expansion.fields.length > MAX_CHOICE_FIELDS) errors.push(`;${shortcut} can contain at most ${MAX_CHOICE_FIELDS} choice fields.`);
    const names = new Set();
    for (const field of expansion.fields ?? []) {
      const name = cleanString(field?.name, 80).trim();
      if (!name) errors.push(`;${shortcut} has an unnamed choice field.`);
      if (names.has(name.toLowerCase())) errors.push(`;${shortcut} repeats the choice field "${name}".`);
      names.add(name.toLowerCase());
      if (!Array.isArray(field?.options) || field.options.filter((item) => cleanString(item, 500).trim()).length === 0) {
        errors.push(`Choice field "${name || "Untitled"}" needs at least one option.`);
      } else if (field.options.length > MAX_CHOICE_OPTIONS) {
        errors.push(`Choice field "${name || "Untitled"}" can contain at most ${MAX_CHOICE_OPTIONS} options.`);
      }
      if (!String(expansion.template ?? "").includes(`{{${name}}}`)) {
        errors.push(`The sentence for ;${shortcut} does not include [${name}].`);
      }
    }
  }
  return errors;
}

export function validateConfig(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, errors: ["The file must contain one ZenExpander configuration object."] };
  }
  if (!Number.isInteger(candidate.schemaVersion)) errors.push("The file is missing a schema version.");
  else if (candidate.schemaVersion > SCHEMA_VERSION) errors.push(`This file needs a newer ZenExpander version (schema ${candidate.schemaVersion}).`);
  else if (candidate.schemaVersion < 1) errors.push("This file uses an unsupported schema version.");
  if (typeof candidate.prefix !== "string" || candidate.prefix.length !== 1 || /\s/.test(candidate.prefix)) {
    errors.push("The prefix must be one visible character.");
  }
  if (!Array.isArray(candidate.expansions)) errors.push("The file needs an expansions list.");
  else if (candidate.expansions.length > MAX_EXPANSIONS) errors.push(`A configuration can contain at most ${MAX_EXPANSIONS} expansions.`);
  else {
    const shortcuts = new Set();
    candidate.expansions.forEach((item, index) => errors.push(...validateExpansion(item, index, shortcuts)));
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeConfig(candidate) {
  const next = cloneConfig(candidate);
  next.schemaVersion = SCHEMA_VERSION;
  next.prefix = String(next.prefix || ";").slice(0, 1);
  next.hotkey = { ...cloneConfig(DEFAULT_CONFIG.hotkey), ...(next.hotkey ?? {}) };
  next.settings = { ...cloneConfig(DEFAULT_CONFIG.settings), ...(next.settings ?? {}) };
  next.expansions = (next.expansions ?? []).map((item) => ({
    ...item,
    id: cleanString(item.id, 120) || makeId("expansion"),
    shortcut: normalizeShortcut(item.shortcut),
    label: cleanString(item.label, 160),
    ...(item.type === "direct" ? { text: cleanString(item.text) } : {}),
    ...(item.type === "random" ? { variants: (item.variants ?? []).map((value) => cleanString(value, 2_000)) } : {}),
    ...(item.type === "choice" ? {
      template: cleanString(item.template),
      fields: (item.fields ?? []).map((field) => ({
        id: cleanString(field.id, 120) || makeId("field"),
        name: cleanString(field.name, 80),
        options: (field.options ?? []).map((value) => cleanString(value, 500)),
      })),
    } : {}),
  }));
  return next;
}

export function importPreview(current, incoming) {
  const validation = validateConfig(incoming);
  if (!validation.valid) return { ...validation, additions: 0, replacements: 0, unchanged: 0 };
  const currentByShortcut = new Map((current?.expansions ?? []).map((item) => [item.shortcut, item]));
  let additions = 0;
  let replacements = 0;
  let unchanged = 0;
  for (const item of incoming.expansions) {
    const existing = currentByShortcut.get(item.shortcut);
    if (!existing) additions += 1;
    else if (JSON.stringify(existing) === JSON.stringify(item)) unchanged += 1;
    else replacements += 1;
  }
  return { valid: true, errors: [], additions, replacements, unchanged };
}
