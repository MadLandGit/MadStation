/**
 * Pure selection policies for the bounded set of live browser views.
 *
 * This module decides which IDs should remain live; it deliberately does not
 * create, close, attach, or otherwise mutate Electron views or sessions.
 */

export interface ViewPruneOptions {
  viewIds: readonly string[];
  preferredId?: string | null;
  maxLiveViews: number;
  lastVisitedAt: ReadonlyMap<string, number | null | undefined>;
}

/**
 * Return view IDs that should be closed to enforce the live-view limit.
 *
 * Behavior matches the original main-process policy: do nothing below the
 * limit, reserve a slot for the preferred ID when it is live, then keep the
 * remaining most-recently-visited IDs. Stable sort preserves insertion order
 * for equal timestamps. Returned close IDs preserve the input/insertion order.
 */
export function planViewPrune(options: ViewPruneOptions): string[] {
  const { viewIds, preferredId, lastVisitedAt } = options;
  const maxLiveViews = Number.isFinite(options.maxLiveViews)
    ? Math.max(0, Math.floor(options.maxLiveViews))
    : 0;

  if (viewIds.length <= maxLiveViews) return [];
  if (maxLiveViews === 0) return [...viewIds];

  const liveIds = new Set(viewIds);
  const keep = new Set<string>();
  if (preferredId && liveIds.has(preferredId)) keep.add(preferredId);

  const ranked = [...viewIds].sort((a, b) =>
    (lastVisitedAt.get(b) || 0) - (lastVisitedAt.get(a) || 0),
  );
  for (const id of ranked) {
    if (keep.size >= maxLiveViews) break;
    keep.add(id);
  }

  return viewIds.filter((id) => !keep.has(id));
}

export interface AccountViewReclamationOptions {
  viewIds: readonly string[];
  workspaceApp: string;
  locked: boolean;
  activeId?: string | null;
  borrowedIds: ReadonlySet<string>;
}

/**
 * Decide which regular AI Hub account views can be closed during a memory
 * reclaim. The active view is retained only while AI Hub is unlocked, and
 * views temporarily borrowed by AI Lab/Forge flows are never selected here.
 */
export function planAccountViewReclamation(options: AccountViewReclamationOptions): string[] {
  const { viewIds, workspaceApp, locked, activeId, borrowedIds } = options;
  const keepId = workspaceApp === 'ai-hub' && !locked && activeId && viewIds.includes(activeId)
    ? activeId
    : null;

  return viewIds.filter((id) => id !== keepId && !borrowedIds.has(id));
}
