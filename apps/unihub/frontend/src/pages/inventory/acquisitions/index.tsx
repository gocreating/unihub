import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Space, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
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
import type { Acquisition } from '@/services/unihub-backend/inventory';
import { deleteAcquisition, listAcquisitions } from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

const EMPTY = (
  <Typography.Text type="secondary" style={{ userSelect: 'none' }}>
    —
  </Typography.Text>
);

function formatDateRelative(val: string | null | undefined) {
  if (!val) return null;
  return `${dayjs(val).format('YYYY-MM-DD HH:mm')} (${dayjs(val).fromNow()})`;
}

export function AcquisitionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text' },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date' },
    ],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text', visible: true, order: 0 },
      { key: 'item_count', label: t({ id: 'pages.inventory.acquisitions.col.itemCount' }), dataType: 'number', visible: true, order: 1 },
      { key: 'net_cost', label: t({ id: 'pages.inventory.acquisitions.col.netCost' }), dataType: 'text', visible: true, order: 2 },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date', visible: true, order: 3 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 4 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-acquisitions', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'acquisitions', table.queryParams],
    queryFn: () => listAcquisitions(table.queryParams),
  });
  const acquisitions = useMemo(() => data?.results ?? [], [data]);

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.acquisitions.loadError' }));
  }, [isError, t]);

  const deleteMutation = useMutation({
    mutationFn: deleteAcquisition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'acquisitions'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      message.success(t({ id: 'pages.inventory.acquisitions.deleted' }));
    },
  });

  const confirmDelete = (record: Acquisition) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.acquisitions.delete.title' }),
      content: t({ id: 'pages.inventory.acquisitions.delete.confirm' }, { count: record.item_count }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => deleteMutation.mutate(record.id),
    });
  };

  const actionsColWidth = useActionsColWidth(acquisitions);
  const sourceWidth = useMemo(
    () => acquisitions.reduce((m, a) => Math.max(m, measureTextWidth(a.source)), 0),
    [acquisitions],
  );

  const colDefMap = useMemo<Record<string, ProColumns<Acquisition>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      return {
        source: {
          dataIndex: 'source',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.source' }), Math.max(140, sourceWidth)),
          fixed: getFixed('source'),
          render: (val) => (val ? (val as string) : EMPTY),
          ...makeSortProps('source', t({ id: 'pages.inventory.acquisitions.col.source' }), sort),
        },
        item_count: {
          dataIndex: 'item_count',
          title: t({ id: 'pages.inventory.acquisitions.col.itemCount' }),
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.itemCount' }), 110),
          fixed: getFixed('item_count'),
        },
        net_cost: {
          dataIndex: 'net_cost',
          title: t({ id: 'pages.inventory.acquisitions.col.netCost' }),
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.netCost' }), 150),
          fixed: getFixed('net_cost'),
          render: (_, r) =>
            r.net_cost != null
              ? `${Number(r.net_cost).toLocaleString()} ${r.cost_currency}`.trim()
              : EMPTY,
        },
        obtained_at: {
          dataIndex: 'obtained_at',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), 220),
          fixed: getFixed('obtained_at'),
          render: (_, r) => formatDateRelative(r.obtained_at) ?? EMPTY,
          ...makeSortProps('obtained_at', t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), sort),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, record) => (
            <span data-actions-col>
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/inventory/acquisitions/${record.id}/edit`)}
                >
                  {t({ id: 'common.edit' })}
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)}>
                  {t({ id: 'common.delete' })}
                </Button>
              </Space>
            </span>
          ),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, sourceWidth, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns, navigate],
  );

  const columns = useMemo<ProColumns<Acquisition>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<Acquisition> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  return (
    <PageTable<Acquisition>
      key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
      pageTitle={t({ id: 'pages.inventory.acquisitions.title' })}
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
      dataSource={acquisitions}
      loading={isLoading}
      columnEmptyText={false}
      scroll={{ x: computeScrollX(columns) }}
      onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
      pagination={false}
      footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}
    />
  );
}
