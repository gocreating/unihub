import { useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Splitter,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import { DeleteOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import {
  addScenarioItem,
  deleteScenarioItem,
  getScenario,
  listItems,
  listScenarioItems,
  moveScenarioItem,
} from '@/services/unihub-backend/inventory';
import type { Item } from '@/services/unihub-backend/inventory';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { HighlightText } from '@/components/HighlightText';
import {
  childrenOf,
  computeDropTarget,
  organizeAtTopLevel,
  organizeInto,
  sendBack,
  unorganizedLines,
} from './organizeTree';
import type { MovePayload } from './organizeTree';

/** The line being dragged across panes (native HTML5 DnD bridge, R16.2). */
interface DragSource {
  id: string;
  from: 'flat' | 'tree';
}

export function ScenarioDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  // Splitter orientation follows the CONTENT width (Principle VI).
  const { ref, isNarrow } = useContainerWidth(720);
  const dragRef = useRef<DragSource | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [scenarioQ, linesQ] = useQueries({
    queries: [
      { queryKey: ['inventory', 'scenario', id], queryFn: () => getScenario(id) },
      { queryKey: ['inventory', 'scenario', id, 'lines'], queryFn: () => listScenarioItems(id) },
    ],
  });
  const scenario = scenarioQ.data;
  const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
  const memberItemIds = useMemo(() => new Set(lines.map((l) => l.item.id)), [lines]);
  const flatLines = useMemo(() => unorganizedLines(lines), [lines]);

  // Add-modal search: server-side case-insensitive substring over name OR spec.
  const searchQ = useQuery({
    queryKey: ['inventory', 'scenario-search', search],
    queryFn: () =>
      listItems({
        limit: 20,
        filters: {
          groups: [
            { logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: search }] },
            { logic: 'and', conditions: [{ attr: 'spec', op: 'contains', val: search }] },
          ],
        },
      }),
    enabled: addOpen && search.trim().length > 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'scenario', id] });
  };

  const addMutation = useMutation({
    mutationFn: (itemId: string) => addScenarioItem(id, { item_id: itemId }),
    onSuccess: invalidate,
    onError: (err: Error) => message.error(err.message),
  });
  const removeMutation = useMutation({
    mutationFn: (lineId: string) => deleteScenarioItem(id, lineId),
    onSuccess: invalidate,
  });
  const moveMutation = useMutation({
    mutationFn: ({ lineId, ...payload }: { lineId: string } & MovePayload) =>
      moveScenarioItem(id, lineId, payload),
    onSuccess: invalidate,
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.moveFailed' })),
  });

  // ── Cross-pane drag handlers (external drags never reach rc-tree) ──
  const acceptFrom = (from: DragSource['from']) => (e: DragEvent) => {
    if (dragRef.current?.from === from) e.preventDefault();
  };
  const dropOnTreeBackground = (e: DragEvent) => {
    const source = dragRef.current;
    if (source?.from !== 'flat') return;
    e.preventDefault();
    dragRef.current = null;
    moveMutation.mutate({ lineId: source.id, ...organizeAtTopLevel(lines, source.id) });
  };
  const dropOnTreeNode = (containerId: string) => (e: DragEvent) => {
    const source = dragRef.current;
    if (source?.from !== 'flat') return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = null;
    moveMutation.mutate({ lineId: source.id, ...organizeInto(lines, source.id, containerId) });
  };
  const dropOnFlatPane = (e: DragEvent) => {
    const source = dragRef.current;
    if (source?.from !== 'tree') return;
    e.preventDefault();
    dragRef.current = null;
    moveMutation.mutate({ lineId: source.id, ...sendBack() });
  };

  // Organized tree: nodes keyed by line id, nested by container, saved order.
  // Node titles double as drop targets for flat→tree nesting; sending a line
  // back to the flat pane is the ONLY way out of the tree (no remove button).
  const treeData = useMemo<TreeDataNode[]>(() => {
    const build = (parentId: string | null): TreeDataNode[] =>
      childrenOf(lines, parentId).map((line) => ({
        key: line.id,
        title: (
          <span
            onDragOver={(e) => {
              if (dragRef.current?.from === 'flat') {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDrop={dropOnTreeNode(line.id)}
          >
            {line.item.name}
          </span>
        ),
        children: build(line.id),
      }));
    return build(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  // rc-tree-internal drags (rearranging within the tree).
  const onTreeDrop: TreeProps['onDrop'] = (info) => {
    const dragId = String(info.dragNode.key);
    const dropId = String(info.node.key);
    const dropPos = info.node.pos.split('-');
    const relPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);
    const target = computeDropTarget(lines, dragId, dropId, info.dropToGap, relPosition);
    dragRef.current = null;
    moveMutation.mutate({ lineId: dragId, ...target, organized: true });
  };

  const searchResults = searchQ.data?.results ?? [];
  const itemTitle = (item: Item) => {
    const highlighted = <HighlightText text={item.name} query={search} />;
    return item.url ? (
      <a href={item.url} target="_blank" rel="noopener noreferrer">
        {highlighted}
      </a>
    ) : (
      <span>{highlighted}</span>
    );
  };

  return (
    <div ref={ref} style={{ padding: 16 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/inventory/scenarios">{t({ id: 'pages.inventory.scenarios.title' })}</Link> },
          { title: scenario?.name ?? '…' },
        ]}
      />

      {/* Standalone info panel (FR-011). */}
      <Card title={scenario?.name} style={{ marginBottom: 16 }}>
        {scenario?.description ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {scenario.description}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary" disabled>
            -
          </Typography.Text>
        )}
      </Card>

      <Card
        title={t({ id: 'pages.inventory.scenarios.organize' })}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            {t({ id: 'pages.inventory.scenarios.organize.add' })}
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Splitter layout={isNarrow ? 'vertical' : 'horizontal'} style={{ minHeight: 320 }}>
          <Splitter.Panel defaultSize="40%" min="20%">
            <div
              data-testid="unorganized-pane"
              style={{ padding: 12, height: '100%' }}
              onDragOver={acceptFrom('tree')}
              onDrop={dropOnFlatPane}
            >
              <Typography.Text strong>
                {t({ id: 'pages.inventory.scenarios.organize.unorganized' })}
              </Typography.Text>
              <List
                size="small"
                dataSource={flatLines}
                locale={{
                  emptyText: t({ id: 'pages.inventory.scenarios.organize.unorganizedEmpty' }),
                }}
                renderItem={(line) => (
                  <List.Item
                    draggable
                    onDragStart={(e) => {
                      dragRef.current = { id: line.id, from: 'flat' };
                      e.dataTransfer?.setData('text/plain', line.id);
                    }}
                    onDragEnd={() => {
                      dragRef.current = null;
                    }}
                    style={{ cursor: 'grab' }}
                    actions={[
                      <Button
                        key="remove"
                        size="small"
                        type="text"
                        danger
                        aria-label={t({ id: 'pages.inventory.scenarios.organize.remove' })}
                        icon={<DeleteOutlined />}
                        onClick={() => removeMutation.mutate(line.id)}
                      />,
                    ]}
                  >
                    <HolderOutlined style={{ marginRight: 8, color: 'rgba(0,0,0,0.45)' }} />
                    {line.item.name}
                  </List.Item>
                )}
              />
            </div>
          </Splitter.Panel>
          <Splitter.Panel>
            <div
              data-testid="organized-pane"
              style={{ padding: 12, height: '100%' }}
              onDragOver={acceptFrom('flat')}
              onDrop={dropOnTreeBackground}
            >
              <Typography.Text strong>
                {t({ id: 'pages.inventory.scenarios.organize.organized' })}
              </Typography.Text>
              {treeData.length === 0 ? (
                <Empty description={t({ id: 'pages.inventory.scenarios.organize.empty' })} />
              ) : (
                <Tree
                  draggable={{ icon: false }}
                  blockNode
                  defaultExpandAll
                  treeData={treeData}
                  onDragStart={({ node }) => {
                    dragRef.current = { id: String(node.key), from: 'tree' };
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                  }}
                  onDrop={onTreeDrop}
                />
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      </Card>

      {/* Add-items search modal (FR-011): members stay listed but disabled. */}
      <Modal
        title={t({ id: 'pages.inventory.scenarios.organize.addTitle' })}
        open={addOpen}
        footer={null}
        onCancel={() => {
          setAddOpen(false);
          setSearch('');
        }}
      >
        <Input.Search
          placeholder={t({ id: 'pages.inventory.scenarios.organize.searchPlaceholder' })}
          allowClear
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <List
          size="small"
          loading={searchQ.isFetching}
          dataSource={searchResults}
          locale={{
            emptyText: search.trim()
              ? t({ id: 'pages.inventory.scenarios.organize.noResults' })
              : ' ',
          }}
          renderItem={(item) => {
            const isMember = memberItemIds.has(item.id);
            return (
              <List.Item
                style={isMember ? { opacity: 0.5 } : undefined}
                actions={
                  isMember
                    ? [
                        <Tag key="added">
                          {t({ id: 'pages.inventory.scenarios.organize.alreadyAdded' })}
                        </Tag>,
                      ]
                    : [
                        <Button
                          key="add"
                          size="small"
                          icon={<PlusOutlined />}
                          loading={addMutation.isPending && addMutation.variables === item.id}
                          onClick={() => addMutation.mutate(item.id)}
                        >
                          {t({ id: 'pages.inventory.scenarios.organize.add' })}
                        </Button>,
                      ]
                }
              >
                <List.Item.Meta title={itemTitle(item)} description={item.spec || undefined} />
              </List.Item>
            );
          }}
        />
      </Modal>
    </div>
  );
}
