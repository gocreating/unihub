// US3 (015 FR-006..FR-009): the Sync tab's commit graph — local/remote markers,
// force-push visibility, compatibility gating, bounded history with load-more.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { CommitGraph } from './CommitGraph';
import * as syncService from '@/services/unihub-backend/sync';
import type { SyncHistoryResult } from '@/services/unihub-backend/sync';

vi.mock('@/services/unihub-backend/sync');

const SHA_HEAD = 'aaaa111'.padEnd(40, '0');
const SHA_OLD = 'bbbb222'.padEnd(40, '0');
const SHA_BAD = 'cccc333'.padEnd(40, '0');

function historyResult(overrides: Partial<SyncHistoryResult> = {}): SyncHistoryResult {
  return {
    commits: [
      {
        sha: SHA_HEAD,
        parents: [SHA_OLD],
        author_date: '2026-07-19T12:00:00Z',
        message: 'sync: inventory.item',
        is_remote_head: true,
        is_local_state: false,
        compatible: true,
        incompatible_reason: null,
      },
      {
        sha: SHA_OLD,
        parents: [],
        author_date: '2026-07-18T12:00:00Z',
        message: 'sync: 3 tables',
        is_remote_head: false,
        is_local_state: true,
        compatible: true,
        incompatible_reason: null,
      },
      {
        sha: SHA_BAD,
        parents: [],
        author_date: '2026-07-17T12:00:00Z',
        message: 'sync: broken snapshot',
        is_remote_head: false,
        is_local_state: false,
        compatible: false,
        incompatible_reason: 'inventory.item: Missing required column: id:string.',
      },
    ],
    has_more: false,
    remote_head: SHA_HEAD,
    local_commit: SHA_OLD,
    has_local_changes: false,
    history_rewritten: false,
    ...overrides,
  };
}

function renderGraph() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <CommitGraph />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('CommitGraph (015 US3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(historyResult());
  });

  it('renders commit nodes with sha7, message, and local/remote badges', async () => {
    renderGraph();

    expect(await screen.findByText('aaaa111')).toBeTruthy();
    expect(screen.getByText('sync: inventory.item')).toBeTruthy();
    expect(screen.getByText('Remote latest')).toBeTruthy();
    expect(screen.getByText('Local')).toBeTruthy();
  });

  it('shows a pending-local-changes node when the dataset differs from the local commit', async () => {
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(
      historyResult({ has_local_changes: true }),
    );
    renderGraph();
    expect(await screen.findByText('Local changes not yet published')).toBeTruthy();
  });

  it('shows a rewritten-history warning after a force-push', async () => {
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(
      historyResult({ history_rewritten: true }),
    );
    renderGraph();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/rewritten/i);
  });

  it('marks incompatible commits and explains why on hover', async () => {
    const user = userEvent.setup();
    renderGraph();

    const badNode = await screen.findByTestId(`commit-node-${SHA_BAD}`);
    expect(badNode.getAttribute('data-compatible')).toBe('false');

    await user.hover(screen.getByText('sync: broken snapshot'));
    expect(
      await screen.findByText(/Missing required column: id:string/),
    ).toBeTruthy();
  });

  it('loads older commits via the load-more button', async () => {
    const user = userEvent.setup();
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(historyResult({ has_more: true }));
    renderGraph();

    await user.click(await screen.findByRole('button', { name: /load more/i }));

    await waitFor(() =>
      expect(vi.mocked(syncService.getSyncHistory)).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(syncService.getSyncHistory).mock.calls[1]?.[0]).toEqual({
      before: SHA_BAD,
    });
  });

  it('shows a descriptive error with retry when the history fetch fails', async () => {
    const user = userEvent.setup();
    vi.mocked(syncService.getSyncHistory).mockRejectedValueOnce(new Error('boom'));
    renderGraph();

    expect(await screen.findByText(/failed to load sync history/i)).toBeTruthy();

    vi.mocked(syncService.getSyncHistory).mockResolvedValue(historyResult());
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('aaaa111')).toBeTruthy();
  });
});
