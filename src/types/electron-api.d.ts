import type { AccountListController } from '../renderer-react/account-list';
import type { AiHubApi, ToolbarApi, ToolbarState } from '../shared/api-contract';

declare global {
  interface Window {
    /** Explicitly exposed, IPC-backed application capabilities. */
    aiHub: AiHubApi;
    /** Restricted capabilities available to the browser controller toolbar. */
    aiHubToolbar: ToolbarApi;
    /** React-owned AI Hub account-card view mounted over the dedicated #accounts subtree. */
    MadStationAccountList?: AccountListController;
    /** Existing shared theme adapter loaded before the React toolbar entry. */
    applyAppearance(settings: Partial<ToolbarState>): void;
  }
}

export {};
