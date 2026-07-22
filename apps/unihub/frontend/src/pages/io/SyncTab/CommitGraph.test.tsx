// US3 (015 FR-006..FR-009, refinements FR-021/FR-022 + FR-025..FR-027): the
// Sync tab's commit rail — bare (no "History" container), local/remote markers,
// force-push visibility, compatibility gating, bounded history (10 + load-more
// 20 as its own timeline node), per-node kebab menus (label-only when
// disabled), content-fit tooltip targets, uniform hash/marker badges, and the
// three-line node arrangement with a single-line timestamp.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import enUS from '@/locales/en-US';
import { CommitGraph } from './CommitGraph';
import type { CommitGraphProps } from './CommitGraph';
import * as syncService from '@/services/unihub-backend/sync';
import type { SyncHistoryResult } from '@/services/unihub-backend/sync';

vi.mock('@/services/unihub-backend/sync');

dayjs.extend(relativeTime);

const SHA_HEAD = 'aaaa111'.padEnd(40, '0');
const SHA_OLD = 'bbbb222'.padEnd(40, '0');
const SHA_BAD = 'cccc333'.padEnd(40, '0');

const HEAD_DATE = '2026-07-19T12:00:00Z';

function historyResult(overrides: Partial<SyncHistoryResult> = {}): SyncHistoryResult {
  return {
    commits: [
      {
        sha: SHA_HEAD,
        parents: [SHA_OLD],
        author_date: HEAD_DATE,
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

function renderGraph(props: CommitGraphProps = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <CommitGraph {...props} />
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

  it('renders both the Local and Remote latest badges in the blue info color', async () => {
    renderGraph();

    const remote = (await screen.findByText('Remote latest')).closest('.ant-tag');
    const local = screen.getByText('Local').closest('.ant-tag');
    expect(remote?.className).toContain('ant-tag-blue');
    expect(local?.className).toContain('ant-tag-blue');
  });

  it('renders the rail bare — no History container (FR-025)', async () => {
    const { container } = renderGraph();

    await screen.findByText('aaaa111');
    expect(screen.queryByText('History')).toBeNull();
    expect(container.querySelector('.ant-card')).toBeNull();
    expect(container.querySelector('.ant-collapse')).toBeNull();
  });

  it('renders the hash as a badge uniform with the marker badges (FR-026)', async () => {
    renderGraph();

    const hash = (await screen.findByText('aaaa111')).closest('.ant-tag');
    expect(hash).toBeTruthy();
  });

  it('arranges each node as hash row, single-line timestamp, then message (FR-027)', async () => {
    renderGraph();

    const headNode = await screen.findByTestId(`commit-node-${SHA_HEAD}`);
    const stamp = `${dayjs(HEAD_DATE).format('YYYY-MM-DD HH:mm')} (${dayjs(HEAD_DATE).fromNow()})`;
    expect(within(headNode).getByText(stamp)).toBeTruthy();

    const text = headNode.textContent ?? '';
    expect(text.indexOf('aaaa111')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('aaaa111')).toBeLessThan(text.indexOf(stamp));
    expect(text.indexOf(stamp)).toBeLessThan(text.indexOf('sync: inventory.item'));
  });

  it('requests an initial window of 10 commits', async () => {
    renderGraph();

    await screen.findByText('aaaa111');
    expect(vi.mocked(syncService.getSyncHistory).mock.calls[0]?.[0]).toEqual({
      limit: 10,
    });
  });

  it('folds node actions into a kebab menu instead of inline buttons', async () => {
    renderGraph();

    const headNode = await screen.findByTestId(`commit-node-${SHA_HEAD}`);
    // The kebab trigger is the ONLY button in a commit row.
    const buttons = within(headNode).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(within(headNode).getByRole('button', { name: /node actions/i })).toBeTruthy();
  });

  it('offers Checkout in the kebab of a compatible commit', async () => {
    const onCheckout = vi.fn();
    const user = userEvent.setup();
    renderGraph({ onCheckout });

    const oldNode = await screen.findByTestId(`commit-node-${SHA_OLD}`);
    await user.click(within(oldNode).getByRole('button', { name: /node actions/i }));
    const item = await screen.findByRole('menuitem', { name: /checkout/i });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');

    await user.click(item);
    expect(onCheckout).toHaveBeenCalledWith(SHA_OLD);
  });

  it('disables the kebab Checkout item WITHOUT embedding the reason (FR-022)', async () => {
    const onCheckout = vi.fn();
    const user = userEvent.setup();
    renderGraph({ onCheckout });

    const badNode = await screen.findByTestId(`commit-node-${SHA_BAD}`);
    expect(badNode.getAttribute('data-compatible')).toBe('false');

    await user.click(within(badNode).getByRole('button', { name: /node actions/i }));
    const item = await screen.findByRole('menuitem', { name: /checkout/i });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    // The menu never explains — the reason lives on the node tooltip only.
    expect(within(item).queryByText(/Missing required column/)).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /missing required column/i })).toBeNull();

    await user.click(item);
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('anchors the incompatible tooltip to a content-fit hover target', async () => {
    const user = userEvent.setup();
    renderGraph();

    const badNode = await screen.findByTestId(`commit-node-${SHA_BAD}`);
    // The tooltip's hover target wraps the node content, sized to fit it —
    // never stretched to the full row/card width (FR-021).
    expect((badNode.parentElement as HTMLElement).style.width).toBe('fit-content');

    await user.hover(within(badNode).getByText('sync: broken snapshot'));
    expect(
      (await screen.findAllByText(/Missing required column: id:string/)).length,
    ).toBeGreaterThan(0);
  });

  it('renders pendingContent inside the uncommitted node, without the old placeholder', async () => {
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(
      historyResult({ has_local_changes: true }),
    );
    renderGraph({ pendingContent: <div data-testid="pending-review">staged review</div> });

    const pendingNode = await screen.findByTestId('commit-node-pending');
    expect(within(pendingNode).getByTestId('pending-review')).toBeTruthy();
    expect(screen.queryByText('Local changes not yet published')).toBeNull();
    expect(screen.queryByRole('button', { name: /review & publish/i })).toBeNull();
  });

  it('renders commitContent inside the matching commit node only (FR-029)', async () => {
    renderGraph({
      commitContent: { sha: SHA_OLD, node: <div data-testid="checkout-review">review</div> },
    });

    const oldNode = await screen.findByTestId(`commit-node-${SHA_OLD}`);
    expect(within(oldNode).getByTestId('checkout-review')).toBeTruthy();
    const headNode = screen.getByTestId(`commit-node-${SHA_HEAD}`);
    expect(within(headNode).queryByTestId('checkout-review')).toBeNull();
  });

  it('renders no uncommitted node when there are no local changes', async () => {
    renderGraph({ pendingContent: <div data-testid="pending-review" /> });

    await screen.findByText('aaaa111');
    expect(screen.queryByTestId('commit-node-pending')).toBeNull();
    expect(screen.queryByTestId('pending-review')).toBeNull();
  });

  it('shows a rewritten-history warning after a force-push', async () => {
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(
      historyResult({ history_rewritten: true }),
    );
    renderGraph();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/rewritten/i);
  });

  it('loads older commits in batches of 20 via a load-more timeline node', async () => {
    const user = userEvent.setup();
    vi.mocked(syncService.getSyncHistory).mockResolvedValue(historyResult({ has_more: true }));
    renderGraph();

    // "Load more" is itself a node on the rail (FR-009), and the preceding
    // commit keeps its connector line running into it.
    const loadMoreNode = await screen.findByTestId('commit-node-load-more');
    const lastCommit = screen.getByTestId(`commit-node-${SHA_BAD}`);
    expect(lastCommit.querySelector('span[style*="width: 2px"]')).toBeTruthy();

    await user.click(within(loadMoreNode).getByRole('button', { name: /load more/i }));

    await waitFor(() =>
      expect(vi.mocked(syncService.getSyncHistory)).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(syncService.getSyncHistory).mock.calls[1]?.[0]).toEqual({
      limit: 20,
      before: SHA_BAD,
    });
  });

  it('renders no load-more node when history is exhausted', async () => {
    renderGraph();

    await screen.findByText('aaaa111');
    expect(screen.queryByTestId('commit-node-load-more')).toBeNull();
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
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
