// US4 (015 FR-010..FR-013): staging scopes on the push preview — table-level
// and all-changes toggles, staged counts, zero-staged confirm block, and the
// excluded refs sent with the publish.
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

function row(pk: string, name: string) {
  return {
    pk,
    operation: 'create' as const,
    before: null,
    after: { 'id:string': pk, 'name:string': name },
    changed_fields: [],
  };
}

const PREVIEW = {
  status: 'has_changes' as const,
  base_commit: BASE,
  diff_digest: DIGEST,
  changes: [
    {
      table: 'inventory.item',
      display_name: 'Items',
      added: 2,
      modified: 0,
      deleted: 0,
      is_new_table: false,
      rows: [row('itm-1', 'Cup'), row('itm-2', 'Mug')],
    },
    {
      table: 'inventory.acquisition',
      display_name: 'Acquisitions',
      added: 1,
      modified: 0,
      deleted: 0,
      is_new_table: false,
      rows: [row('acq-1', 'Shop')],
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

// The staged review auto-renders in the uncommitted node (2026-07-21, FR-023).
async function openPreview() {
  renderTab();
  await screen.findByText('Items');
}

describe('SyncTab staging (015 US4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncService.getSyncConfig).mockResolvedValue({
      is_configured: true,
      repo_url: 'https://github.com/user/repo',
    });
    vi.mocked(syncService.getPublishPreview).mockResolvedValue(PREVIEW);
    vi.mocked(syncService.getSyncHistory).mockResolvedValue({
      commits: [],
      has_more: false,
      remote_head: null,
      local_commit: null,
      has_local_changes: true,
      history_rewritten: false,
    });
    vi.mocked(syncService.publishSync).mockResolvedValue({
      status: 'published',
      commit_sha: 'c'.repeat(40),
      tables_exported: [],
    });
  });

  it('shows staged-of-total counts, all staged by default', async () => {
    await openPreview();
    expect(screen.getByText(/3 of 3 changes staged/i)).toBeTruthy();
  });

  it('table-scope toggle unstages the whole table without collapsing it', async () => {
    const user = userEvent.setup();
    await openPreview();

    await user.click(screen.getByRole('checkbox', { name: /stage all: items/i }));
    expect(screen.getByText(/1 of 3 changes staged/i)).toBeTruthy();
  });

  it('all-changes toggle unstages and restages everything', async () => {
    const user = userEvent.setup();
    await openPreview();

    const master = screen.getByRole('checkbox', { name: /stage all changes/i });
    await user.click(master);
    expect(screen.getByText(/0 of 3 changes staged/i)).toBeTruthy();
    await user.click(master);
    expect(screen.getByText(/3 of 3 changes staged/i)).toBeTruthy();
  });

  it('blocks confirm with an explanation when nothing is staged', async () => {
    const user = userEvent.setup();
    await openPreview();

    await user.click(screen.getByRole('checkbox', { name: /stage all changes/i }));
    const confirm = screen.getByRole('button', { name: /publish staged changes/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/nothing staged/i)).toBeTruthy();
    expect(vi.mocked(syncService.publishSync)).not.toHaveBeenCalled();
  });

  it('sends the excluded refs with the publish', async () => {
    const user = userEvent.setup();
    await openPreview();

    await user.click(screen.getByRole('checkbox', { name: /stage all: acquisitions/i }));
    await user.click(screen.getByRole('button', { name: /publish staged changes/i }));

    await waitFor(() => expect(vi.mocked(syncService.publishSync)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(syncService.publishSync).mock.calls[0]?.[0]).toEqual({
      base_commit: BASE,
      diff_digest: DIGEST,
      excluded: [{ table: 'inventory.acquisition', pk: 'acq-1' }],
    });
  });
});
