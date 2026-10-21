import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

export type ClipboardFilter = 'all' | 'pinned' | 'links' | 'code';
export type TodoFilter = 'all' | 'open' | 'done';
export type UtilityTab = 'clipboard' | 'notes' | 'todo';
export interface ClipboardSettingsModel {
  maxItems: 25 | 50 | 100 | 250 | 500;
  trimWhitespace: boolean;
  confirmClear: boolean;
  maxLength: number;
  defaultSort: 'newest' | 'oldest';
  focusComposerOnOpen: boolean;
}
export interface TodoSettingsModel {
  maxItems: 50 | 100 | 200 | 500 | 1000;
  defaultSort: 'newest' | 'oldest';
  hideCompleted: boolean;
  confirmDelete: boolean;
}
export interface ClipboardWorkspaceModel {
  activeTab: UtilityTab;
  totalCount: number;
  pinnedLinksCount: number;
  todayCount: number;
  draft: { editingId: string | null; text: string };
  search: string;
  filter: ClipboardFilter;
  sort: 'newest' | 'oldest';
  historyTitle: string;
  historyMeta: string;
  settingsVisible: boolean;
  settings: ClipboardSettingsModel;
}
export interface TodoWorkspaceModel {
  openCount: number;
  listMeta: string;
  filter: TodoFilter;
  settingsVisible: boolean;
  settings: TodoSettingsModel;
}
export interface UtilityWorkspacesController {
  updateClipboard(model: ClipboardWorkspaceModel): void;
  updateTodo(model: TodoWorkspaceModel): void;
}

type ClipboardAction =
  | { type: 'draft-change'; text: string }
  | { type: 'save' }
  | { type: 'cancel-edit' }
  | { type: 'search-change'; value: string }
  | { type: 'filter-change'; value: ClipboardFilter }
  | { type: 'sort-change'; value: 'newest' | 'oldest' }
  | { type: 'clear-all' }
  | { type: 'utility-tab-change'; value: UtilityTab }
  | { type: 'settings-open'; value: UtilityTab }
  | { type: 'settings-save'; settings: ClipboardSettingsModel };
type TodoAction =
  | { type: 'add'; text: string }
  | { type: 'filter-change'; value: TodoFilter }
  | { type: 'settings-save'; settings: TodoSettingsModel };

const EMPTY_CLIPBOARD_SETTINGS: ClipboardSettingsModel = { maxItems: 250, trimWhitespace: true, confirmClear: true, maxLength: 10000, defaultSort: 'newest', focusComposerOnOpen: false };
const EMPTY_TODO_SETTINGS: TodoSettingsModel = { maxItems: 200, defaultSort: 'newest', hideCompleted: false, confirmDelete: true };
const EMPTY_CLIPBOARD: ClipboardWorkspaceModel = {
  activeTab: 'clipboard', totalCount: 0, pinnedLinksCount: 0, todayCount: 0, draft: { editingId: null, text: '' }, search: '', filter: 'all', sort: 'newest',
  historyTitle: 'Recent clips', historyMeta: '0 shown · 0 stored', settingsVisible: false, settings: EMPTY_CLIPBOARD_SETTINGS,
};
const EMPTY_TODO: TodoWorkspaceModel = { openCount: 0, listMeta: '0 tasks', filter: 'all', settingsVisible: false, settings: EMPTY_TODO_SETTINGS };

const CLIPBOARD_FILTERS: Array<{ value: ClipboardFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'pinned', label: 'Pinned' }, { value: 'links', label: 'Links' }, { value: 'code', label: 'Code' },
];
const TODO_FILTERS: Array<{ value: TodoFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'done', label: 'Done' },
];

declare global {
  interface Window { MadStationUtilityWorkspaces?: UtilityWorkspacesController; }
}

function dispatchClipboard(action: ClipboardAction) {
  window.dispatchEvent(new CustomEvent<ClipboardAction>('madstation:clipboard-workspace-action', { detail: action }));
}
function dispatchTodo(action: TodoAction) {
  window.dispatchEvent(new CustomEvent<TodoAction>('madstation:todo-workspace-action', { detail: action }));
}
function GearIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3h0a1.7 1.7 0 0 0-1 1.5v.1a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5h0a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9v0a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1v0a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>; }
function SearchIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>; }
function BackIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>; }

function UtilityTabs({ activeTab }: { activeTab: UtilityTab }) {
  const tabs: Array<{ value: UtilityTab; label: string; glyph: ReactNode }> = [
    { value: 'clipboard', label: 'Clips', glyph: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></> },
    { value: 'notes', label: 'Notes', glyph: <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/> },
    { value: 'todo', label: 'To-do list', glyph: <path d="M5 12.5l4.5 4.5L19 7.5"/> },
  ];
  return <>{tabs.map((tab) => <button key={tab.value} className={`clipboard-tab${activeTab === tab.value ? ' active' : ''}`} type="button" role="tab" aria-selected={activeTab === tab.value} data-utility-tab={tab.value} onClick={() => dispatchClipboard({ type: 'utility-tab-change', value: tab.value })}><span className="tab-ico"><svg aria-hidden="true" viewBox="0 0 24 24" className="glyph-ico">{tab.glyph}</svg></span>{tab.label}</button>)}</>;
}
function UtilitySettingsButtons({ activeTab }: { activeTab: UtilityTab }) {
  const labels: Record<UtilityTab, { id: string; label: string }> = {
    clipboard: { id: 'clipboardSettingsBtn', label: 'Notes & Tasks settings' },
    notes: { id: 'notesSettingsBtn', label: 'Notes settings' },
    todo: { id: 'todoSettingsBtn', label: 'To-do list settings' },
  };
  const setting = labels[activeTab];
  return <button className="icon-only clipboard-settings-btn standalone-settings-btn" id={setting.id} type="button" aria-label={setting.label} title={setting.label} onClick={() => dispatchClipboard({ type: 'settings-open', value: activeTab })}><GearIcon/></button>;
}

function ClipboardComposer({ model }: { model: ClipboardWorkspaceModel }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const count = model.draft.text.length;
  const words = model.draft.text.trim() ? model.draft.text.trim().split(/\s+/).length : 0;
  const type = /^(https?:\/\/|www\.)\S+$/i.test(model.draft.text.trim()) ? 'Link' : /^(?:[$#]\s*)?(?:npm|npx|yarn|pnpm|git|cd|curl|docker|python|node|powershell|pwsh|pip|brew)\b/i.test(model.draft.text.trim()) || /[{};]\s*$/.test(model.draft.text.trim()) || /^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(model.draft.text.trim()) ? 'Code-like text' : 'Plain text';
  useEffect(() => { if (model.draft.editingId) { textarea.current?.focus(); textarea.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, [model.draft.editingId]);
  function save(event?: FormEvent) { event?.preventDefault(); if (!model.draft.text.trim()) { textarea.current?.focus(); dispatchClipboard({ type: 'save' }); return; } dispatchClipboard({ type: 'save' }); }
  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save(); } }
  return <>
    <div className="clipboard-section-head"><div><span className="eyebrow">{model.draft.editingId ? 'EDIT CLIP' : 'SAVE CLIP'}</span><h2>{model.draft.editingId ? 'Update this clip' : 'Paste something to keep'}</h2><p>Use Ctrl+V from anywhere, then save the pasted text as a clip.</p></div>{model.draft.editingId ? <button className="icon-only" type="button" title="Cancel editing" aria-label="Cancel editing" onClick={() => dispatchClipboard({ type: 'cancel-edit' })}>×</button> : null}</div>
    <textarea ref={textarea} id="clipboardInput" rows={8} maxLength={50000} placeholder="Paste or type something you want to keep…" value={model.draft.text}
      onChange={(event) => dispatchClipboard({ type: 'draft-change', text: event.currentTarget.value })}
      onPaste={(event) => { const text = event.clipboardData.getData('text/plain'); if (!text) return; event.preventDefault(); const input = event.currentTarget; const start = input.selectionStart; const end = input.selectionEnd; const value = model.draft.text.slice(0, start) + text + model.draft.text.slice(end); dispatchClipboard({ type: 'draft-change', text: value }); requestAnimationFrame(() => { input.setSelectionRange(start + text.length, start + text.length); }); }}
      onKeyDown={onKeyDown} aria-label="Clip text" />
    <div className="clipboard-compose-tools"><span className="clipboard-type-hint">{type}</span><span>{count.toLocaleString()} characters · {words.toLocaleString()} words</span></div>
    <div className="clipboard-compose-footer"><span className="clipboard-shortcut-hint"><kbd>Ctrl</kbd><kbd>Enter</kbd> to save</span><button className="primary with-ico" type="button" onClick={() => save()}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>{model.draft.editingId ? 'Update clip' : 'Save clip'}</span></button></div>
  </>;
}

function ClipboardStats({ model }: { model: ClipboardWorkspaceModel }) {
  return <><div className="clipboard-stat"><span>Total clips</span><strong id="clipboardTotalCount">{model.totalCount}</strong></div><div className="clipboard-stat"><span>Pinned links</span><strong id="clipboardPinnedLinksCount">{model.pinnedLinksCount}</strong></div><div className="clipboard-stat"><span>Added today</span><strong id="clipboardTodayCount">{model.todayCount}</strong></div></>;
}
function ClipboardListHeader({ model }: { model: ClipboardWorkspaceModel }) {
  return <><div><span className="eyebrow">SAVED CLIPS</span><h2 id="clipboardHistoryTitle">{model.historyTitle}</h2><p id="clipboardHistoryMeta">{model.historyMeta}</p></div><div className="clipboard-list-actions"><label className="clipboard-search"><SearchIcon/><input id="clipboardSearch" placeholder="Search clips…" autoComplete="off" value={model.search} maxLength={200} onChange={(event) => dispatchClipboard({ type: 'search-change', value: event.currentTarget.value })} aria-label="Search clips"/><kbd>Ctrl F</kbd></label><button className="tiny-btn danger" id="clearClipboardBtn" type="button" onClick={() => dispatchClipboard({ type: 'clear-all' })}>Clear all</button></div></>;
}
function ClipboardToolbar({ model }: { model: ClipboardWorkspaceModel }) {
  return <><div className="clipboard-filters" role="tablist" aria-label="Clipboard filters">{CLIPBOARD_FILTERS.map((item) => <button key={item.value} className={`clipboard-filter${model.filter === item.value ? ' active' : ''}`} type="button" role="tab" aria-selected={model.filter === item.value} data-clipboard-filter={item.value} onClick={() => dispatchClipboard({ type: 'filter-change', value: item.value })}>{item.label}</button>)}</div><label className="clipboard-sort">Sort<select id="clipboardSort" value={model.sort} onChange={(event) => dispatchClipboard({ type: 'sort-change', value: event.currentTarget.value === 'oldest' ? 'oldest' : 'newest' })}><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label></>;
}
function TodoHero({ model }: { model: TodoWorkspaceModel }) {
  return <div className="utility-hero"><div><span className="eyebrow">TO-DO LIST</span><h2>Keep the next action obvious.</h2><p>Simple local tasks with completion state, filters, and quick removal.</p></div><span className="utility-count" id="todoCount">{model.openCount} open</span></div>;
}
function TodoComposer() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  function submit(event?: FormEvent) { event?.preventDefault(); const clean = text.trim(); if (!clean) { inputRef.current?.focus(); dispatchTodo({ type: 'add', text: '' }); return; } dispatchTodo({ type: 'add', text: clean }); setText(''); inputRef.current?.focus(); }
  return <form className="todo-composer" onSubmit={submit}><input ref={inputRef} id="todoInput" className="utility-title-input" placeholder="What needs to be done?" maxLength={240} autoComplete="off" value={text} onChange={(event) => setText(event.currentTarget.value)} aria-label="New task"/><button className="primary" id="addTodoBtn" type="submit">Add task</button></form>;
}
function TodoToolbar({ model }: { model: TodoWorkspaceModel }) {
  return <div className="todo-toolbar"><div className="todo-filters" role="tablist" aria-label="To-do filters">{TODO_FILTERS.map((item) => <button key={item.value} className={`todo-filter${model.filter === item.value ? ' active' : ''}`} type="button" role="tab" aria-selected={model.filter === item.value} data-todo-filter={item.value} onClick={() => dispatchTodo({ type: 'filter-change', value: item.value })}>{item.label}</button>)}</div><span id="todoListMeta">{model.listMeta}</span></div>;
}

function useSettingsDialog<T extends object>(visible: boolean, source: T, overlayId: string, onSave: (settings: T) => void) {
  const [draft, setDraft] = useState<T>(source);
  const draftRef = useRef(draft);
  const wasVisibleRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  // Only take a fresh settings snapshot when the dialog opens. Host state is
  // published on unrelated updates too, and must not erase staged user edits.
  useEffect(() => {
    if (visible && !wasVisibleRef.current) { wasVisibleRef.current = true; setDraft({ ...source }); }
    else if (!visible && wasVisibleRef.current) {
      wasVisibleRef.current = false;
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target?.isConnected) requestAnimationFrame(() => target.focus());
    }
  }, [visible, source]);
  useEffect(() => {
    if (!visible) return;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    const focusFirst = () => overlay.querySelector<HTMLElement>('select, input, button')?.focus();
    requestAnimationFrame(focusFirst);
    const onClick = (event: MouseEvent) => { if (event.target === overlay) onSave(draftRef.current); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); onSave(draftRef.current); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      if (event.shiftKey && (document.activeElement === focusable[0] || !overlay.contains(document.activeElement))) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && (document.activeElement === focusable[focusable.length - 1] || !overlay.contains(document.activeElement))) { event.preventDefault(); focusable[0].focus(); }
    };
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('keydown', onKeyDown, true);
    return () => { overlay.removeEventListener('click', onClick); overlay.removeEventListener('keydown', onKeyDown, true); };
  }, [visible, overlayId, onSave]);
  function patch<K extends keyof T>(key: K, value: T[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  return { draft, patch };
}

function ClipboardSettingsDialog({ model }: { model: ClipboardWorkspaceModel }) {
  const save = useCallback((settings: ClipboardSettingsModel) => dispatchClipboard({ type: 'settings-save', settings }), []);
  const { draft, patch } = useSettingsDialog<ClipboardSettingsModel>(model.settingsVisible, model.settings, 'clipboardSettingsModal', save);
  return <div className="ms-card ms-card--flat clipboard-settings-card">
    <div className="clipboard-settings-heading"><div className="clipboard-settings-icon ms-brand-tile"><GearIcon/></div><div><div className="modal-title">Clips settings</div><div className="modal-subtitle">Tune saved clips and history behavior for this workspace.</div></div><button aria-label="Back" className="close ms-icon-btn" id="closeClipboardSettings" type="button" title="Back" onClick={() => save(draft)}><BackIcon/></button></div>
    <div className="clipboard-settings-section"><div className="clipboard-settings-section-title ms-eyebrow">Storage</div><div className="clipboard-settings-section-subtitle ms-muted">Choose how much saved clipboard history stays on this device.</div><label className="clipboard-setting-label">History limit<select className="ms-input" id="clipboardMaxItems" value={draft.maxItems} onChange={(event) => patch('maxItems', Number(event.currentTarget.value) as ClipboardSettingsModel['maxItems'])}><option value="25">25 clips</option><option value="50">50 clips</option><option value="100">100 clips</option><option value="250">250 clips</option><option value="500">500 clips</option></select></label><label className="clipboard-setting-label">Maximum clip length<input className="ms-input" id="clipboardMaxLength" type="number" min={500} max={50000} step={500} value={draft.maxLength} onChange={(event) => patch('maxLength', Math.min(50000, Math.max(500, Number(event.currentTarget.value) || 500)))}/></label><label className="toggle-row"><input id="clipboardTrimWhitespace" type="checkbox" checked={draft.trimWhitespace} onChange={(event) => patch('trimWhitespace', event.currentTarget.checked)}/><span><strong>Clean surrounding whitespace</strong><small>Removes extra spaces and blank lines before a clip is saved.</small></span></label><label className="clipboard-setting-label">Default sort<select className="ms-input" id="clipboardDefaultSort" value={draft.defaultSort} onChange={(event) => patch('defaultSort', event.currentTarget.value === 'oldest' ? 'oldest' : 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><label className="toggle-row"><input id="clipboardFocusComposer" type="checkbox" checked={draft.focusComposerOnOpen} onChange={(event) => patch('focusComposerOnOpen', event.currentTarget.checked)}/><span><strong>Focus the clip editor when opened</strong><small>Place the cursor in the new-clip box whenever Clipboard opens.</small></span></label></div>
    <div className="clipboard-settings-section"><div className="clipboard-settings-section-title ms-eyebrow">Safety</div><div className="clipboard-settings-section-subtitle ms-muted">Reduce accidental changes to your saved history.</div><label className="toggle-row"><input id="clipboardConfirmClear" type="checkbox" checked={draft.confirmClear} onChange={(event) => patch('confirmClear', event.currentTarget.checked)}/><span><strong>Confirm before clearing all clips</strong><small>Ask before permanently removing every saved clip, including pinned clips.</small></span></label><div className="clipboard-privacy-note"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3l8 3v5c0 5.2-3.3 8.8-8 10-4.7-1.2-8-4.8-8-10V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg><span>Everything in Clipboard is saved only when you paste or type it here. Nothing is silently read from the system clipboard.</span></div></div>
    <div className="form-actions clipboard-settings-actions"><button className="ms-btn" id="cancelClipboardSettings" type="button" onClick={() => save(draft)}>Done</button></div>
  </div>;
}
function TodoSettingsDialog({ model }: { model: TodoWorkspaceModel }) {
  const save = useCallback((settings: TodoSettingsModel) => dispatchTodo({ type: 'settings-save', settings }), []);
  const { draft, patch } = useSettingsDialog<TodoSettingsModel>(model.settingsVisible, model.settings, 'todoSettingsModal', save);
  return <div className="ms-card ms-card--flat clipboard-settings-card">
    <div className="clipboard-settings-heading"><div className="clipboard-settings-icon ms-brand-tile"><GearIcon/></div><div><div className="modal-title">To-do list settings</div><div className="modal-subtitle">Control task storage, ordering, and completion visibility.</div></div><button aria-label="Back" className="close ms-icon-btn" id="closeTodoSettings" type="button" title="Back" onClick={() => save(draft)}><BackIcon/></button></div>
    <div className="clipboard-settings-section"><div className="clipboard-settings-section-title ms-eyebrow">Task list</div><div className="clipboard-settings-section-subtitle ms-muted">Choose how many tasks are retained and how they are presented.</div><label className="clipboard-setting-label">Task limit<select className="ms-input" id="todoMaxItems" value={draft.maxItems} onChange={(event) => patch('maxItems', Number(event.currentTarget.value) as TodoSettingsModel['maxItems'])}><option value="50">50 tasks</option><option value="100">100 tasks</option><option value="200">200 tasks</option><option value="500">500 tasks</option><option value="1000">1,000 tasks</option></select></label><label className="clipboard-setting-label">Default sort<select className="ms-input" id="todoDefaultSort" value={draft.defaultSort} onChange={(event) => patch('defaultSort', event.currentTarget.value === 'oldest' ? 'oldest' : 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><label className="toggle-row"><input id="todoHideCompleted" type="checkbox" checked={draft.hideCompleted} onChange={(event) => patch('hideCompleted', event.currentTarget.checked)}/><span><strong>Hide completed tasks by default</strong><small>Start on the Open view whenever the To-do list is opened.</small></span></label></div>
    <div className="clipboard-settings-section"><div className="clipboard-settings-section-title ms-eyebrow">Safety</div><label className="toggle-row"><input id="todoConfirmDelete" type="checkbox" checked={draft.confirmDelete} onChange={(event) => patch('confirmDelete', event.currentTarget.checked)}/><span><strong>Confirm before deleting a task</strong><small>Ask before permanently removing a task.</small></span></label></div>
    <div className="clipboard-settings-actions"><button className="ms-btn" id="cancelTodoSettings" type="button" onClick={() => save(draft)}>Done</button></div>
  </div>;
}

function UtilityWorkspaceController() {
  const [clipboard, setClipboard] = useState<ClipboardWorkspaceModel>(EMPTY_CLIPBOARD);
  const [todo, setTodo] = useState<TodoWorkspaceModel>(EMPTY_TODO);
  useEffect(() => {
    const controller: UtilityWorkspacesController = {
      updateClipboard(model) { setClipboard({ ...model, draft: { ...model.draft }, settings: { ...model.settings } }); },
      updateTodo(model) { setTodo({ ...model, settings: { ...model.settings } }); },
    };
    window.MadStationUtilityWorkspaces = controller;
    window.dispatchEvent(new Event('madstation:utility-workspaces-react-ready'));
    return () => { if (window.MadStationUtilityWorkspaces === controller) delete window.MadStationUtilityWorkspaces; };
  }, []);
  const portals = [
    ['utilityTabsReactMount', <UtilityTabs activeTab={clipboard.activeTab}/>],
    ['utilitySettingsButtonsReactMount', <UtilitySettingsButtons activeTab={clipboard.activeTab}/>],
    ['clipboardStatsReactMount', <ClipboardStats model={clipboard}/>],
    ['clipboardComposer', <ClipboardComposer model={clipboard}/>],
    ['clipboardListHeaderReactMount', <ClipboardListHeader model={clipboard}/>],
    ['clipboardToolbarReactMount', <ClipboardToolbar model={clipboard}/>],
    ['todoHeroReactMount', <TodoHero model={todo}/>],
    ['todoComposerReactMount', <TodoComposer/>],
    ['todoToolbarReactMount', <TodoToolbar model={todo}/>],
    ['clipboardSettingsModal', <ClipboardSettingsDialog model={clipboard}/>],
    ['todoSettingsModal', <TodoSettingsDialog model={todo}/>],
  ] as const;
  return <>{portals.map(([id, child]) => { const target = document.getElementById(id); return target ? createPortal(child, target, id) : null; })}</>;
}

const rootElement = document.getElementById('utilityWorkspacesReactRoot');
if (rootElement) {
  const root: Root = createRoot(rootElement);
  root.render(<UtilityWorkspaceController/>);
}
