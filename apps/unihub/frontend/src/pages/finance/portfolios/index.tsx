import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { useRowLink } from '@/components/PageTable';
import { DateTimeCell } from '@/components/DateTimeCell';
import { ClampedText } from '@/components/ClampedText';
import { EmptyValue } from '@/components/EmptyValue';
import { SearchHighlightProvider, SearchMark } from '@/components/HighlightText/SearchMark';
import type { Portfolio } from '@/services/unihub-backend/finance';
import { createPortfolio, listCurrencies, listPortfolios } from '@/services/unihub-backend/finance';
import {
  EntityOffsetFooter,
  EntityToolbar,
  useEntityTable,
  viewConfigFromColumns,
} from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute, ViewConfig } from '@/components/EntityToolbar';
import { ViewTabs } from '@/components/EntityViews/ViewTabs';
import { useEntityViews } from '@/components/EntityViews/useEntityViews';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';
import { PortfolioFormModal } from './PortfolioFormModal';
import type { PortfolioCreateFormValues } from './PortfolioFormModal';

export function PortfoliosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.portfolios.col.name' }), dataType: 'text' },
    { key: 'description', label: t({ id: 'pages.finance.portfolios.col.description' }), dataType: 'text' },
    { key: 'state', label: t({ id: 'pages.finance.portfolios.col.state' }), dataType: 'text' },
    { key: 'base_currency', label: t({ id: 'pages.finance.portfolios.col.baseCurrency' }), dataType: 'text' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.portfolios.col.name' }), dataType: 'text', visible: true, order: 0 },
    { key: 'description', label: t({ id: 'pages.finance.portfolios.col.description' }), dataType: 'text', visible: true, order: 1 },
    { key: 'base_currency', label: t({ id: 'pages.finance.portfolios.col.baseCurrency' }), dataType: 'text', visible: true, order: 2 },
    { key: 'state', label: t({ id: 'pages.finance.portfolios.col.state' }), dataType: 'text', visible: true, order: 3 },
    { key: 'last_transaction_time', label: t({ id: 'pages.finance.portfolios.col.lastTransactionTime' }), dataType: 'text', visible: true, order: 4 },
    { key: 'first_transaction_time', label: t({ id: 'pages.finance.portfolios.col.firstTransactionTime' }), dataType: 'text', visible: true, order: 5 },
    // No actions column (constitution v1.25.0): View is replaced by whole-row
    // navigation, Edit/Delete live on the detail panel (iteration 2), and
    // Close/Reopen moved there too (FR-020) — nothing is left to render.
  ], [t]);

  // Round 12 (016 FR-039): the page contributes only its columns — no seeded
  // sort; the backend's default ordering (-last_transaction_time) applies.
  const table = useEntityTable({ key: 'finance-portfolios', filterableAttrs, columnDefs });

  const defaultViewConfig = useMemo<ViewConfig>(() => viewConfigFromColumns(columnDefs), [columnDefs]);
  const views = useEntityViews({
    tableKey: table.tableKey,
    table,
    defaultConfig: defaultViewConfig,
  });

  const { data: portfoliosData, isLoading } = useQuery({
    queryKey: ['finance', 'portfolios', table.queryParams],
    queryFn: () => listPortfolios(table.queryParams),
    meta: { errorMessage: t({ id: 'pages.finance.portfolios.loadError' }) },
  });
  const portfolios = useMemo(() => portfoliosData?.results ?? [], [portfoliosData]);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies({ limit: 200 }),
  });
  const currencies = useMemo(() => currenciesData?.results ?? [], [currenciesData]);

  const createMutation = useMutation({
    mutationFn: createPortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      setModalOpen(false);
      message.success(t({ id: 'pages.finance.portfolios.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.portfolios.createError' })),
  });

  const onCreateFinish = (values: PortfolioCreateFormValues) => {
    createMutation.mutate({
      name: values.name,
      base_currency: values.base_currency,
      state: values.state ?? 'active',
      description: values.description ?? '',
    });
  };

  const detailUrl = (portfolioId: string) => `/finance/portfolios/${portfolioId}`;

  /* Real hyperlink (constitution v1.23.0): middle/ctrl-click opens a tab;
     plain left click stays SPA. */
  const detailLinkProps = (portfolioId: string) => ({
    href: detailUrl(portfolioId),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      navigate(detailUrl(portfolioId));
    },
  });

  // Whole-row navigation (constitution v1.25.0) — one shared helper.
  const rowLink = useRowLink();

  const colDefMap = useMemo<Record<string, ProColumns<Portfolio>>>(
    () => {
      const getFixed = table.cols.fixedForKey;
      return {
        name: {
          dataIndex: 'name',
          autoWidth: { header: t({ id: 'pages.finance.portfolios.col.name' }) },
          fixed: getFixed('name'),
          render: (_, record) => (
            <a {...detailLinkProps(record.id)}>
              <SearchMark text={record.name} />
            </a>
          ),
          ...makeSortProps('name', t({ id: 'pages.finance.portfolios.col.name' }), table.sort),
        },
        description: {
          dataIndex: 'description',
          autoWidth: { header: t({ id: 'pages.finance.portfolios.col.description' }), max: 280 },
          fixed: getFixed('description'),
          render: (val) =>
            val ? (
              <ClampedText text={String(val)}>
                <SearchMark text={String(val)} />
              </ClampedText>
            ) : (
              <EmptyValue />
            ),
          ...makeSortProps('description', t({ id: 'pages.finance.portfolios.col.description' }), table.sort),
        },
        base_currency: {
          dataIndex: 'base_currency',
          autoWidth: { header: t({ id: 'pages.finance.portfolios.col.baseCurrency' }) },
          fixed: getFixed('base_currency'),
          render: (val) => (val ? <Tag><SearchMark text={String(val)} /></Tag> : <EmptyValue />),
          ...makeSortProps('base_currency', t({ id: 'pages.finance.portfolios.col.baseCurrency' }), table.sort),
        },
        state: {
          dataIndex: 'state',
          width: 120,
          fixed: getFixed('state'),
          render: (_, record) => (
            <Tag color={record.state === 'active' ? 'green' : 'default'}>
              {record.state === 'active'
                ? t({ id: 'pages.finance.portfolios.state.active' })
                : t({ id: 'pages.finance.portfolios.state.closed' })}
            </Tag>
          ),
          ...makeSortProps('state', t({ id: 'pages.finance.portfolios.col.state' }), table.sort),
        },
        last_transaction_time: {
          dataIndex: 'last_transaction_time',
          width: 200,
          fixed: getFixed('last_transaction_time'),
          render: (val) => <DateTimeCell value={val as string | null} />,
          ...makeSortProps('last_transaction_time', t({ id: 'pages.finance.portfolios.col.lastTransactionTime' }), table.sort),
        },
        first_transaction_time: {
          dataIndex: 'first_transaction_time',
          width: 200,
          fixed: getFixed('first_transaction_time'),
          render: (val) => <DateTimeCell value={val as string | null} />,
          ...makeSortProps('first_transaction_time', t({ id: 'pages.finance.portfolios.col.firstTransactionTime' }), table.sort),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, table.sort.sortOrderForField, table.sort.activeRules, table.cols.fixedForKey, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Portfolio>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Portfolio> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <SearchHighlightProvider value={table.activeSearch}>
      <PageTable<Portfolio>
        key={`${table.cols.pinFingerprint}-${views.activeTabId}`}
        pageTitle={t({ id: 'pages.finance.portfolios.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t({ id: 'pages.finance.portfolios.new' })}
          </Button>
        }
        viewBar={<ViewTabs views={views} />}
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
            columnProps={{ hook: table.cols }}
            searchProps={{ value: table.searchQuery, onChange: table.setSearchQuery }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={portfolios}
        loading={isLoading}
        onRow={(record) => rowLink(detailUrl(record.id))}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(portfoliosData?.count)} />}
      />

      <PortfolioFormModal
        open={modalOpen}
        portfolio={null}
        currencies={currencies}
        submitting={createMutation.isPending}
        onCancel={() => setModalOpen(false)}
        onCreate={onCreateFinish}
      />
    </SearchHighlightProvider>
  );
}
