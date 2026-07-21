import { useInfiniteQuery } from '@tanstack/react-query';
import { getSyncHistory } from '@/services/unihub-backend/sync';

/** Initial history window / load-more batch (015 refinement R12, FR-009). */
const INITIAL_WINDOW = 10;
const LOAD_MORE_BATCH = 20;

// Shared between CommitGraph (rendering) and the Sync tab actions (which need
// has_local_changes to auto-enable the inline publish review, FR-023). Both
// callers hit the same query key, so React Query dedupes the fetch.
export function useSyncHistory() {
  return useInfiniteQuery({
    queryKey: ['sync', 'history'],
    queryFn: ({ pageParam }) =>
      getSyncHistory(
        pageParam
          ? { limit: LOAD_MORE_BATCH, before: pageParam }
          : { limit: INITIAL_WINDOW },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.has_more ? last.commits[last.commits.length - 1]?.sha : undefined,
  });
}
