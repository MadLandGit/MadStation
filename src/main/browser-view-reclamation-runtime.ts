/**
 * Execute the memory-reclamation policy for regular AI Hub account views.
 *
 * Active-account retention and temporary-borrow protection remain owned by
 * browser-view-policy.ts. This adapter only applies that selected list in
 * order and isolates per-view failures so unrelated memory cleanup can finish.
 * Native Electron operations are supplied by the main-process host.
 */

import { planAccountViewReclamation, type AccountViewReclamationOptions } from './browser-view-policy';
import { applyViewPrunePlan, type ViewPruneExecutionResult } from './browser-view-pruning-runtime';

export interface AccountViewReclamationRuntimeResult extends ViewPruneExecutionResult {
  /** IDs selected by the policy, in the order they were handed to the executor. */
  plannedIds: string[];
}

export function reclaimAccountViewsRuntime(
  options: AccountViewReclamationOptions,
  closeView: (id: string) => void,
): AccountViewReclamationRuntimeResult {
  const plannedIds = planAccountViewReclamation(options);
  const execution = applyViewPrunePlan(plannedIds, closeView);
  return { plannedIds, ...execution };
}
