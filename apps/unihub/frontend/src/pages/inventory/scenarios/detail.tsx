import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  List,
  Tree,
  Typography,
  message,
} from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
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
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { childrenOf, computeDropTarget } from './organizeTree';

export function ScenarioDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [search, setSearch] = useState('');
  // Two panels side by side; stack on a narrow content area (Principle VI).
  const { ref, isNarrow } = useContainerWidth(720);

  const [scenarioQ, linesQ] = useQueries({
    queries: [
      { queryKey: ['inventory', 'scenario', id], queryFn: () => getScenario(id) },
      { queryKey: ['inventory', 'scenario', id, 'lines'], queryFn: () => listScenarioItems(id) },
    ],
  });
  const scenario = scenarioQ.data;
  const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
  const memberItemIds = useMemo(() => new Set(lines.map((l) => l.item.id)), [lines]);

  // Backlog: server-side case-insensitive substring over name OR spec.
  const backlogQ = useQuery({
    queryKey: ['inventory', 'scenario-backlog', search],
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
    enabled: search.trim().length > 0,
  });
  const backlogItems = useMemo(
    () => (backlogQ.data?.results ?? []).filter((item) => !memberItemIds.has(item.id)),
    [backlogQ.data, memberItemIds],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'scenario', id] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'scenario-backlog'] });
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
    mutationFn: ({ lineId, container_id, index }: { lineId: string; container_id: string | null; index: number }) =>
      moveScenarioItem(id, lineId, { container_id, index }),
    onSuccess: invalidate,
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.moveFailed' })),
  });

  // Organize tree: nodes keyed by line id, nested by container, in saved order.
  const treeData = useMemo<TreeDataNode[]>(() => {
    const build = (parentId: string | null): TreeDataNode[] =>
      childrenOf(lines, parentId).map((line) => ({
        key: line.id,
        title: (
          <span>
            {line.item.name}
            <Button
              size="small"
              type="text"
              danger
              aria-label={t({ id: 'pages.inventory.scenarios.organize.remove' })}
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                removeMutation.mutate(line.id);
              }}
            />
          </span>
        ),
        children: build(line.id),
      }));
    return build(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, t]);

  const onDrop: TreeProps['onDrop'] = (info) => {
    const dragId = String(info.dragNode.key);
    const dropId = String(info.node.key);
    const dropPos = info.node.pos.split('-');
    const relPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);
    const target = computeDropTarget(lines, dragId, dropId, info.dropToGap, relPosition);
    moveMutation.mutate({ lineId: dragId, ...target });
  };

  const panels: CSSProperties = {
    display: 'flex',
    flexDirection: isNarrow ? 'column' : 'row',
    gap: 16,
    alignItems: 'stretch',
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
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {scenario?.name}
      </Typography.Title>
      {scenario?.description ? (
        <Typography.Paragraph type="secondary">{scenario.description}</Typography.Paragraph>
      ) : null}

      <div style={panels}>
        {/* Backlog: fuzzy-search the catalog, add items to the scenario. */}
        <Card
          title={t({ id: 'pages.inventory.scenarios.backlog' })}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Input.Search
            placeholder={t({ id: 'pages.inventory.scenarios.backlog.search' })}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <List
            size="small"
            loading={backlogQ.isFetching}
            dataSource={backlogItems}
            locale={{
              emptyText: search.trim()
                ? t({ id: 'pages.inventory.scenarios.backlog.empty' })
                : ' ',
            }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="add"
                    size="small"
                    icon={<PlusOutlined />}
                    loading={addMutation.isPending && addMutation.variables === item.id}
                    onClick={() => addMutation.mutate(item.id)}
                  >
                    {t({ id: 'pages.inventory.scenarios.backlog.add' })}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={item.name}
                  description={item.spec || undefined}
                />
              </List.Item>
            )}
          />
        </Card>

        {/* Organize: drag to nest (containment) and order items. */}
        <Card
          title={t({ id: 'pages.inventory.scenarios.organize' })}
          style={{ flex: 1, minWidth: 0 }}
        >
          {treeData.length === 0 ? (
            <Empty description={t({ id: 'pages.inventory.scenarios.organize.empty' })} />
          ) : (
            <Tree
              draggable={{ icon: false }}
              blockNode
              defaultExpandAll
              treeData={treeData}
              onDrop={onDrop}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
