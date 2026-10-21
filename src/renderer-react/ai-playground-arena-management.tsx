import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useState, type KeyboardEvent } from 'react';

export interface ArenaManagementProvider {
  id: string;
  name: string;
  iconCandidates: string[];
  accountCount: number;
  selected: boolean;
}

export interface ArenaManagementAccount {
  id: string;
  name: string;
  providerName: string;
  iconCandidates: string[];
  side: '' | 'Left' | 'Right';
}

export interface ArenaManagementModel {
  providers: ArenaManagementProvider[];
  accounts: ArenaManagementAccount[];
  providerFilter: string;
  totalAccounts: number;
  renamingId: string;
  selectedProvider: null | { id: string; name: string; accountCount: number };
}

export interface ArenaLeaderboardRow {
  key: string;
  label: string;
  sub: string;
  wins: number;
  losses: number;
  ties: number;
  battles: number;
  ratePercent: number;
}

export interface ArenaScoreboardModel {
  models: ArenaLeaderboardRow[];
  accounts: ArenaLeaderboardRow[];
  summary: string;
}

export interface ArenaManagementBridge {
  attachAccountRenderer(renderer: (model: ArenaManagementModel) => void): void;
  attachScoreboardRenderer(renderer: (model: ArenaScoreboardModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  action(action: string, id?: string, operation?: string, value?: string): void;
}

declare global {
  interface Window {
    MadStationArenaManagement?: ArenaManagementBridge;
  }
}

function dispatch(action: string, id = '', operation?: string, value?: string): void {
  window.MadStationArenaManagement?.action(action, id, operation, value);
}

function ProviderIcon({ provider }: { provider: { name?: string; iconCandidates: string[] } }) {
  const candidates = provider.iconCandidates;
  const initial = candidates[0] || '';
  return <img
    className={`provider-icon-img${initial.startsWith('data:image/svg+xml') ? ' provider-icon-default' : ''}`}
    src={initial}
    data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
    data-icon-index="0"
    data-icon-cache-tried=""
    draggable={false}
    alt=""
    aria-hidden="true"
    referrerPolicy="no-referrer"
  />;
}

function ProviderTiles({ model, bridge }: { model: ArenaManagementModel; bridge: ArenaManagementBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('arenaProviderTiles');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.providers]);

  return <>
    <button type="button" className={`arena-prov-tile${model.providerFilter === 'all' ? ' active' : ''}`} data-prov="all" onClick={() => dispatch('filter-provider', 'all')}>
      <strong>All</strong><span>{model.totalAccounts}</span>
    </button>
    {model.providers.map((provider) => <button
      type="button"
      key={provider.id}
      className={`arena-prov-tile${provider.selected ? ' active' : ''}`}
      data-prov={provider.id}
      title={provider.name}
      aria-pressed={provider.selected}
      onClick={() => dispatch('filter-provider', provider.id)}
    >
      <span className="provider-icon small"><ProviderIcon provider={provider} /></span>
      <strong>{provider.name}</strong>
      <span>{provider.accountCount}</span>
    </button>)}
  </>;
}

function RenameAccount({ account, value, onChange, onSave, onCancel }: {
  account: ArenaManagementAccount;
  value: string;
  onChange(value: string): void;
  onSave(): void;
  onCancel(): void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSave();
    } else if (event.key === 'Escape') onCancel();
  };
  return <input
    className="arena-rename-input"
    data-rename-input={account.id}
    type="text"
    maxLength={60}
    value={value}
    aria-label={`Rename ${account.name}`}
    onChange={(event) => onChange(event.currentTarget.value)}
    onKeyDown={onKeyDown}
    autoFocus
  />;
}

function ArenaAccountRows({ model, bridge }: { model: ArenaManagementModel; bridge: ArenaManagementBridge }) {
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const host = document.getElementById('arenaAccountList');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.accounts]);

  const action = (name: string, accountId: string) => bridge.action('account', accountId, name);
  return <>
    {model.selectedProvider ? <div className="arena-acc-toolbar">
      <span>{model.selectedProvider.name} · {model.accounts.length} account{model.accounts.length === 1 ? '' : 's'}</span>
      <button className="tiny-btn danger" type="button" data-provider-delete={model.selectedProvider.id} onClick={() => dispatch('delete-provider', model.selectedProvider!.id)}>Remove this provider</button>
    </div> : null}
    {model.accounts.length ? model.accounts.map((account) => <div className="arena-acc-row" data-arena-account-id={account.id} key={account.id}>
      <span className="provider-icon"><ProviderIcon provider={account} /></span>
      <div className="arena-acc-copy">
        {model.renamingId === account.id
          ? <RenameAccount
              account={account}
              value={renameDrafts[account.id] ?? account.name}
              onChange={(value) => setRenameDrafts((previous) => ({ ...previous, [account.id]: value }))}
              onSave={() => { bridge.action('account', account.id, 'save-rename', renameDrafts[account.id] ?? account.name); setRenameDrafts((previous) => { const next = { ...previous }; delete next[account.id]; return next; }); }}
              onCancel={() => { bridge.action('account', account.id, 'cancel-rename'); setRenameDrafts((previous) => { const next = { ...previous }; delete next[account.id]; return next; }); }}
            />
          : <strong>{account.name}</strong>}
        <span>{account.providerName}{account.side ? <> · <b className="arena-side-badge">{account.side} browser</b></> : null}</span>
      </div>
      <div className="row-actions">
        {model.renamingId === account.id ? <>
          <button className="tiny-btn" type="button" onClick={() => { bridge.action('account', account.id, 'save-rename', renameDrafts[account.id] ?? account.name); setRenameDrafts((previous) => { const next = { ...previous }; delete next[account.id]; return next; }); }}>Save</button>
          <button className="tiny-btn" type="button" onClick={() => { action('cancel-rename', account.id); setRenameDrafts((previous) => { const next = { ...previous }; delete next[account.id]; return next; }); }}>Cancel</button>
        </> : <>
          <button className="tiny-btn" type="button" onClick={() => action('left', account.id)}>Use left</button>
          <button className="tiny-btn" type="button" onClick={() => action('right', account.id)}>Use right</button>
          <button className="tiny-btn" type="button" onClick={() => { setRenameDrafts((previous) => ({ ...previous, [account.id]: account.name })); action('rename', account.id); }}>Rename</button>
          <button className="tiny-btn" type="button" title="Sign out and erase this account's Arena session" onClick={() => action('reset', account.id)}>Reset login</button>
          <button className="tiny-btn danger" type="button" onClick={() => action('delete', account.id)}>Delete</button>
        </>}
      </div>
    </div>) : <div className="empty-state"><strong>No accounts here yet</strong><span>Use “Add account” above to create one.</span></div>}
  </>;
}

function Leaderboard({ rows }: { rows: ArenaLeaderboardRow[] }) {
  if (!rows.length) return <div className="empty-state"><strong>No votes yet</strong><span>Ask both chatbots a question in the Model Arena, then pick your favourite.</span></div>;
  return <>{rows.map((row, index) => <div className="lb-row" key={row.key}>
    <span className="score-rank">{index + 1}</span>
    <div className="lb-name">
      <strong>{row.label}</strong>
      {row.sub ? <span>{row.sub}</span> : null}
      <div className="lb-bar"><i data-lb-rate={row.ratePercent} style={{ width: `${row.ratePercent}%` }} /></div>
    </div>
    <div className="lb-stats"><span>{row.wins} W</span><span>{row.losses} L</span><span>{row.ties} T</span><span>{row.battles} {row.battles === 1 ? 'battle' : 'battles'}</span></div>
    <b>{row.ratePercent}%</b>
  </div>)}</>;
}

function mountArenaManagement(): void {
  const bridge = window.MadStationArenaManagement;
  const providerHost = document.getElementById('arenaProviderTiles');
  const accountHost = document.getElementById('arenaAccountList');
  const modelBoardHost = document.getElementById('leaderboardModels');
  const accountBoardHost = document.getElementById('leaderboardAccounts');
  const summaryHost = document.getElementById('leaderboardSummary');
  if (!bridge || !(providerHost instanceof HTMLElement) || !(accountHost instanceof HTMLElement)
      || !(modelBoardHost instanceof HTMLElement) || !(accountBoardHost instanceof HTMLElement) || !(summaryHost instanceof HTMLElement)) return;

  const providerRoot: Root = createRoot(providerHost);
  const accountRoot: Root = createRoot(accountHost);
  const modelBoardRoot: Root = createRoot(modelBoardHost);
  const accountBoardRoot: Root = createRoot(accountBoardHost);
  const summaryRoot: Root = createRoot(summaryHost);
  let accountBridge: ArenaManagementBridge = bridge;
  bridge.attachAccountRenderer((model) => {
    providerRoot.render(<ProviderTiles model={model} bridge={accountBridge} />);
    accountRoot.render(<ArenaAccountRows model={model} bridge={accountBridge} />);
  });
  bridge.attachScoreboardRenderer((model) => {
    modelBoardRoot.render(<Leaderboard rows={model.models} />);
    accountBoardRoot.render(<Leaderboard rows={model.accounts} />);
    summaryRoot.render(<>{model.summary}</>);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountArenaManagement, { once: true });
else mountArenaManagement();
