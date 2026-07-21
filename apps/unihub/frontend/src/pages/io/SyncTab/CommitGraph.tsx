// The Sync tab's commit graph (015 US3, refined 2026-07-21): a vertical rail of
// the data repo's history with local-state / remote-head markers, an
// uncommitted-changes node that hosts the inline staged review (FR-023),
// per-node kebab action menus (FR-022), force-push (rewritten history)
// visibility, and per-commit compatibility gating. Custom component — the
// history is linear, and nodes are interactive controls, not a chart (ECharts
// stays scoped to finance).
import { Alert, Button, Card, Dropdown, Spin, Tag, Tooltip, Typography } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { DateTimeCell } from '@/components/DateTimeCell';
import { useSyncHistory } from './useSyncHistory';
import type { SyncHistoryCommit } from '@/services/unihub-backend/sync';

const { Text } = Typography;

const DOT_SIZE = 10;

function RailDot({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: '50%',
        marginTop: 6,
        flex: 'none',
        ...(dashed
          ? { border: `2px dashed ${color}` }
          : { background: color }),
      }}
    />
  );
}

function NodeRow({
  dot,
  isLast,
  children,
  testId,
  compatible,
}: {
  dot: React.ReactNode;
  isLast: boolean;
  children: React.ReactNode;
  testId?: string;
  compatible?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      data-compatible={compatible === undefined ? undefined : String(compatible)}
      style={{ display: 'flex', gap: 12, opacity: compatible === false ? 0.5 : 1 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {dot}
        {!isLast && (
          <span style={{ width: 2, flex: 1, background: '#d9d9d9', marginTop: 4 }} />
        )}
      </div>
      <div style={{ paddingBottom: 16, minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

function CommitNode({
  commit,
  isLast,
  onCheckout,
}: {
  commit: SyncHistoryCommit;
  isLast: boolean;
  onCheckout?: (sha: string) => void;
}) {
  const { formatMessage: t } = useIntl();

  // All node actions live in the kebab menu — no inline row buttons (FR-022).
  const menuItems = [
    {
      key: 'checkout',
      disabled: !commit.compatible,
      label: commit.compatible ? (
        t({ id: 'pages.io.sync.graph.checkoutAction' })
      ) : (
        <div>
          <div>{t({ id: 'pages.io.sync.graph.checkoutAction' })}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t(
              { id: 'pages.io.sync.graph.incompatible' },
              { reason: commit.incompatible_reason ?? '' },
            )}
          </Text>
        </div>
      ),
    },
  ];

  const content = (
    <NodeRow
      dot={<RailDot color={commit.is_remote_head ? '#1677ff' : '#8c8c8c'} />}
      isLast={isLast}
      testId={`commit-node-${commit.sha}`}
      compatible={commit.compatible}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text code>{commit.sha.slice(0, 7)}</Text>
        {commit.is_remote_head && (
          <Tag color="blue">{t({ id: 'pages.io.sync.graph.remoteBadge' })}</Tag>
        )}
        {commit.is_local_state && (
          <Tag color="blue">{t({ id: 'pages.io.sync.graph.localBadge' })}</Tag>
        )}
        <Dropdown
          trigger={['click']}
          menu={{
            items: menuItems,
            onClick: ({ key }) => {
              if (key === 'checkout') onCheckout?.(commit.sha);
            },
          }}
        >
          <Button
            size="small"
            type="text"
            icon={<MoreOutlined />}
            aria-label={t({ id: 'pages.io.sync.graph.nodeActions' })}
          />
        </Dropdown>
      </div>
      <div>
        <Text>{commit.message}</Text>
      </div>
      <DateTimeCell value={commit.author_date} />
    </NodeRow>
  );

  // Gated tooltip: only incompatible nodes explain themselves on hover. The
  // hover target fits its content so the bubble centers on the node (FR-021).
  if (!commit.compatible) {
    return (
      <Tooltip
        title={t(
          { id: 'pages.io.sync.graph.incompatible' },
          { reason: commit.incompatible_reason ?? '' },
        )}
      >
        <div style={{ width: 'fit-content' }}>{content}</div>
      </Tooltip>
    );
  }
  return content;
}

export interface CommitGraphProps {
  /**
   * Body of the uncommitted-changes node (015 FR-023): the inline staged
   * publish review, rendered whenever local unpublished changes exist.
   */
  pendingContent?: React.ReactNode;
  /** Kebab checkout action on every COMPATIBLE commit node (015 US5). */
  onCheckout?: (sha: string) => void;
}

export function CommitGraph({ pendingContent, onCheckout }: CommitGraphProps) {
  const { formatMessage: t } = useIntl();

  const query = useSyncHistory();

  const first = query.data?.pages[0];
  const commits = query.data?.pages.flatMap((p) => p.commits) ?? [];

  return (
    <Card title={t({ id: 'pages.io.sync.graph.title' })} size="small">
      {query.isPending && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
        </div>
      )}

      {query.isError && (
        <Alert
          type="error"
          showIcon
          message={t({ id: 'pages.io.sync.graph.error' })}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {t({ id: 'pages.io.sync.graph.retry' })}
            </Button>
          }
        />
      )}

      {first && (
        <>
          {first.history_rewritten && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={t({ id: 'pages.io.sync.graph.rewritten' })}
            />
          )}

          {first.has_local_changes && (
            <NodeRow
              dot={<RailDot color="#1677ff" dashed />}
              isLast={commits.length === 0}
              testId="commit-node-pending"
            >
              {pendingContent}
            </NodeRow>
          )}

          {commits.length === 0 && !first.has_local_changes && (
            <Text type="secondary">{t({ id: 'pages.io.sync.graph.empty' })}</Text>
          )}

          {commits.map((commit, idx) => (
            <CommitNode
              key={commit.sha}
              commit={commit}
              isLast={idx === commits.length - 1}
              onCheckout={onCheckout}
            />
          ))}

          {query.hasNextPage && (
            <Button
              size="small"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t({ id: 'pages.io.sync.graph.loadMore' })}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
