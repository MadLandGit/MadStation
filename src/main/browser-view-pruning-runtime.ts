/**
 * Apply a previously computed account-view pruning plan.
 *
 * Selection and ordering belong to browser-view-policy.ts. This module applies
 * exactly that ordered list, isolates failures per view, and keeps attempting
 * later closures when one host operation throws. Native operations are injected
 * so this module does not import Electron.
 */

export interface ViewPruneExecutionResult {
  attemptedIds: string[];
  failedIds: string[];
}

export function applyViewPrunePlan(
  closeIds: readonly string[],
  closeView: (id: string) => void,
): ViewPruneExecutionResult {
  const attemptedIds: string[] = [];
  const failedIds: string[] = [];

  for (const id of closeIds) {
    attemptedIds.push(id);
    try {
      closeView(id);
    } catch {
      // One native lifecycle failure must not prevent later planned closures.
      failedIds.push(id);
    }
  }

  return { attemptedIds, failedIds };
}
