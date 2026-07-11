import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Modal, Space, Tag, Typography, message } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, {
  computeScrollX,
  measureTextWidth,
  useActionsColWidth,
  widthForHeader,
} from '@/components/PageTable';
import type { Acquisition, Item, Measurement, NetCostEntry } from '@/services/unihub-backend/inventory';
import {
  deleteAcquisition,
  deleteItem,
  listAcquisitions,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

const EMPTY = (
  <Typography.Text type="secondary" style={{ userSelect: 'none' }}>
    —
  </Typography.Text>
);

// A row is either an acquisition (parent) or one of its items (child).
type CatalogRow =
  | (Acquisition & { rowType: 'acquisition'; children: CatalogRow[] })
  | (Item & { rowType: 'item' });

function isAcquisition(r: CatalogRow): r is Acquisition & { rowType: 'acquisition'; children: CatalogRow[] } {
  return r.rowType === 'acquisition';
}

function measureText(m: Measurement | null | undefined): string | null {
  return m ? `${m.value} ${m.unit}` : null;
}

function formatNetCost(net: NetCostEntry[]): string | null {
  if (!net || net.length === 0) return null;
  return net.map((n) => `${Number(n.total).toLocaleString()} ${n.currency}`.trim()).join(', ');
}

function formatDateRelative(val: string | null | undefined) {
  if (!val) return null;
  return `${dayjs(val).format('YYYY-MM-DD HH:mm')} (${dayjs(val).fromNow()})`;
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();
  const [deprecateTarget, setDeprecateTarget] = useState<Item | null>(null);
  const [deprecateDate, setDeprecateDate] = useState<dayjs.Dayjs | null>(null);

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text' },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date' },
    ],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'nameSource', label: t({ id: 'pages.inventory.catalog.col.nameSource' }), dataType: 'text', visible: true, order: 0 },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text', visible: true, order: 1 },
      { key: 'size', label: t({ id: 'pages.inventory.items.col.size' }), dataType: 'text', visible: true, order: 2 },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number', visible: true, order: 3 },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select', visible: true, order: 4 },
      { key: 'item_count', label: t({ id: 'pages.inventory.acquisitions.col.itemCount' }), dataType: 'number', visible: true, order: 5 },
      { key: 'net_cost', label: t({ id: 'pages.inventory.acquisitions.col.netCost' }), dataType: 'text', visible: true, order: 6 },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date', visible: true, order: 7 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 8 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-catalog', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'catalog', table.queryParams],
    queryFn: () => listAcquisitions(table.queryParams),
  });
  const acquisitions = useMemo(() => data?.results ?? [], [data]);

  const rows = useMemo<CatalogRow[]>(
    () =>
      acquisitions.map((a) => ({
        ...a,
        rowType: 'acquisition',
        children: a.items.map((it) => ({ ...it, rowType: 'item' as const })),
      })),
    [acquisitions],
  );

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.catalog.loadError' }));
  }, [isError, t]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'catalog'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'acquisitions'] });
  };

  const deleteAcqMutation = useMutation({
    mutationFn: deleteAcquisition,
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.acquisitions.deleted' }));
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.items.deleted' }));
    },
  });

  const deprecateMutation = useMutation({
    mutationFn: ({ id, ts }: { id: string; ts: string | null }) => updateItem(id, { deprecate_time: ts }),
    onSuccess: () => {
      invalidate();
      setDeprecateTarget(null);
      message.success(t({ id: 'pages.inventory.items.deprecated' }));
    },
  });

  const confirmDeleteAcq = (record: Acquisition) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.acquisitions.delete.title' }),
      content: t({ id: 'pages.inventory.acquisitions.delete.confirm' }, { count: record.item_count }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => deleteAcqMutation.mutate(record.id),
    });
  };

  const confirmDeleteItem = (item: Item) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.items.delete.title' }),
      content: t({ id: 'pages.inventory.items.delete.confirm' }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => deleteItemMutation.mutate(item.id),
    });
  };

  const openDeprecate = (item: Item) => {
    setDeprecateTarget(item);
    setDeprecateDate(dayjs().startOf('day'));
  };

  const actionsColWidth = useActionsColWidth(acquisitions);
  const nameWidth = useMemo(
    () =>
      rows.reduce((m, r) => {
        const label = isAcquisition(r) ? r.source : r.name;
        return Math.max(m, measureTextWidth(label ?? ''));
      }, 0),
    [rows],
  );

  const colDefMap = useMemo<Record<string, ProColumns<CatalogRow>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      return {
        nameSource: {
          key: 'nameSource',
          title: t({ id: 'pages.inventory.catalog.col.nameSource' }),
          ...widthForHeader(t({ id: 'pages.inventory.catalog.col.nameSource' }), Math.max(200, nameWidth)),
          fixed: getFixed('nameSource'),
          render: (_, r) => {
            if (isAcquisition(r)) {
              return (
                <Space>
                  <Tag color="blue">{t({ id: 'pages.inventory.catalog.acquisitionRow' })}</Tag>
                  <span>{r.source || t({ id: 'pages.inventory.acquisitions.new.untitled' })}</span>
                </Space>
              );
            }
            return <span>{r.name}</span>;
          },
        },
        spec: {
          key: 'spec',
          title: t({ id: 'pages.inventory.items.col.spec' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.spec' }), 180),
          fixed: getFixed('spec'),
          ellipsis: true,
          render: (_, r) => (!isAcquisition(r) && r.spec ? r.spec : EMPTY),
        },
        size: {
          key: 'size',
          title: t({ id: 'pages.inventory.items.col.size' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.size' }), 90),
          fixed: getFixed('size'),
          render: (_, r) => (!isAcquisition(r) && r.size ? r.size : EMPTY),
        },
        weight: {
          key: 'weight',
          title: t({ id: 'pages.inventory.items.col.weight' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.weight' }), 110),
          fixed: getFixed('weight'),
          render: (_, r) => (!isAcquisition(r) ? (measureText(r.weight) ?? EMPTY) : EMPTY),
        },
        status: {
          key: 'status',
          title: t({ id: 'pages.inventory.items.col.status' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.status' }), 120),
          fixed: getFixed('status'),
          render: (_, r) =>
            isAcquisition(r) ? (
              EMPTY
            ) : (
              <Tag color={r.status === 'active' ? 'green' : 'default'}>
                {t({ id: `pages.inventory.items.status.${r.status}` })}
              </Tag>
            ),
        },
        item_count: {
          key: 'item_count',
          title: t({ id: 'pages.inventory.acquisitions.col.itemCount' }),
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.itemCount' }), 90),
          fixed: getFixed('item_count'),
          render: (_, r) => (isAcquisition(r) ? r.item_count : EMPTY),
        },
        net_cost: {
          key: 'net_cost',
          title: t({ id: 'pages.inventory.acquisitions.col.netCost' }),
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.netCost' }), 160),
          fixed: getFixed('net_cost'),
          render: (_, r) => (isAcquisition(r) ? (formatNetCost(r.net_cost) ?? EMPTY) : EMPTY),
        },
        obtained_at: {
          key: 'obtained_at',
          title: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }),
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), 220),
          fixed: getFixed('obtained_at'),
          render: (_, r) => (isAcquisition(r) ? (formatDateRelative(r.obtained_at) ?? EMPTY) : EMPTY),
          ...makeSortProps('obtained_at', t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), sort),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, r) => (
            <span data-actions-col>
              {isAcquisition(r) ? (
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => navigate(`/inventory/acquisitions/${r.id}/edit`)}
                  >
                    {t({ id: 'common.edit' })}
                  </Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteAcq(r)}>
                    {t({ id: 'common.delete' })}
                  </Button>
                </Space>
              ) : (
                <Space>
                  {r.deprecate_time ? (
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      onClick={() => deprecateMutation.mutate({ id: r.id, ts: null })}
                    >
                      {t({ id: 'pages.inventory.items.restore' })}
                    </Button>
                  ) : (
                    <Button size="small" icon={<StopOutlined />} onClick={() => openDeprecate(r)}>
                      {t({ id: 'pages.inventory.items.deprecate' })}
                    </Button>
                  )}
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteItem(r)}>
                    {t({ id: 'common.delete' })}
                  </Button>
                </Space>
              )}
            </span>
          ),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, nameWidth, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns, navigate],
  );

  const columns = useMemo<ProColumns<CatalogRow>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<CatalogRow> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<CatalogRow>
        key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.inventory.catalog.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/inventory/acquisitions/new')}>
            {t({ id: 'pages.inventory.acquisitions.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: filter }}
            sortProps={{ attrs: filterableAttrs, hook: sort }}
            columnProps={{ hook: cols }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        columnEmptyText={false}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}
      />

      <Modal
        title={t({ id: 'pages.inventory.items.deprecate.title' })}
        open={!!deprecateTarget}
        okText={t({ id: 'pages.inventory.items.deprecate' })}
        okButtonProps={{ danger: true }}
        cancelText={t({ id: 'common.cancel' })}
        confirmLoading={deprecateMutation.isPending}
        onCancel={() => setDeprecateTarget(null)}
        onOk={() =>
          deprecateTarget &&
          deprecateMutation.mutate({
            id: deprecateTarget.id,
            ts: (deprecateDate ?? dayjs().startOf('day')).toISOString(),
          })
        }
      >
        <p>{t({ id: 'pages.inventory.items.deprecate.confirm' })}</p>
        <DatePicker showTime style={{ width: '100%' }} value={deprecateDate} onChange={setDeprecateDate} />
      </Modal>
    </>
  );
}
