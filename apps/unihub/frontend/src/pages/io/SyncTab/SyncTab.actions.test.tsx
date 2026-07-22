// US5 (015 FR-015..FR-020, 2026-07-21 refinement FR-022..FR-024): sync
// operations run from commit-graph nodes — no legacy buttons, node actions in
// kebab menus, the uncommitted node auto-renders the staged publish review
// (no "Review & publish" trigger), and checkout supersedes the inline review.
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

const PUSH_PREVIEW = {
  status: 'has_changes' as const,
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

async function openCheckout(user: ReturnType<typeof userEvent.setup>, sha: string) {
  const node = await screen.findByTestId(`commit-node-${sha}`);
  await user.click(within(node).getByRole('button', { name: /node actions/i }));
  await user.click(await screen.findByRole('menuitem', { name: /checkout/i }));
}

describe('SyncTab commit-node interactions (015 US5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncService.getSyncConfig).mockResolvedValue({
      is_configured: true,
      repo_url: 'https://github.com/user/repo',
    });
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(HISTORY);
    vi.mocked(syncService.getPublishPreview).mockResolvedValue(PUSH_PREVIEW);
    vi.mocked(syncService.getCheckoutPreview).mockResolvedValue(CHECKOUT_PREVIEW);
    vi.mocked(syncService.confirmCheckout).mockResolvedValue({
      status: 'applied',
      results: [{ table: 'inventory.item', display_name: 'Items', applied: 1 }],
      auto_included: [],
    });
  });

  it('renders no legacy action buttons and no Review & publish trigger', async () => {
    renderTab();
    await screen.findByText('sync: latest');
    expect(screen.queryByRole('button', { name: /preview push/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /preview pull/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /review & publish/i })).toBeNull();
    expect(screen.queryByText('Local changes not yet published')).toBeNull();
  });

  it('auto-renders the staged publish review inside the uncommitted node', async () => {
    renderTab();

    // No clicks: the pending changes appear directly in the uncommitted node.
    const pendingNode = await screen.findByTestId('commit-node-pending');
    expect(await within(pendingNode).findByText('Items')).toBeTruthy();
    expect(
      within(pendingNode).getByRole('button', { name: /publish selected changes/i }),
    ).toBeTruthy();
    expect(vi.mocked(syncService.getPublishPreview)).toHaveBeenCalledTimes(1);
  });

  it('shows an error with retry inside the uncommitted node when the preview fails', async () => {
    vi.mocked(syncService.getPublishPreview).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderTab();

    const pendingNode = await screen.findByTestId('commit-node-pending');
    expect(
      await within(pendingNode).findByText(/failed to compute publish preview/i),
    ).toBeTruthy();

    await user.click(within(pendingNode).getByRole('button', { name: /retry/i }));
    expect(await within(pendingNode).findByText('Items')).toBeTruthy();
    expect(vi.mocked(syncService.getPublishPreview)).toHaveBeenCalledTimes(2);
  });

  it('offers checkout through the kebab of compatible nodes', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('sync: latest');

    await openCheckout(user, SHA_OLD);
    expect(vi.mocked(syncService.getCheckoutPreview)).toHaveBeenCalledWith(SHA_OLD);
  });

  it('disables the kebab checkout on incompatible nodes without embedding the reason', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('sync: latest');

    const badNode = screen.getByTestId(`commit-node-${SHA_BAD}`);
    await user.click(within(badNode).getByRole('button', { name: /node actions/i }));
    const item = await screen.findByRole('menuitem', { name: /checkout/i });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    // FR-022 (2026-07-22): the menu item is label-only — no reason text inside.
    expect(within(item).queryByText(/Missing required column/)).toBeNull();
    await user.click(item);
    expect(vi.mocked(syncService.getCheckoutPreview)).not.toHaveBeenCalled();
  });

  it('checkout shows a staged preview embedded in the commit node and confirms with exclusions', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('sync: latest');

    await openCheckout(user, SHA_OLD);

    // FR-029: the whole review renders inside the target commit's node.
    const oldNode = screen.getByTestId(`commit-node-${SHA_OLD}`);
    await within(oldNode).findByText(/restores your local data/i);
    expect(within(oldNode).getByText('Items')).toBeTruthy();
    await user.click(within(oldNode).getByRole('button', { name: /restore this snapshot/i }));
    await waitFor(() =>
      expect(vi.mocked(syncService.confirmCheckout)).toHaveBeenCalledTimes(1),
    );
    expect(vi.mocked(syncService.confirmCheckout).mock.calls[0]?.[0]).toEqual({
      commit: SHA_OLD,
      diff_digest: DIGEST,
      excluded: [],
    });
  });

  it('hides the inline pending review while a checkout review is open and restores it after', async () => {
    const user = userEvent.setup();
    renderTab();

    // Pending review visible first (FR-023).
    await screen.findByRole('button', { name: /publish selected changes/i });

    await openCheckout(user, SHA_OLD);
    // The review is embedded in the target commit node (FR-029)…
    const oldNode = screen.getByTestId(`commit-node-${SHA_OLD}`);
    await within(oldNode).findByRole('button', { name: /restore this snapshot/i });
    // …and one staged review is active at a time (FR-024).
    expect(screen.queryByRole('button', { name: /publish selected changes/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await screen.findByRole('button', { name: /publish selected changes/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /restore this snapshot/i })).toBeNull();
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

    await openCheckout(user, SHA_OLD);
    await user.click(await screen.findByRole('button', { name: /restore this snapshot/i }));

    expect(await screen.findByText(/automatically included/i)).toBeTruthy();
  });

  it('keeps force-publish reachable when a publish race diverges', async () => {
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

    await user.click(await screen.findByRole('button', { name: /publish selected changes/i }));

    const force = await screen.findByRole('button', { name: /force publish/i });
    await user.click(force);
    await waitFor(() =>
      expect(vi.mocked(syncService.forcePublishSync)).toHaveBeenCalledTimes(1),
    );
  });
});
