/** Authenticated browser-session prompt adapter used by AI Lab and Instruction Forge. */
export interface AccountPromptRuntimeDependencies {
  getAccount(id: unknown): any;
  getService(id: unknown): any;
  getWorkspaceApp(): string;
  markBorrowedAccountView(id: unknown, borrowed: boolean): void;
  createAccountView(account: any, options?: { allowOutsideWorkspace?: boolean }): any;
  createForgeBrowserView(account: any): any;
  closeForgeBrowserView(id: unknown): unknown;
  removeAccountView(id: unknown, options: { preserveRuntime: boolean; cancelDownloads: boolean }): unknown;
  pushForgeBrowserState(): void;
}

export function createAccountPromptRuntime(dependencies: AccountPromptRuntimeDependencies) {
async function request(accountId: unknown, prompt: string, side = '', options: { workspace?: string } = {}) {
  const forgeRequest = options?.workspace === 'instruction-forge';
  const activeWorkspace = dependencies.getWorkspaceApp();
  // A trusted renderer may still contain a stale/compromised UI. Do not let any
  // workspace borrow authenticated provider sessions through the generic IPC.
  if (forgeRequest ? activeWorkspace !== 'instruction-forge' : activeWorkspace !== 'ai-lab') {
    return { ok: false, error: forgeRequest ? 'Open Instruction Forge to use account requests.' : 'Open AI Lab to use account requests.' };
  }
  const account = dependencies.getAccount(accountId);
  if (!account) return { ok: false, error: 'AI Hub account not found.' };
  const wasWorkspaceScoped = activeWorkspace !== 'ai-hub';
  if (wasWorkspaceScoped && !forgeRequest) dependencies.markBorrowedAccountView(accountId, true);
  // AI Lab's temporary path remains: const view = dependencies.createAccountView(account, { allowOutsideWorkspace: true });
  const view = forgeRequest ? dependencies.createForgeBrowserView(account) : dependencies.createAccountView(account, { allowOutsideWorkspace: true });
  const wc = view?.webContents;
  if (!wc || wc.isDestroyed()) {
    if (wasWorkspaceScoped) {
      if (forgeRequest) dependencies.closeForgeBrowserView(accountId);
      else {
        dependencies.markBorrowedAccountView(accountId, false);
        dependencies.removeAccountView(accountId, { preserveRuntime: true, cancelDownloads: false });
      }
    }
    return { ok: false, error: 'AI Hub account session is unavailable.' };
  }
  const service = dependencies.getService(account.serviceId);
  const host = (() => { try { return new URL(account.url).hostname.toLowerCase(); } catch { return ''; } })();
  const provider = `${service?.name || ''} ${host}`.toLowerCase();
  const started = Date.now();

  // AI Lab talks to the already-authenticated AI Hub browser session. The account
  // is never copied, logged in again, or converted into an API credential.
  // If the account view is still loading, wait for the page to become interactive.
  try {
    await new Promise<void>((resolve) => {
      if (!wc.isLoading()) return resolve();
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); wc.removeListener('did-finish-load', finish); resolve(); };
      const timer = setTimeout(finish, 15000);
      wc.once('did-finish-load', finish);
    });
  } catch {}

  const script = `(async () => {
    const prompt = ${JSON.stringify(String(prompt || ''))};
    const provider = ${JSON.stringify(provider)};
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const clean = (value) => String(value || '')
      .replace(/\\u00a0/g, ' ')
      .replace(/[ \\t]+\\n/g, '\\n')
      .replace(/\\n[ \\t]+/g, '\\n')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
    const dedupe = (value) => {
      const t = clean(value);
      if (!t) return '';
      const half = Math.floor(t.length / 2);
      if (t.length % 2 === 0) {
        const a = t.slice(0, half).trim(), b = t.slice(half).trim();
        if (a && a === b) return a;
      }
      const lines = t.split(/\\n/).map(x => x.trim()).filter(Boolean);
      if (lines.length >= 2 && lines.length % 2 === 0) {
        const mid = lines.length / 2;
        if (lines.slice(0, mid).join('\\n') === lines.slice(mid).join('\\n')) return lines.slice(0, mid).join('\\n');
      }
      return t;
    };
    const editables = () => [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [role="textbox"]')].filter(visible);
    const buttons = () => [...document.querySelectorAll('button, [role="button"]')].filter(visible);
    const editor = () => {
      const list = editables();
      const preferred = list.find(e => {
        const a = ((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('placeholder') || '') + ' ' + (e.getAttribute('data-placeholder') || '')).toLowerCase();
        return /message|prompt|ask anything|ask|send/.test(a);
      });
      return preferred || list.at(-1) || null;
    };
    const sendButton = () => buttons().find(b => {
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '')).trim();
      return /^(send|submit|send message|send prompt)$/i.test(label) || /\\bsend\\b/i.test(label);
    });

    const textOf = (el) => {
      if (!el) return '';
      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, input, textarea, [role="button"], [aria-hidden="true"], nav, header, footer, svg').forEach(n => n.remove());
      return dedupe(clone.innerText || clone.textContent || '');
    };

    // Never fall back to document.body.innerText: it contains navigation, controls, pricing,
    // the user's prompt, and other page chrome rather than just the model answer.
    // Explicit conversation-turn selectors first. These identify an assistant/model
    // turn rather than arbitrary text on the provider page.
    const explicitSelectors = [
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="model"]',
      '[data-role="assistant"]',
      '[data-role="model"]',
      '[data-testid*="assistant"]',
      '[data-testid*="model-response"]',
      '[data-testid*="conversation-turn-assistant"]',
      'article[data-testid*="conversation-turn"] [data-message-author-role="assistant"]',
      '.font-claude-message',
      '.ds-markdown',
      'model-response'
    ];
    const semanticSelectors = [
      '[class*="assistant-message"]', '[class*="assistantMessage"]',
      '[class*="response-content"]', '[class*="responseContent"]',
      '[class*="message-content"]', '[class*="messageContent"]',
      '[class*="prose"]'
    ];
    const chromeOnly = /^(new chat|deep research|image|plugins|see plans and pricing|thinking|generating|loading|copy|edit|regenerate|retry)$/i;
    const badChrome = (t) => !t || chromeOnly.test(t.trim()) || /^(new chat|deep research|see plans and pricing|plugins)$/i.test(t.trim());

    const getAssistantNodes = () => {
      const found = [];
      const selectors = [...explicitSelectors];
      // Provider-specific additions. Keep these narrow: never use body/page text.
      if (/chatgpt|openai/.test(provider)) selectors.push('[data-testid^="conversation-turn-"] [data-message-author-role="assistant"]');
      if (/deepseek/.test(provider)) selectors.push('.ds-markdown', '[class*="message"] [class*="markdown"]');
      if (/claude|anthropic/.test(provider)) selectors.push('[data-testid="assistant-message"]', '.font-claude-message');
      if (/gemini|google/.test(provider)) selectors.push('[data-message-author-role="model"]', '[data-testid*="model-response"]');
      for (const sel of selectors) {
        try { found.push(...document.querySelectorAll(sel)); } catch {}
      }
      return [...new Set(found)].filter(visible);
    };
    const assistantSnapshot = () => getAssistantNodes().map((el, index) => ({ index, el, text: textOf(el) })).filter(x => x.text && !badChrome(x.text));
    const latestAssistant = () => {
      const all = assistantSnapshot();
      return all.length ? all[all.length - 1] : null;
    };
    const fingerprint = (items) => items.map(x => x.text).join('\\n\\u241e\\n');

    // Make sure the provider's chat page is actually ready. If the current account
    // view is on a settings/login/other page, navigate to the configured provider URL
    // using the same persistent session (cookies stay in the AI Hub account partition).
    let input = editor();
    if (!input) {
      try {
        const currentHost = location.hostname.toLowerCase();
        const configuredHost = new URL(${JSON.stringify(account.url)}).hostname.toLowerCase();
        if (currentHost !== configuredHost && ${JSON.stringify(account.url)}) {
          location.href = ${JSON.stringify(account.url)};
          await sleep(1200);
        }
      } catch {}
      const until = Date.now() + 15000;
      while (!input && Date.now() < until) { await sleep(400); input = editor(); }
    }
    if (!input) return { ok:false, error:'Could not find the chat input in the existing AI Hub account. Open its normal chat page once, then try AI Lab again.' };

    // Capture the existing conversation before sending. We use the post-send change,
    // not a generic page scan, to guarantee that the returned text belongs to this turn.
    const before = assistantSnapshot();
    const beforeFp = fingerprint(before);
    const beforeLast = before.at(-1)?.text || '';

    // Fill the real provider-controlled input. Native value setters plus input events
    // work with React/Vue/Svelte controlled fields; contenteditable gets insertText.
    input.focus();
    if (input.matches('textarea, input')) {
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, prompt); else input.value = prompt;
      input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:prompt }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      try { document.execCommand('selectAll', false); } catch {}
      try { document.execCommand('insertText', false, prompt); } catch { input.textContent = prompt; }
      input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:prompt }));
    }
    await sleep(350);

    let send = sendButton();
    if (send && !send.disabled) {
      send.click();
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', bubbles:true, cancelable:true }));
      await sleep(120);
      input.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', bubbles:true, cancelable:true }));
    }

    // Wait for a new assistant turn and then for it to stop changing. This avoids
    // returning the user's prompt, an old answer, a streaming partial, or page chrome.
    const startedAt = Date.now();
    let lastFp = beforeFp;
    let lastText = '';
    let stable = 0;
    let sawNewTurn = false;
    while (Date.now() - startedAt < 120000) {
      await sleep(700);
      const items = assistantSnapshot();
      const fp = fingerprint(items);
      const last = items.at(-1)?.text || '';
      if (!last) continue;

      const nodeCountIncreased = items.length > before.length;
      const conversationChanged = fp !== beforeFp;
      const newText = last !== beforeLast;
      if (nodeCountIncreased || conversationChanged || newText) sawNewTurn = true;
      if (!sawNewTurn) continue;

      if (last !== lastText) { lastText = last; stable = 0; }
      else stable++;
      if (stable >= 2) {
        const result = dedupe(lastText);
        if (result && !badChrome(result)) return { ok:true, text:result };
      }
    }
    return { ok:false, error:'The AI Hub account did not produce a readable assistant response before the timeout. The prompt was sent, but the provider page did not expose its new answer in a readable conversation message.' };
  })()`;

  try {
    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) return { ok: false, error: result?.error || 'AI Hub account request failed.' };
    return { ok: true, text: result.text, elapsedMs: Date.now() - started, accountId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not use the AI Hub account session.' };
  } finally {
    // AI Lab may temporarily borrow an authenticated AI Hub session. Forge keeps
    // its selected browser live so the user can inspect the conversation, but
    // all Forge browser views are closed when leaving the workspace.
    if (wasWorkspaceScoped) {
      if (!forgeRequest) {
        dependencies.markBorrowedAccountView(accountId, false);
        dependencies.removeAccountView(accountId, { preserveRuntime: true, cancelDownloads: false });
      }
    }
    if (forgeRequest) dependencies.pushForgeBrowserState();
  }
}
  return { request };
}
