import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumb, Button, Card, DatePicker, Form, Input, InputNumber, Modal,
  Select, Space, Spin, Tag, Typography, message,
} from 'antd';
import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import dayjs from 'dayjs';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import { confirmDialog } from '@/components/ConfirmDialog';
import { DateTimeCell } from '@/components/DateTimeCell';
import { EmptyValue } from '@/components/EmptyValue';
import { SearchHighlightProvider, SearchMark } from '@/components/HighlightText/SearchMark';
import type { Transaction, TransferInput } from '@/services/unihub-backend/finance';
import {
  createTransaction,
  deletePortfolio,
  deleteTransaction,
  getPortfolio,
  listAssets,
  listTransactions,
  updatePortfolio,
  updateTransaction,
} from '@/services/unihub-backend/finance';
import { PanelHeaderActions } from '@/components/PanelHeaderActions';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { PortfolioFormModal } from './PortfolioFormModal';
import type { PortfolioUpdateFormValues } from './PortfolioFormModal';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, EntityListParams, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

interface TransferFormRow {
  asset: string;
  asset_change_amount: string;
  value_change?: string;
  remark?: string;
}

interface TransactionFormValues {
  timestamp: dayjs.Dayjs;
  description?: string;
  chain_id?: string;
  tx_hash?: string;
  transfers: TransferFormRow[];
}

/** 18dp decimal strings arrive zero-padded ("419.000000000000000000") — trim for display. */
function formatAmount(val: string): string {
  if (!val.includes('.')) return val;
  return val.replace(/0+$/, '').replace(/\.$/, '');
}

export function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [form] = Form.useForm<TransactionFormValues>();
  const { ref: panelRef, isNarrow } = useContainerWidth(720);

  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['finance', 'portfolios', id],
    queryFn: () => getPortfolio(id!),
    enabled: !!id,
  });

  const baseCurrency = portfolio?.base_currency ?? '???';

  const { data: assetsData } = useQuery({
    queryKey: ['finance', 'assets', { limit: 500 }],
    queryFn: () => listAssets({ limit: 500 }),
  });
  const assets = useMemo(() => assetsData?.results ?? [], [assetsData]);

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'description', label: t({ id: 'pages.finance.transactions.col.description' }), dataType: 'text' },
    { key: 'timestamp', label: t({ id: 'pages.finance.transactions.col.timestamp' }), dataType: 'date' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'timestamp', label: t({ id: 'pages.finance.transactions.col.timestamp' }), dataType: 'text', visible: true, order: 0 },
    { key: 'description', label: t({ id: 'pages.finance.transactions.col.description' }), dataType: 'text', visible: true, order: 1 },
    { key: 'transfer_count', label: t({ id: 'pages.finance.transactions.col.transferCount' }), dataType: 'text', visible: true, order: 2 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 3 },
  ], [t]);

  const table = useEntityTable({ key: `portfolio-transactions-${id}`, filterableAttrs, columnDefs });

  const queryParams = useMemo((): EntityListParams => {
    const portfolioCondition = { attr: 'portfolio', op: 'eq' as const, val: id ?? '' };
    const userGroups = table.queryParams.filters?.groups ?? [];
    const groups = userGroups.length === 0
      ? [{ logic: 'and' as const, conditions: [portfolioCondition] }]
      : userGroups.map((g) => ({ ...g, conditions: [portfolioCondition, ...g.conditions] }));
    return { ...table.queryParams, filters: { groups } };
  }, [table.queryParams, id]);

  const { data: transactionsData, isLoading: txnLoading } = useQuery({
    queryKey: ['finance', 'transactions', queryParams],
    queryFn: () => listTransactions(queryParams),
    enabled: !!id,
    meta: { errorMessage: t({ id: 'pages.finance.transactions.loadError' }) },
  });
  const transactions = useMemo(() => transactionsData?.results ?? [], [transactionsData]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
    queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
  };

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      form.resetFields();
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
      form.resetFields();
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

  const openCreate = () => {
    setEditingTransaction(null);
    form.resetFields();
    form.setFieldsValue({ transfers: [{}] as TransferFormRow[] });
    setModalOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingTransaction(txn);
    form.setFieldsValue({
      timestamp: dayjs(txn.timestamp),
      description: txn.description,
      chain_id: txn.chain_id,
      tx_hash: txn.tx_hash,
      transfers: txn.transfers.map((tr) => ({
        asset: tr.asset,
        asset_change_amount: tr.asset_change_amount,
        value_change: tr.value_change ?? undefined,
        remark: tr.remark,
      })),
    });
    setModalOpen(true);
  };

  const onFinish = (values: TransactionFormValues) => {
    const transfers: TransferInput[] = values.transfers.map((tr) => ({
      asset: tr.asset,
      asset_change_amount: String(tr.asset_change_amount),
      value_change: tr.value_change ? String(tr.value_change) : null,
      remark: tr.remark ?? '',
    }));
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

  const dataWidths = useMemo(() => {
    const w = { description: 0 };
    for (const txn of transactions) {
      w.description = Math.max(w.description, measureTextWidth(txn.description));
    }
    return w;
  }, [transactions]);

  const colDefMap = useMemo<Record<string, ProColumns<Transaction>>>(
    () => {
      const getFixed = table.cols.fixedForKey;
      return {
        timestamp: {
          dataIndex: 'timestamp',
          width: 200,
          fixed: getFixed('timestamp'),
          render: (val) => <DateTimeCell value={val as string | null} />,
          ...makeSortProps('timestamp', t({ id: 'pages.finance.transactions.col.timestamp' }), table.sort),
        },
        description: {
          dataIndex: 'description',
          ...widthForHeader(t({ id: 'pages.finance.transactions.col.description' }), dataWidths.description),
          fixed: getFixed('description'),
          render: (val) => (val ? <SearchMark text={String(val)} /> : <EmptyValue />),
        },
        transfer_count: {
          key: 'transfer_count',
          width: 100,
          fixed: getFixed('transfer_count'),
          render: (_, record) => record.transfers.length,
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
                <Button
                  size="small" danger icon={<DeleteOutlined />}
                  onClick={() =>
                    confirmDialog({
                      title: t({ id: 'pages.finance.transactions.delete.title' }),
                      content: t({ id: 'pages.finance.transactions.delete.confirm' }),
                      danger: true,
                      onOk: () => deleteMutation.mutate(record.id),
                    })
                  }
                >
                  {t({ id: 'common.delete' })}
                </Button>
              </Space>
            </span>
          ),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, table.sort.sortOrderForField, table.sort.activeRules, table.cols.fixedForKey, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Transaction>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Transaction> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  if (portfolioLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const transferCols: ProColumns[] = [
    {
      title: t({ id: 'pages.finance.transactions.transfer.asset' }),
      dataIndex: 'asset_name',
      render: (val) => (val ? <Tag><SearchMark text={String(val)} /></Tag> : <EmptyValue />),
    },
    {
      title: t({ id: 'pages.finance.transactions.transfer.assetChange' }),
      dataIndex: 'asset_change_amount',
      render: (val) => <SearchMark text={formatAmount(String(val))} />,
    },
    {
      title: t({ id: 'pages.finance.transactions.transfer.valueChange' }, { currency: baseCurrency }),
      dataIndex: 'value_change',
      render: (val) => (val != null ? <SearchMark text={formatAmount(String(val))} /> : <EmptyValue />),
    },
    {
      title: t({ id: 'pages.finance.transactions.transfer.remark' }),
      dataIndex: 'remark',
      render: (val) => (val ? <SearchMark text={String(val)} /> : <EmptyValue />),
    },
  ];

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
                  key: 'edit',
                  label: t({ id: 'common.edit' }),
                  icon: <EditOutlined />,
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
          <Space size="large" wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {portfolio?.name}
            </Typography.Title>
            <Tag>{portfolio?.base_currency}</Tag>
            <Tag color={portfolio?.state === 'active' ? 'green' : 'default'}>
              {portfolio?.state === 'active'
                ? t({ id: 'pages.finance.portfolios.state.active' })
                : t({ id: 'pages.finance.portfolios.state.closed' })}
            </Tag>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">{t({ id: 'pages.finance.portfolios.col.description' })}</Typography.Text>
            <div>{portfolio?.description ? portfolio.description : <EmptyValue />}</div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 32 }}>
            <div>
              <Typography.Text type="secondary">{t({ id: 'pages.finance.portfolios.col.firstTransactionTime' })}</Typography.Text>
              <div><DateTimeCell value={portfolio?.first_transaction_time} /></div>
            </div>
            <div>
              <Typography.Text type="secondary">{t({ id: 'pages.finance.portfolios.col.lastTransactionTime' })}</Typography.Text>
              <div><DateTimeCell value={portfolio?.last_transaction_time} /></div>
            </div>
          </div>
        </Card>
      </div>

      <PageTable<Transaction>
        key={table.cols.pinFingerprint}
        pageTitle={t({ id: 'pages.finance.transactions.title' })}
        action={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={portfolio?.state !== 'active'}
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
        rowKey="id"
        columns={columns}
        dataSource={transactions}
        loading={txnLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(transactionsData?.count)} />}
        expandable={{
          expandedRowRender: (record) => (
            <ProTable
              ghost
              dataSource={record.transfers}
              columns={transferCols}
              rowKey="id"
              search={false}
              toolBarRender={false}
              pagination={false}
              size="small"
            />
          ),
          rowExpandable: (record) => record.transfers.length > 0,
        }}
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

      <Modal
        title={editingTransaction ? t({ id: 'pages.finance.transactions.edit' }) : t({ id: 'pages.finance.transactions.new' })}
        open={modalOpen}
        width={640}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="timestamp"
            label={t({ id: 'pages.finance.transactions.form.timestamp' })}
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="description" label={t({ id: 'pages.finance.transactions.form.description' })}>
            <Input placeholder={t({ id: 'pages.finance.transactions.form.descriptionPlaceholder' })} />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="chain_id" label={t({ id: 'pages.finance.transactions.form.chainId' })}>
              <Input placeholder={t({ id: 'pages.finance.transactions.form.chainIdPlaceholder' })} maxLength={32} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="tx_hash" label={t({ id: 'pages.finance.transactions.form.txHash' })}>
              <Input placeholder={t({ id: 'pages.finance.transactions.form.txHashPlaceholder' })} maxLength={128} style={{ width: 300 }} />
            </Form.Item>
          </Space>

          <Form.List name="transfers" rules={[{ validator: async (_, v) => { if (!v || v.length === 0) return Promise.reject(new Error('At least one transfer required')); } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t({ id: 'pages.finance.transactions.form.transfers' })}
                </Typography.Text>
                {fields.map(({ key, name }) => (
                  <Space key={key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item name={[name, 'asset']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                      <Select
                        placeholder={t({ id: 'pages.finance.transactions.form.assetPlaceholder' })}
                        style={{ width: 160 }}
                        showSearch
                        optionFilterProp="children"
                      >
                        {assets.map((a) => (
                          <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Form.Item name={[name, 'asset_change_amount']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                      {/* stringMode with no `step`: typed values keep full 18dp precision (FR-008c) */}
                      <InputNumber
                        placeholder={t({ id: 'pages.finance.transactions.form.assetChangeAmount' })}
                        style={{ width: 140 }}
                        stringMode
                      />
                    </Form.Item>
                    <Form.Item name={[name, 'value_change']} style={{ marginBottom: 0 }}>
                      <InputNumber
                        placeholder={t({ id: 'pages.finance.transactions.form.valueChange' }, { currency: baseCurrency })}
                        style={{ width: 160 }}
                        stringMode
                      />
                    </Form.Item>
                    <Form.Item name={[name, 'remark']} style={{ marginBottom: 0 }}>
                      <Input
                        placeholder={t({ id: 'pages.finance.transactions.form.remarkPlaceholder' })}
                        maxLength={255}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} style={{ marginTop: 8 }} />
                  </Space>
                ))}
                <Form.ErrorList errors={errors} />
                <Button
                  type="dashed"
                  onClick={() => add()}
                  icon={<PlusOutlined />}
                  style={{ marginTop: 4 }}
                >
                  {t({ id: 'pages.finance.transactions.form.addTransfer' })}
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </SearchHighlightProvider>
  );
}
