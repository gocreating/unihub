import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, DatePicker, Modal, Space, Tag, Typography, message } from 'antd';
import {
  CaretDownOutlined,
  CaretRightOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { useActionsColWidth, widestText } from '@/components/PageTable';
import { DateTimeCell, dateTimeLines } from '@/components/DateTimeCell';
import { EmptyValue } from '@/components/EmptyValue';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { acquisitionSummaryLines, formatNetCost } from '../acquisitionSummary';
import { SearchHighlightProvider, SearchMark } from '@/components/HighlightText/SearchMark';
import { parameterKeyLabel } from '@/components/ParameterRowsEditor';
import { listAttributeDefinitions } from '@/services/unihub-backend/core';
import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type {
  Acquisition,
  Item,
  ItemParameter,
} from '@/services/unihub-backend/inventory';
import {
  listAcquisitions,
  listItems,
  updateItem,
} from '@/services/unihub-backend/inventory';
import {
  EntityOffsetFooter,
  EntityToolbar,
  useEntityTable,
  viewConfigFromColumns,
} from '@/components/EntityToolbar';
import { ViewTabs } from '@/components/EntityViews/ViewTabs';
import { useEntityViews } from '@/components/EntityViews/useEntityViews';
import type {
  ColumnDef,
  EntityListParams,
  FilterableAttribute,
  OffsetPaginatedResponse,
  ViewConfig,
} from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';
import { ItemDisplay, ParameterTag, formatDecimal, pairText, parameterPairs } from '@/components/ItemDisplay';
import { formatPrice } from '@/utils/currency';
import { useCurrencySymbols } from '@/hooks/useCurrencySymbols';

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
  return formatPrice(it.sku_price_currency, it.sku_price);
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

export function CatalogPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const intl = useIntl();
  const { formatMessage: t } = intl;
  // Reactive finance symbols (FR-033, iter 34): re-renders + re-measures on load.
  const currencySymbolsMap = useCurrencySymbols();
  const [deprecateTarget, setDeprecateTarget] = useState<Item | null>(null);
  const [deprecateDate, setDeprecateDate] = useState<dayjs.Dayjs | null>(null);
  const [deprecateUnknown, setDeprecateUnknown] = useState(false);
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
      { key: 'alias_name', label: t({ id: 'pages.inventory.items.col.alias' }), dataType: 'text' },
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
      // definition (FR-028). The caret disclosure column is itself a column
      // ("Toggle"), pinned left by default (iterations 16 + 48).
      { key: '__caret', label: t({ id: 'pages.inventory.catalog.col.toggle' }), dataType: 'text', visible: true, order: -1, pin: 'left' },
      // Acquisition pinned left beside the caret by default (feature 018 US3).
      { key: 'acquisition_summary', label: t({ id: 'pages.inventory.catalog.col.acquisition' }), dataType: 'text', visible: true, order: 0, pin: 'left' },
      { key: 'item_summary', label: t({ id: 'pages.inventory.catalog.col.item' }), dataType: 'text', visible: true, order: 1 },
      { key: 'sku_price', label: t({ id: 'pages.inventory.items.col.skuPrice' }), dataType: 'number', visible: true, order: 3 },
      { key: 'parameters', label: t({ id: 'pages.inventory.catalog.col.parameters' }), dataType: 'text', visible: true, order: 4 },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number', visible: false, order: 4.5 },
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: false, order: 5 },
      { key: 'alias_name', label: t({ id: 'pages.inventory.items.col.alias' }), dataType: 'text', visible: false, order: 5.2 },
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
      // Actions pinned right by default (iterations 27 + 48).
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 99, pin: 'right' },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, definitions],
  );

  // No seeded filter, sort or page size (round 11). The page used to ship a
  // year-to-date default view of its own (iterations 17→24), which competed
  // with the stored default view every account now has: the two configurations
  // differed, so the default tab compared dirty against its own baseline. The
  // page contributes its COLUMNS; the saved default view supplies the rest.
  const table = useEntityTable({
    key: 'inventory-catalog',
    filterableAttrs,
    columnDefs,
  });
  const { filter, sort, cols } = table;

  // The default-view baseline the view tabs diff against (016 views).
  const defaultViewConfig = useMemo<ViewConfig>(() => viewConfigFromColumns(columnDefs), [columnDefs]);
  const views = useEntityViews({
    tableKey: table.tableKey,
    table,
    defaultConfig: defaultViewConfig,
  });

  // Flat mode when any active filter/sort targets an item-level column — or a
  // quick search is active (019, R5): search covers item attributes incl.
  // dynamic parameters, so it always queries the flat items endpoint.
  const flatMode = useMemo(() => {
    if (table.activeSearch !== '') return true;
    const fields = [
      ...sort.activeRules.map((r) => r.field),
      ...filter.activeGroups.flatMap((g) => g.conditions.map((c) => c.attr)),
    ];
    return fields.some(isItemLevelField);
  }, [sort.activeRules, filter.activeGroups, table.activeSearch]);

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

  const deprecateMutation = useMutation({
    mutationFn: ({ id, flag, ts }: { id: string; flag: boolean; ts: string | null }) =>
      updateItem(id, { deprecated: flag, deprecate_time: ts }),
    onSuccess: () => {
      invalidate();
      setDeprecateTarget(null);
      message.success(t({ id: 'pages.inventory.items.deprecated' }));
    },
  });

  const openDeprecate = (item: Item) => {
    setDeprecateTarget(item);
    setDeprecateDate(dayjs().startOf('day'));
    setDeprecateUnknown(false);
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

  // Widest displayed line per column (PageTable measures from displayText).
  // Two-row cells measure as max(primary, secondary).
  const displayText = (r: CatalogRow, key: string): string => {
    const widest = widestText;
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
        // Iteration 27 (FR-003a): the column is sized by the PRIMARY name line
        // only — the spec secondary truncates at the column width instead.
        return widest([r.alias_name || r.name, r.quantity > 1 ? `×${r.quantity}` : '']);
      case 'parameters':
        return parameterPairs(r.parameters, (id) => t({ id })).map(pairText).join('   ');
      case 'remark':
        return (r.remark ?? '').replace(/\n+/g, ' / ');
      case 'acquisition__source':
        return flatMode ? (r.acquisition?.source ?? '') : '';
      case 'name':
        return r.name;
      case 'alias_name':
        return r.alias_name ?? '';
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

  // displayText: the single source of what a cell renders (PageTable measures it).
  const actionsColWidth = useActionsColWidth(rows);

  const colDefMap = useMemo<Record<string, ProColumns<CatalogRow>>>(
    () => {
      const getFixed = cols.fixedForKey;
      // Width = max(measured content, header) + padding — NO arbitrary floors.
      // PageTable does the measuring (constitution v1.26.0); `displayText`
      // stays the single source of what a cell actually renders.
      const w = (key: string, label: string, max?: number) => ({
        autoWidth: { header: label, measure: (r: CatalogRow) => displayText(r, key), ...(max ? { max } : {}) },
      });
      const wId = (key: string, labelId: string) => w(key, t({ id: labelId }));
      const itemText = (key: string, labelId: string, get: (it: Item) => string): ProColumns<CatalogRow> => ({
        key,
        title: t({ id: labelId }),
        ...wId(key, labelId),
        fixed: getFixed(key),
        ...makeSortProps(key, t({ id: labelId }), sort),
        render: (_, r) => {
          const it = itemFor(r);
          const text = it ? get(it) : '';
          return text ? <SearchMark text={text} /> : EMPTY;
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
                <div>
                  <SearchMark text={primary} />
                </div>
                {secondary && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <SearchMark text={secondary} />
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
          onCell: () => ({
            // Truncate secondaries at the column width (FR-003a, iteration 27):
            // in auto table layout an unconstrained nowrap spec would otherwise
            // shrink-wrap against its own row's primary width.
            style: {
              // PageTable owns the column width now; fill it rather than
              // re-deriving the pixel value here.
              maxWidth: '100%',
              overflow: 'hidden',
            },
          }),
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
            // Shared item display (FR-031); parameters live in their own column.
            return <ItemDisplay item={it} highlight={table.activeSearch} />;
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
            // Key-value pairs (FR-031) — value-only badges retired from mixed lists.
            const pairs = parameterPairs(it.parameters, (id) => t({ id }));
            if (pairs.length === 0) return EMPTY;
            return (
              <Space size={[4, 4]} wrap style={{ maxWidth: '100%' }}>
                {pairs.map((pair, i) => (
                  <ParameterTag key={i} pair={pair} highlight={table.activeSearch} />
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
          render: (_, r) => {
            const source = isAcquisition(r) ? r.source : flatMode ? r.acquisition?.source : null;
            if (isAcquisition(r) && !source) return untitled;
            return source ? <SearchMark text={source} /> : EMPTY;
          },
        },
        // Plain text — the derived Item column carries the sole hyperlink (iter 17).
        name: {
          key: 'name',
          title: t({ id: 'common.name' }),
          ...wId('name', 'common.name'),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
          render: (_, r) => (itemFor(r)?.name ? <SearchMark text={itemFor(r)!.name} /> : EMPTY),
        },
        alias_name: {
          ...itemText('alias_name', 'pages.inventory.items.col.alias', (it) => it.alias_name),
          ellipsis: true,
        },
        url: {
          key: 'url',
          title: t({ id: 'pages.inventory.items.col.url' }),
          // Measure-what-you-render (iter 17): the cell caps its render at
          // 320px, so the measured width is capped to match — never sized to
          // the unrendered full URL text.
          ...w('url', t({ id: 'pages.inventory.items.col.url' }), 320),
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
                  whiteSpace: 'nowrap',
                  verticalAlign: 'bottom',
                }}
              >
                <OverflowTooltip title={itemFor(r)!.url}>
                  <SearchMark text={itemFor(r)!.url} />
                </OverflowTooltip>
              </a>
            ) : (
              EMPTY
            ),
        },
        spec: { ...itemText('spec', 'pages.inventory.items.col.spec', (it) => it.spec), ellipsis: true },
        // Remark renders ONE ellipsised line with a gated tooltip (FR-031,
        // iteration 27); render + measurement cap to 320px (measure-what-you-render).
        remark: {
          key: 'remark',
          title: t({ id: 'pages.inventory.items.col.remark' }),
          ...w('remark', t({ id: 'pages.inventory.items.col.remark' }), 320),
          fixed: getFixed('remark'),
          ...makeSortProps('remark', t({ id: 'pages.inventory.items.col.remark' }), sort),
          render: (_, r) => {
            const it = itemFor(r);
            if (!it?.remark) return EMPTY;
            return (
              <div style={{ maxWidth: 320, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <OverflowTooltip title={it.remark} style={{ maxWidth: '100%' }}>
                  <SearchMark text={it.remark.replace(/\n+/g, ' / ')} />
                </OverflowTooltip>
              </div>
            );
          },
        },
        quantity: {
          key: 'quantity',
          title: t({ id: 'pages.inventory.items.col.quantity' }),
          ...wId('quantity', 'pages.inventory.items.col.quantity'),
          fixed: getFixed('quantity'),
          ...makeSortProps('quantity', t({ id: 'pages.inventory.items.col.quantity' }), sort),
          render: (_, r) => {
            const qty = itemFor(r)?.quantity;
            return qty != null ? <SearchMark text={qty} /> : EMPTY;
          },
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
              it.deprecated ? (
                <Button size="small" icon={<UndoOutlined />} onClick={() => deprecateMutation.mutate({ id: it.id, flag: false, ts: null })}>
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
                    {/* A real hyperlink (iteration 19): middle/ctrl-click opens
                        a tab; plain left click stays SPA. Delete moved to the
                        edit page's panel kebab (FR-007). */}
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      href={`/inventory/acquisitions/${r.id}/edit`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        navigate(`/inventory/acquisitions/${r.id}/edit`);
                      }}
                    >
                      {t({ id: 'common.edit' })}
                    </Button>
                    {/* Merged single-item row (FR-003b): both entities' actions. */}
                    {merged ? itemActions(merged) : null}
                  </Space>
                </span>
              );
            }
            // Flat mode has NO acquisition rows — each item row carries its
            // parent acquisition's Edit hyperlink (iteration 21, FR-003).
            return (
              <span data-actions-col>
                <Space>
                  {flatMode && r.acquisition ? (
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      href={`/inventory/acquisitions/${r.acquisition.id}/edit`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        navigate(`/inventory/acquisitions/${r.acquisition!.id}/edit`);
                      }}
                    >
                      {t({ id: 'common.edit' })}
                    </Button>
                  ) : null}
                  {itemActions(r)}
                </Space>
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
          render: (_, r) => {
            const text = parameterCellText(paramOf(r, d.id));
            return text ? <SearchMark text={text} /> : EMPTY;
          },
        };
      }
      return map;
    },
    // toggledIds: the Item/date cells render merged-vs-split content via
    // itemFor()/isExpanded() closures — they must rebuild when expansion
    // changes (previously masked by visibleColumns changing identity every
    // render; the 017 hook memoizes it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, actionsColWidth, flatMode, definitions, toggledIds, sort.sortOrderForField, sort.activeRules, cols.fixedForKey, cols.visibleColumns, navigate, currencySymbolsMap, table.activeSearch],
  );

  const caretColumn = useMemo<ProColumns<CatalogRow>>(
    () => ({
      key: '__caret',
      title: '',
      width: 44,
      fixed: cols.fixedForKey('__caret'),
      render: (_, r) =>
        isAcquisition(r) && r.children.length > 0 ? (
          // data-row-link-ignore: if these rows ever gain a detail page, the
          // caret must keep toggling instead of navigating (constitution v1.25.0).
          <span data-row-link-ignore style={{ cursor: 'pointer' }} onClick={() => toggleExpand(r.id)}>
            {isExpanded(r) ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </span>
        ) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggledIds, cols.fixedForKey],
  );

  const columns = useMemo<ProColumns<CatalogRow>[]>(() => {
    // The Toggle column participates in column config like any other def but
    // renders only in tree mode (flat item lists have nothing to expand).
    return cols.visibleColumns
      .filter((c) => !(flatMode && c.key === '__caret'))
      .map((c) => (c.key === '__caret' ? caretColumn : colDefMap[c.key]))
      .filter((c): c is ProColumns<CatalogRow> => Boolean(c));
  }, [cols.visibleColumns, colDefMap, flatMode, caretColumn]);

  return (
    <SearchHighlightProvider value={table.activeSearch}>
      <PageTable<CatalogRow>
        key={`${flatMode}-${cols.pinFingerprint}-${views.activeTabId}`}
        pageTitle={t({ id: 'pages.inventory.catalog.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/inventory/acquisitions/new')}>
            {t({ id: 'common.new' })}
          </Button>
        }
        viewBar={<ViewTabs views={views} />}
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: filter }}
            sortProps={{ attrs: filterableAttrs, hook: sort }}
            columnProps={{ hook: cols }}
            searchProps={{ value: table.searchQuery, onChange: table.setSearchQuery }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        columnEmptyText={false}
        indentSize={0}
        expandable={{ showExpandColumn: false, expandedRowKeys: flatMode ? [] : expandedKeys }}
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
                  flag: true,
                  // Unknown time (iteration 36): deprecated with no timestamp.
                  ts: deprecateUnknown
                    ? null
                    : (deprecateDate ?? dayjs().startOf('day')).toISOString(),
                })
              }
            >
              {t({ id: 'pages.inventory.items.deprecate' })}
            </Button>
          </div>
        }
      >
        {/* Item preview (FR-003c, iteration 47): the user verifies WHICH item
            is being deprecated — shared ItemDisplay with parameter pairs. */}
        {deprecateTarget ? (
          <div
            data-testid="deprecate-preview"
            style={{
              border: '1px solid rgba(5,5,5,0.1)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <ItemDisplay
              item={deprecateTarget}
              parameters={deprecateTarget.parameters}
              showParameters
            />
          </div>
        ) : null}
        <p>{t({ id: 'pages.inventory.items.deprecate.confirm' })}</p>
        <DatePicker
          showTime
          style={{ width: '100%' }}
          value={deprecateDate}
          onChange={setDeprecateDate}
          disabled={deprecateUnknown}
        />
        <Checkbox
          style={{ marginTop: 8 }}
          checked={deprecateUnknown}
          onChange={(e) => setDeprecateUnknown(e.target.checked)}
        >
          {t({ id: 'pages.inventory.items.deprecate.unknown' })}
        </Checkbox>
      </Modal>
    </SearchHighlightProvider>
  );
}
