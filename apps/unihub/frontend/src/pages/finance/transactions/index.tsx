import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { useIntl } from 'react-intl';
import dayjs from 'dayjs';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { Portfolio, Transaction, TransferInput } from '@/services/unihub-backend/finance';
import {
  createTransaction,
  deleteTransaction,
  listAssets,
  listPortfolios,
  listTransactions,
  updateTransaction,
} from '@/services/unihub-backend/finance';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

const EMPTY_CELL = <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;

interface TransferFormRow {
  asset: string;
  asset_change_amount: string;
  value_change?: string;
}

interface TransactionFormValues {
  portfolio: string;
  timestamp: dayjs.Dayjs;
  description?: string;
  transfers: TransferFormRow[];
}

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [form] = Form.useForm<TransactionFormValues>();
  const selectedPortfolioId = Form.useWatch('portfolio', form);

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'portfolio', label: t({ id: 'pages.finance.transactions.col.portfolio' }), dataType: 'text' },
    { key: 'description', label: t({ id: 'pages.finance.transactions.col.description' }), dataType: 'text' },
    { key: 'timestamp', label: t({ id: 'pages.finance.transactions.col.timestamp' }), dataType: 'date' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'portfolio_name', label: t({ id: 'pages.finance.transactions.col.portfolio' }), dataType: 'text', visible: true, order: 0 },
    { key: 'timestamp', label: t({ id: 'pages.finance.transactions.col.timestamp' }), dataType: 'text', visible: true, order: 1 },
    { key: 'description', label: t({ id: 'pages.finance.transactions.col.description' }), dataType: 'text', visible: true, order: 2 },
    { key: 'transfer_count', label: t({ id: 'pages.finance.transactions.col.transferCount' }), dataType: 'text', visible: true, order: 3 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 4 },
  ], [t]);

  const table = useEntityTable({ key: 'transactions', filterableAttrs, columnDefs });

  const { data: transactionsData, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', table.queryParams],
    queryFn: () => listTransactions(table.queryParams),
    meta: { errorMessage: t({ id: 'pages.finance.transactions.loadError' }) },
  });
  const transactions = useMemo(() => transactionsData?.results ?? [], [transactionsData]);

  const { data: portfoliosData } = useQuery({
    queryKey: ['finance', 'portfolios', { limit: 200 }],
    queryFn: () => listPortfolios({ limit: 200 }),
  });
  const portfolios = useMemo(() => portfoliosData?.results ?? [], [portfoliosData]);

  const { data: assetsData } = useQuery({
    queryKey: ['finance', 'assets', { limit: 500 }],
    queryFn: () => listAssets({ limit: 500 }),
  });
  const assets = useMemo(() => assetsData?.results ?? [], [assetsData]);

  const selectedPortfolio = useMemo<Portfolio | undefined>(
    () => portfolios.find((p) => p.id === selectedPortfolioId),
    [portfolios, selectedPortfolioId],
  );
  const baseCurrency = selectedPortfolio?.base_currency ?? '???';

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.transactions.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.transactions.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.transactions.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.transactions.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      message.success(t({ id: 'pages.finance.transactions.deleted' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.transactions.deleteError' })),
  });

  const openCreate = () => {
    setEditingTransaction(null);
    form.resetFields();
    form.setFieldsValue({ transfers: [{}] as TransferFormRow[] });
    setModalOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingTransaction(txn);
    form.setFieldsValue({
      portfolio: txn.portfolio,
      timestamp: dayjs(txn.timestamp),
      description: txn.description,
      transfers: txn.transfers.map((tr) => ({
        asset: tr.asset,
        asset_change_amount: tr.asset_change_amount,
        value_change: tr.value_change ?? undefined,
      })),
    });
    setModalOpen(true);
  };

  const onFinish = (values: TransactionFormValues) => {
    const transfers: TransferInput[] = values.transfers.map((tr) => ({
      asset: tr.asset,
      asset_change_amount: String(tr.asset_change_amount),
      value_change: tr.value_change ? String(tr.value_change) : null,
    }));
    if (editingTransaction) {
      updateMutation.mutate({
        id: editingTransaction.id,
        data: {
          timestamp: values.timestamp.toISOString(),
          description: values.description ?? '',
          transfers,
        },
      });
    } else {
      createMutation.mutate({
        portfolio: values.portfolio,
        timestamp: values.timestamp.toISOString(),
        description: values.description ?? '',
        transfers,
      });
    }
  };

  const actionsColWidth = useActionsColWidth(transactions);

  const dataWidths = useMemo(() => {
    const w = { portfolio_name: 0, description: 0 };
    for (const txn of transactions) {
      w.portfolio_name = Math.max(w.portfolio_name, measureTextWidth(txn.portfolio_name));
      w.description = Math.max(w.description, measureTextWidth(txn.description));
    }
    return w;
  }, [transactions]);

  const colDefMap = useMemo<Record<string, ProColumns<Transaction>>>(
    () => {
      const getFixed = (key: string) =>
        table.cols.visibleColumns[0]?.key === key ? table.cols.firstColumnFixed
          : table.cols.visibleColumns.at(-1)?.key === key ? table.cols.lastColumnFixed
          : undefined;
      return {
        portfolio_name: {
          dataIndex: 'portfolio_name',
          ...widthForHeader(t({ id: 'pages.finance.transactions.col.portfolio' }), dataWidths.portfolio_name),
          fixed: getFixed('portfolio_name'),
          render: (val) => val ? <Tag>{String(val)}</Tag> : EMPTY_CELL,
        },
        timestamp: {
          dataIndex: 'timestamp',
          width: 200,
          fixed: getFixed('timestamp'),
          render: (val) => {
            if (!val) return EMPTY_CELL;
            return (
              <span title={dayjs(val as string).format('YYYY-MM-DD HH:mm')}>
                {dayjs(val as string).format('YYYY-MM-DD HH:mm')}
                <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                  ({dayjs(val as string).fromNow()})
                </Typography.Text>
              </span>
            );
          },
          ...makeSortProps('timestamp', t({ id: 'pages.finance.transactions.col.timestamp' }), table.sort),
        },
        description: {
          dataIndex: 'description',
          ...widthForHeader(t({ id: 'pages.finance.transactions.col.description' }), dataWidths.description),
          fixed: getFixed('description'),
          render: (val) => val ? String(val) : EMPTY_CELL,
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
                    Modal.confirm({
                      title: t({ id: 'pages.finance.transactions.delete.title' }),
                      content: t({ id: 'pages.finance.transactions.delete.confirm' }),
                      okType: 'danger',
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
    [t, dataWidths, actionsColWidth, table.sort.sortOrderForField, table.sort.activeRules, table.cols.firstColumnFixed, table.cols.lastColumnFixed, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Transaction>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Transaction> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Transaction>
        key={`${table.cols.visibleColumns[0]?.key ?? ''}-${table.cols.visibleColumns.at(-1)?.key ?? ''}-${!!table.cols.firstColumnFixed}-${!!table.cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.finance.transactions.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.transactions.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
            columnProps={{ hook: table.cols }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={transactions}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(transactionsData?.count)} />}
        expandable={{
          expandedRowRender: (record) => {
            const txnPortfolio = portfolios.find((p) => p.id === record.portfolio);
            const currency = txnPortfolio?.base_currency ?? '???';
            const transferCols: ProColumns[] = [
              {
                title: t({ id: 'pages.finance.transactions.transfer.asset' }),
                dataIndex: 'asset_name',
                render: (val) => val ? <Tag>{String(val)}</Tag> : EMPTY_CELL,
              },
              {
                title: t({ id: 'pages.finance.transactions.transfer.assetChange' }),
                dataIndex: 'asset_change_amount',
              },
              {
                title: t({ id: 'pages.finance.transactions.transfer.valueChange' }, { currency }),
                dataIndex: 'value_change',
                render: (val) => val != null ? String(val) : EMPTY_CELL,
              },
            ];
            return (
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
            );
          },
          rowExpandable: (record) => record.transfers.length > 0,
        }}
      />

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
            name="portfolio"
            label={t({ id: 'pages.finance.transactions.form.portfolio' })}
            rules={[{ required: true }]}
          >
            <Select
              placeholder={t({ id: 'pages.finance.transactions.form.portfolioPlaceholder' })}
              disabled={!!editingTransaction}
              showSearch
              optionFilterProp="children"
            >
              {portfolios
                .filter((p) => p.state === 'active' || (editingTransaction && p.id === editingTransaction.portfolio))
                .map((p) => (
                  <Select.Option key={p.id} value={p.id}>
                    {p.name} ({p.base_currency})
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>

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
                      <InputNumber
                        placeholder={t({ id: 'pages.finance.transactions.form.assetChangeAmount' })}
                        style={{ width: 140 }}
                        stringMode
                        step="0.00000001"
                      />
                    </Form.Item>
                    <Form.Item name={[name, 'value_change']} style={{ marginBottom: 0 }}>
                      <InputNumber
                        placeholder={t({ id: 'pages.finance.transactions.form.valueChange' }, { currency: baseCurrency })}
                        style={{ width: 160 }}
                        stringMode
                        step="0.00000001"
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
    </>
  );
}
