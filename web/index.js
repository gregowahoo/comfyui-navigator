// comfyui-navigator: floating side panel listing every group in the current
// workflow. Click → animated pan/zoom to that group. Right-click → solo /
// reset (via rgthree FastGroupsMuter if installed, else per-node fallback).

import { app } from "../../scripts/app.js";

// Bump on every release. Exposed on window so it's trivial to check in the
// console (`window.__cnv_version`) whether the browser is on the latest JS
// or still serving a cached older copy.
const CNV_VERSION = "0.3.1";
try {
  window.__cnv_version = CNV_VERSION;
  console.info(`[comfyui-navigator] loaded v${CNV_VERSION}`);
} catch {}

const STYLE_ID = "cnv-styles";
const PANEL_ID = "cnv-panel";
const POS_KEY = "comfyui-navigator.panel-pos";
const COLLAPSE_KEY = "comfyui-navigator.collapsed";
const COLORS_KEY = "comfyui-navigator.colors";
const SHORTCUTS_KEY = "comfyui-navigator.shortcuts";

const COLOR_FIELDS = [
  { key: "--cnv-bg",        label: "Body background",   default: "#0e283f" },
  { key: "--cnv-header-bg", label: "Header bar",        default: "#1e4f88" },
  { key: "--cnv-accent",    label: "Accent (on toggle)",default: "#2864ad" },
  { key: "--cnv-row-hover", label: "Row hover",         default: "#163657" },
];

function loadColors() {
  try {
    const v = localStorage.getItem(COLORS_KEY);
    if (v) return JSON.parse(v);
  } catch {}
  return {};
}
function saveColors(map) {
  try { localStorage.setItem(COLORS_KEY, JSON.stringify(map)); } catch {}
}
function applyColors(panel) {
  const stored = loadColors();
  for (const { key, default: def } of COLOR_FIELDS) {
    panel.style.setProperty(key, stored[key] || def);
  }
}

/** Shortcuts are stored as { "key char": "Group Title" }.
 *  Defaults (when nothing is set): 1..9 → first 9 navigable groups by order. */
function loadShortcuts() {
  try {
    const v = localStorage.getItem(SHORTCUTS_KEY);
    if (v) return JSON.parse(v);
  } catch {}
  return null; // null = use defaults
}
function saveShortcuts(map) {
  try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(map)); } catch {}
}
function resolveShortcut(key) {
  const map = loadShortcuts();
  if (map) return map[key] || null;
  // Default: 1..9 → first 9 groups
  if (key >= "1" && key <= "9") {
    const idx = parseInt(key, 10) - 1;
    const g = getNavigableGroups()[idx];
    return g ? groupTitle(g, idx) : null;
  }
  return null;
}

const state = {
  panel: null,
  searchInput: null,
  listEl: null,
  query: "",
  collapsed: false,
};

// --- styles --------------------------------------------------------------

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("./styles.css", import.meta.url).toString();
  document.head.appendChild(link);
}

// --- panel position persistence -----------------------------------------

function loadPanelPos() {
  try {
    const v = localStorage.getItem(POS_KEY);
    if (!v) return null;
    const p = JSON.parse(v);
    if (typeof p?.left === "number" && typeof p?.top === "number") return p;
  } catch {}
  return null;
}

function savePanelPos(left, top) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ left, top })); } catch {}
}

function applyPanelPos(panel) {
  const p = loadPanelPos();
  if (!p) return;
  panel.style.left = `${p.left}px`;
  panel.style.top = `${p.top}px`;
  panel.style.right = "auto";
}

// --- drag wiring (header is the handle) ---------------------------------

function installPanelDrag(panel, handle) {
  let dragging = false, dx = 0, dy = 0;
  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // Don't initiate drag from buttons in the header
    if (e.target.closest("button")) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    dragging = true;
    panel.classList.add("cnv-panel--dragging");
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const left = Math.max(0, Math.min(window.innerWidth - 50, e.clientX - dx));
    const top = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dy));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("cnv-panel--dragging");
    const r = panel.getBoundingClientRect();
    savePanelPos(r.left, r.top);
  });
}

// --- group access -------------------------------------------------------

function getGroups() {
  return (app.graph?._groups || []).filter(Boolean);
}

/** The groups the panel actually navigates between. If the workflow has any
 *  Fast Groups Muter, we mirror the *primary* one (= the muter with the most
 *  managed widgets). That respects the user's matchColors partition: a sub-
 *  group with a different color belongs to a smaller muter and gets filtered
 *  out of the nav list. If no muter exists, fall back to every group. */
function getNavigableGroups() {
  const all = getGroups();
  const muters = getMutersAndWidgets();
  if (muters.length === 0) return all;
  const primary = muters.reduce((a, b) => (a.widgets.size >= b.widgets.size ? a : b));
  return all.filter((g, i) => primary.widgets.has(groupTitle(g, i)));
}

function groupBounds(g) {
  // LiteGraph stores bounding as [x, y, w, h]
  const b = g._bounding || g.bounding;
  if (b && b.length === 4) return { x: b[0], y: b[1], w: b[2], h: b[3] };
  // Fallback to pos/size
  return {
    x: g.pos?.[0] ?? 0,
    y: g.pos?.[1] ?? 0,
    w: g.size?.[0] ?? 200,
    h: g.size?.[1] ?? 100,
  };
}

function groupColorOrDefault(g) {
  return g.color || "#3b82f6";
}

function groupTitle(g, i) {
  return (g.title || `Group ${i + 1}`).trim();
}

// --- pan + zoom to fit a bbox -------------------------------------------

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animatePanZoom(targetOffset, targetScale, durationMs = 280) {
  const c = app.canvas;
  if (!c?.ds) return;
  const startOffset = [c.ds.offset[0], c.ds.offset[1]];
  const startScale = c.ds.scale;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const k = easeOutCubic(t);
    c.ds.offset[0] = startOffset[0] + (targetOffset[0] - startOffset[0]) * k;
    c.ds.offset[1] = startOffset[1] + (targetOffset[1] - startOffset[1]) * k;
    c.ds.scale = startScale + (targetScale - startScale) * k;
    c.setDirty?.(true, true);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function fitToBounds(b, padding = 80) {
  const c = app.canvas;
  if (!c?.canvas) return;
  const rect = c.canvas.getBoundingClientRect();
  // Want: visible_area should contain b. visible_area = [-offset, viewport/scale]
  // Compute scale to fit (with padding subtracted from viewport).
  const vwUsable = Math.max(50, rect.width - padding * 2);
  const vhUsable = Math.max(50, rect.height - padding * 2);
  const scaleX = vwUsable / Math.max(1, b.w);
  const scaleY = vhUsable / Math.max(1, b.h);
  let targetScale = Math.min(scaleX, scaleY, 1.0); // never zoom past 100%
  targetScale = Math.max(0.05, targetScale);
  // Compute offset so the group's center lands at the canvas center.
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const targetOffsetX = (rect.width / 2) / targetScale - cx;
  const targetOffsetY = (rect.height / 2) / targetScale - cy;
  animatePanZoom([targetOffsetX, targetOffsetY], targetScale);
}

function jumpToGroup(g) {
  fitToBounds(groupBounds(g));
}

// --- rgthree FastGroupsMuter integration --------------------------------
//
// rgthree's Fast Groups Muter exposes one widget per group:
//   - name:  "RGTHREE_TOGGLE_AND_NAV" (generic — same for every widget)
//   - type:  "custom"
//   - label: "Enable {group_title}"   ← this is the only link back to the group
//   - value: { toggled: bool }        ← OBJECT, not a plain boolean
// A single workflow may have multiple muters (each managing a subset of
// groups), so we scan them all and aggregate.

function findFastGroupsMuters() {
  return (app.graph?._nodes || []).filter((n) => n.type === "Fast Groups Muter (rgthree)");
}

/** Returns [{muter, widgets: Map<groupTitle, widget>}] per muter on the graph.
 *  Per-muter grouping matters: rgthree's `matchColors` property scopes each
 *  muter to a subset of groups, and Solo should only toggle within the muter
 *  that actually owns the target group — touching other muters would clobber
 *  unrelated state in the user's color-coded setup. */
function getMutersAndWidgets() {
  const out = [];
  for (const muter of findFastGroupsMuters()) {
    const widgets = new Map();
    for (const w of (muter.widgets || [])) {
      const label = w?.label || w?.name || "";
      const m = String(label).match(/^Enable\s+(.+)$/);
      if (m) widgets.set(m[1].trim(), w);
    }
    if (widgets.size > 0) out.push({ muter, widgets });
  }
  return out;
}

/** Find the muter that owns this group (first match if multiple). */
function findMuterOwningGroup(targetTitle) {
  for (const entry of getMutersAndWidgets()) {
    if (entry.widgets.has(targetTitle)) return entry;
  }
  return null;
}

function getMuterWidgetForGroup(title) {
  const owner = findMuterOwningGroup(title);
  return owner ? owner.widgets.get(title) : null;
}

function isGroupEnabled(title) {
  const w = getMuterWidgetForGroup(title);
  return w ? !!w?.value?.toggled : null; // null = no muter manages it
}

function setGroupEnabled(title, on) {
  const w = getMuterWidgetForGroup(title);
  if (!w) return false;
  setMuterWidget(w, on);
  const owner = findMuterOwningGroup(title);
  owner?.muter?.setDirtyCanvas?.(true, true);
  return true;
}

function setMuterWidget(widget, toggled) {
  // rgthree's FastGroupsToggleRowWidget exposes a `toggle(value)` method that
  // not only flips widget.value.toggled but ALSO calls doModeChange(), which
  // is the actual work — changing node.mode of every node inside the group.
  // Without doModeChange, rgthree's periodic observer re-checks node modes,
  // sees no change, and reverts widget.toggled back to its old state (= the
  // "comes back and says no" symptom).
  try {
    if (typeof widget.toggle === "function") {
      widget.toggle(!!toggled);
      return;
    }
  } catch (e) { console.warn("[comfyui-navigator] widget.toggle() threw:", e); }
  // Fallback for unknown widget shapes — set the value and hope.
  try {
    const next = { ...(widget.value || {}), toggled: !!toggled };
    widget.value = next;
    if (typeof widget.callback === "function") widget.callback(next);
  } catch (e) { console.warn("[comfyui-navigator] fallback widget set threw:", e); }
}

/** Reset = turn every widget on, across every muter. */
function setAllMutersTo(toggled) {
  let count = 0;
  for (const { muter, widgets } of getMutersAndWidgets()) {
    for (const widget of widgets.values()) {
      setMuterWidget(widget, toggled);
      count++;
    }
    muter.setDirtyCanvas?.(true, true);
  }
  return count;
}

/** Solo only inside the muter that owns this group. Other muters untouched. */
function soloGroupViaMuter(targetTitle) {
  const owner = findMuterOwningGroup(targetTitle);
  if (!owner) return false;
  for (const [title, widget] of owner.widgets) {
    setMuterWidget(widget, title === targetTitle);
  }
  owner.muter.setDirtyCanvas?.(true, true);
  return true;
}

// Fallback: directly set LiteGraph mode on every node, based on whether
// the node's center is inside the soloed group's bounds.
function soloGroupViaModeFlag(targetGroup) {
  const b = groupBounds(targetGroup);
  const NEVER = (window.LiteGraph?.NEVER ?? 2);
  const ALWAYS = (window.LiteGraph?.ALWAYS ?? 0);
  for (const n of (app.graph?._nodes || [])) {
    const nx = (n.pos?.[0] || 0) + (n.size?.[0] || 0) / 2;
    const ny = (n.pos?.[1] || 0) + (n.size?.[1] || 0) / 2;
    const inside = nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h;
    n.__cnv_pre_solo_mode = n.__cnv_pre_solo_mode ?? n.mode;
    n.mode = inside ? ALWAYS : NEVER;
  }
  app.canvas?.setDirty?.(true, true);
}

function resetSoloModeFlags() {
  for (const n of (app.graph?._nodes || [])) {
    if (n.__cnv_pre_solo_mode !== undefined) {
      n.mode = n.__cnv_pre_solo_mode;
      delete n.__cnv_pre_solo_mode;
    }
  }
  app.canvas?.setDirty?.(true, true);
}

function soloGroup(g) {
  const muters = findFastGroupsMuters();
  if (muters.length) {
    const title = groupTitle(g, 0);
    const ok = soloGroupViaMuter(title);
    if (!ok) {
      console.warn(`[comfyui-navigator] muter present but no widget matched group title "${title}". Falling back to per-node mode flag.`);
      soloGroupViaModeFlag(g);
    }
  } else {
    soloGroupViaModeFlag(g);
  }
}

function resetMuteAll() {
  const muters = findFastGroupsMuters();
  if (muters.length) setAllMutersTo(true);
  else resetSoloModeFlags();
}

// --- right-click chip menu ---------------------------------------------

async function queuePromptSafely() {
  // Try the standard app.queuePrompt API path first; fall back to clicking
  // the Run button if the API shape changes.
  try {
    if (typeof app.queuePrompt === "function") {
      await app.queuePrompt(0); // 0 = end of queue
      return true;
    }
  } catch (e) { console.warn("[comfyui-navigator] app.queuePrompt threw:", e); }
  // Fallback: simulate a click on the Run button
  const runBtn = Array.from(document.querySelectorAll("button")).find((b) => /^run( |$)/i.test(b.textContent.trim()));
  if (runBtn) { runBtn.click(); return true; }
  console.warn("[comfyui-navigator] could not queue prompt — no API and no Run button found");
  return false;
}

function openRowMenu(g, evt) {
  const muterCount = findFastGroupsMuters().length;
  const muterScope = muterCount ? `via ${muterCount} rgthree muter${muterCount === 1 ? "" : "s"}` : "per-node fallback";
  const opts = [
    { content: "Jump here", callback: () => jumpToGroup(g) },
    { content: "Center only (no zoom change)", callback: () => {
      const b = groupBounds(g);
      const c = app.canvas;
      if (!c?.ds || !c.canvas) return;
      const rect = c.canvas.getBoundingClientRect();
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const targetOffsetX = (rect.width / 2) / c.ds.scale - cx;
      const targetOffsetY = (rect.height / 2) / c.ds.scale - cy;
      animatePanZoom([targetOffsetX, targetOffsetY], c.ds.scale);
    }},
    null,
    {
      content: `Run only this group  (${muterScope})`,
      callback: async () => {
        soloGroup(g);
        await new Promise((r) => setTimeout(r, 60));
        await queuePromptSafely();
      },
    },
    {
      content: `Mute other groups  (${muterScope})`,
      callback: () => soloGroup(g),
    },
    null,
    { content: "Reset (enable all groups)", callback: () => resetMuteAll() },
  ];
  new LiteGraph.ContextMenu(opts, { event: evt });
}

// --- panel render -------------------------------------------------------

function ensurePanel() {
  if (state.panel) return state.panel;
  ensureStyles();
  const panel = document.createElement("div");
  panel.className = "cnv-panel";
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="cnv-panel__header">
      <span class="cnv-panel__header-grip">⋮⋮</span>
      <span class="cnv-panel__header-title">Workflow Groups</span>
      <span class="cnv-panel__header-count">0</span>
      <button class="cnv-panel__header-collapse" type="button" title="Collapse / expand">▾</button>
    </div>
    <div class="cnv-panel__toolbar">
      <button class="cnv-tb-btn" type="button" data-action="enable-all" title="Turn every group ON">Enable All</button>
      <button class="cnv-tb-btn" type="button" data-action="disable-all" title="Turn every group OFF">Disable All</button>
      <span class="cnv-tb-spacer"></span>
      <button class="cnv-tb-btn cnv-tb-btn--icon" type="button" data-action="settings" title="Settings: colors, shortcuts">⚙</button>
    </div>
    <div class="cnv-settings" data-settings></div>
    <div class="cnv-panel__list"></div>
  `;
  document.body.appendChild(panel);
  state.panel = panel;
  state.listEl = panel.querySelector(".cnv-panel__list");
  const header = panel.querySelector(".cnv-panel__header");
  installPanelDrag(panel, header);
  applyPanelPos(panel);

  // Toolbar actions
  panel.querySelector('[data-action="enable-all"]').addEventListener("click", (e) => {
    e.stopPropagation();
    setAllMutersTo(true);
  });
  panel.querySelector('[data-action="disable-all"]').addEventListener("click", (e) => {
    e.stopPropagation();
    setAllMutersTo(false);
  });
  const settingsEl = panel.querySelector("[data-settings]");
  panel.querySelector('[data-action="settings"]').addEventListener("click", (e) => {
    e.stopPropagation();
    const open = settingsEl.classList.toggle("cnv-settings--open");
    if (open) buildSettings(settingsEl);
  });

  // Apply saved colors on initial render
  applyColors(panel);

  const collapseBtn = panel.querySelector(".cnv-panel__header-collapse");
  try { state.collapsed = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch {}
  applyCollapsed();
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.collapsed = !state.collapsed;
    try { localStorage.setItem(COLLAPSE_KEY, state.collapsed ? "1" : "0"); } catch {}
    applyCollapsed();
  });

  return panel;
}

function buildSettings(el) {
  const stored = loadColors();
  const shortcuts = loadShortcuts() || {};
  const groups = getNavigableGroups().map((g, i) => groupTitle(g, i));

  // Colors section
  const colorRows = COLOR_FIELDS.map(({ key, label, default: def }) => `
    <div class="cnv-color-row">
      <span class="cnv-color-row__label">${label}</span>
      <input type="color" data-color-key="${key}" value="${stored[key] || def}">
    </div>
  `).join("");

  // Shortcuts section
  const shortcutEntries = Object.entries(shortcuts);
  const shortcutRows = shortcutEntries.map(([key, title]) => renderShortcutRow(key, title, groups)).join("");

  el.innerHTML = `
    <div>
      <div class="cnv-settings__section-title">Colors</div>
      ${colorRows}
    </div>
    <div>
      <div class="cnv-settings__section-title">Keyboard shortcuts ${shortcutEntries.length === 0 ? "(default: 1–9 jump to first 9 groups)" : "(overrides defaults)"}</div>
      <div data-shortcut-list>${shortcutRows}</div>
      <button class="cnv-settings__add-btn" type="button" data-add-shortcut>+ Add shortcut</button>
    </div>
    <button class="cnv-settings__reset" type="button" data-reset>Reset all settings</button>
  `;

  // Color picker handlers
  for (const input of el.querySelectorAll('input[type="color"]')) {
    input.addEventListener("input", () => {
      const next = { ...loadColors(), [input.dataset.colorKey]: input.value };
      saveColors(next);
      applyColors(state.panel);
    });
  }

  // Shortcut row handlers (delegated)
  const list = el.querySelector("[data-shortcut-list]");
  list.addEventListener("change", onShortcutChange);
  list.addEventListener("click", (e) => {
    if (e.target.matches("[data-remove]")) {
      const row = e.target.closest(".cnv-shortcut-row");
      row?.remove();
      persistShortcutsFromDom(el);
    }
  });

  // Add-shortcut button
  el.querySelector("[data-add-shortcut]").addEventListener("click", () => {
    const tmp = document.createElement("div");
    tmp.innerHTML = renderShortcutRow("", "", groups);
    list.appendChild(tmp.firstElementChild);
    persistShortcutsFromDom(el);
  });

  // Reset
  el.querySelector("[data-reset]").addEventListener("click", () => {
    if (!confirm("Reset all colors and shortcuts to defaults?")) return;
    try { localStorage.removeItem(COLORS_KEY); } catch {}
    try { localStorage.removeItem(SHORTCUTS_KEY); } catch {}
    applyColors(state.panel);
    buildSettings(el);
  });
}

function renderShortcutRow(key, title, groups) {
  const options = ['<option value="">— select group —</option>']
    .concat(groups.map((g) => `<option value="${escapeAttr(g)}" ${g === title ? "selected" : ""}>${escapeHtml(g)}</option>`))
    .join("");
  return `
    <div class="cnv-shortcut-row">
      <input class="cnv-shortcut-row__key" data-shortcut-key value="${escapeAttr(key)}" maxlength="1" placeholder="?">
      <select class="cnv-shortcut-row__group" data-shortcut-group>${options}</select>
      <button class="cnv-shortcut-row__remove" type="button" data-remove title="Remove">×</button>
    </div>
  `;
}

function onShortcutChange(e) {
  if (e.target.matches("[data-shortcut-key], [data-shortcut-group]")) {
    // Normalize key to lowercase single char
    if (e.target.matches("[data-shortcut-key]")) {
      e.target.value = (e.target.value || "").slice(0, 1).toLowerCase();
    }
    persistShortcutsFromDom(state.panel.querySelector("[data-settings]"));
  }
}

function persistShortcutsFromDom(settingsEl) {
  const map = {};
  for (const row of settingsEl.querySelectorAll(".cnv-shortcut-row")) {
    const k = row.querySelector("[data-shortcut-key]").value.trim();
    const g = row.querySelector("[data-shortcut-group]").value;
    if (k && g) map[k] = g;
  }
  saveShortcuts(map);
}

function escapeAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function applyCollapsed() {
  if (!state.panel) return;
  state.panel.classList.toggle("cnv-panel--collapsed", state.collapsed);
  const btn = state.panel.querySelector(".cnv-panel__header-collapse");
  if (btn) btn.textContent = state.collapsed ? "▸" : "▾";
}

function renderList() {
  const panel = ensurePanel();
  const allGroupCount = getGroups().length;
  const groups = getNavigableGroups();
  const countEl = panel.querySelector(".cnv-panel__header-count");
  const filteredOut = allGroupCount - groups.length;
  countEl.textContent = filteredOut > 0
    ? `${groups.length} / ${allGroupCount}`
    : String(groups.length);
  countEl.title = filteredOut > 0
    ? `Showing ${groups.length} groups (${filteredOut} sub-group${filteredOut === 1 ? "" : "s"} hidden via matchColors)`
    : `${groups.length} groups`;

  // Hide panel entirely if fewer than 2 groups (nothing to navigate between)
  if (groups.length < 2) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";

  state.listEl.replaceChildren();
  for (const { g, i, title } of groups.map((g, i) => ({ g, i, title: groupTitle(g, i) }))) {
    const row = document.createElement("div");
    row.className = "cnv-row";
    row.dataset.title = title;

    const enabled = isGroupEnabled(title);
    const hasMuter = enabled !== null;

    const toggleHtml = hasMuter
      ? `<span class="cnv-toggle ${enabled ? "cnv-toggle--on" : ""}" data-toggle title="Click to toggle"><span class="cnv-toggle__label">${enabled ? "yes" : "no"}</span><span class="cnv-toggle__knob"></span></span>`
      : `<span class="cnv-toggle cnv-toggle--placeholder" title="No muter manages this group"><span class="cnv-toggle__label">—</span><span class="cnv-toggle__knob"></span></span>`;

    row.innerHTML = `
      <span class="cnv-row__title"></span>
      ${i < 9 ? `<span class="cnv-row__shortcut">${i + 1}</span>` : ""}
      ${toggleHtml}
    `;
    row.querySelector(".cnv-row__title").textContent = title;

    // Toggle pill: flip muter widget; don't jump
    const toggle = row.querySelector("[data-toggle]");
    if (toggle) {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const newState = !isGroupEnabled(title);
        setGroupEnabled(title, newState);
        toggle.classList.toggle("cnv-toggle--on", newState);
        toggle.querySelector(".cnv-toggle__label").textContent = newState ? "yes" : "no";
      });
    }

    // Click anywhere else on the row → jump to that group
    row.addEventListener("click", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".cnv-toggle")) return;
      jumpToGroup(g);
    });

    state.listEl.appendChild(row);
  }
}

/** Cheap re-sync of just the checkbox states without rebuilding the list.
 *  Catches the case where the user toggles a widget directly on the muter
 *  node (or via rgthree's keyboard shortcuts) and we need to reflect it in
 *  the panel. */
function syncCheckboxStates() {
  if (!state.listEl) return;
  for (const row of state.listEl.querySelectorAll(".cnv-row")) {
    const title = row.dataset.title;
    const toggle = row.querySelector(".cnv-toggle[data-toggle]");
    if (!toggle) continue;
    const enabled = isGroupEnabled(title);
    if (enabled === null) continue;
    const labelEl = toggle.querySelector(".cnv-toggle__label");
    const isCurrentlyOn = toggle.classList.contains("cnv-toggle--on");
    if (isCurrentlyOn !== enabled) {
      toggle.classList.toggle("cnv-toggle--on", enabled);
      if (labelEl) labelEl.textContent = enabled ? "yes" : "no";
    }
  }
}

// --- keyboard hotkeys ---------------------------------------------------

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function onKeyDown(e) {
  if (isTypingTarget(document.activeElement)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Single-character keys only — modifier-free
  const k = (e.key || "").toLowerCase();
  if (k.length !== 1) return;
  const targetTitle = resolveShortcut(k);
  if (!targetTitle) return;
  // Find the group whose title matches
  const groups = getNavigableGroups();
  for (let i = 0; i < groups.length; i++) {
    if (groupTitle(groups[i], i) === targetTitle) {
      e.preventDefault();
      jumpToGroup(groups[i]);
      return;
    }
  }
}

// --- lifecycle ----------------------------------------------------------

let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  setTimeout(() => { renderScheduled = false; renderList(); }, 50);
}

app.registerExtension({
  name: "comfyui.navigator",
  async setup() {
    ensureStyles();
    ensurePanel();
    renderList();
    window.addEventListener("keydown", onKeyDown, true);

    // Re-render when groups added / removed / graph swapped
    const origNodeAdded = app.graph.onNodeAdded;
    app.graph.onNodeAdded = function (node) {
      origNodeAdded?.call(this, node);
      scheduleRender();
    };
    const origNodeRemoved = app.graph.onNodeRemoved;
    app.graph.onNodeRemoved = function (node) {
      origNodeRemoved?.call(this, node);
      scheduleRender();
    };

    // Catch graph swaps (loading a different workflow). ComfyUI fires
    // a custom "graphConfigured" or similar; polling _groups length as
    // a cheap fallback. Also re-sync checkbox states so that toggles
    // made directly on the muter node propagate to the panel UI.
    //
    // CRITICAL: also re-render when placeholders could become real toggles.
    // Workflow load + muter-widget construction is async; the panel often
    // renders BEFORE any muter widget exists, baking every row into a
    // placeholder (no click handler). Without this check, the panel stays
    // dead even after widgets become available.
    let lastGroupCount = -1;
    let lastMuterWidgetCount = -1;
    setInterval(() => {
      const n = (app.graph?._groups?.length || 0);
      const muterWidgetCount = (app.graph?._nodes || [])
        .filter((node) => node?.type === "Fast Groups Muter (rgthree)")
        .reduce((sum, m) => sum + (m.widgets?.length || 0), 0);
      const placeholderCount = document.querySelectorAll(".cnv-toggle--placeholder").length;
      const needsRerender =
        n !== lastGroupCount ||
        muterWidgetCount !== lastMuterWidgetCount ||
        (placeholderCount > 0 && muterWidgetCount > 0);
      if (needsRerender) {
        lastGroupCount = n;
        lastMuterWidgetCount = muterWidgetCount;
        scheduleRender();
      } else {
        syncCheckboxStates();
      }
    }, 600);
  },
  async loadedGraphNode() {
    scheduleRender();
  },
});
