import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type ReactElement } from 'react';

type VoteChoice = 'left' | 'right' | 'tie' | 'none';
type FreeArenaAccount = { id: string; name: string; providerId: string; providerName: string; iconSrc: string };
type FreeArenaSnapshot = {
  providers: Array<{ id: string; name: string }>;
  accounts: FreeArenaAccount[];
  selected: { left: string; right: string };
  status: string;
  statusError: boolean;
  running: boolean;
  battle: null | { id: string; leftId: string; rightId: string; choice: string };
  history: Array<{ at: string; prompt: string; choice: string; leftName: string; rightName: string }>;
};
type ArenaBrowserLoadingState = { accountId: string; loading: boolean };
type ArenaBrowserLoadingBySide = { left: ArenaBrowserLoadingState; right: ArenaBrowserLoadingState };
type ArenaBrowserLoadingEvent = { side: 'left' | 'right'; accountId: string; loading: boolean };
const EMPTY_BROWSER_LOADING: ArenaBrowserLoadingBySide = {
  left: { accountId: '', loading: false }, right: { accountId: '', loading: false },
};
type FreeArenaAction =
  | { type: 'select-account'; side: 'left' | 'right'; accountId: string }
  | { type: 'run'; prompt: string }
  | { type: 'swap' }
  | { type: 'vote'; choice: VoteChoice }
  | { type: 'navigate'; side: 'left' | 'right'; action: 'back' | 'forward' | 'refresh' }
  | { type: 'open-external'; side: 'left' | 'right' };

type LocalModel = { key: string; label: string; model: string; provider: string; endpoint: string; type: string };
type LocalResult = null | { ok: boolean; text: string; elapsedMs: number | null; pending?: boolean };
type LocalSnapshot = {
  models: LocalModel[];
  servers: Array<{ provider: string; endpoint: string; ok: boolean; models: string[] }>;
  scanMeta: string;
  scanning: boolean;
  selected: { left: string; right: string };
  status: string;
  statusError: boolean;
  running: boolean;
  results: { left: LocalResult; right: LocalResult };
  battle: null | { id: string; leftKey: string; rightKey: string; leftName: string; rightName: string; choice: string };
  history: Array<{ at: string; prompt: string; choice: string; leftName: string; rightName: string }>;
};
type LocalAction =
  | { type: 'scan' }
  | { type: 'select-model'; side: 'left' | 'right'; key: string }
  | { type: 'run'; prompt: string }
  | { type: 'swap' }
  | { type: 'cancel' }
  | { type: 'vote'; choice: VoteChoice };

const EMPTY_FREE: FreeArenaSnapshot = {
  providers: [], accounts: [], selected: { left: '', right: '' }, status: '', statusError: false,
  running: false, battle: null, history: [],
};
const EMPTY_LOCAL: LocalSnapshot = {
  models: [], servers: [], scanMeta: 'Not scanned', scanning: false, selected: { left: '', right: '' },
  status: 'Scan for local models, choose two different models, and enter an instruction.', statusError: false,
  running: false, results: { left: null, right: null }, battle: null, history: [],
};
const CHOICE_LABELS: Record<string, string> = { left: 'Preferred left', right: 'Preferred right', tie: 'Tie', none: 'Neither' };
function dispatchFree(action: FreeArenaAction): void {
  window.dispatchEvent(new CustomEvent<FreeArenaAction>('madstation:free-arena-action', { detail: action }));
}
function dispatchLocal(action: LocalAction): void {
  window.dispatchEvent(new CustomEvent<LocalAction>('madstation:local-arena-action', { detail: action }));
}
function formatTime(value: string): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : '';
}
function responseTime(result: LocalResult): string {
  if (!result) return '—';
  if (result.pending) return 'Running…';
  if (!result.ok) return 'Failed';
  return result.elapsedMs === null ? 'Done' : `${result.elapsedMs} ms`;
}

function FreeAccountArena({ snapshot }: { snapshot: FreeArenaSnapshot }): ReactElement {
  const [prompt, setPrompt] = useState('');
  const [browserLoading, setBrowserLoading] = useState<ArenaBrowserLoadingBySide>(EMPTY_BROWSER_LOADING);
  useEffect(() => window.aiHub.onArenaBrowserLoading((payload) => {
    if (!payload || typeof payload !== 'object') return;
    const candidate = payload as Partial<ArenaBrowserLoadingEvent>;
    if ((candidate.side !== 'left' && candidate.side !== 'right') || typeof candidate.accountId !== 'string' || typeof candidate.loading !== 'boolean') return;
    setBrowserLoading((current) => ({ ...current, [candidate.side as 'left' | 'right']: { accountId: candidate.accountId as string, loading: candidate.loading as boolean } }));
  }), []);
  const left = snapshot.accounts.find((account) => account.id === snapshot.selected.left);
  const right = snapshot.accounts.find((account) => account.id === snapshot.selected.right);
  const hasPair = Boolean(left && right && left.id !== right.id);
  const canVote = Boolean(!snapshot.running && hasPair && snapshot.battle && snapshot.battle.leftId === left?.id && snapshot.battle.rightId === right?.id);

  const accountOptions = (side: 'left' | 'right') => <select className="ms-browser-account-select" id={side === 'left' ? 'arenaLeft' : 'arenaRight'} aria-label={`${side === 'left' ? 'Browser 1' : 'Browser 2'} account`} value={snapshot.selected[side]} disabled={snapshot.running} onChange={(event) => dispatchFree({ type: 'select-account', side, accountId: event.currentTarget.value })}>
    <option value="">{snapshot.accounts.length ? 'Choose account…' : 'No Arena accounts yet'}</option>
    {snapshot.providers.map((provider) => {
      const accounts = snapshot.accounts.filter((account) => account.providerId === provider.id);
      return accounts.length ? <optgroup label={provider.name} key={provider.id}>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}{account.name.toLowerCase().includes(provider.name.toLowerCase()) ? '' : ` — ${provider.name}`}</option>)}</optgroup> : null;
    })}
  </select>;

  const browserSide = (side: 'left' | 'right', account: FreeArenaAccount | undefined): ReactElement => {
    const label = side === 'left' ? 'Browser 1' : 'Browser 2';
    const index = side === 'left' ? '01' : '02';
    return <article className="arena-side arena-browser-card" aria-label={`${label} account browser`} key={side}>
      <div className={`arena-side-head ms-browser-toolbar arena-browser-toolbar${browserLoading[side].accountId === account?.id && browserLoading[side].loading ? ' is-loading' : ''}`} role="toolbar" aria-label={`${label} controls`} aria-busy={browserLoading[side].accountId === account?.id && browserLoading[side].loading}>
        <div className="arena-browser-nav ms-browser-nav" role="group" aria-label={`${label} page navigation`}>
          {(['back', 'forward', 'refresh'] as const).map((action) => <button className="tiny-btn ms-browser-tool-btn arena-nav-btn" data-arena-nav={`${side}-${action}`} type="button" key={action} disabled={!account || snapshot.running} title={`${action === 'refresh' ? 'Refresh' : action[0].toUpperCase() + action.slice(1)} ${label}`} aria-label={`${label} ${action}`} onClick={() => dispatchFree({ type: 'navigate', side, action })}>{action === 'back' ? '‹' : action === 'forward' ? '›' : '↻'}</button>)}
        </div>
        <div className="ms-browser-address arena-account-address" role="group" aria-label={`${label} account selection`}>
          <span className="browser-index" aria-hidden="true">{index}</span>
          <span className="provider-icon small" aria-hidden="true">{account?.iconSrc ? <img className="provider-icon-img" src={account.iconSrc} alt="" referrerPolicy="no-referrer"/> : null}</span>
          <svg className="ms-browser-address-lock hidden" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          <span className="ms-browser-address-location arena-browser-url">{account ? `${account.name} · ${account.providerName}` : 'No account selected'}</span>
          {accountOptions(side)}
        </div>
        <button className="ms-btn ms-btn--sm ms-browser-open-external arena-open-external-btn" type="button" data-arena-open-external={side} title={`Open ${label} page in browser`} aria-label={`Open ${label} page in browser`} disabled={!account || snapshot.running} onClick={() => dispatchFree({ type: 'open-external', side })}>↗ <span>Open in browser</span></button>
      </div>
      <div className="arena-browser-slot" id={side === 'left' ? 'arenaLeftBrowserSlot' : 'arenaRightBrowserSlot'}>
        {!account ? <div className="arena-browser-placeholder"><b>No account selected</b><span>Add accounts in the Arena Accounts tab, then pick one here.</span></div> : null}
      </div>
      <div className="arena-vote-row"><button className={`vote-btn${snapshot.battle?.choice === side ? ' chosen' : ''}`} type="button" data-vote={side} disabled={!canVote} onClick={() => dispatchFree({ type: 'vote', choice: side })}>Prefer this answer</button></div>
    </article>;
  };

  return <div className="free-arena-react-workflow">
    <section className="arena-ask lab-card arena-shared-composer">
      <label className="arena-ask-field"><span className="arena-ask-head"><span className="field-label">Shared instruction</span><span id="arenaStatus" className={`arena-control-status${snapshot.statusError ? ' error' : ''}`} role="status" aria-live="polite">{snapshot.status}</span></span>
        <textarea id="arenaPrompt" rows={2} maxLength={20000} placeholder="Type one question for both… (Ctrl+Enter to send)" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (prompt.trim() && hasPair && !snapshot.running) dispatchFree({ type: 'run', prompt: prompt.trim() }); } }}/>
      </label>
      <div className="free-arena-primary-actions">
        <button className="primary arena-run" id="arenaRunBtn" type="button" disabled={!prompt.trim() || !hasPair || snapshot.running} onClick={() => dispatchFree({ type: 'run', prompt: prompt.trim() })}><span>{snapshot.running ? 'Sending…' : 'Ask Both'}</span><small>Ctrl + Enter</small></button>
        <button className="tiny-btn arena-icon-btn" type="button" disabled={snapshot.running || !left || !right} onClick={() => dispatchFree({ type: 'swap' })} title="Swap left and right accounts" aria-label="Swap left and right accounts">⇄ Swap sides</button>
        <button className={`tiny-btn arena-icon-btn${snapshot.battle?.choice === 'tie' ? ' chosen' : ''}`} type="button" data-vote="tie" disabled={!canVote} onClick={() => dispatchFree({ type: 'vote', choice: 'tie' })} title="Both answers were good">= Tie</button>
        <button className={`tiny-btn arena-icon-btn${snapshot.battle?.choice === 'none' ? ' chosen' : ''}`} type="button" data-vote="none" disabled={!canVote} onClick={() => dispatchFree({ type: 'vote', choice: 'none' })} title="Neither answer was good">Neither</button>
      </div>
    </section>
    {snapshot.accounts.length === 0 ? <section className="lab-card api-arena-empty"><strong>No Arena accounts yet</strong><span>Add two accounts in the Arena Accounts tab. Each account has its own saved login session.</span></section> : null}
    <div className="arena-grid free-arena-browser-grid">{browserSide('left', left)}{browserSide('right', right)}</div>
    <section className="lab-card api-arena-history" aria-label="Recent Free Account Arena voting history">
      <div className="field-head"><strong>Recent account comparisons</strong><span className="scan-meta">Votes saved on this device</span></div>
      {snapshot.history.length ? <div className="api-arena-history-list">{snapshot.history.map((vote, index) => <article className="api-arena-history-item" key={`${vote.at}:${index}`}>
        <div className="api-arena-history-models"><strong>{vote.leftName}</strong><span>vs</span><strong>{vote.rightName}</strong></div>
        <div className="api-arena-history-meta"><span>{CHOICE_LABELS[vote.choice] || 'Vote recorded'}</span><time>{formatTime(vote.at)}</time></div><p>{vote.prompt || 'No instruction saved.'}</p>
      </article>)}</div> : <div className="api-arena-history-empty"><strong>No account comparisons voted on yet</strong><span>Run a comparison and record your preference to build a local history.</span></div>}
    </section>
  </div>;
}

function LocalAiArena({ snapshot }: { snapshot: LocalSnapshot }): ReactElement {
  const [prompt, setPrompt] = useState('');
  const left = snapshot.models.find((model) => model.key === snapshot.selected.left);
  const right = snapshot.models.find((model) => model.key === snapshot.selected.right);
  const hasPair = Boolean(left && right && left.key !== right.key && !(left.model === right.model && left.endpoint === right.endpoint));
  const canVote = Boolean(!snapshot.running && hasPair && snapshot.battle && snapshot.battle.leftKey === left?.key && snapshot.battle.rightKey === right?.key && snapshot.results.left && snapshot.results.right && !snapshot.results.left.pending && !snapshot.results.right.pending);
  const canRun = Boolean(!snapshot.running && !snapshot.scanning && snapshot.selected.left && snapshot.selected.right && prompt.trim());

  const resultCard = (side: 'left' | 'right', model: LocalModel | undefined): ReactElement => {
    const result = snapshot.results[side];
    return <article className="lab-card api-result local-result" aria-label={`${side === 'left' ? 'Left' : 'Right'} Local AI response`} aria-busy={Boolean(result?.pending)} key={side}>
      <div className="arena-side-head"><span className="browser-index">{side === 'left' ? '01' : '02'}</span>
        <span className="arena-select-wrap local-arena-select-wrap"><select className="ms-input" id={side === 'left' ? 'localArenaLeft' : 'localArenaRight'} aria-label={`${side === 'left' ? 'Left' : 'Right'} Local AI model`} value={snapshot.selected[side]} disabled={snapshot.running || snapshot.scanning} onChange={(event) => dispatchLocal({ type: 'select-model', side, key: event.currentTarget.value })}>
          {!snapshot.selected[side] ? <option value="">Choose local model…</option> : null}{snapshot.models.map((candidate) => <option value={candidate.key} key={candidate.key}>{candidate.label}</option>)}
        </select></span>
        <span id={side === 'left' ? 'localArenaLeftName' : 'localArenaRightName'} className="sr-only">{model?.label || 'Local AI model'}</span>
        <span id={side === 'left' ? 'localArenaLeftTime' : 'localArenaRightTime'}>{responseTime(result)}</span>
      </div>
      <pre id={side === 'left' ? 'localArenaLeftOutput' : 'localArenaRightOutput'}>{result ? result.text : 'Run a battle to compare local responses.'}</pre>
      <button className={`vote-btn${snapshot.battle?.choice === side ? ' chosen' : ''}`} type="button" data-local-vote={side} disabled={!canVote} onClick={() => dispatchLocal({ type: 'vote', choice: side })}>Prefer this response</button>
    </article>;
  };

  return <div className="local-arena-react-workflow">
    <div className="local-arena-top">
      <section className="arena-setup lab-card local-arena-setup arena-shared-composer">
        <div className="arena-prompt-row">
          <label className="arena-ask-field"><span className="arena-ask-head"><span className="field-label">Shared instruction</span><span id="localArenaStatus" className={`arena-control-status${snapshot.statusError ? ' error' : ''}`} role="status" aria-live="polite">{snapshot.status}</span></span>
            <textarea id="localArenaPrompt" rows={2} maxLength={20000} placeholder="Type one question for both… (Ctrl+Enter to send)" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (canRun && hasPair) dispatchLocal({ type: 'run', prompt: prompt.trim() }); } }}/>
          </label>
          <div className="local-arena-actions">
            <button className="primary arena-run" id="localArenaRunBtn" type="button" disabled={!canRun || !hasPair} onClick={() => dispatchLocal({ type: 'run', prompt: prompt.trim() })}><span>{snapshot.running ? 'Running…' : 'Ask Both'}</span><small>Ctrl + Enter</small></button>
            {snapshot.running ? <button className="tiny-btn" type="button" onClick={() => dispatchLocal({ type: 'cancel' })}>Stop waiting</button> : null}
            <button className="tiny-btn" type="button" disabled={snapshot.running || !left || !right} onClick={() => dispatchLocal({ type: 'swap' })} aria-label="Swap Local AI models">⇄ Swap sides</button>
          </div>
        </div>
      </section>
      <section className="arena-setup lab-card local-discover-card">
        <div className="local-discover-head"><div><strong>Discover Model Servers</strong><span id="localScanMeta">{snapshot.scanMeta}</span></div><button className="tiny-btn" id="localRefreshBtn" type="button" disabled={snapshot.scanning || snapshot.running} onClick={() => dispatchLocal({ type: 'scan' })}>{snapshot.scanning ? 'Scanning…' : 'Rescan'}</button></div>
        <div id="localModelList" className="local-model-list local-discover-list">
          {snapshot.servers.length ? snapshot.servers.map((server, index) => <div className="local-server-card" key={`${server.endpoint}:${index}`}>
            <div className="local-server-head"><div><strong>{server.provider}</strong><span className="local-discover-source">{server.endpoint}</span></div><span className={`local-server-status ${server.ok ? 'online' : 'offline'}`}>{server.ok ? 'Online' : 'Offline'}</span></div>
            <div className="local-server-models">{server.models.length ? server.models.map((name, modelIndex) => <span className="local-discover-chip" key={`${name}:${modelIndex}`}>{name}</span>) : <span className="local-discover-empty">No models served</span>}</div>
          </div>) : <div className="empty-state"><strong>{snapshot.scanning ? 'Scanning local servers…' : snapshot.scanMeta === 'Not scanned' ? 'No scan yet' : snapshot.scanMeta === 'Scan failed' ? 'Could not scan local servers' : 'No local server found'}</strong><span>Start Ollama, LM Studio, LocalAI, vLLM or llama.cpp, then rescan.</span></div>}
        </div>
      </section>
    </div>
    {!snapshot.models.length ? <p className="ms-muted" role="status">No Local AI models are available yet. Scan running model servers to populate both selectors.</p> : snapshot.models.length === 1 ? <p className="ms-muted" role="status">Add or expose a second model to compare two different responses.</p> : null}
    <div className="api-arena-grid local-arena-grid">{resultCard('left', left)}{resultCard('right', right)}</div>
    <div className="api-arena-result-actions" role="group" aria-label="Local AI comparison result">
      <button className={`tiny-btn arena-icon-btn${snapshot.battle?.choice === 'tie' ? ' chosen' : ''}`} type="button" data-local-vote="tie" disabled={!canVote} onClick={() => dispatchLocal({ type: 'vote', choice: 'tie' })}>= Tie</button>
      <button className={`tiny-btn arena-icon-btn${snapshot.battle?.choice === 'none' ? ' chosen' : ''}`} type="button" data-local-vote="none" disabled={!canVote} onClick={() => dispatchLocal({ type: 'vote', choice: 'none' })}>Neither</button>
    </div>
    <section className="lab-card api-arena-history" aria-label="Recent Local AI voting history">
      <div className="field-head"><strong>Recent Local AI comparisons</strong><span className="scan-meta">Votes saved on this device</span></div>
      {snapshot.history.length ? <div className="api-arena-history-list">{snapshot.history.map((vote, index) => <article className="api-arena-history-item" key={`${vote.at}:${index}`}><div className="api-arena-history-models"><strong>{vote.leftName}</strong><span>vs</span><strong>{vote.rightName}</strong></div><div className="api-arena-history-meta"><span>{CHOICE_LABELS[vote.choice] || 'Vote recorded'}</span><time>{formatTime(vote.at)}</time></div><p>{vote.prompt || 'No instruction saved.'}</p></article>)}</div> : <div className="api-arena-history-empty"><strong>No Local AI comparisons voted on yet</strong><span>Run a comparison and record your preference to build a local history.</span></div>}
    </section>
  </div>;
}

function mountComponent<T>(mountId: string, eventName: string, initial: T, Component: (props: { snapshot: T }) => ReactElement, mountedEventName: string): void {
  const host = document.getElementById(mountId);
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = initial;
  root.render(<Component snapshot={snapshot}/>);
  window.addEventListener(eventName, (event: Event) => {
    const candidate = (event as CustomEvent<T>).detail;
    if (!candidate || typeof candidate !== 'object') return;
    snapshot = candidate;
    root.render(<Component snapshot={snapshot}/>);
  });
  window.dispatchEvent(new Event(mountedEventName));
}

function mountBrowserArenas(): void {
  mountComponent('freeAccountArenaReactMount', 'madstation:free-arena-state', EMPTY_FREE, FreeAccountArena, 'madstation:free-arena-mounted');
  mountComponent('localArenaReactMount', 'madstation:local-arena-state', EMPTY_LOCAL, LocalAiArena, 'madstation:browser-arenas-mounted');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBrowserArenas, { once: true });
else mountBrowserArenas();
