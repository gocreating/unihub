import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Modal, Space, Tag, Typography, message } from 'antd';
import {
  CaretDownOutlined,
  CaretRightOutlined,
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
  listItems,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type {
  ColumnDef,
  EntityListParams,
  FilterableAttribute,
  OffsetPaginatedResponse,
} from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

const EMPTY = (
  <Typography.Text type="secondary" style={{ userSelect: 'none' }}>
    —
  </Typography.Text>
);

// A row is either an acquisition (parent) or one of its items (child/flat).
type CatalogRow =
  | (Acquisition & { rowType: 'acquisition'; children: CatalogRow[] })
  | (Item & { rowType: 'item' });

function isAcquisition(r: CatalogRow): r is Acquisition & { rowType: 'acquisition'; children: CatalogRow[] } {
  return r.rowType === 'acquisition';
}

// Item-level column keys — an active filter/sort on any of these flattens the
// Catalog to a server-paginated flat item list (ItemViewSet). Everything else
// keeps the acquisition tree (AcquisitionViewSet).
const ITEM_KEYS = new Set([
  'name',
  'spec',
  'size',
  'quantity',
  'sku_price',
  'weight_canonical',
  'length_canonical',
  'width_canonical',
  'height_canonical',
]);

function measureText(m: Measurement | null | undefined): string {
  return m ? `${m.value} ${m.unit}` : '';
}

// Drop trailing zeros: "10.0000" → "10", "59.9000" → "59.9".
function formatDecimal(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

function skuText(it: Item): string {
  return it.sku_price != null ? `${formatDecimal(it.sku_price)} ${it.sku_price_currency}`.trim() : '';
}

function formatNetCost(net: NetCostEntry[] | undefined): string {
  if (!net || net.length === 0) return '';
  return net.map((n) => `${Number(n.total).toLocaleString()} ${n.currency}`.trim()).join(', ');
}

function formatDateRelative(val: string | null | undefined): string {
  if (!val) return '';
  return `${dayjs(val).format('YYYY-MM-DD HH:mm')} (${dayjs(val).fromNow()})`;
}

// Tree mode hits AcquisitionViewSet, whose fields are un-prefixed — strip the
// `acquisition__` prefix from the toolbar's filter/sort field names.
function stripAcqPrefix(field: string): string {
  return field.replace(/^acquisition__/, '');
}
function toTreeParams(p: EntityListParams): EntityListParams {
  const out: EntityListParams = { ...p };
  if (p.ordering) {
    out.ordering = p.ordering
      .split(',')
      .map((o) => (o.startsWith('-') ? `-${stripAcqPrefix(o.slice(1))}` : stripAcqPrefix(o)))
      .join(',');
  }
  if (p.filters?.groups) {
    out.filters = {
      groups: p.filters.groups.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => ({ ...c, attr: stripAcqPrefix(c.attr) })),
      })),
    };
  }
  return out;
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();
  const [deprecateTarget, setDeprecateTarget] = useState<Item | null>(null);
  const [deprecateDate, setDeprecateDate] = useState<dayjs.Dayjs | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'acquisition__source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text' },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text' },
      { key: 'size', label: t({ id: 'pages.inventory.items.col.size' }), dataType: 'text' },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number' },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number' },
      { key: 'weight_canonical', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number' },
      { key: 'length_canonical', label: t({ id: 'pages.inventory.items.col.length' }), dataType: 'number' },
      { key: 'width_canonical', label: t({ id: 'pages.inventory.items.col.width' }), dataType: 'number' },
      { key: 'height_canonical', label: t({ id: 'pages.inventory.items.col.height' }), dataType: 'number' },
      { key: 'acquisition__request_time', label: t({ id: 'pages.inventory.acquisitions.col.requestTime' }), dataType: 'date' },
      { key: 'acquisition__obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date' },
    ],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'acquisition__source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text', visible: true, order: 0 },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 1 },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text', visible: true, order: 2 },
      { key: 'size', label: t({ id: 'pages.inventory.items.col.size' }), dataType: 'text', visible: true, order: 3 },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number', visible: true, order: 4 },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number', visible: true, order: 5 },
      { key: 'weight_canonical', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number', visible: true, order: 6 },
      { key: 'length_canonical', label: t({ id: 'pages.inventory.items.col.length' }), dataType: 'number', visible: true, order: 7 },
      { key: 'width_canonical', label: t({ id: 'pages.inventory.items.col.width' }), dataType: 'number', visible: true, order: 8 },
      { key: 'height_canonical', label: t({ id: 'pages.inventory.items.col.height' }), dataType: 'number', visible: true, order: 9 },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select', visible: true, order: 10 },
      { key: 'net_cost', label: t({ id: 'pages.inventory.acquisitions.col.netCost' }), dataType: 'text', visible: true, order: 11 },
      { key: 'acquisition__request_time', label: t({ id: 'pages.inventory.acquisitions.col.requestTime' }), dataType: 'date', visible: true, order: 12 },
      { key: 'acquisition__obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date', visible: true, order: 13 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 14 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-catalog', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  // Flat mode when any active filter/sort targets an item column.
  const flatMode = useMemo(() => {
    const fields = [
      ...sort.activeRules.map((r) => r.field),
      ...filter.activeGroups.flatMap((g) => g.conditions.map((c) => c.attr)),
    ];
    return fields.some((f) => ITEM_KEYS.has(f));
  }, [sort.activeRules, filter.activeGroups]);

  const treeParams = useMemo(() => toTreeParams(table.queryParams), [table.queryParams]);

  const { data, isLoading, isError } = useQuery<OffsetPaginatedResponse<Acquisition | Item>>({
    queryKey: ['inventory', 'catalog', flatMode ? 'items' : 'acq', flatMode ? table.queryParams : treeParams],
    queryFn: () => (flatMode ? listItems(table.queryParams) : listAcquisitions(treeParams)),
  });
  const total = data?.count;

  const acquisitions = useMemo(
    () => (!flatMode ? ((data?.results as Acquisition[] | undefined) ?? []) : []),
    [data, flatMode],
  );
  const flatItems = useMemo(
    () => (flatMode ? ((data?.results as Item[] | undefined) ?? []) : []),
    [data, flatMode],
  );

  const rows = useMemo<CatalogRow[]>(() => {
    if (flatMode) return flatItems.map((it) => ({ ...it, rowType: 'item' as const }));
    return acquisitions.map((a) => ({
      ...a,
      rowType: 'acquisition' as const,
      children: a.items.map((it) => ({ ...it, rowType: 'item' as const })),
    }));
  }, [flatMode, flatItems, acquisitions]);

  // Every displayed row (parents AND their item children) — used for width
  // measurement so item columns (Name/Spec/…) size to their real content.
  const measuredRows = useMemo<CatalogRow[]>(() => {
    if (flatMode) return rows;
    const out: CatalogRow[] = [];
    for (const a of acquisitions) {
      out.push({ ...a, rowType: 'acquisition', children: [] });
      for (const it of a.items) out.push({ ...it, rowType: 'item' });
    }
    return out;
  }, [flatMode, rows, acquisitions]);

  const expandedKeys = useMemo(
    () => acquisitions.map((a) => a.id).filter((id) => !collapsedIds.has(id)),
    [acquisitions, collapsedIds],
  );
  const toggleExpand = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  // Displayed text per column (for canonical dataWidths measurement).
  const displayText = (r: CatalogRow, key: string): string => {
    if (isAcquisition(r)) {
      switch (key) {
        case 'acquisition__source':
          return r.source || t({ id: 'pages.inventory.acquisitions.new.untitled' });
        case 'net_cost':
          return formatNetCost(r.net_cost);
        case 'acquisition__request_time':
          return formatDateRelative(r.request_time);
        case 'acquisition__obtained_at':
          return formatDateRelative(r.obtained_at);
        default:
          return '';
      }
    }
    switch (key) {
      case 'acquisition__source':
        return flatMode ? (r.acquisition?.source ?? '') : '';
      case 'name':
        return r.name;
      case 'spec':
        return r.spec ?? '';
      case 'size':
        return r.size ?? '';
      case 'quantity':
        return String(r.quantity);
      case 'sku_price':
        return skuText(r);
      case 'weight_canonical':
        return measureText(r.weight);
      case 'length_canonical':
        return measureText(r.length);
      case 'width_canonical':
        return measureText(r.width);
      case 'height_canonical':
        return measureText(r.height);
      case 'status':
        return t({ id: `pages.inventory.items.status.${r.status}` });
      case 'acquisition__request_time':
        return flatMode ? formatDateRelative(r.acquisition?.request_time) : '';
      case 'acquisition__obtained_at':
        return flatMode ? formatDateRelative(r.acquisition?.obtained_at) : '';
      default:
        return '';
    }
  };

  // Canonical dataWidths: per-column max content width across the displayed rows.
  const dataWidths = useMemo(() => {
    const w: Record<string, number> = {};
    for (const def of columnDefs) {
      if (def.key === 'actions') continue;
      let max = 0;
      for (const r of measuredRows) max = Math.max(max, measureTextWidth(displayText(r, def.key)));
      w[def.key] = max;
    }
    return w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuredRows, columnDefs, t, flatMode]);

  const actionsColWidth = useActionsColWidth(rows);

  const colDefMap = useMemo<Record<string, ProColumns<CatalogRow>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      const w = (key: string, labelId: string, min = 90) =>
        widthForHeader(t({ id: labelId }), Math.max(min, dataWidths[key] ?? 0));
      const itemText = (key: string, labelId: string, get: (it: Item) => string, min = 120): ProColumns<CatalogRow> => ({
        key,
        title: t({ id: labelId }),
        ...w(key, labelId, min),
        fixed: getFixed(key),
        ...makeSortProps(key, t({ id: labelId }), sort),
        render: (_, r) => (!isAcquisition(r) ? (get(r) || EMPTY) : EMPTY),
      });
      const measureCol = (key: 'weight' | 'length' | 'width' | 'height', canonKey: string, labelId: string): ProColumns<CatalogRow> => ({
        key: canonKey,
        title: t({ id: labelId }),
        ...w(canonKey, labelId, 100),
        fixed: getFixed(canonKey),
        ...makeSortProps(canonKey, t({ id: labelId }), sort),
        render: (_, r) => (!isAcquisition(r) ? (measureText(r[key]) || EMPTY) : EMPTY),
      });
      return {
        acquisition__source: {
          key: 'acquisition__source',
          title: t({ id: 'pages.inventory.acquisitions.col.source' }),
          ...w('acquisition__source', 'pages.inventory.acquisitions.col.source', 160),
          fixed: getFixed('acquisition__source'),
          ...makeSortProps('acquisition__source', t({ id: 'pages.inventory.acquisitions.col.source' }), sort),
          render: (_, r) =>
            isAcquisition(r)
              ? r.source || t({ id: 'pages.inventory.acquisitions.new.untitled' })
              : flatMode
                ? (r.acquisition?.source ?? EMPTY)
                : EMPTY,
        },
        name: {
          key: 'name',
          title: t({ id: 'common.name' }),
          ...w('name', 'common.name', 160),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
          render: (_, r) =>
            isAcquisition(r) ? (
              EMPTY
            ) : r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.name}
              </a>
            ) : (
              r.name
            ),
        },
        spec: { ...itemText('spec', 'pages.inventory.items.col.spec', (it) => it.spec, 160), ellipsis: true },
        size: itemText('size', 'pages.inventory.items.col.size', (it) => it.size, 90),
        quantity: {
          key: 'quantity',
          title: t({ id: 'pages.inventory.items.col.quantity' }),
          ...w('quantity', 'pages.inventory.items.col.quantity', 90),
          fixed: getFixed('quantity'),
          ...makeSortProps('quantity', t({ id: 'pages.inventory.items.col.quantity' }), sort),
          render: (_, r) => (!isAcquisition(r) ? r.quantity : EMPTY),
        },
        sku_price: itemText('sku_price', 'pages.inventory.items.col.skuPrice', (it) => skuText(it), 120),
        weight_canonical: measureCol('weight', 'weight_canonical', 'pages.inventory.items.col.weight'),
        length_canonical: measureCol('length', 'length_canonical', 'pages.inventory.items.col.length'),
        width_canonical: measureCol('width', 'width_canonical', 'pages.inventory.items.col.width'),
        height_canonical: measureCol('height', 'height_canonical', 'pages.inventory.items.col.height'),
        status: {
          key: 'status',
          title: t({ id: 'pages.inventory.items.col.status' }),
          ...w('status', 'pages.inventory.items.col.status', 110),
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
        net_cost: {
          key: 'net_cost',
          title: t({ id: 'pages.inventory.acquisitions.col.netCost' }),
          ...w('net_cost', 'pages.inventory.acquisitions.col.netCost', 140),
          fixed: getFixed('net_cost'),
          render: (_, r) => (isAcquisition(r) ? (formatNetCost(r.net_cost) || EMPTY) : EMPTY),
        },
        acquisition__request_time: {
          key: 'acquisition__request_time',
          title: t({ id: 'pages.inventory.acquisitions.col.requestTime' }),
          ...w('acquisition__request_time', 'pages.inventory.acquisitions.col.requestTime', 200),
          fixed: getFixed('acquisition__request_time'),
          ...makeSortProps('acquisition__request_time', t({ id: 'pages.inventory.acquisitions.col.requestTime' }), sort),
          render: (_, r) =>
            isAcquisition(r)
              ? (formatDateRelative(r.request_time) || EMPTY)
              : flatMode
                ? (formatDateRelative(r.acquisition?.request_time) || EMPTY)
                : EMPTY,
        },
        acquisition__obtained_at: {
          key: 'acquisition__obtained_at',
          title: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }),
          ...w('acquisition__obtained_at', 'pages.inventory.acquisitions.col.obtainedAt', 200),
          fixed: getFixed('acquisition__obtained_at'),
          ...makeSortProps('acquisition__obtained_at', t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), sort),
          render: (_, r) =>
            isAcquisition(r)
              ? (formatDateRelative(r.obtained_at) || EMPTY)
              : flatMode
                ? (formatDateRelative(r.acquisition?.obtained_at) || EMPTY)
                : EMPTY,
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
                  <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/inventory/acquisitions/${r.id}/edit`)}>
                    {t({ id: 'common.edit' })}
                  </Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteAcq(r)}>
                    {t({ id: 'common.delete' })}
                  </Button>
                </Space>
              ) : (
                <Space>
                  {r.deprecate_time ? (
                    <Button size="small" icon={<UndoOutlined />} onClick={() => deprecateMutation.mutate({ id: r.id, ts: null })}>
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
    [t, dataWidths, actionsColWidth, flatMode, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns, navigate],
  );

  const caretColumn = useMemo<ProColumns<CatalogRow>>(
    () => ({
      key: '__caret',
      title: '',
      width: 44,
      fixed: cols.firstColumnFixed ? 'left' : undefined,
      render: (_, r) =>
        isAcquisition(r) && r.children.length > 0 ? (
          <span style={{ cursor: 'pointer' }} onClick={() => toggleExpand(r.id)}>
            {collapsedIds.has(r.id) ? <CaretRightOutlined /> : <CaretDownOutlined />}
          </span>
        ) : null,
    }),
    [collapsedIds, cols.firstColumnFixed],
  );

  const columns = useMemo<ProColumns<CatalogRow>[]>(() => {
    const visible = cols.visibleColumns
      .map((c) => colDefMap[c.key])
      .filter((c): c is ProColumns<CatalogRow> => Boolean(c));
    return flatMode ? visible : [caretColumn, ...visible];
  }, [cols.visibleColumns, colDefMap, flatMode, caretColumn]);

  return (
    <>
      <PageTable<CatalogRow>
        key={`${flatMode}-${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
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
        indentSize={0}
        expandable={{ showExpandColumn: false, expandedRowKeys: flatMode ? [] : expandedKeys }}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(total)} />}
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
