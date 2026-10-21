/**
 * Coordinates account-scoped Arena data cleanup without importing Electron.
 * Native view closing and session resolution are supplied by the main-process
 * host. Storage and cache cleanup are attempted independently so one failure
 * does not prevent the other best-effort cleanup step.
 */

export type ArenaAccountDataWipeStep =
  | 'close-view'
  | 'resolve-session'
  | 'clear-storage'
  | 'clear-cache';

export interface ArenaAccountDataWipeResult {
  status: 'cleared' | 'partial';
  failedSteps: ArenaAccountDataWipeStep[];
}

export interface ArenaSessionForWipe {
  clearStorageData(): Promise<unknown>;
  clearCache(): Promise<unknown>;
}

export interface ArenaViewCloseOutcome {
  status?: 'missing' | 'closed' | 'failed';
}

export interface ArenaAccountDataWipeDependencies<TAccount extends { id: string }, TSession extends ArenaSessionForWipe> {
  closeView(accountId: string): ArenaViewCloseOutcome | void;
  getSession(account: TAccount): TSession;
}

/** Close the account's WebContents before touching its persistent session data. */
export async function wipeArenaAccountDataRuntime<
  TAccount extends { id: string },
  TSession extends ArenaSessionForWipe,
>(
  account: TAccount,
  dependencies: ArenaAccountDataWipeDependencies<TAccount, TSession>,
): Promise<ArenaAccountDataWipeResult> {
  const failedSteps: ArenaAccountDataWipeStep[] = [];

  // Chromium sessionStorage is per tab and disappears with the closed WebContents.
  try {
    const closeResult = dependencies.closeView(account.id);
    if (closeResult?.status === 'failed') failedSteps.push('close-view');
  } catch {
    failedSteps.push('close-view');
  }

  let session: TSession;
  try {
    session = dependencies.getSession(account);
  } catch {
    failedSteps.push('resolve-session');
    return { status: 'partial', failedSteps };
  }

  // Attempt these independently: storage clearing can fail on a locked or
  // unavailable profile, but cache clearing should still get its best effort.
  try {
    await session.clearStorageData();
  } catch {
    failedSteps.push('clear-storage');
  }

  try {
    await session.clearCache();
  } catch {
    failedSteps.push('clear-cache');
  }

  return {
    status: failedSteps.length > 0 ? 'partial' : 'cleared',
    failedSteps,
  };
}
