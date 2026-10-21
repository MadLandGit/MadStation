import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';

type PasswordMode = 'set' | 'change' | 'remove';
type PasswordModalSnapshot = { mode: PasswordMode; visible: boolean; saving: boolean; error: string };
type PasswordValues = { current: string; next: string; confirm: string };

type PasswordModalBridge = {
  close(): void;
  submit(values: PasswordValues): void;
};

declare global {
  interface Window { MadStationPasswordModal?: PasswordModalBridge; }
}

const DEFAULT_SNAPSHOT: PasswordModalSnapshot = { mode: 'set', visible: false, saving: false, error: '' };
const EMPTY_VALUES: PasswordValues = { current: '', next: '', confirm: '' };

function isSnapshot(value: unknown): value is PasswordModalSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PasswordModalSnapshot>;
  return ['set', 'change', 'remove'].includes(String(candidate.mode))
    && typeof candidate.visible === 'boolean'
    && typeof candidate.saving === 'boolean'
    && typeof candidate.error === 'string' && candidate.error.length <= 400;
}

function PasswordModal({ snapshot }: { snapshot: PasswordModalSnapshot }): ReactElement {
  const [values, setValues] = useState<PasswordValues>(EMPTY_VALUES);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValues(EMPTY_VALUES), [snapshot.mode, snapshot.visible]);
  useEffect(() => {
    if (!snapshot.visible) return;
    const focusTarget = snapshot.mode === 'set' ? nextRef.current : currentRef.current;
    focusTarget?.focus();
  }, [snapshot.visible, snapshot.mode]);

  if (!snapshot.visible) return <></>;
  const remove = snapshot.mode === 'remove';
  return <form id="passwordForm" onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.MadStationPasswordModal?.submit({ current: values.current, next: values.next, confirm: values.confirm });
  }}>
    {snapshot.mode !== 'set' && <label>Current password<input ref={currentRef} id="pwCurrentReact" type="password" autoComplete="current-password" maxLength={256} required value={values.current} onChange={(event) => setValues((current) => ({ ...current, current: event.currentTarget.value.slice(0, 256) }))} disabled={snapshot.saving} /></label>}
    {!remove && <>
      <label>New password<input ref={nextRef} id="pwNewReact" type="password" autoComplete="new-password" maxLength={256} minLength={8} required value={values.next} onChange={(event) => setValues((current) => ({ ...current, next: event.currentTarget.value.slice(0, 256) }))} disabled={snapshot.saving} /></label>
      <label>Confirm new password<input id="pwConfirmReact" type="password" autoComplete="new-password" maxLength={256} minLength={8} required value={values.confirm} onChange={(event) => setValues((current) => ({ ...current, confirm: event.currentTarget.value.slice(0, 256) }))} disabled={snapshot.saving} /></label>
    </>}
    <div className="form-error" id="pwErrorReact" role="alert" aria-live="polite">{snapshot.error}</div>
    <div className="form-actions"><button className="secondary" id="cancelPasswordReactBtn" type="button" disabled={snapshot.saving} onClick={() => window.MadStationPasswordModal?.close()}>Cancel</button><button className="primary" id="savePasswordReactBtn" type="submit" disabled={snapshot.saving}>{snapshot.saving ? 'Saving…' : remove ? 'Remove password' : 'Save password'}</button></div>
  </form>;
}

function mountPasswordModal(): void {
  const host = document.getElementById('passwordFormReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = DEFAULT_SNAPSHOT;
  window.addEventListener('madstation:password-modal-state', (event: Event) => {
    const candidate = (event as CustomEvent<unknown>).detail;
    if (!isSnapshot(candidate)) return;
    snapshot = candidate;
    root.render(<PasswordModal snapshot={snapshot} />);
  });
  root.render(<PasswordModal snapshot={snapshot} />);
  window.dispatchEvent(new Event('madstation:password-modal-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPasswordModal, { once: true });
else mountPasswordModal();
