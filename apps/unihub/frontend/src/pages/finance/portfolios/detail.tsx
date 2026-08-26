import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumb, Button, Card, Descriptions, Space, Spin, Tag, message,
} from 'antd';
import {
  CaretDownOutlined, CaretRightOutlined, DeleteOutlined, EditOutlined,
  PlusOutlined, RedoOutlined, StopOutlined,
} from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import Decimal from 'decimal.js';
import PageTable, { useActionsColWidth, useRowProps } from '@/components/PageTable';
import { confirmDialog } from '@/components/ConfirmDialog';
import { ClampedText } from '@/components/ClampedText';
import { Price, formatMoney } from '@/components/Price';
import { DateTimeCell } from '@/components/DateTimeCell';
import { EmptyValue } from '@/components/EmptyValue';
import { SearchHighlightProvider, SearchMark } from '@/components/HighlightText/SearchMark';
import type { Transaction, Transfer, TransferInput } from '@/services/unihub-backend/finance';
import {
  createTransaction,
  deletePortfolio,
  deleteTransaction,
  getPortfolio,
  listAssets,
  listCurrencies,
  listTransactions,
  updatePortfolio,
  updateTransaction,
} from '@/services/unihub-backend/finance';
import { PanelHeaderActions } from '@/components/PanelHeaderActions';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { HoldingTags } from './HoldingTags';
import { PortfolioValuePanel } from './PortfolioValuePanel';
import { PortfolioFormModal } from './PortfolioFormModal';
import type { PortfolioUpdateFormValues } from './PortfolioFormModal';
import { TransactionFormModal } from './TransactionFormModal';
import type { TransactionFormValues } from './TransactionFormModal';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, EntityListParams, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

/**
 * FR-022: transfers are child ROWS of the transactions table sharing its
 * columns (the inventory catalog pattern), so the table's data is a union.
 */
type TxnRow =
  | (Transaction & { rowType: 'transaction'; children: TxnRow[] })
  | (Transfer & { rowType: 'transfer' });

function isTransaction(r: TxnRow): r is Transaction & { rowType: 'transaction'; children: TxnRow[] } {
  return r.rowType === 'transaction';
}

/**
 * Transaction and transfer PKs come from two different legacy tables whose
 * references were reused verbatim as primary keys, so a bare `id` is not
 * guaranteed unique across the union.
 */
function rowKeyOf(r: TxnRow): string {
  return `${r.rowType}:${r.id}`;
}

export function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const { ref: panelRef, width: panelWidth, isNarrow } = useContainerWidth(720);

  // FR-021 / research I4-2: content-width driven, not viewport breakpoints.
  // width === 0 is the pre-measurement frame — assume the roomy layout so the
  // panel doesn't flash a single column before the observer reports.
  const descriptionColumns = panelWidth === 0 || panelWidth >= 900 ? 3 : panelWidth < 560 ? 1 : 2;

  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['finance', 'portfolios', id],
    queryFn: () => getPortfolio(id!),
    enabled: !!id,
  });

  const baseCurrency = portfolio?.base_currency ?? '???';
  // FR-026: a closed portfolio is frozen except for reopening it.
  const isClosed = portfolio?.state === 'closed';

  const { data: assetsData } = useQuery({
    queryKey: ['finance', 'assets', { limit: 500 }],
    queryFn: () => listAssets({ limit: 500 }),
  });
  const assets = useMemo(() => assetsData?.results ?? [], [assetsData]);

  // FR-037: a transfer's cash leg references a Currency, so the modal needs
  // the currency list alongside the assets.
  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies({ limit: 200 }),
  });
  const currencies = useMemo(() => currenciesData?.results ?? [], [currenciesData]);

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'description', label: t({ id: 'pages.finance.transactions.col.description' }), dataType: 'text' },
    { key: 'timestamp', label: t({ id: 'pages.finance.transactions.col.timestamp' }), dataType: 'date' },
  ], [t]);

  // FR-056: one shared column set for both row types — Time, then the
  // ACCUMULATED pair (transaction rows only), then the Tx CHANGE pair
  // (transfer rows only), then Description. Remark is gone (FR-039).
  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: '__caret', label: '', dataType: 'text', visible: true, order: 0 },
    { key: 'timestamp', label: t({ id: 'pages.finance.transactions.col.timestamp' }), dataType: 'text', visible: true, order: 1 },
    { key: 'accumulated_pnl', label: t({ id: 'pages.finance.transactions.col.accumulatedPnl' }), dataType: 'text', visible: true, order: 2 },
    { key: 'accumulated_position', label: t({ id: 'pages.finance.transactions.col.accumulatedPosition' }), dataType: 'text', visible: true, order: 3 },
    { key: 'tx_pnl_change', label: t({ id: 'pages.finance.transactions.col.txPnlChange' }), dataType: 'text', visible: true, order: 4 },
    { key: 'tx_position_change', label: t({ id: 'pages.finance.transactions.col.txPositionChange' }), dataType: 'text', visible: true, order: 5 },
    { key: 'description', label: t({ id: 'pages.finance.transactions.col.description' }), dataType: 'text', visible: true, order: 6 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 7 },
  ], [t]);

  const table = useEntityTable({ key: `portfolio-transactions-${id}`, filterableAttrs, columnDefs });

  const portfolioCondition = useMemo(
    () => ({ attr: 'portfolio', op: 'eq' as const, val: id ?? '' }),
    [id],
  );

  const queryParams = useMemo((): EntityListParams => {
    const userGroups = table.queryParams.filters?.groups ?? [];
    const groups = userGroups.length === 0
      ? [{ logic: 'and' as const, conditions: [portfolioCondition] }]
      : userGroups.map((g) => ({ ...g, conditions: [portfolioCondition, ...g.conditions] }));
    return { ...table.queryParams, filters: { groups } };
  }, [table.queryParams, portfolioCondition]);

  const { data: transactionsData, isLoading: txnLoading } = useQuery({
    queryKey: ['finance', 'transactions', queryParams],
    queryFn: () => listTransactions(queryParams),
    enabled: !!id,
    meta: { errorMessage: t({ id: 'pages.finance.transactions.loadError' }) },
  });
  const transactions = useMemo(() => transactionsData?.results ?? [], [transactionsData]);

  /**
   * FR-057 / I9-4: the portfolio's COMPLETE transaction set, oldest first,
   * for the accumulated columns and the charts. The query above is the
   * table's — paginated, searched and user-sorted — so a running total built
   * from it would depend on the page (3 of 55 real portfolios exceed one).
   * This one is none of those things. Bounded by the backend cap of 500; the
   * largest real portfolio has 53 (research I9-4 records the bound).
   */
  const { data: allTransactionsData } = useQuery({
    queryKey: ['finance', 'transactions', 'all', id],
    queryFn: () =>
      listTransactions({
        filters: { groups: [{ logic: 'and', conditions: [portfolioCondition] }] },
        ordering: 'timestamp,created_at',
        limit: 500,
      }),
    enabled: !!id,
    meta: { errorMessage: t({ id: 'pages.finance.transactions.loadError' }) },
  });
  const allTransactions = useMemo(() => allTransactionsData?.results ?? [], [allTransactionsData]);

  // Tree rows: each transaction owns its transfers as children (FR-022).
  const rows = useMemo<TxnRow[]>(
    () =>
      transactions.map((txn) => ({
        ...txn,
        rowType: 'transaction' as const,
        children: txn.transfers.map((tr) => ({ ...tr, rowType: 'transfer' as const })),
      })),
    [transactions],
  );

  /**
   * FR-056: a transaction row shows ACCUMULATED balances. PnL accumulates into
   * one figure (all base currency); Position accumulates PER ASSET, because
   * quantities of different assets cannot be added. Computed oldest → newest
   * across the WHOLE portfolio (FR-057), with Decimal (never float), and
   * looked up by transaction id from whatever rows the page happens to show.
   */
  const runningTotals = useMemo(() => {
    // The backend already orders by (timestamp, created_at); the stable sort
    // only guards against a cached response from elsewhere.
    const chronological = [...allTransactions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let pnl = new Decimal(0);
    const positions = new Map<string, Decimal>();
    const out = new Map<string, { pnl: Decimal; positions: [string, Decimal][] }>();
    for (const txn of chronological) {
      for (const tr of txn.transfers) {
        if (tr.pnl_change != null) pnl = pnl.plus(new Decimal(tr.pnl_change));
        if (tr.asset && tr.asset_change_amount != null) {
          const key = tr.asset_name ?? tr.asset;
          positions.set(key, (positions.get(key) ?? new Decimal(0)).plus(tr.asset_change_amount));
        }
      }
      out.set(txn.id, {
        pnl,
        positions: [...positions.entries()].filter(([, q]) => !q.isZero()),
      });
    }
    return out;
  }, [allTransactions]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandedRowKeys = useMemo(() => Array.from(expandedIds), [expandedIds]);

  // Constitution v1.27.0: clicking anywhere on an expandable row toggles it.
  // Transactions have no detail page, so the whole row IS the caret.
  const rowProps = useRowProps();

  // FR-028: the footer reports both counts for the loaded page.
  const transferCount = useMemo(
    () => transactions.reduce((n, txn) => n + txn.transfers.length, 0),
    [transactions],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
    queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
  };

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      message.success(t({ id: 'pages.finance.transactions.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.transactions.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: txnId, data }: { id: string; data: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(txnId, data),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      message.success(t({ id: 'pages.finance.transactions.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.transactions.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.finance.transactions.deleted' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.transactions.deleteError' })),
  });

  const updatePortfolioMutation = useMutation({
    mutationFn: (data: PortfolioUpdateFormValues) => updatePortfolio(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      setPortfolioModalOpen(false);
      message.success(t({ id: 'pages.finance.portfolios.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.portfolios.updateError' })),
  });

  const deletePortfolioMutation = useMutation({
    mutationFn: () => deletePortfolio(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      message.success(t({ id: 'pages.finance.portfolios.deleted' }));
      navigate('/finance/portfolios');
    },
    onError: (error: Error & { status?: number }) => {
      if (error.status === 409) {
        message.error(t({ id: 'pages.finance.portfolios.deleteProtected' }));
      } else {
        message.error(t({ id: 'pages.finance.portfolios.deleteError' }));
      }
    },
  });

  const confirmDeletePortfolio = () => {
    confirmDialog({
      title: t({ id: 'pages.finance.portfolios.delete.title' }),
      content: t({ id: 'pages.finance.portfolios.delete.confirm' }, { name: portfolio?.name ?? '' }),
      danger: true,
      onOk: () => deletePortfolioMutation.mutate(),
    });
  };

  // The modal owns its own form instance and seeds it from `editing`, so the
  // page only decides WHICH transaction is being edited.
  const openCreate = () => {
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingTransaction(txn);
    setModalOpen(true);
  };

  const onFinish = (values: TransactionFormValues) => {
    const transfers: TransferInput[] = values.transfers.map((tr) =>
      tr.leg === 'currency'
        ? {
            currency: tr.currency ?? baseCurrency,
            currency_amount: String(tr.currency_amount ?? '0'),
            pnl_change: tr.pnl_change ? String(tr.pnl_change) : null,
          }
        : {
            asset: tr.asset,
            asset_change_amount: String(tr.asset_change_amount ?? '0'),
            pnl_change: tr.pnl_change ? String(tr.pnl_change) : null,
          },
    );
    const shared = {
      timestamp: values.timestamp.toISOString(),
      description: values.description ?? '',
      chain_id: values.chain_id ?? '',
      tx_hash: values.tx_hash ?? '',
      transfers,
    };
    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data: shared });
    } else {
      createMutation.mutate({ portfolio: id!, ...shared });
    }
  };

  const actionsColWidth = useActionsColWidth(transactions);

  const colDefMap = useMemo<Record<string, ProColumns<TxnRow>>>(
    () => {
      const getFixed = table.cols.fixedForKey;
      return {
        __caret: {
          key: '__caret',
          title: '',
          width: 44,
          fixed: getFixed('__caret'),
          render: (_, r) =>
            isTransaction(r) && r.children.length > 0 ? (
              // data-row-link-ignore keeps the caret inert to row navigation
              // (constitution v1.25.0) should these rows ever gain a detail page.
              <span
                data-row-link-ignore
                style={{ cursor: 'pointer' }}
                onClick={() => toggleExpand(rowKeyOf(r))}
              >
                {expandedIds.has(rowKeyOf(r)) ? <CaretDownOutlined /> : <CaretRightOutlined />}
              </span>
            ) : null,
        },
        timestamp: {
          dataIndex: 'timestamp',
          width: 200,
          fixed: getFixed('timestamp'),
          render: (_, r) => (isTransaction(r) ? <DateTimeCell value={r.timestamp} /> : null),
          ...makeSortProps('timestamp', t({ id: 'pages.finance.transactions.col.timestamp' }), table.sort),
        },
        description: {
          dataIndex: 'description',
          title: t({ id: 'pages.finance.transactions.col.description' }),
          autoWidth: {
            header: t({ id: 'pages.finance.transactions.col.description' }),
            max: 320,
            measure: (r: TxnRow) => (isTransaction(r) ? r.description : ''),
          },
          fixed: getFixed('description'),
          render: (_, r) =>
            isTransaction(r) ? (
              r.description ? (
                <ClampedText text={r.description}>
                  <SearchMark text={r.description} />
                </ClampedText>
              ) : (
                <EmptyValue />
              )
            ) : null,
        },
        // FR-056: the ACCUMULATED pair belongs to transaction rows and is
        // blank on transfer rows; the Tx CHANGE pair is the reverse. A cell
        // that does not apply to the row type renders nothing at all — the
        // shared empty placeholder is reserved for "applies, but absent".
        accumulated_pnl: {
          key: 'accumulated_pnl',
          title: t({ id: 'pages.finance.transactions.col.accumulatedPnl' }),
          align: 'right',
          autoWidth: { header: t({ id: 'pages.finance.transactions.col.accumulatedPnl' }), min: 140 },
          fixed: getFixed('accumulated_pnl'),
          render: (_, r) => {
            if (!isTransaction(r)) return null;
            const total = runningTotals.get(r.id)?.pnl;
            if (!total) return <EmptyValue />;
            return <Price value={total.toFixed()} currency={baseCurrency} signed />;
          },
        },
        accumulated_position: {
          key: 'accumulated_position',
          title: t({ id: 'pages.finance.transactions.col.accumulatedPosition' }),
          autoWidth: {
            header: t({ id: 'pages.finance.transactions.col.accumulatedPosition' }),
            max: 360,
            measure: (r: TxnRow) =>
              isTransaction(r)
                ? (runningTotals.get(r.id)?.positions ?? [])
                    .map(([a, q]) => formatMoney(q.toFixed(), { asset: a }))
                    .join(' ')
                : '',
          },
          fixed: getFixed('accumulated_position'),
          // Per asset, as badges — the same component as the list's Position.
          render: (_, r) =>
            isTransaction(r) ? (
              <HoldingTags
                holdings={(runningTotals.get(r.id)?.positions ?? []).map(([asset_name, q]) => ({
                  asset_name,
                  quantity: q.toFixed(),
                }))}
              />
            ) : null,
        },
        tx_pnl_change: {
          key: 'tx_pnl_change',
          title: t({ id: 'pages.finance.transactions.col.txPnlChange' }),
          align: 'right',
          autoWidth: { header: t({ id: 'pages.finance.transactions.col.txPnlChange' }), min: 140 },
          fixed: getFixed('tx_pnl_change'),
          render: (_, r) => {
            if (isTransaction(r)) return null;
            return r.pnl_change == null ? (
              <EmptyValue />
            ) : (
              <Price value={r.pnl_change} currency={baseCurrency} signed />
            );
          },
        },
        tx_position_change: {
          key: 'tx_position_change',
          title: t({ id: 'pages.finance.transactions.col.txPositionChange' }),
          align: 'right',
          autoWidth: { header: t({ id: 'pages.finance.transactions.col.txPositionChange' }), min: 160 },
          fixed: getFixed('tx_position_change'),
          render: (_, r) => {
            if (isTransaction(r)) return null;
            // A cash leg has no position (Position = assets, FR-034); a
            // position leg shows "+123 0050.TW".
            if (r.currency || r.asset_change_amount == null) return <EmptyValue />;
            return <Price value={r.asset_change_amount} asset={r.asset_name ?? ''} signed neutral />;
          },
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          // Actions belong to the transaction; transfers are edited through it.
          render: (_, r) =>
            isTransaction(r) ? (
              <span data-actions-col>
                <Space>
                  <Button size="small" icon={<EditOutlined />} disabled={isClosed} onClick={() => openEdit(r)}>
                    {t({ id: 'common.edit' })}
                  </Button>
                  <Button
                    size="small" danger icon={<DeleteOutlined />}
                    disabled={isClosed}
                    onClick={() =>
                      confirmDialog({
                        title: t({ id: 'pages.finance.transactions.delete.title' }),
                        content: t({ id: 'pages.finance.transactions.delete.confirm' }),
                        danger: true,
                        onOk: () => deleteMutation.mutate(r.id),
                      })
                    }
                  >
                    {t({ id: 'common.delete' })}
                  </Button>
                </Space>
              </span>
            ) : null,
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, actionsColWidth, expandedIds, baseCurrency, runningTotals, table.sort.sortOrderForField, table.sort.activeRules, table.cols.fixedForKey, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<TxnRow>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<TxnRow> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  if (portfolioLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <SearchHighlightProvider value={table.activeSearch}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: t({ id: 'pages.finance.portfolios.title' }),
            href: '/finance/portfolios',
            onClick: (e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              navigate('/finance/portfolios');
            },
          },
          { title: portfolio?.name },
        ]}
      />

      <div ref={panelRef}>
        <Card
          title={t({ id: 'pages.finance.portfolios.detail.panelTitle' })}
          style={{ marginBottom: 16 }}
          extra={
            <PanelHeaderActions
              narrow={isNarrow}
              kebabLabel="portfolio-actions"
              visible={[
                {
                  // FR-020: a frequent, reversible, non-destructive state
                  // toggle — visible, not folded in with Delete.
                  key: 'toggle-state',
                  label:
                    portfolio?.state === 'active'
                      ? t({ id: 'pages.finance.portfolios.action.close' })
                      : t({ id: 'pages.finance.portfolios.action.reopen' }),
                  icon: portfolio?.state === 'active' ? <StopOutlined /> : <RedoOutlined />,
                  onClick: () =>
                    updatePortfolioMutation.mutate({
                      state: portfolio?.state === 'active' ? 'closed' : 'active',
                    } as PortfolioUpdateFormValues),
                },
                {
                  key: 'edit',
                  label: t({ id: 'common.edit' }),
                  icon: <EditOutlined />,
                  // FR-026: frozen while closed. The backend rejects it too —
                  // this only makes the block visible before it is attempted.
                  disabled: isClosed,
                  onClick: () => setPortfolioModalOpen(true),
                },
              ]}
              advanced={[
                {
                  key: 'delete',
                  label: t({ id: 'common.delete' }),
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: confirmDeletePortfolio,
                },
              ]}
            />
          }
        >
          {/* FR-021: responsive Descriptions. The column count follows the
              MEASURED panel width, not AntD's viewport breakpoints — a
              collapsed-sidebar-narrow content area must collapse too
              (constitution VI, content-width rule). */}
          <Descriptions size="small" column={descriptionColumns} bordered={false}>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.form.name' })}>
              {portfolio?.name || <EmptyValue />}
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.col.baseCurrency' })}>
              {portfolio?.base_currency ? <Tag>{portfolio.base_currency}</Tag> : <EmptyValue />}
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.col.state' })}>
              <Tag color={portfolio?.state === 'active' ? 'green' : 'default'}>
                {portfolio?.state === 'active'
                  ? t({ id: 'pages.finance.portfolios.state.active' })
                  : t({ id: 'pages.finance.portfolios.state.closed' })}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.col.description' })}>
              {portfolio?.description || <EmptyValue />}
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.col.firstTransactionTime' })}>
              <DateTimeCell value={portfolio?.first_transaction_time} />
            </Descriptions.Item>
            <Descriptions.Item label={t({ id: 'pages.finance.portfolios.col.lastTransactionTime' })}>
              <DateTimeCell value={portfolio?.last_transaction_time} />
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>

      {/* FR-040 / FR-057: ONE panel, charted over the whole portfolio. */}
      {portfolio && (
        <PortfolioValuePanel portfolio={portfolio} transactions={allTransactions} />
      )}

      <PageTable<TxnRow>
        key={table.cols.pinFingerprint}
        pageTitle={t({ id: 'pages.finance.transactions.title' })}
        action={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={isClosed}
          >
            {t({ id: 'pages.finance.transactions.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
            columnProps={{ hook: table.cols }}
            searchProps={{ value: table.searchQuery, onChange: table.setSearchQuery }}
          />
        }
        rowKey={rowKeyOf}
        columns={columns}
        dataSource={rows}
        loading={txnLoading}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => (
          <EntityOffsetFooter
            {...table.paginationProps(transactionsData?.count)}
            totalText={t(
              { id: 'pages.finance.transactions.footerCounts' },
              { transactions: transactionsData?.count ?? 0, transfers: transferCount },
            )}
          />
        )}
        columnEmptyText={false}
        indentSize={0}
        expandable={{ showExpandColumn: false, expandedRowKeys }}
        onRow={(r) =>
          rowProps({
            onToggle:
              isTransaction(r) && r.children.length > 0 ? () => toggleExpand(rowKeyOf(r)) : null,
          })
        }
      />

      {portfolio && (
        <PortfolioFormModal
          open={portfolioModalOpen}
          portfolio={portfolio}
          submitting={updatePortfolioMutation.isPending}
          onCancel={() => setPortfolioModalOpen(false)}
          onUpdate={(values) => updatePortfolioMutation.mutate(values)}
        />
      )}

      <TransactionFormModal
        open={modalOpen}
        editing={editingTransaction}
        assets={assets}
        currencies={currencies}
        baseCurrency={baseCurrency}
        submitting={createMutation.isPending || updateMutation.isPending}
        onCancel={() => setModalOpen(false)}
        onSubmit={onFinish}
      />
    </SearchHighlightProvider>
  );
}
