let state = { services: [], accounts: [], activeId: null, settings: { theme: 'dark', accent: 'blue', density: 'comfortable', security: {} }, locked: false, hasPassword: false, appVersion: '', runtime: {} };
let currentApp = 'launcher';
// The React account-list module claims #accounts after it is loaded; this event
// triggers one handoff render so the legacy and React renderers never compete after startup.
window.addEventListener('madstation:accounts-react-ready', () => renderAccountsSidebar());
// Notes and To-do list render roots are handed to React after its bundle mounts.
window.addEventListener('madstation:utility-lists-react-ready', () => { renderClipboard(); renderNotes(); renderTodos(); });
// Video Hub icon loads are scoped to one visit. Renders within the visit reuse
// their existing image nodes and share one cache request per remote URL.
let videoHubSessionActive = false;
let videoHubRefreshPending = false;
let videoHubIconSessionGeneration = 0;
let videoHubIconCacheRequests = new Map();
function setVideoHubSessionActive(active) {
  if (videoHubSessionActive === active) return;
  videoHubSessionActive = active;
  videoHubRefreshPending = active;
  if (active) videoHubIconSessionGeneration += 1;
  videoHubIconCacheRequests = new Map();
}
function cacheIconForImage(img, url) {
  if (img?.closest?.('#videoHubScreen')) {
    if (!videoHubSessionActive) return Promise.resolve(null);
    if (!videoHubIconCacheRequests.has(url)) {
      videoHubIconCacheRequests.set(url, Promise.resolve()
        .then(() => window.aiHub.cacheIcon?.(url))
        .catch(() => null));
    }
    return videoHubIconCacheRequests.get(url);
  }
  return window.aiHub.cacheIcon?.(url);
}
let aiLabData = { models: [], votes: [], transcripts: [], settings: {} };
let localModels = [];
let localArenaBattle = null;
let localArenaSelections = { left: '', right: '' };
let localArenaStatus = 'Scan for local models, choose two different models, and enter an instruction.';
let localArenaStatusError = false;
let localArenaResults = { left: null, right: null };
let localArenaRunGeneration = 0;
let localScanMeta = 'Not scanned';
let localScanRunning = false;
let apiArenaBattle = null; // Persisted vote contract: { id, prompt, left, right, choice }
let apiArenaRunGeneration = 0;
let apiArenaUi = { selected: { left: '', right: '' }, prompt: '', running: false, status: 'Choose two API models and enter an instruction.', statusError: false, results: { left: null, right: null } };
let forgeBrowserState = { accountId: null, accountName: '', providerName: '', url: '', title: '', loading: false };
let forgeBrowserLayoutFrame = 0;
let lastForgeBrowserLayoutKey = '';
let settingsScope = 'global';
let settingsReturnApp = 'launcher';
let clipboardItems = [];
const CLIPBOARD_KEY = 'metastation-clipboard-v1';
const CLIPBOARD_SETTINGS_KEY = 'metastation-clipboard-settings-v1';
const CLIPBOARD_DB_NAME = 'mad-station-clipboard';
const CLIPBOARD_DB_VERSION = 1;
const CLIPBOARD_STORE = 'clips';
const MAX_CLIPBOARD_HISTORY_BYTES = 8 * 1024 * 1024;
const DEFAULT_CLIPBOARD_SETTINGS = { maxItems: 250, trimWhitespace: true, confirmClear: true, maxLength: 10000, defaultSort: 'newest', focusComposerOnOpen: false };
const NOTES_KEY = 'metastation-notes-v1';
const TODO_KEY = 'metastation-todos-v1';
const NOTES_SETTINGS_KEY = 'metastation-notes-settings-v1';
const TODO_SETTINGS_KEY = 'metastation-todo-settings-v1';
const DEFAULT_NOTES_SETTINGS = { maxItems: 200, defaultSort: 'newest', confirmDelete: true };
const DEFAULT_TODO_SETTINGS = { maxItems: 200, defaultSort: 'newest', hideCompleted: false, confirmDelete: true };
let notesSettings = { ...DEFAULT_NOTES_SETTINGS };
let todoSettings = { ...DEFAULT_TODO_SETTINGS };
let notes = [];
let todos = [];
let notesComposerDraft = { editingId: null, title: '', body: '' };
let notesSearchQuery = '';
let notesSettingsReturnFocus = null;
let utilityTab = 'clipboard';
let todoFilter = 'all';
let clipboardSettings = { ...DEFAULT_CLIPBOARD_SETTINGS };
let clipboardPersistQueue = Promise.resolve();
let clipboardComposerDraft = { editingId: null, text: '' };
let clipboardSearchQuery = '';
let clipboardSortOrder = 'newest';
let clipboardFilterValue = 'all';
let clipboardSettingsVisible = false;
let todoSettingsVisible = false;
let passwordMode = 'set';
let passwordModalReactMounted = false;
let lockScreenReactMounted = false;
let passwordModalSaving = false;
let passwordModalError = '';
let passwordModalOperationId = 0;
let recordingShortcutTarget = null;
let renamingAccountId = null;
let renameModalReactMounted = false;
let renameModalSaving = false;
let renameModalError = '';
let editingAccountId = null;
const FILTER_KEY = 'aihub-provider-filter';
let organizationFilter = { favorites: false, group: '' };
let notifications = [];
let selectedNotificationCount = 0;
let providerFilter = (() => { try { return localStorage.getItem(FILTER_KEY) || 'all'; } catch { return 'all'; } })();
function setProviderFilter(id) {
  providerFilter = id;
  try { localStorage.setItem(FILTER_KEY, id); } catch { /* storage unavailable */ }
  renderAccountsSidebar();
}
const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};
function shortcutLabel(shortcut) { return String(shortcut || '').split('+').map((part) => (part === 'Shift' ? '⇧' : part)).join(' '); }
const $ = (id) => document.getElementById(id);
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
function createSettingsGearIcon() {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
  circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '3');
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3h0a1.7 1.7 0 0 0-1 1.5v.1a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5h0a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9v0a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1v0a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
  svg.append(circle, path);
  return svg;
}
function normalizeSettingsGears() {
  document.querySelectorAll('#settingsBtn, #launcherSettingsBtn, .standalone-settings-btn, .clipboard-settings-icon').forEach((node) => {
    node.replaceChildren(createSettingsGearIcon());
  });
}
normalizeSettingsGears();
document.querySelectorAll('select').forEach((select) => {
  select.addEventListener('change', () => select.classList.add('dropdown-selected'));
});

// Frameless-window controls. The native Windows title bar is intentionally removed;
// these controls keep the familiar minimize/maximize/close actions inside the app.
$('windowMinimizeBtn')?.addEventListener('click', () => window.aiHub.windowMinimize());
$('windowMaximizeBtn')?.addEventListener('click', () => window.aiHub.windowToggleMaximize());
$('windowCloseBtn')?.addEventListener('click', () => window.aiHub.windowClose());

function normalizeClipboardItem(item) {
  if (!item || typeof item.text !== 'string') return null;
  const text = item.text;
  return {
    id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    text,
    createdAt: Number(item.createdAt) || Date.now(),
    lastCopiedAt: Number(item.lastCopiedAt) || 0,
    pinned: Boolean(item.pinned),
    source: 'manual',
    type: ['link', 'code', 'text'].includes(item.type) ? item.type : detectClipboardType(text),
  };
}
function detectClipboardType(text) {
  const value = String(text || '').trim();
  if (/^(https?:\/\/|www\.)\S+$/i.test(value)) return 'link';
  if (/^(?:[$#]\s*)?(?:npm|npx|yarn|pnpm|git|cd|curl|docker|python|node|powershell|pwsh|pip|brew)\b/i.test(value) || /[{};]\s*$/.test(value) || /^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(value)) return 'code';
  return 'text';
}
function openClipboardDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(CLIPBOARD_DB_NAME, CLIPBOARD_DB_VERSION);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(CLIPBOARD_STORE)) req.result.createObjectStore(CLIPBOARD_STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open clipboard storage'));
  });
}
function clipboardDbRequest(mode, action) {
  return openClipboardDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(CLIPBOARD_STORE, mode);
    const store = tx.objectStore(CLIPBOARD_STORE);
    const req = action(store);
    if (req) { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }
    tx.oncomplete = () => { try { db.close(); } catch {} };
    tx.onerror = () => reject(tx.error || new Error('Clipboard storage transaction failed'));
  }));
}
function estimateClipboardBytes(items = clipboardItems) { return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + String(item?.text || '').length * 2, 0); }
function trimClipboardHistory(items) {
  const out = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  const removeOne = () => {
    let index = out.map((item, i) => [item, i]).reverse().find(([, i]) => !out[i].pinned)?.[1];
    if (index === undefined) index = out.length - 1;
    if (index >= 0) out.splice(index, 1);
  };
  while (out.length > clipboardSettings.maxItems || estimateClipboardBytes(out) > MAX_CLIPBOARD_HISTORY_BYTES) removeOne();
  return out;
}
async function loadClipboardItems() {
  try {
    let items = await clipboardDbRequest('readonly', (store) => store.getAll());
    items = Array.isArray(items) ? items.map(normalizeClipboardItem).filter(Boolean) : [];
    if (!items.length) {
      const legacy = localStorage.getItem(CLIPBOARD_KEY);
      const parsed = legacy ? JSON.parse(legacy) : [];
      items = Array.isArray(parsed) ? parsed.map(normalizeClipboardItem).filter(Boolean) : [];
      if (items.length) {
        clipboardItems = trimClipboardHistory(items);
        await persistClipboardItems();
        try { localStorage.removeItem(CLIPBOARD_KEY); } catch {}
      }
    }
    clipboardItems = trimClipboardHistory(items);
    renderClipboard(); renderWorkspaceApps();
  } catch {
    try {
      const raw = localStorage.getItem(CLIPBOARD_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      clipboardItems = Array.isArray(parsed) ? trimClipboardHistory(parsed.map(normalizeClipboardItem).filter(Boolean)) : [];
    } catch { clipboardItems = []; }
    renderClipboard(); renderWorkspaceApps();
  }
}
function loadClipboardSettings() {
  try {
    const raw = localStorage.getItem(CLIPBOARD_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    clipboardSettings = { ...DEFAULT_CLIPBOARD_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    clipboardSettings.maxItems = [25, 50, 100, 250, 500].includes(Number(clipboardSettings.maxItems)) ? Number(clipboardSettings.maxItems) : DEFAULT_CLIPBOARD_SETTINGS.maxItems;
    clipboardSettings.maxLength = Math.min(50000, Math.max(500, Number(clipboardSettings.maxLength) || DEFAULT_CLIPBOARD_SETTINGS.maxLength));
    clipboardSettings.trimWhitespace = clipboardSettings.trimWhitespace !== false;
    clipboardSettings.confirmClear = clipboardSettings.confirmClear !== false;
    clipboardSettings.defaultSort = clipboardSettings.defaultSort === 'oldest' ? 'oldest' : 'newest';
    clipboardSettings.focusComposerOnOpen = clipboardSettings.focusComposerOnOpen === true;
    clipboardSortOrder = clipboardSettings.defaultSort;
  } catch { clipboardSettings = { ...DEFAULT_CLIPBOARD_SETTINGS }; clipboardSortOrder = clipboardSettings.defaultSort; }
}
function persistClipboardItems() {
  clipboardItems = trimClipboardHistory(clipboardItems);
  const snapshot = clipboardItems.map((item) => ({ ...item }));
  clipboardPersistQueue = clipboardPersistQueue.catch(() => {}).then(async () => {
    try {
      await clipboardDbRequest('readwrite', (store) => {
        store.clear();
        snapshot.forEach((item) => store.put(item));
        return null;
      });
      try { localStorage.removeItem(CLIPBOARD_KEY); } catch {}
    } catch {
      try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(snapshot.slice(0, clipboardSettings.maxItems))); } catch { /* storage unavailable */ }
    }
  });
  return clipboardPersistQueue;
}
function persistClipboardSettings() {
  try { localStorage.setItem(CLIPBOARD_SETTINGS_KEY, JSON.stringify(clipboardSettings)); } catch { /* storage unavailable */ }
}
function openClipboardSettings() {
  clipboardSettingsVisible = true;
  $('clipboardSettingsModal')?.classList.remove('hidden');
  publishUtilityWorkspace();
  syncOverlayMode();
}
function closeClipboardSettings() {
  clipboardSettingsVisible = false;
  $('clipboardSettingsModal')?.classList.add('hidden');
  publishUtilityWorkspace();
  syncOverlayMode();
}
function saveClipboardSettings(settings = null) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : clipboardSettings;
  clipboardSettings = {
    maxItems: [25, 50, 100, 250, 500].includes(Number(source.maxItems)) ? Number(source.maxItems) : DEFAULT_CLIPBOARD_SETTINGS.maxItems,
    trimWhitespace: source.trimWhitespace !== false,
    confirmClear: source.confirmClear !== false,
    maxLength: Math.min(50000, Math.max(500, Number(source.maxLength) || DEFAULT_CLIPBOARD_SETTINGS.maxLength)),
    defaultSort: source.defaultSort === 'oldest' ? 'oldest' : 'newest',
    focusComposerOnOpen: source.focusComposerOnOpen === true,
  };
  clipboardSortOrder = clipboardSettings.defaultSort;
  clipboardItems = clipboardItems.slice(0, clipboardSettings.maxItems);
  persistClipboardSettings(); persistClipboardItems(); renderClipboard(); showToast('Notes & Tasks settings saved.'); closeClipboardSettings();
}

function formatSnippetDate(value) {
  try {
    const date = new Date(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return sameDay ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return ''; }
}
function formatClipboardSize(text) {
  const bytes = new Blob([String(text)]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
async function copyText(text, item = null) {
  try {
    const result = await window.aiHub.writeSystemClipboard(String(text));
    if (result?.ok === false) throw new Error(result.error || 'Clipboard write failed');
    if (item) { item.lastCopiedAt = Date.now(); persistClipboardItems(); renderClipboard(); }
    showToast('Copied to system clipboard.');
  } catch {
    try {
      const area = document.createElement('textarea'); area.value = String(text); document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      if (item) { item.lastCopiedAt = Date.now(); persistClipboardItems(); renderClipboard(); }
      showToast('Copied to system clipboard.');
    } catch { showToast('Could not copy that clip.', true); }
  }
}
function addClipboardItem(text, options = {}) {
  const raw = String(text ?? '');
  const clean = clipboardSettings.trimWhitespace ? raw.trim() : raw;
  if (!clean) return showToast('Paste or type something first.', true);
  if (clean.length > clipboardSettings.maxLength) return showToast(`That clip is longer than the ${clipboardSettings.maxLength.toLocaleString()} character limit.`, true);
  const existing = clipboardItems.find((item) => item.text === clean);
  const item = existing
    ? { ...existing, createdAt: Date.now(), source: options.source || existing.source, type: detectClipboardType(clean) }
    : { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text: clean, createdAt: Date.now(), lastCopiedAt: 0, pinned: false, source: options.source || 'manual', type: detectClipboardType(clean) };
  clipboardItems = [item, ...clipboardItems.filter((x) => x.id !== item.id)].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt).slice(0, clipboardSettings.maxItems);
  persistClipboardItems(); renderClipboard();
  if (!options.silent) { clipboardComposerDraft = { editingId: null, text: '' }; updateClipboardComposer(); showToast('Clip saved.'); }
  return item;
}
function toggleClipboardPin(id) {
  const item = clipboardItems.find((x) => x.id === id); if (!item) return;
  item.pinned = !item.pinned; persistClipboardItems(); renderClipboard(); showToast(item.pinned ? 'Clip pinned.' : 'Clip unpinned.');
}
function beginClipboardEdit(id) {
  const item = clipboardItems.find((x) => x.id === id); if (!item) return;
  clipboardComposerDraft = { editingId: item.id, text: item.text };
  publishUtilityWorkspace();
}
function cancelClipboardEdit() {
  clipboardComposerDraft = { editingId: null, text: '' };
  publishUtilityWorkspace();
}
function saveComposerClip() {
  const id = clipboardComposerDraft.editingId;
  const value = clipboardComposerDraft.text;
  if (id) {
    const item = clipboardItems.find((x) => x.id === id);
    const clean = clipboardSettings.trimWhitespace ? value.trim() : value;
    if (!item || !clean) return showToast('Enter some text first.', true);
    if (clean.length > clipboardSettings.maxLength) return showToast('That clip is too long.', true);
    item.text = clean; item.type = detectClipboardType(clean); item.createdAt = Date.now();
    persistClipboardItems(); cancelClipboardEdit(); renderClipboard(); showToast('Clip updated.');
  } else addClipboardItem(value);
}
function updateClipboardComposer() { publishUtilityWorkspace(); }

function clipboardFilter() { return clipboardFilterValue; }
function filteredClipboardItems() {
  const query = clipboardSearchQuery.trim().toLowerCase();
  const filter = clipboardFilter();
  let list = clipboardItems.filter((item) => {
    const matchesQuery = !query || item.text.toLowerCase().includes(query);
    const matchesFilter = filter === 'all' || (filter === 'pinned' && item.pinned) || (filter === 'links' && item.type === 'link') || (filter === 'code' && item.type === 'code');
    return matchesQuery && matchesFilter;
  });
  if (clipboardSortOrder === 'oldest') list = list.sort((a, b) => a.createdAt - b.createdAt);
  else list = list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  return list;
}
function renderClipboard() {
  const root = $('clipboardItems');
  if (!root) return;
  const list = filteredClipboardItems();
  const count = $('launcherClipboardCount');
  const pinnedLinks = clipboardItems.filter((item) => item.pinned && item.type === 'link').length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = clipboardItems.filter((item) => item.createdAt >= todayStart.getTime()).length;
  if (count) count.textContent = clipboardItems.length;
  const filter = clipboardFilter();
  const query = clipboardSearchQuery.trim();
  publishUtilityWorkspace({ listCount: list.length, pinnedLinks, today });

  const reactLists = window.MadStationUtilityLists;
  if (reactLists) {
    reactLists.updateClipboard({
      items: list.map((item) => ({
        id: item.id,
        text: item.text,
        type: item.type,
        pinned: Boolean(item.pinned),
        createdLabel: formatSnippetDate(item.createdAt),
        sizeLabel: formatClipboardSize(item.text),
        lastCopiedLabel: item.lastCopiedAt ? formatSnippetDate(item.lastCopiedAt) : '',
      })),
      emptyTitle: query ? 'No matching clips' : filter !== 'all' ? 'Nothing here yet' : 'Your clipboard is ready',
      emptyDescription: query ? 'Try a different search.' : 'Copy something in another app or save your first clip above.',
      onCopy: (id) => {
        const item = clipboardItems.find((candidate) => candidate.id === id);
        if (item) void copyText(item.text, item);
      },
      onEdit: (id) => beginClipboardEdit(id),
      onTogglePin: (id) => toggleClipboardPin(id),
      onDelete: (id) => {
        clipboardItems = clipboardItems.filter((item) => item.id !== id);
        void persistClipboardItems();
        renderClipboard();
        showToast('Clip deleted.');
      },
    });
    return;
  }

  // Startup fallback only. Once React mounts, it exclusively owns #clipboardItems.
  root.innerHTML = list.length ? list.map((item) => {
    const preview = escapeHtml(item.text).replaceAll('\n', '<br>');
    const typeLabel = item.type === 'link' ? 'LINK' : item.type === 'code' ? 'CODE' : 'TEXT';
    return `<article class="clipboard-item ${item.pinned ? 'is-pinned' : ''}" data-clipboard-item="${escapeHtml(item.id)}">
      <div class="clipboard-item-top"><div class="clipboard-item-meta"><span class="clipboard-type-pill type-${item.type}">${typeLabel}</span><span>SAVED</span><span>·</span><time>${escapeHtml(formatSnippetDate(item.createdAt))}</time></div></div>
      <button class="clipboard-snippet" type="button" data-clipboard-copy="${escapeHtml(item.id)}" title="Copy clip">${preview}</button>
      <div class="clipboard-item-bottom"><span class="clipboard-size">${formatClipboardSize(item.text)}${item.lastCopiedAt ? ` · copied ${escapeHtml(formatSnippetDate(item.lastCopiedAt))}` : ''}</span><div class="clipboard-item-actions"><button class="tiny-btn" type="button" data-clipboard-edit="${escapeHtml(item.id)}">Edit</button><button class="tiny-btn clipboard-pin ${item.pinned ? 'active' : ''}" type="button" title="${item.pinned ? 'Unpin' : 'Pin'}" aria-label="${item.pinned ? 'Unpin' : 'Pin'} clip" data-clipboard-pin="${escapeHtml(item.id)}">${item.pinned ? 'Unpin' : 'Pin'}</button><button class="tiny-btn clipboard-delete" type="button" title="Delete clip" aria-label="Delete clip" data-clipboard-delete="${escapeHtml(item.id)}">Delete</button><button class="primary" type="button" data-clipboard-copy="${escapeHtml(item.id)}">Copy</button></div></div>
    </article>`;
  }).join('') : `<div class="clipboard-empty"><div class="clipboard-empty-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><rect height="16" rx="2" width="14" x="5" y="5"></rect><path d="M9 5V3h6v2"></path></svg></div><strong>${query ? 'No matching clips' : filter !== 'all' ? 'Nothing here yet' : 'Your clipboard is ready'}</strong><span>${query ? 'Try a different search.' : 'Copy something in another app or save your first clip above.'}</span></div>`;
  root.querySelectorAll('[data-clipboard-copy]').forEach((button) => button.addEventListener('click', () => { const item = clipboardItems.find((candidate) => candidate.id === button.dataset.clipboardCopy); if (item) copyText(item.text, item); }));
  root.querySelectorAll('[data-clipboard-pin]').forEach((button) => button.addEventListener('click', () => toggleClipboardPin(button.dataset.clipboardPin)));
  root.querySelectorAll('[data-clipboard-edit]').forEach((button) => button.addEventListener('click', () => beginClipboardEdit(button.dataset.clipboardEdit)));
  root.querySelectorAll('[data-clipboard-delete]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.clipboardDelete;
    clipboardItems = clipboardItems.filter((item) => item.id !== id);
    void persistClipboardItems();
    renderClipboard();
    showToast('Clip deleted.');
  }));
}
function publishUtilityWorkspace(overrides = {}) {
  const listCount = Number.isFinite(overrides.listCount) ? Number(overrides.listCount) : filteredClipboardItems().length;
  const pinnedLinks = Number.isFinite(overrides.pinnedLinks) ? Number(overrides.pinnedLinks) : clipboardItems.filter((item) => item.pinned && item.type === 'link').length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = Number.isFinite(overrides.today) ? Number(overrides.today) : clipboardItems.filter((item) => item.createdAt >= todayStart.getTime()).length;
  const query = clipboardSearchQuery.trim();
  const filter = clipboardFilter();
  window.MadStationUtilityWorkspaces?.updateClipboard({
    activeTab: utilityTab, totalCount: clipboardItems.length, pinnedLinksCount: pinnedLinks, todayCount: today,
    draft: { ...clipboardComposerDraft }, search: clipboardSearchQuery.slice(0, 200), filter, sort: clipboardSortOrder,
    historyTitle: filter === 'pinned' ? 'Pinned clips' : filter === 'links' ? 'Saved links' : filter === 'code' ? 'Code & commands' : query ? 'Search results' : 'Recent clips',
    historyMeta: `${listCount.toLocaleString()} shown · ${clipboardItems.length.toLocaleString()} stored`,
    settingsVisible: clipboardSettingsVisible,
    settings: { ...clipboardSettings },
  });
  window.MadStationUtilityWorkspaces?.updateTodo({
    openCount: Number.isFinite(overrides.todoOpenCount) ? Number(overrides.todoOpenCount) : todos.filter((item) => !item.completed).length,
    listMeta: `${(Number.isFinite(overrides.todoListCount) ? Number(overrides.todoListCount) : todos.filter((item) => todoFilter === 'all' || (todoFilter === 'open' && !item.completed) || (todoFilter === 'done' && item.completed)).length).toLocaleString()} ${(Number.isFinite(overrides.todoListCount) ? Number(overrides.todoListCount) : todos.filter((item) => todoFilter === 'all' || (todoFilter === 'open' && !item.completed) || (todoFilter === 'done' && item.completed)).length) === 1 ? 'task' : 'tasks'}`,
    filter: todoFilter, settingsVisible: todoSettingsVisible, settings: { ...todoSettings },
  });
}
function handleClipboardWorkspaceAction(action) {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'draft-change') { clipboardComposerDraft = { ...clipboardComposerDraft, text: typeof action.text === 'string' ? action.text.slice(0, 50000) : '' }; publishUtilityWorkspace(); return; }
  if (action.type === 'save') { saveComposerClip(); return; }
  if (action.type === 'cancel-edit') { cancelClipboardEdit(); return; }
  if (action.type === 'search-change') { clipboardSearchQuery = typeof action.value === 'string' ? action.value.slice(0, 200) : ''; renderClipboard(); return; }
  if (action.type === 'filter-change' && ['all', 'pinned', 'links', 'code'].includes(action.value)) { clipboardFilterValue = action.value; renderClipboard(); return; }
  if (action.type === 'sort-change') { clipboardSortOrder = action.value === 'oldest' ? 'oldest' : 'newest'; renderClipboard(); return; }
  if (action.type === 'clear-all') { if (!clipboardItems.length) return; if (clipboardSettings.confirmClear && !window.confirm('Clear all saved clips? This includes pinned clips and cannot be undone.')) return; clipboardItems = []; persistClipboardItems(); renderClipboard(); showToast('All saved clips cleared.'); return; }
  if (action.type === 'utility-tab-change' && ['clipboard', 'notes', 'todo'].includes(action.value)) { activateUtilityTab(action.value); return; }
  if (action.type === 'settings-open') { if (action.value === 'clipboard') openClipboardSettings(); else if (action.value === 'notes') openNotesSettings(); else if (action.value === 'todo') openTodoSettings(); return; }
  if (action.type === 'settings-save') { saveClipboardSettings(action.settings); return; }
}
function handleTodoWorkspaceAction(action) {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'add') { addTodo(typeof action.text === 'string' ? action.text : ''); return; }
  if (action.type === 'filter-change' && ['all', 'open', 'done'].includes(action.value)) { todoFilter = action.value; renderTodos(); return; }
  if (action.type === 'settings-save') { saveTodoSettingsFromUi(action.settings); return; }
}
window.addEventListener('madstation:clipboard-workspace-action', (event) => handleClipboardWorkspaceAction(event?.detail));
window.addEventListener('madstation:todo-workspace-action', (event) => handleTodoWorkspaceAction(event?.detail));
window.addEventListener('madstation:utility-workspaces-react-ready', () => { publishUtilityWorkspace(); renderClipboard(); renderTodos(); });

async function loadUtilityData() {
  try { const raw = localStorage.getItem(NOTES_SETTINGS_KEY); const parsed = raw ? JSON.parse(raw) : {}; notesSettings = { ...DEFAULT_NOTES_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }; notesSettings.maxItems = [50,100,200,500,1000].includes(Number(notesSettings.maxItems)) ? Number(notesSettings.maxItems) : 200; notesSettings.defaultSort = notesSettings.defaultSort === 'oldest' ? 'oldest' : 'newest'; notesSettings.confirmDelete = notesSettings.confirmDelete !== false; } catch { notesSettings = { ...DEFAULT_NOTES_SETTINGS }; }
  try { const raw = localStorage.getItem(TODO_SETTINGS_KEY); const parsed = raw ? JSON.parse(raw) : {}; todoSettings = { ...DEFAULT_TODO_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }; todoSettings.maxItems = [50,100,200,500,1000].includes(Number(todoSettings.maxItems)) ? Number(todoSettings.maxItems) : 200; todoSettings.defaultSort = todoSettings.defaultSort === 'oldest' ? 'oldest' : 'newest'; todoSettings.hideCompleted = todoSettings.hideCompleted === true; todoSettings.confirmDelete = todoSettings.confirmDelete !== false; } catch { todoSettings = { ...DEFAULT_TODO_SETTINGS }; }
  try { const raw = localStorage.getItem(NOTES_KEY); const parsed = raw ? JSON.parse(raw) : []; notes = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.body === 'string').map(normalizeNote).slice(0, notesSettings.maxItems) : []; } catch { notes = []; }
  try { const raw = localStorage.getItem(TODO_KEY); const parsed = raw ? JSON.parse(raw) : []; todos = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.text === 'string').map(normalizeTodo).slice(0, todoSettings.maxItems) : []; } catch { todos = []; }
  saveNotes(); saveTodos();
  if (todoSettings.hideCompleted) todoFilter = 'open';
  renderNotes(); renderTodos(); publishUtilityWorkspace();
}
function saveNotesSettings() { try { localStorage.setItem(NOTES_SETTINGS_KEY, JSON.stringify(notesSettings)); } catch {} }
function saveTodoSettings() { try { localStorage.setItem(TODO_SETTINGS_KEY, JSON.stringify(todoSettings)); } catch {} }
function publishNotesSettings(visible) {
  window.MadStationNotesSettings?.update({ visible: visible === true, maxItems: notesSettings.maxItems, defaultSort: notesSettings.defaultSort, confirmDelete: notesSettings.confirmDelete });
}
function openNotesSettings() {
  notesSettingsReturnFocus = document.activeElement;
  $('notesSettingsModal')?.classList.remove('hidden');
  publishNotesSettings(true);
  syncOverlayMode();
}
function closeNotesSettings() {
  $('notesSettingsModal')?.classList.add('hidden');
  publishNotesSettings(false);
  const back = notesSettingsReturnFocus; notesSettingsReturnFocus = null;
  if (back?.isConnected && typeof back.focus === 'function') back.focus();
  syncOverlayMode();
}
function saveNotesSettingsFromUi(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
  const allowedLimits = [50, 100, 200, 500, 1000];
  const maxItems = allowedLimits.includes(Number(settings.maxItems)) ? Number(settings.maxItems) : 200;
  notesSettings = { maxItems, defaultSort: settings.defaultSort === 'oldest' ? 'oldest' : 'newest', confirmDelete: settings.confirmDelete !== false };
  notes = notes.slice(0, notesSettings.maxItems);
  saveNotesSettings(); saveNotes(); renderNotes(); closeNotesSettings(); showToast('Notes settings saved.');
}
window.addEventListener('madstation:notes-settings-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  if (action.type === 'cancel') closeNotesSettings();
  else if (action.type === 'save') saveNotesSettingsFromUi(action.settings);
});
window.addEventListener('madstation:notes-settings-mounted', () => publishNotesSettings(!$('notesSettingsModal')?.classList.contains('hidden')));
function openTodoSettings() { todoSettingsVisible = true; $('todoSettingsModal')?.classList.remove('hidden'); publishUtilityWorkspace(); syncOverlayMode(); }
function closeTodoSettings() { todoSettingsVisible = false; $('todoSettingsModal')?.classList.add('hidden'); publishUtilityWorkspace(); syncOverlayMode(); }
function saveTodoSettingsFromUi(settings = null) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : todoSettings;
  todoSettings = { maxItems: [50, 100, 200, 500, 1000].includes(Number(source.maxItems)) ? Number(source.maxItems) : DEFAULT_TODO_SETTINGS.maxItems, defaultSort: source.defaultSort === 'oldest' ? 'oldest' : 'newest', hideCompleted: source.hideCompleted === true, confirmDelete: source.confirmDelete !== false };
  todos = todos.slice(0, todoSettings.maxItems); if (todoSettings.hideCompleted) todoFilter = 'open'; saveTodoSettings(); saveTodos(); renderTodos(); closeTodoSettings(); showToast('To-do settings saved.');
}

function normalizeNote(item) { return { id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`), title: String(item.title || '').trim(), body: String(item.body || ''), createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now() }; }
function normalizeTodo(item) { return { id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`), text: String(item.text || '').trim(), completed: Boolean(item.completed), createdAt: Number(item.createdAt) || Date.now(), completedAt: Number(item.completedAt) || 0 }; }
function saveNotes() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch { showToast('Could not save notes.', true); } }
function saveTodos() { try { localStorage.setItem(TODO_KEY, JSON.stringify(todos)); } catch { showToast('Could not save tasks.', true); } }
function notePreview(note) { return escapeHtml(note.body).replaceAll('\n', '<br>'); }
function utilityTabMeta(tab) {
  return {
    clipboard: ['Clips', 'Save reusable text locally and bring useful text back when you need it.'],
    notes: ['Notes', 'Keep private local notes for ideas, plans, and working details.'],
    todo: ['To-do list', 'Turn what you need to do next into a simple local task list.'],
  }[tab] || ['Clipboard', 'Save reusable text locally and paste it anywhere when you need it.'];
}
function activateUtilityTab(tab) {
  utilityTab = ['clipboard', 'notes', 'todo'].includes(tab) ? tab : 'clipboard';
  document.querySelectorAll('[data-utility-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.utilityPanel === utilityTab));
  const meta = utilityTabMeta(utilityTab);
  if (utilityTab === 'todo' && todoSettings.hideCompleted && todoFilter === 'all') todoFilter = 'open';
  if (utilityTab === 'clipboard') renderClipboard();
  if (utilityTab === 'notes') renderNotes();
  if (utilityTab === 'todo') renderTodos();
  publishUtilityWorkspace();
}
function publishNotesComposer() { window.MadStationNotesComposer?.update({ ...notesComposerDraft }); }
function resetNoteEditor() { notesComposerDraft = { editingId: null, title: '', body: '' }; publishNotesComposer(); }
function saveNote(draft = notesComposerDraft) {
  const safeDraft = draft && typeof draft === 'object' ? draft : notesComposerDraft;
  const body = typeof safeDraft.body === 'string' ? safeDraft.body.trim().slice(0, 200000) : '';
  if (!body) return showToast('Write something in the note first.', true);
  const editingId = typeof safeDraft.editingId === 'string' ? safeDraft.editingId.slice(0, 160) : null;
  const title = (typeof safeDraft.title === 'string' ? safeDraft.title.trim().slice(0, 120) : '') || body.split(/\s+/).slice(0, 8).join(' ') || 'Untitled note';
  if (!editingId && notes.length >= notesSettings.maxItems) notes = notes.slice(0, notesSettings.maxItems - 1);
  if (editingId) {
    const note = notes.find((item) => item.id === editingId);
    if (!note) { resetNoteEditor(); return showToast('This note no longer exists.', true); }
    note.title = title; note.body = body; note.updatedAt = Date.now();
  } else {
    notes.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title, body, createdAt: Date.now(), updatedAt: Date.now() });
  }
  saveNotes(); resetNoteEditor(); renderNotes(); showToast('Note saved.');
}
function editNote(id) {
  const note = notes.find((item) => item.id === id); if (!note) return;
  notesComposerDraft = { editingId: note.id, title: note.title, body: note.body };
  publishNotesComposer();
}
window.addEventListener('madstation:notes-composer-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  if (action.type === 'cancel') { resetNoteEditor(); return; }
  if (action.type !== 'save' || !action.draft || typeof action.draft !== 'object') return;
  const draft = action.draft;
  if (typeof draft.title !== 'string' || typeof draft.body !== 'string' || !(draft.editingId == null || typeof draft.editingId === 'string')) return;
  notesComposerDraft = { editingId: draft.editingId, title: draft.title.slice(0, 120), body: draft.body.slice(0, 200000) };
  saveNote(notesComposerDraft);
});
window.addEventListener('madstation:notes-composer-mounted', publishNotesComposer);
function deleteNote(id) { notes = notes.filter((item) => item.id !== id); saveNotes(); renderNotes(); showToast('Note deleted.'); }
function publishNotesHeaderState(model) {
  window.dispatchEvent(new CustomEvent('madstation:notes-header-state', { detail: model }));
}
window.addEventListener('madstation:notes-header-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || action.type !== 'search' || typeof action.value !== 'string') return;
  notesSearchQuery = action.value.slice(0, 200);
  renderNotes();
});
window.addEventListener('madstation:notes-header-mounted', () => renderNotes());

function renderNotes() {
  const root = $('notesList');
  if (!root) return;
  const rawQuery = notesSearchQuery.trim();
  const query = rawQuery.toLowerCase();
  const list = notes
    .filter((note) => !query || `${note.title}\n${note.body}`.toLowerCase().includes(query))
    .sort((a, b) => notesSettings.defaultSort === 'oldest' ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt);
  publishNotesHeaderState({ countLabel: `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`, listMeta: `${list.length} shown · ${notes.length} stored`, search: notesSearchQuery, visibleCount: list.length, storedCount: notes.length });

  const reactLists = window.MadStationUtilityLists;
  if (reactLists) {
    reactLists.updateNotes({
      items: list.map((note) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        updatedLabel: formatSnippetDate(note.updatedAt),
      })),
      emptyTitle: query ? 'No matching notes' : 'No notes yet',
      emptyDescription: query ? 'Try a different search.' : 'Write your first note on the left.',
      onEdit: (id) => editNote(id),
      onDelete: (id) => {
        if (!notesSettings.confirmDelete || window.confirm('Delete this note?')) deleteNote(id);
      },
    });
    return;
  }

  // Startup fallback only. Once React mounts, it exclusively owns #notesList.
  root.innerHTML = list.length ? list.map((note) => `<article class="note-card" data-note-id="${escapeHtml(note.id)}"><div class="note-card-head"><div><span class="eyebrow">NOTE</span><h4>${escapeHtml(note.title)}</h4></div><div class="note-actions"><button class="tiny-btn" type="button" data-note-edit="${escapeHtml(note.id)}">Edit</button><button class="icon-only note-delete" type="button" title="Delete note" aria-label="Delete note" data-note-delete="${escapeHtml(note.id)}">×</button></div></div><p>${notePreview(note)}</p><time>Updated ${escapeHtml(formatSnippetDate(note.updatedAt))}</time></article>`).join('') : `<div class="utility-empty"><strong>${query ? 'No matching notes' : 'No notes yet'}</strong><span>${query ? 'Try a different search.' : 'Write your first note on the left.'}</span></div>`;
  root.querySelectorAll('[data-note-edit]').forEach((btn) => btn.addEventListener('click', () => editNote(btn.dataset.noteEdit)));
  root.querySelectorAll('[data-note-delete]').forEach((btn) => btn.addEventListener('click', () => { if (!notesSettings.confirmDelete || window.confirm('Delete this note?')) deleteNote(btn.dataset.noteDelete); }));
}
function addTodo(value = '') { const text = String(value ?? '').trim().slice(0, 240); if (!text) return showToast('Enter a task first.', true); if (todos.length >= todoSettings.maxItems) todos = todos.slice(0, todoSettings.maxItems - 1); todos.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, completed: false, createdAt: Date.now(), completedAt: 0 }); saveTodos(); renderTodos(); showToast('Task added.'); }
function toggleTodo(id) { const item = todos.find((todo) => todo.id === id); if (!item) return; item.completed = !item.completed; item.completedAt = item.completed ? Date.now() : 0; saveTodos(); renderTodos(); }
function deleteTodo(id) { todos = todos.filter((item) => item.id !== id); saveTodos(); renderTodos(); showToast('Task deleted.'); }
function renderTodos() {
  const root = $('todoList');
  if (!root) return;
  const list = todos
    .filter((item) => todoFilter === 'all' || (todoFilter === 'open' && !item.completed) || (todoFilter === 'done' && item.completed))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || (todoSettings.defaultSort === 'oldest' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));
  const open = todos.filter((item) => !item.completed).length;
  publishUtilityWorkspace({ todoListCount: list.length, todoOpenCount: open });

  const reactLists = window.MadStationUtilityLists;
  if (reactLists) {
    const emptyState = [
      todoFilter === 'done' ? 'No completed tasks' : todoFilter === 'open' ? 'No open tasks' : 'No tasks yet',
      'Add a task above when something needs your attention.',
    ];
    reactLists.updateTodos({
      items: list.map((item) => ({ id: item.id, text: item.text, completed: item.completed })),
      filter: todoFilter,
      emptyTitle: emptyState[0],
      emptyDescription: emptyState[1],
      onToggle: (id) => toggleTodo(id),
      onDelete: (id) => {
        if (!todoSettings.confirmDelete || window.confirm('Delete this task?')) deleteTodo(id);
      },
    });
  } else {
    // Startup fallback only. Once React mounts, it exclusively owns #todoList.
    root.innerHTML = list.length ? list.map((item) => `<article class="todo-row ${item.completed ? 'is-done' : ''}"><label><input type="checkbox" data-todo-toggle="${escapeHtml(item.id)}" ${item.completed ? 'checked' : ''}><span>${escapeHtml(item.text)}</span></label><button class="icon-only note-delete" type="button" title="Delete task" aria-label="Delete task" data-todo-delete="${escapeHtml(item.id)}">×</button></article>`).join('') : `<div class="utility-empty"><strong>${todoFilter === 'done' ? 'No completed tasks' : todoFilter === 'open' ? 'No open tasks' : 'No tasks yet'}</strong><span>Add a task above when something needs your attention.</span></div>`;
    root.querySelectorAll('[data-todo-toggle]').forEach((input) => input.addEventListener('change', () => toggleTodo(input.dataset.todoToggle)));
    root.querySelectorAll('[data-todo-delete]').forEach((btn) => btn.addEventListener('click', () => { if (!todoSettings.confirmDelete || window.confirm('Delete this task?')) deleteTodo(btn.dataset.todoDelete); }));
  }
}

loadClipboardSettings();
void loadClipboardItems();
void loadUtilityData();
function serviceMap() { return new Map(state.services.map((s) => [s.id, s])); }
function orderedItems(items, order) {
  const rank = new Map((Array.isArray(order) ? order : []).map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? 999999) - (rank.get(b.id) ?? 999999));
}
function orderedServices() { return orderedItems(state.services, state.serviceOrder); }
function orderedAccounts() { return orderedItems(state.accounts, state.accountOrder); }
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function isImageIcon(icon) {
  if (typeof icon !== 'string') return false;
  if (/^data:image\//i.test(icon)) return true;
  return /^https:/i.test(icon) && state.settings?.security?.remoteIcons !== false;
}
const DEFAULT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="12" fill="#161b2b"/><path d="M24 7l3.1 9.9L37 20l-9.9 3.1L24 33l-3.1-9.9L11 20l9.9-3.1L24 7z" fill="#8b7cff"/><path d="M15 36h18" stroke="#c7c9d8" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="#c7c9d8"/><circle cx="32" cy="31" r="2" fill="#8b7cff"/></svg>';
const DEFAULT_ICON_DATA_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DEFAULT_ICON_SVG)}`;
function captureIconNodes(root, keyFromImage) {
  const map = new Map();
  if (!root) return map;
  root.querySelectorAll?.('img.provider-icon-img').forEach((img) => {
    const key = keyFromImage(img);
    if (key && !map.has(key)) map.set(key, img);
  });
  return map;
}

function restoreIconNodes(root, previous, keyFromImage) {
  if (!root || !previous?.size) return;
  root.querySelectorAll?.('img.provider-icon-img').forEach((img) => {
    const key = keyFromImage(img);
    if (!key) return;
    const old = previous.get(key);
    if (!old || old === img) return;
    // Reuse the real <img> node only when its candidate set is unchanged.
    // This preserves the already-decoded image and prevents icon flicker on ordinary rerenders.
    if (old.dataset.iconCandidates !== img.dataset.iconCandidates) return;
    img.replaceWith(old);
  });
}

function iconMarkup(icon, className = '', candidates = []) {
  const value = String(icon || '').trim();
  const list = [...new Set([value, ...(Array.isArray(candidates) ? candidates : [])].filter(isImageIcon))];
  if (!list.includes(DEFAULT_ICON_DATA_URL)) list.push(DEFAULT_ICON_DATA_URL);
  const encoded = encodeURIComponent(JSON.stringify(list));
  const defaultClass = list[0] === DEFAULT_ICON_DATA_URL ? ' provider-icon-default' : '';
  return `<img class="provider-icon-img ${className}${defaultClass}" draggable="false" src="${escapeHtml(list[0])}" data-icon-candidates="${escapeHtml(encoded)}" data-icon-index="0" data-icon-cache-tried="" alt="" referrerpolicy="no-referrer">`;
}

function bindIconFallbacks(root = document) {
  root.querySelectorAll?.('img[data-icon-candidates]').forEach((img) => {
    if (img.dataset.iconFallbackBound) return;
    img.dataset.iconFallbackBound = '1';
    img.addEventListener('load', () => {
      const current = String(img.currentSrc || img.src || '');
      img.classList.toggle('provider-icon-default', current === DEFAULT_ICON_DATA_URL);
      if (/^https:/i.test(current) && img.dataset.iconCachedUrl !== current) {
        // Cache each remote URL once per DOM image. Stable image nodes mean this path
        // normally runs only once for the lifetime of the workspace.
        img.dataset.iconCachedUrl = current;
        cacheIconForImage(img, current)?.catch?.(() => {});
      }
    }, { once: false });
    img.addEventListener('error', async () => {
      let candidates = [];
      try { candidates = JSON.parse(decodeURIComponent(img.dataset.iconCandidates || '%5B%5D')); } catch { candidates = []; }
      const index = Math.max(0, Number(img.dataset.iconIndex || 0));
      const failed = candidates[index];

      // A cached data URL can itself be stale/corrupt. Only try the main-process
      // cache once for each remote candidate, otherwise a bad cache entry could loop forever.
      if (failed && /^https:/i.test(failed) && img.dataset.iconCacheTried !== String(index)) {
        img.dataset.iconCacheTried = String(index);
        try {
          const cached = await cacheIconForImage(img, failed);
          if (cached?.ok && cached.icon) {
            img.src = cached.icon;
            return;
          }
        } catch { /* continue through the browser-side fallback chain */ }
      }

      const next = index + 1;
      if (next >= candidates.length) {
        img.dataset.iconIndex = String(candidates.length);
        img.dataset.iconCacheTried = '';
        img.src = DEFAULT_ICON_DATA_URL;
        img.classList.add('provider-icon-default');
        return;
      }
      img.dataset.iconIndex = String(next);
      img.dataset.iconCacheTried = '';
      img.classList.remove('provider-icon-default');
      img.src = candidates[next];
    });
  });
}

function showToast(message, isError = false) {
  const toast = $('toast'); toast.textContent = message; toast.className = `toast ${isError ? 'error' : ''}`;
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}
function updateAppearancePreview() {}
const BUILT_IN_BACKGROUNDS = [
  ['plain', 'Plain'], ['aurora', 'Aurora'], ['grid', 'Grid'], ['spotlight', 'Spotlight'], ['mesh', 'Mesh'], ['neon', 'Neon'], ['parallax', 'Parallax'],
  ['dots', 'Dots'], ['rings', 'Rings'], ['hex', 'Hex'], ['waves', 'Waves'], ['diagonal', 'Diagonal'],
  ['circuit', 'Circuit'], ['constellation', 'Constellation'], ['tiles', 'Tiles'],
];

function setBackgroundUrlForm(open) {
  const form = $('backgroundUrlForm');
  if (!form) return;
  form.classList.toggle('hidden', !open);
  if (open) { $('backgroundUrlInput')?.focus(); }
}

async function addBackgroundFromUrl() {
  const input = $('backgroundUrlInput');
  const error = $('backgroundUrlError');
  const raw = input?.value.trim() || '';
  if (error) error.textContent = '';
  let parsed;
  try { parsed = new URL(raw); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== 'https:') {
    if (error) error.textContent = 'Use an HTTPS image URL.';
    return;
  }
  const list = Array.isArray(state.settings.customBackgrounds) ? [...state.settings.customBackgrounds] : [];
  if (list.some((item) => item.url === parsed.href)) {
    if (error) error.textContent = 'That background is already in your library.';
    return;
  }
  const filename = decodeURIComponent(parsed.pathname.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').trim();
  list.push({ id: `url-${Date.now().toString(36)}`, name: filename || 'URL background', type: 'url', url: parsed.href, createdAt: new Date().toISOString() });
  if (list.length > 32) list.shift();
  await updateAppSettings({ customBackgrounds: list, backgroundStyle: 'custom', backgroundId: list[list.length - 1].id });
  if (input) input.value = '';
  setBackgroundUrlForm(false);
  showToast('Background added from URL.');
}

async function addBackgroundFromComputer() {
  const result = await window.aiHub.chooseBackgroundFile?.();
  if (!result?.ok || !result.background) {
    if (!result?.canceled) showToast(result?.error || 'Could not add that background.', true);
    return;
  }
  const list = Array.isArray(state.settings.customBackgrounds) ? [...state.settings.customBackgrounds] : [];
  list.push(result.background);
  if (list.length > 32) {
    const removed = list.shift();
    if (removed?.id === state.settings.backgroundId) state.settings.backgroundId = '';
  }
  await updateAppSettings({ customBackgrounds: list, backgroundStyle: 'custom', backgroundId: result.background.id });
  showToast('Background added from your computer.');
}


function applySettings() {
  const access = state.settings?.accessibility || {}; document.body.style.setProperty('--ui-scale', `${Number(access.textScale || 100) / 100}`); document.body.classList.toggle('high-contrast', Boolean(access.highContrast)); document.body.classList.toggle('hide-focus-ring', access.focusIndicators === false); document.body.classList.toggle('always-show-account-names', Boolean(access.alwaysShowAccountNames));
  const st = state.settings || {};
  window.applyAppearance(st);
  // React owns homepage-style selection, appearance modes, accents, and background cards.
  publishAppearanceSettings();
  publishGlobalSettingsControls();
  const themePreview = document.querySelector('[data-preview="theme"]');
  if (themePreview) {
    const theme = ['dark', 'light', 'system'].includes(st.theme) ? st.theme : 'dark';
    themePreview.dataset.themePreview = theme;
    const label = themePreview.querySelector('.mode-preview-label');
    if (label) label.textContent = `${theme === 'system' ? 'System' : theme[0].toUpperCase() + theme.slice(1)} mode`;
  }
  const themeChoiceSummary = document.querySelector('#themeChoiceSummary');
  if (themeChoiceSummary) {
    const theme = ['dark', 'light', 'system'].includes(st.theme) ? st.theme : 'dark';
    themeChoiceSummary.textContent = theme === 'system' ? 'System' : theme[0].toUpperCase() + theme.slice(1);
  }
const reactOwnedAppSettingKeys = new Set(['startMaximized', 'restoreLastAccount', 'launchAtLogin']);
  document.querySelectorAll('[data-app]').forEach((input) => { if (reactOwnedAppSettingKeys.has(input.dataset.app)) return; input.checked = Boolean(st[input.dataset.app]); });
  // The remaining Appearance controls are React-owned; they receive this settings snapshot.
  applySecurityUi();
  applyDownloadSettings();
}
async function updateDiagnostics() {
  const errors = state.accounts.filter((a) => a.status === 'error');
  dataDiagnosticsView.diagnosticsSummary = errors.length
    ? `${errors.length} account${errors.length === 1 ? '' : 's'} reported a load error.`
    : `Ready · ${state.services.length} provider${state.services.length === 1 ? '' : 's'} · ${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}`;
  try {
    const r = await window.aiHub.getDiagnostics?.();
    if (r?.ok) {
      const workspace = r.data.workspace;
      dataDiagnosticsView.diagnosticsSessionState = `${workspace.liveAiHubViews} Hub browser${workspace.liveAiHubViews === 1 ? '' : 's'} active · ${workspace.savedAiHubAccounts} saved · ${workspace.liveArenaViews} Arena browser${workspace.liveArenaViews === 1 ? '' : 's'} active`;
    }
  } catch { /* diagnostics UI must never block settings */ }
  publishDataDiagnosticsControls();
}


function renderWorkspaceApps() { const a=$('launcherAccountCount'); const p=$('launcherProviderCount'); const c=$('launcherClipboardCount'); if(a) a.textContent=state.accounts.length; if(p) p.textContent=state.services.length; if(c) c.textContent=clipboardItems.length; }

function render() {
  // Render core navigation first: an exception in appearance/settings rendering must
  // not leave both AI Hub provider filters and accounts blank.
  renderAccountsSidebar();
  applySettings();
  renderOrganizationFilters(); renderAiHubManagementLists(); renderProviderSelect();
  publishAboutPanelControls();
  const providerPill = $('providerCountPill'); if (providerPill) providerPill.textContent = `${state.services.length} provider${state.services.length === 1 ? '' : 's'}`;
  $('accountCountInfo').textContent = `${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}`;
  publishDataDiagnosticsControls();
  const nProviders = state.services.length; const nAccounts = state.accounts.length;
  applyLockUi();
  renderDownloads();
  bindIconFallbacks();
  if (settingsQuery()) filterSettings();
  updateDiagnostics();
  renderWorkspaceApps(); renderClipboard(); updateWorkspaceView();
}
function hostOfUrl(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
let aiHubAccountNavigationReactRenderer = null;
function renderAiHubAccountNavigation(model) {
  if (typeof aiHubAccountNavigationReactRenderer === 'function') aiHubAccountNavigationReactRenderer(model);
}
function renderOrganizationFilters() {
  // React owns these controls after its entrypoint attaches. Keep the imperative
  // implementation below only as a startup fallback for the module handoff.
  if (typeof aiHubAccountNavigationReactRenderer === 'function') return;
  const groups = [...new Set(state.accounts.map((a) => a.group).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const select = $('orgGroupFilter');
  if (select) {
    const current = select.value;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Groups';
    const options = [placeholder];
    for (const group of groups) {
      const option = document.createElement('option');
      option.value = String(group);
      option.textContent = String(group);
      options.push(option);
    }
    select.replaceChildren(...options);
    if (groups.includes(current)) select.value = current;
  }
  $('orgFavoritesBtn')?.classList.toggle('active', organizationFilter.favorites); $('orgAllBtn')?.classList.toggle('active', !organizationFilter.favorites && !organizationFilter.group);
}
function renderAccountsSidebar() {
  const tiles = $('providerTiles');
  const accountRoot = $('accounts');
  tiles?.removeAttribute('data-render-error');
  accountRoot?.removeAttribute('data-render-error');
  try {
    renderAccountsSidebarImpl();
  } catch (error) {
    // Keep the core account-navigation UI independent from unrelated settings or
    // malformed snapshot issues. The exception is logged without account content.
    console.error('[Mad Station] AI Hub sidebar render failed', error);
    if (tiles && tiles.childElementCount === 0) {
      tiles.dataset.renderError = 'Provider filters could not be displayed. Try reopening AI Hub.';
    }
    if (accountRoot && accountRoot.childElementCount === 0) {
      accountRoot.dataset.renderError = 'Accounts could not be displayed. Saved accounts have not been changed.';
    }
  }
}

window.MadStationAiHubAccountNavigation = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    aiHubAccountNavigationReactRenderer = renderer;
    renderAccountsSidebar();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  selectProvider(id) {
    if (typeof id !== 'string' || (id !== 'all' && !state.services.some((service) => service.id === id))) return;
    const search = $('search');
    if (search) search.value = '';
    updateSearchUi();
    setProviderFilter(id);
  },
  openProviderMenu(id, x, y) {
    if (typeof id === 'string' && state.services.some((service) => service.id === id) && Number.isFinite(x) && Number.isFinite(y)) openProviderMenu(id, x, y);
  },
  addProvider() { openProviderModal(); },
  moveOrder(id, direction) {
    if (typeof id !== 'string' || !state.services.some((service) => service.id === id) || (direction !== 'up' && direction !== 'down')) return;
    void moveOrder('service', id, direction).then(() => focusProviderTile(id));
  },
  reorder(draggedId, targetId, after) {
    if (typeof draggedId !== 'string' || typeof targetId !== 'string' || typeof after !== 'boolean') return;
    const ids = computeReorder(currentOrderIds('service'), draggedId, targetId, after);
    if (ids) void persistOrder('service', ids);
  },
  selectAccount(id) {
    if (typeof id === 'string' && state.accounts.some((account) => account.id === id)) void selectAccount(id);
  },
  showAllAccounts() {
    organizationFilter = { favorites: false, group: '' };
    renderAccountsSidebar();
  },
  showFavorites() {
    organizationFilter = { favorites: true, group: '' };
    renderAccountsSidebar();
  },
  setGroup(group) {
    if (typeof group !== 'string') return;
    const groups = [...new Set(state.accounts.map((account) => account.group).filter((value) => typeof value === 'string' && value))];
    if (group && !groups.includes(group)) return;
    organizationFilter = { favorites: false, group };
    renderAccountsSidebar();
  },
};

function renderAccountsSidebarImpl() {
  const root = $('accounts'); const rawQuery = ($('search')?.value || '').trim(); const query = rawQuery.toLowerCase();
  const services = serviceMap();
  if (providerFilter !== 'all' && !services.has(providerFilter)) providerFilter = 'all';

  const groups = [...new Set(state.accounts.map((account) => account.group).filter((group) => typeof group === 'string' && group))].sort((a, b) => a.localeCompare(b));
  // If an account deletion removes the last member of the selected group, avoid
  // showing an empty result set with a visually unselected group dropdown.
  if (organizationFilter.group && !groups.includes(organizationFilter.group)) organizationFilter = { favorites: false, group: '' };
  const navigationReactOwnsUi = typeof aiHubAccountNavigationReactRenderer === 'function';
  const tiles = $('providerTiles');

  // Build these indexes once per render. Older versions repeatedly scanned the full
  // account array for every provider tile/card, which became noticeable with many accounts.
  const accountCountByService = new Map();
  for (const account of state.accounts) accountCountByService.set(account.serviceId, (accountCountByService.get(account.serviceId) || 0) + 1);

  // --- Provider tiles (filter) ---
  // The legacy branch below remains a startup fallback until the React entrypoint attaches.
  if (!navigationReactOwnsUi) {
  // Keep these DOM nodes stable. Replacing them on every filter/account change
  // forces browser image elements to reload and causes the visible icon flicker.
  const tileSignature = JSON.stringify(orderedServices().map((service) => [service.id, service.name, service.icon, service.iconCandidates, accountCountByService.get(service.id) || 0]));
  if (tiles.dataset.signature !== tileSignature) {
    const previousTileIcons = captureIconNodes(tiles, (img) => {
      const tile = img.closest('[data-provider-filter]');
      return tile ? `provider:${tile.dataset.providerFilter}` : '';
    });
    tiles.innerHTML = '';
    const makeTile = ({ id, label, iconHtml, count, extraClass = '', title = '' }) => {
      const btn = document.createElement('button'); btn.type = 'button';
      btn.className = `tile ${extraClass}`; btn.title = title || label;
      btn.dataset.providerFilter = id;
      btn.setAttribute('role', 'tab');
      btn.innerHTML = `<span class="tile-icon">${iconHtml}</span><span class="tile-label">${escapeHtml(label)}</span>${count == null ? '' : `<span class="tile-count">${count}</span>`}`;
      return btn;
    };
    const allTile = makeTile({ id: 'all', label: 'All', iconHtml: ICON.grid, count: state.accounts.length });
    allTile.addEventListener('click', () => { $('search').value = ''; updateSearchUi(); setProviderFilter('all'); });
    tiles.appendChild(allTile);
    for (const service of orderedServices()) {
      const count = accountCountByService.get(service.id) || 0;
      const tile = makeTile({ id: service.id, label: service.name, iconHtml: iconMarkup(service.icon, '', service.iconCandidates), count, title: `${service.name} · ${count} account${count === 1 ? '' : 's'} · Drag to reorder` });
      tile.draggable = true; tile.dataset.reorderType = 'service'; tile.dataset.reorderId = service.id;
      tile.addEventListener('click', () => { $('search').value = ''; updateSearchUi(); setProviderFilter(service.id); });
      tile.addEventListener('contextmenu', (event) => { event.preventDefault(); openProviderMenu(service.id, event.clientX, event.clientY); });
      tile.addEventListener('keydown', (event) => {
        if (!event.ctrlKey || !event.shiftKey || event.altKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        moveOrder('service', service.id, event.key === 'ArrowLeft' ? 'up' : 'down').then(() => focusProviderTile(service.id));
      });
      tiles.appendChild(tile);
    }
    const addProvider = makeTile({ id: '__add__', label: 'Provider', iconHtml: ICON.plus, count: null, extraClass: 'tile-add', title: 'Add a new provider' });
    addProvider.addEventListener('click', () => openProviderModal());
    tiles.appendChild(addProvider);
    tiles.dataset.signature = tileSignature;
    tiles.dataset.reorderAxis = 'x';
    restoreIconNodes(tiles, previousTileIcons, (img) => {
      const tile = img.closest('[data-provider-filter]');
      return tile ? `provider:${tile.dataset.providerFilter}` : '';
    });
    bindReorderRows(tiles, 'service');
  }
  // Only mutate selection state; never replace provider tile nodes during a filter change.
  tiles.querySelectorAll('[data-provider-filter]').forEach((btn) => {
    const selected = !query && providerFilter === btn.dataset.providerFilter;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-selected', String(selected));
  });
  }

  // --- Heading above the list ---
  const filterService = providerFilter !== 'all' ? services.get(providerFilter) : null;
  const matches = state.accounts.filter((account) => {
    const service = services.get(account.serviceId);
    if (query) return `${account.name} ${account.url} ${service?.name || ''}`.toLowerCase().includes(query);
    return (!filterService || account.serviceId === filterService.id) && (!organizationFilter.favorites || account.favorite) && (!organizationFilter.group || account.group === organizationFilter.group);
  });
  const listTitle = query ? `Results for “${rawQuery}” · ${matches.length}` : (filterService ? `${filterService.name} · ${matches.length}` : `All accounts · ${matches.length}`);

  // --- Recent accounts and navigation controls ---
  const recent = (state.recentAccountIds || []).map(id => state.accounts.find(a => a.id === id)).filter(Boolean).slice(0, 5);
  if (!navigationReactOwnsUi) {
    $('listTitle').textContent = listTitle;
    const listAdd = $('listAdd'); listAdd?.classList.add('hidden');
    let recentBox = $('recentAccounts');
    if (!recentBox) { recentBox = document.createElement('div'); recentBox.id = 'recentAccounts'; recentBox.className = 'recent-accounts'; $('providerTiles').parentElement.insertBefore(recentBox, $('listTitle')?.parentElement || root); }
    const previousRecentIcons = captureIconNodes(recentBox, (img) => {
      const item = img.closest('[data-recent-id]');
      return item ? `recent:${item.dataset.recentId}` : '';
    });
    recentBox.innerHTML = (!query && !organizationFilter.favorites && !organizationFilter.group && recent.length) ? `<div class="recent-head">Recent</div>${recent.map(a => `<button type="button" class="recent-item" data-recent-id="${escapeHtml(a.id)}">${iconMarkup(a.icon || services.get(a.serviceId)?.icon || '', '', a.iconCandidates || services.get(a.serviceId)?.iconCandidates)}<span>${escapeHtml(a.name)}</span></button>`).join('')}` : '';
    restoreIconNodes(recentBox, previousRecentIcons, (img) => {
      const item = img.closest('[data-recent-id]');
      return item ? `recent:${item.dataset.recentId}` : '';
    });
    recentBox.querySelectorAll('[data-recent-id]').forEach(btn => btn.addEventListener('click', () => selectAccount(btn.dataset.recentId)));
  } else {
    const modelServices = orderedServices().map((service) => {
      const iconCandidates = [...new Set([service.icon, ...(Array.isArray(service.iconCandidates) ? service.iconCandidates : [])].filter(isImageIcon))];
      if (!iconCandidates.includes(DEFAULT_ICON_DATA_URL)) iconCandidates.push(DEFAULT_ICON_DATA_URL);
      const count = accountCountByService.get(service.id) || 0;
      return {
        id: String(service.id),
        name: String(service.name || 'Unnamed provider'),
        accountCount: count,
        title: `${String(service.name || 'Unnamed provider')} · ${count} account${count === 1 ? '' : 's'} · Drag to reorder`,
        iconCandidates,
      };
    });
    const recentModel = (!query && !organizationFilter.favorites && !organizationFilter.group ? recent : []).map((account) => {
      const service = services.get(account.serviceId);
      const iconCandidates = [...new Set([
        account.icon || service?.icon || '',
        ...(Array.isArray(account.iconCandidates) ? account.iconCandidates : (Array.isArray(service?.iconCandidates) ? service.iconCandidates : [])),
      ].filter(isImageIcon))];
      if (!iconCandidates.includes(DEFAULT_ICON_DATA_URL)) iconCandidates.push(DEFAULT_ICON_DATA_URL);
      return { id: String(account.id), name: String(account.name || 'Unnamed account'), iconCandidates };
    });
    renderAiHubAccountNavigation({
      services: modelServices,
      totalAccounts: state.accounts.length,
      providerFilter,
      searchActive: Boolean(query),
      favorites: organizationFilter.favorites,
      group: organizationFilter.group,
      groups,
      listTitle,
      recent: recentModel,
      showRecent: !query && !organizationFilter.favorites && !organizationFilter.group,
    });
  }

  // Compute the card model before touching #accounts. After React mounts it owns
  // that subtree for every state, including the empty/loading-independent states;
  // the old imperative branch below only runs during the initial bundle handoff.
  const accountRank = new Map(orderedAccounts().map((a, i) => [a.id, i]));
  const serviceRank = new Map(orderedServices().map((service, i) => [service.id, i]));
  const sorted = [...matches].sort((a, b) => {
    const pinDelta = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    if (pinDelta) return pinDelta;
    const accountDelta = (accountRank.get(a.id) ?? 999999) - (accountRank.get(b.id) ?? 999999);
    if (accountDelta) return accountDelta;
    return (serviceRank.get(a.serviceId) ?? 999999) - (serviceRank.get(b.serviceId) ?? 999999);
  });
  const columns = Math.max(1, Math.floor((root.clientWidth + 10) / 68));
  const reactAccountList = window.MadStationAccountList;
  if (reactAccountList) {
    const hasNoMatches = state.accounts.length > 0 && sorted.length === 0;
    const emptyTitle = hasNoMatches ? (query ? 'No matches' : `No ${filterService?.name || ''} accounts`) : '';
    const emptyDescription = hasNoMatches
      ? (query ? `Nothing matches “${rawQuery}”.` : `Use “Add ${filterService?.name || 'account'}” above to create one.`)
      : '';
    root.dataset.reorderAxis = state.settings?.density === 'compact' ? 'x' : 'y';
    reactAccountList.update({
      accounts: sorted,
      hasAnyAccounts: state.accounts.length > 0,
      services: orderedServices(),
      activeId: state.activeId,
      density: state.settings?.density || 'comfortable',
      remoteIcons: state.settings?.security?.remoteIcons !== false,
      columns,
      emptyTitle,
      emptyDescription,
      addTitle: filterService ? `Add an account for ${filterService.name}` : 'Add a new account',
      filterServiceId: filterService?.id || null,
      onSelect: (id) => selectAccount(id),
      onOpenMenu: (id, x, y) => openAccountMenu(id, x, y),
      onAddAccount: (providerId) => openAccountModal(providerId),
      onReorder: async (dragId, targetId, after) => {
        const ids = computeReorder(currentOrderIds('account'), dragId, targetId, after);
        if (ids) await persistOrder('account', ids);
      },
    });
    bindIconFallbacks(tiles);
    return;
  }

  // React is the sole owner of the #accounts subtree. During the brief module
  // handoff show a neutral loading state instead of maintaining a second legacy renderer.
  root.textContent = 'Loading accounts…';
  bindIconFallbacks(tiles);
}

// ---- Account options menu (⋯ button or right-click) ----
let contextMenuReactRenderer = null;
let contextMenuActions = [];
let contextMenuModel = { items: [] };
function contextMenuIconName(markup) {
  for (const [name, value] of Object.entries(ICON)) if (value === markup) {
    if (['rename', 'plus', 'keyboard', 'refresh', 'reset', 'trash', 'arrowLeft', 'arrowRight'].includes(name)) return name;
  }
  return null;
}
const CONTEXT_MENU_ICON_SHAPES = {
  rename: [['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }], ['path', { d: 'M13.5 6.5l4 4' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  keyboard: [['rect', { x: '3', y: '6', width: '18', height: '12', rx: '2' }], ['path', { d: 'M7 10h.01M11 10h.01M15 10h.01M7 14h10' }]],
  refresh: [['path', { d: 'M20 12a8 8 0 1 1-2.6-5.9' }], ['path', { d: 'M20 4v5h-5' }]],
  reset: [['path', { d: 'M20 12a8 8 0 1 1-2.6-5.9' }], ['path', { d: 'M20 4v5h-5' }]],
  trash: [['path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' }]],
  arrowLeft: [['path', { d: 'M19 12H5M11 6l-6 6 6 6' }]],
  arrowRight: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
};
function appendContextMenuIcon(host, markup) {
  const iconName = contextMenuIconName(markup);
  const shapes = CONTEXT_MENU_ICON_SHAPES[iconName];
  if (!shapes) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    svg.appendChild(shape);
  }
  host.appendChild(svg);
}
function renderContextMenuFallback(items) {
  const menu = $('ctxMenu');
  menu.replaceChildren();
  items.forEach((item) => {
    if (item.sep) { const sep = document.createElement('div'); sep.className = 'ctx-sep'; menu.appendChild(sep); return; }
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = `ctx-item ${item.danger ? 'danger' : ''}`; btn.setAttribute('role', 'menuitem');
    const iconHost = document.createElement('span'); iconHost.className = 'ctx-icon';
    if (typeof item.icon === 'string' && Object.values(ICON).includes(item.icon)) appendContextMenuIcon(iconHost, item.icon);
    const label = document.createElement('span'); label.textContent = String(item.label || '');
    btn.append(iconHost, label);
    btn.addEventListener('click', () => { closeCtxMenu(); item.run(); });
    menu.appendChild(btn);
  });
}
function closeCtxMenu() {
  const menu = $('ctxMenu');
  menu.classList.add('hidden');
  if (typeof contextMenuReactRenderer === 'function') {
    contextMenuActions = [];
    contextMenuModel = { items: [] };
    contextMenuReactRenderer(contextMenuModel);
  } else {
    menu.replaceChildren();
    contextMenuActions = [];
    contextMenuModel = { items: [] };
  }
}
window.MadStationContextMenu = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    contextMenuReactRenderer = renderer;
    renderer(contextMenuModel);
  },
  action(id) {
    if (!Number.isInteger(id) || id < 0 || id >= contextMenuActions.length) return;
    const run = contextMenuActions[id];
    if (typeof run !== 'function') return;
    closeCtxMenu();
    run();
  },
};
function duplicateAccount(id) { const account = state.accounts.find((item) => item.id === id); if (!account) return; openAccountModal('', null, false, { name: `${account.name} Copy`, serviceId: account.serviceId, url: account.url, icon: account.icon || '', favorite: false, temporary: false, group: account.group || '', tags: (account.tags || []).join(', '), pageZoom: String(account.preferences?.pageZoom || 100), openOnStartup: false, clearCacheOnExit: 'inherit', signOutOnExit: 'inherit', camera: 'inherit', microphone: 'inherit', notifications: 'inherit', fullscreen: 'inherit' }); }
function openAccountMenu(id, x, y) {
  const account = state.accounts.find((a) => a.id === id); if (!account) return;
  const items = [
    { icon: ICON.rename, label: 'Edit account', run: () => openAccountModal('', id) },
    { icon: ICON.rename, label: 'Rename', run: () => openRenameModal(id) },
    { icon: ICON.plus, label: 'Duplicate account', run: () => duplicateAccount(id) },
    { icon: ICON.keyboard, label: account.shortcut ? `Shortcut (${account.shortcut})` : 'Set shortcut', run: async () => { await openSettings('shortcuts'); openShortcutEditor(id); } },
    { icon: ICON.refresh, label: 'Reset login', run: () => resetAccountLogin(id) },
    { icon: ICON.refresh, label: 'Clear cache', run: () => clearAccountCache(id) },
    { icon: ICON.reset, label: 'Clear site data', run: () => clearAccountSiteData(id) },
    { sep: true },
    { icon: ICON.trash, label: 'Delete account', danger: true, run: () => deleteAccount(id) },
  ];
  showCtxMenu(items, x, y);
}
function openProviderMenu(id, x, y) {
  const ids = currentOrderIds('service'); const index = ids.indexOf(id);
  const service = state.services.find((item) => item.id === id); if (!service || index < 0) return;
  const items = [];
  if (index > 0) items.push({ icon: ICON.arrowLeft, label: 'Move earlier', run: async () => { await moveOrder('service', id, 'up'); focusProviderTile(id); } });
  if (index < ids.length - 1) items.push({ icon: ICON.arrowRight, label: 'Move later', run: async () => { await moveOrder('service', id, 'down'); focusProviderTile(id); } });
  if (items.length) items.push({ sep: true });
  items.push({ icon: ICON.plus, label: `Add ${service.name} account`, run: () => openAccountModal(id) });
  items.push({ icon: ICON.rename, label: 'Edit provider', run: () => openProviderModal(id) });
  showCtxMenu(items, x, y);
}
function showCtxMenu(items, x, y) {
  const menu = $('ctxMenu');
  const safeItems = Array.isArray(items) ? items.slice(0, 32) : [];
  contextMenuActions = safeItems.map((item) => !item?.sep && typeof item?.run === 'function' ? item.run : null);
  contextMenuModel = {
    items: safeItems.map((item, id) => ({
      id,
      separator: Boolean(item?.sep),
      label: String(item?.label || '').slice(0, 240),
      icon: item?.sep ? null : contextMenuIconName(item?.icon),
      danger: item?.danger === true,
    })),
  };
  if (typeof contextMenuReactRenderer === 'function') contextMenuReactRenderer(contextMenuModel);
  else renderContextMenuFallback(safeItems);
  menu.classList.remove('hidden');
  const w = menu.offsetWidth; const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(x - w, window.innerWidth - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
  menu.querySelector('.ctx-item')?.focus();
}
async function resetAccountLogin(id) {
  const account = state.accounts.find((a) => a.id === id); if (!account) return;
  if (!window.confirm(`Sign out of “${account.name}”?\n\nThis clears its saved login and reloads the page. The account stays in your list.`)) return;
  const result = await window.aiHub.resetAccount(id);
  showToast(result?.ok ? `${account.name} was signed out.` : (result?.error || 'Could not reset login.'), !result?.ok);
}
function renameAccountModalViewModel(visible = !$('renameModal').classList.contains('hidden')) {
  const account = state.accounts.find((candidate) => candidate.id === renamingAccountId);
  return {
    visible: Boolean(visible && account),
    accountName: String(account?.name || '').slice(0, 60),
    error: String(renameModalError || '').slice(0, 400),
    saving: renameModalSaving,
  };
}
function publishRenameAccountModal(visible) {
  window.dispatchEvent(new CustomEvent('madstation:rename-account-modal-state', { detail: renameAccountModalViewModel(visible) }));
}
function openRenameModal(id) {
  const account = state.accounts.find((a) => a.id === id); if (!account) return;
  renamingAccountId = id; renameModalError = ''; renameModalSaving = false;
  $('renameError').textContent = ''; $('renameInput').value = String(account.name || '').slice(0, 60);
  $('renameModal').classList.remove('hidden');
  if (renameModalReactMounted) publishRenameAccountModal(true);
  else { $('renameInput').focus(); $('renameInput').select(); }
}
function closeRenameModal() {
  $('renameModal').classList.add('hidden'); renamingAccountId = null; renameModalError = ''; renameModalSaving = false; $('renameError').textContent = '';
  if (renameModalReactMounted) publishRenameAccountModal(false);
  syncOverlayMode();
}
async function handleRenameAccountModalAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'close') { closeRenameModal(); return; }
  if (action.type !== 'save' || typeof action.name !== 'string' || action.name.length > 60 || renameModalSaving || !renamingAccountId) return;
  const name = action.name.trim();
  const accountId = renamingAccountId;
  if (!name || !state.accounts.some((account) => account.id === accountId)) return;
  renameModalSaving = true; renameModalError = ''; publishRenameAccountModal(true);
  let result;
  try { result = await window.aiHub.renameAccount(accountId, name); }
  catch { result = { ok: false, error: 'Could not rename account.' }; }
  if (renamingAccountId !== accountId) return;
  renameModalSaving = false;
  if (!result?.ok) {
    renameModalError = (typeof result?.error === 'string' ? result.error : 'Could not rename account.').slice(0, 400);
    publishRenameAccountModal(true);
    return;
  }
  closeRenameModal(); showToast('Account renamed.');
}
function managementFormProviders() {
  return orderedServices().map((service) => ({
    id: String(service.id), name: String(service.name || 'Unnamed provider'), url: String(service.url || ''),
    icon: String(service.icon || ''), iconCandidates: [...new Set([service.icon, ...(Array.isArray(service.iconCandidates) ? service.iconCandidates : []), DEFAULT_ICON_DATA_URL].filter(isImageIcon))],
  }));
}
function renderProviderSelect() { window.MadStationAiHubManagementForms?.updateProviders(managementFormProviders()); }
function currentOrderIds(type) { return (type === 'service' ? orderedServices() : orderedAccounts()).map((item) => item.id); }
// Pure helper: the new id order after moving dragId just before/after targetId, or null when nothing changes.
function computeReorder(ids, dragId, targetId, after) {
  if (dragId === targetId || !ids.includes(dragId) || !ids.includes(targetId)) return null;
  const next = ids.filter((id) => id !== dragId);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, dragId);
  return next.every((id, index) => id === ids[index]) ? null : next;
}
async function persistOrder(type, ids) {
  const result = type === 'service' ? await window.aiHub.reorderServices(ids) : await window.aiHub.reorderAccounts(ids);
  if (!result?.ok) showToast(result?.error || 'Could not save order.', true);
}
async function moveOrder(type, id, direction) {
  const ids = currentOrderIds(type);
  const index = ids.indexOf(id); if (index < 0) return;
  const next = index + (direction === 'up' ? -1 : 1); if (next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  await persistOrder(type, ids);
}
// The sidebar is rebuilt after every order change, so put keyboard focus back on the moved tile.
function focusProviderTile(id) {
  requestAnimationFrame(() => {
    const tile = [...document.querySelectorAll('#providerTiles [data-provider-filter]')].find((el) => el.dataset.providerFilter === id);
    tile?.focus();
  });
}
// Drag-and-drop for any container whose children carry data-reorder-type / data-reorder-id.
// Lists drop above/below the hovered row; containers with data-reorder-axis="x" (the provider tile grid) drop left/right.
function bindReorderRows(root, type) {
  let draggingId = null;
  const horizontal = root.dataset.reorderAxis === 'x';
  const clearMarks = () => root.querySelectorAll('.reorder-before, .reorder-after').forEach((el) => el.classList.remove('reorder-before', 'reorder-after'));
  const isAfter = (event, row) => {
    const rect = row.getBoundingClientRect();
    return horizontal ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
  };
  root.querySelectorAll(`[data-reorder-type="${type}"]`).forEach((row) => {
    row.addEventListener('dragstart', (event) => {
      draggingId = row.dataset.reorderId;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingId);
    });
    row.addEventListener('dragend', () => { draggingId = null; row.classList.remove('dragging'); clearMarks(); });
    row.addEventListener('dragover', (event) => {
      if (!draggingId || draggingId === row.dataset.reorderId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearMarks();
      row.classList.add(isAfter(event, row) ? 'reorder-after' : 'reorder-before');
    });
    row.addEventListener('dragleave', (event) => { if (!row.contains(event.relatedTarget)) row.classList.remove('reorder-before', 'reorder-after'); });
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      const dragId = draggingId; const after = isAfter(event, row);
      clearMarks();
      const ids = computeReorder(currentOrderIds(type), dragId, row.dataset.reorderId, after);
      if (ids) await persistOrder(type, ids);
    });
  });
}
let aiHubManagementListsReactRenderer = null;

function renderAiHubManagementLists() {
  if (typeof aiHubManagementListsReactRenderer !== 'function') return;
  const countByService = new Map();
  for (const account of state.accounts) countByService.set(account.serviceId, (countByService.get(account.serviceId) || 0) + 1);
  const services = orderedServices().map((service) => ({
    id: String(service.id),
    name: String(service.name || 'Unnamed provider'),
    url: String(service.url || ''),
    category: String(service.category || ''),
    description: String(service.description || ''),
    freeTier: Boolean(service.freeTier),
    accountCount: countByService.get(service.id) || 0,
    iconCandidates: [...new Set([service.icon, ...(Array.isArray(service.iconCandidates) ? service.iconCandidates : []), DEFAULT_ICON_DATA_URL].filter(isImageIcon))],
  }));
  const serviceLookup = serviceMap();
  const accounts = orderedAccounts().map((account) => {
    const service = serviceLookup.get(account.serviceId);
    return {
      id: String(account.id),
      name: String(account.name || 'Unnamed account'),
      url: String(account.url || ''),
      serviceId: String(account.serviceId || ''),
      serviceName: String(service?.name || 'Unknown'),
      favorite: Boolean(account.favorite),
      shortcut: String(account.shortcut || ''),
      iconCandidates: [...new Set([account.icon, ...(Array.isArray(account.iconCandidates) ? account.iconCandidates : []), service?.icon, ...(Array.isArray(service?.iconCandidates) ? service.iconCandidates : []), DEFAULT_ICON_DATA_URL].filter(isImageIcon))],
    };
  });
  aiHubManagementListsReactRenderer({
    services,
    accounts,
    activeId: typeof state.activeId === 'string' ? state.activeId : null,
    recordingShortcutTarget,
  });
}

// React owns the visible provider, account-management, and shortcut rows. The
// Electron/renderer host remains the typed-action adapter for mutations and navigation.
window.MadStationAiHubManagementLists = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    aiHubManagementListsReactRenderer = renderer;
    renderAiHubManagementLists();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  action(action, id) {
    if (typeof id !== 'string' || !id) return;
    if (action === 'edit-provider') openProviderModal(id);
    else if (action === 'delete-provider') void deleteProvider(id);
    else if (action === 'select-account') void selectAccount(id);
    else if (action === 'shortcut') openShortcutEditor(id);
    else if (action === 'rename-account') renameAccount(id);
    else if (action === 'delete-account') void deleteAccount(id);
  },
  moveOrder(type, id, direction) {
    if ((type === 'service' || type === 'account') && typeof id === 'string' && (direction === 'up' || direction === 'down')) void moveOrder(type, id, direction);
  },
  reorder(type, draggedId, targetId, after) {
    if ((type !== 'service' && type !== 'account') || typeof draggedId !== 'string' || typeof targetId !== 'string' || typeof after !== 'boolean') return;
    const ids = computeReorder(currentOrderIds(type), draggedId, targetId, after);
    if (ids) void persistOrder(type, ids);
  },
  clearShortcut(id) {
    if (typeof id !== 'string' || !id) return;
    void (async () => {
      const result = await window.aiHub.setAccountShortcut(id, '');
      if (result?.ok) showToast('Shortcut cleared.');
      else showToast(result?.error || 'Could not clear shortcut.', true);
    })();
  },
};

// Existing shortcut-recording flows call this compatibility name; the actual
// list rendering is now React-owned.
function renderShortcuts() { renderAiHubManagementLists(); }

async function selectAccount(id) {
  closeCtxMenu();
  if (!$('settingsScreen').classList.contains('hidden')) await closeSettings();
  const result = await window.aiHub.switchAccount(id);
  if (result?.ok === false) return showToast(result.error || 'Could not switch account.', true);
  // The main process emits active-changed. Do not call render() here: rebuilding
  // the whole sidebar destroys every icon DOM node and causes the visible flicker.
}
async function openSettings(tab, scope) {
  document.dispatchEvent(new CustomEvent('madstation:settings-opening'));
  settingsScope = scope || (currentApp === 'ai-hub' ? 'aihub' : 'global');
  settingsReturnApp = currentApp;
  const defaultTab = tab || (settingsScope === 'aihub' ? 'providers' : 'appearance');
  $('settingsScreen').classList.remove('hidden');
  $('settingsTitle').textContent = settingsScope === 'aihub' ? 'AI Hub settings' : 'Mad Station settings';
  $('settingsScopeText').textContent = settingsScope === 'aihub' ? 'Only settings for AI Hub live here.' : 'Shared across every Mad Station app.';
  await window.aiHub.setControlMode('settings');
  clearSettingsSearch();
  setSettingsScope(settingsScope, defaultTab);
}
async function closeSettings() { recordingShortcutTarget = null; clearSettingsSearch(); $('settingsScreen').classList.add('hidden'); await window.aiHub.setControlMode(settingsReturnApp === 'ai-hub' ? 'app' : 'launcher'); updateWorkspaceView(); document.dispatchEvent(new CustomEvent('madstation:settings-closed')); }
// Tabs that were merged into others still resolve, so older callers keep working.
const SETTINGS_TAB_ALIASES = { general: 'appearance' };
const SETTINGS_SCOPE_TABS = { global: ['appearance','accessibility','audio','startup','lock','downloads','data','developer','about'], aihub: ['providers','accounts','shortcuts','appearance','privacy','websites'] };
function setSettingsScope(scope, tab) { settingsScope = scope === 'aihub' ? 'aihub' : 'global'; document.querySelectorAll('[data-settings-scope]').forEach((el) => el.classList.toggle('scope-hidden', el.dataset.settingsScope !== settingsScope)); activateSettingsTab(tab || SETTINGS_SCOPE_TABS[settingsScope][0]); }
function activateSettingsTab(tab) { tab = SETTINGS_TAB_ALIASES[tab] || tab; if (!SETTINGS_SCOPE_TABS[settingsScope]?.includes(tab)) tab = SETTINGS_SCOPE_TABS[settingsScope][0]; document.querySelector('.st-nav')?.classList.remove('expanded'); if (settingsQuery()) clearSettingsSearch(); $('settingsContent').scrollTop = 0; document.querySelectorAll('.settings-tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab && el.dataset.settingsScope === settingsScope)); document.querySelectorAll('.settings-panel').forEach((el) => el.classList.toggle('active', el.dataset.panel === tab && el.dataset.settingsScope === settingsScope)); window.dispatchEvent(new Event(settingsScope === 'global' && tab === 'developer' ? 'madstation:developer-settings-opened' : 'madstation:developer-settings-closed')); if (tab === 'audio') { refreshAudioDevices({ silent: true }).catch(() => {}); } }
function updateWorkspaceView() {
  setVideoHubSessionActive(currentApp === 'video-hub');
  $('launcherScreen').classList.toggle('hidden', currentApp !== 'launcher');
  $('clipboardScreen').classList.toggle('hidden', currentApp !== 'clipboard');
  $('videoHubScreen').classList.toggle('hidden', currentApp !== 'video-hub');
  $('imageHubScreen').classList.toggle('hidden', currentApp !== 'image-hub');
  $('aiLabScreen').classList.toggle('hidden', currentApp !== 'ai-lab');
  $('instructionScreen').classList.toggle('hidden', currentApp !== 'instruction-forge');
  document.body.dataset.workspaceApp = currentApp;
  document.dispatchEvent(new CustomEvent('mad:workspace-view-updated', { detail: { app: currentApp } }));
  document.title = currentApp === 'launcher' ? 'Mad Station' : currentApp === 'image-hub' ? 'Image Hub — Mad Station' : currentApp === 'video-hub' ? 'Video Hub — Mad Station' : currentApp === 'clipboard' ? 'Notes & Tasks — Mad Station' : currentApp === 'ai-lab' ? 'AI Playground — Mad Station' : currentApp === 'instruction-forge' ? 'Prompt Studio — Mad Station' : 'AI Hub — Mad Station';
  if (currentApp === 'instruction-forge') requestAnimationFrame(scheduleForgeBrowserLayout);
  if (currentApp === 'video-hub') requestAnimationFrame(scheduleVideoHubBrowserLayout);
}

// ---------------------------------------------------------------------------
// Shared live RAM monitor used by Main, AI Hub, Clipboard and AI Playground.
// It stays compact so it never competes with the workspace content.
let ramMonitorTimer = null;
let ramMonitorBusy = false;
let latestMemorySnapshot = null;
let memoryProcessesModalOpen = false;
const RAM_HISTORY_MAX = 48; // ~2 minutes of samples at the 2.5 s refresh interval
const ramHistory = [];
const RAM_MONITOR_APPS = new Set(['launcher', 'ai-hub', 'clipboard', 'ai-lab', 'instruction-forge', 'video-hub', 'image-hub']);

function formatRamMb(kb) {
  const mb = Math.max(0, Number(kb) || 0) / 1024;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}
function formatRamKb(kb) {
  const bytes = Math.max(0, Number(kb) || 0) * 1024;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
function clipboardRetainedBytes() {
  // Approximate UTF-16 payload size; the actual JS/DOM footprint is higher.
  return clipboardItems.reduce((sum, item) => sum + (item?.text?.length || 0) * 2, 0);
}
function homeTelemetryMarkup() {
  return `<section class="home-tele" data-memory-monitor data-memory-scope="home" data-level="low" aria-label="Mad Station RAM monitor">
    <header class="home-tele-head">
      <span class="home-tele-title"><i class="home-tele-dot" aria-hidden="true"></i>RAM monitor</span>
      <span class="home-tele-actions">
        <button class="home-tele-btn" data-memory-cleanup type="button" title="Reclaim unused memory" aria-label="Reclaim unused memory"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3c4.5 3 6.5 6 6.5 9.2A6.5 6.5 0 0 1 12 19a6.5 6.5 0 0 1-6.5-6.8C5.5 9 7.5 6 12 3z"></path><path d="M12 19v-7M12 15l3-3"></path></svg></button>
        <button class="home-tele-btn" data-memory-refresh type="button" title="Refresh RAM monitor" aria-label="Refresh RAM monitor"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9"></path><path d="M20 4v5h-5"></path></svg></button>
      </span>
    </header>
    <div class="home-tele-main">
      <div class="home-tele-ring" data-memory-slot="ring" aria-hidden="true"><div class="home-tele-ring-inner"><strong data-memory-slot="percent">—</strong><span>of RAM</span></div></div>
      <div class="home-tele-readout">
        <span class="home-tele-label">App memory</span>
        <strong class="home-tele-total" data-memory-slot="total">—</strong>
        <span class="home-tele-sub" data-memory-slot="summary">Measuring…</span>
      </div>
    </div>
    <div class="home-tele-cpu" data-level="unknown">
      <div class="home-tele-cpu-head"><span>Processor</span><strong data-cpu-slot="value">Measuring…</strong></div>
      <div class="home-tele-cpu-meter" role="meter" aria-label="System CPU utilization" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Measuring…"><i data-cpu-slot="bar"></i></div>
      <div class="home-tele-cpu-foot"><span>System CPU · all logical cores</span><span>Sampling…</span></div>
    </div>
    <div class="home-tele-spark" aria-hidden="true"><small>Last 2 min</small><svg viewBox="0 0 120 40" preserveAspectRatio="none"><path class="home-spark-area" data-memory-slot="spark-area" d=""></path><path class="home-spark-line" data-memory-slot="spark-line" d=""></path></svg></div>
    <div class="home-tele-bar" aria-hidden="true"><i data-memory-bar="main"></i><i data-memory-bar="browser"></i><i data-memory-bar="gpu"></i><i data-memory-bar="other"></i></div>
    <ul class="home-tele-legend" aria-label="RAM breakdown">
      <li data-seg="main"><span>Main process</span><strong data-memory-slot="main">—</strong></li>
      <li data-seg="browser"><span>AI browsers</span><strong data-memory-slot="browser">—</strong></li>
      <li data-seg="gpu"><span>GPU</span><strong data-memory-slot="gpu">—</strong></li>
      <li data-seg="other"><span>UI &amp; other</span><strong data-memory-slot="other">—</strong></li>
    </ul>
    <p class="home-tele-note">Arena browsers use <b data-memory-slot="arena">—</b> · clip buffer ≈ <b data-memory-slot="clipboard">—</b></p>
    <div class="home-tele-foot"><span data-memory-slot="sessions">Browser sessions: —</span><button class="home-tele-more" data-memory-details type="button">Processes <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button></div>
  </section>`;
}
function memoryMonitorMarkup(scope) {
  if (scope === 'home') return homeTelemetryMarkup();
  const scopeLabel = scope === 'sidebar' ? 'AI Hub' : scope === 'ailab' ? 'AI Playground' : scope === 'forge' ? 'Prompt Studio' : scope === 'clipboard' ? 'Notes & Tasks' : 'Main';
  if (scope === 'ailab' || scope === 'clipboard' || scope === 'forge' || scope === 'sidebar') {
    return `<section class="resource-monitor resource-monitor--compact-page resource-monitor--${scope}" data-memory-monitor data-memory-scope="${scope}" aria-label="RAM usage">
      <div class="compact-ram-ring" data-memory-slot="ring" style="--ram-progress:0deg" aria-hidden="true">
        <div class="compact-ram-ring-inner"><strong data-memory-slot="percent">—</strong><span>RAM</span></div>
      </div>
      <strong class="compact-ram-total" data-memory-slot="total">—</strong>
    </section>`;
  }
  return `<section class="resource-monitor resource-monitor--${scope}" data-memory-monitor data-memory-scope="${scope}" aria-label="Mad Station RAM monitor">
    <div class="resource-monitor-head">
      <div class="resource-monitor-title"><span class="resource-monitor-dot" aria-hidden="true"></span><strong>RAM</strong><span class="resource-monitor-context">${scopeLabel}</span></div>
      <span class="resource-monitor-actions"><button class="resource-monitor-tool" data-memory-cleanup type="button" title="Reclaim unused memory" aria-label="Reclaim unused memory">♻</button><button class="resource-monitor-tool" data-memory-refresh type="button" title="Refresh RAM monitor" aria-label="Refresh RAM monitor">↻</button></span>
    </div>
    <div class="resource-monitor-hero">
      <div class="resource-monitor-ring" data-memory-slot="ring" style="--ram-progress:0deg" aria-hidden="true"><div class="resource-monitor-ring-inner"><strong data-memory-slot="percent">—</strong><span>RAM</span></div></div>
      <div class="resource-monitor-readout">
        <span class="resource-monitor-readout-label">Working set</span>
        <strong data-memory-slot="total">—</strong>
        <span class="resource-monitor-system" data-memory-slot="system">—</span>
        <div class="resource-monitor-glow-line" aria-hidden="true"><span data-memory-slot="line"></span></div>
      </div>
    </div>
    <div class="resource-monitor-stats" aria-label="RAM breakdown">
      <span><b>Main</b><strong data-memory-slot="main">—</strong></span>
      <span><b>Browsers</b><strong data-memory-slot="browser">—</strong></span>
      <span><b>Arena</b><strong data-memory-slot="arena">—</strong></span>
      <span><b>GPU</b><strong data-memory-slot="gpu">—</strong></span>
      <span><b>Clip</b><strong data-memory-slot="clipboard">—</strong></span>
    </div>
    <div class="resource-monitor-meta"><span data-memory-slot="sessions">Browser sessions: —</span><span data-memory-slot="summary">Measuring…</span></div>
    <details class="resource-monitor-details">
      <summary><span>Processes</span><span data-memory-slot="process-count">—</span></summary>
      <div class="resource-monitor-process-actions"><span data-memory-slot="process-preview">Live process memory</span><button class="resource-monitor-details-btn" data-memory-details type="button">View details</button></div>
      <div data-memory-slot="processes" class="resource-monitor-processes"></div>
    </details>
  </section>`;
}
let memoryMonitorReactRenderer = null;
function installMemoryMonitors() {
  const targets = [
    ['aiLabRamMonitorMount', 'ailab'],
    ['aiHubRamMonitorMount', 'sidebar'],
    ['videoHubRamMonitorMount', 'sidebar'],
    ['imageHubRamMonitorMount', 'sidebar'],
    ['clipboardRamMonitorMount', 'clipboard'],
    ['launcherRamMonitorMount', 'home'],
    ['forgeRamMonitorMount', 'forge'],
  ];
  for (const [id, scope] of targets) {
    const mount = $(id);
    if (mount && !memoryMonitorReactRenderer && !mount.querySelector('[data-memory-monitor]')) mount.innerHTML = memoryMonitorMarkup(scope);
  }
  document.querySelectorAll('[data-memory-refresh]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', refreshMemoryMonitor);
  });
  document.querySelectorAll('[data-memory-cleanup]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', reclaimMemoryFromUi);
  });
  document.querySelectorAll('[data-memory-details]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', openMemoryProcessesModal);
  });
  const memoryModal = $('memoryProcessesModal');
  if (memoryModal?.dataset.bound !== 'true') {
    memoryModal.dataset.bound = 'true';
    $('closeMemoryProcessesModal')?.addEventListener('click', closeMemoryProcessesModal);
    $('closeMemoryProcessesBtn')?.addEventListener('click', closeMemoryProcessesModal);
    memoryModal.addEventListener('click', (event) => { if (event.target === memoryModal) closeMemoryProcessesModal(); });
    $('refreshMemoryProcessesBtn')?.addEventListener('click', refreshMemoryMonitor);
  }
}
window.MadStationMemoryMonitor = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    memoryMonitorReactRenderer = renderer;
    renderMemoryMonitor(latestMemorySnapshot);
  },
  requestAction(action) {
    if (!['refresh', 'cleanup', 'details'].includes(action) || !RAM_MONITOR_APPS.has(currentApp) || state.locked) return;
    if (action === 'refresh') void refreshMemoryMonitor();
    else if (action === 'cleanup') void reclaimMemoryFromUi();
    else openMemoryProcessesModal();
  },
};
let memoryProcessTableReactRenderer = null;
function renderMemoryProcessTable(snapshot = latestMemorySnapshot) {
  const updated = $('memoryProcessesUpdated');
  const processList = Array.isArray(snapshot?.processes) ? snapshot.processes : (Array.isArray(snapshot?.top) ? snapshot.top : []);
  const model = {
    summary: [
      { label: 'App working set', value: formatRamKb(snapshot?.totalKb) },
      { label: 'Main', value: formatRamKb(snapshot?.mainKb) },
      { label: 'Browsers', value: formatRamKb((Number(snapshot?.aiHubKb) || 0) + (Number(snapshot?.arenaKb) || 0) + (Number(snapshot?.forgeKb) || 0)) },
      { label: 'GPU', value: formatRamKb(snapshot?.gpuKb) },
    ],
    processes: processList.map((process) => ({
      name: String(process?.name || 'Unknown process'),
      type: String(process?.type || 'Other'),
      pid: Number(process?.pid) || 0,
      ram: formatRamKb(process?.workingSetKb),
    })),
  };
  if (updated) updated.textContent = snapshot?.timestamp ? `Updated ${new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Measuring…';
  if (typeof memoryProcessTableReactRenderer === 'function') memoryProcessTableReactRenderer(model);
}
window.MadStationMemoryProcessTable = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    memoryProcessTableReactRenderer = renderer;
    renderMemoryProcessTable(latestMemorySnapshot);
  },
};

function openMemoryProcessesModal() {
  if (!RAM_MONITOR_APPS.has(currentApp) || state.locked) return;
  const modal = $('memoryProcessesModal');
  if (!modal) return;
  memoryProcessesModalOpen = true;
  modal.classList.remove('hidden');
  renderMemoryProcessTable();
  refreshMemoryMonitor();
}
function closeMemoryProcessesModal() {
  memoryProcessesModalOpen = false;
  $('memoryProcessesModal')?.classList.add('hidden');
}

function renderMemoryMonitor(snapshot) {
  latestMemorySnapshot = snapshot || null;
  const total = Number(snapshot?.totalKb) || 0;
  const rawCpuPercent = snapshot?.systemCpuPercent;
  const systemCpuPercent = Number.isFinite(rawCpuPercent) ? Math.max(0, Math.min(100, rawCpuPercent)) : null;
  const systemCpuLabel = systemCpuPercent === null ? 'Measuring…' : `${Math.round(systemCpuPercent)}%`;
  const systemTotal = Number(snapshot?.systemTotalKb) || 0;
  const systemAvailable = Number(snapshot?.systemAvailableKb) || 0;
  const appPercent = systemTotal ? Math.min(100, (total / systemTotal) * 100) : 0;
  const browserKb = (Number(snapshot?.aiHubKb) || 0) + (Number(snapshot?.arenaKb) || 0) + (Number(snapshot?.forgeKb) || 0);
  const browserShare = total ? Math.round((browserKb / total) * 100) : 0;
  const clipboardKb = Math.ceil(clipboardRetainedBytes() / 1024);
  if (total > 0) { ramHistory.push(total); if (ramHistory.length > RAM_HISTORY_MAX) ramHistory.shift(); }
  const processList = Array.isArray(snapshot?.top) ? snapshot.top : [];
  const allProcesses = Array.isArray(snapshot?.processes) ? snapshot.processes : processList;
  const mainKb = Number(snapshot?.mainKb) || 0;
  const gpuKb = Number(snapshot?.gpuKb) || 0;
  const otherKb = Math.max(0, total - mainKb - browserKb - gpuKb);
  let sparkLine = '';
  let sparkArea = '';
  if (ramHistory.length > 1) {
    const lo = Math.min(...ramHistory); const hi = Math.max(...ramHistory);
    const span = Math.max(hi - lo, hi * 0.04, 1);
    const pts = ramHistory.map((v, i) => [ (i / (RAM_HISTORY_MAX - 1)) * 120, 36 - ((v - lo) / span) * 30 ]);
    const offset = 120 - pts[pts.length - 1][0];
    sparkLine = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + offset).toFixed(1)} ${y.toFixed(1)}`).join(' ');
    sparkArea = sparkLine ? `${sparkLine} L120 40 L${offset.toFixed(1)} 40 Z` : '';
  }
  const viewModel = {
    totalLabel: formatRamKb(total),
    compactTotalLabel: formatRamMb(total),
    systemLabel: systemTotal ? `${appPercent.toFixed(1)}% RAM` : 'system RAM —',
    percentLabel: systemTotal ? `${appPercent.toFixed(0)}%` : '—',
    appPercent,
    mainLabel: formatRamKb(snapshot?.mainKb),
    browserLabel: formatRamKb(browserKb),
    arenaLabel: formatRamKb(snapshot?.arenaKb),
    gpuLabel: formatRamKb(snapshot?.gpuKb),
    clipboardLabel: formatRamKb(clipboardKb),
    summaryLabel: systemTotal ? `${browserShare}% browser · ${formatRamKb(systemAvailable)} available` : `${browserShare}% browser · working set`,
    sessionsLabel: `Hub ${snapshot?.liveAiHubSessions || 0}/${snapshot?.aiHubSavedSessions || 0} active · Arena ${snapshot?.liveArenaSessions || 0}/${snapshot?.arenaSavedSelections || 0} · Forge ${snapshot?.liveForgeSessions || 0} live`,
    processCountLabel: allProcesses.length ? `${allProcesses.length} total` : 'Unavailable',
    processPreviewLabel: allProcesses.length ? `${allProcesses.slice(0, 3).map((p) => String(p?.name || 'Unknown process').slice(0, 100)).join(' · ')}${allProcesses.length > 3 ? ' · …' : ''}` : 'Live process memory',
    processRows: processList.slice(0, 100).map((p) => ({ name: String(p?.name || 'Unknown process').slice(0, 160), ram: formatRamKb(p?.workingSetKb) })),
    systemCpuPercent,
    systemCpuLabel,
    home: {
      otherLabel: formatRamKb(otherKb), mainShare: mainKb, browserShare: browserKb, gpuShare: gpuKb, otherShare: otherKb,
      level: appPercent >= 40 ? 'high' : appPercent >= 20 ? 'mid' : 'low', sparkLine, sparkArea,
    },
  };
  document.dispatchEvent(new CustomEvent('mad:memory-model', { detail: viewModel }));
  if (memoryMonitorReactRenderer) {
    memoryMonitorReactRenderer(viewModel);
    if (memoryProcessesModalOpen) renderMemoryProcessTable(snapshot);
    return;
  }
  document.querySelectorAll('[data-memory-monitor]').forEach((root) => {
    const set = (slot, value) => { const el = root.querySelector(`[data-memory-slot="${slot}"]`); if (el) el.textContent = value; };
    set('total', formatRamKb(total));
    if (root.classList.contains('resource-monitor--compact-page')) set('total', formatRamMb(total));
    set('system', systemTotal ? `${appPercent.toFixed(1)}% RAM` : 'system RAM —');
    set('main', formatRamKb(snapshot?.mainKb));
    set('browser', formatRamKb(browserKb));
    set('arena', formatRamKb(snapshot?.arenaKb));
    set('gpu', formatRamKb(snapshot?.gpuKb));
    set('clipboard', formatRamKb(clipboardKb));
    set('meter', '');
    const meter = root.querySelector('[data-memory-slot="meter"]');
    if (meter) meter.style.width = `${appPercent}%`;
    const percentText = systemTotal ? `${appPercent.toFixed(0)}%` : '—';
    set('percent', percentText);
    const ring = root.querySelector('[data-memory-slot="ring"]');
    if (ring) ring.style.setProperty('--ram-progress', `${Math.max(0, Math.min(100, appPercent)) * 3.6}deg`);
    const line = root.querySelector('[data-memory-slot="line"]');
    if (line) line.style.width = `${Math.max(0, Math.min(100, appPercent))}%`;
    set('summary', systemTotal
      ? `${browserShare}% browser · ${formatRamKb(systemAvailable)} available`
      : `${browserShare}% browser · working set`);
    set('sessions', `Hub ${snapshot?.liveAiHubSessions || 0}/${snapshot?.aiHubSavedSessions || 0} active · Arena ${snapshot?.liveArenaSessions || 0}/${snapshot?.arenaSavedSelections || 0} · Forge ${snapshot?.liveForgeSessions || 0} live`);
    // Home telemetry extras: disjoint breakdown bar, level colour and a short history sparkline.
    if (root.dataset.memoryScope === 'home') {
      const cpuMeter = root.querySelector('.home-tele-cpu');
      const cpuValue = root.querySelector('[data-cpu-slot="value"]');
      const cpuBar = root.querySelector('[data-cpu-slot="bar"]');
      if (cpuMeter) cpuMeter.dataset.level = systemCpuPercent === null ? 'unknown' : systemCpuPercent >= 80 ? 'high' : systemCpuPercent >= 50 ? 'mid' : 'low';
      if (cpuValue) cpuValue.textContent = systemCpuLabel;
      if (cpuBar) cpuBar.style.width = `${systemCpuPercent ?? 0}%`;
      const cpuMeterRole = root.querySelector('.home-tele-cpu-meter');
      if (cpuMeterRole) {
        cpuMeterRole.setAttribute('aria-valuetext', systemCpuLabel);
        if (systemCpuPercent === null) cpuMeterRole.removeAttribute('aria-valuenow');
        else cpuMeterRole.setAttribute('aria-valuenow', String(systemCpuPercent));
      }
      const mainKb = Number(snapshot?.mainKb) || 0;
      const gpuKb = Number(snapshot?.gpuKb) || 0;
      const otherKb = Math.max(0, total - mainKb - browserKb - gpuKb);
      set('other', formatRamKb(otherKb));
      const parts = { main: mainKb, browser: browserKb, gpu: gpuKb, other: otherKb };
      root.querySelectorAll('[data-memory-bar]').forEach((seg) => { seg.style.flexGrow = String(total ? (parts[seg.dataset.memoryBar] || 0) : 0); });
      root.dataset.level = appPercent >= 40 ? 'high' : appPercent >= 20 ? 'mid' : 'low';
      const line = root.querySelector('[data-memory-slot="spark-line"]');
      const area = root.querySelector('[data-memory-slot="spark-area"]');
      if (line && area && ramHistory.length > 1) {
        const lo = Math.min(...ramHistory); const hi = Math.max(...ramHistory);
        const span = Math.max(hi - lo, hi * 0.04, 1);
        const pts = ramHistory.map((v, i) => [ (i / (RAM_HISTORY_MAX - 1)) * 120, 36 - ((v - lo) / span) * 30 ]);
        const offset = 120 - pts[pts.length - 1][0];
        const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + offset).toFixed(1)} ${y.toFixed(1)}`).join(' ');
        line.setAttribute('d', d);
        area.setAttribute('d', `${d} L120 40 L${offset.toFixed(1)} 40 Z`);
      }
    }
    const details = root.querySelector('[data-memory-slot="processes"]');
    const countSlot = root.querySelector('[data-memory-slot="process-count"]');
    const previewSlot = root.querySelector('[data-memory-slot="process-preview"]');
    if (countSlot) countSlot.textContent = viewModel.processCountLabel;
    if (previewSlot) previewSlot.textContent = viewModel.processPreviewLabel;
    if (details) {
      details.replaceChildren();
      if (viewModel.processRows.length) {
        for (const process of viewModel.processRows) {
          const row = document.createElement('div'); row.className = 'resource-monitor-process-row';
          const name = document.createElement('span'); name.textContent = process.name;
          const ram = document.createElement('strong'); ram.textContent = process.ram;
          row.append(name, ram); details.appendChild(row);
        }
      } else {
        const empty = document.createElement('div'); empty.className = 'resource-monitor-process-empty';
        empty.textContent = 'Process metrics unavailable.'; details.appendChild(empty);
      }
    }
  });
  if (memoryProcessesModalOpen) renderMemoryProcessTable(snapshot);
}
async function reclaimMemoryFromUi() {
  try {
    const result = await window.aiHub.reclaimMemory();
    if (!result?.ok) return showToast(result?.error || 'Could not reclaim unused memory.', true);
    const before = formatRamKb(result.before?.appWorkingSetKb);
    const after = formatRamKb(result.after?.appWorkingSetKb);
    const closed = result.closedAccountViews?.length || 0;
    showToast(`Memory cleanup complete · ${before} → ${after}${closed ? ` · closed ${closed} idle browser${closed === 1 ? '' : 's'}` : ''}`);
    await refreshMemoryMonitor();
  } catch (error) { showToast(error?.message || 'Could not reclaim unused memory.', true); }
}
async function refreshMemoryMonitor() {
  if (ramMonitorBusy || document.hidden || !RAM_MONITOR_APPS.has(currentApp) || state.locked) return;
  ramMonitorBusy = true;
  try {
    const result = await window.aiHub.getMemoryInfo();
    if (result?.ok) renderMemoryMonitor(result);
  } catch { /* diagnostics must never interrupt the workspace */ }
  finally { ramMonitorBusy = false; }
}
// The widget manager can unmount and remount a widget at runtime. Reinstalling is
// idempotent (the data-bound flags prevent duplicate handlers) and keeps the
// established RAM telemetry pipeline attached to a re-enabled launcher mount.
document.addEventListener('mad:home-widgets-built', installMemoryMonitors);
installMemoryMonitors();

function syncMemoryMonitor() {
  clearInterval(ramMonitorTimer);
  ramMonitorTimer = null;
  if (!RAM_MONITOR_APPS.has(currentApp) || state.locked) return;
  const schedule = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 350 })
    : (fn) => window.setTimeout(fn, 0);
  // Prime the monitor immediately; subsequent samples keep CPU/RAM readings live.
  // This is important on cold start, where the workspace event can report "launcher"
  // as already active and therefore won't trigger the normal app-change sync path.
  schedule(() => refreshMemoryMonitor());
  ramMonitorTimer = setInterval(refreshMemoryMonitor, 2500);
}
// Start telemetry for the initial launcher as well as for later workspace changes.
// Without this call, the themed homepages stayed at placeholders until the user
// clicked Refresh or switched to another workspace and back.
syncMemoryMonitor();

// ---------------------------------------------------------------------------
// AI Playground
// ---------------------------------------------------------------------------
const AI_LAB_DEFAULTS = {
  settings: { defaultTab: 'model-arena', defaultArena: 'free-account', autoScanLocal: true, rememberArenaAccounts: true },
  models: [
    { id:'openai', name:'OpenAI API', provider:'openai-compatible', endpoint:'https://api.openai.com/v1', model:'gpt-5.1', apiKeyRequired:true },
    { id:'anthropic', name:'Anthropic API', provider:'anthropic', endpoint:'https://api.anthropic.com', model:'claude-sonnet-4-5', apiKeyRequired:true },
    { id:'gemini', name:'Gemini API', provider:'gemini', endpoint:'https://generativelanguage.googleapis.com', model:'gemini-2.5-flash', apiKeyRequired:true },
  ], votes: [], transcripts: []
};
const FORGE_SETTINGS_KEY = 'mad-station-instruction-forge-settings-v1';
const FORGE_DEFAULT_SETTINGS = { defaultModel: '', clearOutput: true, autoCopyOutput: false, keepInput: true };
let forgeSettings = { ...FORGE_DEFAULT_SETTINGS };
function loadForgeSettings() { try { const raw = localStorage.getItem(FORGE_SETTINGS_KEY); const parsed = raw ? JSON.parse(raw) : {}; forgeSettings = { ...FORGE_DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }; localStorage.setItem(FORGE_SETTINGS_KEY, JSON.stringify(forgeSettings)); } catch { forgeSettings = { ...FORGE_DEFAULT_SETTINGS }; } }
function saveForgeSettings() { try { localStorage.setItem(FORGE_SETTINGS_KEY, JSON.stringify(forgeSettings)); } catch {} }
let forgeSettingsReactMounted = false;
let forgeComposerReactMounted = false;
let forgeComposerInputText = '';
let forgeComposerOutputText = '';
let forgeComposerSelectedModelId = '';
const FORGE_COMPOSER_MAX_INPUT = 100000;
function instructionForgeComposerViewModel() {
  const models = labModels().slice(0, 1000).map((model) => ({
    id: String(model.id || '').slice(0, 256),
    label: String(modelLabel(model) || '').slice(0, 300),
    group: model?.provider === 'ai-hub-account' ? 'accounts' : 'api',
  })).filter((model) => model.id);
  const legacySelect = $('forgeModel');
  const selectedModel = models.some((model) => model.id === forgeComposerSelectedModelId)
    ? forgeComposerSelectedModelId
    : models.some((model) => model.id === legacySelect?.value) ? legacySelect.value : (models[0]?.id || '');
  forgeComposerSelectedModelId = selectedModel;
  return {
    models,
    selectedModel,
    input: String(forgeComposerInputText || '').slice(0, FORGE_COMPOSER_MAX_INPUT),
    output: String(forgeComposerOutputText || '').slice(0, 1000000),
    running: Boolean(forgeRunning),
  };
}
function publishInstructionForgeComposer() {
  if (!forgeComposerReactMounted) return;
  window.dispatchEvent(new CustomEvent('madstation:instruction-forge-composer-state', { detail: instructionForgeComposerViewModel() }));
}
function setForgeComposerInput(value, { publish = true } = {}) {
  forgeComposerInputText = (typeof value === 'string' ? value : '').slice(0, FORGE_COMPOSER_MAX_INPUT);
  if (!forgeComposerReactMounted) {
    const legacy = $('forgeInput');
    if (legacy && legacy.value !== forgeComposerInputText) legacy.value = forgeComposerInputText;
  }
  if (publish) publishInstructionForgeComposer();
}
function setForgeComposerOutput(value, { publish = true } = {}) {
  forgeComposerOutputText = (typeof value === 'string' ? value : '').slice(0, 1000000);
  if (!forgeComposerReactMounted) {
    const legacy = $('forgeOutput');
    if (legacy && legacy.value !== forgeComposerOutputText) legacy.value = forgeComposerOutputText;
  }
  if (publish) publishInstructionForgeComposer();
}
function getForgeComposerInput() {
  if (forgeComposerReactMounted) return forgeComposerInputText;
  const legacy = $('forgeInput');
  if (legacy && legacy.value !== forgeComposerInputText) forgeComposerInputText = legacy.value.slice(0, FORGE_COMPOSER_MAX_INPUT);
  return forgeComposerInputText;
}
function getForgeComposerModelId() {
  if (forgeComposerReactMounted) return forgeComposerSelectedModelId;
  const legacy = $('forgeModel');
  return legacy?.value || forgeComposerSelectedModelId;
}
function setForgeComposerModelId(value, { publish = true } = {}) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const models = labModels();
  if (value && !models.some((model) => model.id === value)) return false;
  forgeComposerSelectedModelId = value;
  const legacy = $('forgeModel');
  if (legacy && [...legacy.options].some((option) => option.value === value)) legacy.value = value;
  if (publish) publishInstructionForgeComposer();
  return true;
}
window.addEventListener('madstation:instruction-forge-composer-mounted', () => {
  const legacy = $('instructionForgeComposerLegacy');
  const mount = $('instructionForgeComposerReactMount');
  const legacyInput = $('forgeInput');
  const legacyOutput = $('forgeOutput');
  const legacyModel = $('forgeModel');
  if (legacyInput && !forgeComposerInputText) forgeComposerInputText = legacyInput.value.slice(0, FORGE_COMPOSER_MAX_INPUT);
  if (legacyOutput && !forgeComposerOutputText) forgeComposerOutputText = legacyOutput.value.slice(0, 1000000);
  if (legacyModel && labModels().some((model) => model.id === legacyModel.value)) forgeComposerSelectedModelId = legacyModel.value;
  forgeComposerReactMounted = true;
  if (legacy) legacy.hidden = true;
  if (mount) mount.hidden = false;
  publishInstructionForgeComposer();
});
window.addEventListener('madstation:instruction-forge-composer-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'input-change') {
    if (typeof action.value !== 'string' || action.value.length > FORGE_COMPOSER_MAX_INPUT) return;
    setForgeComposerInput(action.value, { publish: false });
    return;
  }
  if (action.type === 'model-change') {
    if (typeof action.value !== 'string' || !setForgeComposerModelId(action.value)) { publishInstructionForgeComposer(); return; }
    syncForgeBrowserFromModel();
    return;
  }
  if (action.type === 'generate') { void forge(); return; }
  if (action.type === 'copy') {
    const output = forgeComposerOutputText;
    if (!output) return showToast('There is no generated prompt to copy.', true);
    window.aiHub.writeSystemClipboard(output).then((result) => {
      if (result?.ok === false) showToast(result.error || 'Could not copy the prompt.', true);
      else showToast('Prompt copied.');
    }).catch(() => showToast('Could not copy the prompt.', true));
  }
});
function instructionForgeSettingsViewModel() {
  const models = labModels().map((model) => ({ id: String(model.id), label: String(modelLabel(model)) }));
  const defaultModel = models.some((model) => model.id === forgeSettings.defaultModel) ? forgeSettings.defaultModel : (models[0]?.id || '');
  return { models, defaultModel, clearOutput: forgeSettings.clearOutput !== false, autoCopyOutput: Boolean(forgeSettings.autoCopyOutput), keepInput: forgeSettings.keepInput !== false };
}
function publishInstructionForgeSettings() {
  window.dispatchEvent(new CustomEvent('madstation:instruction-forge-settings-state', { detail: instructionForgeSettingsViewModel() }));
}
function openInstructionSettings() {
  if (forgeSettingsReactMounted) publishInstructionForgeSettings();
  else {
    const models = labModels(); const select = $('forgeDefaultModel');
    if (select) {
      const options = models.map((model) => { const option = document.createElement('option'); option.value = String(model.id); option.textContent = String(modelLabel(model)); return option; });
      if (!options.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No models available'; options.push(option); }
      select.replaceChildren(...options);
      select.value = models.some((model) => model.id === forgeSettings.defaultModel) ? forgeSettings.defaultModel : (models[0]?.id || '');
    }
    if ($('forgeClearOutput')) $('forgeClearOutput').checked = forgeSettings.clearOutput;
    if ($('forgeAutoCopyOutput')) $('forgeAutoCopyOutput').checked = forgeSettings.autoCopyOutput;
    if ($('forgeKeepInput')) $('forgeKeepInput').checked = forgeSettings.keepInput;
  }
  $('instructionSettingsModal')?.classList.remove('hidden');
  syncOverlayMode();
}
function closeInstructionSettings() { $('instructionSettingsModal')?.classList.add('hidden'); syncOverlayMode(); }
function saveInstructionSettings(draft = null) {
  const requestedModel = typeof draft?.defaultModel === 'string' ? draft.defaultModel : ($('forgeDefaultModel')?.value || '');
  const models = labModels();
  const defaultModel = models.some((model) => model.id === requestedModel) ? requestedModel : '';
  forgeSettings = {
    defaultModel,
    clearOutput: typeof draft?.clearOutput === 'boolean' ? draft.clearOutput : Boolean($('forgeClearOutput')?.checked),
    autoCopyOutput: typeof draft?.autoCopyOutput === 'boolean' ? draft.autoCopyOutput : Boolean($('forgeAutoCopyOutput')?.checked),
    keepInput: typeof draft?.keepInput === 'boolean' ? draft.keepInput : Boolean($('forgeKeepInput')?.checked),
  };
  saveForgeSettings();
  if (forgeSettings.defaultModel) setForgeComposerModelId(forgeSettings.defaultModel);
  if (forgeSettingsReactMounted) publishInstructionForgeSettings();
  closeInstructionSettings(); showToast('Prompt Studio settings saved.');
}
function handleInstructionForgeSettingsAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'close') { closeInstructionSettings(); return; }
  if (action.type !== 'save') return;
  if (typeof action.defaultModel !== 'string' || action.defaultModel.length > 256) return;
  if (typeof action.clearOutput !== 'boolean' || typeof action.autoCopyOutput !== 'boolean' || typeof action.keepInput !== 'boolean') return;
  if (action.defaultModel && !labModels().some((model) => model.id === action.defaultModel)) return;
  saveInstructionSettings({ defaultModel: action.defaultModel, clearOutput: action.clearOutput, autoCopyOutput: action.autoCopyOutput, keepInput: action.keepInput });
}
const AI_LAB_ALLOWED_TABS = new Set(['model-arena', 'arena-accounts', 'scoreboard']);
const AI_LAB_ALLOWED_ARENAS = new Set(['free-account', 'api', 'local']);
let aiLabSettingsReactMounted = false;
function aiLabSettingsViewModel() {
  const cfg = { ...AI_LAB_DEFAULTS.settings, ...(aiLabData.settings || {}) };
  return {
    defaultTab: AI_LAB_ALLOWED_TABS.has(cfg.defaultTab) ? cfg.defaultTab : 'model-arena',
    defaultArena: AI_LAB_ALLOWED_ARENAS.has(cfg.defaultArena) ? cfg.defaultArena : 'free-account',
    autoScanLocal: cfg.autoScanLocal !== false,
    rememberArenaAccounts: cfg.rememberArenaAccounts !== false,
  };
}
function publishAiLabSettings() {
  window.dispatchEvent(new CustomEvent('madstation:ai-playground-settings-state', { detail: aiLabSettingsViewModel() }));
}
function openAiLabSettings() {
  if (aiLabSettingsReactMounted) publishAiLabSettings();
  else {
    const cfg = aiLabSettingsViewModel();
    if ($('aiLabDefaultTab')) $('aiLabDefaultTab').value = cfg.defaultTab;
    if ($('aiLabDefaultArena')) $('aiLabDefaultArena').value = cfg.defaultArena;
    if ($('aiLabAutoScanLocal')) $('aiLabAutoScanLocal').checked = cfg.autoScanLocal;
    if ($('aiLabRememberArenaAccounts')) $('aiLabRememberArenaAccounts').checked = cfg.rememberArenaAccounts;
  }
  $('aiLabSettingsModal')?.classList.remove('hidden'); syncOverlayMode();
}
function closeAiLabSettings() { $('aiLabSettingsModal')?.classList.add('hidden'); syncOverlayMode(); }
async function saveAiLabSettings(draft = null) {
  const current = aiLabSettingsViewModel();
  const requestedTab = typeof draft?.defaultTab === 'string' ? draft.defaultTab : ($('aiLabDefaultTab')?.value || current.defaultTab);
  const requestedArena = typeof draft?.defaultArena === 'string' ? draft.defaultArena : ($('aiLabDefaultArena')?.value || current.defaultArena);
  aiLabData.settings = {
    defaultTab: AI_LAB_ALLOWED_TABS.has(requestedTab) ? requestedTab : current.defaultTab,
    defaultArena: AI_LAB_ALLOWED_ARENAS.has(requestedArena) ? requestedArena : current.defaultArena,
    autoScanLocal: typeof draft?.autoScanLocal === 'boolean' ? draft.autoScanLocal : Boolean($('aiLabAutoScanLocal')?.checked),
    rememberArenaAccounts: typeof draft?.rememberArenaAccounts === 'boolean' ? draft.rememberArenaAccounts : Boolean($('aiLabRememberArenaAccounts')?.checked),
  };
  const ok = await saveLab();
  if (ok) { closeAiLabSettings(); showToast('AI Playground settings saved.'); }
}
function handleAiLabSettingsAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'close') { closeAiLabSettings(); return; }
  if (action.type !== 'save') return;
  if (typeof action.defaultTab !== 'string' || typeof action.defaultArena !== 'string'
    || typeof action.autoScanLocal !== 'boolean' || typeof action.rememberArenaAccounts !== 'boolean') return;
  if (!AI_LAB_ALLOWED_TABS.has(action.defaultTab) || !AI_LAB_ALLOWED_ARENAS.has(action.defaultArena)) return;
  void saveAiLabSettings({ defaultTab: action.defaultTab, defaultArena: action.defaultArena, autoScanLocal: action.autoScanLocal, rememberArenaAccounts: action.rememberArenaAccounts });
}
function labModels() { return [...(aiLabData.models || []), ...(aiLabData.aiHubModels || [])].map((m) => { const copy = { ...m }; delete copy.apiKey; return copy; }); }
function accountModel(account) { return { id:`aihub:${account.id}`, accountId:account.id, name:`${account.name} · ${account.providerName || 'AI Hub'}`, provider:'ai-hub-account', model:account.providerName || account.name, endpoint:account.url, session:true }; }
function selectedModel(id) { return labModels().find(m => m.id === id) || null; }
async function saveLab() {
  const result = await window.aiHub.saveAiLabData(aiLabData);
  if (!result?.ok) { showToast(result?.error || 'Could not save AI Playground data.', true); return false; }
  if (result.data) aiLabData = result.data;
  return true;
}
function modelLabel(m) { return m?.name || m?.label || m?.model || 'Model'; }
function apiModels() { return (aiLabData.models || []).filter((m) => m?.provider !== 'ai-hub-account'); }
let apiModelSettingsReactMounted = false;
let apiModelEditorSelectedId = '';
let apiModelSettingsActionBusy = false;
function apiModelSettingsViewModel() {
  const models = apiModels().map((model) => ({
    id: String(model.id),
    name: String(modelLabel(model)),
    provider: String(model.provider || ''),
    endpoint: String(model.endpoint || ''),
    model: String(model.model || ''),
    apiKeyRequired: model.apiKeyRequired !== false,
    apiKeyConfigured: Boolean(model.apiKeyConfigured),
    apiKeyNeedsRebind: Boolean(model.apiKeyNeedsRebind),
  }));
  if (!models.some((model) => model.id === apiModelEditorSelectedId)) apiModelEditorSelectedId = models[0]?.id || '';
  return { models, selectedId: apiModelEditorSelectedId };
}
function publishApiModelSettings() {
  window.dispatchEvent(new CustomEvent('madstation:api-model-settings-state', { detail: apiModelSettingsViewModel() }));
}
function publishApiModelSettingsBusy(busy) {
  window.dispatchEvent(new CustomEvent('madstation:api-model-settings-busy', { detail: { busy: Boolean(busy) } }));
}
function renderApiModelEditor() {
  if (apiModelSettingsReactMounted) { publishApiModelSettings(); return; }
  const select = $('apiModelEditor');
  if (!select) return;
  const models = apiModels();
  const current = apiModelEditorSelectedId || select.value;
  select.textContent = '';
  if (!models.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No API models';
    select.appendChild(option);
  } else {
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = String(model.id);
      option.textContent = String(modelLabel(model));
      select.appendChild(option);
    });
  }
  if (models.some((model) => model.id === current)) select.value = current;
  else if (models[0]) select.value = models[0].id;
  apiModelEditorSelectedId = select.value || '';
  loadApiModelEditor();
}
function loadApiModelEditor() {
  if (apiModelSettingsReactMounted) return;
  const id = $('apiModelEditor')?.value || '';
  apiModelEditorSelectedId = id;
  const model = apiModels().find((m) => m.id === id);
  if (!model) {
    if ($('apiModelProvider')) $('apiModelProvider').value = '';
    if ($('apiModelName')) $('apiModelName').value = '';
    if ($('apiModelEndpoint')) $('apiModelEndpoint').value = '';
    if ($('apiModelModel')) $('apiModelModel').value = '';
    if ($('apiModelKey')) $('apiModelKey').value = '';
    if ($('apiModelKeyStatus')) $('apiModelKeyStatus').textContent = 'No API models configured.';
    return;
  }
  $('apiModelName').value = model.name || '';
  $('apiModelEndpoint').value = model.endpoint || '';
  $('apiModelModel').value = model.model || '';
  $('apiModelProvider').value = model.provider || '';
  $('apiModelKey').value = '';
  $('apiModelKeyStatus').textContent = model.apiKeyConfigured
    ? 'Key stored securely on this device.'
    : (model.apiKeyNeedsRebind
      ? 'Re-enter the API key to bind it to this endpoint.'
      : (model.apiKeyRequired ? 'API key required.' : 'No key required.'));
}
async function saveApiModelEditor(draft = null) {
  const id = typeof draft?.id === 'string' ? draft.id : ($('apiModelEditor')?.value || apiModelEditorSelectedId);
  const model = apiModels().find((item) => item.id === id);
  if (!model) return;
  const name = String(draft ? draft.name : ($('apiModelName')?.value || '')).trim();
  const endpoint = String(draft ? draft.endpoint : ($('apiModelEndpoint')?.value || '')).trim();
  const modelName = String(draft ? draft.model : ($('apiModelModel')?.value || '')).trim();
  const key = String(draft ? draft.apiKey : ($('apiModelKey')?.value || '')).trim();
  if (!name || !endpoint || !modelName) return showToast('Model name, endpoint, and model are required.', true);
  if (name.length > 120 || endpoint.length > 2048 || modelName.length > 240 || key.length > 8192) return showToast('One or more API model fields exceed the allowed length.', true);
  if (!/^https?:\/\//i.test(endpoint)) return showToast('Endpoint must use http(s).', true);
  apiModelEditorSelectedId = id;
  model.name = name; model.endpoint = endpoint; model.model = modelName;
  delete model.apiKey;
  const saved = await window.aiHub.saveAiLabData(aiLabData);
  if (!saved?.ok) return showToast(saved?.error || 'Could not save the API model.', true);
  aiLabData = saved.data;
  if (key) {
    const result = await window.aiHub.setAiLabApiKey({ modelId: id, apiKey: key });
    if (!result?.ok) {
      renderApiModelEditor(); populateModelSelects();
      return showToast(result?.error || 'Could not securely store the API key.', true);
    }
    const savedModel = aiLabData.models.find((m) => m.id === id);
    if (savedModel) savedModel.apiKeyConfigured = true;
    if ($('apiModelKey')) $('apiModelKey').value = '';
  }
  renderApiModelEditor(); populateModelSelects(); showToast('API model saved.');
}
async function clearApiModelKey(requestedId = '') {
  const id = typeof requestedId === 'string' && requestedId ? requestedId : ($('apiModelEditor')?.value || apiModelEditorSelectedId);
  if (!id || !apiModels().some((model) => model.id === id)) return;
  apiModelEditorSelectedId = id;
  const result = await window.aiHub.clearAiLabApiKey(id);
  if (!result?.ok) return showToast(result?.error || 'Could not clear the API key.', true);
  const model = aiLabData.models.find((m) => m.id === id); if (model) model.apiKeyConfigured = false;
  if ($('apiModelKey')) $('apiModelKey').value = '';
  loadApiModelEditor(); renderApiModelEditor(); showToast('Stored API key cleared.');
}
async function handleApiModelSettingsAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'select-model') {
    if (typeof action.id !== 'string' || action.id.length > 256 || !apiModels().some((model) => model.id === action.id)) return;
    apiModelEditorSelectedId = action.id;
    publishApiModelSettings();
    return;
  }
  if (apiModelSettingsActionBusy) return;
  if (action.type === 'save-model') {
    if (typeof action.id !== 'string' || action.id.length > 256 || !apiModels().some((model) => model.id === action.id)) return;
    for (const field of ['name', 'endpoint', 'model', 'apiKey']) if (typeof action[field] !== 'string') return;
    if (action.name.length > 120 || action.endpoint.length > 2048 || action.model.length > 240 || action.apiKey.length > 8192) return;
    apiModelEditorSelectedId = action.id;
    apiModelSettingsActionBusy = true; publishApiModelSettingsBusy(true);
    try { await saveApiModelEditor({ id: action.id, name: action.name, endpoint: action.endpoint, model: action.model, apiKey: action.apiKey }); }
    finally { apiModelSettingsActionBusy = false; publishApiModelSettingsBusy(false); publishApiModelSettings(); }
    return;
  }
  if (action.type === 'clear-key') {
    if (typeof action.id !== 'string' || action.id.length > 256 || !apiModels().some((model) => model.id === action.id)) return;
    apiModelSettingsActionBusy = true; publishApiModelSettingsBusy(true);
    try { await clearApiModelKey(action.id); }
    finally { apiModelSettingsActionBusy = false; publishApiModelSettingsBusy(false); publishApiModelSettings(); }
  }
}
function toggleApiModelSettings() {
  const card = $('apiModelSettingsCard');
  const button = $('apiModelSettingsCollapseBtn');
  const content = $('apiModelSettingsContent');
  if (!card || !button || !content) return;
  const collapsed = !card.classList.contains('is-collapsed');
  card.classList.toggle('is-collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  button.title = collapsed ? 'Expand API model settings' : 'Collapse API model settings';
  button.setAttribute('aria-label', collapsed ? 'Expand API model settings' : 'Collapse API model settings');
  const icon = button.querySelector('span');
  if (icon) icon.textContent = collapsed ? '⌄' : '⌃';
  content.hidden = collapsed;
}
function apiArenaEnsureSelection() {
  const models = apiModels();
  const has = (id) => models.some((model) => model.id === id);
  if (!has(apiArenaUi.selected.left)) apiArenaUi.selected.left = models[0]?.id || '';
  if (!has(apiArenaUi.selected.right) || apiArenaUi.selected.right === apiArenaUi.selected.left) {
    apiArenaUi.selected.right = models.find((model) => model.id !== apiArenaUi.selected.left)?.id || '';
  }
}
function apiArenaViewModel() {
  apiArenaEnsureSelection();
  const models = apiModels().map((model) => ({
    id: String(model.id),
    name: String(modelLabel(model)),
    provider: String(model.provider || ''),
    model: String(model.model || ''),
    apiKeyRequired: model.apiKeyRequired !== false,
    apiKeyConfigured: Boolean(model.apiKeyConfigured),
  }));
  const history = (Array.isArray(aiLabData.apiArenaVotes) ? aiLabData.apiArenaVotes : []).slice(-8).reverse().map((vote) => ({
    at: typeof vote.at === 'string' ? vote.at : '',
    prompt: String(vote.prompt || '').slice(0, 240),
    choice: ['left', 'right', 'tie', 'none'].includes(vote.choice) ? vote.choice : '',
    leftName: String(vote.left?.name || vote.left?.id || 'Left model'),
    rightName: String(vote.right?.name || vote.right?.id || 'Right model'),
  }));
  return {
    models,
    selected: { ...apiArenaUi.selected },
    prompt: apiArenaUi.prompt,
    running: apiArenaUi.running,
    status: apiArenaUi.status,
    statusError: Boolean(apiArenaUi.statusError),
    results: {
      left: apiArenaUi.results.left ? { ...apiArenaUi.results.left } : null,
      right: apiArenaUi.results.right ? { ...apiArenaUi.results.right } : null,
    },
    battle: apiArenaBattle ? {
      id: apiArenaBattle.id,
      left: { id: apiArenaBattle.left?.id || '', name: apiArenaBattle.left?.name || '' },
      right: { id: apiArenaBattle.right?.id || '', name: apiArenaBattle.right?.name || '' },
      choice: ['left', 'right', 'tie', 'none'].includes(apiArenaBattle.choice) ? apiArenaBattle.choice : '',
    } : null,
    history,
  };
}
function publishApiArenaViewModel() {
  window.dispatchEvent(new CustomEvent('madstation:api-arena-state', { detail: apiArenaViewModel() }));
}
function populateModelSelects() {
  const models = labModels();
  const accounts = models.filter(m => m?.provider === 'ai-hub-account');
  const api = models.filter(m => m?.provider !== 'ai-hub-account');
  const select = $('forgeModel');
  const previous = forgeComposerSelectedModelId || select?.value || '';
  if (select) {
    const makeOption = (model) => { const option = document.createElement('option'); option.value = String(model.id); option.textContent = String(modelLabel(model)); return option; };
    const groups = [];
    if (accounts.length) { const group = document.createElement('optgroup'); group.label = 'Accounts · Arena browser sessions'; accounts.forEach((model) => group.append(makeOption(model))); groups.push(group); }
    if (api.length) { const group = document.createElement('optgroup'); group.label = 'API / local models'; api.forEach((model) => group.append(makeOption(model))); groups.push(group); }
    if (!groups.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No models available'; groups.push(option); }
    select.replaceChildren(...groups);
    const preferred = [previous, forgeSettings.defaultModel, models[0]?.id || ''].find((id) => models.some((model) => model.id === id)) || '';
    forgeComposerSelectedModelId = preferred;
    select.value = preferred;
  } else if (!models.some((model) => model.id === forgeComposerSelectedModelId)) {
    forgeComposerSelectedModelId = models.some((model) => model.id === forgeSettings.defaultModel) ? forgeSettings.defaultModel : (models[0]?.id || '');
  }
  publishInstructionForgeComposer();
  apiArenaEnsureSelection();
  renderApiModelEditor();
  publishApiArenaViewModel();
}
function apiArenaSelection() {
  return { left: apiModels().find((model) => model.id === apiArenaUi.selected.left) || null, right: apiModels().find((model) => model.id === apiArenaUi.selected.right) || null };
}
function apiArenaSetStatus(status, isError = false) {
  apiArenaUi.status = String(status || '').slice(0, 300);
  apiArenaUi.statusError = Boolean(isError);
  publishApiArenaViewModel();
}
function apiArenaSelectModel(side, modelId) {
  if (!['left', 'right'].includes(side) || typeof modelId !== 'string') return;
  const model = apiModels().find((candidate) => candidate.id === modelId);
  if (!model && modelId !== '') return;
  if (apiArenaUi.selected[side] === modelId) return;
  apiArenaUi.selected[side] = modelId;
  apiArenaUi.results = { left: null, right: null };
  apiArenaBattle = null;
  apiArenaUi.status = 'Model selection changed. Run a new comparison before voting.';
  apiArenaUi.statusError = false;
  publishApiArenaViewModel();
}
async function voteApiArena(choice) {
  if (!['left', 'right', 'tie', 'none'].includes(choice)) return;
  const { left, right } = apiArenaSelection();
  if (!left || !right || left.provider === 'ai-hub-account' || right.provider === 'ai-hub-account') return showToast('Discover and choose two API models first.', true);
  if (left.id === right.id) return showToast('Choose two different API models.', true);
  if (!apiArenaBattle || apiArenaBattle.left?.id !== left.id || apiArenaBattle.right?.id !== right.id || !apiArenaUi.results.left || !apiArenaUi.results.right) return showToast('Run an API battle with both models first.', true);
  const votes = Array.isArray(aiLabData.apiArenaVotes) ? aiLabData.apiArenaVotes : [];
  votes.push({ at: new Date().toISOString(), prompt: String(apiArenaUi.prompt || apiArenaBattle.prompt || '').trim().slice(0, 1000), choice, left: { id: left.id, name: modelLabel(left) }, right: { id: right.id, name: modelLabel(right) } });
  aiLabData.apiArenaVotes = votes;
  apiArenaBattle.choice = choice;
  const saved = await saveLab();
  if (!saved) {
    apiArenaBattle.choice = '';
    return;
  }
  apiArenaUi.status = ({ left: `Saved: you preferred ${modelLabel(left)}.`, right: `Saved: you preferred ${modelLabel(right)}.`, tie: 'Saved: tie.', none: 'Saved: neither.' })[choice];
  apiArenaUi.statusError = false;
  publishApiArenaViewModel();
  showToast(apiArenaUi.status);
}
let localArenaRunning = false, forgeRunning = false;
async function runApiArena(action = {}) {
  if (apiArenaUi.running) return;
  const leftId = typeof action.leftId === 'string' ? action.leftId : apiArenaUi.selected.left;
  const rightId = typeof action.rightId === 'string' ? action.rightId : apiArenaUi.selected.right;
  const prompt = typeof action.prompt === 'string' ? action.prompt.trim() : '';
  const models = apiModels();
  const left = models.find((model) => model.id === leftId);
  const right = models.find((model) => model.id === rightId);
  if (!left || !right || !prompt) {
    apiArenaSetStatus('Choose two API models and enter an instruction.', true);
    return;
  }
  if (left.id === right.id) {
    apiArenaSetStatus('Choose two different API models.', true);
    return;
  }
  if (prompt.length > 20000) {
    apiArenaSetStatus('Instruction is too long. Keep it under 20,000 characters.', true);
    return;
  }
  const runGeneration = ++apiArenaRunGeneration;
  apiArenaUi.selected = { left: left.id, right: right.id };
  apiArenaUi.prompt = prompt;
  apiArenaUi.running = true;
  apiArenaUi.status = 'Running both API requests…';
  apiArenaUi.statusError = false;
  apiArenaBattle = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, prompt, left: { id: left.id, name: modelLabel(left) }, right: { id: right.id, name: modelLabel(right) }, choice: null };
  apiArenaUi.results = {
    left: { ok: false, text: 'Waiting for response…', elapsedMs: null, pending: true },
    right: { ok: false, text: 'Waiting for response…', elapsedMs: null, pending: true },
  };
  publishApiArenaViewModel();
  const request = async (model, side) => {
    try {
      const result = await labRequest(model, prompt, side);
      const elapsedMs = Number.isFinite(Number(result?.elapsedMs)) ? Math.max(0, Number(result.elapsedMs)) : null;
      if (!result?.ok) return { ok: false, text: 'Request failed. Check the model endpoint, stored API key, and connection.', elapsedMs, pending: false };
      return { ok: true, text: String(result.text ?? 'The model returned an empty response.'), elapsedMs, pending: false };
    } catch {
      return { ok: false, text: 'Request failed. Check the model endpoint, stored API key, and connection.', elapsedMs: null, pending: false };
    }
  };
  const [leftResult, rightResult] = await Promise.all([request(left, 'api-left'), request(right, 'api-right')]);
  if (runGeneration !== apiArenaRunGeneration) return;
  apiArenaUi.running = false;
  apiArenaUi.results = { left: leftResult, right: rightResult };
  apiArenaUi.status = leftResult.ok && rightResult.ok ? 'Both API responses are ready.' : leftResult.ok || rightResult.ok ? 'One response is ready; the other request failed.' : 'Both API requests failed. Check model settings and connection.';
  apiArenaUi.statusError = !leftResult.ok || !rightResult.ok;
  publishApiArenaViewModel();
}
function cancelApiArenaRun() {
  if (!apiArenaUi.running) return;
  apiArenaRunGeneration += 1;
  apiArenaUi.running = false;
  apiArenaUi.results = {
    left: { ok: false, text: 'Stopped waiting. This request may still finish in the background.', elapsedMs: null, pending: false },
    right: { ok: false, text: 'Stopped waiting. This request may still finish in the background.', elapsedMs: null, pending: false },
  };
  apiArenaBattle = null;
  apiArenaUi.status = 'Stopped waiting. Already-sent requests may still finish in the background.';
  apiArenaUi.statusError = false;
  publishApiArenaViewModel();
}
function swapApiArenaSides() {
  if (apiArenaUi.running) return;
  apiArenaUi.selected = { left: apiArenaUi.selected.right, right: apiArenaUi.selected.left };
  apiArenaUi.results = { left: apiArenaUi.results.right, right: apiArenaUi.results.left };
  if (apiArenaBattle) {
    const oldChoice = apiArenaBattle.choice;
    apiArenaBattle = { ...apiArenaBattle, left: apiArenaBattle.right, right: apiArenaBattle.left, choice: oldChoice === 'left' ? 'right' : oldChoice === 'right' ? 'left' : oldChoice };
  }
  apiArenaUi.status = apiArenaUi.results.left || apiArenaUi.results.right ? 'Sides swapped.' : apiArenaUi.status;
  publishApiArenaViewModel();
}
async function handleApiArenaAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || Array.isArray(action)) return;
  if (action.type === 'select-model') return apiArenaSelectModel(action.side, action.modelId);
  if (action.type === 'run') return runApiArena(action);
  if (action.type === 'swap') return swapApiArenaSides();
  if (action.type === 'cancel') return cancelApiArenaRun();
  if (action.type === 'vote') return voteApiArena(action.choice);
}
// ---------------------------------------------------------------------------
// Model Arena: its own accounts (separate from AI Hub), two live browsers that
// receive the same question, a vote, and a leaderboard.
// ---------------------------------------------------------------------------
let arena = { providers: [], accounts: [], selected: { left: null, right: null } };
let arenaProviderFilter = 'all';
let arenaSetupReactMounted = false;
let arenaAddAccountProviderId = '';
let arenaSetupAccountResetVersion = 0;
let arenaSetupProviderResetVersion = 0;
let arenaRenamingId = '';
let arenaBattle = null; // { id, prompt, left, right, choice }
let arenaSending = false;

const arenaAccountById = (id) => arena.accounts.find((a) => a.id === id) || null;
const arenaProviderById = (id) => arena.providers.find((p) => p.id === id) || null;
function arenaSnapshot(a) { return a ? { accountId: a.id, accountName: a.name, providerId: a.providerId, providerName: a.providerName } : null; }
function arenaAccountLabel(a) {
  const hasProvider = a.name.toLowerCase().includes(String(a.providerName || '').toLowerCase());
  return hasProvider ? a.name : `${a.name} — ${a.providerName}`;
}
let arenaUiStatus = '';
let arenaUiStatusError = false;
function freeArenaViewModel() {
  const accounts = arena.accounts.map((account) => {
    const candidates = [account.icon, ...(Array.isArray(account.iconCandidates) ? account.iconCandidates : [])];
    const iconSrc = candidates.find(isImageIcon) || DEFAULT_ICON_DATA_URL;
    return { id: String(account.id), name: String(account.name || 'Account'), providerId: String(account.providerId || ''), providerName: String(account.providerName || 'Provider'), iconSrc };
  });
  const votes = Array.isArray(aiLabData.arenaVotes) ? aiLabData.arenaVotes : [];
  return {
    providers: arena.providers.map((provider) => ({ id: String(provider.id), name: String(provider.name || 'Provider') })),
    accounts,
    selected: { left: String(arena.selected.left || ''), right: String(arena.selected.right || '') },
    status: arenaUiStatus,
    statusError: arenaUiStatusError,
    running: Boolean(arenaSending),
    battle: arenaBattle ? {
      id: String(arenaBattle.id || ''),
      leftId: String(arenaBattle.left?.accountId || ''),
      rightId: String(arenaBattle.right?.accountId || ''),
      choice: ['left', 'right', 'tie', 'none'].includes(arenaBattle.choice) ? arenaBattle.choice : '',
    } : null,
    history: votes.slice(-8).reverse().map((vote) => ({
      at: String(vote.at || ''), prompt: String(vote.prompt || '').slice(0, 1000),
      choice: String(vote.choice || ''), leftName: String(vote.left?.accountName || 'Left account'),
      rightName: String(vote.right?.accountName || 'Right account'),
    })),
  };
}
function publishFreeArenaViewModel() {
  window.dispatchEvent(new CustomEvent('madstation:free-arena-state', { detail: freeArenaViewModel() }));
}
function arenaSetStatus(text, isError = false) {
  arenaUiStatus = String(text || '').slice(0, 500);
  arenaUiStatusError = Boolean(isError);
  publishFreeArenaViewModel();
}
function applyArenaState(result) {
  if (!result || result.ok === false) return false;
  arena = {
    providers: Array.isArray(result.providers) ? result.providers : [],
    accounts: Array.isArray(result.accounts) ? result.accounts : [],
    selected: { left: result.selected?.left || null, right: result.selected?.right || null },
  };
  if (arenaProviderFilter !== 'all' && !arenaProviderById(arenaProviderFilter)) arenaProviderFilter = 'all';
  publishFreeArenaViewModel();
  renderArenaAccounts();
  renderScoreboard();
  return true;
}
async function loadArenaState() {
  const result = await window.aiHub.arenaGetState();
  if (!applyArenaState(result)) showToast(result?.error || 'Could not load the Arena accounts.', true);
}
async function syncArenaBrowsers() {
  const left = arena.selected.left || null, right = arena.selected.right || null;
  if (left && right && left === right) { arenaSetStatus('Choose two different accounts.', true); return false; }
  publishFreeArenaViewModel();
  const result = await window.aiHub.arenaSetBrowsers({ left, right });
  if (result?.ok === false) { arenaSetStatus(result.error || 'Could not open the Arena browsers.', true); return false; }
  if (aiLabData.settings?.rememberArenaAccounts !== false) {
    aiLabData.settings = { ...(aiLabData.settings || {}), arenaAccounts: { left, right } };
    saveLab().catch(() => {});
  }
  lastArenaLayoutKey = '';
  requestAnimationFrame(updateArenaBrowserLayout);
  return true;
}
async function onArenaPickerChange(side, accountId) {
  if (!['left', 'right'].includes(side)) return;
  const previous = { ...arena.selected };
  const next = { ...previous, [side]: accountId || null };
  const other = side === 'left' ? 'right' : 'left';
  if (next[other] && next[other] === next[side]) next[other] = previous[side] && previous[side] !== next[side] ? previous[side] : null;
  arena.selected = next;
  publishFreeArenaViewModel();
  if (!(await syncArenaBrowsers())) { arena.selected = previous; publishFreeArenaViewModel(); }
  renderArenaAccounts();
}
function arenaCompareVisible() {
  return currentApp === 'ai-lab' && !$('aiLabScreen').classList.contains('hidden')
    && Boolean(document.querySelector('[data-arena-panel="free-account"].active'));
}
let arenaLayoutFrame = 0;
let lastArenaLayoutKey = '';
function updateArenaBrowserLayout() {
  const visible = arenaCompareVisible();
  // Scroll/resize listeners are window-wide, so this runs during scrolling anywhere in the app.
  // When the Arena is not showing and the native views were already told so, skip the layout read.
  if (!visible && lastArenaLayoutKey === '{"left":null,"right":null}') return;
  const clip = $('aiLabScreen').getBoundingClientRect();
  // The Arena browsers are native views floating above this page, so their
  // rectangles are cut to the visible part of the AI Playground screen. Scrolling can
  // never push a browser over the header or tabs.
  const rect = (id) => {
    const el = $(id); if (!visible || !el) return null;
    const r = el.getBoundingClientRect();
    const x1 = Math.max(r.left, clip.left), y1 = Math.max(r.top, clip.top), x2 = Math.min(r.right, clip.right), y2 = Math.min(r.bottom, clip.bottom);
    return x2 - x1 < 8 || y2 - y1 < 8 ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  };
  const layout = { left: rect('arenaLeftBrowserSlot'), right: rect('arenaRightBrowserSlot') };
  // Scroll/resize fire this every frame; only talk to the main process when a rectangle really changed.
  const key = JSON.stringify(layout, (_k, v) => (typeof v === 'number' ? Math.round(v) : v));
  if (key === lastArenaLayoutKey) return;
  lastArenaLayoutKey = key;
  window.aiHub.arenaSetLayout(layout).catch(() => { lastArenaLayoutKey = ''; });
}
function scheduleArenaBrowserLayout() {
  if (arenaLayoutFrame) return;
  arenaLayoutFrame = requestAnimationFrame(() => { arenaLayoutFrame = 0; updateArenaBrowserLayout(); });
}

async function askBothArena(promptValue) {
  if (arenaSending) return;
  const prompt = String(promptValue || '').trim().slice(0, 20000);
  const left = arenaAccountById(arena.selected.left), right = arenaAccountById(arena.selected.right);
  if (!prompt) return arenaSetStatus('Type a question first.', true);
  if (!left || !right) return arenaSetStatus('Choose an account for both browsers.', true);
  if (left.id === right.id) return arenaSetStatus('Choose two different accounts.', true);
  arenaSending = true;
  arenaSetStatus('Typing the question into both browsers…');
  try {
    if (!(await syncArenaBrowsers())) { arenaSetStatus('The browsers could not be prepared.', true); return; }
    updateArenaBrowserLayout();
    const result = await window.aiHub.arenaSendPrompt({ prompt });
    arenaBattle = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, prompt, left: arenaSnapshot(left), right: arenaSnapshot(right), choice: null };
    if (result?.ok) arenaSetStatus('Sent to both browsers. Read the answers, then pick the one you prefer.');
    else {
      const problems = ['left', 'right'].filter((side) => !result?.[side]?.ok).map((side) => `${side === 'left' ? 'Left' : 'Right'}: ${result?.[side]?.error || result?.error || 'not sent'}`);
      arenaSetStatus(problems.join('  ·  ') || result?.error || 'The question could not be sent.', true);
    }
  } catch (error) {
    arenaSetStatus(error?.message || 'The question could not be sent.', true);
  } finally {
    arenaSending = false;
    publishFreeArenaViewModel();
  }
}
async function voteArena(choice) {
  if (!['left', 'right', 'tie', 'none'].includes(choice)) return;
  const left = arenaAccountById(arena.selected.left), right = arenaAccountById(arena.selected.right);
  if (!left || !right) return arenaSetStatus('Choose two accounts first.', true);
  if (left.id === right.id) return arenaSetStatus('Choose two different accounts.', true);
  if (!arenaBattle || arenaBattle.left?.accountId !== left.id || arenaBattle.right?.accountId !== right.id) return arenaSetStatus('Run a battle with both accounts first.', true);
  aiLabData.arenaVotes = (aiLabData.arenaVotes || []).filter((vote) => vote.battleId !== arenaBattle.id);
  aiLabData.arenaVotes.push({ battleId: arenaBattle.id, at: new Date().toISOString(), prompt: arenaBattle.prompt.slice(0, 1000), choice, left: arenaBattle.left, right: arenaBattle.right });
  arenaBattle.choice = choice;
  await saveLab();
  renderScoreboard();
  publishFreeArenaViewModel();
  const text = { left: `Saved: you preferred ${left.name}.`, right: `Saved: you preferred ${right.name}.`, tie: 'Saved: tie.', none: 'Saved: neither.' }[choice];
  showToast(text);
}
function handleFreeArenaAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || Array.isArray(action)) return;
  if (arenaSending && ['select-account', 'run', 'swap', 'vote', 'navigate', 'open-external'].includes(action.type)) return;
  if (action.type === 'select-account' && ['left', 'right'].includes(action.side) && typeof action.accountId === 'string') {
    const id = action.accountId;
    if (id && !arenaAccountById(id)) return;
    void onArenaPickerChange(action.side, id);
    return;
  }
  if (action.type === 'run' && typeof action.prompt === 'string' && action.prompt.length <= 20000) { void askBothArena(action.prompt); return; }
  if (action.type === 'swap') {
    if (arenaSending) return;
    const previous = { ...arena.selected };
    arena.selected = { left: previous.right, right: previous.left };
    publishFreeArenaViewModel();
    void syncArenaBrowsers().then((ok) => { if (!ok) { arena.selected = previous; publishFreeArenaViewModel(); } else renderArenaAccounts(); });
    return;
  }
  if (action.type === 'vote' && ['left', 'right', 'tie', 'none'].includes(action.choice)) { void voteArena(action.choice); return; }
  if (action.type === 'navigate' && ['left', 'right'].includes(action.side) && ['back', 'forward', 'refresh'].includes(action.action)) {
    void window.aiHub.arenaNavigate(action.side, action.action).then((result) => {
      if (!result?.ok && result?.error) arenaSetStatus(result.error, true);
      else arenaSetStatus(`${action.side === 'left' ? 'Browser 1' : 'Browser 2'} ${action.action === 'refresh' ? 'reloaded' : action.action}.`);
    }).catch(() => arenaSetStatus('Browser navigation failed.', true));
    return;
  }
  if (action.type === 'open-external' && ['left', 'right'].includes(action.side)) {
    void window.aiHub.arenaOpenInBrowser(action.side).then((result) => {
      if (!result?.ok) arenaSetStatus(result?.error || 'Could not open this page in your default browser.', true);
      else arenaSetStatus('Opened the page in your default browser.');
    }).catch(() => arenaSetStatus('Could not open this page in your default browser.', true));
  }
}

function computeArenaBoard(votes, side) {
  const rows = new Map();
  const ensure = (info, key) => { if (!rows.has(key)) rows.set(key, { key, label: side === 'model' ? info.providerName : info.accountName, sub: side === 'model' ? '' : info.providerName, wins: 0, losses: 0, ties: 0, battles: 0 }); return rows.get(key); };
  for (const v of votes) {
    if (!['left', 'right', 'tie'].includes(v.choice) || !v.left || !v.right) continue;
    for (const s of ['left', 'right']) {
      const info = v[s]; const row = ensure(info, side === 'model' ? info.providerId : info.accountId);
      row.battles += 1;
      if (v.choice === 'tie') row.ties += 1; else if (v.choice === s) row.wins += 1; else row.losses += 1;
    }
  }
  return [...rows.values()].map((r) => ({ ...r, rate: r.battles ? (r.wins + r.ties * 0.5) / r.battles : 0 }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || b.battles - a.battles || a.label.localeCompare(b.label));
}
let arenaReactAccountsRenderer = null;
let arenaReactScoreboardRenderer = null;

window.MadStationArenaManagement = {
  attachAccountRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    arenaReactAccountsRenderer = renderer;
    renderArenaAccounts();
  },
  attachScoreboardRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    arenaReactScoreboardRenderer = renderer;
    renderScoreboard();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  action(action, id = '', operation = '', value = '') {
    if (action === 'filter-provider') {
      if (id !== 'all' && !arenaProviderById(id)) return;
      arenaProviderFilter = id || 'all';
      renderArenaAccounts();
      return;
    }
    if (action === 'delete-provider') {
      if (arenaProviderById(id)) void arenaDeleteProviderAction(id);
      return;
    }
    if (action === 'account' && typeof id === 'string'
        && ['left', 'right', 'rename', 'save-rename', 'cancel-rename', 'reset', 'delete'].includes(operation)
        && (operation === 'cancel-rename' || arenaAccountById(id))) {
      const nextName = operation === 'save-rename' && typeof value === 'string' ? value.slice(0, 60) : null;
      void arenaAccountAction(operation, id, nextName);
    }
  },
};

function arenaDisplayIconCandidates(item) {
  const candidates = [item?.icon, ...(Array.isArray(item?.iconCandidates) ? item.iconCandidates : [])];
  const images = [...new Set(candidates.filter(isImageIcon))];
  if (!images.includes(DEFAULT_ICON_DATA_URL)) images.push(DEFAULT_ICON_DATA_URL);
  return images;
}

function renderScoreboard() {
  if (!$('leaderboardModels') || typeof arenaReactScoreboardRenderer !== 'function') return;
  const votes = Array.isArray(aiLabData.arenaVotes) ? aiLabData.arenaVotes : [];
  const decided = votes.filter((v) => ['left', 'right', 'tie'].includes(v.choice));
  const toDisplayRows = (rows) => rows.map((row) => ({
    key: String(row.key || row.label || ''),
    label: String(row.label || ''),
    sub: String(row.sub || ''),
    wins: Math.max(0, Number(row.wins) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    ties: Math.max(0, Number(row.ties) || 0),
    battles: Math.max(0, Number(row.battles) || 0),
    ratePercent: Math.max(0, Math.min(100, Math.round((Number(row.rate) || 0) * 100))),
  }));
  const neither = votes.filter((v) => v.choice === 'none').length;
  const summary = votes.length
    ? `${decided.length} scored battle${decided.length === 1 ? '' : 's'}${neither ? ` · ${neither} marked “neither”` : ''}`
    : '';
  arenaReactScoreboardRenderer({
    models: toDisplayRows(computeArenaBoard(votes, 'model')),
    accounts: toDisplayRows(computeArenaBoard(votes, 'account')),
    summary,
  });
}

// ----- Arena Accounts tab ---------------------------------------------------
function arenaSetupViewModel() {
  const preferredProviderId = arenaProviderById(arenaAddAccountProviderId)
    ? String(arenaAddAccountProviderId)
    : (arenaProviderFilter !== 'all' && arenaProviderById(arenaProviderFilter) ? String(arenaProviderFilter) : String(arena.providers[0]?.id || ''));
  return {
    providers: arena.providers.map((provider) => ({ id: String(provider.id), label: String(provider.name || 'Unnamed provider') })),
    selectedProviderId: preferredProviderId,
    accountResetVersion: arenaSetupAccountResetVersion,
    providerResetVersion: arenaSetupProviderResetVersion,
  };
}
function publishArenaSetupForm() {
  window.dispatchEvent(new CustomEvent('madstation:arena-setup-state', { detail: arenaSetupViewModel() }));
}
function renderArenaAccounts() {
  const tiles = $('arenaProviderTiles'), list = $('arenaAccountList');
  if (!tiles || !list) return;
  const providerCount = arena.providers.length;
  const sel = $('arenaNewProvider');
  const preferredProviderId = arenaProviderById(arenaAddAccountProviderId)
    ? String(arenaAddAccountProviderId)
    : (arenaProviderFilter !== 'all' && arenaProviderById(arenaProviderFilter) ? String(arenaProviderFilter) : String(arena.providers[0]?.id || ''));
  if (sel && !arenaSetupReactMounted) {
    const options = arena.providers.map((provider) => {
      const option = document.createElement('option');
      option.value = String(provider.id);
      option.textContent = String(provider.name || 'Unnamed provider');
      return option;
    });
    if (!options.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No providers';
      options.push(option);
    }
    sel.replaceChildren(...options);
    sel.value = preferredProviderId;
  }
  if (preferredProviderId && arenaProviderById(preferredProviderId)) arenaAddAccountProviderId = preferredProviderId;
  else arenaAddAccountProviderId = '';
  $('arenaAccountCount').textContent = `${arena.accounts.length} account${arena.accounts.length === 1 ? '' : 's'} · ${providerCount} provider${providerCount === 1 ? '' : 's'}`;
  if (typeof arenaReactAccountsRenderer !== 'function') { publishArenaSetupForm(); return; }

  const shown = arena.accounts.filter((account) => arenaProviderFilter === 'all' || account.providerId === arenaProviderFilter);
  const selectedProvider = arenaProviderFilter !== 'all' ? arenaProviderById(arenaProviderFilter) : null;
  const model = {
    providers: arena.providers.map((provider) => ({
      id: String(provider.id),
      name: String(provider.name || 'Unnamed provider'),
      iconCandidates: arenaDisplayIconCandidates(provider),
      accountCount: arena.accounts.filter((account) => account.providerId === provider.id).length,
      selected: arenaProviderFilter === provider.id,
    })),
    accounts: shown.map((account) => ({
      id: String(account.id),
      name: String(account.name || 'Unnamed account'),
      providerName: String(account.providerName || arenaProviderById(account.providerId)?.name || 'Provider'),
      iconCandidates: arenaDisplayIconCandidates(account),
      side: arena.selected.left === account.id ? 'Left' : arena.selected.right === account.id ? 'Right' : '',
    })),
    providerFilter: arenaProviderFilter,
    totalAccounts: arena.accounts.length,
    renamingId: arenaRenamingId,
    selectedProvider: selectedProvider ? {
      id: String(selectedProvider.id),
      name: String(selectedProvider.name || 'Unnamed provider'),
      accountCount: shown.length,
    } : null,
  };
  arenaReactAccountsRenderer(model);
  publishArenaSetupForm();
}
async function arenaAccountAction(action, id, nameOverride = null) {
  const account = arenaAccountById(id);
  if (action === 'cancel-rename') { arenaRenamingId = ''; return renderArenaAccounts(); }
  if (action === 'rename') { arenaRenamingId = id; return renderArenaAccounts(); }
  if (!account) return;
  if (action === 'save-rename') {
    const name = typeof nameOverride === 'string' ? nameOverride : (document.querySelector(`[data-rename-input="${CSS.escape(id)}"]`)?.value || '');
    const result = await window.aiHub.arenaRenameAccount(id, name);
    if (!applyArenaState(result)) return showToast(result?.error || 'Could not rename the account.', true);
    arenaRenamingId = ''; return renderArenaAccounts();
  }
  if (action === 'left' || action === 'right') {
    const other = action === 'left' ? 'right' : 'left';
    const next = { ...arena.selected, [action]: id };
    if (next[other] === id) next[other] = arena.selected[action] && arena.selected[action] !== id ? arena.selected[action] : null;
    const result = await window.aiHub.arenaSetBrowsers(next);
    if (result?.ok === false) return showToast(result.error || 'Could not select the account.', true);
    arena.selected = next; publishFreeArenaViewModel(); renderArenaAccounts();
    return showToast(`${account.name} is now the ${action} browser.`);
  }
  if (action === 'reset') {
    if (!window.confirm(`Reset the Arena login for “${account.name}”?\n\nThis signs it out and erases its saved cookies inside the Arena. AI Hub is not affected.`)) return;
    const result = await window.aiHub.arenaResetLogin(id);
    return showToast(result?.ok ? `${account.name} was signed out.` : (result?.error || 'Could not reset this account.'), !result?.ok);
  }
  if (action === 'delete') {
    if (videoHubSettings.confirmDestructive && !window.confirm(`Delete “${account.name}” from the Arena and erase its saved login?\n\nAI Hub is not affected. Past votes stay on the leaderboard.`)) return;
    const result = await window.aiHub.arenaDeleteAccount(id);
    if (!applyArenaState(result)) return showToast(result?.error || 'Could not delete the account.', true);
    showToast(`${account.name} deleted.`);
  }
}
async function arenaDeleteProviderAction(id) {
  const provider = arenaProviderById(id); if (!provider) return;
  const n = arena.accounts.filter((a) => a.providerId === id).length;
  if (!window.confirm(`Remove ${provider.name} from the Arena${n ? ` together with its ${n} account${n === 1 ? '' : 's'} and their saved logins` : ''}?\n\nAI Hub is not affected.`)) return;
  const result = await window.aiHub.arenaDeleteProvider(id);
  if (!applyArenaState(result)) return showToast(result?.error || 'Could not remove the provider.', true);
  arenaProviderFilter = 'all'; renderArenaAccounts(); showToast(`${provider.name} removed.`);
}
async function arenaAddAccountAction(draft = null) {
  const legacyProviderId = $('arenaNewProvider')?.value || '';
  const providerId = typeof draft?.providerId === 'string' ? draft.providerId : (legacyProviderId || arenaAddAccountProviderId);
  const rawName = typeof draft?.name === 'string' ? draft.name : ($('arenaNewName')?.value || '');
  if (!providerId) return showToast('Add a provider first.', true);
  if (providerId.length > 128 || typeof rawName !== 'string' || rawName.length > 60 || !arenaProviderById(providerId)) return showToast('Choose a valid provider and account name.', true);
  const result = await window.aiHub.arenaAddAccount({ providerId, name: rawName });
  if (!applyArenaState(result)) return showToast(result?.error || 'Could not add the account.', true);
  arenaAddAccountProviderId = providerId;
  arenaSetupAccountResetVersion += 1;
  const legacyName = $('arenaNewName');
  if (legacyName) legacyName.value = '';
  renderArenaAccounts();
  showToast(`${result.account.name} added. Select it in the Model Arena and sign in once.`);
}
async function arenaAddProviderAction(draft = null) {
  const rawName = typeof draft?.name === 'string' ? draft.name : ($('arenaNewProviderName')?.value || '');
  const rawUrl = typeof draft?.url === 'string' ? draft.url : ($('arenaNewProviderUrl')?.value || '');
  if (typeof rawName !== 'string' || rawName.length > 60 || typeof rawUrl !== 'string' || rawUrl.length > 300) return showToast('Provider name or website is too long.', true);
  const result = await window.aiHub.arenaAddProvider({ name: rawName, url: rawUrl });
  if (!applyArenaState(result)) return showToast(result?.error || 'Could not add the provider.', true);
  const legacyName = $('arenaNewProviderName'); const legacyUrl = $('arenaNewProviderUrl');
  if (legacyName) legacyName.value = ''; if (legacyUrl) legacyUrl.value = '';
  arenaSetupProviderResetVersion += 1;
  arenaProviderFilter = result.provider.id;
  arenaAddAccountProviderId = result.provider.id;
  renderArenaAccounts();
  showToast(`${result.provider.name} added. Now add an account for it.`);
}
function handleArenaSetupAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string') return;
  if (action.type === 'select-provider') {
    if (typeof action.providerId !== 'string' || action.providerId.length > 128) return;
    if (action.providerId && !arenaProviderById(action.providerId)) return;
    arenaAddAccountProviderId = action.providerId;
    publishArenaSetupForm();
    return;
  }
  if (action.type === 'add-account') {
    if (typeof action.providerId !== 'string' || action.providerId.length > 128 || typeof action.name !== 'string' || action.name.length > 60) return;
    if (!arenaProviderById(action.providerId)) return showToast('Choose a valid provider.', true);
    void arenaAddAccountAction({ providerId: action.providerId, name: action.name });
    return;
  }
  if (action.type === 'add-provider') {
    if (typeof action.name !== 'string' || action.name.length > 60 || typeof action.url !== 'string' || action.url.length > 300) return;
    void arenaAddProviderAction({ name: action.name, url: action.url });
  }
}
function onLabTabChanged(tab) {
  if (currentApp === 'ai-lab') {
    if (tab === 'model-arena' && document.querySelector('[data-arena-panel="free-account"].active')) syncArenaBrowsers().catch(() => {});
    else if (tab === 'model-arena') window.aiHub.arenaSuspendBrowsers().catch(() => {});
    else window.aiHub.arenaSuspendBrowsers().catch(() => {});
  }
  if (tab === 'arena-accounts') renderArenaAccounts();
  if (tab === 'scoreboard') renderScoreboard();
  requestAnimationFrame(updateArenaBrowserLayout);
}
function activateLabTab(tab) {
  document.querySelectorAll('[data-lab-tab]').forEach((b) => b.classList.toggle('active', b.dataset.labTab === tab));
  document.querySelectorAll('[data-lab-panel]').forEach((p) => p.classList.toggle('active', p.dataset.labPanel === tab));
  const arenaTop = $('arenaGlobalTop');
  if (arenaTop) arenaTop.classList.toggle('active', tab === 'model-arena');
  onLabTabChanged(tab);
}
function activateArenaSubtab(tab) {
  document.querySelectorAll('[data-arena-tab]').forEach((b) => b.classList.toggle('active', b.dataset.arenaTab === tab));
  document.querySelectorAll('[data-arena-panel]').forEach((p) => p.classList.toggle('active', p.dataset.arenaPanel === tab));
  if (tab === 'free-account' && currentApp === 'ai-lab') syncArenaBrowsers().catch(() => {});
  if (tab !== 'free-account' && currentApp === 'ai-lab') window.aiHub.arenaSuspendBrowsers().catch(() => {});
  const apiMode = tab === 'api';
  if (apiMode) publishApiArenaViewModel();
  if (tab === 'free-account') publishFreeArenaViewModel();
  if (tab === 'local') { publishLocalArenaViewModel(); if (aiLabData.settings?.autoScanLocal !== false) scanLocal().catch(() => {}); }
  requestAnimationFrame(updateArenaBrowserLayout);
}

async function initAiLab() {
  const [stored, hubModels] = await Promise.all([window.aiHub.getAiLabData(), window.aiHub.getAiHubAiModels()]);
  aiLabData={...AI_LAB_DEFAULTS,...(stored?.data||{})};
  if (stored?.credentialWarning) showToast(stored.credentialWarning, true);
  aiLabData.models = (Array.isArray(aiLabData.models) ? aiLabData.models : []).map((m) => { const copy={...m}; delete copy.apiKey; return copy; });
  aiLabData.models=Array.isArray(aiLabData.models)&&aiLabData.models.length?aiLabData.models:AI_LAB_DEFAULTS.models;
  aiLabData.aiHubModels=Array.isArray(hubModels?.models)?hubModels.models:[];
  aiLabData.votes=Array.isArray(aiLabData.votes)?aiLabData.votes:[];
  aiLabData.arenaVotes=Array.isArray(aiLabData.arenaVotes)?aiLabData.arenaVotes:[];
  aiLabData.apiArenaVotes=Array.isArray(aiLabData.apiArenaVotes)?aiLabData.apiArenaVotes:[];
  aiLabData.localArenaVotes=Array.isArray(aiLabData.localArenaVotes)?aiLabData.localArenaVotes:[];
  publishLocalArenaViewModel();
  aiLabData.transcripts=Array.isArray(aiLabData.transcripts)?aiLabData.transcripts:[];
  aiLabData.settings={...AI_LAB_DEFAULTS.settings,...(aiLabData.settings||{})};
  populateModelSelects();
  activateLabTab(aiLabData.settings.defaultTab || 'model-arena');
  activateArenaSubtab(aiLabData.settings.defaultArena || 'free-account');
  await loadArenaState();
  if (aiLabData.settings?.rememberArenaAccounts !== false && aiLabData.settings?.arenaAccounts) {
    arena.selected = { ...arena.selected, ...aiLabData.settings.arenaAccounts };
    publishFreeArenaViewModel();
  }
  if (currentApp === 'ai-lab') {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (document.querySelector('[data-arena-panel="free-account"].active')) {
      await syncArenaBrowsers();
      updateArenaBrowserLayout();
    } else {
      await window.aiHub.arenaSuspendBrowsers();
    }
    syncMemoryMonitor();
  }
}
async function labRequest(model,prompt,side) {
  if (model?.provider === 'ai-hub-account') return window.aiHub.aiHubAccountRequest({ accountId:model.accountId, prompt, side });
  return window.aiHub.aiLabRequest({...model, modelId: model.id, prompt, apiKeyRequired: model.apiKeyRequired !== false});
}
async function refreshAiHubLabModels() {
  const result = await window.aiHub.getAiHubAiModels();
  aiLabData.aiHubModels = Array.isArray(result?.models) ? result.models : [];
  populateModelSelects();
}
function forgeAccountForId(id) {
  return state.accounts.find((account) => account.id === id) || null;
}
function forgeModelForAccount(accountId) {
  return (aiLabData.aiHubModels || []).find((model) => model.accountId === accountId) || null;
}
let forgeReactAccountsRenderer = null;
let forgeReactStatusRenderer = null;

window.MadStationInstructionForgeAccounts = {
  attachAccountRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    forgeReactAccountsRenderer = renderer;
    renderForgeAccounts();
  },
  attachStatusRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    forgeReactStatusRenderer = renderer;
    updateForgeBrowserUi();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  selectAccount(id) {
    if (!forgeAccountForId(id)) return;
    void selectForgeAccount(id);
  },
};

function forgeDisplayIconCandidates(account, service) {
  const candidates = [account?.icon, ...(Array.isArray(account?.iconCandidates) ? account.iconCandidates : []), service?.icon, ...(Array.isArray(service?.iconCandidates) ? service.iconCandidates : [])];
  const images = [...new Set(candidates.filter(isImageIcon))];
  if (!images.includes(DEFAULT_ICON_DATA_URL)) images.push(DEFAULT_ICON_DATA_URL);
  return images;
}

function renderForgeAccounts() {
  const root = $('forgeAccountList');
  if (!root || typeof forgeReactAccountsRenderer !== 'function') return;
  const services = serviceMap();
  const accounts = orderedAccounts();
  forgeReactAccountsRenderer({
    accounts: accounts.map((account, index) => {
      const service = services.get(account.serviceId) || { name: 'AI' };
      return {
        id: String(account.id),
        name: String(account.name || 'Unnamed account'),
        serviceName: String(service.name || 'AI'),
        iconCandidates: forgeDisplayIconCandidates(account, service),
        active: forgeBrowserState.accountId === account.id,
        index: index + 1,
      };
    }),
  });
}

function updateForgeBrowserUi(snapshot = forgeBrowserState) {
  forgeBrowserState = { ...forgeBrowserState, ...(snapshot || {}) };
  renderForgeAccounts();
  const account = forgeAccountForId(forgeBrowserState.accountId);
  const placeholder = $('forgeBrowserPlaceholder');
  const status = $('forgeBrowserStatus');
  const url = $('forgeBrowserUrl');
  const title = $('forgeBrowserTitle');
  const accountLabel = $('forgeBrowserAccountLabel');
  const address = $('forgeBrowserAddress');
  const toolbar = document.querySelector('.forge-browser-toolbar');
  const openExternal = $('forgeOpenExternalBtn');
  const activeUrl = forgeBrowserState.url || account?.url || '';
  const label = account ? `${forgeBrowserState.accountName || account.name}${forgeBrowserState.loading ? ' · Loading…' : ' · Ready'}` : 'Choose an account';
  if (status) {
    const statusModel = { loading: Boolean(forgeBrowserState.loading), label };
    if (typeof forgeReactStatusRenderer === 'function') forgeReactStatusRenderer(statusModel);
    else {
      status.classList.toggle('loading', statusModel.loading);
      const indicator = document.createElement('i');
      const text = document.createElement('span');
      text.textContent = label;
      status.replaceChildren(indicator, text);
    }
  }
  if (url) url.textContent = activeUrl || 'No browser selected';
  if (accountLabel) accountLabel.textContent = account ? (forgeBrowserState.accountName || account.name) : 'No account';
  if (title) title.textContent = forgeBrowserState.title || account?.name || 'Waiting for an AI account';
  if (address) address.title = activeUrl ? `${activeUrl}${forgeBrowserState.title ? ` · ${forgeBrowserState.title}` : ''}` : 'No active browser';
  if (title) title.title = forgeBrowserState.title || account?.name || 'Waiting for an AI account';
  if (toolbar) {
    toolbar.classList.toggle('is-loading', Boolean(forgeBrowserState.loading));
    toolbar.setAttribute('aria-busy', String(Boolean(forgeBrowserState.loading)));
  }
  if (openExternal) openExternal.disabled = !account || !activeUrl;
  if (placeholder) placeholder.classList.toggle('hidden', Boolean(account && forgeBrowserState.url));
  document.querySelectorAll('[data-forge-nav]').forEach((button) => {
    button.disabled = !forgeBrowserState.accountId;
  });
}
async function selectForgeAccount(accountId, { syncModel = true } = {}) {
  const account = forgeAccountForId(accountId);
  if (!account) return showToast('AI Hub account not found.', true);
  const result = await window.aiHub.forgeSetBrowser(accountId);
  if (!result?.ok) return showToast(result?.error || 'Could not open this account browser.', true);
  forgeBrowserState = { ...forgeBrowserState, ...result, accountId, accountName: account.name };
  if (syncModel) {
    const model = forgeModelForAccount(accountId);
    if (model) setForgeComposerModelId(model.id);
  }
  updateForgeBrowserUi(result);
  scheduleForgeBrowserLayout();
}
function syncForgeBrowserFromModel() {
  const model = selectedModel(getForgeComposerModelId());
  if (model?.provider === 'ai-hub-account' && model.accountId) selectForgeAccount(model.accountId, { syncModel: false }).catch(() => {});
}
function updateForgeBrowserLayout() {
  if (currentApp !== 'instruction-forge' || $('instructionScreen')?.classList.contains('hidden')) return;
  const clip = $('instructionScreen')?.getBoundingClientRect();
  const slot = $('forgeBrowserSlot');
  if (!clip || !slot) return;
  const r = slot.getBoundingClientRect();
  const x1 = Math.max(r.left, clip.left), y1 = Math.max(r.top, clip.top), x2 = Math.min(r.right, clip.right), y2 = Math.min(r.bottom, clip.bottom);
  const main = x2 - x1 < 8 || y2 - y1 < 8 ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  const key = JSON.stringify(main, (_k, v) => typeof v === 'number' ? Math.round(v) : v);
  if (key === lastForgeBrowserLayoutKey) return;
  lastForgeBrowserLayoutKey = key;
  window.aiHub.forgeSetLayout({ main }).catch(() => { lastForgeBrowserLayoutKey = ''; });
}
function scheduleForgeBrowserLayout() {
  if (forgeBrowserLayoutFrame) return;
  forgeBrowserLayoutFrame = requestAnimationFrame(() => { forgeBrowserLayoutFrame = 0; updateForgeBrowserLayout(); });
}
function forgeInstruction(text) {
  return `You are Prompt Studio, an expert translator between messy human intent and precise AI instructions. The user may describe products, models, APIs, versions, features, file names, or technical concepts incorrectly because they do not know the exact terminology.

Your job is to produce one corrected, self-contained instruction that another AI can execute well.

Rules:
- Preserve the user's actual goal, priorities, constraints, tone, and desired result.
- Treat names, versions, APIs, commands, and technical terms supplied by the user as hypotheses, not as guaranteed facts.
- Correct an obviously mistaken term or version when the surrounding context makes the intended reference clear.
- When multiple interpretations are plausible, choose the safest reasonable interpretation and explicitly mark the uncertainty inside the instruction instead of inventing certainty.
- Do not invent requirements, facts, capabilities, versions, or preferences that the user did not imply.
- Convert vague human phrases into concrete acceptance criteria or steps when that can be done without changing intent.
- Include role, task, context, constraints, dependencies, verification criteria, and output format when relevant.
- Make the result self-contained and ready to give to another AI.
- Do not add a preamble, critique, or explanation of prompt engineering. Return only the final instruction.

USER'S RAW EXPLANATION:
${text}`;
}
async function forge() {
  const text = getForgeComposerInput().trim();
  const model = selectedModel(getForgeComposerModelId());
  if (!text || !model) return showToast('Explain what you need and choose an AI account or model.', true);
  if (forgeRunning) return;
  forgeRunning = true;
  if (forgeSettings.clearOutput) setForgeComposerOutput('', { publish: false });
  setForgeComposerOutput('Forging a corrected instruction…', { publish: false });
  if (!forgeComposerReactMounted && $('forgeBtn')) $('forgeBtn').disabled = true;
  publishInstructionForgeComposer();
  let result;
  try {
    const prompt = forgeInstruction(text);
    result = model.provider === 'ai-hub-account'
      ? await window.aiHub.instructionForgeAccountRequest({ accountId: model.accountId, prompt })
      : await labRequest(model, prompt);
    if (model.provider === 'ai-hub-account' && result?.ok) selectForgeAccount(model.accountId, { syncModel: false }).catch(() => {});
  } catch (error) {
    result = { ok: false, error: error?.message || 'Request failed' };
  } finally {
    forgeRunning = false;
    if (!forgeComposerReactMounted && $('forgeBtn')) $('forgeBtn').disabled = false;
  }
  setForgeComposerOutput(result?.ok ? String(result.text ?? '') : `Error: ${result?.error || 'The instruction could not be forged.'}`, { publish: false });
  if (result?.ok) {
    if (forgeSettings.autoCopyOutput) await copyText(result.text);
    if (!forgeSettings.keepInput) setForgeComposerInput('', { publish: false });
  }
  publishInstructionForgeComposer();
}
async function initInstructionForge() {
  loadForgeSettings();
  await refreshAiHubLabModels();
  renderForgeAccounts();
  const preferred = forgeBrowserState.accountId && forgeAccountForId(forgeBrowserState.accountId)
    ? forgeBrowserState.accountId
    : state.activeId && forgeAccountForId(state.activeId)
      ? state.activeId
      : orderedAccounts()[0]?.id;
  if (preferred) {
    const model = forgeModelForAccount(preferred);
    if (model) setForgeComposerModelId(model.id);
    if (forgeSettings.defaultModel && labModels().some((model) => model.id === forgeSettings.defaultModel)) setForgeComposerModelId(forgeSettings.defaultModel);
    await selectForgeAccount(preferred, { syncModel: false });
  } else {
    updateForgeBrowserUi();
  }
  scheduleForgeBrowserLayout();
}
function audioSettings() {
  const raw = state.settings?.audio;
  return { outputDeviceId: typeof raw?.outputDeviceId === 'string' && raw.outputDeviceId ? raw.outputDeviceId : 'default' };
}

let audioOutputDevices = [];
function publishGlobalSettingsControls() {
  window.dispatchEvent(new CustomEvent('madstation:global-settings-controls', {
    detail: { settings: state.settings || {}, audioDevices: audioOutputDevices },
  }));
}
let dataDiagnosticsView = {
  diagnosticsSummary: 'Ready',
  diagnosticsSessionState: 'Measuring…',
  diagnosticsProviderStatus: 'Not checked yet',
  providerCheckBusy: false,
};
function publishAboutPanelControls() {
  window.dispatchEvent(new CustomEvent('madstation:about-panel-controls', {
    detail: { version: state.appVersion || '1.6.3', providers: state.services.length, accounts: state.accounts.length },
  }));
}
window.addEventListener('madstation:about-panel-controls-mounted', publishAboutPanelControls);
function publishSecurityControls() {
  const security = state.settings?.security || {};
  window.dispatchEvent(new CustomEvent('madstation:security-controls', {
    detail: { security, hasPassword: Boolean(state.hasPassword) },
  }));
  window.dispatchEvent(new CustomEvent('madstation:ai-hub-security-panels', { detail: { security } }));
}
window.addEventListener('madstation:ai-hub-security-panels-mounted', publishSecurityControls);
function publishDownloadsSettingsControls() {
  const downloads = state.settings?.downloads || {};
  const folder = downloads.folder ? downloads.folder : (downloadState.folder ? `${downloadState.folder} (default)` : 'Your Downloads folder');
  window.dispatchEvent(new CustomEvent('madstation:downloads-settings-controls', {
    detail: { settings: downloads, folderLabel: folder, hasCustomFolder: Boolean(downloads.folder) },
  }));
}
function publishDataDiagnosticsControls() {
  window.dispatchEvent(new CustomEvent('madstation:data-settings-controls', {
    detail: { ...dataDiagnosticsView, releaseFeedUrl: typeof state.settings?.releaseFeedUrl === 'string' ? state.settings.releaseFeedUrl : '' },
  }));
}
window.addEventListener('madstation:security-controls-mounted', publishSecurityControls);
window.addEventListener('madstation:downloads-settings-controls-mounted', publishDownloadsSettingsControls);
window.addEventListener('madstation:data-settings-controls-mounted', publishDataDiagnosticsControls);
window.addEventListener('madstation:global-settings-controls-mounted', publishGlobalSettingsControls);
window.addEventListener('madstation:global-settings-panels-rendered', () => { if (settingsQuery()) filterSettings(); });
window.addEventListener('madstation:global-settings-controls-action', async (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  try {
    if (action.type === 'app-setting' && ['startMaximized', 'restoreLastAccount', 'launchAtLogin'].includes(action.key) && typeof action.value === 'boolean') {
      await updateAppSettings({ [action.key]: action.value });
      return;
    }
    if (action.type === 'accessibility-setting') {
      const allowed = ['textScale', 'highContrast', 'focusIndicators', 'alwaysShowAccountNames'];
      if (!allowed.includes(action.key)) return;
      if (action.key === 'textScale' && ![90, 100, 110, 125, 150].includes(Number(action.value))) return;
      if (action.key !== 'textScale' && typeof action.value !== 'boolean') return;
      await updateAppSettings({ accessibility: { ...(state.settings?.accessibility || {}), [action.key]: action.value } });
      return;
    }
    if (action.type === 'startup-workspace' && ['launcher', 'ai-hub', 'ai-lab', 'clipboard', 'instruction-forge', 'video-hub'].includes(action.value)) {
      await updateAppSettings({ startupWorkspace: action.value });
      return;
    }
    if (action.type === 'audio-output' && typeof action.value === 'string' && action.value.length <= 512 && (action.value === 'default' || audioOutputDevices.some((device) => device.deviceId === action.value))) {
      await updateAppSettings({ audio: { outputDeviceId: action.value } });
      showToast('Audio output updated.');
      await testAudioOutput().catch(() => {});
      return;
    }
    if (action.type === 'refresh-audio-devices') {
      await refreshAudioDevices({ silent: false });
      return;
    }
    if (action.type === 'test-audio-output') await testAudioOutput().catch((error) => showToast(error?.message || 'Could not test audio output.', true));
  } catch {
    showToast('Could not update that setting.', true);
  }
});
async function refreshAudioDevices({ silent = false } = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    if (!silent) showToast('Audio output discovery is not available in this Electron build.', true);
    audioOutputDevices = [];
    publishGlobalSettingsControls();
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioOutputDevices = devices.filter((device) => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default')
      .slice(0, 63).map((device, index) => ({ deviceId: device.deviceId, label: (device.label || `Speaker / headphones ${index + 1}`).slice(0, 180) }));
    publishGlobalSettingsControls();
    if (!silent) showToast(`Audio output devices refreshed · ${audioOutputDevices.length} device${audioOutputDevices.length === 1 ? '' : 's'}.`);
  } catch (error) {
    if (!silent) showToast(error?.message || 'Could not list audio output devices.', true);
  }
}

async function testAudioOutput() {
  const selected = audioSettings().outputDeviceId;
  if (!window.Audio || typeof document.createElement !== 'function') return;
  const audio = document.createElement('audio');
  const beep = new Uint8Array(44 + 16000);
  const writeAscii = (offset, value) => { for (let i = 0; i < value.length; i += 1) beep[offset + i] = value.charCodeAt(i) & 0xff; };
  const writeU16 = (offset, value) => { beep[offset] = value & 0xff; beep[offset + 1] = (value >>> 8) & 0xff; };
  const writeU32 = (offset, value) => { beep[offset] = value & 0xff; beep[offset + 1] = (value >>> 8) & 0xff; beep[offset + 2] = (value >>> 16) & 0xff; beep[offset + 3] = (value >>> 24) & 0xff; };
  writeAscii(0, 'RIFF'); writeU32(4, beep.length - 8); writeAscii(8, 'WAVE'); writeAscii(12, 'fmt '); writeU32(16, 16); writeU16(20, 1); writeU16(22, 1); writeU32(24, 16000); writeU32(28, 16000); writeU16(32, 1); writeU16(34, 8); writeAscii(36, 'data'); writeU32(40, 16000);
  for (let i = 0; i < 16000; i += 1) beep[44 + i] = 128 + Math.round(Math.sin(i / 16000 * Math.PI * 2 * 440) * 40);
  audio.src = URL.createObjectURL(new Blob([beep], { type: 'audio/wav' }));
  if (selected && selected !== 'default' && typeof audio.setSinkId === 'function') { try { await audio.setSinkId(selected); } catch { /* device may have disappeared; default output remains a safe fallback */ } }
  try { await audio.play(); } finally { setTimeout(() => { try { URL.revokeObjectURL(audio.src); } catch {} }, 1200); }
}

function normalizeLocalArenaSelection() {
  const usable = localModels.map((model, index) => ({ model, key: String(index) })).filter(({ model }) => model?.type !== 'file');
  const hasKey = (key) => usable.some((item) => item.key === key);
  if (!hasKey(localArenaSelections.left)) localArenaSelections.left = usable[0]?.key || '';
  if (!hasKey(localArenaSelections.right) || localArenaSelections.right === localArenaSelections.left) {
    localArenaSelections.right = usable.find((item) => item.key !== localArenaSelections.left)?.key || '';
  }
}
function safeLocalArenaEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:api[_-]?key|key|access[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password|authorization|auth|bearer)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href.slice(0, 500);
  } catch {
    return raw.replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//[redacted]@').replace(/([?&](?:api[_-]?key|key|access[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password|authorization|auth|bearer)=)[^&#\s]*/gi, '$1[redacted]').slice(0, 500);
  }
}
function localArenaViewModel() {
  const models = localModels.map((model, index) => ({ model, key: String(index) }))
    .filter(({ model }) => model && model.type !== 'file')
    .map(({ model, key }) => ({
      key,
      label: String(modelLabel(model)).slice(0, 200),
      model: String(model.model || model.name || model.id || '').slice(0, 240),
      provider: String(model.provider || '').slice(0, 120),
      endpoint: safeLocalArenaEndpoint(model.endpoint),
      type: String(model.type || '').slice(0, 40),
    }));
  const servers = (Array.isArray(window.localModelServers) ? window.localModelServers : []).map((server) => ({
    provider: String(server?.provider || 'Local server').slice(0, 120),
    endpoint: safeLocalArenaEndpoint(server?.endpoint),
    ok: Boolean(server?.ok),
    models: (Array.isArray(server?.models) ? server.models : []).map((model) => String(model?.model || model?.name || '').slice(0, 240)).filter(Boolean).slice(0, 80),
  }));
  const votes = Array.isArray(aiLabData.localArenaVotes) ? aiLabData.localArenaVotes : [];
  const voteName = (model) => [model?.provider, model?.model].filter(Boolean).map(String).join(' · ') || 'Local model';
  return {
    models, servers, scanMeta: localScanMeta, scanning: Boolean(localScanRunning), selected: { ...localArenaSelections },
    status: localArenaStatus, statusError: Boolean(localArenaStatusError), running: Boolean(localArenaRunning),
    results: {
      left: localArenaResults.left ? { ...localArenaResults.left } : null,
      right: localArenaResults.right ? { ...localArenaResults.right } : null,
    },
    battle: localArenaBattle ? {
      id: String(localArenaBattle.id || ''),
      leftKey: String(localModels.indexOf(localArenaBattle.left)),
      rightKey: String(localModels.indexOf(localArenaBattle.right)),
      leftName: String(modelLabel(localArenaBattle.left)), rightName: String(modelLabel(localArenaBattle.right)),
      choice: ['left', 'right', 'tie', 'none'].includes(localArenaBattle.choice) ? localArenaBattle.choice : '',
    } : null,
    history: votes.slice(-8).reverse().map((vote) => ({
      at: String(vote.at || ''), prompt: String(vote.prompt || '').slice(0, 1000), choice: String(vote.choice || ''),
      leftName: voteName(vote.left), rightName: voteName(vote.right),
    })),
  };
}
function publishLocalArenaViewModel() {
  window.dispatchEvent(new CustomEvent('madstation:local-arena-state', { detail: localArenaViewModel() }));
}
function setLocalArenaStatus(text, isError = false) {
  localArenaStatus = String(text || '').slice(0, 500);
  localArenaStatusError = Boolean(isError);
  publishLocalArenaViewModel();
}
function localArenaSelection() {
  const left = localArenaSelections.left ? localModels[Number(localArenaSelections.left)] : null;
  const right = localArenaSelections.right ? localModels[Number(localArenaSelections.right)] : null;
  return { left: left?.type === 'file' ? null : left, right: right?.type === 'file' ? null : right };
}
async function scanLocal() {
  if (localScanRunning) return;
  localScanRunning = true;
  localScanMeta = 'Scanning servers…';
  publishLocalArenaViewModel();
  try {
    const result = await window.aiHub.scanLocalModels();
    localModels = Array.isArray(result?.models) ? result.models : [];
    window.localModelServers = Array.isArray(result?.servers) ? result.servers : [];
    const online = window.localModelServers.filter((server) => server?.ok).length;
    localScanMeta = result?.ok ? `${online} server${online === 1 ? '' : 's'} online · ${localModels.filter((model) => model?.type !== 'file').length} model${localModels.filter((model) => model?.type !== 'file').length === 1 ? '' : 's'}` : 'Scan failed';
    normalizeLocalArenaSelection();
    localArenaBattle = null;
    localArenaResults = { left: null, right: null };
    setLocalArenaStatus(result?.ok ? 'Local models refreshed. Choose two different models to compare.' : 'Local model discovery failed. Check that a supported server is running.', !result?.ok);
  } catch {
    window.localModelServers = [];
    localScanMeta = 'Scan failed';
    setLocalArenaStatus('Local model discovery failed. Check that a supported server is running.', true);
  } finally {
    localScanRunning = false;
    publishLocalArenaViewModel();
  }
}
async function runLocalArena(promptValue) {
  if (localArenaRunning) return;
  const prompt = String(promptValue || '').trim().slice(0, 20000);
  const { left, right } = localArenaSelection();
  if (!left || !right || !prompt) return setLocalArenaStatus('Discover and choose two local server models, then enter an instruction.', true);
  if (left === right || (left.model === right.model && left.endpoint === right.endpoint)) return setLocalArenaStatus('Choose two different Local AI models.', true);
  const generation = ++localArenaRunGeneration;
  const battleId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const started = performance.now();
  localArenaRunning = true;
  localArenaBattle = null;
  localArenaResults = {
    left: { ok: false, text: 'Waiting for response…', elapsedMs: null, pending: true },
    right: { ok: false, text: 'Waiting for response…', elapsedMs: null, pending: true },
  };
  setLocalArenaStatus('Running both Local AI requests…');
  const safeRequest = async (model, side) => {
    const sideStarted = performance.now();
    try {
      const result = await labRequest({ ...model }, prompt, side);
      return { ok: Boolean(result?.ok), text: result?.ok ? String(result.text ?? 'The model returned an empty response.') : `Error: ${String(result?.error || 'Request failed').slice(0, 400)}`, elapsedMs: Number.isFinite(result?.elapsedMs) ? result.elapsedMs : Math.round(performance.now() - sideStarted), pending: false };
    } catch (error) {
      return { ok: false, text: `Error: ${String(error?.message || 'Request failed').slice(0, 400)}`, elapsedMs: Math.round(performance.now() - sideStarted), pending: false };
    }
  };
  const [leftResult, rightResult] = await Promise.all([safeRequest(left, 'local-left'), safeRequest(right, 'local-right')]);
  if (generation !== localArenaRunGeneration) return;
  localArenaRunning = false;
  localArenaResults = { left: leftResult, right: rightResult };
  localArenaBattle = { id: battleId, prompt, left, right, choice: null };
  const successes = Number(leftResult.ok) + Number(rightResult.ok);
  setLocalArenaStatus(successes === 2 ? 'Both Local AI responses are ready.' : successes === 1 ? 'One response is ready; the other request failed.' : 'Both Local AI requests failed. Check server availability and model configuration.', successes !== 2);
}
function cancelLocalArenaRun() {
  if (!localArenaRunning) return;
  localArenaRunGeneration += 1;
  localArenaRunning = false;
  localArenaBattle = null;
  localArenaResults = {
    left: { ok: false, text: 'Stopped waiting. The request may still finish in the background.', elapsedMs: null, pending: false },
    right: { ok: false, text: 'Stopped waiting. The request may still finish in the background.', elapsedMs: null, pending: false },
  };
  setLocalArenaStatus('Stopped waiting. Already-sent local requests may still finish in the background.');
}
function swapLocalArenaSides() {
  if (localArenaRunning) return;
  localArenaSelections = { left: localArenaSelections.right, right: localArenaSelections.left };
  localArenaResults = { left: localArenaResults.right, right: localArenaResults.left };
  if (localArenaBattle) {
    const oldChoice = localArenaBattle.choice;
    localArenaBattle = { ...localArenaBattle, left: localArenaBattle.right, right: localArenaBattle.left, choice: oldChoice === 'left' ? 'right' : oldChoice === 'right' ? 'left' : oldChoice };
  }
  publishLocalArenaViewModel();
}
async function voteLocalArena(choice) {
  if (!['left', 'right', 'tie', 'none'].includes(choice)) return;
  const { left, right } = localArenaSelection();
  if (!left || !right) return setLocalArenaStatus('Discover and choose two Local AI models first.', true);
  if (left === right || (left.model === right.model && left.endpoint === right.endpoint)) return setLocalArenaStatus('Choose two different Local AI models.', true);
  if (!localArenaBattle || localArenaBattle.left?.model !== left.model || localArenaBattle.left?.endpoint !== left.endpoint || localArenaBattle.right?.model !== right.model || localArenaBattle.right?.endpoint !== right.endpoint) return setLocalArenaStatus('Run a Local AI battle with both models first.', true);
  localArenaBattle.choice = choice;
  aiLabData.localArenaVotes = (aiLabData.localArenaVotes || []).filter((vote) => vote.battleId !== localArenaBattle.id);
  aiLabData.localArenaVotes.push({ battleId: localArenaBattle.id, at: new Date().toISOString(), prompt: localArenaBattle.prompt.slice(0, 1000), choice, left: localArenaBattlePayload(localArenaBattle.left), right: localArenaBattlePayload(localArenaBattle.right) });
  await saveLab();
  renderScoreboard();
  publishLocalArenaViewModel();
  showToast(({ left: `Saved: you preferred ${modelLabel(localArenaBattle.left)}.`, right: `Saved: you preferred ${modelLabel(localArenaBattle.right)}.`, tie: 'Saved: tie.', none: 'Saved: neither.' })[choice]);
}
function localArenaBattlePayload(model) {
  return { model: model?.model || model?.name || '', provider: model?.provider || '', endpoint: model?.endpoint || '' };
}
function handleLocalArenaAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || Array.isArray(action)) return;
  if ((localArenaRunning || localScanRunning) && ['scan', 'select-model', 'run', 'swap', 'vote'].includes(action.type)) return;
  if (action.type === 'scan') { void scanLocal(); return; }
  if (action.type === 'run' && typeof action.prompt === 'string' && action.prompt.length <= 20000) { void runLocalArena(action.prompt); return; }
  if (action.type === 'cancel') { cancelLocalArenaRun(); return; }
  if (action.type === 'swap') { swapLocalArenaSides(); return; }
  if (action.type === 'select-model' && ['left', 'right'].includes(action.side) && typeof action.key === 'string') {
    const index = Number(action.key);
    if (!Number.isInteger(index) || index < 0 || index >= localModels.length || localModels[index]?.type === 'file') return;
    const previous = { ...localArenaSelections };
    const next = { ...previous, [action.side]: action.key };
    const other = action.side === 'left' ? 'right' : 'left';
    if (next[other] === action.key) next[other] = previous[action.side] !== action.key ? previous[action.side] : '';
    localArenaSelections = next;
    localArenaBattle = null;
    publishLocalArenaViewModel();
  }
  if (action.type === 'vote' && ['left', 'right', 'tie', 'none'].includes(action.choice)) void voteLocalArena(action.choice);
}
let arenaLayoutObserver = null;
function attachArenaBrowserSlotObservers() {
  if (typeof ResizeObserver !== 'function') return;
  if (!arenaLayoutObserver) arenaLayoutObserver = new ResizeObserver(() => scheduleArenaBrowserLayout());
  ['arenaLeftBrowserSlot', 'arenaRightBrowserSlot'].forEach((id) => {
    const slot = $(id);
    if (slot && !slot.dataset.arenaLayoutObserved) {
      slot.dataset.arenaLayoutObserved = '1';
      arenaLayoutObserver.observe(slot);
    }
  });
  scheduleArenaBrowserLayout();
}
function bindAiLab() {
  $('instructionBackBtn')?.addEventListener('click',goToLauncher);
  document.querySelectorAll('[data-lab-tab]').forEach(btn=>btn.addEventListener('click',()=>activateLabTab(btn.dataset.labTab)));
  document.querySelectorAll('[data-arena-tab]').forEach(btn=>btn.addEventListener('click',()=>activateArenaSubtab(btn.dataset.arenaTab)));
  $('aiLabBackBtn')?.addEventListener('click',goToLauncher);
  $('arenaAddAccountBtn')?.addEventListener('click',arenaAddAccountAction);
  $('arenaNewName')?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); arenaAddAccountAction(); } });
  $('arenaAddProviderBtn')?.addEventListener('click',arenaAddProviderAction);
  $('apiModelEditor')?.addEventListener('change',loadApiModelEditor);
  $('apiModelSaveBtn')?.addEventListener('click',saveApiModelEditor);
  $('apiModelClearKeyBtn')?.addEventListener('click',clearApiModelKey);
  $('apiModelSettingsCollapseBtn')?.addEventListener('click',toggleApiModelSettings);
  window.addEventListener('madstation:free-arena-action', (event) => { handleFreeArenaAction(event); });
  window.addEventListener('madstation:local-arena-action', (event) => { handleLocalArenaAction(event); });
  window.addEventListener('madstation:free-arena-mounted', () => { publishFreeArenaViewModel(); attachArenaBrowserSlotObservers(); });
  window.addEventListener('madstation:browser-arenas-mounted', () => {
    publishFreeArenaViewModel();
    publishLocalArenaViewModel();
    attachArenaBrowserSlotObservers();
  });
  window.addEventListener('madstation:api-arena-mounted', publishApiArenaViewModel);
  window.addEventListener('madstation:api-arena-action', (event) => { void handleApiArenaAction(event); });
  window.addEventListener('madstation:api-model-settings-mounted', () => { apiModelSettingsReactMounted = true; publishApiModelSettings(); });
  window.addEventListener('madstation:api-model-settings-action', (event) => { void handleApiModelSettingsAction(event); });
  window.addEventListener('resize', scheduleArenaBrowserLayout);
  $('aiLabScreen')?.addEventListener('scroll', scheduleArenaBrowserLayout, { passive: true });
  window.addEventListener('scroll', scheduleArenaBrowserLayout, { passive: true, capture: true });
  $('forgeBtn')?.addEventListener('click',forge);
  $('forgeCopyBtn')?.addEventListener('click',async()=>{ const output = $('forgeOutput')?.value || ''; if (!output) return showToast('There is no generated prompt to copy.', true); const result = await window.aiHub.writeSystemClipboard(output); if (result?.ok === false) showToast(result.error || 'Could not copy the prompt.', true); else showToast('Prompt copied.'); });
  $('forgeModel')?.addEventListener('change', () => { setForgeComposerModelId($('forgeModel')?.value || '', { publish: false }); syncForgeBrowserFromModel(); });
  const handleForgeNavigation = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (button?.disabled) return;
    const result = await window.aiHub.forgeNavigate(button.dataset.forgeNav);
    if(result?.state) updateForgeBrowserUi(result.state);
    if(!result?.ok) showToast(result?.error||'Browser action failed.',true);
  };
  document.querySelectorAll('[data-forge-nav]').forEach((button)=>{
    // pointerdown makes these controls reliable even when a native WebContentsView
    // is layered immediately below the browser slot. Keep click as a fallback for
    // keyboard/assistive activation.
    button.addEventListener('pointerdown', handleForgeNavigation);
    button.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      handleForgeNavigation(event);
    });
  });
  $('forgeOpenExternalBtn')?.addEventListener('click', async () => {
    if ($('forgeOpenExternalBtn')?.disabled) return;
    const result = await window.aiHub.forgeOpenInBrowser();
    if (!result?.ok) showToast(result?.error || 'Could not open this page in your default browser.', true);
  });
  window.addEventListener('resize',scheduleForgeBrowserLayout);
  $('instructionScreen')?.addEventListener('scroll',scheduleForgeBrowserLayout,{passive:true});
  const forgeLayoutObserver=new ResizeObserver(()=>scheduleForgeBrowserLayout());
  const forgeSlot=$('forgeBrowserSlot'); if(forgeSlot) forgeLayoutObserver.observe(forgeSlot);
  $('scoreClearBtn')?.addEventListener('click',async()=>{ if(!window.confirm('Clear all Arena votes from the leaderboard?')) return; aiLabData.votes=[];aiLabData.arenaVotes=[];aiLabData.apiArenaVotes=[];aiLabData.localArenaVotes=[];await saveLab();renderScoreboard();publishApiArenaViewModel();publishFreeArenaViewModel();publishLocalArenaViewModel();});
}
bindAiLab();
let videoHubData = { providers: [], accounts: [], activeAccountId: null };
let videoHubAddAccountReactRenderer = null;
let videoHubAddSiteReactRenderer = null;
let videoHubAddAccountPreferredProviderId = '';
let videoHubRenamingId = '';
let videoHubActiveTab = 'studio';
let videoHubBrowserLayoutFrame = 0;
let lastVideoHubBrowserLayoutKey = '';
let videoHubBrowserStateReactMounted = false;
let videoHubBrowserLoadingAccountId = '';
let videoHubBrowserLoading = false;
let videoHubBrowserStatus = { accountId: '', hasBrowserView: false, error: '' };
window.aiHub.onVideoHubBrowserLoading((payload) => {
  if (!payload || typeof payload !== 'object' || typeof payload.accountId !== 'string' || typeof payload.loading !== 'boolean') return;
  videoHubBrowserLoadingAccountId = payload.accountId;
  videoHubBrowserLoading = payload.loading;
  renderVideoHubWorkspaceChrome();
});
window.aiHub.onVideoHubBrowserStatus((payload) => {
  if (!payload || typeof payload !== 'object' || typeof payload.accountId !== 'string' || typeof payload.hasBrowserView !== 'boolean') return;
  videoHubBrowserStatus = { accountId: payload.accountId, hasBrowserView: payload.hasBrowserView, error: typeof payload.error === 'string' ? payload.error.slice(0, 300) : '' };
  publishVideoHubBrowserState(Boolean(videoHubAccountForId(videoHubData.activeAccountId)));
});
window.addEventListener('madstation:video-hub-browser-state-action', (event) => {
  if (event?.detail?.type !== 'retry' || !videoHubData.activeAccountId) return;
  videoHubBrowserStatus = { accountId: videoHubData.activeAccountId, hasBrowserView: false, error: '' };
  publishVideoHubBrowserState(true);
  void window.aiHub.videoHubSetActiveAccount(videoHubData.activeAccountId).then((result) => {
    if (!applyVideoHubState(result)) showToast(result?.error || 'Could not reopen the Video Hub browser.', true);
  }).catch((error) => showToast(error?.message || 'Could not reopen the Video Hub browser.', true));
});

function videoHubProviderForId(id) { return videoHubData.providers.find((provider) => provider.id === id) || null; }
function videoHubAccountForId(id) { return videoHubData.accounts.find((account) => account.id === id) || null; }
function publishVideoHubBrowserState(hasActiveAccount) {
  const active = videoHubAccountForId(videoHubData.activeAccountId);
  const matchesActive = Boolean(active && videoHubBrowserStatus.accountId === active.id);
  window.dispatchEvent(new CustomEvent('madstation:video-hub-browser-state', {
    detail: {
      hasActiveAccount: Boolean(hasActiveAccount),
      hasBrowserView: matchesActive && videoHubBrowserStatus.hasBrowserView,
      error: matchesActive ? videoHubBrowserStatus.error : '',
      loading: Boolean(active && videoHubBrowserLoading && videoHubBrowserLoadingAccountId === active.id),
    },
  }));
}
window.addEventListener('madstation:video-hub-browser-state-mounted', () => {
  videoHubBrowserStateReactMounted = true;
  const fallback = $('videoHubBrowserPlaceholder');
  if (fallback) fallback.hidden = true;
  publishVideoHubBrowserState(Boolean(videoHubAccountForId(videoHubData.activeAccountId)));
});
function publishVideoHubAddAccount() {
  if (typeof videoHubAddAccountReactRenderer !== 'function') return;
  const select = $('videoHubNewProvider');
  const selectedProviderId = videoHubProviderForId(videoHubAddAccountPreferredProviderId)?.id
    || videoHubProviderForId(select?.value)?.id || videoHubData.providers[0]?.id || '';
  videoHubAddAccountPreferredProviderId = selectedProviderId;
  videoHubAddAccountReactRenderer({
    providers: videoHubData.providers.map((provider) => ({ id: String(provider.id), name: String(provider.name) })),
    selectedProviderId,
  });
}
function selectVideoHubAddAccountProvider(providerId) {
  if (typeof videoHubAddAccountReactRenderer === 'function') {
    videoHubAddAccountPreferredProviderId = videoHubProviderForId(providerId)?.id || '';
    window.dispatchEvent(new CustomEvent('madstation:video-hub-add-account-select-provider', { detail: { providerId: videoHubAddAccountPreferredProviderId } }));
    publishVideoHubAddAccount();
    return;
  }
  const select = $('videoHubNewProvider');
  if (select && videoHubProviderForId(providerId)) select.value = providerId;
}
function applyVideoHubState(result) {
  if (!result || result.ok === false) return false;
  const previousActiveAccountId = videoHubData.activeAccountId;
  videoHubData = {
    providers: Array.isArray(result.providers) ? result.providers : videoHubData.providers,
    accounts: Array.isArray(result.accounts) ? result.accounts : videoHubData.accounts,
    activeAccountId: result.activeAccountId || null,
  };
  if (previousActiveAccountId !== videoHubData.activeAccountId
    && videoHubBrowserLoadingAccountId !== videoHubData.activeAccountId) {
    videoHubBrowserLoading = false;
    videoHubBrowserLoadingAccountId = '';
  }
  renderVideoHub();
  publishVideoHubBrowserState(Boolean(videoHubAccountForId(videoHubData.activeAccountId)));
  return true;
}
function renderVideoHub() {
  const providerSelect = $('videoHubNewProvider');
  const providerList = $('videoHubProviderList');
  const accountList = $('videoHubAccountList');
  if (!providerSelect || !accountList) return;
  const previousProvider = providerSelect.value;
  const previousAccountIcons = videoHubRefreshPending ? new Map() : captureIconNodes(accountList, (img) => {
    const row = img.closest('[data-video-hub-account]');
    return row ? `account:${row.dataset.videoHubAccount}` : '';
  });
  const previousProviderListIcons = videoHubRefreshPending || !providerList || typeof videoHubProvidersReactRenderer === 'function' ? new Map() : captureIconNodes(providerList, (img) => {
    const row = img.closest('[data-video-hub-provider-id]');
    return row ? `provider:${row.dataset.videoHubProviderId}` : '';
  });
  const selectedProviderId = videoHubProviderForId(previousProvider)?.id || videoHubData.providers[0]?.id || '';
  videoHubAddAccountPreferredProviderId = selectedProviderId;
  if (typeof videoHubAddAccountReactRenderer !== 'function' && providerSelect) {
    // Startup fallback only. Use DOM text nodes rather than parsing provider names as HTML.
    const options = videoHubData.providers.map((provider) => {
      const option = document.createElement('option');
      option.value = String(provider.id);
      option.textContent = String(provider.name);
      return option;
    });
    if (!options.length) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'No video sites available';
      options.push(emptyOption);
    }
    providerSelect.replaceChildren(...options);
    providerSelect.value = selectedProviderId;
  }
  if (typeof videoHubAddAccountReactRenderer === 'function') publishVideoHubAddAccount();
  $('videoHubAccountCount').textContent = `${videoHubData.accounts.length} account${videoHubData.accounts.length === 1 ? '' : 's'}`;
  const active = videoHubAccountForId(videoHubData.activeAccountId);
  if (videoHubBrowserStateReactMounted) publishVideoHubBrowserState(Boolean(active));
  else $('videoHubBrowserPlaceholder')?.classList.toggle('hidden', Boolean(active));
  if (typeof videoHubAccountsReactRenderer !== 'function') {
  accountList.innerHTML = videoHubData.accounts.length ? videoHubData.accounts.map((account) => {
    const selected = account.id === videoHubData.activeAccountId;
    const renaming = videoHubRenamingId === account.id;
    const name = renaming
      ? `<input class="ms-input video-hub-rename-input" data-video-hub-rename="${escapeHtml(account.id)}" maxlength="60" value="${escapeHtml(account.name)}" aria-label="Account label" />`
      : `<strong>${escapeHtml(account.name)}</strong>`;
    const selectButton = selected
      ? '<button class="ms-btn ms-btn--sm" type="button" disabled>Active</button>'
      : `<button class="ms-btn ms-btn--sm ms-btn--primary" type="button" data-video-hub-action="activate" data-id="${escapeHtml(account.id)}">Open</button>`;
    const extraActions = renaming
      ? `<button class="ms-btn ms-btn--sm" type="button" data-video-hub-action="save-rename" data-id="${escapeHtml(account.id)}">Save</button><button class="ms-btn ms-btn--sm" type="button" data-video-hub-action="cancel-rename" data-id="${escapeHtml(account.id)}">Cancel</button>`
      : `<button class="ms-btn ms-btn--sm" type="button" data-video-hub-action="rename" data-id="${escapeHtml(account.id)}">Rename</button><button class="ms-btn ms-btn--sm" type="button" data-video-hub-action="reset" data-id="${escapeHtml(account.id)}">Reset login</button><button class="ms-btn ms-btn--sm" type="button" data-video-hub-action="delete" data-id="${escapeHtml(account.id)}">Delete</button>`;
    const icon = videoHubIconMarkup(account);
    return `<article class="ms-row video-hub-account-row ${selected ? 'is-active' : ''}" data-video-hub-account="${escapeHtml(account.id)}"><span class="video-hub-logo" aria-hidden="true">${icon}</span><div class="video-hub-account-copy">${name}<span class="ms-muted">${escapeHtml(account.providerName)} · separate cookies and storage</span></div>${selectButton}<div class="video-hub-account-actions">${extraActions}</div></article>`;
  }).join('') : '<div class="ms-empty">No accounts yet. Open Add Accounts to create your first account.</div>';
  }
  if (providerList) {
    if (typeof videoHubProvidersReactRenderer === 'function') {
      renderVideoHubProviders();
    } else {
      // Startup fallback only. Once the React bridge attaches, it exclusively
      // owns the provider management rows under #videoHubProviderList.
      providerList.innerHTML = videoHubData.providers.map((provider) => `<div class="ms-row video-hub-provider-row" data-video-hub-provider-id="${escapeHtml(provider.id)}"><span class="video-hub-logo">${videoHubIconMarkup(provider)}</span><span><strong>${escapeHtml(provider.name)}</strong><br><span class="ms-muted">${escapeHtml(provider.note || provider.url)}</span></span>${provider.builtin ? '' : `<button class="ms-btn ms-btn--sm" type="button" data-video-hub-delete-provider="${escapeHtml(provider.id)}" aria-label="Remove ${escapeHtml(provider.name)}">Remove</button>`}</div>`).join('');
      bindIconFallbacks(providerList);
      providerList.querySelectorAll('[data-video-hub-delete-provider]').forEach((button) => button.addEventListener('click', () => deleteVideoHubProvider(button.dataset.videoHubDeleteProvider)));
    }
  }
  if (typeof videoHubAccountsReactRenderer !== 'function') {
  accountList.querySelectorAll('[data-video-hub-action]').forEach((button) => button.addEventListener('click', () => videoHubAccountAction(button.dataset.videoHubAction, button.dataset.id)));
  const renameInput = accountList.querySelector('[data-video-hub-rename]');
  if (renameInput) {
    renameInput.focus(); renameInput.select();
    renameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') videoHubAccountAction('save-rename', renameInput.dataset.videoHubRename);
      if (event.key === 'Escape') videoHubAccountAction('cancel-rename', renameInput.dataset.videoHubRename);
    });
  }
  }
  decorateVideoHub();
  if (!videoHubRefreshPending) {
    if (typeof videoHubAccountsReactRenderer !== 'function') restoreIconNodes(accountList, previousAccountIcons, (img) => {
      const row = img.closest('[data-video-hub-account]');
      return row ? `account:${row.dataset.videoHubAccount}` : '';
    });
    if (providerList && typeof videoHubProvidersReactRenderer !== 'function') restoreIconNodes(providerList, previousProviderListIcons, (img) => {
      const row = img.closest('[data-video-hub-provider-id]');
      return row ? `provider:${row.dataset.videoHubProviderId}` : '';
    });
  }
  bindIconFallbacks($('videoHubScreen'));
  videoHubRefreshPending = false;
}
async function loadVideoHubState() {
  const result = await window.aiHub.videoHubGetState();
  if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not load Video Hub accounts.', true);
  if (videoHubData.activeAccountId) {
    const opened = await window.aiHub.videoHubSetActiveAccount(videoHubData.activeAccountId);
    if (!applyVideoHubState(opened)) showToast(opened?.error || 'Could not open this video account.', true);
  }
  scheduleVideoHubBrowserLayout();
}
async function addVideoHubAccount(candidate = null) {
  const providerSelect = $('videoHubNewProvider');
  const nameInput = $('videoHubNewName');
  const providerId = candidate && typeof candidate.providerId === 'string' ? candidate.providerId : (providerSelect?.value || '');
  const name = candidate && typeof candidate.name === 'string' ? candidate.name.trim() : (nameInput?.value.trim() || '');
  if (!videoHubProviderForId(providerId)) return showToast('Add a video site first.', true);
  const result = await window.aiHub.videoHubAddAccount({ providerId, name });
  if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not add the video account.', true);
  if (typeof videoHubAddAccountReactRenderer !== 'function' && nameInput) nameInput.value = '';
  window.dispatchEvent(new Event('madstation:video-hub-add-account-success'));
  const accountId = result.account?.id || videoHubData.activeAccountId;
  if (accountId) {
    const activated = await window.aiHub.videoHubSetActiveAccount(accountId);
    if (!applyVideoHubState(activated)) return showToast(activated?.error || 'Could not open the new account.', true);
  }
  scheduleVideoHubBrowserLayout();
  showToast(`${result.account?.name || 'Video account'} added. Sign in inside its isolated browser.`);
}
async function addVideoHubProvider(candidate = null) {
  let input;
  if (candidate && typeof candidate.preventDefault === 'function') {
    candidate.preventDefault();
    input = {
      name: $('videoHubNewProviderName')?.value,
      url: $('videoHubNewProviderUrl')?.value,
      icon: $('videoHubNewProviderIcon')?.value,
    };
  } else if (candidate && typeof candidate === 'object') {
    input = candidate;
  } else {
    input = {
      name: $('videoHubNewProviderName')?.value,
      url: $('videoHubNewProviderUrl')?.value,
      icon: $('videoHubNewProviderIcon')?.value,
    };
  }
  const payload = {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    url: typeof input.url === 'string' ? input.url.trim() : '',
    icon: typeof input.icon === 'string' ? input.icon.trim() : '',
  };
  const result = await window.aiHub.videoHubAddProvider(payload);
  if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not add that video site.', true);
  if (result.provider?.id) selectVideoHubAddAccountProvider(result.provider.id);
  if (typeof videoHubAddSiteReactRenderer === 'function') {
    window.dispatchEvent(new Event('madstation:video-hub-add-site-success'));
  } else {
    if ($('videoHubNewProviderName')) $('videoHubNewProviderName').value = '';
    if ($('videoHubNewProviderUrl')) $('videoHubNewProviderUrl').value = '';
    if ($('videoHubNewProviderIcon')) $('videoHubNewProviderIcon').value = '';
  }
  showToast(`${result.provider?.name || 'Video site'} added.`);
}
async function videoHubAccountAction(action, id, proposedName) {
  const account = videoHubAccountForId(id);
  if (action === 'cancel-rename') { videoHubRenamingId = ''; return renderVideoHub(); }
  if (action === 'rename') { videoHubRenamingId = id; return renderVideoHub(); }
  if (!account) return;
  if (action === 'activate') {
    const result = await window.aiHub.videoHubSetActiveAccount(id);
    if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not open this account.', true);
    scheduleVideoHubBrowserLayout();
    return;
  }
  if (action === 'save-rename') {
    const inputName = $('videoHubAccountList')?.querySelector(`[data-video-hub-rename="${CSS.escape(id)}"]`)?.value || '';
    const name = typeof proposedName === 'string' ? proposedName : inputName;
    const result = await window.aiHub.videoHubRenameAccount(id, name);
    if (!result || result.ok === false) return showToast(result?.error || 'Could not rename the account.', true);
    videoHubRenamingId = '';
    if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not rename the account.', true);
    return showToast('Account renamed.');
  }
  if (action === 'reset') {
    if (!window.confirm(`Reset the login for “${account.name}”?\n\nThis signs the account out and erases its saved cookies and site storage in Video Hub. Other accounts and AI Hub are not affected.`)) return;
    const result = await window.aiHub.videoHubResetLogin(id);
    return showToast(result?.ok ? `${account.name} signed out; its session was cleared.` : (result?.error || 'Could not reset this login.'), !result?.ok);
  }
  if (action === 'delete') {
    if (videoHubSettings.confirmDestructive && !window.confirm(`Delete “${account.name}” and erase its saved login?\n\nOther Video Hub accounts and AI Hub are not affected.`)) return;
    const result = await window.aiHub.videoHubDeleteAccount(id);
    if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not delete the account.', true);
    if (videoHubData.activeAccountId) {
      const opened = await window.aiHub.videoHubSetActiveAccount(videoHubData.activeAccountId);
      applyVideoHubState(opened);
    }
    scheduleVideoHubBrowserLayout();
    return showToast(`${account.name} deleted.`);
  }
}
async function deleteVideoHubProvider(id) {
  const provider = videoHubProviderForId(id);
  if (!provider || provider.builtin) return;
  const linked = videoHubData.accounts.filter((account) => account.providerId === id);
  if (videoHubSettings.confirmDestructive && !window.confirm(`Remove ${provider.name}${linked.length ? ` and delete its ${linked.length} account${linked.length === 1 ? '' : 's'} and saved logins` : ''}?\n\nBuilt-in Video Hub sites and AI Hub are not affected.`)) return;
  const result = await window.aiHub.videoHubDeleteProvider(id);
  if (!applyVideoHubState(result)) return showToast(result?.error || 'Could not remove that site.', true);
  if (videoHubData.activeAccountId) {
    const opened = await window.aiHub.videoHubSetActiveAccount(videoHubData.activeAccountId);
    applyVideoHubState(opened);
  }
  scheduleVideoHubBrowserLayout();
  showToast(`${provider.name} removed.`);
}
function updateVideoHubBrowserLayout() {
  if (currentApp !== 'video-hub' || $('videoHubScreen')?.classList.contains('hidden')) return;
  const clip = $('videoHubScreen')?.getBoundingClientRect();
  const slot = $('videoHubBrowserSlot');
  if (!clip || !slot) return;
  const r = slot.getBoundingClientRect();
  const x1 = Math.max(r.left, clip.left), y1 = Math.max(r.top, clip.top), x2 = Math.min(r.right, clip.right), y2 = Math.min(r.bottom, clip.bottom);
  const main = x2 - x1 < 8 || y2 - y1 < 8 ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  const key = JSON.stringify(main, (_k, value) => typeof value === 'number' ? Math.round(value) : value);
  if (key === lastVideoHubBrowserLayoutKey) return;
  lastVideoHubBrowserLayoutKey = key;
  Promise.resolve(window.aiHub.videoHubSetLayout({ main })).then((result) => {
    if (!result || result.ok === false) lastVideoHubBrowserLayoutKey = '';
  }).catch(() => { lastVideoHubBrowserLayoutKey = ''; });
}
function scheduleVideoHubBrowserLayout() {
  if (videoHubBrowserLayoutFrame) return;
  videoHubBrowserLayoutFrame = requestAnimationFrame(() => { videoHubBrowserLayoutFrame = 0; updateVideoHubBrowserLayout(); });
}
$('videoHubAddAccountBtn')?.addEventListener('click', () => addVideoHubAccount().catch((error) => showToast(error?.message || 'Could not add account.', true)));
window.addEventListener('madstation:video-hub-add-account-action', (event) => {
  const detail = event?.detail;
  if (!detail || typeof detail.providerId !== 'string' || typeof detail.name !== 'string') return;
  void addVideoHubAccount({ providerId: detail.providerId, name: detail.name })
    .catch((error) => showToast(error?.message || 'Could not add account.', true));
});
window.addEventListener('madstation:video-hub-add-provider-action', (event) => {
  const detail = event?.detail;
  if (!detail || typeof detail.name !== 'string' || typeof detail.url !== 'string' || typeof detail.icon !== 'string') return;
  void addVideoHubProvider({ name: detail.name, url: detail.url, icon: detail.icon })
    .catch((error) => showToast(error?.message || 'Could not add video site.', true));
});
window.MadStationVideoHubAddAccount = {
  attachReactRenderers(accountRenderer, siteRenderer) {
    videoHubAddAccountReactRenderer = typeof accountRenderer === 'function' ? accountRenderer : null;
    videoHubAddSiteReactRenderer = typeof siteRenderer === 'function' ? siteRenderer : null;
    if (videoHubAddSiteReactRenderer) videoHubAddSiteReactRenderer();
    if (videoHubAddAccountReactRenderer) publishVideoHubAddAccount();
  },
};

$('videoHubAddProviderForm')?.addEventListener('submit', (event) => addVideoHubProvider(event).catch((error) => showToast(error?.message || 'Could not add video site.', true)));
// ---------------------------------------------------------------------------
// Video Hub: AI Hub-style sidebar (additive; the account/site functions above are unchanged).
// Search, site filter, pins, recents, quick-add and a collapsible account list.
// Pins, recents, provider filter and collapse state live in the UI preference record;
// account view and other workspace preferences live in Video Hub Settings. Logins
// stay in each account's own Chromium partition.
// ---------------------------------------------------------------------------
const VIDEO_HUB_UI_KEY = 'madstation.videoHub.ui.v1';
const VIDEO_HUB_SETTINGS_KEY = 'madstation.videoHub.settings.v1';
const VIDEO_HUB_DEFAULT_SETTINGS = { defaultTab: 'studio', accountView: 'grid', showRecent: true, startCollapsed: false, confirmDestructive: true };
function loadVideoHubSettings() { try { const v = JSON.parse(localStorage.getItem(VIDEO_HUB_SETTINGS_KEY) || '{}'); return { ...VIDEO_HUB_DEFAULT_SETTINGS, ...(v && typeof v === 'object' ? v : {}), defaultTab: v.defaultTab === 'accounts' ? 'accounts' : 'studio', accountView: v.accountView === 'list' ? 'list' : 'grid', showRecent: v.showRecent !== false, startCollapsed: v.startCollapsed === true, confirmDestructive: v.confirmDestructive !== false, networkMode: v.networkMode === 'system' ? 'system' : 'direct' }; } catch { return { ...VIDEO_HUB_DEFAULT_SETTINGS }; } }
let videoHubSettings = loadVideoHubSettings();
function saveVideoHubSettings() { try { localStorage.setItem(VIDEO_HUB_SETTINGS_KEY, JSON.stringify(videoHubSettings)); } catch {} }
let videoHubSettingsReturnFocus = null;
let videoHubSettingsModalOpen = false;
function publishVideoHubSettings(kind = 'sync') {
  window.dispatchEvent(new CustomEvent('madstation:video-hub-settings-state', {
    detail: { kind, open: videoHubSettingsModalOpen, settings: videoHubSettings, security: state.settings?.security || {} },
  }));
}
window.addEventListener('madstation:video-hub-settings-mounted', () => publishVideoHubSettings());
function openVideoHubSettings() {
  if (!$('videoHubSettingsReactMount')) return;
  videoHubSettingsReturnFocus = document.activeElement;
  applySecurityUi();
  videoHubSettingsModalOpen = true;
  publishVideoHubSettings('open');
  window.aiHub.videoHubSettingsOverlay(true).catch(() => {});
}
function closeVideoHubSettings() {
  videoHubSettingsModalOpen = false;
  publishVideoHubSettings('close');
  window.aiHub.videoHubSettingsOverlay(false).catch(() => {});
  const returnFocus = videoHubSettingsReturnFocus;
  videoHubSettingsReturnFocus = null;
  if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  else $('videoHubSettingsBtn')?.focus();
}
function commitVideoHubSettings(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return showToast('Could not save Video Hub settings.', true);
  const input = candidate;
  if (!['studio', 'accounts'].includes(input.defaultTab)
    || !['grid', 'list'].includes(input.accountView)
    || typeof input.showRecent !== 'boolean'
    || typeof input.startCollapsed !== 'boolean'
    || typeof input.confirmDestructive !== 'boolean'
    || !['direct', 'system'].includes(input.networkMode)) {
    return showToast('Could not save Video Hub settings.', true);
  }
  videoHubSettings = {
    defaultTab: input.defaultTab,
    accountView: input.accountView,
    showRecent: input.showRecent,
    startCollapsed: input.startCollapsed,
    confirmDestructive: input.confirmDestructive,
    networkMode: input.networkMode,
  };
  saveVideoHubSettings();
  window.aiHub.videoHubSetNetworkMode(videoHubSettings.networkMode).then((result) => {
    if (!result?.ok) showToast(result?.error || 'Could not apply the network mode.', true);
    else if (result.changed) showToast(`Network mode applied: ${videoHubSettings.networkMode === 'system' ? 'system proxy' : 'normal network'}. Refresh open pages.`);
  }).catch(() => showToast('Could not apply the network mode.', true));
  videoHubUi.collapsed = videoHubSettings.startCollapsed;
  saveVideoHubUi();
  renderVideoHub();
  applyVideoHubSidebarState();
  closeVideoHubSettings();
  showToast('Video Hub settings saved.');
}
window.addEventListener('madstation:video-hub-settings-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  if (action.type === 'close') {
    closeVideoHubSettings();
    return;
  }
  if (action.type === 'save') {
    commitVideoHubSettings(action.settings);
    return;
  }
  const securityKeys = new Set(['allowCamera', 'allowMicrophone', 'allowNotifications', 'allowFullscreen', 'blockPopups', 'restrictNavigation', 'allowLoginProviders', 'blockHttp']);
  if (action.type === 'security-setting' && securityKeys.has(action.key) && typeof action.value === 'boolean') {
    updateSecurity({ [action.key]: action.value }).catch(() => {});
  }
});
const VIDEO_HUB_HUES = ['sky', 'mint', 'lilac', 'amber', 'rose'];
function loadVideoHubUi() {
  const fresh = { pinned: [], recent: [], provider: 'all', collapsed: false };
  try {
    const p = JSON.parse(localStorage.getItem(VIDEO_HUB_UI_KEY) || '{}');
    const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 200) : []);
    return { pinned: ids(p.pinned), recent: ids(p.recent).slice(0, 6), provider: typeof p.provider === 'string' ? p.provider : 'all', collapsed: Boolean(p.collapsed) };
  } catch { return fresh; }
}
let videoHubUi = loadVideoHubUi();
let videoHubPinnedOnly = false;
let videoHubLastActive = '';
let videoHubTileSignature = '';
let videoHubProviderTilesReactRenderer = null;
let videoHubSitesReactRenderer = null;
let videoHubAccountsReactRenderer = null;
let videoHubRecentReactRenderer = null;
let videoHubProvidersReactRenderer = null;
let videoHubHeaderReactRenderer = null;
let videoHubToolbarReactRenderer = null;
let videoHubStatsReactRenderer = null;
function saveVideoHubUi() { try { localStorage.setItem(VIDEO_HUB_UI_KEY, JSON.stringify(videoHubUi)); } catch { /* storage unavailable */ } }
function videoHubHue(key) { let n = 0; for (const ch of String(key)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return VIDEO_HUB_HUES[n % VIDEO_HUB_HUES.length]; }
function videoHubInitial(name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); }

// Build a fallback chain for Video Hub logos instead of hiding broken images.
// Prefer an explicitly supplied company logo, then the site's own favicon, a
// root-domain favicon, and finally two independent favicon services. iconMarkup
// appends the same locally embedded default icon used by AI Hub as the last resort.
function videoHubIconCandidates(item) {
  const provider = item?.providerId ? videoHubProviderForId(item.providerId) : item;
  const url = String(item?.url || provider?.url || '').trim();
  const savedIcon = String(item?.icon || provider?.icon || '').trim();
  const autoFavicon = /^https:\/\/www\.google\.com\/s2\/favicons(?:\?|$)/i.test(savedIcon);
  const candidates = [];
  if (savedIcon && !autoFavicon) candidates.push(savedIcon);
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const rootHost = hostname.replace(/^(?:app|studio|www)\./, '');
    candidates.push(`${parsed.origin}/favicon.ico`);
    if (rootHost && rootHost !== hostname) candidates.push(`https://${rootHost}/favicon.ico`);
    if (rootHost) candidates.push(`https://icons.duckduckgo.com/ip3/${rootHost}.ico`);
    candidates.push(`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`);
  } catch { /* keep any explicitly supplied image even if the homepage URL is unusual */ }
  if (savedIcon) candidates.push(savedIcon);
  return [...new Set(candidates.filter(Boolean))];
}

function videoHubIconMarkup(item, extraClass = '') {
  const candidates = videoHubIconCandidates(item);
  return iconMarkup(candidates[0] || '', `video-hub-real-icon ${extraClass}`.trim(), candidates.slice(1));
}

function renderVideoHubProviders() {
  const host = $('videoHubProviderList');
  if (!host || typeof videoHubProvidersReactRenderer !== 'function') return;
  const providers = videoHubData.providers.map((provider) => ({
    id: String(provider.id),
    name: String(provider.name || 'Unnamed video site'),
    url: String(provider.url || ''),
    note: String(provider.note || provider.url || ''),
    builtin: Boolean(provider.builtin),
    iconCandidates: [...new Set([...videoHubIconCandidates(provider).filter(isImageIcon), DEFAULT_ICON_DATA_URL])],
  }));
  videoHubProvidersReactRenderer({ providers, iconGeneration: videoHubIconSessionGeneration });
}

window.MadStationVideoHubProviders = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubProvidersReactRenderer = renderer;
    renderVideoHubProviders();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  removeProvider(id) {
    return deleteVideoHubProvider(id);
  },
};

function getVideoHubWorkspaceChromeModel() {
  const active = videoHubAccountForId(videoHubData.activeAccountId);
  let hostname = '';
  if (active) {
    try { hostname = new URL(active.url).hostname; } catch { hostname = ''; }
  }
  const activeAccount = active ? {
    id: String(active.id),
    name: String(active.name || 'Unnamed account'),
    hostname,
    iconCandidates: [...new Set([...videoHubIconCandidates(active).filter(isImageIcon), DEFAULT_ICON_DATA_URL])],
  } : null;
  return {
    activeTab: videoHubActiveTab,
    collapsed: Boolean(videoHubUi.collapsed),
    accountCount: videoHubData.accounts.length,
    providerCount: videoHubData.providers.length,
    pinnedCount: videoHubUi.pinned.length,
    activeAccount,
    loading: Boolean(activeAccount && videoHubBrowserLoading && videoHubBrowserLoadingAccountId === activeAccount.id),
    iconGeneration: videoHubIconSessionGeneration,
  };
}
function renderVideoHubWorkspaceChrome() {
  const model = getVideoHubWorkspaceChromeModel();
  if (typeof videoHubHeaderReactRenderer === 'function') videoHubHeaderReactRenderer(model);
  if (typeof videoHubToolbarReactRenderer === 'function') videoHubToolbarReactRenderer(model);
  if (typeof videoHubStatsReactRenderer === 'function') videoHubStatsReactRenderer(model);
}
window.MadStationVideoHubChrome = {
  attachHeaderRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubHeaderReactRenderer = renderer;
    renderVideoHubWorkspaceChrome();
  },
  attachToolbarRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubToolbarReactRenderer = renderer;
    renderVideoHubWorkspaceChrome();
  },
  attachStatsRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubStatsReactRenderer = renderer;
    renderVideoHubWorkspaceChrome();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  action(action, value, anchor) {
    if (action === 'toggle-sidebar') { toggleVideoHubSidebar(); return; }
    if (action === 'tab' && (value === 'studio' || value === 'accounts')) { setVideoHubTab(value); return; }
    if (action === 'navigate' && (value === 'back' || value === 'forward' || value === 'refresh')) {
      void window.aiHub.videoHubNavigate(value).then((result) => { if (!result?.ok) showToast(result?.error || 'Browser action failed.', true); }).catch(() => showToast('Browser action failed.', true));
      return;
    }
    if (action === 'open-external' && videoHubAccountForId(videoHubData.activeAccountId)) {
      void window.aiHub.videoHubOpenInBrowser().then((result) => { if (!result?.ok) showToast(result?.error || 'Could not open the site in your browser.', true); }).catch(() => showToast('Could not open the site in your browser.', true));
    }
  },
};

function getVideoHubRecentItems() {
  return videoHubUi.recent
    .map(videoHubAccountForId)
    .filter(Boolean)
    .filter((account) => account.id !== videoHubData.activeAccountId)
    .slice(0, 3)
    .map((account) => ({
      id: String(account.id),
      name: String(account.name || 'Unnamed account'),
      providerName: String(account.providerName || account.providerId || 'Video site'),
    }));
}

function renderVideoHubRecent() {
  const recent = $('videoHubRecent');
  if (!recent) return;
  const items = getVideoHubRecentItems();
  recent.classList.toggle('hidden', !videoHubSettings.showRecent || items.length === 0);
  if (typeof videoHubRecentReactRenderer === 'function') {
    videoHubRecentReactRenderer({ items });
    return;
  }
  // Startup fallback only until the React entry attaches.
  recent.innerHTML = items.length
    ? `<span class="ms-eyebrow">Recent</span>${items.map((account) => `<button class="ms-btn ms-btn--sm" type="button" data-video-hub-recent="${escapeHtml(account.id)}" title="${escapeHtml(account.providerName)}">${escapeHtml(account.name)}</button>`).join('')}`
    : '';
}

window.MadStationVideoHubRecent = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubRecentReactRenderer = renderer;
    renderVideoHubRecent();
  },
};

function renderVideoHubAccounts() {
  const host = $('videoHubAccountList');
  if (!host || typeof videoHubAccountsReactRenderer !== 'function') return;
  const accounts = videoHubData.accounts.map((account) => ({
    id: String(account.id),
    providerId: String(account.providerId || ''),
    name: String(account.name || 'Unnamed account'),
    providerName: String(account.providerName || account.providerId || 'Video site'),
    iconCandidates: [...new Set([...videoHubIconCandidates(account).filter(isImageIcon), DEFAULT_ICON_DATA_URL])],
    active: account.id === videoHubData.activeAccountId,
    pinned: videoHubUi.pinned.includes(account.id),
  }));
  videoHubAccountsReactRenderer({
    accounts,
    activeAccountId: videoHubData.activeAccountId,
    query: ($('videoHubSearch')?.value || '').trim().toLowerCase(),
    providerFilter: videoHubUi.provider,
    pinnedOnly: videoHubPinnedOnly,
    accountView: videoHubSettings.accountView === 'list' ? 'list' : 'grid',
    renamingId: videoHubRenamingId,
    iconGeneration: videoHubIconSessionGeneration,
    hasAnyAccounts: accounts.length > 0,
  });
}

window.MadStationVideoHubAccounts = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubAccountsReactRenderer = renderer;
    renderVideoHubAccounts();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  action(action, id, name) {
    void videoHubAccountAction(action, id, name);
  },
  openMenu(id, x, y) {
    openVideoHubAccountMenu(id, x, y);
  },
};

function renderVideoHubProviderTiles() {
  const host = $('videoHubProviderTiles');
  if (!host) return;
  const accounts = videoHubData.accounts;
  const counts = new Map();
  accounts.forEach((account) => counts.set(account.providerId, (counts.get(account.providerId) || 0) + 1));
  const providers = videoHubData.providers.filter((provider) => counts.has(provider.id));
  const model = {
    selectedProvider: videoHubUi.provider,
    iconGeneration: videoHubIconSessionGeneration,
    tiles: [
      { id: 'all', name: 'All', count: accounts.length, iconKind: 'grid', iconCandidates: [] },
      ...providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        count: counts.get(provider.id) || 0,
        iconKind: 'image',
        iconCandidates: [...new Set([...videoHubIconCandidates(provider).filter(isImageIcon), DEFAULT_ICON_DATA_URL])],
      })),
    ],
  };
  if (typeof videoHubProviderTilesReactRenderer === 'function') {
    videoHubProviderTilesReactRenderer(model);
    return;
  }

  // Startup fallback only. After the React bridge attaches, the controller
  // publishes models rather than mutating this root's children.
  const signature = JSON.stringify([accounts.length, [...counts.entries()], videoHubData.providers.map((provider) => [provider.id, provider.name, provider.icon])]);
  if (!videoHubRefreshPending && signature === videoHubTileSignature) return;
  const previousIcons = videoHubRefreshPending ? new Map() : captureIconNodes(host, (img) => {
    const tile = img.closest('[data-video-hub-provider-filter]');
    return tile ? `provider-filter:${tile.dataset.videoHubProviderFilter}` : '';
  });
  videoHubTileSignature = signature;
  const tile = (id, label, count, glyph) => `<button class="tile video-hub-provider-filter-tile${videoHubUi.provider === id ? ' selected' : ''}" type="button" role="tab" title="${escapeHtml(label)} · ${count} account${count === 1 ? '' : 's'}" aria-label="${escapeHtml(label)} · ${count} account${count === 1 ? '' : 's'}" data-video-hub-provider-filter="${escapeHtml(id)}" aria-selected="${videoHubUi.provider === id}"><span class="tile-icon">${glyph}</span><span class="tile-label">${escapeHtml(label)}</span><span class="tile-count">${count}</span></button>`;
  host.innerHTML = tile('all', 'All', accounts.length, ICON.grid) + providers.map((provider) => tile(provider.id, provider.name, counts.get(provider.id), videoHubIconMarkup(provider))).join('');
  bindIconFallbacks(host);
  if (!videoHubRefreshPending) restoreIconNodes(host, previousIcons, (img) => {
    const providerTile = img.closest('[data-video-hub-provider-filter]');
    return providerTile ? `provider-filter:${providerTile.dataset.videoHubProviderFilter}` : '';
  });
}

window.MadStationVideoHubProviderTiles = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    videoHubProviderTilesReactRenderer = renderer;
    renderVideoHubProviderTiles();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
};

function decorateVideoHub() {
  const accountList = $('videoHubAccountList');
  if (!accountList) return;
  const accounts = videoHubData.accounts;
  const accountView = videoHubSettings.accountView === 'list' ? 'list' : 'grid';
  accountList.classList.toggle('is-list-view', accountView === 'list');
  accountList.dataset.view = accountView;
  accountList.setAttribute('aria-label', accountView === 'list' ? 'Video Hub accounts, list view' : 'Video Hub accounts, icon grid view');
  const known = new Set(accounts.map((a) => a.id));
  videoHubUi.pinned = videoHubUi.pinned.filter((id) => known.has(id));
  videoHubUi.recent = videoHubUi.recent.filter((id) => known.has(id));
  if (videoHubUi.provider !== 'all' && !accounts.some((a) => a.providerId === videoHubUi.provider)) videoHubUi.provider = 'all';
  const active = videoHubAccountForId(videoHubData.activeAccountId);
  if (active && videoHubLastActive !== active.id) {
    videoHubLastActive = active.id;
    videoHubUi.recent = [active.id, ...videoHubUi.recent.filter((id) => id !== active.id)].slice(0, 6);
  }
  saveVideoHubUi();

  if (typeof videoHubAccountsReactRenderer === 'function') {
    renderVideoHubAccounts();
  } else {
  // Account tiles: same square icon tile as AI Hub (provider icon, ⋯ options, name on hover).
  // A row that is being renamed keeps the original row with its input and Save/Cancel buttons.
  if (accounts.length) {
    const oldRows = new Map([...accountList.querySelectorAll('.video-hub-account-row')].map((row) => [row.dataset.videoHubAccount, row]));
    accountList.textContent = '';
    accounts.forEach((account, index) => {
      const old = oldRows.get(account.id);
      if (videoHubRenamingId === account.id && old) { old.classList.add('video-hub-rename-row'); accountList.appendChild(old); return; }
      const active = account.id === videoHubData.activeAccountId;
      const pinned = videoHubUi.pinned.includes(account.id);
      const row = document.createElement('div');
      row.className = `account-row video-hub-tile${active ? ' active' : ''}`;
      row.dataset.videoHubAccount = account.id; row.dataset.providerId = account.providerId; row.setAttribute('role', 'listitem');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'account-btn';
      button.setAttribute('aria-label', `${account.name} · ${account.providerName}${active ? ' · Active account' : ' · Open account'}`);
      if (active) button.setAttribute('aria-current', 'true');
      button.innerHTML = `<span class="account-icon">${videoHubIconMarkup(account)}</span><span class="video-hub-account-labels"><span class="video-hub-account-name-line"><strong class="video-hub-account-name">${escapeHtml(account.name)}</strong>${pinned ? '<span class="video-hub-row-pin" title="Pinned account">★ Pinned</span>' : ''}</span><span class="video-hub-account-provider">${escapeHtml(account.providerName)}</span></span>${active ? '<span class="video-hub-row-active">Active</span>' : ''}${pinned ? '<span class="video-hub-tile-pin" aria-hidden="true">★</span>' : ''}`;
      button.addEventListener('click', () => { if (!active) videoHubAccountAction('activate', account.id); });
      const pop = document.createElement('div'); pop.className = 'account-name-popover'; pop.setAttribute('role', 'tooltip');
      pop.innerHTML = `<strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(account.providerName)}</span>`;
      const columns = Math.max(1, Math.floor((accountList.clientWidth + 7) / 63));
      if (index % columns === 0) pop.classList.add('edge-left'); else if (index % columns >= columns - 1) pop.classList.add('edge-right');
      const showName = () => { if (accountView !== 'grid') return; document.querySelectorAll('.account-name-popover.is-visible').forEach((el) => el.classList.remove('is-visible')); pop.classList.add('is-visible'); };
      const hideName = () => pop.classList.remove('is-visible');
      if (accountView === 'grid') {
        button.addEventListener('mouseenter', showName); button.addEventListener('mouseleave', hideName); button.addEventListener('focus', showName); button.addEventListener('blur', hideName);
      }
      const more = document.createElement('button'); more.type = 'button'; more.className = 'more-btn';
      more.title = 'Account options'; more.setAttribute('aria-label', `Options for ${account.name}`); more.innerHTML = ICON.more;
      more.addEventListener('click', (event) => { event.stopPropagation(); const r = more.getBoundingClientRect(); openVideoHubAccountMenu(account.id, r.right, r.bottom + 4); });
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); openVideoHubAccountMenu(account.id, event.clientX, event.clientY); });
      row.append(button, pop, more);
      accountList.appendChild(row);
    });
    bindIconFallbacks(accountList);
  }

  }
  // Provider filter tiles are a separate React-owned subtree after the bridge
  // attaches. Counts and selected-provider state still come from this controller.
  renderVideoHubProviderTiles();

  // Recent-account contents become React-owned after the bridge attaches.
  renderVideoHubRecent();

  // Workspace chrome and stats are rendered by the React-owned workspace module.
  renderVideoHubSiteGrid();
  applyVideoHubSidebarState();
  applyVideoHubFilters();
  renderVideoHubWorkspaceChrome();
}

function renderVideoHubSiteGrid() {
  const grid = $('videoHubSiteGrid'); if (!grid) return;
  const sites = videoHubData.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    note: String(provider.note || provider.url || ''),
    count: videoHubData.accounts.filter((account) => account.providerId === provider.id).length,
    hue: videoHubHue(provider.id),
    iconCandidates: [...new Set([...videoHubIconCandidates(provider).filter(isImageIcon), DEFAULT_ICON_DATA_URL])],
  }));
  if (typeof videoHubSitesReactRenderer === 'function') {
    videoHubSitesReactRenderer({ sites, emptyMessage: sites.length ? '' : 'No video sites available.', iconGeneration: videoHubIconSessionGeneration });
    return;
  }
  const previousSiteIcons = videoHubRefreshPending ? new Map() : captureIconNodes(grid, (img) => {
    const card = img.closest('[data-video-hub-site-id]');
    return card ? `site:${card.dataset.videoHubSiteId}` : '';
  });
  grid.innerHTML = videoHubData.providers.map((p) => {
    const n = videoHubData.accounts.filter((a) => a.providerId === p.id).length;
    return `<article class="ms-card video-hub-site-card" data-video-hub-site-id="${escapeHtml(p.id)}"><div class="ms-card-head"><span class="ms-brand-tile ms-brand-tile--${videoHubHue(p.id)}" aria-hidden="true">${videoHubIconMarkup(p)}</span><div class="video-hub-site-copy"><strong>${escapeHtml(p.name)}</strong><span class="ms-muted">${escapeHtml(p.note || p.url)}</span></div></div><div class="video-hub-site-foot"><span class="ms-chip">${n} account${n === 1 ? '' : 's'}</span><button class="ms-btn ms-btn--sm ms-btn--primary" type="button" data-video-hub-quick-add="${escapeHtml(p.id)}">Add account</button></div></article>`;
  }).join('') || '<div class="ms-empty">No video sites available.</div>';
  bindIconFallbacks(grid);
  if (!videoHubRefreshPending) restoreIconNodes(grid, previousSiteIcons, (img) => {
    const card = img.closest('[data-video-hub-site-id]');
    return card ? `site:${card.dataset.videoHubSiteId}` : '';
  });
}

window.MadStationVideoHubSites = {
  attachReactRenderer(renderer) {
    videoHubSitesReactRenderer = renderer;
    renderVideoHubSiteGrid();
  },
  bindIconFallbacks(root) {
    bindIconFallbacks(root);
  },
};

function getVideoHubFilteredAccounts() {
  const query = ($('videoHubSearch')?.value || '').trim().toLowerCase();
  return videoHubData.accounts.filter((account) => {
    const text = `${account.name} ${account.providerName}`.toLowerCase();
    return (!query || text.includes(query)) && (videoHubUi.provider === 'all' || account.providerId === videoHubUi.provider) && (!videoHubPinnedOnly || videoHubUi.pinned.includes(account.id));
  }).sort((a, b) => Number(videoHubUi.pinned.includes(b.id)) - Number(videoHubUi.pinned.includes(a.id)));
}

function applyVideoHubFilters() {
  const list = $('videoHubAccountList'); if (!list) return;
  const query = ($('videoHubSearch')?.value || '').trim().toLowerCase();
  if (typeof videoHubAccountsReactRenderer === 'function') {
    renderVideoHubAccounts();
    $('videoHubNoMatch')?.classList.toggle('hidden', !videoHubData.accounts.length || getVideoHubFilteredAccounts().length > 0);
  } else {
    const rows = [...list.querySelectorAll('[data-video-hub-account]')];
    let shown = 0;
    rows.forEach((row) => {
      const account = videoHubAccountForId(row.dataset.videoHubAccount);
      if (!account) return;
      const text = `${account.name} ${account.providerName}`.toLowerCase();
      const ok = (!query || text.includes(query)) && (videoHubUi.provider === 'all' || account.providerId === videoHubUi.provider) && (!videoHubPinnedOnly || videoHubUi.pinned.includes(account.id));
      row.classList.toggle('hidden', !ok);
      if (ok) shown += 1;
    });
    // Pinned accounts first (stable); DOM order only, so the saved account order is untouched.
    [...rows].sort((a, b) => Number(videoHubUi.pinned.includes(b.dataset.videoHubAccount)) - Number(videoHubUi.pinned.includes(a.dataset.videoHubAccount))).forEach((row) => list.appendChild(row));
    $('videoHubNoMatch')?.classList.toggle('hidden', !rows.length || shown > 0);
  }
  $('videoHubRecent')?.classList.toggle('hidden', !videoHubSettings.showRecent || Boolean(query) || videoHubPinnedOnly || videoHubUi.provider !== 'all' || getVideoHubRecentItems().length === 0);
  if (typeof videoHubProviderTilesReactRenderer === 'function') renderVideoHubProviderTiles();
  else document.querySelectorAll('[data-video-hub-provider-filter]').forEach((b) => { const on = b.dataset.videoHubProviderFilter === videoHubUi.provider; b.setAttribute('aria-selected', String(on)); b.classList.toggle('selected', on); });
  const title = $('videoHubListTitle');
  if (title) title.textContent = query ? `Results for “${$('videoHubSearch').value.trim()}”` : videoHubPinnedOnly ? 'Pinned accounts' : videoHubUi.provider !== 'all' ? `${videoHubProviderForId(videoHubUi.provider)?.name || 'Site'} accounts` : 'All accounts';
  const has = Boolean($('videoHubSearch')?.value);
  $('videoHubSearchClear')?.classList.toggle('hidden', !has); $('videoHubSearchKbd')?.classList.toggle('hidden', has);
  $('videoHubFilterAll')?.setAttribute('aria-pressed', String(!videoHubPinnedOnly)); $('videoHubFilterAll')?.classList.toggle('active', !videoHubPinnedOnly);
  $('videoHubFilterPinned')?.setAttribute('aria-pressed', String(videoHubPinnedOnly)); $('videoHubFilterPinned')?.classList.toggle('active', videoHubPinnedOnly);
}

function applyVideoHubSidebarState() {
  $('videoHubWorkspace')?.classList.toggle('is-collapsed', videoHubUi.collapsed);
  renderVideoHubWorkspaceChrome();
  scheduleVideoHubBrowserLayout();
}

function setVideoHubTab(tab) {
  if (tab !== 'studio' && tab !== 'accounts') return;
  videoHubActiveTab = tab;
  document.querySelectorAll('[data-video-hub-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.videoHubPanel !== tab);
  });
  renderVideoHubWorkspaceChrome();
  scheduleVideoHubBrowserLayout();
}
function openVideoHubTab(tab) { setVideoHubTab(tab); }

async function videoHubQuickAdd(providerId) {
  if (!videoHubProviderForId(providerId)) return;
  $('videoHubNewProvider').value = providerId;
  await addVideoHubAccount();
  if (videoHubData.activeAccountId) openVideoHubTab('studio');
}

// Sidebar controls are mounted by React after this host module may have evaluated.
document.addEventListener('input', (event) => {
  if (event.target?.id === 'videoHubSearch') applyVideoHubFilters();
});
document.addEventListener('keydown', (event) => {
  if (event.target?.id !== 'videoHubSearch') return;
  if (event.key === 'Escape' && event.target.value) { event.target.value = ''; applyVideoHubFilters(); event.stopPropagation(); }
  if (event.key === 'Enter') { const first = document.querySelector('#videoHubAccountList [data-video-hub-account]:not(.hidden) .account-btn'); if (first) first.click(); }
});
$('videoHubProviderTiles')?.addEventListener('click', (event) => {
  const tile = event.target.closest('[data-video-hub-provider-filter]'); if (!tile) return;
  videoHubUi.provider = tile.dataset.videoHubProviderFilter; saveVideoHubUi(); applyVideoHubFilters();
});
document.addEventListener('click', (event) => {
  if (event.target?.closest?.('#videoHubFilterAll')) { videoHubPinnedOnly = false; applyVideoHubFilters(); }
  if (event.target?.closest?.('#videoHubFilterPinned')) { videoHubPinnedOnly = true; applyVideoHubFilters(); }
  if (event.target?.closest?.('#videoHubSearchClear')) {
    const input = $('videoHubSearch');
    if (input) { input.value = ''; applyVideoHubFilters(); input.focus(); }
  }
});
const VIDEO_HUB_STAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
function toggleVideoHubPin(id) {
  videoHubUi.pinned = videoHubUi.pinned.includes(id) ? videoHubUi.pinned.filter((x) => x !== id) : [id, ...videoHubUi.pinned];
  saveVideoHubUi(); renderVideoHub();
}
function openVideoHubAccountMenu(id, x, y) {
  const account = videoHubAccountForId(id); if (!account) return;
  const pinned = videoHubUi.pinned.includes(id);
  const items = [];
  if (id !== videoHubData.activeAccountId) items.push({ icon: ICON.arrowRight, label: 'Open', run: () => videoHubAccountAction('activate', id) });
  items.push({ icon: VIDEO_HUB_STAR_ICON, label: pinned ? 'Unpin' : 'Pin to top', run: () => toggleVideoHubPin(id) });
  items.push({ icon: ICON.rename, label: 'Rename', run: () => videoHubAccountAction('rename', id) });
  items.push({ icon: ICON.refresh, label: 'Reset login', run: () => videoHubAccountAction('reset', id) });
  items.push({ sep: true });
  items.push({ icon: ICON.trash, label: 'Delete account', danger: true, run: () => videoHubAccountAction('delete', id) });
  showCtxMenu(items, x, y);
}
$('videoHubRecent')?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-video-hub-recent]'); if (chip) videoHubAccountAction('activate', chip.dataset.videoHubRecent);
});
function toggleVideoHubSidebar() { videoHubUi.collapsed = !videoHubUi.collapsed; saveVideoHubUi(); applyVideoHubSidebarState(); }
$('videoHubHideSidebarBtn')?.addEventListener('click', toggleVideoHubSidebar);
$('videoHubSearchClear')?.addEventListener('click', () => { $('videoHubSearch').value = ''; applyVideoHubFilters(); $('videoHubSearch').focus(); });
$('videoHubSiteGrid')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-video-hub-quick-add]'); if (!btn) return;
  btn.disabled = true;
  videoHubQuickAdd(btn.dataset.videoHubQuickAdd).catch((error) => showToast(error?.message || 'Could not add account.', true)).finally(() => { btn.disabled = false; });
});

window.addEventListener('resize', scheduleVideoHubBrowserLayout);
$('videoHubScreen')?.addEventListener('scroll', scheduleVideoHubBrowserLayout, { passive: true });
window.addEventListener('scroll', scheduleVideoHubBrowserLayout, { passive: true, capture: true });
const videoHubLayoutObserver = new ResizeObserver(() => scheduleVideoHubBrowserLayout());
const videoHubSlot = $('videoHubBrowserSlot'); if (videoHubSlot) videoHubLayoutObserver.observe(videoHubSlot);

const IMAGE_HUB_BUILTINS = [
  { id:'bing-create', name:'Bing Image Creator', url:'https://www.bing.com/images/create', category:'generate', desc:'Prompt-based image generation', glyph:'✦' },
  { id:'adobe-firefly', name:'Adobe Firefly', url:'https://firefly.adobe.com/', category:'generate', desc:'Generate images and creative assets', glyph:'✺' },
  { id:'ideogram', name:'Ideogram', url:'https://ideogram.ai/', category:'generate', desc:'Image generation with strong typography', glyph:'I' },
  { id:'leonardo', name:'Leonardo AI', url:'https://leonardo.ai/', category:'generate', desc:'Create and iterate on visual concepts', glyph:'◈' },
  { id:'playground', name:'Playground', url:'https://playground.com/', category:'generate', desc:'Explore AI image creation', glyph:'▧' },
  { id:'canva', name:'Canva Magic Studio', url:'https://www.canva.com/ai-image-generator/', category:'edit', desc:'Create and edit designs with AI', glyph:'C' },
  { id:'clipdrop', name:'Clipdrop', url:'https://clipdrop.co/', category:'edit', desc:'Cleanup, relight and transform images', glyph:'◉' },
  { id:'photoroom', name:'PhotoRoom', url:'https://www.photoroom.com/', category:'edit', desc:'Background removal and product imagery', glyph:'▣' },
  { id:'upscale-media', name:'Upscale.media', url:'https://www.upscale.media/', category:'upscale', desc:'Increase image resolution', glyph:'↗' },
  { id:'letsenhance', name:'Let’s Enhance', url:'https://letsenhance.io/', category:'upscale', desc:'Enhance and upscale image quality', glyph:'⤢' },
];
let imageHubFilter = 'all';
let imageHubProviderFilter = 'all';
let imageHubSettingsReturnFocus = null;
let imageHubSearchQuery = '';
let imageHubBrowserErrored = false;
let imageHubBrowserStateModel = { kind: 'empty', title: 'Your image studio opens here', message: 'Add an account, pick a tool from the sidebar, and sign in as usual. Each account keeps its own separate login.' };
let imageHubSidebarChromeModel = { search: '', listTitle: 'All accounts', accountCountLabel: '0 accounts', collapsed: false, notificationCount: 0 };
let imageHubActiveAccount = '';
let imageHubCurrentUrl = '';
let imageHubCurrentTitle = '';
let imageHubLoading = false;
let imageHubNativeBrowserAvailable = false;
let imageHubBrowserCanGoBack = false;
let imageHubBrowserCanGoForward = false;
let imageHubBrowserLayoutFrame = 0;
let lastImageHubBrowserLayoutKey = '';
let imageHubOpeningAccountId = '';
let imageHubActiveTab = 'studio';
let imageHubReactRenderer = null;
let imageHubDiscoveryReactRenderer = null;
const IMAGE_HUB_UI_KEY = 'madstation.imageHub.ui.v1';
function imageHubLoad(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; } }
function imageHubSave(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
let imageHubUi = { collapsed: Boolean(imageHubLoad(IMAGE_HUB_UI_KEY, {}).collapsed) };
let imageHubAccountsRenderSig = '';
function imageHubTools() { return [...IMAGE_HUB_BUILTINS, ...imageHubLoad('madstation.imageHub.custom.v1', [])]; }
function imageHubProvider(id) { return imageHubTools().find((t) => t.id === id) || null; }
function imageHubAccountsLoad() { return imageHubLoad('madstation.imageHub.accounts.v1', []); }
function imageHubAccountsSave(accounts) { imageHubSave('madstation.imageHub.accounts.v1', accounts); }
function imageHubActive() { return imageHubAccountsLoad().find((a) => a.id === imageHubActiveAccount) || null; }
function imageHubParts(url) {
  try { const u = new URL(url); return { secure: u.protocol === 'https:', host: u.hostname.replace(/^www\./, ''), rest: `${u.pathname === '/' ? '' : u.pathname}${u.search}` }; }
  catch { return null; }
}

// Default accounts: one per built-in provider, created once so the sidebar has real
// accounts with provider icons to preview. Users can add more from the Add Account tab.
function imageHubSeedDefaults() {
  if (imageHubLoad('madstation.imageHub.seeded.v1', false)) return;
  const accounts = imageHubAccountsLoad();
  for (const p of IMAGE_HUB_BUILTINS) {
    if (!accounts.some((a) => a.providerId === p.id)) accounts.push({ id: `account-${p.id}`, name: p.name, providerId: p.id, url: p.url });
  }
  imageHubAccountsSave(accounts);
  imageHubSave('madstation.imageHub.seeded.v1', true);
}

// Provider icon chain: same fallback approach as Video Hub (site favicon, root-domain
// favicon, two favicon services, then the shared default icon).
function imageHubIconCandidates(item) {
  const provider = item?.providerId ? imageHubProvider(item.providerId) : item;
  const url = String(provider?.url || item?.url || '').trim();
  const saved = String(provider?.icon || item?.icon || '').trim();
  const list = [];
  if (saved) list.push(saved);
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const root = hostname.replace(/^(?:app|studio|www|create|firefly|labs)\./, '');
    list.push(`${parsed.origin}/favicon.ico`);
    if (root && root !== hostname) list.push(`https://${root}/favicon.ico`);
    if (root) list.push(`https://icons.duckduckgo.com/ip3/${root}.ico`);
    list.push(`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`);
  } catch { /* the default icon is appended by iconMarkup */ }
  return [...new Set(list.filter(Boolean))];
}
function imageHubIconMarkup(item, extraClass = '') {
  const c = imageHubIconCandidates(item);
  return iconMarkup(c[0] || '', `image-hub-real-icon ${extraClass}`.trim(), c.slice(1));
}

function imageHubUpdateToolbar() {
  const account = imageHubActive();
  const parts = imageHubParts(imageHubCurrentUrl);
  const has = Boolean(account && imageHubNativeBrowserAvailable);
  const model = {
    activeAccountId: account ? String(account.id || '') : '',
    activeAccountName: account ? String(account.name || 'Unnamed account') : '',
    iconCandidates: account ? imageHubSafeIconCandidates(account) : [],
    siteHost: parts?.host || '',
    siteRest: parts?.rest || '',
    siteTitle: imageHubCurrentTitle ? `${imageHubCurrentTitle} — ${imageHubCurrentUrl}` : (imageHubCurrentUrl || ''),
    secure: parts ? parts.secure : null,
    canGoBack: has && imageHubBrowserCanGoBack,
    canGoForward: has && imageHubBrowserCanGoForward,
    canReload: has,
    loading: Boolean(imageHubLoading),
    canOpenExternal: has && /^https:\/\//i.test(imageHubCurrentUrl),
  };
  window.dispatchEvent(new CustomEvent('madstation:image-hub-toolbar-state', { detail: model }));
}
window.MadStationImageHubToolbar = {
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
};
window.addEventListener('madstation:image-hub-toolbar-mounted', () => imageHubUpdateToolbar());
window.addEventListener('madstation:image-hub-toolbar-action', (event) => {
  const action = event?.detail?.action;
  if (!['back', 'forward', 'reload', 'stop', 'open-external'].includes(action) || !imageHubNativeBrowserAvailable) return;
  Promise.resolve(window.aiHub.imageHubBrowserNavigate(action)).then((result) => {
    if (result?.ok === false) showToast(result.error || 'Could not control the Image Hub browser.', true);
  }).catch((error) => showToast(error?.message || 'Could not control the Image Hub browser.', true));
});
window.aiHub.onImageHubBrowserState((snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return;
  const accountId = typeof snapshot.accountId === 'string' ? snapshot.accountId : '';
  if (accountId && imageHubActiveAccount && accountId !== imageHubActiveAccount) return;
  // Empty state events are sent when an old account view closes. Do not let that
  // teardown overwrite the selected account's loading/error message.
  if (!accountId && imageHubActiveAccount && snapshot.hasBrowserView === false) {
    imageHubNativeBrowserAvailable = false;
    imageHubBrowserCanGoBack = false;
    imageHubBrowserCanGoForward = false;
    imageHubUpdateToolbar();
    return;
  }
  imageHubNativeBrowserAvailable = snapshot.hasBrowserView === true;
  imageHubBrowserCanGoBack = snapshot.canGoBack === true;
  imageHubBrowserCanGoForward = snapshot.canGoForward === true;
  imageHubLoading = snapshot.loading === true;
  if (typeof snapshot.url === 'string' && imageHubSafeHttpsUrl(snapshot.url)) imageHubCurrentUrl = imageHubSafeHttpsUrl(snapshot.url);
  if (typeof snapshot.title === 'string') imageHubCurrentTitle = snapshot.title.slice(0, 240);
  const error = typeof snapshot.error === 'string' ? snapshot.error : '';
  if (error) {
    imageHubBrowserErrored = true;
    imageHubSetBrowserState('error', 'This page could not be loaded', error);
  } else if (imageHubLoading) {
    imageHubBrowserErrored = false;
    imageHubSetBrowserState('loading', 'Loading image studio…', 'Connecting to the selected image tool.');
  } else if (imageHubNativeBrowserAvailable) {
    imageHubBrowserErrored = false;
    imageHubSetBrowserState('ready', '', '');
  }
  imageHubUpdateToolbar();
  scheduleImageHubBrowserLayout();
});

// Sidebar presentation is React-owned after the React entry attaches. The legacy
// renderer remains the view-model owner so filtering, saved settings, and session
// lifecycle stay unchanged during this staged migration.
function imageHubSafeIconCandidates(item) {
  const candidates = imageHubIconCandidates(item).filter(isImageIcon);
  if (!candidates.includes(DEFAULT_ICON_DATA_URL)) candidates.push(DEFAULT_ICON_DATA_URL);
  return candidates;
}

function imageHubSidebarViewModel(accounts, shown, counts, query, accountView) {
  const searchText = imageHubSearchQuery.trim();
  const providers = [
    { id: 'all', name: 'All', count: accounts.length, iconKind: 'grid', iconCandidates: [] },
    ...imageHubTools().filter((provider) => counts.has(provider.id)).map((provider) => ({
      id: provider.id,
      name: String(provider.name || provider.id),
      count: counts.get(provider.id) || 0,
      iconKind: 'image',
      iconCandidates: imageHubSafeIconCandidates(provider),
    })),
  ];
  const rows = shown.map((account) => {
    const provider = account.providerId ? imageHubProvider(account.providerId) : null;
    return {
      id: String(account.id),
      name: String(account.name || 'Unnamed account'),
      providerName: String(provider?.name || imageHubParts(account.url || '')?.host || 'Custom site'),
      active: account.id === imageHubActiveAccount,
      iconCandidates: imageHubSafeIconCandidates(account),
    };
  });
  const listTitle = query
    ? `Results for “${searchText}”`
    : imageHubProviderFilter !== 'all'
      ? `${imageHubProvider(imageHubProviderFilter)?.name || 'Tool'} accounts`
      : 'All accounts';
  const accountCountLabel = `${shown.length === accounts.length ? accounts.length : `${shown.length} of ${accounts.length}`} account${accounts.length === 1 ? '' : 's'}`;
  const emptyMessage = !accounts.length
    ? 'No accounts yet. Use the Add Account tab to create one.'
    : !shown.length
      ? 'No accounts match this filter.'
      : '';
  return {
    providerFilter: imageHubProviderFilter,
    providers,
    accounts: rows,
    accountView,
    accountCountLabel,
    listTitle,
    emptyMessage,
    listAriaLabel: accountView === 'list' ? 'Image Hub accounts, list view' : 'Image Hub accounts, icon grid view',
  };
}

function imageHubRenderAccounts() {
  const host = $('imageHubAccountList'), tiles = $('imageHubProviderTiles'); if (!host || !tiles) return;
  const accounts = imageHubAccountsLoad();
  const savedView = imageHubLoad('madstation.imageHub.settings.v1', {});
  const accountView = savedView.accountView === 'grid' ? 'grid' : 'list';
  host.classList.toggle('is-list-view', accountView === 'list');
  host.classList.toggle('image-hub-grid-view', accountView === 'grid');
  host.dataset.view = accountView;
  host.setAttribute('aria-label', accountView === 'list' ? 'Image Hub accounts, list view' : 'Image Hub accounts, icon grid view');
  if (!accounts.some((a) => a.id === imageHubActiveAccount)) imageHubActiveAccount = accounts[0]?.id || '';
  const counts = new Map();
  accounts.forEach((a) => counts.set(a.providerId || '', (counts.get(a.providerId || '') || 0) + 1));
  if (imageHubProviderFilter !== 'all' && !counts.has(imageHubProviderFilter)) imageHubProviderFilter = 'all';
  const searchText = imageHubSearchQuery.trim();
  const query = searchText.toLowerCase();
  const shown = accounts.filter((a) => {
    const p = a.providerId ? imageHubProvider(a.providerId) : null;
    if (imageHubProviderFilter !== 'all' && a.providerId !== imageHubProviderFilter) return false;
    if (imageHubFilter !== 'all' && p?.category !== imageHubFilter) return false;
    return !query || `${a.name} ${p?.name || ''} ${a.url || ''}`.toLowerCase().includes(query);
  });
  const model = imageHubSidebarViewModel(accounts, shown, counts, query, accountView);
  imageHubSidebarChromeModel = { ...imageHubSidebarChromeModel, search: imageHubSearchQuery, listTitle: model.listTitle, accountCountLabel: model.accountCountLabel };
  imageHubPublishSidebarChrome();
  tiles.setAttribute('role', 'tablist');
  if (typeof imageHubReactRenderer === 'function') {
    imageHubReactRenderer(model);
    imageHubUpdateToolbar();
    return;
  }

  // Startup fallback: the controller may render once before the deferred React
  // entry attaches. After attach, this branch is never used and React exclusively
  // owns children of #imageHubProviderTiles and #imageHubAccountList.
  const tile = (id, label, count, glyph) => `<button class="tile${imageHubProviderFilter === id ? ' selected' : ''}" type="button" role="tab" title="${escapeHtml(label)} · ${count} account${count === 1 ? '' : 's'}" aria-label="${escapeHtml(label)} · ${count} account${count === 1 ? '' : 's'}" data-image-provider-filter="${escapeHtml(id)}" aria-selected="${imageHubProviderFilter === id}"><span class="tile-icon">${glyph}</span><span class="tile-label">${escapeHtml(label)}</span><span class="tile-count">${count}</span></button>`;
  const sig = JSON.stringify([imageHubProviderFilter, accounts.length, [...counts.entries()], imageHubTools().map((t) => [t.id, t.name, t.url])]);
  if (tiles.dataset.sig !== sig) {
    tiles.dataset.sig = sig;
    tiles.innerHTML = tile('all', 'All', accounts.length, ICON.grid) + imageHubTools().filter((p) => counts.has(p.id)).map((p) => tile(p.id, p.name, counts.get(p.id), imageHubIconMarkup(p))).join('');
    bindIconFallbacks(tiles);
  }
  if (!accounts.length) host.innerHTML = '<div class="ms-empty">No accounts yet. Use the Add Account tab to create one.</div>';
  else if (!shown.length) host.innerHTML = '<div class="ms-empty">No accounts match this filter.</div>';
  else {
    const renderSig = JSON.stringify([imageHubProviderFilter, $('imageHubSearch')?.value || '', shown.map((a) => [a.id, a.name, a.providerId, a.url]), imageHubTools().map((t) => [t.id, t.name, t.url])]);
    if (host.dataset.renderSig !== renderSig) {
      host.dataset.renderSig = renderSig;
      host.innerHTML = shown.map((a) => {
        const active = a.id === imageHubActiveAccount;
        const p = a.providerId ? imageHubProvider(a.providerId) : null;
        const sub = p?.name || imageHubParts(a.url || '')?.host || 'Custom site';
        return `<div class="account-row image-hub-tile${active ? ' active' : ''}" role="listitem" data-image-hub-account="${escapeHtml(a.id)}"><button type="button" class="account-btn" data-image-account="${escapeHtml(a.id)}" aria-label="${escapeHtml(a.name)} · ${escapeHtml(sub)}${active ? ' · Active account' : ' · Open account'}"${active ? ' aria-current="true"' : ''}><span class="account-icon">${imageHubIconMarkup(a)}</span><span class="image-hub-account-labels"><span class="image-hub-account-name-line"><strong class="image-hub-account-name">${escapeHtml(a.name)}</strong></span><span class="image-hub-account-provider">${escapeHtml(sub)}</span></span>${active ? '<span class="image-hub-row-active">Active</span>' : ''}</button></div>`;
      }).join('');
      bindIconFallbacks(host);
    }
    imageHubUpdateAccountSelection();
  }
  imageHubUpdateToolbar();
}

window.MadStationImageHubSidebar = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    imageHubReactRenderer = renderer;
    imageHubRenderAccounts();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
  setProviderFilter(providerId) {
    if (typeof providerId !== 'string') return;
    if (providerId !== 'all' && !imageHubProvider(providerId)) return;
    imageHubProviderFilter = providerId;
    imageHubRenderAccounts();
  },
};

function imageHubSwitchAccount(id) {
  const account = imageHubAccountsLoad().find((a) => a.id === id); if (!account) return;
  const url = account.url || imageHubProvider(account.providerId)?.url || '';
  imageHubActiveAccount = id; imageHubCurrentUrl = url; imageHubCurrentTitle = ''; imageHubLoading = false;
  imageHubSetTab('studio');
  if (url) imageHubMountBrowser(account, url); else imageHubClearBrowser();
  imageHubRender(); imageHubUpdateAccountSelection();
}
function imageHubUpdateAccountSelection() {
  if (typeof imageHubReactRenderer === 'function') { imageHubRenderAccounts(); return; }
  document.querySelectorAll('#imageHubAccountList [data-image-account]').forEach((button) => {
    const active = button.dataset.imageAccount === imageHubActiveAccount;
    button.closest('.account-row')?.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'true' : 'false');
    const badge = button.querySelector('.image-hub-row-active');
    if (active && !badge) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'image-hub-row-active';
      activeBadge.textContent = 'Active';
      button.append(activeBadge);
    } else if (!active) badge?.remove();
  });
}
function imageHubSetBrowserState(kind, title, message) {
  const allowed = ['empty', 'loading', 'ready', 'error'];
  imageHubBrowserStateModel = {
    kind: allowed.includes(kind) ? kind : 'empty',
    title: String(title || '').slice(0, 160),
    message: String(message || '').slice(0, 500),
  };
  window.dispatchEvent(new CustomEvent('madstation:image-hub-browser-state', { detail: imageHubBrowserStateModel }));
}
window.addEventListener('madstation:image-hub-browser-state-mounted', () => {
  window.dispatchEvent(new CustomEvent('madstation:image-hub-browser-state', { detail: imageHubBrowserStateModel }));
});
window.addEventListener('madstation:image-hub-browser-state-action', (event) => {
  if (event?.detail?.type !== 'retry') return;
  const account = imageHubActive();
  if (!account) { imageHubClearBrowser(); return; }
  imageHubSwitchAccount(account.id);
});
function imageHubClearBrowser() {
  imageHubNativeBrowserAvailable = false;
  imageHubBrowserCanGoBack = false;
  imageHubBrowserCanGoForward = false;
  imageHubLoading = false;
  imageHubBrowserErrored = false;
  imageHubCurrentUrl = '';
  imageHubCurrentTitle = '';
  lastImageHubBrowserLayoutKey = '';
  void window.aiHub.imageHubBrowserSuspend().catch(() => {});
  imageHubSetBrowserState('empty', 'Your image studio opens here', 'Select an account in the sidebar, sign in, and use the site normally. Each account keeps its own separate login.');
  imageHubUpdateToolbar();
}
function imageHubSafeHttpsUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch { return ''; }
}
function imageHubMountBrowser(account, rawUrl) {
  const safeUrl = imageHubSafeHttpsUrl(String(rawUrl || ''));
  if (!safeUrl) {
    imageHubNativeBrowserAvailable = false;
    imageHubLoading = false;
    imageHubBrowserErrored = true;
    imageHubCurrentUrl = '';
    imageHubCurrentTitle = '';
    imageHubSetBrowserState('error', 'Only HTTPS sites can be opened', 'Choose a valid HTTPS image tool to continue.');
    void window.aiHub.imageHubBrowserSuspend().catch(() => {});
    imageHubUpdateToolbar();
    return showToast('Only HTTPS websites can be opened here.', true);
  }
  imageHubBrowserErrored = false;
  imageHubNativeBrowserAvailable = false;
  imageHubBrowserCanGoBack = false;
  imageHubBrowserCanGoForward = false;
  imageHubLoading = true;
  imageHubCurrentUrl = safeUrl;
  imageHubCurrentTitle = '';
  imageHubSetBrowserState('loading', 'Loading image studio…', 'Connecting to the selected image tool.');
  account.url = safeUrl;
  imageHubAccountsSave(imageHubAccountsLoad().map((entry) => (entry.id === account.id ? account : entry)));
  imageHubUpdateToolbar();
  scheduleImageHubBrowserLayout();
  if (imageHubOpeningAccountId === account.id) return;
  imageHubOpeningAccountId = account.id;
  void window.aiHub.imageHubBrowserOpen({ accountId: account.id, providerId: account.providerId, name: account.name, url: safeUrl })
    .then((result) => {
      if (imageHubActiveAccount !== account.id) return;
      if (!result || result.ok === false) {
        imageHubNativeBrowserAvailable = false;
        imageHubLoading = false;
        imageHubBrowserErrored = true;
        imageHubSetBrowserState('error', 'Image Hub could not open this browser', typeof result?.error === 'string' ? result.error : 'Select the account again to retry.');
        imageHubUpdateToolbar();
        return;
      }
      imageHubNativeBrowserAvailable = result.hasBrowserView === true;
      imageHubBrowserCanGoBack = result.canGoBack === true;
      imageHubBrowserCanGoForward = result.canGoForward === true;
      imageHubLoading = result.loading !== false;
      if (typeof result.url === 'string' && imageHubSafeHttpsUrl(result.url)) imageHubCurrentUrl = imageHubSafeHttpsUrl(result.url);
      if (typeof result.title === 'string') imageHubCurrentTitle = result.title;
      if (typeof result.error === 'string' && result.error) imageHubSetBrowserState('error', 'This page could not be loaded', result.error);
      else if (imageHubLoading) imageHubSetBrowserState('loading', 'Loading image studio…', 'Connecting to the selected image tool.');
      else if (imageHubNativeBrowserAvailable) imageHubSetBrowserState('ready', '', '');
      imageHubUpdateToolbar();
      scheduleImageHubBrowserLayout();
    })
    .catch((error) => {
      if (imageHubActiveAccount !== account.id) return;
      imageHubNativeBrowserAvailable = false;
      imageHubLoading = false;
      imageHubBrowserErrored = true;
      imageHubSetBrowserState('error', 'Image Hub could not open this browser', error?.message || 'Select the account again to retry.');
      imageHubUpdateToolbar();
    })
    .finally(() => { if (imageHubOpeningAccountId === account.id) imageHubOpeningAccountId = ''; });
}
function imageHubAddAccount(providerId, rawName) {
  const provider = imageHubProvider(providerId);
  if (!provider) return showToast('Choose an image tool first.', true);
  const accounts = imageHubAccountsLoad();
  const same = accounts.filter((a) => a.providerId === provider.id).length;
  const name = String(rawName || '').trim().slice(0, 60) || (same ? `${provider.name} ${same + 1}` : provider.name);
  const account = { id: `account-${Date.now()}`, name, providerId: provider.id, url: provider.url };
  accounts.push(account); imageHubAccountsSave(accounts);
  imageHubSwitchAccount(account.id);
  showToast(`${name} added.`);
}
function imageHubPublishWorkspaceChrome() {
  window.dispatchEvent(new CustomEvent('madstation:image-hub-workspace-chrome-state', {
    detail: { tab: imageHubActiveTab, collapsed: Boolean(imageHubUi.collapsed) },
  }));
}
function imageHubSetTab(tab) {
  if (tab !== 'studio' && tab !== 'accounts') return;
  imageHubActiveTab = tab;
  document.querySelectorAll('[data-image-hub-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.imageHubPanel !== tab));
  imageHubPublishWorkspaceChrome();
  scheduleImageHubBrowserLayout();
}

function updateImageHubBrowserLayout() {
  if (currentApp !== 'image-hub' || $('imageHubScreen')?.classList.contains('hidden')) return;
  const clip = $('imageHubScreen')?.getBoundingClientRect();
  const slot = $('imageHubBrowserSlot');
  if (!clip || !slot) return;
  const r = slot.getBoundingClientRect();
  const x1 = Math.max(r.left, clip.left), y1 = Math.max(r.top, clip.top), x2 = Math.min(r.right, clip.right), y2 = Math.min(r.bottom, clip.bottom);
  const main = imageHubActiveTab !== 'studio' || x2 - x1 < 8 || y2 - y1 < 8
    ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  const key = JSON.stringify(main, (_k, value) => typeof value === 'number' ? Math.round(value) : value);
  if (key === lastImageHubBrowserLayoutKey) return;
  lastImageHubBrowserLayoutKey = key;
  Promise.resolve(window.aiHub.imageHubBrowserSetLayout({ main })).then((result) => {
    if (!result || result.ok === false) lastImageHubBrowserLayoutKey = '';
  }).catch(() => { lastImageHubBrowserLayoutKey = ''; });
}
function scheduleImageHubBrowserLayout() {
  if (imageHubBrowserLayoutFrame) return;
  imageHubBrowserLayoutFrame = requestAnimationFrame(() => { imageHubBrowserLayoutFrame = 0; updateImageHubBrowserLayout(); });
}
window.addEventListener('resize', scheduleImageHubBrowserLayout, { passive: true });
window.addEventListener('scroll', scheduleImageHubBrowserLayout, { passive: true, capture: true });
const imageHubLayoutObserver = new ResizeObserver(() => scheduleImageHubBrowserLayout());
const imageHubSlot = $('imageHubBrowserSlot'); if (imageHubSlot) imageHubLayoutObserver.observe(imageHubSlot);
function imageHubApplySidebar() {
  $('imageHubWorkspace')?.classList.toggle('is-collapsed', imageHubUi.collapsed);
  imageHubPublishWorkspaceChrome();
  imageHubPublishSidebarChrome();
}
function imageHubHandleWorkspaceChromeAction(event) {
  const detail = event?.detail;
  if (!detail || typeof detail !== 'object') return;
  if (detail.type === 'select-tab' && (detail.tab === 'studio' || detail.tab === 'accounts')) imageHubSetTab(detail.tab);
  else if (detail.type === 'toggle-sidebar') imageHubToggleSidebar();
}
window.addEventListener('madstation:image-hub-workspace-chrome-mounted', imageHubPublishWorkspaceChrome);
function imageHubToggleSidebar() { imageHubUi.collapsed = !imageHubUi.collapsed; imageHubSave(IMAGE_HUB_UI_KEY, imageHubUi); imageHubApplySidebar(); }
function imageHubPublishSidebarChrome() {
  const snapshot = {
    ...imageHubSidebarChromeModel,
    search: imageHubSearchQuery,
    collapsed: Boolean(imageHubUi.collapsed),
    notificationCount: Array.isArray(notifications) ? notifications.length : 0,
  };
  window.dispatchEvent(new CustomEvent('madstation:image-hub-sidebar-chrome-state', { detail: snapshot }));
}
function imageHubSearchUi() { imageHubPublishSidebarChrome(); }
function imageHubHandleSidebarChromeAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'search') {
    if (typeof action.value !== 'string') return;
    imageHubSearchQuery = action.value.slice(0, 200);
    imageHubRender(); imageHubRenderAccounts();
    return;
  }
  if (action.type === 'settings') { openImageHubSettings(); return; }
  if (action.type === 'notifications') { void openNotifications($('imageHubNotificationsBtn')); return; }
  if (action.type === 'toggle-sidebar') { imageHubToggleSidebar(); return; }
  if (action.type === 'back') void goToLauncher();
  if (action.type === 'open-first-result') { document.querySelector('#imageHubAccountList [data-image-account]')?.click(); return; }
}
window.addEventListener('madstation:image-hub-sidebar-chrome-mounted', imageHubPublishSidebarChrome);
// Image Hub discovery is React-owned. This host computes a serializable model and
// validates bounded actions; React never reads localStorage or calls the preload API.
function imageHubDiscoveryViewModel() {
  const tools = imageHubTools();
  const favoritesRaw = imageHubLoad('madstation.imageHub.favorites.v1', []);
  const favorites = Array.isArray(favoritesRaw) ? favoritesRaw.filter((id) => typeof id === 'string') : [];
  const settingsRaw = imageHubLoad('madstation.imageHub.settings.v1', { favoritesFirst: true, confirmRemove: true });
  const settings = settingsRaw && typeof settingsRaw === 'object' && !Array.isArray(settingsRaw) ? settingsRaw : {};
  const query = imageHubSearchQuery.trim().toLowerCase();
  const filtered = tools.filter((tool) => {
    const category = ['generate', 'edit', 'upscale'].includes(tool.category) ? tool.category : 'generate';
    return (imageHubFilter === 'all' || category === imageHubFilter)
      && `${tool.name || ''} ${tool.desc || ''} ${tool.url || ''}`.toLowerCase().includes(query);
  });
  if (settings.favoritesFirst !== false) filtered.sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  const counts = new Map();
  imageHubAccountsLoad().forEach((account) => counts.set(account.providerId, (counts.get(account.providerId) || 0) + 1));
  return {
    categoryFilter: ['all', 'generate', 'edit', 'upscale'].includes(imageHubFilter) ? imageHubFilter : 'all',
    toolCountLabel: `${tools.length} tools`,
    tools: filtered.map((tool) => ({
      id: String(tool.id),
      name: String(tool.name || 'Unnamed tool'),
      url: String(tool.url || ''),
      category: ['edit', 'upscale'].includes(tool.category) ? tool.category : 'generate',
      description: String(tool.desc || tool.url || ''),
      custom: tool.custom === true,
      favorite: favorites.includes(tool.id),
      accountCount: counts.get(tool.id) || 0,
      iconCandidates: imageHubSafeIconCandidates(tool),
    })),
    providers: tools.map((tool) => ({ id: String(tool.id), name: String(tool.name || tool.id) })),
    confirmRemove: settings.confirmRemove !== false,
  };
}

function imageHubRender() {
  if (typeof imageHubDiscoveryReactRenderer !== 'function') return;
  imageHubDiscoveryReactRenderer(imageHubDiscoveryViewModel());
}

window.MadStationImageHubDiscovery = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    imageHubDiscoveryReactRenderer = renderer;
    imageHubRender();
  },
  bindIconFallbacks(root) {
    if (root instanceof Element) bindIconFallbacks(root);
  },
};

function imageHubHandleDiscoveryAction(event) {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string') return;
  if (action.type === 'category') {
    if (!['all', 'generate', 'edit', 'upscale'].includes(action.category)) return;
    imageHubFilter = action.category;
    imageHubRender();
    imageHubRenderAccounts();
    return;
  }
  if (action.type === 'toggle-favorite') {
    if (typeof action.id !== 'string' || !imageHubTools().some((tool) => tool.id === action.id)) return;
    const saved = imageHubLoad('madstation.imageHub.favorites.v1', []);
    const favorites = Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
    const next = favorites.includes(action.id) ? favorites.filter((id) => id !== action.id) : [...favorites, action.id];
    imageHubSave('madstation.imageHub.favorites.v1', next);
    imageHubRender();
    return;
  }
  if (action.type === 'add-account') {
    if (typeof action.providerId !== 'string' || action.providerId.length > 100 || typeof action.name !== 'string') return;
    if (action.name.length > 60) return;
    if (!imageHubProvider(action.providerId)) return showToast('Choose an image tool first.', true);
    imageHubAddAccount(action.providerId, action.name);
    imageHubRender();
    return;
  }
  if (action.type === 'add-custom-tool') {
    if (typeof action.name !== 'string' || typeof action.url !== 'string') return;
    const name = action.name.trim().slice(0, 60);
    if (!name || action.url.length > 2048) return showToast('Enter a tool name and valid HTTPS website URL.', true);
    let parsed;
    try { parsed = new URL(action.url.trim()); } catch { return showToast('Enter a valid HTTPS website URL.', true); }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return showToast('Enter a valid HTTPS website URL.', true);
    const custom = imageHubLoad('madstation.imageHub.custom.v1', []);
    const items = Array.isArray(custom) ? custom.filter((tool) => tool && typeof tool.id === 'string') : [];
    let id = `custom-${Date.now().toString(36)}`;
    let suffix = 1;
    while (imageHubTools().some((tool) => tool.id === id)) id = `custom-${Date.now().toString(36)}-${suffix++}`;
    items.push({ id, name, url: parsed.href, category: 'generate', desc: 'Custom image tool', custom: true });
    imageHubSave('madstation.imageHub.custom.v1', items);
    imageHubRender();
    imageHubRenderAccounts();
    showToast('Image tool added.');
    return;
  }
  if (action.type === 'remove-custom-tool') {
    if (typeof action.id !== 'string') return;
    const currentTools = imageHubTools();
    const target = currentTools.find((tool) => tool.id === action.id);
    if (!target || target.custom !== true) return;
    const settings = imageHubLoad('madstation.imageHub.settings.v1', { confirmRemove: true });
    if (settings?.confirmRemove !== false && !window.confirm('Remove this custom image tool?')) return;
    const saved = imageHubLoad('madstation.imageHub.custom.v1', []);
    const custom = Array.isArray(saved) ? saved.filter((tool) => tool && tool.id !== action.id) : [];
    imageHubSave('madstation.imageHub.custom.v1', custom);
    imageHubRender();
    imageHubRenderAccounts();
  }
}

function imageHubCurrentSettings() {
  const saved = imageHubLoad('madstation.imageHub.settings.v1', {});
  const safe = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  return { favoritesFirst: safe.favoritesFirst !== false, confirmRemove: safe.confirmRemove !== false, accountView: safe.accountView === 'grid' ? 'grid' : 'list' };
}
function imageHubPublishSettings(visible) {
  const settings = imageHubCurrentSettings();
  window.dispatchEvent(new CustomEvent('madstation:image-hub-settings-state', { detail: { visible: visible === true, ...settings } }));
}
function openImageHubSettings() {
  const overlay = $('imageHubSettingsOverlay'); if (!overlay) return;
  imageHubSettingsReturnFocus = document.activeElement;
  overlay.classList.remove('hidden');
  imageHubPublishSettings(true);
  syncOverlayMode();
}
function closeImageHubSettings() {
  $('imageHubSettingsOverlay')?.classList.add('hidden');
  imageHubPublishSettings(false);
  const back = imageHubSettingsReturnFocus; imageHubSettingsReturnFocus = null;
  if (back?.isConnected && typeof back.focus === 'function') back.focus(); else $('imageHubSettingsBtn')?.focus();
  syncOverlayMode();
  scheduleImageHubBrowserLayout();
}
function commitImageHubSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
  const accountView = settings.accountView === 'grid' ? 'grid' : settings.accountView === 'list' ? 'list' : null;
  if (typeof settings.favoritesFirst !== 'boolean' || typeof settings.confirmRemove !== 'boolean' || !accountView) return;
  imageHubSave('madstation.imageHub.settings.v1', { favoritesFirst: settings.favoritesFirst, confirmRemove: settings.confirmRemove, accountView });
  closeImageHubSettings(); imageHubRender(); imageHubRenderAccounts(); showToast('Image Hub settings saved.');
}
window.addEventListener('madstation:image-hub-settings-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  if (action.type === 'close') closeImageHubSettings();
  else if (action.type === 'save') commitImageHubSettings(action.settings);
});
window.addEventListener('madstation:image-hub-settings-mounted', () => imageHubPublishSettings(!$('imageHubSettingsOverlay')?.classList.contains('hidden')));

let imageHubReady = false;
function initImageHub() {
  imageHubSeedDefaults();
  imageHubRender(); imageHubRenderAccounts(); imageHubApplySidebar(); imageHubSearchUi();
  if (imageHubReady) {
    scheduleImageHubBrowserLayout();
    const existing = imageHubActive();
    if (existing && !imageHubNativeBrowserAvailable) imageHubSwitchAccount(existing.id);
    return;
  }
  imageHubReady = true;
  window.addEventListener('madstation:image-hub-workspace-chrome-action', imageHubHandleWorkspaceChromeAction);
  window.addEventListener('madstation:image-hub-sidebar-chrome-action', imageHubHandleSidebarChromeAction);
  window.addEventListener('madstation:image-hub-discovery-action', imageHubHandleDiscoveryAction);
  imageHubSetTab(imageHubActiveTab);
  $('imageHubAccountList').onclick = (e) => {
    const b = e.target.closest('[data-image-account]'); if (!b) return;
    const id = b.dataset.imageAccount;
    if (id === imageHubActiveAccount && imageHubNativeBrowserAvailable) return;
    imageHubSwitchAccount(id);
  };
}

async function openWorkspaceApp(appId) {
  if (appId === 'image-hub') {
    currentApp = 'image-hub'; lastImageHubBrowserLayoutKey = ''; syncMemoryMonitor(); updateWorkspaceView();
    const switched = await window.aiHub.setWorkspaceApp('image-hub');
    if (switched?.ok === false) return showToast(switched.error || 'Could not open Image Hub.', true);
    initImageHub();
    const existing = imageHubActive();
    if (existing && !imageHubNativeBrowserAvailable && !imageHubOpeningAccountId) imageHubSwitchAccount(existing.id);
    scheduleImageHubBrowserLayout();
    return;
  }
  if (appId === 'video-hub') {
    currentApp = 'video-hub'; lastVideoHubBrowserLayoutKey = ''; videoHubUi.collapsed = videoHubSettings.startCollapsed; saveVideoHubUi(); syncMemoryMonitor(); updateWorkspaceView();
    const switched = await window.aiHub.setWorkspaceApp('video-hub');
    if (switched?.ok === false) return showToast(switched.error || 'Could not open Video Hub.', true);
    await loadVideoHubState(); openVideoHubTab(videoHubSettings.defaultTab); applyVideoHubSidebarState(); scheduleVideoHubBrowserLayout(); return;
  }
  if (appId === 'instruction-forge') { currentApp = 'instruction-forge'; syncMemoryMonitor(); updateWorkspaceView(); await window.aiHub.setWorkspaceApp('instruction-forge'); await initInstructionForge(); return; }
  if (appId === 'ai-lab') { currentApp = 'ai-lab'; syncMemoryMonitor(); updateWorkspaceView(); await window.aiHub.setWorkspaceApp('ai-lab'); await initAiLab(); return; }
  if (appId === 'ai-hub') { currentApp = 'ai-hub'; syncMemoryMonitor(); updateWorkspaceView(); const result = await window.aiHub.setWorkspaceApp('ai-hub'); if (result?.ok === false) return showToast(result.error || 'Could not open AI Hub.', true); await window.aiHub.setControlMode('app'); return; } if (appId === 'clipboard') { currentApp = 'clipboard'; syncMemoryMonitor(); updateWorkspaceView(); await window.aiHub.setControlMode('launcher'); renderClipboard(); updateClipboardComposer(); if (clipboardSettings.focusComposerOnOpen) requestAnimationFrame(() => $('clipboardInput')?.focus()); return; } await goToLauncher(); }
async function goToLauncher() { currentApp = 'launcher'; settingsReturnApp = 'launcher'; syncMemoryMonitor(); $('settingsScreen').classList.add('hidden'); closeNotifications(); updateWorkspaceView(); await window.aiHub.setWorkspaceApp('launcher'); }
function openAccountModal(providerId = '', accountId = null, forceTemporary = false, overrides = {}) {
  editingAccountId = accountId || null;
  const account = editingAccountId ? state.accounts.find((item) => item.id === editingAccountId) : null;
  const preferences = account?.preferences || {};
  const permissions = preferences.permissions || {};
  $('accountModalTitle').textContent = account ? 'Edit AI account' : 'Add an AI account';
  $('accountModalSubtitle').textContent = account ? 'Update the account details. Changing provider or URL clears this account’s saved session.' : 'Create a separate persistent session for this account.';
  const preferredServiceId = account?.serviceId || providerId || managementFormProviders()[0]?.id || '';
  const draft = {
    id: account?.id || null,
    name: account?.name || '',
    serviceId: preferredServiceId,
    url: account?.url || '',
    icon: account?.icon || '',
    shortcut: account?.shortcut || '',
    group: account?.group || '',
    tags: (account?.tags || []).join(', '),
    favorite: Boolean(account?.favorite),
    temporary: Boolean(account?.temporary),
    pageZoom: String(preferences.pageZoom || 100),
    openOnStartup: Boolean(preferences.openOnStartup),
    clearCacheOnExit: preferences.clearCacheOnExit === null || preferences.clearCacheOnExit === undefined ? 'inherit' : String(preferences.clearCacheOnExit),
    signOutOnExit: preferences.signOutOnExit === null || preferences.signOutOnExit === undefined ? 'inherit' : String(preferences.signOutOnExit),
    camera: typeof permissions.camera === 'boolean' ? String(permissions.camera) : 'inherit',
    microphone: typeof permissions.microphone === 'boolean' ? String(permissions.microphone) : 'inherit',
    notifications: typeof permissions.notifications === 'boolean' ? String(permissions.notifications) : 'inherit',
    fullscreen: typeof permissions.fullscreen === 'boolean' ? String(permissions.fullscreen) : 'inherit',
    allowRemoteIcons: state.settings?.security?.remoteIcons !== false,
    ...overrides,
  };
  $('accountModal').classList.remove('hidden');
  window.MadStationAiHubManagementForms?.openAccount(draft, managementFormProviders(), forceTemporary);
  requestAnimationFrame(() => document.getElementById('accountName')?.focus());
}
function closeAccountModal() {
  $('accountModal').classList.add('hidden');
  recordingShortcutTarget = null;
  editingAccountId = null;
}
function openProviderModal(providerId = '') {
  const service = providerId ? state.services.find((item) => item.id === providerId) : null;
  $('providerModalTitle').textContent = providerId ? 'Edit provider' : 'Add provider';
  const draft = {
    id: service?.id || null,
    name: service?.name || '',
    url: service?.url || '',
    icon: service?.icon || '',
    category: service?.category || '',
    loginUrl: service?.loginUrl || '',
    homepageUrl: service?.homepageUrl || service?.url || '',
    description: service?.description || '',
    authDomains: (service?.authDomains || []).join(', '),
    notes: service?.notes || '',
    iconCandidates: [...new Set([service?.icon, ...(Array.isArray(service?.iconCandidates) ? service.iconCandidates : []), DEFAULT_ICON_DATA_URL].filter(isImageIcon))],
    allowRemoteIcons: state.settings?.security?.remoteIcons !== false,
  };
  $('providerModal').classList.remove('hidden');
  window.MadStationAiHubManagementForms?.openProvider(draft);
  requestAnimationFrame(() => document.getElementById('providerName')?.focus());
}
function closeProviderModal() { $('providerModal').classList.add('hidden'); }
window.MadStationAiHubManagementFormsHost = {
  async saveAccount(id, payload) {
    const isEditing = Boolean(id);
    const result = isEditing ? await window.aiHub.updateAccount(id, payload) : await window.aiHub.addAccount(payload);
    if (!result?.ok) return { ok: false, error: result?.error || (isEditing ? 'Could not update the account.' : 'Could not create the account.') };
    closeAccountModal();
    showToast(isEditing ? 'Account updated.' : 'Account added.');
    render();
    return { ok: true };
  },
  async saveProvider(id, payload) {
    const isEditing = Boolean(id);
    const result = isEditing ? await window.aiHub.updateService(id, payload) : await window.aiHub.addService(payload);
    if (!result?.ok) return { ok: false, error: result?.error || 'Could not save provider.' };
    closeProviderModal();
    showToast(isEditing ? 'Provider updated.' : 'Provider added.');
    render();
    return { ok: true };
  },
  async verifyProvider(url) { return await window.aiHub.verifyProvider(url); },
  async chooseIcon() { return await window.aiHub.chooseIcon(); },
  cancelAccount() { closeAccountModal(); },
  cancelProvider() { closeProviderModal(); },
};
async function deleteProvider(id) { const service = state.services.find((s) => s.id === id); if (!service) return; const count = state.accounts.filter((a) => a.serviceId === id).length; const message = count ? `Delete ${service.name}? This will also delete ${count} account session${count === 1 ? '' : 's'} for this provider.` : `Delete ${service.name}?`; if (!window.confirm(message)) return; const result = await window.aiHub.deleteService(id); if (!result.ok) showToast(result.error || 'Could not delete provider.', true); else showToast(`${service.name} removed.`); }
function renameAccount(id) { openRenameModal(id); }
async function clearAccountCache(id) {
  const account = state.accounts.find((a) => a.id === id); if (!account) return;
  const result = await window.aiHub.clearAccountCache(id);
  showToast(result?.ok ? `${account.name} cache cleared.` : (result?.error || 'Could not clear the cache.'), !result?.ok);
}
async function clearAccountSiteData(id) {
  const account = state.accounts.find((a) => a.id === id); if (!account) return;
  if (!window.confirm(`Clear all website data for “${account.name}”?\n\nThis removes cookies, local storage, cache and saved login/session data. The account itself stays in your list.`)) return;
  const result = await window.aiHub.clearAccountSiteData(id);
  showToast(result?.ok ? `${account.name} site data cleared.` : (result?.error || 'Could not clear site data.'), !result?.ok);
}
async function deleteAccount(id) { const account = state.accounts.find((a) => a.id === id); if (!account) return; if (state.settings?.confirmAccountDeletion !== false && !window.confirm(`Delete “${account.name}” and clear its saved login/session?`)) return; const result = await window.aiHub.deleteAccount(id); if (!result.ok) showToast(result.error || 'Could not delete account.', true); }
function openShortcutEditor(id) { recordingShortcutTarget = id; renderShortcuts(); requestAnimationFrame(() => { const btn = document.querySelector(`[data-shortcut-id="${CSS.escape(id)}"]`); if (btn) btn.focus(); }); }
function eventToShortcut(event) { const modifiers = []; if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl'); if (event.altKey) modifiers.push('Alt'); if (event.shiftKey) modifiers.push('Shift'); let key = event.key; if (key === ' ') key = 'Space'; if (key === 'Escape') return ''; const map = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }; key = map[key] || key; if (!key || ['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null; if (key.length === 1) key = key.toUpperCase(); if (!modifiers.length) return null; return [...modifiers, key].join('+'); }
async function handleRecordingKey(event) { if (!recordingShortcutTarget) return; const shortcut = eventToShortcut(event); if (shortcut === null) return; event.preventDefault(); event.stopPropagation(); if (shortcut === '') { if (recordingShortcutTarget === '__new_account__') window.MadStationAiHubManagementForms?.setAccountShortcut(''); recordingShortcutTarget = null; renderShortcuts(); return; } if (recordingShortcutTarget === '__new_account__') { window.MadStationAiHubManagementForms?.setAccountShortcut(shortcut); recordingShortcutTarget = null; return; } const result = await window.aiHub.setAccountShortcut(recordingShortcutTarget, shortcut); if (!result.ok) showToast(result.error || 'Could not assign shortcut.', true); else showToast(`Shortcut ${shortcut} assigned.`); recordingShortcutTarget = null; render(); }

function publishAppearanceSettings() {
  window.dispatchEvent(new CustomEvent('madstation:appearance-settings', { detail: state.settings || {} }));
}
window.addEventListener('madstation:appearance-controls-ready', publishAppearanceSettings);
window.addEventListener('madstation:appearance-theme-mode', (event) => {
  const theme = event.detail;
  if (['dark', 'light', 'system'].includes(theme)) updateAppSettings({ theme });
});
window.addEventListener('madstation:appearance-accent', (event) => {
  const accent = event.detail;
  if (['blue', 'violet', 'pink', 'red', 'orange', 'green', 'teal'].includes(accent)) updateAppSettings({ accent });
});
window.addEventListener('madstation:appearance-custom-accent', (event) => {
  const accent = event.detail;
  if (typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent)) updateAppSettings({ accent: accent.toLowerCase() });
});
window.addEventListener('madstation:appearance-background-select', (event) => {
  const detail = event.detail;
  if (!detail || typeof detail !== 'object') return;
  const { style, id } = detail;
  const builtIns = ['plain', 'aurora', 'grid', 'spotlight', 'mesh', 'neon', 'parallax', 'dots', 'rings', 'hex', 'waves', 'diagonal', 'circuit', 'constellation', 'tiles'];
  if (style === 'custom') {
    if (typeof id === 'string' && Array.isArray(state.settings?.customBackgrounds) && state.settings.customBackgrounds.some((item) => item?.id === id)) {
      updateAppSettings({ backgroundStyle: 'custom', backgroundId: id });
    }
  } else if (typeof style === 'string' && builtIns.includes(style)) updateAppSettings({ backgroundStyle: style, backgroundId: '' });
});
window.addEventListener('madstation:appearance-background-remove', async (event) => {
  const id = event.detail;
  if (typeof id !== 'string' || !id || id.length > 120) return;
  try {
    const result = await window.aiHub.removeBackground?.(id);
    if (!result?.ok) return showToast(result?.error || 'Could not remove the background.', true);
    state.settings = result.settings;
    render();
    showToast('Background removed.');
  } catch { showToast('Could not remove the background.', true); }
});

async function updateAppSettings(patch) {
  const result = await window.aiHub.setAppSettings(patch);
  if (!result.ok) return showToast('Could not save setting.', true);
  state.settings = result.settings;
  render();
}

window.addEventListener('madstation:homepage-style-select', (event) => {
  const mode = event.detail;
  const allowedModes = ['legacy', 'v2', 'retro', 'retro-complex', 'parallax', 'parallax-big', 'galaxy', 'parallax-jungle', 'claymorphism', 'glass'];
  const isImportedMode = typeof mode === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(mode);
  if (typeof mode === 'string' && (allowedModes.includes(mode) || isImportedMode)) window.MadStationHomePage?.setMode(mode);
});

const REMAINING_APP_SETTING_CHOICES = {
  density: ['comfortable', 'compact'],
  cardSpacing: ['compact', 'comfortable', 'spacious'],
  borderSpacing: ['compact', 'comfortable', 'spacious'],
  pageZoom: [80, 90, 100, 110, 125, 150],
  surfaceStyle: ['solid', 'glass', 'elevated', 'frosted'],
  cornerStyle: ['soft', 'sharp', 'square', 'ultra'],
  buttonCorner: ['soft', 'pill', 'square', 'sharp', 'glass', 'neon'],
  buttonBackground: ['solid', 'outline', 'ghost', 'contrast', 'glass', 'neon', 'text'],
  borderStyle: ['subtle', 'balanced', 'strong', 'neon', 'neon2', 'glass', 'none'],
  shadowStyle: ['none', 'soft', 'strong', 'neon', 'glass'],
};
const REMAINING_APP_BOOLEAN_KEYS = new Set(['reduceMotion', 'animateHover', 'showStatusBar', 'confirmAccountDeletion']);
window.addEventListener('madstation:remaining-settings-action', async (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  try {
    if (action.type === 'app-setting') {
      if (typeof action.key !== 'string') return;
      if (REMAINING_APP_BOOLEAN_KEYS.has(action.key)) {
        if (typeof action.value !== 'boolean') return;
      } else {
        const choices = REMAINING_APP_SETTING_CHOICES[action.key];
        if (!choices || !choices.includes(action.value)) return;
      }
      await updateAppSettings({ [action.key]: action.value });
      return;
    }
    if (action.type === 'security-setting' && action.key === 'remoteIcons' && typeof action.value === 'boolean') {
      await updateSecurity({ remoteIcons: action.value });
      return;
    }
    if (action.type === 'open-icon-folder') { await openIconFolder(); return; }
    if (action.type === 'refresh-icons') { await refreshIcons(); }
  } catch {
    showToast('Could not update that setting.', true);
  }
});

let notificationsReactRenderer = null;
function getNotificationsViewModel() {
  return {
    items: notifications.map((notification, index) => ({
      index,
      title: String(notification.title || 'Mad Station'),
      message: String(notification.message || ''),
      at: Number(notification.at),
    })),
  };
}
function renderNotifications() {
  const root = $('notificationList');
  if (!root) return;
  const model = getNotificationsViewModel();
  if (typeof notificationsReactRenderer === 'function') {
    notificationsReactRenderer(model);
  } else {
    // Startup fallback only until the React entry attaches.
    root.innerHTML = model.items.length
      ? model.items.map((notification) => `<div class="notification-item"><div><strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.message)}</span><small>${new Date(notification.at).toLocaleTimeString()}</small></div><button type="button" data-notice-index="${notification.index}" aria-label="Dismiss">×</button></div>`).join('')
      : '<div class="empty-state"><strong>No notifications</strong><span>Recent app events will appear here.</span></div>';
  }
  syncNotificationBadges();
}
window.MadStationNotifications = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    notificationsReactRenderer = renderer;
    renderNotifications();
  },
};
$('notificationList')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('[data-notice-index]');
  if (!button) return;
  const index = Number(button.getAttribute('data-notice-index'));
  if (!Number.isInteger(index) || index < 0 || index >= notifications.length) return;
  notifications.splice(index, 1);
  renderNotifications();
});
let notificationAnchor = null;
let notificationVideoHubOverlayOpen = false;
function positionNotificationPanel() {
  const panel = $('notificationPanel');
  const anchor = notificationAnchor;
  if (!panel || panel.classList.contains('hidden') || !anchor?.isConnected) return;
  const rect = anchor.getBoundingClientRect();
  const computedZoom = Number.parseFloat(getComputedStyle(panel).zoom);
  const uiScale = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--ui-scale'));
  const scale = Number.isFinite(computedZoom) && computedZoom > 0 ? computedZoom : (Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1);
  const panelWidth = panel.getBoundingClientRect().width || Math.min(390, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12));
  const top = rect.bottom + 8;
  panel.style.left = `${left / scale}px`;
  panel.style.right = 'auto';
  panel.style.top = `${top / scale}px`;
}
async function openNotifications(anchor) {
  const panel = $('notificationPanel');
  if (!panel) return;
  const openingApp = currentApp;
  notificationAnchor = anchor?.currentTarget || anchor || $('notificationsBtn') || $('videoHubNotificationsBtn');
  // Native Electron WebContentsViews always paint above renderer HTML. Hide the
  // Video Hub view first so the shared notification panel can paint unobscured.
  if (openingApp === 'video-hub' && !notificationVideoHubOverlayOpen) {
    notificationVideoHubOverlayOpen = true;
    try { await window.aiHub.videoHubNotificationOverlay(true); }
    catch { notificationVideoHubOverlayOpen = false; }
  }
  if (openingApp !== currentApp) return;
  panel.classList.remove('hidden');
  renderNotifications();
  positionNotificationPanel();
}
function closeNotifications() {
  $('notificationPanel')?.classList.add('hidden');
  notificationAnchor = null;
  if (notificationVideoHubOverlayOpen) {
    notificationVideoHubOverlayOpen = false;
    Promise.resolve(window.aiHub.videoHubNotificationOverlay?.(false)).catch(() => {});
  }
}
$('notificationsBtn')?.addEventListener('click', (event) => openNotifications(event.currentTarget));
['instructionNotificationsBtn', 'aiLabNotificationsBtn', 'clipboardNotificationsBtn', 'videoHubNotificationsBtn', 'imageHubNotificationsBtn'].forEach((id) => {
  $(id)?.addEventListener('click', (event) => openNotifications(event.currentTarget));
});
window.addEventListener('resize', positionNotificationPanel);
window.addEventListener('scroll', positionNotificationPanel, { capture: true, passive: true });
function syncNotificationBadges() {
  const count = Math.min(99, notifications.length);
  ['notificationBadge', 'instructionNotificationBadge', 'aiLabNotificationBadge', 'clipboardNotificationBadge', 'videoHubNotificationBadge'].forEach((id) => {
    const badge = $(id);
    if (!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', notifications.length === 0);
  });
  if (typeof imageHubPublishSidebarChrome === 'function') imageHubPublishSidebarChrome();
}
$('closeNotifications')?.addEventListener('click', closeNotifications); $('clearNotificationsBtn')?.addEventListener('click',()=>{notifications=[];renderNotifications();});

$('search').addEventListener('input', () => { updateSearchUi(); renderAccountsSidebar(); });
$('searchClear').addEventListener('click', () => { $('search').value = ''; updateSearchUi(); renderAccountsSidebar(); $('search').focus(); });
$('search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('search').value) { event.stopPropagation(); $('search').value = ''; updateSearchUi(); renderAccountsSidebar(); }
  if (event.key === 'Enter') { const first = document.querySelector('#accounts .account-btn'); if (first) first.click(); }
});
function updateSearchUi() { const has = Boolean($('search').value); $('searchClear').classList.toggle('hidden', !has); $('searchKbd').classList.toggle('hidden', has); }
$('orgAllBtn')?.addEventListener('click', () => { organizationFilter = { favorites: false, group: '' }; renderOrganizationFilters(); renderAccountsSidebar(); });
$('orgFavoritesBtn')?.addEventListener('click', () => { organizationFilter = { favorites: true, group: '' }; renderOrganizationFilters(); renderAccountsSidebar(); });
$('orgGroupFilter')?.addEventListener('change', (e) => { organizationFilter = { favorites: false, group: e.target.value }; renderOrganizationFilters(); renderAccountsSidebar(); });
$('settingsBtn').addEventListener('click', () => openSettings('providers', 'aihub'));
$('launcherSettingsBtn').addEventListener('click', () => openSettings('appearance', 'global'));
$('openLauncherBtn').addEventListener('click', goToLauncher);
$('launcherSettingsBtn')?.addEventListener('click', () => openSettings('appearance', 'global'));
$('videoHubSettingsBtn')?.addEventListener('click', openVideoHubSettings);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('videoHubSettingsOverlay')?.classList.contains('hidden')) {
    event.preventDefault(); event.stopPropagation(); closeVideoHubSettings();
  }
});
document.querySelectorAll('[data-app-launch]').forEach((card) => card.addEventListener('click', () => openWorkspaceApp(card.dataset.appLaunch)));
// Companion apps on Home come from home-app-list.js; the registry opens them through the same launcher.
window.MadHomeApps?.setLauncher(openWorkspaceApp);
document.addEventListener('mad:home-apps-built', () => { try { renderWorkspaceApps(); } catch {} });
try { renderWorkspaceApps(); } catch {}
// Home screen: a soft spotlight follows the pointer across the core and the companion cards.
document.querySelectorAll('.home-core-btn').forEach((el) => el.addEventListener('pointermove', (event) => {
  const box = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${event.clientX - box.left}px`);
  el.style.setProperty('--my', `${event.clientY - box.top}px`);
}));
$('clipboardBackBtn').addEventListener('click', goToLauncher);
$('videoHubBackBtn')?.addEventListener('click', goToLauncher);

$('instructionSettingsBtn')?.addEventListener('click', openInstructionSettings); $('closeInstructionSettings')?.addEventListener('click', closeInstructionSettings); $('cancelInstructionSettings')?.addEventListener('click', closeInstructionSettings); $('saveInstructionSettings')?.addEventListener('click', saveInstructionSettings); $('instructionSettingsModal')?.addEventListener('click', (event) => { if (event.target === $('instructionSettingsModal')) closeInstructionSettings(); });
window.addEventListener('madstation:instruction-forge-settings-mounted', () => { forgeSettingsReactMounted = true; const legacy = $('instructionSettingsLegacy'); const mount = $('instructionSettingsReactMount'); if (legacy) legacy.hidden = true; if (mount) mount.hidden = false; publishInstructionForgeSettings(); });
window.addEventListener('madstation:instruction-forge-settings-action', handleInstructionForgeSettingsAction);
window.addEventListener('madstation:ai-playground-settings-mounted', () => { aiLabSettingsReactMounted = true; const legacy = $('aiLabSettingsLegacy'); const mount = $('aiLabSettingsReactMount'); if (legacy) legacy.hidden = true; if (mount) mount.hidden = false; publishAiLabSettings(); });
window.addEventListener('madstation:ai-playground-settings-action', handleAiLabSettingsAction);
window.addEventListener('madstation:arena-setup-mounted', () => { arenaSetupReactMounted = true; const legacy = $('arenaSetupLegacy'); const mount = $('arenaSetupReactMount'); if (legacy) legacy.hidden = true; if (mount) mount.hidden = false; publishArenaSetupForm(); });
window.addEventListener('madstation:arena-setup-action', handleArenaSetupAction);
window.addEventListener('madstation:rename-account-modal-mounted', () => { renameModalReactMounted = true; const legacy = $('renameFormLegacy'); const mount = $('renameFormReactMount'); if (legacy) legacy.hidden = true; if (mount) mount.hidden = false; publishRenameAccountModal(!$('renameModal').classList.contains('hidden')); });
window.addEventListener('madstation:rename-account-modal-action', (event) => { void handleRenameAccountModalAction(event); });
$('aiLabSettingsBtn')?.addEventListener('click', openAiLabSettings); $('closeAiLabSettings')?.addEventListener('click', closeAiLabSettings); $('cancelAiLabSettings')?.addEventListener('click', closeAiLabSettings); $('saveAiLabSettings')?.addEventListener('click', saveAiLabSettings); $('aiLabSettingsModal')?.addEventListener('click', (event) => { if (event.target === $('aiLabSettingsModal')) closeAiLabSettings(); });


activateUtilityTab(utilityTab);
$('hideSidebarBtn').addEventListener('click', () => window.aiHub.toggleSidebar());
$('closeRenameModal').addEventListener('click', closeRenameModal);
$('cancelRenameBtn').addEventListener('click', closeRenameModal);
$('renameModal').addEventListener('click', (event) => { if (event.target === $('renameModal')) closeRenameModal(); });
$('renameFormLegacy').addEventListener('submit', async (event) => {
  event.preventDefault(); const name = $('renameInput').value.trim(); if (!name || name.length > 60 || !renamingAccountId) return;
  const accountId = renamingAccountId;
  let result; try { result = await window.aiHub.renameAccount(accountId, name); } catch { result = { ok: false, error: 'Could not rename account.' }; }
  if (renamingAccountId !== accountId) return;
  if (!result?.ok) return $('renameError').textContent = (typeof result?.error === 'string' ? result.error : 'Could not rename account.').slice(0, 400);
  closeRenameModal(); showToast('Account renamed.');
});
document.addEventListener('mousedown', (event) => { if (!event.target.closest('#ctxMenu') && !event.target.closest('.more-btn')) closeCtxMenu(); });
window.addEventListener('blur', closeCtxMenu);
window.addEventListener('resize', closeCtxMenu);
$('accounts').addEventListener('scroll', closeCtxMenu);
document.addEventListener('keydown', (event) => {
  if (currentApp === 'clipboard' && !state.locked) {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); $('clipboardSearch').focus(); $('clipboardSearch').select(); return; }
    if (mod && event.key.toLowerCase() === 'n') { event.preventDefault(); $('clipboardInput').focus(); return; }
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const menuItems = [...document.querySelectorAll('#ctxMenu .ctx-item')];
  if (menuItems.length && !$('ctxMenu').classList.contains('hidden')) {
    event.preventDefault(); const i = menuItems.indexOf(document.activeElement);
    menuItems[(i + (event.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length].focus(); return;
  }
  const target = event.target; const inSearch = target === $('search');
  const inList = target instanceof HTMLElement && target.classList.contains('account-btn');
  if (!inSearch && !inList) return;
  const items = [...document.querySelectorAll('#accounts .account-btn')]; if (!items.length) return;
  event.preventDefault();
  const next = (inList ? items.indexOf(target) : -1) + (event.key === 'ArrowDown' ? 1 : -1);
  if (next < 0) $('search').focus(); else items[Math.min(next, items.length - 1)].focus();
});
$('closeSettings').addEventListener('click', closeSettings);
$('settingsAddAccountBtn').addEventListener('click', () => openAccountModal());
$('addProviderBtn').addEventListener('click', () => openProviderModal());
$('closeProviderModal').addEventListener('click', closeProviderModal);
$('providerModal').addEventListener('click', (event) => { if (event.target === $('providerModal')) closeProviderModal(); });
$('closeAccountModal').addEventListener('click', closeAccountModal);
$('accountModal').addEventListener('click', (event) => { if (event.target === $('accountModal')) closeAccountModal(); });
document.addEventListener('madstation:record-account-shortcut', () => { recordingShortcutTarget = '__new_account__'; });

document.querySelectorAll('.settings-tab').forEach((tab) => tab.addEventListener('click', () => activateSettingsTab(tab.dataset.tab)));
$('addBackgroundUrlBtn')?.addEventListener('click', () => setBackgroundUrlForm(true));
$('cancelBackgroundUrlBtn')?.addEventListener('click', () => setBackgroundUrlForm(false));
$('saveBackgroundUrlBtn')?.addEventListener('click', addBackgroundFromUrl);
$('backgroundUrlInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addBackgroundFromUrl(); } if (event.key === 'Escape') setBackgroundUrlForm(false); });
$('addBackgroundFileBtn')?.addEventListener('click', addBackgroundFromComputer);
window.addEventListener('madstation:data-settings-controls-action', async (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  try {
    if (action.type === 'release-feed-url') {
      if (typeof action.value !== 'string' || action.value.length > 2048) return;
      const value = action.value.trim();
      if (value !== (state.settings?.releaseFeedUrl || '')) await updateAppSettings({ releaseFeedUrl: value });
      return;
    }
    if (action.type === 'open-data-folder') {
      const result = await window.aiHub.openDataFolder();
      if (!result?.ok) showToast(result?.error || 'Could not open the data folder.', true);
      return;
    }
    if (action.type === 'backup') {
      const result = await window.aiHub.backupConfig();
      if (result?.ok) showToast('Workspace backup created.'); else if (!result?.canceled) showToast(result?.error || 'Could not create the backup.', true);
      return;
    }
    if (action.type === 'restore') {
      if (!window.confirm('Restore a Mad Station backup?\n\nYour current account sessions will be signed out and the workspace configuration will be replaced.')) return;
      const result = await window.aiHub.restoreConfig();
      if (!result?.ok) return showToast(result?.error || 'Could not restore the backup.', true);
      state.settings = result.settings; showToast('Workspace restored.'); render();
      return;
    }
    if (action.type === 'export-accounts') {
      const result = await window.aiHub.exportAccounts();
      if (result?.ok) showToast('Accounts exported.'); else if (!result?.canceled) showToast(result?.error || 'Could not export accounts.', true);
      return;
    }
    if (action.type === 'import-accounts') {
      const result = await window.aiHub.importAccounts();
      if (result?.ok) showToast(`Imported ${result.count} account${result.count === 1 ? '' : 's'}.`); else if (!result?.canceled) showToast(result?.error || 'Could not import accounts.', true);
      return;
    }
    if (action.type === 'reset-settings') {
      if (!window.confirm('Reset all settings to their defaults?\n\nThis resets appearance, general and security options. Your providers, accounts, shortcuts and password are kept.')) return;
      const result = await window.aiHub.resetSettings();
      if (!result?.ok) return showToast(result?.error || 'Could not reset settings.', true);
      state.settings = result.settings; window.MadStationHomePage?.setMode('v2'); render(); showToast('Settings reset to defaults.');
      return;
    }
    if (action.type === 'refresh-diagnostics') {
      await updateDiagnostics(); showToast('Diagnostics refreshed.');
      return;
    }
    if (action.type === 'check-providers') {
      if (dataDiagnosticsView.providerCheckBusy) return;
      dataDiagnosticsView.providerCheckBusy = true; publishDataDiagnosticsControls();
      try {
        const result = await window.aiHub.checkProviderCompatibility();
        if (!result?.ok) return showToast(result?.error || 'Could not check providers.', true);
        const healthy = result.providers.filter((provider) => provider.reachable).length;
        const total = result.providers.length;
        dataDiagnosticsView.diagnosticsProviderStatus = total ? `${healthy}/${total} provider${total === 1 ? '' : 's'} reachable` : 'No providers configured';
        showToast(total ? `Provider check complete · ${healthy}/${total} reachable.` : 'No providers configured.');
      } catch (error) { showToast(error?.message || 'Could not check providers.', true); }
      finally { dataDiagnosticsView.providerCheckBusy = false; publishDataDiagnosticsControls(); }
      return;
    }
    if (action.type === 'export-diagnostics') {
      const result = await window.aiHub.exportDiagnostics();
      if (result?.ok) showToast('Diagnostics export created.'); else if (!result?.canceled) showToast(result?.error || 'Could not export diagnostics.', true);
      return;
    }
    if (action.type === 'check-updates') {
      const result = await window.aiHub.checkForUpdates();
      if (!result?.ok) return showToast(result?.error || 'Could not check for updates.', true);
      if (!result.updateAvailable) return showToast(`You are up to date (${result.current}).`);
      showToast(`Update available: ${result.latest}`);
      if (!result.url) return;
      const opened = await window.aiHub.openExternalUrl(result.url);
      if (!opened?.ok) showToast(opened?.error || 'Could not open the update link.', true);
    }
  } catch { showToast('The settings action could not be completed.', true); }
});

window.addEventListener('madstation:security-controls-action', (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  if (action.type === 'setting' && ['lockOnLaunch', 'lockOnSystemLock', 'lockOnMinimize', 'lockOnIdle'].includes(action.key) && typeof action.value === 'boolean') {
    void updateSecurity({ [action.key]: action.value });
    return;
  }
  if (action.type === 'idle-minutes' && [1, 5, 10, 30].includes(action.value)) void updateSecurity({ idleMinutes: action.value });
});

// ---- Search across every settings page ----
const ROW_SEL = '.row, .provider-row, .settings-account-row, .shortcut-row';
function settingsQuery() { return ($('settingsSearch')?.value || '').trim().toLowerCase(); }
function clearSettingsSearch() { if (!$('settingsSearch')) return; $('settingsSearch').value = ''; filterSettings(); }
function filterSettings() {
  const q = settingsQuery(); const content = $('settingsContent');
  $('settingsSearchClear').classList.toggle('hidden', !q);
  content.classList.toggle('searching', Boolean(q));
  const panels = [...document.querySelectorAll('.settings-panel')].filter((p) => p.dataset.settingsScope === settingsScope);
  if (!q) {
    panels.forEach((p) => { p.classList.toggle('active', p.dataset.panel === document.querySelector('.settings-tab.active')?.dataset.tab); p.querySelectorAll(`${ROW_SEL}, .card`).forEach((el) => el.classList.remove('hidden')); p.querySelectorAll('.panel-head, .about-hero, .group-label').forEach((el) => el.classList.remove('hidden')); });
    $('settingsNoResults').classList.add('hidden');
    return;
  }
  let total = 0;
  panels.forEach((panel) => {
    const rows = [...panel.querySelectorAll(ROW_SEL)]; let hits = 0;
    rows.forEach((row) => { const match = `${row.dataset.q || ''} ${row.textContent}`.toLowerCase().includes(q); row.classList.toggle('hidden', !match); if (match) hits += 1; });
    panel.querySelectorAll('.card').forEach((card) => card.classList.toggle('hidden', card.classList.contains('no-search') || !card.querySelector(ROW_SEL.split(', ').map((s) => s + ':not(.hidden)').join(', '))));
    panel.querySelectorAll('.panel-head, .about-hero, .group-label').forEach((el) => el.classList.add('hidden'));
    panel.classList.toggle('active', hits > 0); total += hits;
  });
  $('settingsNoResults').classList.toggle('hidden', total > 0);
}
const DEVELOPER_PROMPTS = {
  'project-orientation': 'Read AGENTS.md, CLAUDE.md, README.md, package.json, and the relevant audit/docs first. Map Mad Station’s main process, preload bridge, renderer, styles, tests, and build configuration. For this task: [describe goal]. Identify the exact files and execution path involved, explain their responsibilities and dependencies, and recommend the smallest safe change before editing. Do not modify files until the map is clear. Then implement only the agreed scope, run relevant tests, and report changed files and remaining unknowns.',
  'refactor': 'Start with docs/architecture/CORE_SYSTEM.md, then read AGENTS.md, CLAUDE.md, README.md, the relevant source, and existing tests. Diagnose [bug/task] before editing. Make the smallest maintainable change that matches current architecture and design-system conventions. Preserve public behavior and existing DOM ids/data hooks unless deliberately updating every dependent reference and test. Do not weaken security checks or broaden IPC/file access. Add a regression test, run npm test, and report root cause, changed files, test results, and any manual verification still needed.',
  'build-test-diagnose': 'Inspect package.json, project instructions, and the tests related to [feature/change]. Determine the supported commands and prerequisites before running them. Run the narrowest useful test first, then the relevant broader suite. If a check fails, trace the failure to its source and distinguish product defects from missing dependencies or environment limitations. Do not claim a command passed unless it ran successfully. Report commands, observed output, root cause, fixes, and unverified checks.',
  'release': 'Review this Mad Station release as a cautious Windows Electron maintainer. Read package.json, README.md, docs/security/RELEASE_AUDIT.md, docs/security/DEPENDENCY_AUDIT.md, and tests. Verify version consistency, test coverage, dependency/security status, packaging configuration, resource inclusion, installer behavior, upgrade/clean-install paths, and privacy/security boundaries. Run available checks. Do not claim an installer or manual smoke test passed unless actually executed. Produce a severity-ranked checklist with evidence, exact commands, blockers, and remaining manual tests.',
  'update-docs': 'Read the existing README.md, docs/design/DESIGN_SYSTEM.md, AGENTS.md, CLAUDE.md, relevant source files, and audit notes before documenting [change]. Update only documentation supported by the implementation. Preserve established terminology and structure, link to the correct files and commands, and clearly label limitations or checks that were not run. Keep assistant instructions consistent across documents. Review the diff for stale statements and summarize each documentation change.',
  'trace-feature': 'Trace [feature] end to end before changing code. Search its UI entry points, event handlers, state, renderer/preload APIs, main-process handlers, persistence, styles, and tests. Draw a concise execution flow and list the files/functions involved, trust boundaries, cleanup paths, and relevant tests. Identify indirect dependencies and behavior hooks that could break. Do not edit yet; propose the smallest safe implementation plan and validation steps.',
  'safe-file-change': 'Make this targeted change: [describe change] in [file/area]. Read project instructions and the surrounding implementation first. Keep the diff focused; do not replace whole files or perform unrelated cleanup. Preserve IDs, data attributes, APIs, state shape, session isolation, CSP, IPC validation, and permission checks unless a deliberate, justified change is required. Add or update regression tests, inspect the diff for accidental changes, run relevant checks, and report exactly what changed.',
  'security-privacy-review': 'Perform a focused security and privacy review of [feature/files] in Mad Station. Inspect Electron context isolation, sandboxing, Node integration, CSP, preload bridge exposure, IPC sender/payload validation, navigation and origin checks, filesystem access, permissions, credential handling, logging, diagnostics, clipboard and browser-session data. Trace each finding to code and classify severity with evidence and a practical remediation. Do not assume a control exists without locating it; do not make changes until findings and scope are clear. Run relevant tests and state coverage limits.',
  'app-builder': 'Read AGENTS.md, CLAUDE.md, README.md, docs/design/DESIGN_SYSTEM.md, and inspect src/home-app-list.js plus the closest existing workspace app. Implement a new built-in workspace app called [name] for [purpose]. Follow the existing app registry, view creation/destruction, navigation, settings, cleanup, and state-persistence patterns; use the Mad Station design system; preserve account isolation and renderer/main-process security boundaries. Register the app in every required place, add tests for launch/navigation/cleanup and relevant edge cases, run npm test, and summarize implementation and known limitations.',
  'register-app': 'Read docs/design/DESIGN_SYSTEM.md and inspect src/home-app-list.js, src/home-apps.js, src/renderer.html, src/renderer.js, and src/main.js. Register the existing app [app ID/name] in the correct launcher location and connect its open route, screen visibility, title, back-to-launcher behavior, and main-process allow-list. Reuse the existing screen and stable ID; do not create a duplicate app or parallel navigation path. Add startup allow-list support only if appropriate. Test tile visibility, opening, back navigation, and state synchronization.',
  'app-state-settings': 'Inspect comparable workspace apps and existing settings/persistence APIs before implementing [state or setting]. Define defaults, validation, migration behavior, save/load timing, and failure handling. Keep renderer input untrusted and use existing narrow bridge methods rather than direct Node access. Handle missing, malformed, and older stored values safely. Add tests for defaults, valid updates, invalid input, reload/restore, and failure cases; document any user-visible setting.',
  'debug-navigation': 'Debug this workspace navigation problem: [describe symptom]. Trace the launcher card ID through src/home-app-list.js, src/home-apps.js, openWorkspaceApp(), updateWorkspaceView(), document title, main-process VALID_WORKSPACE_APPS, and any startup allow-list. Check for mismatched IDs, missing screen roots, stale state, and incorrect Back handling. Reproduce or add a regression test, fix the smallest root cause, and verify open, switch, return-to-launcher, and startup behavior where supported.',
  'safe-import-export': 'Implement or improve import/export for [data type]. First inspect existing backup, restore, and serialization patterns. Define a versioned schema and validate types, sizes, required fields, duplicate IDs, and unsupported versions before applying imported data. Treat imported content as untrusted; reject or safely report malformed files without partial destructive writes. Use atomic/recoverable writes where the project supports them, preserve unrelated user data, and never export secrets or session storage unintentionally. Add tests for valid, malformed, oversized, duplicate, old-version, and failure cases.',
  'app-states-recovery': 'Audit [workspace app] for loading, empty, success, partial, error, retry, and recovery states. Follow existing .ms-* components and token conventions. Make messages actionable and accessible, prevent duplicate submissions, retain user input when safe, and distinguish retryable from terminal errors. Avoid claiming saves or operations succeeded before confirmation. Add tests for the important state transitions and explain any states that require manual runtime verification.',
  'app-lifecycle-cleanup': 'Audit the lifecycle of [workspace app] from open through repeated navigation and close. Inspect timers, polling, event listeners, subscriptions, browser views, temporary resources, pending asynchronous work, and persisted state. Follow existing workspace-scoped lifecycle patterns and ensure cleanup is safe, idempotent, and does not erase persistent logins or cancel unrelated downloads. Add regression tests for repeated open/close and stale callbacks where feasible, run npm test, and report any runtime checks still needed.',
  'design-migration': 'Read docs/design/DESIGN_SYSTEM.md first. Migrate this page to the Mad Station design system. Reuse existing --ms-* tokens and documented .ms-* classes; remove duplicate styling; preserve every DOM id, data-* hook, keyboard interaction, accessibility label, and existing behavior. Do not redesign unrelated screens. Update or add regression tests, inspect light/dark and appearance variants, and report changed files plus any remaining exceptions.',
  'design-page': 'Read docs/design/DESIGN_SYSTEM.md, src/design-tokens.css, src/design-kit.css, and the design-kit preview before coding. Create a new Mad Station page for: [describe page and user goals]. Use existing --ms-* tokens and .ms-* components first; follow established spacing, typography, surfaces, buttons, inputs, focus states, responsive behavior, and light/dark themes. Do not add raw colors or duplicate components. Keep UI behavior accessible and testable; list the files changed and run npm test.',
  'audit-shared-styles': 'Audit the styles for [screen/component]. Read docs/design/DESIGN_SYSTEM.md, src/styles.css, src/design-tokens.css, src/design-kit.css, and related legacy styles. Find raw colors, hard-coded radii/shadows/spacing, duplicate selectors, undefined tokens, conflicting appearance mappings, and unused rules. Keep Appearance mappings centralized in design-tokens.css and preserve stylesheet order. Report findings with file/selector evidence, then apply only scoped fixes, update tests/docs if needed, and run npm test.',
  'shared-component': 'Read docs/design/DESIGN_SYSTEM.md and inspect existing components in src/design-kit.css before creating or changing a shared component for [purpose]. Reuse existing patterns if possible. Otherwise add a generic, documented .ms-* component driven by existing --ms-* tokens, including relevant hover, focus, active, disabled, empty, and error states. Avoid raw colors, inline styles, duplicated Appearance mappings, and app-specific assumptions. Add a usage example and suitable design-system tests.',
  'verify-visual-variants': 'Open docs/design-kit-preview.html and inspect the actual stylesheet stack for [component/page]. Verify Light and Dark, accent changes, solid/glass/frosted/elevated surfaces, soft/sharp/square corners, button styles, borders, shadows, spacing/density, reduced motion, keyboard focus, and narrow/wide layouts as relevant. Record what was actually inspected; do not claim visual verification if the preview could not be run. Fix inconsistencies using shared tokens/components and run npm test.',
  'responsive-audit': 'Audit [screen/component] at narrow, medium, and wide window sizes. Inspect grid breakpoints, wrapping, long labels, overflow, sticky/fixed elements, scroll areas, touch/click targets, and keyboard navigation. Use the shared spacing/layout conventions and avoid hard-coded widths that break other Appearance settings. Preserve functional hooks. Make targeted fixes and add responsive tests or a manual verification checklist where automated coverage is not available.',
  'appearance-option': 'Add or repair the Appearance option [option name/value]. Trace the option through src/appearance.js, src/design-tokens.css, Settings UI, persisted defaults, shared components, toolbar behavior, and docs/design-kit-preview.html. Keep supported values and data-attribute mappings centralized and aligned; ensure a missing or invalid value falls back safely. Do not add competing mappings in legacy styles. Update design-system tests and verify representative themes/variants; report anything not runtime-tested.',
  'accessibility-audit': 'Audit [screen/component] for keyboard-only operation, logical focus order, visible focus, accessible names, semantic controls, contrast, zoom/text scaling, error announcements, disabled states, and reduced-motion/no-hover-animation behavior. Reuse the shared kit and preserve existing IDs/data hooks. Fix issues within scope, add tests for interaction behavior where possible, and provide a concise checklist of verified items and any checks that require manual assistive-technology testing.'
};
// Keep every copied developer prompt routed through the project's single source of instructions.
for (const key of Object.keys(DEVELOPER_PROMPTS)) {
  if (!DEVELOPER_PROMPTS[key].startsWith('Start with docs/architecture/CORE_SYSTEM.md')) {
    DEVELOPER_PROMPTS[key] = `Start with docs/architecture/CORE_SYSTEM.md. ${DEVELOPER_PROMPTS[key]}`;
  }
}
const DEVELOPER_UI_FILES = new Set([
  'package.json', 'README.md', 'docs/architecture/CORE_SYSTEM.md', 'src/home-app-list.js', 'AGENTS.md', 'docs/design/DESIGN_SYSTEM.md',
  'src/styles.css', 'src/design-kit.css', 'src/design-tokens.css', 'docs/design-kit-preview.html',
]);
function publishDeveloperPanelControls() {
  window.dispatchEvent(new CustomEvent('madstation:developer-panel-controls', { detail: { prompts: DEVELOPER_PROMPTS } }));
}
window.addEventListener('madstation:developer-panel-controls-mounted', publishDeveloperPanelControls);
window.addEventListener('madstation:developer-debug-open-window', async (event) => {
  const detail = event?.detail;
  if (!detail || typeof detail !== 'object') return;
  try {
    const result = await window.aiHub.developerDebugOpenWindow(true);
    if (!result?.ok) showToast(result?.error || 'Could not open the Developer Inspector window.', true);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not open the Developer Inspector window.', true);
  }
});

window.aiHub?.onDeveloperDebugSettingsFromInspector?.((settings) => {
  if (!settings || typeof settings !== 'object') return;
  window.dispatchEvent(new CustomEvent('madstation:developer-debug-settings', { detail: { settings } }));
});
// Mirror every source-of-truth settings change into the separate Inspector. The
// inspector's sync listener only updates its UI; it does not write back, so this
// one-way notification cannot form an event loop.
window.addEventListener('madstation:developer-debug-settings', (event) => {
  const detail = event?.detail;
  const settings = detail && typeof detail === 'object' ? (detail.settings || detail) : null;
  if (!settings || typeof settings !== 'object') return;
  try {
    const pending = window.aiHub?.developerDebugNotifySettingsChanged?.(settings);
    if (pending && typeof pending.catch === 'function') pending.catch(() => { /* Inspector may be closed during shutdown. */ });
  } catch { /* Debug overlays remain functional when the separate window is closed. */ }
});
window.aiHub?.onDeveloperDebugInspectorCommand?.((command) => {
  if (!command || typeof command !== 'object') return;
  window.dispatchEvent(new CustomEvent('madstation:developer-debug-inspector-command', { detail: command }));
});

window.addEventListener('madstation:developer-settings-action', async (event) => {
  const detail = event?.detail;
  if (!detail || typeof detail !== 'object' || typeof detail.requestId !== 'string'
    || !/^developer-auth-[0-9]{1,16}-[0-9]{1,10}$/.test(detail.requestId)) return;
  let result;
  try {
    if (detail.type === 'status') {
      result = await window.aiHub.getDeveloperOptionsStatus();
    } else if (detail.type === 'unlock') {
      if (!detail.payload || typeof detail.payload.password !== 'string' || detail.payload.password.length > 256) throw new Error('Enter a valid Developer Options password.');
      result = await window.aiHub.unlockDeveloperOptions(detail.payload.password);
    } else if (detail.type === 'lock') {
      result = await window.aiHub.lockDeveloperOptions();
    } else if (detail.type === 'close-section') {
      result = await window.aiHub.closeDeveloperOptionsSection();
    } else if (detail.type === 'keep-unlocked') {
      if (typeof detail.payload?.enabled !== 'boolean') throw new Error('Choose whether to keep Developer Options unlocked for this session.');
      result = await window.aiHub.setDeveloperOptionsKeepUnlockedForSession(detail.payload.enabled);
    } else if (detail.type === 'change-password') {
      const payload = detail.payload;
      if (!payload || typeof payload.current !== 'string' || typeof payload.next !== 'string' || typeof payload.confirm !== 'string') throw new Error('Enter the current password and confirm the new password.');
      result = await window.aiHub.changeDeveloperOptionsPassword({ current: payload.current, next: payload.next, confirm: payload.confirm });
    } else if (detail.type === 'restart-status') {
      result = await window.aiHub.getThemeImportRestartStatus();
    } else if (detail.type === 'restart-app') {
      result = await window.aiHub.restartApp();
    } else {
      return;
    }
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : 'Developer Options authentication failed.' };
  }
  window.dispatchEvent(new CustomEvent('madstation:developer-settings-result', { detail: { requestId: detail.requestId, result: result || { ok: false, error: 'Developer Settings returned no result.' } } }));
});

window.addEventListener('madstation:developer-panel-action', async (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  try {
    if (action.type === 'show-location') {
      if (typeof action.path !== 'string' || !DEVELOPER_UI_FILES.has(action.path)) return;
      const result = await window.aiHub.showDeveloperFileLocation(action.path);
      if (!result?.ok) showToast(result?.error || 'Could not show that file location.', true);
      else showToast(`Showing location: ${action.path}`);
      return;
    }
    if (action.type === 'copy-prompt') {
      if (typeof action.key !== 'string' || !Object.prototype.hasOwnProperty.call(DEVELOPER_PROMPTS, action.key)) return;
      await window.aiHub.writeSystemClipboard(DEVELOPER_PROMPTS[action.key]);
      showToast('AI prompt copied. Paste it into your coding assistant.');
      return;
    }
    if (action.type === 'scan-theme-pack') {
      const result = await window.aiHub.discoverThemeDesigns();
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-scan-result', { detail: result || {} }));
      if (!result?.ok) showToast(result?.error || 'Could not scan the current themes.', true);
      return;
    }
    if (action.type === 'remove-imported-theme') {
      if (typeof action.mode !== 'string' || !/^(?:custom-[a-z0-9-]{1,64}|legacy|v2|parallax|parallax-big|retro|retro-complex|galaxy|parallax-jungle|claymorphism|glass)$/.test(action.mode)) return;
      const result = await window.aiHub.removeImportedTheme(action.mode);
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-remove-result', { detail: result || {} }));
      if (result?.ok) {
        window.dispatchEvent(new CustomEvent('madstation:theme-imported', { detail: result.catalog }));
        const title = result.removed?.title || 'theme';
        showToast(`Removed imported custom theme ${title}.`);
      } else {
        showToast(result?.error || 'Could not update the installed theme catalogue.', true);
      }
      return;
    }
    if (action.type === 'export-theme-pack') {
      if (!Array.isArray(action.themeIds) || !action.themeIds.length || action.themeIds.length > 200
        || action.themeIds.some((id) => typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
        || new Set(action.themeIds).size !== action.themeIds.length) return;
      const result = await window.aiHub.exportThemeDesignPack(action.themeIds);
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-export-result', { detail: result || {} }));
      if (result?.ok) showToast(`Exported ${result.themeCount || 0} theme${result.themeCount === 1 ? '' : 's'} to ZIP.`);
      else if (!result?.canceled) showToast(result?.error || 'Could not export the theme design pack.', true);
      return;
    }
    if (action.type === 'scan-theme-import') {
      let zipPath;
      if (action.zipFile) {
        try { zipPath = window.aiHub.getPathForFile(action.zipFile); }
        catch { throw new Error('Could not read the dropped file path. Use Browse for ZIP and try again.'); }
        if (typeof zipPath !== 'string' || !zipPath || !/\.zip$/i.test(zipPath)) throw new Error('Drop a valid .zip theme pack.');
      }
      const result = await window.aiHub.scanThemePackImport(zipPath);
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-import-scan-result', { detail: result || {} }));
      if (!result?.ok && !result?.canceled) showToast(result?.error || 'Could not scan this theme ZIP.', true);
      return;
    }
    if (action.type === 'import-theme-pack') {
      if (typeof action.scanId !== 'string' || !/^[a-f0-9-]{36}$/i.test(action.scanId)
        || !Array.isArray(action.choices) || !action.choices.length || action.choices.length > 200) return;
      const validChoices = action.choices.every((choice) => choice && typeof choice.id === 'string'
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(choice.id)
        && choice.action === 'add');
      if (!validChoices || new Set(action.choices.map((choice) => choice.id)).size !== action.choices.length) return;
      const result = await window.aiHub.importThemePack(action.scanId, action.choices);
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-import-result', { detail: result || {} }));
      if (result?.ok) {
        window.dispatchEvent(new CustomEvent('madstation:theme-imported', { detail: result.catalog }));
        showToast(`Imported ${result.installed?.length || 0} theme${result.installed?.length === 1 ? '' : 's'}. The updated themes are available now.`);
      } else if (!result?.canceled) showToast(result?.error || 'Could not import those themes.', true);
    }
  } catch (error) {
    if (action.type === 'export-theme-pack') {
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-export-result', { detail: { ok: false, error: error?.message || 'Could not export the theme design pack.' } }));
    } else if (action.type === 'scan-theme-pack') {
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-scan-result', { detail: { ok: false, error: error?.message || 'Could not scan the current themes.' } }));
    } else if (action.type === 'remove-imported-theme') {
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-remove-result', { detail: { ok: false, error: error?.message || 'Could not update the installed theme catalogue.' } }));
    } else if (action.type === 'scan-theme-import') {
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-import-scan-result', { detail: { ok: false, error: error?.message || 'Could not scan this theme ZIP.' } }));
    } else if (action.type === 'import-theme-pack') {
      window.dispatchEvent(new CustomEvent('madstation:developer-theme-import-result', { detail: { ok: false, error: error?.message || 'Could not import the selected themes.' } }));
    }
    showToast(error?.message || 'Could not complete that developer action.', true);
  }
});
$('settingsSearch').addEventListener('input', filterSettings);
// On narrow windows the rail is icons only; the search icon opens it full-size.
$('stSearchBox').addEventListener('click', () => { if (window.matchMedia('(max-width: 860px)').matches) { document.querySelector('.st-nav').classList.add('expanded'); $('settingsSearch').focus(); } });
document.addEventListener('mousedown', (e) => { const nav = document.querySelector('.st-nav'); if (nav.classList.contains('expanded') && !e.target.closest('.st-nav')) nav.classList.remove('expanded'); });
$('settingsSearchClear').addEventListener('click', () => { clearSettingsSearch(); $('settingsSearch').focus(); });


function normalizeRendererConfigSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return {
    ...state,
    ...snapshot,
    services: Array.isArray(snapshot.services) ? snapshot.services.filter(isRecord) : state.services,
    accounts: Array.isArray(snapshot.accounts) ? snapshot.accounts.filter(isRecord) : state.accounts,
    settings: isRecord(snapshot.settings) ? snapshot.settings : state.settings,
    recentAccountIds: Array.isArray(snapshot.recentAccountIds) ? snapshot.recentAccountIds : (state.recentAccountIds || []),
  };
}

let startupWorkspaceApplied = false;
window.aiHub.onConfig((cfg) => {
  const nextState = normalizeRendererConfigSnapshot(cfg);
  if (!nextState) {
    console.error('[Mad Station] Ignored invalid config snapshot; existing renderer state was retained.');
    return;
  }
  state = nextState;
  render();
  if (!startupWorkspaceApplied && !state.locked) {
    startupWorkspaceApplied = true;
    const target = state.settings?.startupWorkspace || 'launcher';
    if (target !== 'launcher') openWorkspaceApp(target).catch(() => {});
  }
  if (currentApp === 'ai-lab') refreshAiHubLabModels().catch(() => {});
  if (currentApp === 'instruction-forge') refreshAiHubLabModels().then(renderForgeAccounts).catch(() => {});
});
window.aiHub.onNotice(({ message }) => { notifications.unshift({ message, title: 'Mad Station', at: Date.now() }); notifications=notifications.slice(0,50); renderNotifications(); showToast(message); });
function updateActiveAccountUi(id) {
  state.activeId = id;

  // Update only the selected account styling. Keep all existing sidebar DOM nodes
  // (icons, popovers, provider filters, menu buttons) intact.
  document.querySelectorAll('#accounts .account-row').forEach((row) => {
    const button = row.querySelector('.account-btn');
    const isActive = button?.dataset.accountId === id;
    row.classList.toggle('active', isActive);
    if (button) {
      if (isActive) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      const name = button.querySelector('.account-name')?.textContent || 'Account';
      button.setAttribute('aria-label', `${name}${isActive ? ' · Open' : ''}`);
      const pill = row.querySelector('.live-pill');
      if (pill) pill.textContent = isActive ? 'Open' : '';
    }
  });
  document.querySelectorAll('#settingsAccountList .mini-account-select').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.id === id);
  });

  document.querySelectorAll('#providerTiles [data-provider-filter]').forEach((btn) => {
    const selected = !$('search').value.trim() && providerFilter === btn.dataset.providerFilter;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-selected', String(selected));
  });
}

window.aiHub.onActiveChanged(({ id }) => { updateActiveAccountUi(id); });
window.aiHub.onForgeBrowserState((snapshot) => { updateForgeBrowserUi(snapshot); scheduleForgeBrowserLayout(); });
window.aiHub.onWorkspaceApp(({ app }) => {
  const next = ['launcher', 'ai-hub', 'clipboard', 'ai-lab', 'instruction-forge', 'video-hub'].includes(app) || app === 'image-hub' ? app : 'launcher';
  if (next === currentApp) {
    updateWorkspaceView();
    if (next === 'image-hub') {
      lastImageHubBrowserLayoutKey = '';
      scheduleImageHubBrowserLayout();
      const existing = imageHubActive();
      if (existing && !imageHubNativeBrowserAvailable && !imageHubOpeningAccountId) imageHubSwitchAccount(existing.id);
    }
    if (next === 'video-hub') { lastVideoHubBrowserLayoutKey = ''; scheduleVideoHubBrowserLayout(); }
    return;
  }
  closeNotifications();
  currentApp = next;
  syncMemoryMonitor();
  lastArenaLayoutKey = '';
  if (next !== 'ai-hub') {
    $('settingsScreen').classList.add('hidden');
  }
  updateWorkspaceView();
  if (next === 'image-hub') {
    lastImageHubBrowserLayoutKey = '';
    scheduleImageHubBrowserLayout();
    const existing = imageHubActive();
    if (existing && !imageHubNativeBrowserAvailable && !imageHubOpeningAccountId) imageHubSwitchAccount(existing.id);
  }
  if (next === 'video-hub') { lastVideoHubBrowserLayoutKey = ''; scheduleVideoHubBrowserLayout(); }
  if (next === 'clipboard') {
    renderClipboard();
    updateClipboardComposer();
  }
  if (next === 'ai-lab') initAiLab();
  if (next === 'instruction-forge') initInstructionForge();
});
window.aiHub.onControlMode(({ mode }) => { if (mode === 'settings') $('settingsScreen').classList.remove('hidden'); else $('settingsScreen').classList.add('hidden'); updateWorkspaceView(); });
window.aiHub.onPageTitle(({ id, title }) => { if (!state.locked && id === state.activeId && title) document.title = `${title} — Mad Station`; });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && memoryProcessesModalOpen) { closeMemoryProcessesModal(); event.stopPropagation(); }
});
window.addEventListener('keydown', handleRecordingKey, true);
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!$('settingsScreen').classList.contains('hidden')) { $('settingsSearch')?.focus(); $('settingsSearch')?.select(); } else if (currentApp === 'ai-hub') { $('search').focus(); $('search').select(); } else if (currentApp === 'clipboard') { $('clipboardSearch').focus(); $('clipboardSearch').select(); } else if (currentApp === 'image-hub') { imageHubSetTab('studio'); if (imageHubUi.collapsed) { imageHubToggleSidebar(); } $('imageHubSearch')?.focus(); $('imageHubSearch')?.select(); } else if (currentApp === 'video-hub') { openVideoHubTab('studio'); if (videoHubUi.collapsed) { videoHubUi.collapsed = false; saveVideoHubUi(); applyVideoHubSidebarState(); } $('videoHubSearch')?.focus(); $('videoHubSearch')?.select(); } }
  if (event.key === 'Escape') { if (!$('notificationPanel').classList.contains('hidden')) { closeNotifications(); return; } if (state.locked) return; if (!$('settingsScreen').classList.contains('hidden')) { if (document.querySelector('.st-nav.expanded')) document.querySelector('.st-nav').classList.remove('expanded'); else if (settingsQuery()) clearSettingsSearch(); else closeSettings(); return; } if (!$('clipboardSettingsModal').classList.contains('hidden')) { saveClipboardSettings(); return; } if (!$('instructionSettingsModal')?.classList.contains('hidden')) { closeInstructionSettings(); return; } if (!$('aiLabSettingsModal')?.classList.contains('hidden')) { closeAiLabSettings(); return; } if (!$('notesSettingsModal')?.classList.contains('hidden')) { closeNotesSettings(); return; } if (!$('todoSettingsModal')?.classList.contains('hidden')) { closeTodoSettings(); return; } if (currentApp === 'clipboard') { goToLauncher(); return; } if (!$('ctxMenu').classList.contains('hidden')) closeCtxMenu(); else if (!$('renameModal').classList.contains('hidden')) closeRenameModal(); else if (!$('passwordModal').classList.contains('hidden')) closePasswordModal(); else if (!$('downloadsModal').classList.contains('hidden')) closeDownloadsModal(); else if (!$('providerModal').classList.contains('hidden')) closeProviderModal(); else if (!$('accountModal').classList.contains('hidden')) closeAccountModal(); }
});

// ---------------------------------------------------------------------------
// Security settings, app lock
// ---------------------------------------------------------------------------
function applySecurityUi() {
  const sec = state.settings?.security || {};
  const reactSecurityKeys = new Set(['lockOnLaunch', 'lockOnSystemLock', 'lockOnMinimize', 'lockOnIdle']);
  document.querySelectorAll('[data-sec]').forEach((input) => {
    if (reactSecurityKeys.has(input.dataset.sec)) return;
    if (input.closest('#aiHubPrivacyReactMount, #aiHubWebsitesReactMount')) return;
    input.checked = Boolean(sec[input.dataset.sec]);
  });
  document.querySelectorAll('[data-sec-choice]').forEach((group) => {
    if (group.dataset.secChoice === 'idleMinutes') return;
    group.querySelectorAll('button').forEach((button) => button.classList.toggle('active', Number(button.dataset.value) === sec[group.dataset.secChoice]));
  });
  const has = Boolean(state.hasPassword);
  $('passwordStatus').textContent = has ? 'Password is set. App lock is active.' : 'No password set. App lock is off.';
  $('setPasswordBtn').textContent = has ? 'Change password' : 'Set password';
  $('lockNowBtn').classList.toggle('hidden', !has);
  $('removePasswordBtn').classList.toggle('hidden', !has);
  $('lockBtn').classList.toggle('hidden', !has);
  $('lockOptions').classList.toggle('disabled', !has);
  const needsRestart = Boolean(state.runtime) && Boolean(sec.disableDiskCache) !== Boolean(state.runtime.diskCacheDisabledAtLaunch);
  $('restartNotice').classList.toggle('hidden', !needsRestart);
  $('restartBtn').classList.toggle('hidden', !needsRestart);
  publishSecurityControls();
}

function publishLockScreenState() {
  if (!lockScreenReactMounted) return;
  // The state event carries visibility only; password material never enters event detail.
  window.dispatchEvent(new CustomEvent('madstation:lock-screen-state', { detail: { locked: Boolean(state.locked) } }));
}
function applyLockUi() {
  const overlay = $('lockScreen');
  const wasLocked = !overlay.classList.contains('hidden');
  overlay.classList.toggle('hidden', !state.locked);
  publishLockScreenState();
  if (state.locked && !wasLocked) {
      closeAccountModal(); closeProviderModal(); closePasswordModal(); closeRenameModal(); closeDownloadsModal(); closeCtxMenu();
    // Download names are not kept in the page while locked; the main process re-sends them on unlock.
    downloadState = { items: [], active: 0, folder: downloadState.folder };
    $('downloadsList')?.replaceChildren();
    $('lockPassword').value = ''; $('lockError').textContent = '';
    document.title = 'Mad Station';
    if (!lockScreenReactMounted) setTimeout(() => { if (!lockScreenReactMounted) $('lockPassword').focus(); }, 60);
  }
}

async function updateSecurity(patch) {
  const result = await window.aiHub.setSecuritySettings(patch);
  if (!result?.ok) {
    if (videoHubSettingsModalOpen) publishVideoHubSettings();
    return showToast(result?.error || 'Could not save setting.', true);
  }
  state.settings = result.settings; render();
  if (videoHubSettingsModalOpen) publishVideoHubSettings();
}

function passwordModalViewModel(visible = !$('passwordModal').classList.contains('hidden')) {
  return { mode: passwordMode, visible: Boolean(visible), saving: passwordModalSaving, error: String(passwordModalError || '').slice(0, 400) };
}
function publishPasswordModal(visible) {
  window.dispatchEvent(new CustomEvent('madstation:password-modal-state', { detail: passwordModalViewModel(visible) }));
}
function openPasswordModal(mode) {
  if (!['set', 'change', 'remove'].includes(mode)) return;
  passwordMode = mode; passwordModalOperationId += 1; passwordModalSaving = false; passwordModalError = '';
  const titles = { set: 'Set password', change: 'Change password', remove: 'Remove password' };
  $('passwordModalTitle').textContent = titles[mode];
  $('pwCurrentRow').classList.toggle('hidden', mode === 'set');
  $('pwNewRow').classList.toggle('hidden', mode === 'remove');
  $('pwConfirmRow').classList.toggle('hidden', mode === 'remove');
  $('savePasswordBtn').textContent = mode === 'remove' ? 'Remove password' : 'Save password';
  $('savePasswordBtn').disabled = false;
  ['pwCurrent', 'pwNew', 'pwConfirm'].forEach((id) => { $(id).value = ''; });
  $('pwError').textContent = '';
  $('passwordModal').classList.remove('hidden');
  if (passwordModalReactMounted) publishPasswordModal(true);
  else (mode === 'set' ? $('pwNew') : $('pwCurrent')).focus();
  syncOverlayMode();
}
function closePasswordModal() {
  passwordModalOperationId += 1; passwordModalSaving = false; passwordModalError = '';
  $('passwordModal').classList.add('hidden');
  ['pwCurrent', 'pwNew', 'pwConfirm'].forEach((id) => { $(id).value = ''; });
  $('pwError').textContent = ''; $('savePasswordBtn').disabled = false;
  if (passwordModalReactMounted) publishPasswordModal(false);
  syncOverlayMode();
}
function setPasswordModalError(message) {
  passwordModalError = String(message || 'Could not save the password.').slice(0, 400);
  $('pwError').textContent = passwordModalError;
  if (passwordModalReactMounted) publishPasswordModal(true);
}
async function handlePasswordModalSubmit(rawValues) {
  if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues) || passwordModalSaving || $('passwordModal').classList.contains('hidden')) return;
  let prototype; let current; let next; let confirm;
  try {
    prototype = Object.getPrototypeOf(rawValues);
    if (prototype !== Object.prototype && prototype !== null) return;
    current = rawValues.current; next = rawValues.next; confirm = rawValues.confirm;
  } catch { return setPasswordModalError('Password fields are invalid.'); }
  if (typeof current !== 'string' || typeof next !== 'string' || typeof confirm !== 'string' || current.length > 256 || next.length > 256 || confirm.length > 256) return setPasswordModalError('Password fields must be at most 256 characters.');
  const mode = passwordMode;
  if (mode !== 'remove') {
    if (next.length < 8) return setPasswordModalError('Use at least 8 characters.');
    if (next !== confirm) return setPasswordModalError('The two passwords do not match.');
  }
  const operationId = passwordModalOperationId;
  passwordModalSaving = true; passwordModalError = ''; $('savePasswordBtn').disabled = true;
  if (passwordModalReactMounted) publishPasswordModal(true);
  let result;
  try {
    result = mode === 'remove'
      ? await window.aiHub.removeAppPassword({ current })
      : await window.aiHub.setAppPassword({ current, next });
  } catch { result = { ok: false, error: 'Could not save the password.' }; }
  if (operationId !== passwordModalOperationId || mode !== passwordMode) return;
  passwordModalSaving = false; $('savePasswordBtn').disabled = false;
  if (!result?.ok) {
    setPasswordModalError(typeof result?.error === 'string' ? result.error : 'Could not save the password.');
    return;
  }
  closePasswordModal();
  showToast(mode === 'remove' ? 'App lock turned off.' : 'Password saved. App lock is on.');
}
window.MadStationPasswordModal = {
  close: closePasswordModal,
  submit(values) { void handlePasswordModalSubmit(values); },
};
window.addEventListener('madstation:password-modal-mounted', () => {
  passwordModalReactMounted = true;
  const legacy = $('passwordFormLegacy'); const mount = $('passwordFormReactMount');
  if (legacy) legacy.hidden = true;
  if (mount) mount.hidden = false;
  publishPasswordModal(!$('passwordModal').classList.contains('hidden'));
});

document.querySelectorAll('[data-sec]').forEach((input) => { if (!['lockOnLaunch', 'lockOnSystemLock', 'lockOnMinimize', 'lockOnIdle'].includes(input.dataset.sec)) input.addEventListener('change', () => updateSecurity({ [input.dataset.sec]: input.checked })); });
document.querySelectorAll('[data-sec-choice] button').forEach((button) => { if (button.parentElement.dataset.secChoice !== 'idleMinutes') button.addEventListener('click', () => updateSecurity({ [button.parentElement.dataset.secChoice]: Number(button.dataset.value) })); });

$('setPasswordBtn').addEventListener('click', () => openPasswordModal(state.hasPassword ? 'change' : 'set'));
$('removePasswordBtn').addEventListener('click', () => openPasswordModal('remove'));
$('lockNowBtn').addEventListener('click', () => window.aiHub.lockNow(currentApp));
$('lockBtn').addEventListener('click', () => window.aiHub.lockNow(currentApp));
$('closePasswordModal').addEventListener('click', closePasswordModal);
$('cancelPasswordBtn').addEventListener('click', closePasswordModal);
$('passwordModal').addEventListener('click', (event) => { if (event.target === $('passwordModal')) closePasswordModal(); });
$('passwordFormLegacy').addEventListener('submit', (event) => {
  event.preventDefault();
  void handlePasswordModalSubmit({ current: $('pwCurrent').value, next: $('pwNew').value, confirm: $('pwConfirm').value });
});

window.MadStationLockScreen = {
  async submit(rawPassword) {
    if (!state.locked) return { ok: false, error: 'App is not locked.' };
    if (typeof rawPassword !== 'string' || rawPassword.length < 1 || rawPassword.length > 256) return { ok: false, error: 'Enter a valid password.' };
    try {
      const result = await window.aiHub.unlock(rawPassword);
      if (!result?.ok) return { ok: false, error: typeof result?.error === 'string' ? result.error.slice(0, 400) : 'Incorrect password.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not unlock Mad Station. Try again.' };
    }
  },
  async reset() {
    if (!state.locked) return { ok: false, error: 'App is not locked.' };
    if (!window.confirm('Reset the app lock?\n\nThis removes the password AND signs you out of every account (all saved logins are deleted). Your providers and accounts list is kept.')) return { ok: false, cancelled: true };
    try {
      const result = await window.aiHub.resetAppLock();
      if (!result?.ok) return { ok: false, error: typeof result?.error === 'string' ? result.error.slice(0, 400) : 'Could not reset the lock.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reset the lock.' };
    }
  },
};
window.addEventListener('madstation:lock-screen-mounted', () => {
  lockScreenReactMounted = true;
  const legacy = $('lockForm'); const mount = $('lockScreenReactMount');
  if (legacy) legacy.hidden = true;
  if (mount) mount.hidden = false;
  publishLockScreenState();
});
$('lockForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('lockPassword').value; if (!password) return;
  $('lockSubmit').disabled = true;
  const result = await window.aiHub.unlock(password);
  $('lockSubmit').disabled = false;
  if (!result?.ok) { $('lockError').textContent = result?.error || 'Incorrect password.'; $('lockPassword').select(); return; }
  $('lockPassword').value = '';
});
$('forgotPasswordBtn').addEventListener('click', async () => {
  if (!window.confirm('Reset the app lock?\n\nThis removes the password AND signs you out of every account (all saved logins are deleted). Your providers and accounts list is kept.')) return;
  const result = await window.aiHub.resetAppLock();
  if (!result?.ok) $('lockError').textContent = result?.error || 'Could not reset the lock.';
});

async function runClearCacheNow() {
  const result = await window.aiHub.clearCacheNow();
  showToast(result?.ok ? 'Cache cleared.' : (result?.error || 'Could not clear cache.'), !result?.ok);
  return Boolean(result?.ok);
}
const legacyClearCacheNowButton = $('clearCacheNowBtn');
legacyClearCacheNowButton?.addEventListener('click', runClearCacheNow);
const AIHUB_PRIVACY_SECURITY_KEYS = new Set([
  'clearCacheOnExit', 'signOutOnExit', 'disableDiskCache', 'contentProtection', 'spellcheck', 'blockDevTools',
  'blockPopups', 'restrictNavigation', 'allowLoginProviders', 'blockHttp', 'allowCamera', 'allowMicrophone', 'allowNotifications', 'allowFullscreen',
]);
window.addEventListener('madstation:ai-hub-security-panels-action', async (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object') return;
  if (action.type === 'setting') {
    if (!AIHUB_PRIVACY_SECURITY_KEYS.has(action.key) || typeof action.value !== 'boolean') return;
    await updateSecurity({ [action.key]: action.value });
    return;
  }
  if (action.type === 'clear-cache-now') {
    const ok = await runClearCacheNow();
    window.dispatchEvent(new CustomEvent('madstation:ai-hub-security-panel-result', { detail: { type: 'clear-cache-now', ok } }));
  }
});
$('restartBtn').addEventListener('click', () => window.aiHub.restartApp());

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
let downloadState = { items: [], active: 0, folder: '' };

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024; let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function downloadMeta(item) {
  const parts = [];
  if (item.kind === 'managed' && item.category) parts.push(item.category);
  if (item.state === 'progressing') {
    const size = item.total ? `${formatBytes(item.received)} of ${formatBytes(item.total)}` : formatBytes(item.received);
    parts.push(item.paused ? `Paused · ${size}` : size);
    if (Number(item.sourceCount) > 1) parts.push(`Source ${Number(item.sourceIndex || 0) + 1}/${item.sourceCount} · ${item.sourceName || item.host || ''}`);
  } else if (item.state === 'interrupted') parts.push('Interrupted · can be resumed');
  else if (item.state === 'completed') parts.push(formatBytes(item.total || item.received));
  else if (item.state === 'failed') parts.push('Failed');
  else if (item.state === 'cancelled') parts.push('Cancelled');
  if (item.kind !== 'managed' && item.accountName) parts.push(item.accountName);
  if (item.host) parts.push(item.host);
  if (item.program && item.state === 'completed') parts.push('Program or script: open it from its folder');
  return parts.join(' · ');
}

function bytesLabel(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

let downloadsReactRenderer = null;
function getDownloadsViewModel(items) {
  return {
    items: items.map((item) => {
      const hasProgress = item.state === 'progressing' || item.state === 'interrupted';
      const actions = [];
      const addAction = (action, label, className = 'tiny-btn') => actions.push({ action, label, className });
      if (item.kind === 'managed' && hasProgress) {
        addAction('cancel', 'Cancel', 'tiny-btn danger');
      } else if (hasProgress) {
        const resume = item.paused || item.state === 'interrupted';
        addAction(resume ? 'resume' : 'pause', resume ? 'Resume' : 'Pause');
        addAction('cancel', 'Cancel', 'tiny-btn danger');
      } else {
        if (item.canOpen) addAction('open', 'Open', 'secondary');
        if (item.canShow) addAction('show', 'Show in folder');
        addAction('remove', 'Remove');
      }
      return {
        id: String(item.id || ''),
        state: String(item.state || ''),
        kind: String(item.kind || 'browser'),
        name: String(item.displayName || item.name || ''),
        meta: downloadMeta(item),
        hasProgress,
        progress: item.total ? Math.min(100, Math.round((item.received / item.total) * 100)) : 0,
        indeterminate: hasProgress && !item.total,
        actions,
      };
    }),
  };
}
function renderDownloads() {
  const items = downloadState.items || [];
  // Sidebar entry: only shown once there is something to show.
  $('downloadsBtn').classList.toggle('hidden', !items.length || state.locked);
  const badge = $('downloadsBadge');
  badge.textContent = downloadState.active;
  badge.classList.toggle('hidden', !downloadState.active);

  const list = $('downloadsList');
  const model = getDownloadsViewModel(items);
  if (typeof downloadsReactRenderer === 'function') {
    downloadsReactRenderer(model);
  } else {
    // Startup fallback only until the React entry attaches.
    list.innerHTML = !model.items.length
      ? '<div class="dl-empty"><strong>No downloads yet</strong><span>Files you download from your accounts will appear here.</span></div>'
      : model.items.map((item) => {
        const bar = item.hasProgress
          ? `<div class="dl-bar${item.indeterminate ? ' indeterminate' : ''}"><i data-pct="${item.progress}"></i></div>` : '';
        const actions = item.actions.map((action) => `<button type="button" class="${action.className}" data-dl-action="${action.action}" data-dl-id="${escapeHtml(item.id)}">${action.label}</button>`).join('');
        return `<div class="dl-row" data-state="${escapeHtml(item.state)}" data-kind="${escapeHtml(item.kind)}"><span class="dl-ico">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>'}</span><div class="dl-main"><div class="dl-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div><div class="dl-meta">${escapeHtml(item.meta)}</div>${bar}</div><div class="dl-actions">${actions}</div></div>`;
      }).join('');
    // Inline style attributes are blocked by the app CSP, so widths are set through the DOM.
    list.querySelectorAll('.dl-bar i[data-pct]').forEach((el) => { el.style.width = `${el.dataset.pct}%`; });
  }
  $('dlClearBtn').disabled = !items.some((item) => item.state !== 'progressing' && item.state !== 'interrupted');
  applyDownloadSettings();
}
window.MadStationDownloads = {
  attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    downloadsReactRenderer = renderer;
    renderDownloads();
  },
};
function applyDownloadSettings() {
  publishDownloadsSettingsControls();
}

async function refreshDownloads() {
  const result = await window.aiHub.getDownloads();
  if (result?.ok === false) return;
  downloadState = { items: result.items || [], active: result.active || 0, folder: result.folder || '' };
  renderDownloads();
}
async function openDownloadsModal() { $('downloadsModal').classList.remove('hidden'); await refreshDownloads(); }
function closeDownloadsModal() { $('downloadsModal').classList.add('hidden'); }
async function runDownloadAction(action, id) {
  const result = await window.aiHub.downloadAction(action, id);
  if (result?.ok === false) showToast(result.error || 'That did not work.', true);
}

$('downloadsBtn').addEventListener('click', openDownloadsModal);
$('closeDownloadsModal').addEventListener('click', closeDownloadsModal);
$('downloadsModal').addEventListener('click', (event) => { if (event.target === $('downloadsModal')) closeDownloadsModal(); });
$('downloadsList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-dl-action]');
  if (button) runDownloadAction(button.dataset.dlAction, button.dataset.dlId);
});
$('dlClearBtn').addEventListener('click', () => runDownloadAction('clear-finished'));
$('dlOpenFolderBtn').addEventListener('click', () => runDownloadAction('open-folder'));
window.addEventListener('madstation:downloads-settings-controls-action', async (event) => {
  const action = event?.detail;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
  if (action.type === 'open-downloads') { await openDownloadsModal(); return; }
  if (action.type === 'open-folder') { await runDownloadAction('open-folder'); return; }
  if (action.type === 'choose-folder') {
    const result = await window.aiHub.chooseDownloadFolder();
    if (result?.canceled) return;
    showToast(result?.ok ? 'Download folder updated.' : (result?.error || 'Could not change the folder.'), !result?.ok);
    if (result?.ok) await refreshDownloads();
    return;
  }
  if (action.type === 'reset-folder') {
    const result = await window.aiHub.setDownloadSettings({ folder: '' });
    showToast(result?.ok ? 'Using your Downloads folder.' : 'Could not save setting.', !result?.ok);
    if (result?.ok) await refreshDownloads();
    return;
  }
  if (action.type === 'setting' && ['askWhereToSave', 'notifyWhenDone'].includes(action.key) && typeof action.value === 'boolean') {
    const result = await window.aiHub.setDownloadSettings({ [action.key]: action.value });
    if (!result?.ok) showToast(result?.error || 'Could not save setting.', true);
    else await refreshDownloads();
  }
});
window.aiHub.onDownloads((data) => {
  downloadState = { items: data.items || [], active: data.active || 0, folder: data.folder || '' };
  renderDownloads();
});
refreshDownloads();

// ---------------------------------------------------------------------------
// Dialogs need the whole window. The app UI lives in a sidebar-sized view, so while any
// dialog is open we ask the main process to give it the full window (and restore afterwards).
// ---------------------------------------------------------------------------
let lastOverlayMode = 'app';
function syncOverlayMode() {
  if (state.locked) { lastOverlayMode = 'app'; return; }
  const settingsOpen = !$('settingsScreen').classList.contains('hidden');
  const dialogOpen = ['accountModal', 'providerModal', 'passwordModal', 'renameModal', 'downloadsModal'].some((id) => !$(id).classList.contains('hidden')) || ['clipboardSettingsModal', 'instructionSettingsModal', 'aiLabSettingsModal', 'imageHubSettingsOverlay'].some((id) => !$(id).classList.contains('hidden')) || ['notesSettingsModal', 'todoSettingsModal'].some((id) => !$(id).classList.contains('hidden'));
  const baseMode = currentApp === 'ai-hub' ? 'app' : 'launcher';
  const mode = settingsOpen ? 'settings' : dialogOpen ? 'dialog' : baseMode;
  if (mode === lastOverlayMode) return;
  lastOverlayMode = mode;
  window.aiHub.setControlMode(mode);
}
const overlayObserver = new MutationObserver(syncOverlayMode);
['settingsScreen', 'accountModal', 'providerModal', 'passwordModal', 'renameModal', 'downloadsModal', 'clipboardSettingsModal', 'instructionSettingsModal', 'aiLabSettingsModal', 'imageHubSettingsOverlay'].forEach((id) => overlayObserver.observe($(id), { attributes: true, attributeFilter: ['class'] })); ['notesSettingsModal', 'todoSettingsModal'].forEach((id) => overlayObserver.observe($(id), { attributes: true, attributeFilter: ['class'] }));