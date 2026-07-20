// US1 (015 FR-002): the publish confirm is pinned to its preview — the confirm
// request carries the previewed base_commit + diff_digest, and a stale-preview
// rejection auto-refreshes the preview instead of publishing something else.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { SyncTab } from './index';
import * as syncService from '@/services/unihub-backend/sync';

vi.mock('@/services/unihub-backend/sync');

const BASE = 'a'.repeat(40);
const DIGEST = 'b'.repeat(64);

const PREVIEW = {
  status: 'has_changes' as const,
  base_commit: BASE,
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
          after: { 'id:string': 'itm-1', 'name:string': 'Cup' },
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

describe('SyncTab publish pinning (015 US1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncService.getSyncConfig).mockResolvedValue({
      is_configured: true,
      repo_url: 'https://github.com/user/repo',
    });
    vi.mocked(syncService.getPublishPreview).mockResolvedValue(PREVIEW);
  });

  it('sends the previewed base_commit and diff_digest on confirm', async () => {
    vi.mocked(syncService.publishSync).mockResolvedValue({
      status: 'published',
      commit_sha: 'c'.repeat(40),
      tables_exported: ['inventory.item'],
    });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: /preview push/i }));
    await user.click(await screen.findByRole('button', { name: /apply push/i }));

    await waitFor(() => expect(syncService.publishSync).toHaveBeenCalledTimes(1));
    expect(vi.mocked(syncService.publishSync).mock.calls[0]?.[0]).toEqual({
      base_commit: BASE,
      diff_digest: DIGEST,
    });
  });

  it('auto-refreshes the preview when the confirm is rejected as stale', async () => {
    vi.mocked(syncService.publishSync).mockRejectedValue(
      Object.assign(new Error('stale'), { code: 'preview_stale' }),
    );
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: /preview push/i }));
    expect(vi.mocked(syncService.getPublishPreview)).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole('button', { name: /apply push/i }));

    // The stale rejection must trigger a fresh preview fetch (never a publish
    // of anything other than what was previewed).
    await waitFor(() =>
      expect(vi.mocked(syncService.getPublishPreview)).toHaveBeenCalledTimes(2),
    );
  });
});
