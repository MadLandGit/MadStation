import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect } from 'react';

export interface ForgeAccountTabView {
  id: string;
  name: string;
  serviceName: string;
  iconCandidates: string[];
  active: boolean;
  index: number;
}

export interface ForgeAccountsModel {
  accounts: ForgeAccountTabView[];
}

export interface ForgeBrowserStatusModel {
  label: string;
  loading: boolean;
}

export interface InstructionForgeAccountsBridge {
  attachAccountRenderer(renderer: (model: ForgeAccountsModel) => void): void;
  attachStatusRenderer(renderer: (model: ForgeBrowserStatusModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  selectAccount(id: string): void;
}

declare global {
  interface Window {
    MadStationInstructionForgeAccounts?: InstructionForgeAccountsBridge;
  }
}

function ForgeAccountIcon({ account }: { account: ForgeAccountTabView }) {
  const candidates = account.iconCandidates;
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

function ForgeAccountTabs({ model, bridge }: { model: ForgeAccountsModel; bridge: InstructionForgeAccountsBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('forgeAccountList');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.accounts]);

  if (!model.accounts.length) {
    return <div className="forge-account-empty"><strong>No AI accounts yet</strong><span>Add an account in AI Hub, then return here to use its saved browser session.</span></div>;
  }

  return <>{model.accounts.map((account) => <button
    className={`forge-account-tab${account.active ? ' active' : ''}`}
    type="button"
    role="tab"
    aria-selected={account.active}
    data-forge-account-id={account.id}
    key={account.id}
    onClick={() => bridge.selectAccount(account.id)}
  >
    <span className="forge-account-tab-index">{String(account.index).padStart(2, '0')}</span>
    <span className="forge-account-tab-icon"><ForgeAccountIcon account={account} /></span>
    <span className="forge-account-tab-copy"><strong>{account.name}</strong><small>{account.serviceName}</small></span>
    <span className="forge-account-tab-dot" aria-hidden="true" />
  </button>)}</>;
}

function ForgeBrowserStatus({ model }: { model: ForgeBrowserStatusModel }) {
  useLayoutEffect(() => {
    const host = document.getElementById('forgeBrowserStatus');
    if (host instanceof HTMLElement) host.classList.toggle('loading', model.loading);
  }, [model.loading]);
  return <><i aria-hidden="true" /><span>{model.label}</span></>;
}

function mountInstructionForgeAccounts(): void {
  const bridge = window.MadStationInstructionForgeAccounts;
  const accountHost = document.getElementById('forgeAccountList');
  const statusHost = document.getElementById('forgeBrowserStatus');
  if (!bridge || !(accountHost instanceof HTMLElement) || !(statusHost instanceof HTMLElement)) return;
  const accountRoot: Root = createRoot(accountHost);
  const statusRoot: Root = createRoot(statusHost);
  bridge.attachAccountRenderer((model) => accountRoot.render(<ForgeAccountTabs model={model} bridge={bridge} />));
  bridge.attachStatusRenderer((model) => statusRoot.render(<ForgeBrowserStatus model={model} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountInstructionForgeAccounts, { once: true });
else mountInstructionForgeAccounts();
