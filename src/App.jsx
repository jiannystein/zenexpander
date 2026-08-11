import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown,
  Check,
  DotsSix,
  DownloadSimple,
  FileText,
  Keyboard,
  LinkSimple,
  ListBullets,
  LockKey,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  Shuffle,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  CONFIG_FILE_NAME,
  DEFAULT_CONFIG,
  MAX_CONFIG_FILE_BYTES,
  cloneConfig,
  displayTemplate,
  expansionPreview,
  importPreview,
  makeId,
  normalizeConfig,
  normalizeNewlines,
  normalizeShortcut,
  renameChoiceField,
  renderChoice,
  searchExpansions,
  storedTemplate,
  templateParts,
  validateConfig,
} from "./config.js";
import { connectConfigurator, updateConfiguratorWorkspace } from "./bridge-client.js";
import { createPairingToken, loadWorkspace, saveWorkspace } from "./storage.js";

const LEAF_LOGO_URL = `${import.meta.env.BASE_URL}zenexpander-leaf.png`;
const NAV_ITEMS = [
  { id: "expansions", label: "Expansions", note: "Step 1 · Build" },
  { id: "setup", label: "Setup", note: "Step 2 · Add" },
  { id: "preferences", label: "Preferences", note: "Step 3 · Tune" },
];

function LeafLogo({ inverted = false }) {
  return <img className={inverted ? "leaf-logo is-inverted" : "leaf-logo"} src={LEAF_LOGO_URL} alt="" />;
}

function Brand() {
  return (
    <div className="brand" aria-label="ZenExpander">
      <span className="brand-mark" aria-hidden="true"><LeafLogo /></span>
      <span>ZenExpander</span>
    </div>
  );
}

function TypeIcon({ type }) {
  if (type === "choice") return <ListBullets aria-hidden="true" />;
  if (type === "random") return <Shuffle aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

function Onboarding({ onCreate, onImport, error }) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding" aria-labelledby="welcome-title">
        <Brand />
        <h1 id="welcome-title">Create your local expansion workspace.</h1>
        <p className="lede">Private by default: ZenExpander keeps your shortcuts in this browser. No account, upload, telemetry, or installation.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="onboarding-actions">
          <button className="button button-primary" onClick={onCreate}>Create local config</button>
          <label className="button button-secondary file-button">
            Import existing config
            <input type="file" accept="application/json,.json" onChange={onImport} />
          </label>
        </div>
        <div className="privacy-line"><LockKey /> Stored in this browser’s IndexedDB · never uploaded</div>
      </section>
    </main>
  );
}

function Header({ page, onPage, onImport, onExport, savedLabel, bridge }) {
  return (
    <>
      <header className="app-header">
        <Brand />
        <nav className="primary-nav" aria-label="ZenExpander sections">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "is-active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => onPage(item.id)}
            >
              <span className="nav-label">{item.label}</span>
              <small className="nav-note">{item.note}</small>
            </button>
          ))}
        </nav>
        <div className="save-trust" title={bridge.message}>
          <ShieldCheck weight="regular" />
          <span>{savedLabel}</span>
          <b>Never uploaded</b>
        </div>
        <div className="header-actions">
          <label className="text-action file-button" aria-label="Import config">
            <DownloadSimple /> Import
            <input type="file" accept="application/json,.json" onChange={onImport} />
          </label>
          <button className="text-action" aria-label="Export config" onClick={onExport}><UploadSimple /> Export</button>
        </div>
      </header>
    </>
  );
}

function BookmarkletLink({ href, onToast }) {
  const linkRef = useRef(null);
  useEffect(() => {
    if (href && linkRef.current) linkRef.current.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={linkRef}
      className="bookmarklet-button"
      href="#install-bookmarklet"
      onClick={(event) => { event.preventDefault(); onToast("Drag this button to your browser’s bookmarks bar."); }}
    >
      <LinkSimple /> ZenExpander
    </a>
  );
}

function ExpansionTabs({ config, activeId, pendingId, onSelect, onClose, onNew }) {
  return (
    <div className="tabs" role="tablist" aria-label="Saved expansions">
      {config.expansions.filter((item) => item.id !== pendingId).map((item) => (
        <span className={activeId === item.id ? "tab-shell is-active" : "tab-shell"} role="presentation" key={item.id}>
          <button
            role="tab"
            aria-selected={activeId === item.id}
            className="tab"
            onClick={() => onSelect(item.id)}
          >
            <span>{config.prefix}{item.shortcut}</span>
          </button>
          <button
            className="tab-delete"
            aria-label={`Delete ${config.prefix}${item.shortcut}`}
            onClick={() => onClose(item.id)}
          ><X aria-hidden="true" /></button>
        </span>
      ))}
      <button className="new-tab" onClick={onNew}><Plus /> New</button>
    </div>
  );
}

function ExpansionBasics({ config, expansion, onChange }) {
  return (
    <div className="basic-fields">
      <label>
        <span>Prefix</span>
        <input value={config.prefix} disabled aria-label="Global prefix" />
      </label>
      <label>
        <span>Shortcut</span>
        <input
          value={expansion.shortcut}
          onChange={(event) => onChange({ shortcut: normalizeShortcut(event.target.value) })}
          aria-label="Shortcut keyword"
        />
      </label>
      <label>
        <span>Type</span>
        <span className="select-wrap">
          <TypeIcon type={expansion.type} />
          <select value={expansion.type} onChange={(event) => onChange(convertType(expansion, event.target.value))}>
            <option value="direct">Direct</option>
            <option value="choice">Choices</option>
            <option value="random">Random</option>
          </select>
          <CaretDown aria-hidden="true" />
        </span>
      </label>
    </div>
  );
}

function convertType(expansion, type) {
  if (type === "direct") return { type, text: expansion.text ?? (expansionPreview(expansion) || "New response") };
  if (type === "random") return { type, variants: expansion.variants ?? [expansionPreview(expansion) || "Option one", "Option two"] };
  return {
    type,
    template: expansion.template ?? `${expansionPreview(expansion) || "Choose"} {{Option}}`,
    fields: expansion.fields ?? [{ id: makeId("field"), name: "Option", options: ["First choice", "Second choice"] }],
  };
}

function SentencePreview({ expansion, values, onValue, interactive = true }) {
  return (
    <span className="sentence-preview">
      {templateParts(expansion.template).map((part, index) => {
        if (part.type === "text") return <span key={`${part.value}-${index}`}>{part.value}</span>;
        const field = expansion.fields.find((item) => item.name === part.value);
        if (!field) return <span className="missing-field" key={`${part.value}-${index}`}>[{part.value}]</span>;
        if (!interactive) return <button className="sentence-token" type="button" key={`${part.value}-${index}`}>[{part.value}] <CaretDown /></button>;
        const selectedValue = values[field.name] ?? field.options[0] ?? "";
        const longestLabel = Math.max(field.name.length, ...field.options.map((option) => String(option).length));
        const fieldWidth = Math.min(260, Math.max(112, Math.ceil(longestLabel * 10.5 + 52)));
        return (
          <span className="inline-select" key={`${part.value}-${index}`} style={{ "--choice-width": `${fieldWidth}px` }}>
            <select
              aria-label={field.name}
              title={selectedValue}
              value={selectedValue}
              onChange={(event) => onValue(field.name, event.target.value)}
            >
              {field.options.map((option, optionIndex) => <option key={`${option}-${optionIndex}`}>{option}</option>)}
            </select>
            <CaretDown />
          </span>
        );
      })}
    </span>
  );
}

function ChoiceField({ field, position, open, onToggle, onChange, onRename, onDelete }) {
  const [draftName, setDraftName] = useState(field.name);
  const [nameError, setNameError] = useState("");
  const skipRenameCommit = useRef(false);
  const errorId = `${field.id}-name-error`;
  const nameWidth = Math.min(240, Math.max(72, Math.ceil((draftName || field.name).length * 8.5 + 24)));

  useEffect(() => setDraftName(field.name), [field.name]);

  const commitName = () => {
    const result = onRename(draftName);
    if (!result.valid) {
      setNameError(result.error);
      return;
    }
    setDraftName(result.name);
    setNameError("");
  };

  return (
    <section className={`choice-field ${open ? "is-open" : ""}`}>
      <div className="choice-field-head">
        <button
          className="choice-disclosure"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${field.name} choices`}
          title={`${open ? "Collapse" : "Expand"} ${field.name}`}
        >
          <CaretDown />
        </button>
        <div className="choice-name-line">
          <label className="choice-name-wrap" style={{ width: `${nameWidth}px` }}>
            <span className="visually-hidden">Choice field {position} name</span>
            <input
              className="choice-field-name"
              value={draftName}
              aria-label={`Choice field ${position} name`}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? errorId : undefined}
              onChange={(event) => { setDraftName(event.target.value); setNameError(""); }}
              onBlur={() => {
                if (skipRenameCommit.current) {
                  skipRenameCommit.current = false;
                  return;
                }
                commitName();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  skipRenameCommit.current = true;
                  setDraftName(field.name);
                  setNameError("");
                  event.currentTarget.blur();
                }
              }}
            />
            {nameError && <span className="choice-name-error" id={errorId} role="alert">{nameError}</span>}
          </label>
          <span className="choice-count">({field.options.length} {field.options.length === 1 ? "option" : "options"})</span>
        </div>
        <button className="icon-button" aria-label={`Delete ${field.name}`} onClick={onDelete}><Trash /></button>
      </div>
      {open && (
        <div className="choice-options">
          {field.options.map((option, index) => (
            <div className="option-row" key={`${field.id}-${index}`}>
              <DotsSix aria-hidden="true" />
              <input
                value={option}
                aria-label={`${field.name} option ${index + 1}`}
                onChange={(event) => {
                  const options = [...field.options];
                  options[index] = event.target.value;
                  onChange({ ...field, options });
                }}
              />
              <button
                className="icon-button"
                aria-label={`Delete ${option || `option ${index + 1}`}`}
                onClick={() => onChange({ ...field, options: field.options.filter((_item, itemIndex) => itemIndex !== index) })}
              ><Trash /></button>
            </div>
          ))}
          <button className="inline-action" onClick={() => onChange({ ...field, options: [...field.options, "New option"] })}><Plus /> Add option</button>
        </div>
      )}
    </section>
  );
}

function ChoiceEditor({ expansion, onChange }) {
  const [openFields, setOpenFields] = useState(() => new Set(expansion.fields[0]?.id ? [expansion.fields[0].id] : []));
  const [editingSentence, setEditingSentence] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [fieldName, setFieldName] = useState("");

  const updateField = (field) => onChange({ fields: expansion.fields.map((item) => item.id === field.id ? field : item) });
  const renameField = (field, name) => {
    const result = renameChoiceField(expansion, field.id, name);
    if (result.valid) onChange({ fields: result.fields, template: result.template });
    return result;
  };
  const toggleField = (fieldId) => setOpenFields((current) => {
    const next = new Set(current);
    if (next.has(fieldId)) next.delete(fieldId);
    else next.add(fieldId);
    return next;
  });
  const deleteField = (field) => {
    const fields = expansion.fields.filter((item) => item.id !== field.id);
    const template = normalizeNewlines(expansion.template)
      .replaceAll(`{{${field.name}}}`, "")
      .replace(/[^\S\n]{2,}/g, " ")
      .replace(/[^\S\n]+\n/g, "\n")
      .replace(/\n[^\S\n]+/g, "\n")
      .trim();
    onChange({ fields, template });
    setOpenFields((current) => {
      const next = new Set(current);
      next.delete(field.id);
      return next;
    });
  };
  const addField = () => {
    const name = fieldName.trim().replace(/[\[\]{}]/g, "");
    if (!name || expansion.fields.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    const field = { id: makeId("field"), name, options: ["First choice", "Second choice"] };
    onChange({ fields: [...expansion.fields, field], template: `${expansion.template.trim()} {{${name}}}` });
    setOpenFields((current) => new Set([...current, field.id]));
    setFieldName("");
    setAddingField(false);
  };

  return (
    <>
      <div className="composer" aria-label="Sentence composer">
        <SentencePreview expansion={expansion} interactive={false} />
        <button className="edit-sentence" onClick={() => setEditingSentence((value) => !value)}>{editingSentence ? "Done" : "Edit sentence"}</button>
      </div>
      {editingSentence && (
        <label className="sentence-edit">
          <span>Use [Field name] where a dropdown should appear.</span>
          <textarea
            value={displayTemplate(expansion.template)}
            onChange={(event) => onChange({ template: storedTemplate(event.target.value) })}
          />
        </label>
      )}
      <div className="choice-field-list">
        {expansion.fields.map((field, index) => (
          <ChoiceField
            key={field.id}
            field={field}
            position={index + 1}
            open={openFields.has(field.id)}
            onToggle={() => toggleField(field.id)}
            onChange={updateField}
            onRename={(name) => renameField(field, name)}
            onDelete={() => deleteField(field)}
          />
        ))}
      </div>
      {addingField ? (
        <div className="add-field-form">
          <input autoFocus value={fieldName} onChange={(event) => setFieldName(event.target.value)} placeholder="Field name, e.g. Drink" />
          <button className="button button-primary" onClick={addField}>Add field</button>
          <button className="button button-secondary" onClick={() => setAddingField(false)}>Cancel</button>
        </div>
      ) : (
        <button className="add-field" onClick={() => setAddingField(true)}><Plus /> Add another choice field</button>
      )}
    </>
  );
}

function DirectEditor({ expansion, onChange }) {
  return (
    <label className="plain-editor">
      <span>Text to paste</span>
      <textarea value={expansion.text ?? ""} onChange={(event) => onChange({ text: normalizeNewlines(event.target.value) })} />
      <small>Plain text is inserted immediately after you choose this expansion.</small>
    </label>
  );
}

function RandomEditor({ expansion, onChange }) {
  return (
    <div className="random-editor">
      <p><Shuffle /> ZenExpander picks one option with equal probability and pastes it immediately.</p>
      {(expansion.variants ?? []).map((variant, index) => (
        <div className="option-row" key={`${expansion.id}-${index}`}>
          <span className="chance">1/{expansion.variants.length}</span>
          <input
            value={variant}
            aria-label={`Random option ${index + 1}`}
            onChange={(event) => {
              const variants = [...expansion.variants];
              variants[index] = event.target.value;
              onChange({ variants });
            }}
          />
          <button className="icon-button" aria-label={`Delete random option ${index + 1}`} onClick={() => onChange({ variants: expansion.variants.filter((_item, itemIndex) => itemIndex !== index) })}><Trash /></button>
        </div>
      ))}
      <button className="inline-action" onClick={() => onChange({ variants: [...expansion.variants, "New option"] })}><Plus /> Add random option</button>
    </div>
  );
}

function CommandPopover({ config, onPick }) {
  const [query, setQuery] = useState("menu");
  const results = searchExpansions(config, query).slice(0, 2);
  return (
    <aside className="command-popover" aria-label="Search preview">
      <div className="command-meta">
        <span className="shortcut-hint" aria-label="Press Escape to close"><kbd aria-hidden="true">Esc</kbd><span>to close</span></span>
      </div>
      <div className="command-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Preview search" /><X onClick={() => setQuery("")} /></div>
      <small>Top result</small>
      {results[0] ? (
        <button className="command-result" onClick={() => onPick(results[0].id)}>
          <TypeIcon type={results[0].type} />
          <span><b>{config.prefix}{results[0].shortcut}</b> · {results[0].label}</span>
          <em>{results[0].type === "choice" ? "Choices" : results[0].type}</em>
        </button>
      ) : <p className="command-empty">No matching expansion</p>}
      <div className="command-more">
        {Math.max(0, results.length - 1)} more {results.length === 2 ? "result" : "results"}
      </div>
    </aside>
  );
}

function LivePreview({ config, expansion, onToast }) {
  const initialValues = useMemo(() => Object.fromEntries((expansion.fields ?? []).map((field, index) => [
    field.name,
    index === 0 ? field.options.at(-1) ?? "" : field.options[0] ?? "",
  ])), [expansion]);
  const [values, setValues] = useState(initialValues);
  useEffect(() => setValues(initialValues), [initialValues]);

  const finalText = expansion.type === "choice"
    ? renderChoice(expansion, values)
    : expansion.type === "random"
      ? expansion.variants?.[0] ?? ""
      : expansion.text ?? "";

  const copy = async () => {
    let text = finalText;
    if (expansion.type === "random" && expansion.variants.length) text = expansion.variants[Math.floor(Math.random() * expansion.variants.length)];
    try {
      await navigator.clipboard.writeText(text);
      onToast("Copied for a safe test. Nothing was sent.");
    } catch {
      onToast("Your browser blocked clipboard access. Use the Setup scratchpad instead.");
    }
  };

  return (
    <aside className="preview-pane">
      <div className="preview-content">
        <h2>Ready to try</h2>
        <div className="preview-sentence">
          {expansion.type === "choice"
            ? <SentencePreview expansion={expansion} values={values} onValue={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
            : finalText || <span className="preview-empty">Your expansion will appear here.</span>}
        </div>
        <button
          className="button button-primary preview-button"
          onClick={copy}
        >
          Copy test
        </button>
        <div className="plain-note"><FileText /><p><b>Plain text only</b><span>Nothing is sent until you paste.</span></p></div>
      </div>
      <CommandPopover config={config} onPick={() => {}} />
      <button className="launcher-preview" aria-label="ZenExpander minimized widget"><LeafLogo inverted /></button>
    </aside>
  );
}

function ExpansionsPage({ config, setConfig, savedConfig, onSave, onDiscard, saveState, toast, setToast }) {
  const [activeId, setActiveId] = useState(config.expansions[1]?.id ?? config.expansions[0]?.id);
  const [pendingDelete, setPendingDelete] = useState(null);
  const pendingDeleteRef = useRef(null);
  const deleteTimer = useRef();
  const visibleExpansions = useMemo(
    () => config.expansions.filter((item) => item.id !== pendingDelete?.id),
    [config.expansions, pendingDelete?.id],
  );
  const expansion = visibleExpansions.find((item) => item.id === activeId) ?? visibleExpansions[0];

  useEffect(() => {
    if (!visibleExpansions.some((item) => item.id === activeId)) setActiveId(visibleExpansions[0]?.id);
  }, [activeId, visibleExpansions]);

  useEffect(() => () => {
    window.clearTimeout(deleteTimer.current);
    const item = pendingDeleteRef.current;
    if (item) setConfig((current) => ({
      ...current,
      expansions: current.expansions.filter((expansionItem) => expansionItem.id !== item.id),
    }));
  }, [setConfig]);

  const updateExpansion = (patch) => setConfig((current) => ({
    ...current,
    expansions: current.expansions.map((item) => item.id === expansion.id ? { ...item, ...patch } : item),
  }));
  const addExpansion = () => {
    const item = { id: makeId("expansion"), shortcut: "new", label: "New expansion", type: "direct", text: "Write your response here." };
    setConfig((current) => ({ ...current, expansions: [...current.expansions, item] }));
    setActiveId(item.id);
  };
  const deleteExpansion = (id) => {
    if (config.expansions.length === 1) {
      setToast("Keep at least one expansion in your workspace.");
      return;
    }
    if (pendingDeleteRef.current) {
      setToast("Undo the current deletion or wait a moment before deleting another.");
      return;
    }
    const item = config.expansions.find((candidate) => candidate.id === id);
    if (!item) return;
    const remaining = config.expansions.filter((candidate) => candidate.id !== id);
    pendingDeleteRef.current = item;
    setPendingDelete(item);
    setActiveId(remaining[0]?.id);
    deleteTimer.current = window.setTimeout(() => {
      setConfig((current) => ({
        ...current,
        expansions: current.expansions.filter((candidate) => candidate.id !== id),
      }));
      pendingDeleteRef.current = null;
      setPendingDelete(null);
    }, 7_000);
  };
  const undoDelete = () => {
    window.clearTimeout(deleteTimer.current);
    const item = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (item) setActiveId(item.id);
  };

  if (!expansion) return null;
  return (
    <>
      <ExpansionTabs config={config} activeId={expansion.id} pendingId={pendingDelete?.id} onSelect={setActiveId} onClose={deleteExpansion} onNew={addExpansion} />
      <div className="workbench">
        <main className="editor-pane">
          <h1>What should {config.prefix}{expansion.shortcut || "shortcut"} say?</h1>
          <ExpansionBasics config={config} expansion={expansion} onChange={updateExpansion} />
          {expansion.type === "choice" && <ChoiceEditor key={expansion.id} expansion={expansion} onChange={updateExpansion} />}
          {expansion.type === "direct" && <DirectEditor expansion={expansion} onChange={updateExpansion} />}
          {expansion.type === "random" && <RandomEditor expansion={expansion} onChange={updateExpansion} />}
          <div className="editor-actions">
            <button className="button button-primary" onClick={onSave}>Save expansion</button>
            <span className="autosave"><Check /> {saveState}</span>
            <button className="button button-secondary" onClick={() => onDiscard(savedConfig)}>Discard changes</button>
          </div>
          {pendingDelete && (
            <div className="undo-toast" role="status">
              <span>Deleted {config.prefix}{pendingDelete.shortcut}.</span>
              <button onClick={undoDelete}>Undo</button>
            </div>
          )}
          {toast && <p className="toast" role="status">{toast}</p>}
        </main>
        <LivePreview config={config} expansion={expansion} onToast={setToast} />
      </div>
    </>
  );
}

function moveCaretToEnd(target) {
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function Scratchpad({ config, onToast }) {
  const editorRef = useRef(null);
  const [trigger, setTrigger] = useState(null);
  const [choice, setChoice] = useState(null);

  const inspect = useCallback((source) => {
    const escapedPrefix = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`(?:^|\\s)${escapedPrefix}([a-z0-9_-]*)$`, "i"));
    if (!match) {
      setTrigger(null);
      return;
    }
    setTrigger({
      length: match[0].trimStart().length,
      results: searchExpansions(config, match[1]).slice(0, 5),
    });
  }, [config]);

  const insert = useCallback((text) => {
    const editor = editorRef.current;
    if (!editor || !trigger) return;
    const source = normalizeNewlines(editor.innerText ?? editor.textContent ?? "");
    const finalText = normalizeNewlines(text);
    editor.textContent = `${source.slice(0, Math.max(0, source.length - trigger.length))}${finalText}`;
    setTrigger(null);
    setChoice(null);
    editor.focus();
    moveCaretToEnd(editor);
    onToast("Scratchpad expanded locally. Nothing was sent.");
  }, [onToast, trigger]);

  const choose = useCallback((expansion) => {
    if (expansion.type === "choice") {
      setChoice({
        expansion,
        values: Object.fromEntries(expansion.fields.map((field) => [field.name, field.options[0] ?? ""])),
      });
      return;
    }
    const text = expansion.type === "random"
      ? expansion.variants[Math.floor(Math.random() * expansion.variants.length)]
      : expansion.text;
    insert(text);
  }, [insert]);

  return (
    <div className="scratchpad-wrap">
      <div
        ref={editorRef}
        className="scratchpad"
        contentEditable
        suppressContentEditableWarning
        role="combobox"
        aria-label="ZenExpander test scratchpad"
        aria-autocomplete="list"
        aria-controls="zen-scratch-results"
        aria-expanded={Boolean(trigger && !choice)}
        aria-haspopup="listbox"
        data-placeholder="Type ;hello here…"
        onInput={(event) => inspect(normalizeNewlines(event.currentTarget.innerText ?? event.currentTarget.textContent ?? ""))}
      />
      {trigger && !choice && (
        <div id="zen-scratch-results" className="scratch-results" role="listbox" aria-label="Matching scratchpad expansions">
          {trigger.results.length ? trigger.results.map((expansion) => (
            <button key={expansion.id} role="option" aria-selected="false" onClick={() => choose(expansion)}>
              <TypeIcon type={expansion.type} />
              <span><b>{config.prefix}{expansion.shortcut}</b>{expansion.label}</span>
              <em>{expansion.type === "choice" ? "Choices" : expansion.type}</em>
            </button>
          )) : <p>No matching expansion.</p>}
        </div>
      )}
      {choice && (
        <div
          className="scratch-choice"
          aria-label={`${config.prefix}${choice.expansion.shortcut} choices`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setChoice(null);
              return;
            }
            if (event.key === "Enter" && !event.isComposing && !(event.target instanceof HTMLSelectElement)) {
              event.preventDefault();
              insert(renderChoice(choice.expansion, choice.values));
            }
          }}
        >
          <p>{renderChoice(choice.expansion, choice.values)}</p>
          <div className="scratch-choice-fields">
            {choice.expansion.fields.map((field, fieldIndex) => (
              <label key={field.id}>{field.name}
                <select
                  autoFocus={fieldIndex === 0}
                  value={choice.values[field.name]}
                  onChange={(event) => setChoice((current) => ({
                    ...current,
                    values: { ...current.values, [field.name]: event.target.value },
                  }))}
                >
                  {field.options.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="scratch-choice-actions">
            <button
              className="button button-primary button-shortcut"
              aria-keyshortcuts="Enter"
              onClick={() => insert(renderChoice(choice.expansion, choice.values))}
            ><span>Confirm & paste</span><kbd aria-hidden="true">Enter</kbd></button>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupPage({ config, bookmarkletHref, bridge, onToast }) {
  return (
    <main className="secondary-page setup-page">
      <h1>Add ZenExpander to your bookmarks bar.</h1>
      <p className="lede">Chrome and Edge desktop need no extension or executable. Keep this configurator open, then drag the button below to your bookmarks bar.</p>
      <div className="setup-grid">
        <section className="setup-step">
          <span>01</span><h2>Show the bookmarks bar</h2><p>Press Ctrl+Shift+B in Chrome or Edge.</p>
        </section>
        <section className="setup-step setup-drag">
          <span>02</span><h2>Drag this button</h2>
          {bookmarkletHref
            ? <BookmarkletLink href={bookmarkletHref} onToast={onToast} />
            : <button className="bookmarklet-button" disabled>Preparing bookmarklet…</button>}
          <p>Do not click—drag it into the bar. Delete an older ZenExpander bookmark first.</p>
        </section>
        <section className="setup-step">
          <span>03</span><h2>Open it on a page</h2><p>Click ZenExpander in the bookmarks bar. A helper tab connects and closes.</p>
        </section>
        <section className="setup-step">
          <span>04</span><h2>Optional: use related tabs</h2><p>From the widget, choose <strong>Use in new tabs</strong> and review the exact site before allowing it for this browser session.</p>
        </section>
      </div>
      <section className="new-tabs-guide" aria-labelledby="new-tabs-title">
        <div>
          <h2 id="new-tabs-title">Useful for trusted, same-site pop-outs.</h2>
          <p>Good fits include CRM ticket windows, same-origin administration tabs, webmail compose windows, and knowledge-base articles opened by the current page.</p>
        </div>
        <div>
          <h3>Best effort, with a dependable fallback</h3>
          <p>Only the same scheme, hostname, and port are included. Subdomains, different ports, cross-origin pages, isolated windows, and tabs the site does not expose safely still need the ZenExpander bookmark.</p>
        </div>
      </section>
      <p className="recovery-note"><strong>Keep a recovery copy.</strong> Export before switching browsers or clearing this site’s data. New-tab consent is never included in exports.</p>
      <section className="safe-test">
        <div>
          <h2>Test safely without sending anything.</h2>
          <p>Click below, type <code>;hello</code>, then choose the result. Enter is only captured while ZenExpander owns its menu.</p>
        </div>
        <Scratchpad config={config} onToast={onToast} />
      </section>
      <div className={`bridge-state ${bridge.connected ? "is-ready" : ""}`}><ShieldCheck /> {bridge.message}</div>
      <section className="google-chat-note">
        <WarningCircle />
        <div><h2>Google Chat acceptance test</h2><p>Test inside the message composer, confirm the words appear, then clear the draft. Do not press Enter or Send.</p></div>
      </section>
    </main>
  );
}

function PreferencesPage({ config, setConfig }) {
  const updateSettings = (patch) => setConfig((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  return (
    <main className="secondary-page preferences-page">
      <h1>Preferences</h1>
      <section className="preference-row">
        <div><h2>Special symbol</h2><p>Typing this symbol opens matching expansions beside the active text box.</p></div>
        <input className="prefix-input" maxLength="1" value={config.prefix} onChange={(event) => setConfig((current) => ({ ...current, prefix: event.target.value.slice(-1) || ";" }))} aria-label="Global prefix" />
      </section>
      <section className="preference-row">
        <div><h2>Search shortcut</h2><p>Open search without typing the special symbol.</p></div>
        <span className="keycap"><Keyboard /> Ctrl + Shift + Space</span>
      </section>
      <label className="preference-row switch-row">
        <div><h2>Open on special symbol</h2><p>Watch only the active text box for shortcuts beginning with {config.prefix}.</p></div>
        <input type="checkbox" checked={config.settings.prefixTrigger} onChange={(event) => updateSettings({ prefixTrigger: event.target.checked })} />
      </label>
      <label className="preference-row switch-row warning-row">
        <div><h2>CapsLock search <span>Experimental</span></h2><p>CapsLock can conflict with typing and page shortcuts. The safe default remains Ctrl+Shift+Space.</p></div>
        <input type="checkbox" checked={config.settings.experimentalCapsLock} onChange={(event) => updateSettings({ experimentalCapsLock: event.target.checked })} />
      </label>
      <section className="preference-row">
        <div><h2>New tabs stay site-controlled</h2><p>Turn this on from the widget only after reviewing the exact origin. Consent lasts for the browser session and is never saved, synced, or exported.</p></div>
        <span className="session-label">Session only</span>
      </section>
      <section className="privacy-card">
        <LockKey /><div><h2>Privacy boundary</h2><p>ZenExpander stores configuration locally, never reads the clipboard, never runs code from configuration, and disables itself in password, payment, and one-time-code fields. Do not save passwords, authentication keys, or sensitive records, and enable new tabs only on origins you trust.</p></div>
      </section>
    </main>
  );
}

function ImportDialog({ data, onCancel, onConfirm }) {
  if (!data) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <button className="dialog-close" onClick={onCancel} aria-label="Close import preview"><X /></button>
        <h2 id="import-title">Review before replacing this browser’s config.</h2>
        {data.preview.valid ? (
          <>
            <div className="import-counts">
              <div><b>{data.preview.additions}</b><span>Additions</span></div>
              <div><b>{data.preview.replacements}</b><span>Replacements</span></div>
              <div><b>{data.preview.unchanged}</b><span>Unchanged</span></div>
            </div>
            <p>Your current config is not changed until you confirm. Export it first if you want a recovery copy.</p>
            <div className="dialog-actions"><button className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" onClick={onConfirm}>Import config</button></div>
          </>
        ) : (
          <>
            <div className="notice notice-error"><WarningCircle /><div><b>This file was not imported.</b><ul>{data.preview.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul></div></div>
            <div className="dialog-actions"><button className="button button-secondary" onClick={onCancel}>Close</button></div>
          </>
        )}
      </section>
    </div>
  );
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState(null);
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [page, setPage] = useState("expansions");
  const [saveState, setSaveState] = useState("Saved on this browser");
  const [onboardingError, setOnboardingError] = useState("");
  const [importData, setImportData] = useState(null);
  const [bookmarkletTemplate, setBookmarkletTemplate] = useState("");
  const [toast, setToast] = useState("");
  const [bridge, setBridge] = useState({ connected: false, message: "Preparing widget bridge…" });
  const autosaveTimer = useRef();

  useEffect(() => {
    loadWorkspace()
      .then((record) => {
        if (record?.config) {
          const next = normalizeConfig(record.config);
          setWorkspace({ ...record, config: next });
          setConfig(next);
          setSavedConfig(cloneConfig(next));
        }
      })
      .catch(() => setOnboardingError("Your browser could not open local storage for this site."))
      .finally(() => setLoading(false));
    fetch(`${import.meta.env.BASE_URL}zenexpander-bookmarklet.txt`)
      .then((response) => response.ok ? response.text() : "")
      .then((text) => setBookmarkletTemplate(text.trim()))
      .catch(() => setBookmarkletTemplate(""));
  }, []);

  useEffect(() => {
    if (!workspace?.pairingToken) return undefined;
    return connectConfigurator(workspace, setBridge);
  }, [workspace?.pairingToken]);

  useEffect(() => {
    if (!workspace || !config) return;
    window.clearTimeout(autosaveTimer.current);
    setSaveState("Saving locally…");
    autosaveTimer.current = window.setTimeout(async () => {
      const validation = validateConfig(config);
      if (!validation.valid) {
        setSaveState(validation.errors[0]);
        return;
      }
      try {
        const record = await saveWorkspace({ ...workspace, config: normalizeConfig(config) });
        setWorkspace(record);
        setSavedConfig(cloneConfig(record.config));
        setSaveState("Autosaved just now");
        updateConfiguratorWorkspace(record);
      } catch {
        setSaveState("Could not save locally");
      }
    }, 500);
    return () => window.clearTimeout(autosaveTimer.current);
  }, [config]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createWorkspace = useCallback(async (initialConfig = cloneConfig(DEFAULT_CONFIG)) => {
    try {
      const record = await saveWorkspace({ pairingToken: createPairingToken(), config: normalizeConfig(initialConfig) });
      setWorkspace(record);
      setConfig(record.config);
      setSavedConfig(cloneConfig(record.config));
      setOnboardingError("");
    } catch {
      setOnboardingError("Your browser could not create the local workspace. Check site storage permissions.");
    }
  }, []);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_CONFIG_FILE_BYTES) {
      setImportData({ config: null, preview: { valid: false, errors: ["This config is larger than the 1 MB safety limit."], additions: 0, replacements: 0, unchanged: 0 } });
      return;
    }
    try {
      const incoming = JSON.parse(await file.text());
      const current = config ?? cloneConfig(DEFAULT_CONFIG);
      setImportData({ config: incoming, preview: importPreview(current, incoming) });
    } catch {
      setImportData({ config: null, preview: { valid: false, errors: ["This is not a readable JSON config file."], additions: 0, replacements: 0, unchanged: 0 } });
    }
  };

  const confirmImport = async () => {
    const next = normalizeConfig(importData.config);
    if (!workspace) await createWorkspace(next);
    else setConfig(next);
    setImportData(null);
    setPage("expansions");
    setToast("Config imported locally.");
  };

  const saveNow = async () => {
    const validation = validateConfig(config);
    if (!validation.valid) {
      setToast(validation.errors[0]);
      return;
    }
    const record = await saveWorkspace({ ...workspace, config: normalizeConfig(config) });
    setWorkspace(record);
    setSavedConfig(cloneConfig(record.config));
    setSaveState("Saved just now");
    updateConfiguratorWorkspace(record);
  };

  const exportConfig = () => {
    const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = CONFIG_FILE_NAME;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Recovery config downloaded.");
  };

  const bookmarkletHref = useMemo(() => {
    if (!workspace?.pairingToken || !bookmarkletTemplate) return "";
    const bridgeUrl = new URL(`${import.meta.env.BASE_URL}zenexpander-bridge.html`, window.location.href).href;
    return bookmarkletTemplate
      .replace("__ZENEXPANDER_PAIRING_TOKEN__", workspace.pairingToken)
      .replace("__ZENEXPANDER_BRIDGE_URL__", encodeURIComponent(bridgeUrl));
  }, [bookmarkletTemplate, workspace?.pairingToken]);

  if (loading) return <main className="loading-screen"><Brand /><p>Opening your private workspace…</p></main>;
  if (!workspace || !config) {
    return (
      <>
        <Onboarding onCreate={() => createWorkspace()} onImport={handleImport} error={onboardingError} />
        <ImportDialog data={importData} onCancel={() => setImportData(null)} onConfirm={confirmImport} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Header
        page={page}
        onPage={setPage}
        onImport={handleImport}
        onExport={exportConfig}
        savedLabel={saveState.includes("Saved") || saveState.includes("Autosaved") ? "Saved on this browser" : saveState}
        bridge={bridge}
      />
      {page === "expansions" && (
        <ExpansionsPage
          config={config}
          setConfig={setConfig}
          savedConfig={savedConfig}
          onSave={saveNow}
          onDiscard={(value) => { setConfig(cloneConfig(value)); setToast("Changes discarded."); }}
          saveState={saveState}
          toast={toast}
          setToast={setToast}
        />
      )}
      {page === "setup" && <SetupPage config={config} bookmarkletHref={bookmarkletHref} bridge={bridge} onToast={setToast} />}
      {page === "preferences" && <PreferencesPage config={config} setConfig={setConfig} />}
      {page !== "expansions" && toast && <p className="global-toast" role="status">{toast}</p>}
      <ImportDialog data={importData} onCancel={() => setImportData(null)} onConfirm={confirmImport} />
    </div>
  );
}
