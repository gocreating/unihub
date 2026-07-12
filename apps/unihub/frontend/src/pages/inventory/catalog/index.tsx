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
import { DateTimeCell, dateTimeLines } from '@/components/DateTimeCell';
import { EmptyValue } from '@/components/EmptyValue';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { parameterKeyLabel } from '@/components/ParameterRowsEditor';
import { listAttributeDefinitions } from '@/services/unihub-backend/core';
import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type {
  Acquisition,
  AcquisitionSummary,
  Item,
  ItemParameter,
  NetCostEntry,
} from '@/services/unihub-backend/inventory';
import {
  deleteAcquisition,
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
import { formatDecimal, parameterBadges } from '../itemBadges';

const EMPTY = <EmptyValue />;

// A row is either an acquisition (parent) or one of its items (child/flat).
type CatalogRow =
  | (Acquisition & { rowType: 'acquisition'; children: CatalogRow[] })
  | (Item & { rowType: 'item' });

function isAcquisition(r: CatalogRow): r is Acquisition & { rowType: 'acquisition'; children: CatalogRow[] } {
  return r.rowType === 'acquisition';
}

// Item-level column keys — an active filter/sort on any of these (or on any
// attr:<definition_id> parameter key) flattens the Catalog to a
// server-paginated flat item list (ItemViewSet). Everything else keeps the
// acquisition tree (AcquisitionViewSet).
const ITEM_KEYS = new Set(['name', 'url', 'spec', 'remark', 'quantity', 'sku_price', 'deprecate_time']);

const isItemLevelField = (field: string) => ITEM_KEYS.has(field) || field.startsWith('attr:');

function skuText(it: Item): string {
  return it.sku_price != null ? `${formatDecimal(it.sku_price)} ${it.sku_price_currency}`.trim() : '';
}

function formatNetCost(net: NetCostEntry[] | undefined): string {
  // A zero net cost is hidden entirely (iteration 15): most zeros mean
  // "not recorded", so neither "0"/"0 CNY" nor a "Free" claim is shown.
  const entries = (net ?? []).filter((n) => Number(n.total) !== 0);
  if (entries.length === 0) return '';
  return entries.map((n) => `${Number(n.total).toLocaleString()} ${n.currency}`.trim()).join(', ');
}

// The displayed text of one parameter value in its own dynamic column.
function parameterCellText(p: ItemParameter | undefined): string {
  if (!p) return '';
  if (p.data_type === 'dimension') return `${formatDecimal(p.value)} ${p.unit}`.trim();
  if (p.data_type === 'number') return formatDecimal(p.value);
  return p.value;
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

// Both display lines of the derived "Acquisition" column (FR-003a):
// primary "{source} {net cost}", secondary "request ~ obtained" (date-only).
function acquisitionSummaryLines(
  a: Pick<AcquisitionSummary, 'source' | 'request_time' | 'obtained_at' | 'net_cost'>,
  untitled: string,
): { primary: string; secondary: string | null } {
  const primary = `${a.source || untitled} ${formatNetCost(a.net_cost)}`.trim();
  const req = a.request_time ? dayjs(a.request_time).format('YYYY-MM-DD') : null;
  const obt = a.obtained_at ? dayjs(a.obtained_at).format('YYYY-MM-DD') : null;
  // Four exact cases (iteration 15): both, requested-only, obtained-only, none.
  const secondary = req && obt ? `${req} ~ ${obt}` : req ? `${req} ~` : obt ? obt : null;
  return { primary, secondary };
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const intl = useIntl();
  const { formatMessage: t } = intl;
  const [deprecateTarget, setDeprecateTarget] = useState<Item | null>(null);
  const [deprecateDate, setDeprecateDate] = useState<dayjs.Dayjs | null>(null);
  // Ids whose default expansion state was flipped by the user. Defaults:
  // multi-item acquisitions expanded; single-item acquisitions collapsed
  // (rendered as ONE merged row — FR-003b).
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());

  // Every Item parameter definition (system + user-defined) contributes a
  // filter/sort option and a hidden-by-default column (FR-028).
  const { data: definitions = [] } = useQuery({
    queryKey: ['core', 'attribute-definitions', 'inventory.item'],
    queryFn: () => listAttributeDefinitions('inventory.item'),
  });

  const attrDataType = (d: AttributeDefinition): FilterableAttribute['dataType'] =>
    d.data_type === 'number' || d.data_type === 'dimension' ? 'number' : 'text';

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'acquisition__source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text' },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
      { key: 'url', label: t({ id: 'pages.inventory.items.col.url' }), dataType: 'text' },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text' },
      { key: 'remark', label: t({ id: 'pages.inventory.items.col.remark' }), dataType: 'text' },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number' },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number' },
      { key: 'deprecate_time', label: t({ id: 'pages.inventory.items.col.deprecateTime' }), dataType: 'date' },
      { key: 'acquisition__request_time', label: t({ id: 'pages.inventory.acquisitions.col.requestTime' }), dataType: 'date' },
      { key: 'acquisition__obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date' },
      ...definitions.map((d) => ({
        key: `attr:${d.id}`,
        label: parameterKeyLabel(intl, d.name),
        dataType: attrDataType(d),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, definitions],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      // Default visible set & order (FR-003): Acquisition, Item, Quantity,
      // SKU price, Parameters, Actions. Every real column stays toggleable
      // from the dropdown (hidden by default), including one per parameter
      // definition (FR-028).
      { key: 'acquisition_summary', label: t({ id: 'pages.inventory.catalog.col.acquisition' }), dataType: 'text', visible: true, order: 0 },
      { key: 'item_summary', label: t({ id: 'pages.inventory.catalog.col.item' }), dataType: 'text', visible: true, order: 1 },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number', visible: true, order: 3 },
      { key: 'parameters', label: t({ id: 'pages.inventory.catalog.col.parameters' }), dataType: 'text', visible: true, order: 4 },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number', visible: false, order: 4.5 },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: false, order: 5 },
      { key: 'url', label: t({ id: 'pages.inventory.items.col.url' }), dataType: 'text', visible: false, order: 6 },
      { key: 'spec', label: t({ id: 'pages.inventory.items.col.spec' }), dataType: 'text', visible: false, order: 7 },
      { key: 'remark', label: t({ id: 'pages.inventory.items.col.remark' }), dataType: 'text', visible: false, order: 7.5 },
      { key: 'acquisition__source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text', visible: false, order: 8 },
      { key: 'acquisition__request_time', label: t({ id: 'pages.inventory.acquisitions.col.requestTime' }), dataType: 'date', visible: false, order: 9 },
      { key: 'acquisition__obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date', visible: false, order: 10 },
      { key: 'net_cost', label: t({ id: 'pages.inventory.acquisitions.col.netCost' }), dataType: 'text', visible: false, order: 11 },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select', visible: false, order: 12 },
      { key: 'deprecate_time', label: t({ id: 'pages.inventory.items.col.deprecateTime' }), dataType: 'date', visible: false, order: 13 },
      ...definitions.map((d, i) => ({
        key: `attr:${d.id}`,
        label: parameterKeyLabel(intl, d.name),
        dataType: attrDataType(d),
        visible: false,
        order: 14 + i,
      })),
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 99 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, definitions],
  );

  const table = useEntityTable({
    // v5: iteration-15 defaults (quantity hidden, remark added) — bump so
    // previously-saved state doesn't shadow the new defaults.
    key: 'inventory-catalog-v5',
    filterableAttrs,
    columnDefs,
    // Default sort (spec): Obtained descending, NULLS FIRST (pending on top).
    defaultSortRules: [{ field: 'acquisition__obtained_at', direction: 'desc', nulls: 'first' }],
  });
  const { filter, sort, cols } = table;

  // Flat mode when any active filter/sort targets an item-level column.
  const flatMode = useMemo(() => {
    const fields = [
      ...sort.activeRules.map((r) => r.field),
      ...filter.activeGroups.flatMap((g) => g.conditions.map((c) => c.attr)),
    ];
    return fields.some(isItemLevelField);
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
  // measurement so item columns (Item/Parameters/…) size to their real content.
  const measuredRows = useMemo<CatalogRow[]>(() => {
    if (flatMode) return rows;
    const out: CatalogRow[] = [];
    for (const a of acquisitions) {
      out.push({ ...a, rowType: 'acquisition', children: [] });
      for (const it of a.items) out.push({ ...it, rowType: 'item' });
    }
    return out;
  }, [flatMode, rows, acquisitions]);

  const isExpanded = (a: Acquisition) => (a.items.length > 1) !== toggledIds.has(a.id);
  const expandedKeys = useMemo(
    () => acquisitions.filter((a) => isExpanded(a)).map((a) => a.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acquisitions, toggledIds],
  );
  const toggleExpand = (id: string) =>
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // FR-003b: a collapsed single-item acquisition renders as ONE merged row —
  // its item feeds the item-side columns of the parent row.
  const mergedItemOf = (r: CatalogRow): Item | null =>
    isAcquisition(r) && r.items.length === 1 && !isExpanded(r) ? (r.items[0] ?? null) : null;
  const itemFor = (r: CatalogRow): Item | null => (isAcquisition(r) ? mergedItemOf(r) : r);

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
  const openDeprecate = (item: Item) => {
    setDeprecateTarget(item);
    setDeprecateDate(dayjs().startOf('day'));
  };

  const untitled = t({ id: 'pages.inventory.acquisitions.new.untitled' });

  // The derived "Acquisition" summary source for a row: the acquisition itself
  // on parent rows; the item's own acquisition in flat mode (FR-003a).
  const summaryFor = (r: CatalogRow) => {
    if (isAcquisition(r)) return r;
    return flatMode ? r.acquisition : null;
  };

  const paramOf = (r: CatalogRow, definitionId: string): ItemParameter | undefined =>
    isAcquisition(r) ? undefined : r.parameters?.find((p) => p.definition_id === definitionId);

  // Widest displayed line per column (for canonical dataWidths measurement).
  // Two-row cells measure as max(primary, secondary).
  const displayText = (r: CatalogRow, key: string): string => {
    const widest = (lines: string[]) =>
      lines.reduce((a, b) => (measureTextWidth(b) > measureTextWidth(a) ? b : a), '');
    if (key === 'acquisition_summary') {
      const src = summaryFor(r);
      if (!src) return '';
      const { primary, secondary } = acquisitionSummaryLines(src, untitled);
      return widest([primary, secondary ?? '']);
    }
    if (key.startsWith('attr:')) {
      return parameterCellText(paramOf(r, key.slice('attr:'.length)));
    }
    if (isAcquisition(r)) {
      switch (key) {
        case 'item_summary':
          return t({ id: 'pages.inventory.catalog.itemCount' }, { count: r.items.length }) as string;
        case 'acquisition__source':
          return r.source || untitled;
        case 'net_cost':
          return formatNetCost(r.net_cost);
        case 'acquisition__request_time':
          return widest(dateTimeLines(r.request_time));
        case 'acquisition__obtained_at':
          return widest(dateTimeLines(r.obtained_at));
        default:
          return '';
      }
    }
    switch (key) {
      case 'item_summary':
        return widest([r.name, r.spec ?? '', r.quantity > 1 ? `×${r.quantity}` : '']);
      case 'parameters':
        return parameterBadges(r.parameters).join('   ');
      case 'remark':
        return r.remark ?? '';
      case 'acquisition__source':
        return flatMode ? (r.acquisition?.source ?? '') : '';
      case 'name':
        return r.name;
      case 'url':
        return r.url ?? '';
      case 'spec':
        return r.spec ?? '';
      case 'quantity':
        return String(r.quantity);
      case 'sku_price':
        return skuText(r);
      case 'deprecate_time':
        return widest(dateTimeLines(r.deprecate_time));
      case 'status':
        return t({ id: `pages.inventory.items.status.${r.status}` });
      case 'acquisition__request_time':
        return flatMode ? widest(dateTimeLines(r.acquisition?.request_time)) : '';
      case 'acquisition__obtained_at':
        return flatMode ? widest(dateTimeLines(r.acquisition?.obtained_at)) : '';
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

  // Truncation-gated tooltip (constitution v1.20.0): only when ellipsised.
  const ellipsisSecondary = (text: string) => (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, maxWidth: 420 }}>
      <OverflowTooltip title={text}>{text}</OverflowTooltip>
    </Typography.Text>
  );

  const colDefMap = useMemo<Record<string, ProColumns<CatalogRow>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      // Width = max(measured content, header) + padding — NO arbitrary floors.
      const w = (key: string, label: string) => widthForHeader(label, dataWidths[key] ?? 0);
      const wId = (key: string, labelId: string) => w(key, t({ id: labelId }));
      const itemText = (key: string, labelId: string, get: (it: Item) => string): ProColumns<CatalogRow> => ({
        key,
        title: t({ id: labelId }),
        ...wId(key, labelId),
        fixed: getFixed(key),
        ...makeSortProps(key, t({ id: labelId }), sort),
        render: (_, r) => {
          const it = itemFor(r);
          return it ? (get(it) || EMPTY) : EMPTY;
        },
      });
      // Two-row datetime column (constitution v1.18.0).
      const dateTimeCol = (
        key: string,
        labelId: string,
        get: (r: CatalogRow) => string | null | undefined,
      ): ProColumns<CatalogRow> => ({
        key,
        title: t({ id: labelId }),
        ...wId(key, labelId),
        fixed: getFixed(key),
        ...makeSortProps(key, t({ id: labelId }), sort),
        render: (_, r) => {
          const value = get(r);
          return value === undefined ? EMPTY : <DateTimeCell value={value} />;
        },
      });
      const nameLink = (r: Item) =>
        r.url ? (
          <a href={r.url} target="_blank" rel="noopener noreferrer">
            {r.name}
          </a>
        ) : (
          r.name
        );
      const map: Record<string, ProColumns<CatalogRow>> = {
        // Derived "Acquisition" (FR-003a): display-only, no sort props.
        acquisition_summary: {
          key: 'acquisition_summary',
          title: t({ id: 'pages.inventory.catalog.col.acquisition' }),
          ...wId('acquisition_summary', 'pages.inventory.catalog.col.acquisition'),
          fixed: getFixed('acquisition_summary'),
          render: (_, r) => {
            const src = summaryFor(r);
            if (!src) return EMPTY;
            const { primary, secondary } = acquisitionSummaryLines(src, untitled);
            return (
              <div>
                <div>{primary}</div>
                {secondary && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {secondary}
                  </Typography.Text>
                )}
              </div>
            );
          },
        },
        // Derived "Item" (FR-003a): name-link primary, ellipsised spec secondary,
        // ×N tertiary (quantity > 1). Unmerged parent rows show the item count.
        item_summary: {
          key: 'item_summary',
          title: t({ id: 'pages.inventory.catalog.col.item' }),
          ...wId('item_summary', 'pages.inventory.catalog.col.item'),
          fixed: getFixed('item_summary'),
          render: (_, r) => {
            const it = itemFor(r);
            if (!it) {
              return isAcquisition(r) ? (
                <Typography.Text type="secondary">
                  {t({ id: 'pages.inventory.catalog.itemCount' }, { count: r.items.length })}
                </Typography.Text>
              ) : (
                EMPTY
              );
            }
            return (
              <div>
                <div>{nameLink(it)}</div>
                {it.spec ? ellipsisSecondary(it.spec) : null}
                {it.quantity > 1 ? (
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    ×{it.quantity}
                  </Typography.Text>
                ) : null}
              </div>
            );
          },
        },
        // Derived "Parameters" (FR-003a): one badge per parameter row.
        parameters: {
          key: 'parameters',
          title: t({ id: 'pages.inventory.catalog.col.parameters' }),
          ...wId('parameters', 'pages.inventory.catalog.col.parameters'),
          fixed: getFixed('parameters'),
          render: (_, r) => {
            const it = itemFor(r);
            if (!it) return EMPTY;
            const badges = parameterBadges(it.parameters);
            if (badges.length === 0) return EMPTY;
            return (
              <Space size={[4, 4]} wrap style={{ maxWidth: '100%' }}>
                {badges.map((badge, i) => (
                  <Tag key={i} style={{ marginInlineEnd: 0, maxWidth: '100%' }}>
                    <OverflowTooltip title={badge}>{badge}</OverflowTooltip>
                  </Tag>
                ))}
              </Space>
            );
          },
        },
        acquisition__source: {
          key: 'acquisition__source',
          title: t({ id: 'pages.inventory.acquisitions.col.source' }),
          ...wId('acquisition__source', 'pages.inventory.acquisitions.col.source'),
          fixed: getFixed('acquisition__source'),
          ...makeSortProps('acquisition__source', t({ id: 'pages.inventory.acquisitions.col.source' }), sort),
          render: (_, r) =>
            isAcquisition(r)
              ? r.source || untitled
              : flatMode
                ? (r.acquisition?.source ?? EMPTY)
                : EMPTY,
        },
        name: {
          key: 'name',
          title: t({ id: 'common.name' }),
          ...wId('name', 'common.name'),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
          render: (_, r) => {
            const it = itemFor(r);
            return it ? nameLink(it) : EMPTY;
          },
        },
        url: {
          key: 'url',
          title: t({ id: 'pages.inventory.items.col.url' }),
          ...wId('url', 'pages.inventory.items.col.url'),
          fixed: getFixed('url'),
          ...makeSortProps('url', t({ id: 'pages.inventory.items.col.url' }), sort),
          render: (_, r) =>
            itemFor(r)?.url ? (
              <a
                href={itemFor(r)!.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'bottom',
                }}
              >
                {itemFor(r)!.url}
              </a>
            ) : (
              EMPTY
            ),
        },
        spec: { ...itemText('spec', 'pages.inventory.items.col.spec', (it) => it.spec), ellipsis: true },
        remark: { ...itemText('remark', 'pages.inventory.items.col.remark', (it) => it.remark), ellipsis: true },
        quantity: {
          key: 'quantity',
          title: t({ id: 'pages.inventory.items.col.quantity' }),
          ...wId('quantity', 'pages.inventory.items.col.quantity'),
          fixed: getFixed('quantity'),
          ...makeSortProps('quantity', t({ id: 'pages.inventory.items.col.quantity' }), sort),
          render: (_, r) => itemFor(r)?.quantity ?? EMPTY,
        },
        sku_price: { ...itemText('sku_price', 'pages.inventory.items.col.skuPrice', (it) => skuText(it)), align: 'right' },
        deprecate_time: dateTimeCol('deprecate_time', 'pages.inventory.items.col.deprecateTime', (r) => {
          const it = itemFor(r);
          return it ? it.deprecate_time : undefined;
        }),
        status: {
          key: 'status',
          title: t({ id: 'pages.inventory.items.col.status' }),
          ...wId('status', 'pages.inventory.items.col.status'),
          fixed: getFixed('status'),
          render: (_, r) => {
            const it = itemFor(r);
            if (!it) return EMPTY;
            return (
              <Tag color={it.status === 'active' ? 'green' : 'default'}>
                {t({ id: `pages.inventory.items.status.${it.status}` })}
              </Tag>
            );
          },
        },
        net_cost: {
          key: 'net_cost',
          align: 'right',
          title: t({ id: 'pages.inventory.acquisitions.col.netCost' }),
          ...wId('net_cost', 'pages.inventory.acquisitions.col.netCost'),
          fixed: getFixed('net_cost'),
          render: (_, r) => (isAcquisition(r) ? (formatNetCost(r.net_cost) || EMPTY) : EMPTY),
        },
        acquisition__request_time: dateTimeCol(
          'acquisition__request_time',
          'pages.inventory.acquisitions.col.requestTime',
          (r) => (isAcquisition(r) ? r.request_time : flatMode ? r.acquisition?.request_time : undefined),
        ),
        acquisition__obtained_at: dateTimeCol(
          'acquisition__obtained_at',
          'pages.inventory.acquisitions.col.obtainedAt',
          (r) => (isAcquisition(r) ? r.obtained_at : flatMode ? r.acquisition?.obtained_at : undefined),
        ),
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, r) => {
            // Item-side actions: Deprecate/Restore only — no Delete (items are
            // hard-deleted on the acquisition edit page, FR-003).
            const itemActions = (it: Item) =>
              it.deprecate_time ? (
                <Button size="small" icon={<UndoOutlined />} onClick={() => deprecateMutation.mutate({ id: it.id, ts: null })}>
                  {t({ id: 'pages.inventory.items.restore' })}
                </Button>
              ) : (
                <Button size="small" icon={<StopOutlined />} onClick={() => openDeprecate(it)}>
                  {t({ id: 'pages.inventory.items.deprecate' })}
                </Button>
              );
            if (isAcquisition(r)) {
              const merged = mergedItemOf(r);
              return (
                <span data-actions-col>
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/inventory/acquisitions/${r.id}/edit`)}>
                      {t({ id: 'common.edit' })}
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteAcq(r)}>
                      {t({ id: 'common.delete' })}
                    </Button>
                    {/* Merged single-item row (FR-003b): both entities' actions. */}
                    {merged ? itemActions(merged) : null}
                  </Space>
                </span>
              );
            }
            return (
              <span data-actions-col>
                <Space>{itemActions(r)}</Space>
              </span>
            );
          },
        },
      };
      // One dynamic column per parameter definition (hidden by default).
      for (const d of definitions) {
        const key = `attr:${d.id}`;
        const label = parameterKeyLabel(intl, d.name);
        const numeric = d.data_type === 'number' || d.data_type === 'dimension';
        map[key] = {
          key,
          title: label,
          ...w(key, label),
          fixed: getFixed(key),
          ...makeSortProps(key, label, sort),
          ...(numeric ? { align: 'right' as const } : {}),
          render: (_, r) => parameterCellText(paramOf(r, d.id)) || EMPTY,
        };
      }
      return map;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, flatMode, definitions, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns, navigate],
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
            {isExpanded(r) ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </span>
        ) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggledIds, cols.firstColumnFixed],
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
            {t({ id: 'common.new' })}
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
        footer={() => (
          <EntityOffsetFooter
            {...table.paginationProps(total)}
            totalText={
              data?.totals
                ? t(
                    { id: 'pages.inventory.catalog.footerTotals' },
                    { acquisitions: data.totals.acquisitions, items: data.totals.items },
                  )
                : undefined
            }
          />
        )}
      />

      <Modal
        title={t({ id: 'pages.inventory.items.deprecate.title' })}
        open={!!deprecateTarget}
        onCancel={() => setDeprecateTarget(null)}
        footer={
          // Principle VI: Cancel flushed left, primary right.
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setDeprecateTarget(null)}>{t({ id: 'common.cancel' })}</Button>
            <Button
              type="primary"
              danger
              loading={deprecateMutation.isPending}
              onClick={() =>
                deprecateTarget &&
                deprecateMutation.mutate({
                  id: deprecateTarget.id,
                  ts: (deprecateDate ?? dayjs().startOf('day')).toISOString(),
                })
              }
            >
              {t({ id: 'pages.inventory.items.deprecate' })}
            </Button>
          </div>
        }
      >
        <p>{t({ id: 'pages.inventory.items.deprecate.confirm' })}</p>
        <DatePicker showTime style={{ width: '100%' }} value={deprecateDate} onChange={setDeprecateDate} />
      </Modal>
    </>
  );
}
