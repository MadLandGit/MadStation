import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';

type RenameModalSnapshot = {
  visible: boolean;
  accountName: string;
  error: string;
  saving: boolean;
};
type RenameModalAction = { type: 'close' } | { type: 'save'; name: string };

const DEFAULT_SNAPSHOT: RenameModalSnapshot = { visible: false, accountName: '', error: '', saving: false };

function dispatch(action: RenameModalAction): void {
  window.dispatchEvent(new CustomEvent<RenameModalAction>('madstation:rename-account-modal-action', { detail: action }));
}

function isSnapshot(value: unknown): value is RenameModalSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RenameModalSnapshot>;
  return typeof candidate.visible === 'boolean'
    && typeof candidate.accountName === 'string' && candidate.accountName.length <= 60
    && typeof candidate.error === 'string' && candidate.error.length <= 400
    && typeof candidate.saving === 'boolean';
}

function RenameAccountModal({ snapshot }: { snapshot: RenameModalSnapshot }): ReactElement {
  const [name, setName] = useState(snapshot.accountName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setName(snapshot.accountName), [snapshot.accountName, snapshot.visible]);
  useEffect(() => {
    if (snapshot.visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [snapshot.visible]);

  if (!snapshot.visible) return <></>;
  return <form id="renameForm" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); dispatch({ type: 'save', name: name.trim() }); }}>
    <label>Account name<input ref={inputRef} autoComplete="off" id="renameInputReact" maxLength={60} required value={name} onChange={(event) => setName(event.currentTarget.value.slice(0, 60))} disabled={snapshot.saving} /></label>
    <div className="form-error" id="renameErrorReact" role="alert" aria-live="polite">{snapshot.error}</div>
    <div className="form-actions"><button className="secondary" type="button" disabled={snapshot.saving} onClick={() => dispatch({ type: 'close' })}>Cancel</button><button className="primary" type="submit" disabled={snapshot.saving || !name.trim()}> {snapshot.saving ? 'Saving…' : 'Save name'} </button></div>
  </form>;
}

function mountRenameAccountModal(): void {
  const host = document.getElementById('renameFormReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = DEFAULT_SNAPSHOT;
  window.addEventListener('madstation:rename-account-modal-state', (event: Event) => {
    const candidate = (event as CustomEvent<unknown>).detail;
    if (!isSnapshot(candidate)) return;
    snapshot = candidate;
    root.render(<RenameAccountModal snapshot={snapshot} />);
  });
  root.render(<RenameAccountModal snapshot={snapshot} />);
  window.dispatchEvent(new Event('madstation:rename-account-modal-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountRenameAccountModal, { once: true });
else mountRenameAccountModal();
