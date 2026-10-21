import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

type ForgeComposerModel = { id: string; label: string; group: 'accounts' | 'api' };
type ForgeComposerSnapshot = {
  models: ForgeComposerModel[];
  selectedModel: string;
  input: string;
  output: string;
  running: boolean;
};
type ForgeComposerAction =
  | { type: 'input-change'; value: string }
  | { type: 'model-change'; value: string }
  | { type: 'generate' }
  | { type: 'copy' };

const EMPTY: ForgeComposerSnapshot = { models: [], selectedModel: '', input: '', output: '', running: false };
const MAX_INPUT_CHARS = 100_000;
function dispatch(action: ForgeComposerAction): void {
  window.dispatchEvent(new CustomEvent<ForgeComposerAction>('madstation:instruction-forge-composer-action', { detail: action }));
}
function safeSnapshot(value: unknown): ForgeComposerSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ForgeComposerSnapshot>;
  if (!Array.isArray(candidate.models) || typeof candidate.selectedModel !== 'string' || typeof candidate.input !== 'string' || typeof candidate.output !== 'string' || typeof candidate.running !== 'boolean') return null;
  if (candidate.models.length > 1000 || candidate.selectedModel.length > 256 || candidate.input.length > MAX_INPUT_CHARS || candidate.output.length > 1_000_000) return null;
  const models: ForgeComposerModel[] = [];
  for (const raw of candidate.models) {
    if (!raw || typeof raw !== 'object') return null;
    const model = raw as Partial<ForgeComposerModel>;
    if (typeof model.id !== 'string' || model.id.length > 256 || typeof model.label !== 'string' || model.label.length > 300 || !['accounts', 'api'].includes(String(model.group))) return null;
    models.push({ id: model.id, label: model.label, group: model.group as ForgeComposerModel['group'] });
  }
  if (new Set(models.map((model) => model.id)).size !== models.length) return null;
  if (candidate.selectedModel && !models.some((model) => model.id === candidate.selectedModel)) return null;
  return {
    models,
    selectedModel: candidate.selectedModel,
    input: candidate.input,
    output: candidate.output,
    running: candidate.running,
  };
}

function PromptComposer({ snapshot }: { snapshot: ForgeComposerSnapshot }) {
  const [draft, setDraft] = useState(snapshot);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);
  const accounts = draft.models.filter((model) => model.group === 'accounts');
  const api = draft.models.filter((model) => model.group === 'api');

  return <section className="forge-workspace" aria-label="Prompt Studio composer">
    <article className="lab-card forge-brief-card">
      <div className="forge-card-head"><div><h2>Explain what you actually mean</h2></div></div>
      <textarea id="forgeInputReact" rows={12} value={draft.input} maxLength={MAX_INPUT_CHARS}
        aria-label="Explain what you want to do"
        placeholder="Example: I think this is Electron 44 or maybe 43, and I want the app to keep each AI login separate but close the browser when I leave the section…"
        onChange={(event) => {
          const value = event.currentTarget.value.slice(0, MAX_INPUT_CHARS);
          setDraft((current) => ({ ...current, input: value }));
          dispatch({ type: 'input-change', value });
        }} />
      <div className="forge-brief-footer"><div className="forge-fix-chips" aria-label="Forge correction capabilities">
        <span>Terminology correction</span><span>Version normalization</span><span>Intent preservation</span><span>Missing-detail detection</span>
      </div></div>
    </article>
    <article className="lab-card forge-result-card">
      <div className="forge-card-head"><div><h2>Make the instruction precise</h2></div><div className="forge-result-actions">
        <button className="tiny-btn" id="forgeCopyBtnReact" type="button" disabled={!draft.output || draft.running} onClick={() => dispatch({ type: 'copy' })}>Copy</button>
      </div></div>
      <textarea id="forgeOutputReact" rows={12} value={draft.output} placeholder="Your refined, self-contained prompt will appear here." readOnly aria-label="Generated prompt" />
      <div className="forge-result-footer">
        <label className="forge-model-picker"><span>Forge with</span><select className="ms-input" id="forgeModelReact" aria-label="AI used by Prompt Studio" value={draft.selectedModel}
          onChange={(event) => {
            const value = event.currentTarget.value.slice(0, 256);
            setDraft((current) => ({ ...current, selectedModel: value }));
            dispatch({ type: 'model-change', value });
          }}>
          {accounts.length ? <optgroup label="Accounts · Arena browser sessions">{accounts.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</optgroup> : null}
          {api.length ? <optgroup label="API / local models">{api.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</optgroup> : null}
          {!draft.models.length ? <option value="">No models available</option> : null}
        </select></label>
        <button className="primary forge-run-btn" id="forgeBtnReact" type="button" disabled={draft.running || !draft.input.trim() || !draft.selectedModel}
          onClick={() => dispatch({ type: 'generate' })}>{draft.running ? 'Generating…' : <>Generate prompt <span aria-hidden="true">↗</span></>}</button>
      </div>
    </article>
  </section>;
}

function mountPromptComposer(): void {
  const host = document.getElementById('instructionForgeComposerReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = EMPTY;
  window.addEventListener('madstation:instruction-forge-composer-state', (event: Event) => {
    const next = safeSnapshot((event as CustomEvent<unknown>).detail);
    if (!next) return;
    snapshot = next;
    root.render(<PromptComposer snapshot={snapshot} />);
  });
  root.render(<PromptComposer snapshot={snapshot} />);
  window.dispatchEvent(new Event('madstation:instruction-forge-composer-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPromptComposer, { once: true });
else mountPromptComposer();
