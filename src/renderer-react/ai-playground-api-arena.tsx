import { createRoot, type Root } from 'react-dom/client';
import { useState, type ReactElement } from 'react';

type ApiArenaModel = { id: string; name: string; provider: string; model: string; apiKeyRequired: boolean; apiKeyConfigured: boolean };
type ApiArenaResult = { ok: boolean; text: string; elapsedMs: number | null; pending?: boolean };
type ApiArenaVote = { at: string; prompt: string; choice: string; leftName: string; rightName: string };
type ApiArenaSnapshot = {
  models: ApiArenaModel[];
  selected: { left: string; right: string };
  prompt: string;
  running: boolean;
  status: string;
  statusError: boolean;
  results: { left: ApiArenaResult | null; right: ApiArenaResult | null };
  battle: null | { id: string; left: { id: string; name: string }; right: { id: string; name: string }; choice: string };
  history: ApiArenaVote[];
};
type ApiArenaAction =
  | { type: 'select-model'; side: 'left' | 'right'; modelId: string }
  | { type: 'run'; leftId: string; rightId: string; prompt: string }
  | { type: 'swap' }
  | { type: 'cancel' }
  | { type: 'vote'; choice: 'left' | 'right' | 'tie' | 'none' };

const EMPTY_SNAPSHOT: ApiArenaSnapshot = {
  models: [], selected: { left: '', right: '' }, prompt: '', running: false,
  status: 'Loading API models…', statusError: false, results: { left: null, right: null }, battle: null, history: [],
};
const CHOICE_LABELS: Record<string, string> = { left: 'Preferred left', right: 'Preferred right', tie: 'Tie', none: 'Neither' };
function dispatch(action: ApiArenaAction): void {
  window.dispatchEvent(new CustomEvent<ApiArenaAction>('madstation:api-arena-action', { detail: action }));
}
function timeLabel(value: string): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : '';
}
function durationLabel(result: ApiArenaResult | null): string {
  if (!result) return '—';
  if (result.pending) return 'Running…';
  if (!result.ok) return 'Failed';
  return result.elapsedMs === null ? 'Done' : `${result.elapsedMs} ms`;
}
function ResponseCard({ side, model, result, selected, canVote, choice, models, running }: {
  side: 'left' | 'right'; model: ApiArenaModel | undefined; result: ApiArenaResult | null;
  selected: string; canVote: boolean; choice: string; models: ApiArenaModel[]; running: boolean;
}): ReactElement {
  const placeholder = result?.pending ? 'Waiting for response…' : 'Run a comparison to see the response.';
  const text = result ? result.text : placeholder;
  return <article className="lab-card api-result" aria-label={`${side === 'left' ? 'Left' : 'Right'} model response`} aria-busy={Boolean(result?.pending)}>
    <div className="arena-side-head">
      <span className="browser-index">{side === 'left' ? '01' : '02'}</span>
      <span className="arena-select-wrap api-arena-select-wrap">
        <select className="ms-input" aria-label={`${side === 'left' ? 'Left' : 'Right'} API model`} value={selected} disabled={running} onChange={(event) => dispatch({ type: 'select-model', side, modelId: event.currentTarget.value })}>
          {!selected ? <option value="">Choose a model</option> : null}
          {models.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
        </select>
      </span>
      <span className="api-arena-model-name">{model?.name || 'No model selected'}</span>
      <span className="api-arena-duration">{durationLabel(result)}</span>
    </div>
    <pre className="api-arena-response">{text}</pre>
    <button className={`vote-btn${choice === side ? ' chosen' : ''}`} type="button" data-api-arena-vote={side} disabled={!canVote} onClick={() => dispatch({ type: 'vote', choice: side })}>Prefer this response</button>
  </article>;
}
function ApiArena({ snapshot }: { snapshot: ApiArenaSnapshot }): ReactElement {
  const [prompt, setPrompt] = useState('');
  const leftModel = snapshot.models.find((model) => model.id === snapshot.selected.left);
  const rightModel = snapshot.models.find((model) => model.id === snapshot.selected.right);
  const hasResults = Boolean(snapshot.results.left && snapshot.results.right && !snapshot.results.left.pending && !snapshot.results.right.pending);
  const canVote = Boolean(!snapshot.running && hasResults && snapshot.battle && snapshot.battle.left.id === snapshot.selected.left && snapshot.battle.right.id === snapshot.selected.right);
  const canRun = Boolean(!snapshot.running && leftModel && rightModel && leftModel.id !== rightModel.id && prompt.trim());

  function run(): void {
    dispatch({ type: 'run', leftId: snapshot.selected.left, rightId: snapshot.selected.right, prompt: prompt.trim() });
  }

  return <div className="api-arena-react-workflow">
    <section className="arena-setup lab-card api-setup arena-shared-composer">
      <div className="arena-prompt-row api-arena-react-composer">
        <label className="arena-ask-field"><span className="arena-ask-head"><span className="field-label">Shared instruction</span><span className={`arena-control-status${snapshot.statusError ? ' form-error' : ''}`} role="status" aria-live="polite">{snapshot.status}</span></span>
          <textarea rows={2} maxLength={20000} placeholder="Type one instruction for both API models… (Ctrl+Enter to send)" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (canRun) run(); } }} />
        </label>
        <div className="api-arena-primary-actions">
          <button className="primary arena-run" type="button" disabled={!canRun} onClick={run}><span>{snapshot.running ? 'Running…' : 'Ask Both'}</span><small>Ctrl + Enter</small></button>
          <button className="tiny-btn api-arena-swap" type="button" disabled={snapshot.running || !leftModel || !rightModel} onClick={() => dispatch({ type: 'swap' })} aria-label="Swap left and right API models" title="Swap left and right models">⇄ Swap sides</button>
          {snapshot.running ? <button className="tiny-btn api-arena-cancel" type="button" onClick={() => dispatch({ type: 'cancel' })}>Stop waiting</button> : null}
        </div>
      </div>
    </section>
    {snapshot.models.length === 0 ? <section className="lab-card api-arena-empty"><strong>No API models configured</strong><span>Add an API model in API model settings above. Stored credentials are never shown in this comparison.</span></section> : null}
    {snapshot.models.length === 1 ? <p className="ms-muted" role="status">Add a second API model to compare two different responses.</p> : null}
    <div className="api-arena-grid">
      <ResponseCard side="left" model={leftModel} models={snapshot.models} running={snapshot.running} result={snapshot.results.left} selected={snapshot.selected.left} choice={snapshot.battle?.choice || ''} canVote={canVote}/>
      <ResponseCard side="right" model={rightModel} models={snapshot.models} running={snapshot.running} result={snapshot.results.right} selected={snapshot.selected.right} choice={snapshot.battle?.choice || ''} canVote={canVote}/>
    </div>
    <div className="api-arena-result-actions" role="group" aria-label="Comparison result">
      <button className={`tiny-btn arena-icon-btn${snapshot.battle?.choice === 'tie' ? ' chosen' : ''}`} type="button" data-api-arena-vote="tie" disabled={!canVote} onClick={() => dispatch({ type: 'vote', choice: 'tie' })} title="Both responses were good">= Tie</button>
      <button className={`tiny-btn arena-icon-btn${snapshot.battle?.choice === 'none' ? ' chosen' : ''}`} type="button" data-api-arena-vote="none" disabled={!canVote} onClick={() => dispatch({ type: 'vote', choice: 'none' })} title="Neither response was good">Neither</button>
    </div>
    <section className="lab-card api-arena-history" aria-label="Recent API Arena voting history">
      <div className="field-head"><strong>Recent API comparisons</strong><span className="scan-meta">Votes saved on this device</span></div>
      {snapshot.history.length ? <div className="api-arena-history-list">{snapshot.history.map((item, index) => <article className="api-arena-history-item" key={`${item.at}:${index}`}>
        <div className="api-arena-history-models"><strong>{item.leftName}</strong><span>vs</span><strong>{item.rightName}</strong></div>
        <div className="api-arena-history-meta"><span>{CHOICE_LABELS[item.choice] || 'Vote recorded'}</span><time>{timeLabel(item.at)}</time></div>
        <p>{item.prompt || 'No instruction saved.'}</p>
      </article>)}</div> : <div className="api-arena-history-empty"><strong>No API comparisons voted on yet</strong><span>Run a comparison and record a preference to build a local history.</span></div>}
    </section>
  </div>;
}
function mountApiArena(): void {
  const host = document.getElementById('apiArenaReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = EMPTY_SNAPSHOT;
  root.render(<ApiArena snapshot={snapshot}/>);
  window.addEventListener('madstation:api-arena-state', (event: Event) => {
    const candidate = (event as CustomEvent<ApiArenaSnapshot>).detail;
    if (!candidate || !Array.isArray(candidate.models) || !candidate.selected || !candidate.results) return;
    snapshot = candidate;
    root.render(<ApiArena snapshot={snapshot}/>);
  });
  window.dispatchEvent(new Event('madstation:api-arena-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountApiArena, { once: true });
else mountApiArena();
