// US5 (015 FR-015..FR-020): sync operations run from commit-graph nodes — the
// four legacy buttons are gone, checkout flows through a staged preview, and
// incompatible commits offer no checkout.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { SyncTab } from './index';
import * as syncService from '@/services/unihub-backend/sync';
import type { SyncHistoryResult } from '@/services/unihub-backend/sync';

vi.mock('@/services/unihub-backend/sync');

const SHA_HEAD = 'aaaa111'.padEnd(40, '0');
const SHA_OLD = 'bbbb222'.padEnd(40, '0');
const SHA_BAD = 'cccc333'.padEnd(40, '0');
const DIGEST = 'd'.repeat(64);

const HISTORY: SyncHistoryResult = {
  commits: [
    {
      sha: SHA_HEAD,
      parents: [SHA_OLD],
      author_date: '2026-07-19T12:00:00Z',
      message: 'sync: latest',
      is_remote_head: true,
      is_local_state: false,
      compatible: true,
      incompatible_reason: null,
    },
    {
      sha: SHA_OLD,
      parents: [],
      author_date: '2026-07-18T12:00:00Z',
      message: 'sync: older snapshot',
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
      incompatible_reason: 'inventory.item: Missing required column.',
    },
  ],
  has_more: false,
  remote_head: SHA_HEAD,
  local_commit: SHA_OLD,
  has_local_changes: true,
  history_rewritten: false,
};

const CHECKOUT_PREVIEW = {
  status: 'has_changes' as const,
  base_commit: SHA_OLD,
  diff_digest: DIGEST,
  changes: [
    {
      table: 'inventory.item',
      display_name: 'Items',
      added: 0,
      modified: 0,
      deleted: 1,
      rows: [
        {
          pk: 'itm-9',
          operation: 'delete' as const,
          before: { 'id:string': 'itm-9', 'name:string': 'Doomed' },
          after: null,
          changed_fields: [],
        },
      ],
    },
  ],
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <SyncTab />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('SyncTab commit-node interactions (015 US5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncService.getSyncConfig).mockResolvedValue({
      is_configured: true,
      repo_url: 'https://github.com/user/repo',
    });
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(HISTORY);
    vi.mocked(syncService.getCheckoutPreview).mockResolvedValue(CHECKOUT_PREVIEW);
    vi.mocked(syncService.confirmCheckout).mockResolvedValue({
      status: 'applied',
      results: [{ table: 'inventory.item', display_name: 'Items', applied: 1 }],
      auto_included: [],
    });
  });

  it('renders no legacy action buttons', async () => {
    renderTab();
    await screen.findByText('sync: latest');
    expect(screen.queryByRole('button', { name: /preview push/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /preview pull/i })).toBeNull();
  });

  it('publishes from the pending-local-changes node', async () => {
    vi.mocked(syncService.getPublishPreview).mockResolvedValue({
      status: 'up_to_date',
    });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: /review & publish/i }));
    await waitFor(() =>
      expect(vi.mocked(syncService.getPublishPreview)).toHaveBeenCalledTimes(1),
    );
  });

  it('offers checkout on compatible nodes only', async () => {
    renderTab();
    await screen.findByText('sync: latest');

    const oldNode = screen.getByTestId(`commit-node-${SHA_OLD}`);
    expect(within(oldNode).getByRole('button', { name: /checkout/i })).toBeTruthy();

    const badNode = screen.getByTestId(`commit-node-${SHA_BAD}`);
    expect(within(badNode).queryByRole('button', { name: /checkout/i })).toBeNull();
  });

  it('checkout shows a staged preview with an overwrite warning and confirms with exclusions', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('sync: latest');

    const oldNode = screen.getByTestId(`commit-node-${SHA_OLD}`);
    await user.click(within(oldNode).getByRole('button', { name: /checkout/i }));

    expect(vi.mocked(syncService.getCheckoutPreview)).toHaveBeenCalledWith(SHA_OLD);
    await screen.findByText('Items');
    // The user is warned that local data will be restored to the snapshot.
    expect(screen.getByText(/restores your local data/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /restore this snapshot/i }));
    await waitFor(() =>
      expect(vi.mocked(syncService.confirmCheckout)).toHaveBeenCalledTimes(1),
    );
    expect(vi.mocked(syncService.confirmCheckout).mock.calls[0]?.[0]).toEqual({
      commit: SHA_OLD,
      diff_digest: DIGEST,
      excluded: [],
    });
  });

  it('surfaces auto-included dependent rows after a checkout', async () => {
    vi.mocked(syncService.confirmCheckout).mockResolvedValue({
      status: 'applied',
      results: [{ table: 'inventory.item', display_name: 'Items', applied: 2 }],
      auto_included: [{ table: 'inventory.acquisition', pk: 'acq-7', operation: 'delete' }],
    });
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('sync: latest');

    const oldNode = screen.getByTestId(`commit-node-${SHA_OLD}`);
    await user.click(within(oldNode).getByRole('button', { name: /checkout/i }));
    await screen.findByText('Items');
    await user.click(screen.getByRole('button', { name: /restore this snapshot/i }));

    expect(await screen.findByText(/automatically included/i)).toBeTruthy();
  });

  it('keeps force-publish reachable when a publish race diverges', async () => {
    vi.mocked(syncService.getPublishPreview).mockResolvedValue({
      status: 'has_changes',
      base_commit: SHA_HEAD,
      diff_digest: DIGEST,
      changes: [
        {
          table: 'inventory.item',
          display_name: 'Items',
          added: 1,
          modified: 0,
          deleted: 0,
          is_new_table: false,
          rows: [
            {
              pk: 'itm-1',
              operation: 'create' as const,
              before: null,
              after: { 'id:string': 'itm-1' },
              changed_fields: [],
            },
          ],
        },
      ],
    });
    vi.mocked(syncService.publishSync).mockRejectedValue(
      Object.assign(new Error('diverged'), { code: 'diverged' }),
    );
    vi.mocked(syncService.forcePublishSync).mockResolvedValue({
      status: 'published',
      commit_sha: 'e'.repeat(40),
      tables_exported: [],
    });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: /review & publish/i }));
    await user.click(await screen.findByRole('button', { name: /publish staged changes/i }));

    const force = await screen.findByRole('button', { name: /force publish/i });
    await user.click(force);
    await waitFor(() =>
      expect(vi.mocked(syncService.forcePublishSync)).toHaveBeenCalledTimes(1),
    );
  });
});
