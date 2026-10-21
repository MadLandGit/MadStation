/** Typed, testable Model Arena send-to-both-browsers workflow. It types user input
 * into the two selected sessions and reports dispatch status only; it never scrapes
 * the generated answers back from websites.
 */
type ArenaSide = 'left' | 'right';
interface ArenaWebContents {
  isDestroyed(): boolean;
  isLoading(): boolean;
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
  executeJavaScript(script: string, userGesture?: boolean): Promise<unknown>;
  focus(): void;
  insertText(text: string): void;
  sendInputEvent(event: { type: 'keyDown' | 'char' | 'keyUp'; keyCode: string }): void;
}
interface ArenaView { webContents: ArenaWebContents }
export interface ArenaPromptRuntimeDependencies {
  getWorkspaceApp(): string;
  getControlMode(): string;
  getViewForSide(side: ArenaSide): ArenaView | null | undefined;
  sleep?(milliseconds: number): Promise<void>;
  setTimer?(callback: () => void, milliseconds: number): unknown;
  clearTimer?(timer: unknown): void;
}

const ARENA_FOCUS_EDITOR_SCRIPT = `(() => {
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const selectors = ['#prompt-textarea', 'textarea', '[contenteditable="true"]', '[contenteditable="plaintext-only"]', 'div[role="textbox"]', 'input[type="text"]', 'input:not([type])'];
  const all = [...new Set(selectors.flatMap((s) => [...document.querySelectorAll(s)]))]
    .filter((el) => visible(el) && !el.disabled && !el.readOnly && el.getAttribute('aria-hidden') !== 'true');
  if (!all.length) return { ok: false };
  const score = (el) => {
    const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('data-placeholder') || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('name') || '')).toLowerCase();
    let s = 0;
    if (el.id === 'prompt-textarea') s += 10;
    if (/message|prompt|ask|chat|send|question|talk|type|anything|help/.test(label)) s += 5;
    if (/search|email|password|username|phone|code/.test(label) && !/ask|message|prompt/.test(label)) s -= 6;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) s += 2;
    const r = el.getBoundingClientRect();
    if (r.width > 200) s += 1;
    if (r.top > window.innerHeight * 0.25) s += 1;
    return s;
  };
  all.sort((a, b) => score(b) - score(a));
  const el = all[0];
  if (score(el) < 0) return { ok: false };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  el.focus();
  try {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.select();
    else { const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  } catch {}
  return { ok: true };
})()`;

const ARENA_REMAINING_TEXT_SCRIPT = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return 0;
  const t = el.value !== undefined ? el.value : (el.innerText || el.textContent || '');
  return String(t).trim().length;
})()`;

const ARENA_CLICK_SEND_SCRIPT = `(() => {
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const candidates = [...document.querySelectorAll('button, [role="button"]')].filter((b) => {
    if (!visible(b) || b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
    const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('data-testid') || '') + ' ' + (b.textContent || '')).toLowerCase();
    return /\\b(send|submit)\\b|send-button|sendbutton/.test(label) && !/attach|upload|record/.test(label);
  });
  if (!candidates.length) return false;
  candidates[candidates.length - 1].click();
  return true;
})()`;


export function createArenaPromptRuntime(dependencies: ArenaPromptRuntimeDependencies) {
  const sleep = dependencies.sleep || ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const setTimer = dependencies.setTimer || ((callback, milliseconds) => setTimeout(callback, milliseconds));
  const clearTimer = dependencies.clearTimer || ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));

  async function waitForLoad(wc: ArenaWebContents, timeoutMs = 20_000): Promise<void> {
    if (!wc || wc.isDestroyed() || !wc.isLoading()) return;
    await new Promise<void>((resolve) => {
      let done = false;
      let timer: unknown;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimer(timer);
        wc.removeListener('did-stop-loading', finish);
        resolve();
      };
      timer = setTimer(finish, timeoutMs);
      wc.once('did-stop-loading', finish);
    });
  }

  async function findEditor(wc: ArenaWebContents, attempts = 14): Promise<boolean> {
    for (let index = 0; index < attempts; index += 1) {
      if (wc.isDestroyed()) return false;
      try {
        const found = await wc.executeJavaScript(ARENA_FOCUS_EDITOR_SCRIPT, true) as { ok?: boolean } | null;
        if (found?.ok) return true;
      } catch { /* page may be navigating */ }
      await sleep(1000);
    }
    return false;
  }

  function pressEnter(wc: ArenaWebContents) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  }

  async function sendPrompt(rawPrompt: unknown) {
    const prompt = String(rawPrompt || '').replace(/\r\n/g, '\n').trim().slice(0, 20_000);
    if (!prompt) return { ok: false, error: 'Write a question first.' };
    if (dependencies.getWorkspaceApp() !== 'ai-lab' || dependencies.getControlMode() !== 'launcher') return { ok: false, error: 'Open the Arena first.' };
    const entries = (['left', 'right'] as const).map((side) => ({ side, view: dependencies.getViewForSide(side) || null }));
    const missing = entries.filter((entry) => !entry.view || entry.view.webContents.isDestroyed()).map((entry) => entry.side);
    if (missing.length) return { ok: false, error: 'Choose an account for both browsers first.' };

    const ready = await Promise.all(entries.map(async (entry) => {
      const wc = entry.view!.webContents;
      await waitForLoad(wc);
      return { ...entry, wc, found: await findEditor(wc) };
    }));

    const results: Record<ArenaSide, { ok: boolean; error?: string }> = { left: { ok: false }, right: { ok: false } };
    for (const entry of ready) {
      if (!entry.found) {
        results[entry.side] = { ok: false, error: 'Could not find the chat box. Sign in to this account and open a new chat, then try again.' };
        continue;
      }
      try {
        entry.wc.focus();
        await sleep(80);
        await entry.wc.executeJavaScript(ARENA_FOCUS_EDITOR_SCRIPT, true);
        entry.wc.insertText(prompt);
        await sleep(350);
        pressEnter(entry.wc);
        results[entry.side] = { ok: true };
      } catch (error) {
        results[entry.side] = { ok: false, error: error instanceof Error ? error.message : 'Could not type into this browser.' };
      }
    }

    await sleep(900);
    for (const entry of ready) {
      if (!results[entry.side].ok || entry.wc.isDestroyed()) continue;
      try {
        const remaining = await entry.wc.executeJavaScript(ARENA_REMAINING_TEXT_SCRIPT, true);
        if (Number(remaining) > 0) {
          const clicked = await entry.wc.executeJavaScript(ARENA_CLICK_SEND_SCRIPT, true);
          if (!clicked) results[entry.side] = { ok: false, error: 'The question was typed but this site did not send it. Press Enter in that browser.' };
        }
      } catch { /* navigation after sending counts as sent */ }
    }
    return { ok: results.left.ok && results.right.ok, ...results };
  }

  return { sendPrompt };
}
