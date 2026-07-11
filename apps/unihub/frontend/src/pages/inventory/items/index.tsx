import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Modal, Space, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import PageTable, {
  computeScrollX,
  measureTextWidth,
  useActionsColWidth,
  widthForHeader,
} from '@/components/PageTable';
import type { Item, ItemWrite, Measurement } from '@/services/unihub-backend/inventory';
import { deleteItem, listItems, updateItem } from '@/services/unihub-backend/inventory';
import { listCurrencies } from '@/services/unihub-backend/finance';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';
import { ItemFormModal } from './ItemFormModal';

const EMPTY = (
  <Typography.Text type="secondary" style={{ userSelect: 'none' }}>
    —
  </Typography.Text>
);

function measureText(m: Measurement | null | undefined): string | null {
  return m ? `${m.value} ${m.unit}` : null;
}

function formatDateRelative(val: string | null | undefined) {
  if (!val) return null;
  return `${dayjs(val).format('YYYY-MM-DD HH:mm')} (${dayjs(val).fromNow()})`;
}

export function ItemsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [editing, setEditing] = useState<Item | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deprecateTarget, setDeprecateTarget] = useState<Item | null>(null);
  const [deprecateDate, setDeprecateDate] = useState<dayjs.Dayjs | null>(null);

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text' },
      { key: 'item_type', label: t({ id: 'pages.inventory.items.col.type' }), dataType: 'single_select' },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number' },
      { key: 'deprecated', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'date' },
    ],
    [t],
  );

  // Default column order per spec: name, spec, size, weight, length, width, height, status, obtained.
  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 0 },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text', visible: true, order: 1 },
      { key: 'size', label: t({ id: 'pages.inventory.items.col.size' }), dataType: 'text', visible: true, order: 2 },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number', visible: true, order: 3 },
      { key: 'length', label: t({ id: 'pages.inventory.items.col.length' }), dataType: 'number', visible: true, order: 4 },
      { key: 'width', label: t({ id: 'pages.inventory.items.col.width' }), dataType: 'number', visible: true, order: 5 },
      { key: 'height', label: t({ id: 'pages.inventory.items.col.height' }), dataType: 'number', visible: true, order: 6 },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select', visible: true, order: 7 },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.items.col.obtainedAt' }), dataType: 'date', visible: true, order: 8 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 9 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-items', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'items', table.queryParams],
    queryFn: () => listItems(table.queryParams),
  });
  const items = useMemo(() => data?.results ?? [], [data]);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencyOptions = useMemo(
    () => (currenciesData?.results ?? []).map((c) => ({ value: c.code, label: c.code })),
    [currenciesData],
  );

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.items.loadError' }));
  }, [isError, t]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }: { id: string; data: Partial<ItemWrite> }) =>
      updateItem(id, patch),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditing(null);
      message.success(t({ id: 'pages.inventory.items.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.items.saveError' })),
  });

  const deprecateMutation = useMutation({
    mutationFn: ({ id, ts }: { id: string; ts: string | null }) =>
      updateItem(id, { deprecate_time: ts }),
    onSuccess: () => {
      invalidate();
      setDeprecateTarget(null);
      message.success(t({ id: 'pages.inventory.items.deprecated' }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.items.deleted' }));
    },
  });

  const confirmDelete = (item: Item) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.items.delete.title' }),
      content: t({ id: 'pages.inventory.items.delete.confirm' }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => deleteMutation.mutate(item.id),
    });
  };

  const openDeprecate = (item: Item) => {
    setDeprecateTarget(item);
    setDeprecateDate(dayjs().startOf('day'));
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setModalOpen(true);
  };

  const actionsColWidth = useActionsColWidth(items);
  const nameWidth = useMemo(
    () => items.reduce((m, it) => Math.max(m, measureTextWidth(it.name)), 0),
    [items],
  );

  const colDefMap = useMemo<Record<string, ProColumns<Item>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      const measureCol = (key: 'weight' | 'length' | 'width' | 'height', labelId: string): ProColumns<Item> => ({
        key,
        title: t({ id: labelId }),
        ...widthForHeader(t({ id: labelId }), 110),
        fixed: getFixed(key),
        render: (_, r) => measureText(r[key]) ?? EMPTY,
      });
      return {
        name: {
          dataIndex: 'name',
          ...widthForHeader(t({ id: 'common.name' }), Math.max(160, nameWidth)),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
        },
        spec: {
          dataIndex: 'spec',
          title: t({ id: 'pages.inventory.items.col.spec' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.spec' }), 180),
          fixed: getFixed('spec'),
          ellipsis: true,
          render: (val) => (val ? (val as string) : EMPTY),
        },
        size: {
          dataIndex: 'size',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.size' }), 90),
          fixed: getFixed('size'),
          render: (val) => (val ? (val as string) : EMPTY),
          ...makeSortProps('size', t({ id: 'pages.inventory.items.col.size' }), sort),
        },
        weight: measureCol('weight', 'pages.inventory.items.col.weight'),
        length: measureCol('length', 'pages.inventory.items.col.length'),
        width: measureCol('width', 'pages.inventory.items.col.width'),
        height: measureCol('height', 'pages.inventory.items.col.height'),
        status: {
          dataIndex: 'status',
          title: t({ id: 'pages.inventory.items.col.status' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.status' }), 120),
          fixed: getFixed('status'),
          render: (val) => (
            <Tag color={val === 'active' ? 'green' : 'default'}>
              {t({ id: `pages.inventory.items.status.${val as string}` })}
            </Tag>
          ),
        },
        obtained_at: {
          key: 'obtained_at',
          title: t({ id: 'pages.inventory.items.col.obtainedAt' }),
          ...widthForHeader(t({ id: 'pages.inventory.items.col.obtainedAt' }), 220),
          fixed: getFixed('obtained_at'),
          render: (_, r) => formatDateRelative(r.acquisition?.obtained_at) ?? EMPTY,
          ...makeSortProps('obtained_at', t({ id: 'pages.inventory.items.col.obtainedAt' }), sort),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, record) => (
            <span data-actions-col>
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  {t({ id: 'common.edit' })}
                </Button>
                {record.deprecate_time ? (
                  <Button
                    size="small"
                    icon={<UndoOutlined />}
                    onClick={() => deprecateMutation.mutate({ id: record.id, ts: null })}
                  >
                    {t({ id: 'pages.inventory.items.restore' })}
                  </Button>
                ) : (
                  <Button size="small" icon={<StopOutlined />} onClick={() => openDeprecate(record)}>
                    {t({ id: 'pages.inventory.items.deprecate' })}
                  </Button>
                )}
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
    [t, nameWidth, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Item>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<Item> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Item>
        key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.inventory.items.title' })}
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: filter }}
            sortProps={{ attrs: filterableAttrs, hook: sort }}
            columnProps={{ hook: cols }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={isLoading}
        columnEmptyText={false}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}
      />

      <ItemFormModal
        open={modalOpen}
        title={t({ id: 'pages.inventory.items.edit' })}
        initial={editing}
        currencyOptions={currencyOptions}
        confirmLoading={updateMutation.isPending}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onOk={(itemData) => {
          if (editing) updateMutation.mutate({ id: editing.id, data: itemData });
        }}
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
        <DatePicker
          showTime
          style={{ width: '100%' }}
          value={deprecateDate}
          onChange={setDeprecateDate}
        />
      </Modal>
    </>
  );
}
