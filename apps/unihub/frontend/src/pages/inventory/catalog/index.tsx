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
import PageTable, { computeScrollX, measureTextWidth, widthForHeader } from '@/components/PageTable';
import type { Acquisition, Item, Measurement, NetCostEntry } from '@/services/unihub-backend/inventory';
import {
  deleteAcquisition,
  deleteItem,
  listAcquisitions,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute, FilterOperator } from '@/components/EntityToolbar';
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

// Item-level columns; a filter/sort on any of these flattens the tree.
const ITEM_KEYS = new Set([
  'name',
  'spec',
  'size',
  'weight',
  'length',
  'width',
  'height',
  'quantity',
  'sku_price',
  'url',
  'status',
]);

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

function skuText(it: Item): string | null {
  return it.sku_price != null ? `${it.sku_price} ${it.sku_price_currency}`.trim() : null;
}

// A single comparable/display value for a row+column (item OR acquisition rows).
function cellComparable(r: CatalogRow, key: string): number | string | null {
  if (isAcquisition(r)) {
    switch (key) {
      case 'source':
        return r.source || null;
      case 'request_time':
        return r.request_time ? new Date(r.request_time).getTime() : null;
      case 'obtained_at':
        return r.obtained_at ? new Date(r.obtained_at).getTime() : null;
      case 'item_count':
        return r.item_count;
      case 'net_cost':
        return r.net_cost.reduce((s, n) => s + Number(n.total), 0);
      default:
        return null;
    }
  }
  switch (key) {
    case 'name':
      return r.name || null;
    case 'spec':
      return r.spec || null;
    case 'size':
      return r.size || null;
    case 'url':
      return r.url || null;
    case 'status':
      return r.status;
    case 'quantity':
      return r.quantity;
    case 'sku_price':
      return r.sku_price != null ? Number(r.sku_price) : null;
    case 'weight':
      return r.weight ? Number(r.weight.value) : null;
    case 'length':
      return r.length ? Number(r.length.value) : null;
    case 'width':
      return r.width ? Number(r.width.value) : null;
    case 'height':
      return r.height ? Number(r.height.value) : null;
    case 'source':
      return r.acquisition?.source || null;
    case 'obtained_at':
      return r.acquisition?.obtained_at ? new Date(r.acquisition.obtained_at).getTime() : null;
    default:
      return null;
  }
}

function matchCondition(cmp: number | string | null, op: FilterOperator, val: string): boolean {
  if (op === 'is_empty') return cmp == null || cmp === '';
  if (op === 'is_not_empty') return cmp != null && cmp !== '';
  if (cmp == null) return false;
  if (typeof cmp === 'number') {
    const v = Number(val);
    switch (op) {
      case 'eq':
      case 'equals':
      case 'is':
        return cmp === v;
      case 'neq':
      case 'not_equals':
      case 'is_not':
        return cmp !== v;
      case 'gt':
      case 'date_after':
        return cmp > v;
      case 'gte':
        return cmp >= v;
      case 'lt':
      case 'date_before':
        return cmp < v;
      case 'lte':
        return cmp <= v;
      default:
        return true;
    }
  }
  const a = String(cmp).toLowerCase();
  const b = (val ?? '').toLowerCase();
  switch (op) {
    case 'contains':
      return a.includes(b);
    case 'not_contains':
      return !a.includes(b);
    case 'equals':
    case 'is':
      return a === b;
    case 'not_equals':
    case 'is_not':
      return a !== b;
    case 'starts_with':
      return a.startsWith(b);
    case 'ends_with':
      return a.endsWith(b);
    default:
      return true;
  }
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();
  const [deprecateTarget, setDeprecateTarget] = useState<Item | null>(null);
  const [deprecateDate, setDeprecateDate] = useState<dayjs.Dayjs | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<readonly string[]>([]);
  const [userToggledExpand, setUserToggledExpand] = useState(false);

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text' },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text' },
      { key: 'size', label: t({ id: 'pages.inventory.items.col.size' }), dataType: 'text' },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number' },
      { key: 'length', label: t({ id: 'pages.inventory.items.col.length' }), dataType: 'number' },
      { key: 'width', label: t({ id: 'pages.inventory.items.col.width' }), dataType: 'number' },
      { key: 'height', label: t({ id: 'pages.inventory.items.col.height' }), dataType: 'number' },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number' },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number' },
      { key: 'url', label: t({ id: 'pages.inventory.items.col.url' }), dataType: 'text' },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select' },
      { key: 'item_count', label: t({ id: 'pages.inventory.acquisitions.col.itemCount' }), dataType: 'number' },
      { key: 'request_time', label: t({ id: 'pages.inventory.acquisitions.col.requestTime' }), dataType: 'date' },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date' },
    ],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text', visible: true, order: 0 },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 1 },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text', visible: true, order: 2 },
      { key: 'size', label: t({ id: 'pages.inventory.items.col.size' }), dataType: 'text', visible: true, order: 3 },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number', visible: true, order: 4 },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number', visible: true, order: 5 },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number', visible: true, order: 6 },
      { key: 'length', label: t({ id: 'pages.inventory.items.col.length' }), dataType: 'number', visible: true, order: 7 },
      { key: 'width', label: t({ id: 'pages.inventory.items.col.width' }), dataType: 'number', visible: true, order: 8 },
      { key: 'height', label: t({ id: 'pages.inventory.items.col.height' }), dataType: 'number', visible: true, order: 9 },
      { key: 'url', label: t({ id: 'pages.inventory.items.col.url' }), dataType: 'text', visible: true, order: 10 },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select', visible: true, order: 11 },
      { key: 'item_count', label: t({ id: 'pages.inventory.acquisitions.col.itemCount' }), dataType: 'number', visible: true, order: 12 },
      { key: 'net_cost', label: t({ id: 'pages.inventory.acquisitions.col.netCost' }), dataType: 'text', visible: true, order: 13 },
      { key: 'request_time', label: t({ id: 'pages.inventory.acquisitions.col.requestTime' }), dataType: 'date', visible: true, order: 14 },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date', visible: true, order: 15 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 16 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-catalog', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  // Fully client-side: fetch all acquisitions, then filter/sort/flatten locally.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'catalog', 'all'],
    queryFn: () => listAcquisitions({ limit: 1000 }),
  });
  const acquisitions = useMemo(() => data?.results ?? [], [data]);

  // Active filter conditions and sort rules (flattened from the toolbar state).
  const conditions = useMemo(
    () => filter.activeGroups.flatMap((g) => g.conditions),
    [filter.activeGroups],
  );
  const sortRules = sort.activeRules;
  const itemModeActive =
    conditions.some((c) => ITEM_KEYS.has(c.attr)) || sortRules.some((r) => ITEM_KEYS.has(r.field));

  const applyFilter = <T extends CatalogRow>(row: T): boolean =>
    conditions.every((c) => matchCondition(cellComparable(row, c.attr), c.op, c.val));

  const applySort = <T extends CatalogRow>(list: T[]): T[] => {
    if (sortRules.length === 0) return list;
    return [...list].sort((a, b) => {
      for (const rule of sortRules) {
        const av = cellComparable(a, rule.field);
        const bv = cellComparable(b, rule.field);
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return rule.direction === 'asc' ? -1 : 1;
        if (av > bv) return rule.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const rows = useMemo<CatalogRow[]>(() => {
    if (itemModeActive) {
      // Flat, ungrouped item list filtered/sorted by the active column(s).
      const items: CatalogRow[] = acquisitions.flatMap((a) =>
        a.items.map((it) => ({ ...it, rowType: 'item' as const })),
      );
      return applySort(items.filter(applyFilter));
    }
    // Tree: acquisitions (parents) with their items as children.
    const tree: CatalogRow[] = acquisitions.map((a) => ({
      ...a,
      rowType: 'acquisition' as const,
      children: a.items.map((it) => ({ ...it, rowType: 'item' as const })),
    }));
    return applySort(tree.filter(applyFilter));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquisitions, conditions, sortRules, itemModeActive]);

  // Expand all acquisition rows by default (until the user collapses one).
  useEffect(() => {
    if (userToggledExpand || itemModeActive) return;
    setExpandedKeys(acquisitions.map((a) => a.id));
  }, [acquisitions, userToggledExpand, itemModeActive]);

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

  // Per-column content width: measure the displayed text of every row + header.
  const displayText = (r: CatalogRow, key: string): string => {
    const c = cellComparable(r, key);
    if (key === 'weight' || key === 'length' || key === 'width' || key === 'height') {
      return !isAcquisition(r) ? (measureText(r[key]) ?? '') : '';
    }
    if (key === 'sku_price') return !isAcquisition(r) ? (skuText(r) ?? '') : '';
    if (key === 'net_cost') return isAcquisition(r) ? (formatNetCost(r.net_cost) ?? '') : '';
    if (key === 'request_time') return isAcquisition(r) ? (formatDateRelative(r.request_time) ?? '') : '';
    if (key === 'obtained_at') return isAcquisition(r) ? (formatDateRelative(r.obtained_at) ?? '') : '';
    if (key === 'status') return !isAcquisition(r) ? t({ id: `pages.inventory.items.status.${r.status}` }) : '';
    if (c == null) return '';
    return typeof c === 'number' ? String(c) : c;
  };

  const contentWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    for (const def of columnDefs) {
      if (def.key === 'actions') continue;
      let max = 0;
      for (const r of rows) max = Math.max(max, measureTextWidth(displayText(r, def.key)));
      widths[def.key] = max;
    }
    return widths;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columnDefs, t]);

  const colDefMap = useMemo<Record<string, ProColumns<CatalogRow>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      const w = (key: string, labelId: string, min = 90) =>
        widthForHeader(t({ id: labelId }), Math.max(min, contentWidths[key] ?? 0));
      const textCol = (
        key: string,
        labelId: string,
        get: (it: Item) => string | null | undefined,
        min = 120,
      ): ProColumns<CatalogRow> => ({
        key,
        title: t({ id: labelId }),
        ...w(key, labelId, min),
        fixed: getFixed(key),
        ...makeSortProps(key, t({ id: labelId }), sort),
        render: (_, r) => (!isAcquisition(r) ? (get(r) || EMPTY) : EMPTY),
      });
      const measureCol = (
        key: 'weight' | 'length' | 'width' | 'height',
        labelId: string,
      ): ProColumns<CatalogRow> => ({
        key,
        title: t({ id: labelId }),
        ...w(key, labelId, 100),
        fixed: getFixed(key),
        ...makeSortProps(key, t({ id: labelId }), sort),
        render: (_, r) => (!isAcquisition(r) ? (measureText(r[key]) ?? EMPTY) : EMPTY),
      });
      return {
        source: {
          key: 'source',
          title: t({ id: 'pages.inventory.acquisitions.col.source' }),
          ...w('source', 'pages.inventory.acquisitions.col.source', 160),
          fixed: getFixed('source'),
          ...makeSortProps('source', t({ id: 'pages.inventory.acquisitions.col.source' }), sort),
          render: (_, r) =>
            isAcquisition(r) ? (r.source || t({ id: 'pages.inventory.acquisitions.new.untitled' })) : EMPTY,
        },
        name: textCol('name', 'common.name', (it) => it.name, 160),
        spec: { ...textCol('spec', 'pages.inventory.items.col.spec', (it) => it.spec, 160), ellipsis: true },
        size: textCol('size', 'pages.inventory.items.col.size', (it) => it.size, 90),
        url: {
          key: 'url',
          title: t({ id: 'pages.inventory.items.col.url' }),
          ...w('url', 'pages.inventory.items.col.url', 140),
          fixed: getFixed('url'),
          render: (_, r) =>
            !isAcquisition(r) && r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.url}
              </a>
            ) : (
              EMPTY
            ),
        },
        quantity: {
          key: 'quantity',
          title: t({ id: 'pages.inventory.items.col.quantity' }),
          ...w('quantity', 'pages.inventory.items.col.quantity', 90),
          fixed: getFixed('quantity'),
          ...makeSortProps('quantity', t({ id: 'pages.inventory.items.col.quantity' }), sort),
          render: (_, r) => (!isAcquisition(r) ? r.quantity : EMPTY),
        },
        sku_price: {
          key: 'sku_price',
          title: t({ id: 'pages.inventory.items.col.skuPrice' }),
          ...w('sku_price', 'pages.inventory.items.col.skuPrice', 120),
          fixed: getFixed('sku_price'),
          ...makeSortProps('sku_price', t({ id: 'pages.inventory.items.col.skuPrice' }), sort),
          render: (_, r) => (!isAcquisition(r) ? (skuText(r) ?? EMPTY) : EMPTY),
        },
        weight: measureCol('weight', 'pages.inventory.items.col.weight'),
        length: measureCol('length', 'pages.inventory.items.col.length'),
        width: measureCol('width', 'pages.inventory.items.col.width'),
        height: measureCol('height', 'pages.inventory.items.col.height'),
        status: {
          key: 'status',
          title: t({ id: 'pages.inventory.items.col.status' }),
          ...w('status', 'pages.inventory.items.col.status', 110),
          fixed: getFixed('status'),
          ...makeSortProps('status', t({ id: 'pages.inventory.items.col.status' }), sort),
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
          ...w('item_count', 'pages.inventory.acquisitions.col.itemCount', 80),
          fixed: getFixed('item_count'),
          ...makeSortProps('item_count', t({ id: 'pages.inventory.acquisitions.col.itemCount' }), sort),
          render: (_, r) => (isAcquisition(r) ? r.item_count : EMPTY),
        },
        net_cost: {
          key: 'net_cost',
          title: t({ id: 'pages.inventory.acquisitions.col.netCost' }),
          ...w('net_cost', 'pages.inventory.acquisitions.col.netCost', 140),
          fixed: getFixed('net_cost'),
          ...makeSortProps('net_cost', t({ id: 'pages.inventory.acquisitions.col.netCost' }), sort),
          render: (_, r) => (isAcquisition(r) ? (formatNetCost(r.net_cost) ?? EMPTY) : EMPTY),
        },
        request_time: {
          key: 'request_time',
          title: t({ id: 'pages.inventory.acquisitions.col.requestTime' }),
          ...w('request_time', 'pages.inventory.acquisitions.col.requestTime', 200),
          fixed: getFixed('request_time'),
          ...makeSortProps('request_time', t({ id: 'pages.inventory.acquisitions.col.requestTime' }), sort),
          render: (_, r) => (isAcquisition(r) ? (formatDateRelative(r.request_time) ?? EMPTY) : EMPTY),
        },
        obtained_at: {
          key: 'obtained_at',
          title: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }),
          ...w('obtained_at', 'pages.inventory.acquisitions.col.obtainedAt', 200),
          fixed: getFixed('obtained_at'),
          ...makeSortProps('obtained_at', t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), sort),
          render: (_, r) => (isAcquisition(r) ? (formatDateRelative(r.obtained_at) ?? EMPTY) : EMPTY),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
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
    [t, contentWidths, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns, navigate],
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
        expandable={
          itemModeActive
            ? { showExpandColumn: false }
            : {
                expandedRowKeys: expandedKeys,
                onExpandedRowsChange: (keys) => {
                  setUserToggledExpand(true);
                  setExpandedKeys(keys.map(String));
                },
                // Caret disclosure; blank spacer on leaf (item) rows.
                expandIcon: ({ expanded, onExpand, record }) =>
                  isAcquisition(record) && record.children.length > 0 ? (
                    <span onClick={(e) => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 8 }}>
                      {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                    </span>
                  ) : (
                    <span style={{ marginRight: 8, display: 'inline-block', width: 14 }} />
                  ),
              }
        }
        scroll={{ x: computeScrollX(columns) }}
        pagination={false}
        footer={() => (
          <Typography.Text type="secondary">
            {t({ id: 'pages.inventory.catalog.rowCount' }, { count: rows.length })}
          </Typography.Text>
        )}
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
