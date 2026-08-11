import LEAF_ICON from "../../public/zenexpander-leaf.png";

const ROOT_ID = "zenexpander-runtime";
const PAIRING_TOKEN = "__ZENEXPANDER_PAIRING_TOKEN__";
const BRIDGE_URL = "__ZENEXPANDER_BRIDGE_URL__";
const BRIDGE_ORIGIN = new URL(BRIDGE_URL).origin;
const CONFIG_URL = new URL("./", BRIDGE_URL).href;

function isInput(target) {
  return target?.tagName === "INPUT";
}

function isTextControl(target) {
  return isInput(target) || target?.tagName === "TEXTAREA";
}

function isEditable(target) {
  return isTextControl(target) || Boolean(target?.isContentEditable);
}

function documentFor(target) {
  return target?.ownerDocument ?? document;
}

function selectionFor(target) {
  const root = target?.getRootNode?.();
  return root?.getSelection?.() ?? documentFor(target).getSelection?.() ?? getSelection();
}

function editableFromEvent(event) {
  return event.composedPath().find(isEditable) ?? (isEditable(event.target) ? event.target : null);
}

function sensitiveReason(target) {
  if (!isEditable(target)) return "Choose a text box first.";
  const attributes = [
    target.type,
    target.autocomplete,
    target.name,
    target.id,
    target.getAttribute?.("aria-label"),
    target.getAttribute?.("placeholder"),
  ].filter(Boolean).join(" ").toLowerCase();
  if (isInput(target) && target.type === "password") return "ZenExpander is disabled in password fields.";
  if (/one-time-code|otp|verification|security.?code|passcode/.test(attributes)) return "ZenExpander is disabled in one-time-code fields.";
  if (/cc-|credit.?card|card.?number|cvv|cvc|payment/.test(attributes)) return "ZenExpander is disabled in payment fields.";
  return "";
}

function activeEditable() {
  let target = document.activeElement;
  while (target) {
    const shadowTarget = target.shadowRoot?.activeElement;
    if (shadowTarget) {
      target = shadowTarget;
      continue;
    }
    if (target.tagName === "IFRAME") {
      try {
        const frameTarget = target.contentDocument?.activeElement;
        if (frameTarget) {
          target = frameTarget;
          continue;
        }
      } catch {
        return null;
      }
    }
    break;
  }
  return isEditable(target) ? target : null;
}

function viewportRect(target) {
  const rect = target.getBoundingClientRect();
  let left = rect.left;
  let right = rect.right;
  let top = rect.top;
  let bottom = rect.bottom;
  let view = documentFor(target).defaultView;
  while (view && view !== window) {
    const frame = view.frameElement;
    if (!frame) break;
    const frameRect = frame.getBoundingClientRect();
    left += frameRect.left + frame.clientLeft;
    right += frameRect.left + frame.clientLeft;
    top += frameRect.top + frame.clientTop;
    bottom += frameRect.top + frame.clientTop;
    view = documentFor(frame).defaultView;
  }
  return { left, right, top, bottom, width: rect.width, height: rect.height };
}

function labelForType(type) {
  return type === "choice" ? "Choices" : type === "random" ? "Random" : "Direct";
}

function normalizeNewlines(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function renderChoice(expansion, values = {}) {
  return normalizeNewlines(expansion?.template).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name) => {
    const field = expansion.fields?.find((item) => item.name === name);
    return normalizeNewlines(values[name] ?? field?.options?.[0] ?? "");
  });
}

function preview(expansion) {
  if (expansion.type === "direct") return normalizeNewlines(expansion.text);
  if (expansion.type === "random") return normalizeNewlines(expansion.variants?.[0] ?? "");
  return renderChoice(expansion);
}

function matches(expansion, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${expansion.shortcut} ${expansion.label ?? ""} ${preview(expansion)}`.toLowerCase().includes(needle);
}

function readBeforeCaret(target) {
  if (isTextControl(target)) {
    return target.value.slice(0, target.selectionStart ?? 0);
  }
  const selection = selectionFor(target);
  if (!selection?.rangeCount || !target.contains(selection.anchorNode)) return "";
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(target);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString();
}

function editableRange(target, typedLength = 0) {
  if (isTextControl(target)) {
    const end = target.selectionStart ?? target.value.length;
    return { kind: "text", target, start: Math.max(0, end - typedLength), end };
  }
  const doc = documentFor(target);
  const selection = selectionFor(target);
  if (!selection?.rangeCount || !target.contains(selection.anchorNode)) return null;
  const caret = selection.getRangeAt(0).cloneRange();
  const beforeCaret = doc.createRange();
  beforeCaret.selectNodeContents(target);
  beforeCaret.setEnd(caret.endContainer, caret.endOffset);
  const end = beforeCaret.toString().length;
  if (!typedLength) return { kind: "range", target, range: caret, start: end, end };
  const walker = doc.createTreeWalker(target, 4);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  const endNode = caret.endContainer;
  let remaining = typedLength;
  const range = doc.createRange();
  range.setEnd(caret.endContainer, caret.endOffset);
  let index = nodes.indexOf(endNode.nodeType === 3 ? endNode : null);
  if (index < 0) index = nodes.length - 1;
  let offset = endNode.nodeType === 3 ? caret.endOffset : (nodes[index]?.data.length ?? 0);
  while (index >= 0) {
    const current = nodes[index];
    if (remaining <= offset) {
      range.setStart(current, offset - remaining);
      return { kind: "range", target, range, start: Math.max(0, end - typedLength), end };
    }
    remaining -= offset;
    index -= 1;
    offset = nodes[index]?.data.length ?? 0;
  }
  return null;
}

function rangeFromOffsets(target, start, end) {
  const doc = documentFor(target);
  const range = doc.createRange();
  const walker = doc.createTreeWalker(target, 4);
  let position = 0;
  let startSet = false;
  let endSet = false;
  let node;
  while ((node = walker.nextNode())) {
    const next = position + node.data.length;
    if (!startSet && start <= next) {
      range.setStart(node, Math.max(0, start - position));
      startSet = true;
    }
    if (!endSet && end <= next) {
      range.setEnd(node, Math.max(0, end - position));
      endSet = true;
      break;
    }
    position = next;
  }
  if (!startSet) range.setStart(target, target.childNodes.length);
  if (!endSet) range.setEnd(target, target.childNodes.length);
  return range;
}

function editableText(target) {
  if (isTextControl(target)) {
    return normalizeNewlines(target.value);
  }
  const blocks = [...(target?.childNodes ?? [])];
  if (blocks.length && blocks.every((node) => node.nodeType === 1 && /^(DIV|P)$/.test(node.nodeName))) {
    return normalizeNewlines(blocks.map((node) => {
      if (!node.textContent) return "";
      return normalizeNewlines(node.innerText ?? node.textContent).replace(/\n$/, "");
    }).join("\n"));
  }
  return normalizeNewlines(target?.innerText ?? target?.textContent ?? "");
}

function containsInsertedText(target, text) {
  return editableText(target).includes(normalizeNewlines(text));
}

function dispatchEditorInput(target, text) {
  const Input = documentFor(target).defaultView?.InputEvent ?? InputEvent;
  target.dispatchEvent(new Input("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: text,
  }));
}

function waitForEditor() {
  return new Promise((resolve) => setTimeout(resolve, 260));
}

function styleText() {
  return `
    :host{all:initial;color-scheme:light;font-family:Arial,sans-serif}
    *{box-sizing:border-box}
    .stage{position:fixed;inset:0;z-index:2147483647;pointer-events:none;color:#281431;font:14px/1.45 Arial,sans-serif}
    button,input,select{font:inherit}
    button{cursor:pointer}
    button:hover{filter:brightness(.96)}button:active{transform:translateY(1px)}button:disabled{cursor:not-allowed;opacity:.55}
    .launcher{position:absolute;right:20px;bottom:20px;display:grid;width:56px;height:56px;place-items:center;border:1px solid #0a8276;border-radius:50%;background:#0a8276;box-shadow:0 10px 30px #28143138;pointer-events:auto}
    .launcher img{display:block;width:31px;height:31px;object-fit:contain;filter:brightness(0) invert(1)}
    .launcher:focus-visible,.panel button:focus-visible,.panel input:focus-visible,.panel select:focus-visible{outline:3px solid #44d7ca;outline-offset:3px}
    .launcher::after{content:"";position:absolute;inset:-8px;border:1px solid #a8e2dc;border-radius:50%}
    .panel{position:absolute;right:20px;bottom:88px;display:flex;flex-direction:column;width:min(390px,calc(100vw - 24px));max-height:min(580px,calc(100vh - 120px));overflow:hidden;border:1px solid #d8cfdf;border-radius:12px;background:#fff;color:#281431;box-shadow:0 18px 48px #28143130;pointer-events:auto}
    .panel[hidden]{display:none}
    .head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e5dfea;background:#f8f3fb}
    .head strong{font:700 18px/1.2 Georgia,serif}
    .head small{display:inline-flex;align-items:center;gap:4px;margin-left:auto;color:#726779;white-space:nowrap}.head kbd{padding:4px 8px;border:1px solid #bfb3c7;border-bottom-width:2px;border-radius:5px;background:#fff;color:#281431;font:700 12px/1.35 Arial,sans-serif}
    .icon{width:40px;height:40px;border:0;background:transparent;color:#281431;font-size:20px}
    .body{min-height:0;overflow:auto;padding:14px}
    .status{margin:0 0 10px;color:#726779}
    .status[data-tone="error"]{padding:10px;border-left:3px solid #a2304b;background:#fff0f4;color:#7c2239}
    .search{width:100%;height:44px;padding:0 12px;border:1px solid #7f7287;border-radius:6px;background:#fff;color:#281431}
    .results{display:grid;gap:2px;margin:10px -4px 0;max-height:300px;overflow:auto}
    .result{display:grid;grid-template-columns:1fr auto;gap:4px 12px;width:100%;padding:10px 12px;border:0;border-radius:6px;background:transparent;color:#281431;text-align:left}
    .result:hover,.result[data-active="true"]{background:#e5f5f3}
    .result strong{font-weight:700}.result span{grid-column:1;color:#726779;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.result em{grid-row:1/3;grid-column:2;align-self:center;color:#0a8276;font-style:normal;font-size:12px}
    .empty{padding:18px 8px;color:#726779;text-align:center}
    .choice-title{margin:0 0 6px;font:700 22px/1.2 Georgia,serif}.sentence{margin:0 0 16px;color:#594c61;white-space:pre-wrap;overflow-wrap:anywhere}
    .fields{display:grid;gap:12px}.field{display:grid;gap:5px}.field label{font-weight:700}.field select{height:44px;padding:0 10px;border:1px solid #7f7287;border-radius:6px;background:#fff;color:#281431}
    .preview{margin:16px 0;padding:12px;border-left:3px solid #0a8276;background:#f2fbfa;font:600 16px/1.5 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere}
    .actions{margin-top:14px}.primary{display:inline-flex;width:100%;min-height:44px;align-items:center;justify-content:center;gap:8px;padding:0 14px;border:1px solid #0a8276;border-radius:6px;background:#0a8276;color:#fff;font-weight:700}.primary kbd{min-width:42px;padding:3px 7px;border:1px solid #ffffff94;border-bottom-width:2px;border-radius:5px;background:#ffffff1f;color:inherit;font:700 11px/1.35 Arial,sans-serif;text-align:center}
    .restart{min-height:44px;padding:0 14px;border:1px solid #0a8276;border-radius:6px;background:#0a8276;color:#fff;font-weight:700}
    @media(max-width:480px){.launcher{right:14px;bottom:14px}.panel{right:12px;bottom:82px}}
    @media(prefers-reduced-motion:no-preference){.panel{animation:zen-in .16s ease-out}@keyframes zen-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
    @media(prefers-reduced-motion:reduce){button:active{transform:none}}
  `;
}

function makeElement(tag, className = "", role = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (role) node.dataset.role = role;
  if (text) node.textContent = text;
  return node;
}

class ZenRuntime {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.config = null;
    this.bridgeWindow = null;
    this.bridgePort = null;
    this.nonce = "";
    this.poll = null;
    this.activeTarget = null;
    this.savedRange = null;
    this.prefixMode = false;
    this.query = "";
    this.anchorRect = null;
    this.results = [];
    this.activeIndex = 0;
    this.choice = null;
    this.confirmChoice = null;
    this.documents = new WeakSet();
    this.frames = new WeakSet();
    this.observers = [];
    this.inserting = false;
    this.notice = "";
    this.handleWindowMessage = this.handleWindowMessage.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
  }

  node(role) {
    return this.shadow.querySelector(`[data-role="${role}"]`);
  }

  build() {
    this.host = document.createElement("div");
    this.host.id = ROOT_ID;
    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styleText();
    const stage = makeElement("div", "stage");
    const launcher = makeElement("button", "launcher", "launcher");
    launcher.setAttribute("aria-label", "Open ZenExpander");
    const launcherLogo = makeElement("img");
    launcherLogo.src = LEAF_ICON;
    launcherLogo.alt = "";
    launcher.append(launcherLogo);
    const panel = makeElement("section", "panel", "panel");
    panel.setAttribute("aria-label", "ZenExpander");
    panel.setAttribute("aria-keyshortcuts", "Escape");
    panel.hidden = true;
    const head = makeElement("div", "head");
    const title = makeElement("strong", "", "", "ZenExpander");
    const hint = makeElement("small", "", "hint");
    const hintKey = makeElement("kbd", "", "", "Esc");
    hint.append(hintKey, document.createTextNode(" to close"));
    const minimize = makeElement("button", "icon", "minimize", "−");
    minimize.setAttribute("aria-label", "Minimize");
    head.append(title, hint, minimize);
    const body = makeElement("div", "body", "body");
    const status = makeElement("p", "status", "status", "Connecting to your private configurator…");
    const search = makeElement("input", "search", "search");
    search.setAttribute("aria-label", "Search expansions");
    search.setAttribute("placeholder", "Search expansions");
    search.setAttribute("autocomplete", "off");
    const results = makeElement("div", "results", "results");
    body.append(status, search, results);
    panel.append(head, body);
    stage.append(launcher, panel);
    this.shadow.append(style, stage);
    document.documentElement.append(this.host);
    this.node("launcher").addEventListener("click", () => this.toggle());
    this.node("minimize").addEventListener("click", () => this.close());
    this.node("search").addEventListener("input", (event) => {
      this.prefixMode = false;
      this.renderResults(event.target.value);
    });
    this.node("search").addEventListener("keydown", this.handleKeydown);
    window.addEventListener("message", this.handleWindowMessage);
    this.watchDocument(document);
  }

  watchFrameContent(frame) {
    try {
      const frameDocument = frame.contentDocument;
      if (frameDocument?.documentElement) this.watchDocument(frameDocument);
    } catch {
      // Sandboxed and cross-origin frames are intentionally outside a bookmarklet's reach.
    }
  }

  watchFrame(frame) {
    if (!this.frames.has(frame)) {
      this.frames.add(frame);
      frame.addEventListener("load", () => this.watchFrameContent(frame));
    }
    this.watchFrameContent(frame);
  }

  watchDocument(doc) {
    if (!doc?.documentElement || this.documents.has(doc)) return;
    this.documents.add(doc);
    doc.addEventListener("keydown", this.handleKeydown, true);
    doc.addEventListener("input", this.handleInput, true);
    doc.addEventListener("focusin", this.handleFocus, true);
    for (const frame of doc.querySelectorAll("iframe")) this.watchFrame(frame);
    const Observer = doc.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === "IFRAME") this.watchFrame(node);
          for (const frame of node.querySelectorAll?.("iframe") ?? []) this.watchFrame(frame);
        }
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  setStatus(message, tone = "") {
    let status = this.node("status");
    if (!status) {
      status = makeElement("p", "status", "status");
      this.node("body").prepend(status);
    }
    status.textContent = message;
    status.dataset.tone = tone;
  }

  handleWindowMessage(event) {
    if (
      event.origin !== BRIDGE_ORIGIN
      || event.source !== this.bridgeWindow
      || event.data?.type !== "zen:bridge-port"
      || event.data?.nonce !== this.nonce
      || event.ports.length !== 1
    ) return;
    this.bridgePort = event.ports[0];
    this.bridgePort.onmessage = (messageEvent) => this.handleBridge(messageEvent.data);
    this.bridgePort.start();
    this.requestConfig();
    clearInterval(this.poll);
    this.poll = setInterval(() => this.requestConfig(), 2_500);
  }

  handleBridge(message) {
    if (message?.nonce && message.nonce !== this.nonce) return;
    if (["zen:config", "zen:config-changed"].includes(message?.type) && message.config) {
      this.config = message.config;
      if (this.choice) return;
      if (!this.node("search")) this.restoreSearchBody();
      this.setStatus(this.notice || `${this.config.expansions.length} private expansions ready.`);
      this.renderResults(this.query);
      return;
    }
    if (message?.type === "zen:error" && message.code === "config-unavailable") {
      this.setStatus(message.message);
      return;
    }
    if (message?.type === "zen:error") this.showDisconnected(message.message);
  }

  requestConfig() {
    this.bridgePort?.postMessage({ type: "zen:request-config", token: PAIRING_TOKEN, nonce: this.nonce });
  }

  connect() {
    this.setStatus("Connecting to your private configurator…");
    this.nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const hash = new URLSearchParams({ token: PAIRING_TOKEN, nonce: this.nonce, origin: location.origin });
    this.bridgeWindow = window.open(`${BRIDGE_URL}#${hash}`, "_blank");
    if (!this.bridgeWindow) this.showDisconnected("Your browser blocked the helper tab. Allow pop-ups, then restart.");
  }

  showDisconnected(message) {
    clearInterval(this.poll);
    this.config = null;
    this.open(false);
    const body = this.node("body");
    const status = makeElement("p", "status", "status", message || "The configurator is closed.");
    status.dataset.tone = "error";
    const restart = makeElement("button", "restart", "restart", "Restart configurator");
    body.replaceChildren(status, restart);
    restart.addEventListener("click", (event) => {
      window.open(CONFIG_URL, "_blank");
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = "Waiting for configurator…";
      clearInterval(this.poll);
      this.poll = setInterval(() => this.requestConfig(), 1_000);
    });
  }

  restoreSearchBody() {
    const body = this.node("body");
    const status = makeElement("p", "status", "status");
    const search = makeElement("input", "search", "search");
    search.setAttribute("aria-label", "Search expansions");
    search.setAttribute("placeholder", "Search expansions");
    search.setAttribute("autocomplete", "off");
    const results = makeElement("div", "results", "results");
    body.replaceChildren(status, search, results);
    this.node("search").addEventListener("input", (event) => {
      this.prefixMode = false;
      this.renderResults(event.target.value);
    });
    this.node("search").addEventListener("keydown", this.handleKeydown);
  }

  handleFocus(event) {
    const target = editableFromEvent(event);
    if (!target || sensitiveReason(target)) return;
    this.activeTarget = target;
  }

  captureTarget(typedLength = 0) {
    const target = activeEditable() ?? this.activeTarget;
    const reason = sensitiveReason(target);
    if (reason) {
      this.setStatus(reason, "error");
      return false;
    }
    this.activeTarget = target;
    this.savedRange = editableRange(target, typedLength);
    return Boolean(this.savedRange);
  }

  open(focusSearch = true) {
    this.node("panel").hidden = false;
    if (focusSearch && this.node("search")) {
      this.anchorRect = null;
      const panel = this.node("panel");
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.maxHeight = "";
      this.captureTarget();
      this.node("search").focus();
      this.node("search").select();
    }
  }

  close() {
    this.node("panel").hidden = true;
    this.choice = null;
    this.confirmChoice = null;
    this.anchorRect = null;
    this.activeTarget?.focus?.();
  }

  toggle() {
    if (this.node("panel").hidden) this.open(true);
    else this.close();
  }

  shortcutMatches(event) {
    if (!this.config?.settings?.shortcutEnabled) return false;
    if (this.config.settings.experimentalCapsLock && event.code === "CapsLock") return true;
    const hotkey = this.config.hotkey ?? {};
    return event.code === (hotkey.key ?? "Space")
      && event.ctrlKey === Boolean(hotkey.ctrl)
      && event.shiftKey === Boolean(hotkey.shift)
      && event.altKey === Boolean(hotkey.alt)
      && event.metaKey === Boolean(hotkey.meta);
  }

  handleKeydown(event) {
    if (this.shortcutMatches(event)) {
      event.preventDefault();
      event.stopPropagation();
      this.prefixMode = false;
      this.open(true);
      this.renderResults("");
      return;
    }
    if (this.node("panel").hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (this.choice) {
      const fromChoiceSelect = event.composedPath().some((node) => node instanceof HTMLSelectElement);
      if (event.key === "Enter" && !event.isComposing && !fromChoiceSelect) {
        event.preventDefault();
        event.stopPropagation();
        this.confirmChoice?.();
      }
      return;
    }
    const ownsKeyboard = this.prefixMode || this.shadow.activeElement === this.node("search");
    if (!ownsKeyboard) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.activeIndex = (this.activeIndex + delta + this.results.length) % Math.max(1, this.results.length);
      this.paintActive();
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && this.results[this.activeIndex]) {
      event.preventDefault();
      event.stopPropagation();
      this.choose(this.results[this.activeIndex]);
    }
  }

  handleInput(event) {
    if (this.inserting) return;
    const target = editableFromEvent(event);
    if (!this.config?.settings?.prefixTrigger || !target) return;
    if (event.isTrusted) this.notice = "";
    if (sensitiveReason(target)) {
      this.close();
      return;
    }
    const before = readBeforeCaret(target);
    const prefix = this.config.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = before.match(new RegExp(`(?:^|\\s)${prefix}([a-z0-9_-]*)$`, "i"));
    if (!match) {
      if (this.prefixMode) this.close();
      return;
    }
    this.prefixMode = true;
    this.activeTarget = target;
    this.savedRange = editableRange(target, match[0].trimStart().length);
    this.open(false);
    this.positionNear(viewportRect(target));
    this.renderResults(match[1]);
  }

  positionNear(rect) {
    this.anchorRect = rect;
    const panel = this.node("panel");
    const edge = 12;
    const gap = 10;
    const width = Math.min(390, innerWidth - 24);
    const left = Math.max(edge, Math.min(rect.right - width, innerWidth - width - edge));
    const aboveSpace = Math.max(0, rect.top - gap - edge);
    const belowSpace = Math.max(0, innerHeight - rect.bottom - gap - edge);
    const placeAbove = aboveSpace >= belowSpace;
    const sideSpace = placeAbove ? aboveSpace : belowSpace;
    const available = Math.min(580, innerHeight - (edge * 2), Math.max(180, sideSpace));
    panel.style.maxHeight = `${available}px`;
    const height = Math.min(panel.scrollHeight || panel.getBoundingClientRect().height || 220, available);
    const preferredTop = placeAbove ? rect.top - gap - height : rect.bottom + gap;
    const top = Math.max(edge, Math.min(preferredTop, innerHeight - edge - height));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  renderResults(query = "") {
    if (!this.node("results") || !this.config) return;
    this.query = String(query);
    if (this.prefixMode && this.node("search")) this.node("search").value = this.query;
    this.results = this.config.expansions.filter((item) => matches(item, query)).slice(0, 8);
    this.activeIndex = 0;
    const container = this.node("results");
    container.replaceChildren();
    if (!this.results.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No expansion matches yet.";
      container.append(empty);
      if (this.anchorRect) requestAnimationFrame(() => this.positionNear(this.activeTarget ? viewportRect(this.activeTarget) : this.anchorRect));
      return;
    }
    this.results.forEach((expansion, index) => {
      const button = document.createElement("button");
      button.className = "result";
      button.dataset.active = String(index === this.activeIndex);
      const strong = document.createElement("strong");
      strong.textContent = `${this.config.prefix}${expansion.shortcut} · ${expansion.label || labelForType(expansion.type)}`;
      const span = document.createElement("span");
      span.textContent = preview(expansion);
      const em = document.createElement("em");
      em.textContent = labelForType(expansion.type);
      button.append(strong, span, em);
      button.addEventListener("mouseenter", () => { this.activeIndex = index; this.paintActive(); });
      button.addEventListener("click", () => this.choose(expansion));
      container.append(button);
    });
    if (this.anchorRect) requestAnimationFrame(() => this.positionNear(this.activeTarget ? viewportRect(this.activeTarget) : this.anchorRect));
  }

  paintActive() {
    [...this.node("results").children].forEach((item, index) => {
      item.dataset.active = String(index === this.activeIndex);
    });
  }

  choose(expansion) {
    if (!this.savedRange && !this.captureTarget()) return;
    if (expansion.type === "choice") {
      this.showChoice(expansion);
      return;
    }
    const text = expansion.type === "random"
      ? expansion.variants[Math.floor(Math.random() * expansion.variants.length)]
      : expansion.text;
    this.insert(text);
  }

  showChoice(expansion) {
    this.choice = expansion;
    const values = Object.fromEntries(expansion.fields.map((field) => [field.name, field.options[0] ?? ""]));
    this.confirmChoice = () => this.insert(renderChoice(expansion, values));
    const body = this.node("body");
    body.replaceChildren();
    const title = document.createElement("h2");
    title.className = "choice-title";
    title.textContent = `${this.config.prefix}${expansion.shortcut}`;
    const sentence = document.createElement("p");
    sentence.className = "sentence";
    sentence.textContent = expansion.label || "Choose the details, then confirm.";
    const fields = document.createElement("div");
    fields.className = "fields";
    const result = document.createElement("p");
    result.className = "preview";
    const paint = () => { result.textContent = renderChoice(expansion, values); };
    for (const field of expansion.fields) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      label.textContent = field.name;
      const select = document.createElement("select");
      select.setAttribute("aria-label", field.name);
      for (const option of field.options) {
        const node = document.createElement("option");
        node.value = option;
        node.textContent = option;
        select.append(node);
      }
      select.addEventListener("change", () => { values[field.name] = select.value; paint(); });
      wrap.append(label, select);
      fields.append(wrap);
    }
    const actions = document.createElement("div");
    actions.className = "actions";
    const confirm = document.createElement("button");
    confirm.className = "primary";
    confirm.setAttribute("aria-label", "Confirm and paste. Press Enter");
    confirm.setAttribute("aria-keyshortcuts", "Enter");
    confirm.append(document.createTextNode("Confirm & paste"));
    const enterKey = document.createElement("kbd");
    enterKey.setAttribute("aria-hidden", "true");
    enterKey.textContent = "Enter";
    confirm.append(enterKey);
    confirm.addEventListener("click", () => this.confirmChoice?.());
    actions.append(confirm);
    body.append(title, sentence, fields, result, actions);
    paint();
    if (this.anchorRect) requestAnimationFrame(() => this.positionNear(this.activeTarget ? viewportRect(this.activeTarget) : this.anchorRect));
    fields.querySelector("select")?.focus();
  }

  async insert(text) {
    text = normalizeNewlines(text);
    const range = this.savedRange;
    const target = range?.target;
    const reason = sensitiveReason(target);
    if (!range || reason) {
      this.setStatus(reason || "Return to the text box and try again.", "error");
      return;
    }
    const before = editableText(target);
    const doc = documentFor(target);
    let inserted = false;
    this.inserting = true;
    try {
      target.focus();
      if (range.kind === "text") {
        if (!(isInput(target) && text.includes("\n"))) {
          target.setRangeText(text, range.start, range.end, "end");
          dispatchEditorInput(target, text);
          await waitForEditor();
          inserted = editableText(target) !== before && containsInsertedText(target, text);
        }
      } else {
        const selection = selectionFor(target);
        const liveRange = rangeFromOffsets(target, range.start, range.end);
        selection.removeAllRanges();
        selection.addRange(liveRange);
        inserted = Boolean(doc.execCommand?.("insertText", false, text));
        await waitForEditor();
        inserted = inserted && editableText(target) !== before && containsInsertedText(target, text);
        if (!inserted && editableText(target) === before && !text.includes("\n")) {
          const fallbackRange = rangeFromOffsets(target, range.start, range.end);
          selection.removeAllRanges();
          selection.addRange(fallbackRange);
          fallbackRange.deleteContents();
          const node = doc.createTextNode(text);
          fallbackRange.insertNode(node);
          fallbackRange.setStartAfter(node);
          fallbackRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(fallbackRange);
          dispatchEditorInput(target, text);
          await waitForEditor();
          inserted = editableText(target) !== before && containsInsertedText(target, text);
        }
      }
    } catch {
      inserted = false;
    } finally {
      this.inserting = false;
    }
    if (!inserted) {
      target.focus();
      if (range.kind === "text") {
        target.setSelectionRange(range.start, range.end);
      } else {
        const selection = selectionFor(target);
        selection.removeAllRanges();
        selection.addRange(rangeFromOffsets(target, range.start, range.end));
      }
      try {
        await navigator.clipboard.writeText(text);
        this.choice = null;
        this.confirmChoice = null;
        this.prefixMode = false;
        this.restoreSearchBody();
        this.notice = "This editor blocked direct insertion. Copied—press Ctrl+V to replace the shortcut.";
        this.open(false);
        this.setStatus(this.notice);
        this.positionNear(viewportRect(target));
        target.focus();
        return;
      } catch {
        window.prompt("Copy this text, then paste it:", text);
      }
    }
    this.notice = "";
    this.close();
  }

  boot() {
    this.build();
    this.open(false);
    if (!/^[a-f0-9]{64}$/i.test(PAIRING_TOKEN)) {
      this.showDisconnected("This bookmark is not paired. Install it again from ZenExpander.");
      return;
    }
    this.connect();
  }
}

const existing = document.getElementById(ROOT_ID);
if (existing) existing.remove();
new ZenRuntime().boot();
