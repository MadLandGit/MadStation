import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface NotesComposerModel { editingId: string | null; title: string; body: string; }
export interface NotesHeaderModel { countLabel: string; listMeta: string; search: string; visibleCount: number; storedCount: number; }
export interface NotesSettingsModel {
  visible: boolean;
  maxItems: 50 | 100 | 200 | 500 | 1000;
  defaultSort: 'newest' | 'oldest';
  confirmDelete: boolean;
}
type NotesComposerAction = { type: 'save'; draft: NotesComposerModel } | { type: 'cancel' };
type NotesSettingsAction =
  | { type: 'save'; settings: Omit<NotesSettingsModel, 'visible'> }
  | { type: 'cancel' };

const DEFAULT_HEADER: NotesHeaderModel = { countLabel: '0 notes', listMeta: '0 notes', search: '', visibleCount: 0, storedCount: 0 };
const EMPTY_DRAFT: NotesComposerModel = { editingId: null, title: '', body: '' };
const DEFAULT_SETTINGS: NotesSettingsModel = { visible: false, maxItems: 200, defaultSort: 'newest', confirmDelete: true };
const VALID_LIMITS = [50, 100, 200, 500, 1000] as const;

declare global {
  interface Window {
    MadStationNotesHeader?: { update(model: NotesHeaderModel): void };
    MadStationNotesComposer?: { update(model: NotesComposerModel): void };
    MadStationNotesSettings?: { update(model: NotesSettingsModel): void };
  }
}

function dispatchComposer(action: NotesComposerAction): void {
  window.dispatchEvent(new CustomEvent<NotesComposerAction>('madstation:notes-composer-action', { detail: action }));
}
function dispatchSettings(action: NotesSettingsAction): void {
  window.dispatchEvent(new CustomEvent<NotesSettingsAction>('madstation:notes-settings-action', { detail: action }));
}

function dispatchHeaderSearch(value: string): void {
  window.dispatchEvent(new CustomEvent('madstation:notes-header-action', { detail: { type: 'search', value: value.slice(0, 200) } }));
}

function NotesHero({ model }: { model: NotesHeaderModel }) {
  return <div className="utility-hero">
    <div><span className="eyebrow">NOTES</span><h2>Write it down before it disappears.</h2><p>Private local notes for ideas, instructions, meeting scraps, and anything that does not belong in a clip.</p></div>
    <span className="utility-count" id="notesCount">{model.countLabel}</span>
  </div>;
}

function NotesListHeader({ model }: { model: NotesHeaderModel }) {
  return <>
    <div><span className="eyebrow">YOUR NOTES</span><h3>Recent notes</h3><p id="notesListMeta">{model.listMeta}</p></div>
    <label className="utility-search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="notesSearch" placeholder="Search notes…" autoComplete="off" maxLength={200} value={model.search}
        onChange={(event) => dispatchHeaderSearch(event.currentTarget.value)} aria-label="Search notes" />
    </label>
  </>;
}

function NotesHeaderController() {
  const [model, setModel] = useState<NotesHeaderModel>(DEFAULT_HEADER);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const next = detail as Partial<NotesHeaderModel>;
      setModel({
        countLabel: typeof next.countLabel === 'string' ? next.countLabel.slice(0, 80) : '0 notes',
        listMeta: typeof next.listMeta === 'string' ? next.listMeta.slice(0, 120) : '0 notes',
        search: typeof next.search === 'string' ? next.search.slice(0, 200) : '',
        visibleCount: Number.isFinite(next.visibleCount) ? Math.max(0, Number(next.visibleCount)) : 0,
        storedCount: Number.isFinite(next.storedCount) ? Math.max(0, Number(next.storedCount)) : 0,
      });
    };
    window.addEventListener('madstation:notes-header-state', onState);
    window.dispatchEvent(new Event('madstation:notes-header-mounted'));
    return () => window.removeEventListener('madstation:notes-header-state', onState);
  }, []);

  const heroHost = document.getElementById('notesHeaderReactMount');
  const listHost = document.getElementById('notesListHeaderReactMount');
  return <>
    {heroHost ? createPortal(<NotesHero model={model}/>, heroHost) : null}
    {listHost ? createPortal(<NotesListHeader model={model}/>, listHost) : null}
  </>;
}

function NotesComposer() {
  const [draft, setDraft] = useState<NotesComposerModel>(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = { update: (next: NotesComposerModel) => { setDraft({ editingId: next.editingId, title: next.title, body: next.body }); setError(''); } };
    window.MadStationNotesComposer = controller;
    window.dispatchEvent(new Event('madstation:notes-composer-mounted'));
    return () => { if (window.MadStationNotesComposer === controller) delete window.MadStationNotesComposer; };
  }, []);

  useEffect(() => { if (draft.editingId) bodyRef.current?.focus(); }, [draft.editingId]);

  function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!draft.body.trim()) { setError('Write something in the note first.'); bodyRef.current?.focus(); return; }
    setError('');
    dispatchComposer({ type: 'save', draft: { editingId: draft.editingId, title: draft.title.slice(0, 120), body: draft.body } });
  }
  function handleBodyKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save(); }
  }

  return <section className="card note-editor" aria-label="Note editor">
    <form onSubmit={save}>
      <div className="utility-section-head">
        <div><span className="eyebrow">{draft.editingId ? 'EDIT NOTE' : 'NEW NOTE'}</span><h3>{draft.editingId ? 'Update this note' : 'Write a note'}</h3></div>
        {draft.editingId ? <button className="icon-only" type="button" title="Cancel editing" aria-label="Cancel editing" onClick={() => { setDraft(EMPTY_DRAFT); setError(''); dispatchComposer({ type: 'cancel' }); titleRef.current?.focus(); }}>×</button> : null}
      </div>
      <input ref={titleRef} className="utility-title-input" placeholder="Note title" maxLength={120} autoComplete="off" value={draft.title}
        onChange={(event) => { setDraft((current) => ({ ...current, title: event.currentTarget.value })); if (error) setError(''); }} aria-label="Note title" />
      <textarea ref={bodyRef} rows={11} placeholder="Start writing…" value={draft.body} aria-label="Note content" aria-invalid={Boolean(error)} aria-describedby={error ? 'noteComposerError' : undefined}
        onChange={(event) => { setDraft((current) => ({ ...current, body: event.currentTarget.value })); if (error) setError(''); }} onKeyDown={handleBodyKeyDown} />
      {error ? <p className="form-error" id="noteComposerError" role="alert">{error}</p> : null}
      <div className="utility-editor-footer"><span>{(draft.title.length + draft.body.length).toLocaleString()} characters</span><button className="primary" type="submit">{draft.editingId ? 'Update note' : 'Save note'}</button></div>
      <p className="clipboard-shortcut-hint"><kbd>Ctrl</kbd><kbd>Enter</kbd> to save</p>
    </form>
  </section>;
}

function NotesSettingsDialog() {
  const [model, setModel] = useState<NotesSettingsModel>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<NotesSettingsModel>(DEFAULT_SETTINGS);

  useEffect(() => {
    const controller = { update: (next: NotesSettingsModel) => {
      const normalized: NotesSettingsModel = {
        visible: next.visible === true,
        maxItems: VALID_LIMITS.includes(Number(next.maxItems) as (typeof VALID_LIMITS)[number]) ? Number(next.maxItems) as NotesSettingsModel['maxItems'] : 200,
        defaultSort: next.defaultSort === 'oldest' ? 'oldest' : 'newest',
        confirmDelete: next.confirmDelete !== false,
      };
      setModel(normalized); setDraft(normalized);
    } };
    window.MadStationNotesSettings = controller;
    window.dispatchEvent(new Event('madstation:notes-settings-mounted'));
    return () => { if (window.MadStationNotesSettings === controller) delete window.MadStationNotesSettings; };
  }, []);

  useEffect(() => {
    if (!model.visible) return;
    document.getElementById('notesSettingsModal')?.querySelector<HTMLButtonElement>('#closeNotesSettings')?.focus();
  }, [model.visible]);

  useEffect(() => {
    const overlay = document.getElementById('notesSettingsModal');
    if (!overlay) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === overlay && model.visible) dispatchSettings({ type: 'save', settings: { maxItems: draft.maxItems, defaultSort: draft.defaultSort, confirmDelete: draft.confirmDelete } });
    };
    // Accept the DOM listener's broad EventListener signature, then narrow the
    // event to KeyboardEvent because this callback is registered only for keydown.
    const onKeyDown: EventListener = (nativeEvent) => {
      const event = nativeEvent as globalThis.KeyboardEvent;
      if (!model.visible) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dispatchSettings({ type: 'cancel' }); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      if (event.shiftKey && (document.activeElement === focusable[0] || !overlay.contains(document.activeElement))) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && (document.activeElement === focusable[focusable.length - 1] || !overlay.contains(document.activeElement))) { event.preventDefault(); focusable[0].focus(); }
    };
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('keydown', onKeyDown);
    return () => { overlay.removeEventListener('click', onClick); overlay.removeEventListener('keydown', onKeyDown); };
  }, [model.visible, draft]);

  return <div className="notes-settings-react-content">
    <div className="ms-card ms-card--flat clipboard-settings-card">
      <div className="clipboard-settings-heading">
        <div className="clipboard-settings-icon ms-brand-tile" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M8 9h4"/></svg></div>
        <div><div className="modal-title" id="notesSettingsTitle">Notes settings</div><div className="modal-subtitle" id="notesSettingsSubtitle">Control note storage, ordering, and deletion safety.</div></div>
        <button aria-label="Back" className="close ms-icon-btn" id="closeNotesSettings" type="button" title="Back" onClick={() => dispatchSettings({ type: 'save', settings: { maxItems: draft.maxItems, defaultSort: draft.defaultSort, confirmDelete: draft.confirmDelete } })}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      </div>
      <div className="clipboard-settings-section"><div className="clipboard-settings-section-title ms-eyebrow">Storage</div><div className="clipboard-settings-section-subtitle ms-muted">Keep the Notes list tidy without losing your existing note content.</div>
        <label className="clipboard-setting-label">History limit<select className="ms-input" value={draft.maxItems} onChange={(event) => setDraft((current) => ({ ...current, maxItems: Number(event.currentTarget.value) as NotesSettingsModel['maxItems'] }))}><option value="50">50 notes</option><option value="100">100 notes</option><option value="200">200 notes</option><option value="500">500 notes</option><option value="1000">1,000 notes</option></select></label>
        <label className="clipboard-setting-label">Default sort<select className="ms-input" value={draft.defaultSort} onChange={(event) => setDraft((current) => ({ ...current, defaultSort: event.currentTarget.value === 'oldest' ? 'oldest' : 'newest' }))}><option value="newest">Recently updated</option><option value="oldest">Oldest updated</option></select></label>
      </div>
      <div className="clipboard-settings-section"><div className="clipboard-settings-section-title ms-eyebrow">Safety</div><label className="toggle-row"><input type="checkbox" checked={draft.confirmDelete} onChange={(event) => setDraft((current) => ({ ...current, confirmDelete: event.currentTarget.checked }))}/><span><strong>Confirm before deleting a note</strong><small>Ask before permanently removing a note.</small></span></label></div>
      <div className="clipboard-settings-actions"><button className="ms-btn" id="cancelNotesSettings" type="button" onClick={() => dispatchSettings({ type: 'save', settings: { maxItems: draft.maxItems, defaultSort: draft.defaultSort, confirmDelete: draft.confirmDelete } })}>Done</button></div>
    </div>
  </div>;
}

function mountNotesWorkspace(): void {
  const controllerHost = document.getElementById('notesWorkspaceControllerMount');
  const composerHost = document.getElementById('notesComposerReactMount');
  const settingsHost = document.getElementById('notesSettingsReactMount');
  if (controllerHost instanceof HTMLElement) { const root: Root = createRoot(controllerHost); root.render(<NotesHeaderController/>); }
  if (composerHost instanceof HTMLElement) { const root: Root = createRoot(composerHost); root.render(<NotesComposer />); }
  if (settingsHost instanceof HTMLElement) { const root: Root = createRoot(settingsHost); root.render(<NotesSettingsDialog />); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountNotesWorkspace, { once: true });
else mountNotesWorkspace();
