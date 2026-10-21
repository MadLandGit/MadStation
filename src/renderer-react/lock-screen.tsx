import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';

type LockResult = { ok: boolean; error?: string; cancelled?: boolean };
type LockScreenBridge = {
  submit(password: string): Promise<LockResult>;
  reset(): Promise<LockResult>;
};

declare global {
  interface Window { MadStationLockScreen?: LockScreenBridge; }
}

function initialLockedState(): boolean {
  const overlay = document.getElementById('lockScreen');
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

function LockScreen({ locked }: { locked: boolean }): ReactElement {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassword('');
    setError('');
    setWorking(false);
    if (locked) passwordRef.current?.focus();
  }, [locked]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!locked || working || !password || password.length > 256) return;
    setWorking(true);
    setError('');
    try {
      const result = await window.MadStationLockScreen?.submit(password);
      if (result?.ok) {
        setPassword('');
        setError('');
      } else {
        setError(typeof result?.error === 'string' ? result.error.slice(0, 400) : 'Incorrect password.');
        passwordRef.current?.select();
      }
    } catch {
      setError('Could not unlock Mad Station. Try again.');
    } finally {
      setWorking(false);
    }
  }

  async function reset(): Promise<void> {
    if (!locked || working) return;
    setWorking(true);
    setError('');
    try {
      const result = await window.MadStationLockScreen?.reset();
      if (result?.cancelled) return;
      if (!result?.ok) setError(typeof result?.error === 'string' ? result.error.slice(0, 400) : 'Could not reset the lock.');
    } catch {
      setError('Could not reset the lock. Try again.');
    } finally {
      setWorking(false);
    }
  }

  if (!locked) return <></>;
  return <form className="lock-card ms-card ms-card--flat" id="lockFormReact" aria-busy={working} onSubmit={submit}>
    <div className="about-logo"><img alt="Mad Station" src="../assets/icon.png" /></div>
    <h2>Mad Station is locked</h2>
    <p>Enter your password to continue.</p>
    <input ref={passwordRef} aria-label="Unlock password" autoComplete="current-password" className="ms-input" id="lockPasswordReact" aria-describedby="lockErrorReact" maxLength={256} placeholder="Password" type="password" required value={password} disabled={working} onChange={(event) => setPassword(event.currentTarget.value.slice(0, 256))} />
    <div className="form-error" id="lockErrorReact" role="alert" aria-live="polite">{error}</div>
    <button className="ms-btn ms-btn--primary" id="lockSubmitReact" type="submit" disabled={working || !password}>{working ? 'Checking…' : 'Unlock'}</button>
    <button className="ms-btn ms-btn--sm" id="forgotPasswordReactBtn" type="button" disabled={working} onClick={() => void reset()}>Forgot password?</button>
  </form>;
}

function mountLockScreen(): void {
  const host = document.getElementById('lockScreenReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let locked = initialLockedState();
  const render = () => root.render(<LockScreen locked={locked} />);
  window.addEventListener('madstation:lock-screen-state', (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== 'object' || typeof (detail as { locked?: unknown }).locked !== 'boolean') return;
    const next = (detail as { locked: boolean }).locked;
    if (next === locked) return;
    locked = next;
    render();
  });
  render();
  window.dispatchEvent(new Event('madstation:lock-screen-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLockScreen, { once: true });
else mountLockScreen();
