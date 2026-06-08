import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Select, Space, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import dayjs from 'dayjs';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { Portfolio } from '@/services/unihub-backend/finance';
import { createPortfolio, deletePortfolio, listCurrencies, listPortfolios, updatePortfolio } from '@/services/unihub-backend/finance';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

interface PortfolioCreateFormValues {
  name: string;
  base_currency: string;
  state: 'active' | 'closed';
}

interface PortfolioUpdateFormValues {
  name: string;
  state: 'active' | 'closed';
}

const EMPTY_CELL = <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;

function formatTransactionTime(val: string | null | undefined) {
  if (!val) return EMPTY_CELL;
  return (
    <span title={dayjs(val).format('YYYY-MM-DD HH:mm')}>
      {dayjs(val).format('YYYY-MM-DD HH:mm')}
      <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
        ({dayjs(val).fromNow()})
      </Typography.Text>
    </span>
  );
}

export function PortfoliosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [createForm] = Form.useForm<PortfolioCreateFormValues>();
  const [updateForm] = Form.useForm<PortfolioUpdateFormValues>();

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.portfolios.col.name' }), dataType: 'text' },
    { key: 'state', label: t({ id: 'pages.finance.portfolios.col.state' }), dataType: 'text' },
    { key: 'base_currency', label: t({ id: 'pages.finance.portfolios.col.baseCurrency' }), dataType: 'text' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.portfolios.col.name' }), dataType: 'text', visible: true, order: 0 },
    { key: 'base_currency', label: t({ id: 'pages.finance.portfolios.col.baseCurrency' }), dataType: 'text', visible: true, order: 1 },
    { key: 'state', label: t({ id: 'pages.finance.portfolios.col.state' }), dataType: 'text', visible: true, order: 2 },
    { key: 'last_transaction_time', label: t({ id: 'pages.finance.portfolios.col.lastTransactionTime' }), dataType: 'text', visible: true, order: 3 },
    { key: 'first_transaction_time', label: t({ id: 'pages.finance.portfolios.col.firstTransactionTime' }), dataType: 'text', visible: true, order: 4 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 5 },
  ], [t]);

  const table = useEntityTable({
    key: 'portfolios',
    filterableAttrs,
    columnDefs,
    defaultSortRules: [{ field: 'last_transaction_time', direction: 'desc' as const }],
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
      createForm.resetFields();
      message.success(t({ id: 'pages.finance.portfolios.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.portfolios.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePortfolio>[1] }) =>
      updatePortfolio(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      setModalOpen(false);
      updateForm.resetFields();
      message.success(t({ id: 'pages.finance.portfolios.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.portfolios.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'portfolios'] });
      message.success(t({ id: 'pages.finance.portfolios.deleted' }));
    },
    onError: (error: Error & { status?: number }) => {
      if (error.status === 409) {
        message.error(t({ id: 'pages.finance.portfolios.deleteProtected' }));
      } else {
        message.error(t({ id: 'pages.finance.portfolios.deleteError' }));
      }
    },
  });

  const openCreate = () => {
    setEditingPortfolio(null);
    createForm.resetFields();
    createForm.setFieldsValue({ state: 'active' });
    setModalOpen(true);
  };

  const openEdit = (portfolio: Portfolio) => {
    setEditingPortfolio(portfolio);
    updateForm.setFieldsValue({ name: portfolio.name, state: portfolio.state });
    setModalOpen(true);
  };

  const onCreateFinish = (values: PortfolioCreateFormValues) => {
    createMutation.mutate({ name: values.name, base_currency: values.base_currency, state: values.state ?? 'active' });
  };

  const onUpdateFinish = (values: PortfolioUpdateFormValues) => {
    if (!editingPortfolio) return;
    updateMutation.mutate({ id: editingPortfolio.id, data: { name: values.name, state: values.state } });
  };

  const toggleState = (portfolio: Portfolio) => {
    const newState = portfolio.state === 'active' ? 'closed' : 'active';
    updateMutation.mutate({ id: portfolio.id, data: { state: newState } });
  };

  const actionsColWidth = useActionsColWidth(portfolios);

  const dataWidths = useMemo(() => {
    const w = { name: 0, base_currency: 0 };
    for (const p of portfolios) {
      w.name = Math.max(w.name, measureTextWidth(p.name));
      w.base_currency = Math.max(w.base_currency, measureTextWidth(p.base_currency));
    }
    return w;
  }, [portfolios]);

  const colDefMap = useMemo<Record<string, ProColumns<Portfolio>>>(
    () => {
      const getFixed = (key: string) =>
        table.cols.visibleColumns[0]?.key === key ? table.cols.firstColumnFixed
          : table.cols.visibleColumns.at(-1)?.key === key ? table.cols.lastColumnFixed
          : undefined;
      return {
        name: {
          dataIndex: 'name',
          ...widthForHeader(t({ id: 'pages.finance.portfolios.col.name' }), dataWidths.name),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'pages.finance.portfolios.col.name' }), table.sort),
        },
        base_currency: {
          dataIndex: 'base_currency',
          ...widthForHeader(t({ id: 'pages.finance.portfolios.col.baseCurrency' }), dataWidths.base_currency),
          fixed: getFixed('base_currency'),
          render: (val) => val ? <Tag>{String(val)}</Tag> : EMPTY_CELL,
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
          render: (val) => formatTransactionTime(val as string | null),
          ...makeSortProps('last_transaction_time', t({ id: 'pages.finance.portfolios.col.lastTransactionTime' }), table.sort),
        },
        first_transaction_time: {
          dataIndex: 'first_transaction_time',
          width: 200,
          fixed: getFixed('first_transaction_time'),
          render: (val) => formatTransactionTime(val as string | null),
          ...makeSortProps('first_transaction_time', t({ id: 'pages.finance.portfolios.col.firstTransactionTime' }), table.sort),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, record) => (
            <span data-actions-col>
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/finance/portfolios/${record.id}`)}>
                  {t({ id: 'common.view' })}
                </Button>
                <Button size="small" onClick={() => toggleState(record)}>
                  {record.state === 'active'
                    ? t({ id: 'pages.finance.portfolios.action.close' })
                    : t({ id: 'pages.finance.portfolios.action.reopen' })}
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  {t({ id: 'common.edit' })}
                </Button>
                <Button
                  size="small" danger icon={<DeleteOutlined />}
                  onClick={() =>
                    Modal.confirm({
                      title: t({ id: 'pages.finance.portfolios.delete.title' }),
                      content: t({ id: 'pages.finance.portfolios.delete.confirm' }, { name: record.name }),
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

  const columns = useMemo<ProColumns<Portfolio>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Portfolio> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Portfolio>
        key={`${table.cols.visibleColumns[0]?.key ?? ''}-${table.cols.visibleColumns.at(-1)?.key ?? ''}-${!!table.cols.firstColumnFixed}-${!!table.cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.finance.portfolios.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.portfolios.new' })}
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
        dataSource={portfolios}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(portfoliosData?.count)} />}
      />

      <Modal
        title={editingPortfolio ? t({ id: 'pages.finance.portfolios.edit' }) : t({ id: 'pages.finance.portfolios.new' })}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          createForm.resetFields();
          updateForm.resetFields();
        }}
        onOk={() => editingPortfolio ? updateForm.submit() : createForm.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        {editingPortfolio ? (
          <Form form={updateForm} layout="vertical" onFinish={onUpdateFinish}>
            <Form.Item name="name" label={t({ id: 'pages.finance.portfolios.form.name' })} rules={[{ required: true }]}>
              <Input placeholder={t({ id: 'pages.finance.portfolios.form.namePlaceholder' })} />
            </Form.Item>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {t({ id: 'pages.finance.portfolios.col.baseCurrency' })}: <Tag>{editingPortfolio.base_currency}</Tag>
            </Typography.Text>
            <Form.Item name="state" label={t({ id: 'pages.finance.portfolios.form.state' })}>
              <Select>
                <Select.Option value="active">{t({ id: 'pages.finance.portfolios.state.active' })}</Select.Option>
                <Select.Option value="closed">{t({ id: 'pages.finance.portfolios.state.closed' })}</Select.Option>
              </Select>
            </Form.Item>
          </Form>
        ) : (
          <Form form={createForm} layout="vertical" onFinish={onCreateFinish}>
            <Form.Item name="name" label={t({ id: 'pages.finance.portfolios.form.name' })} rules={[{ required: true }]}>
              <Input placeholder={t({ id: 'pages.finance.portfolios.form.namePlaceholder' })} />
            </Form.Item>
            <Form.Item name="base_currency" label={t({ id: 'pages.finance.portfolios.form.baseCurrency' })} rules={[{ required: true }]}>
              <Select placeholder={t({ id: 'pages.finance.portfolios.form.baseCurrencyPlaceholder' })}>
                {currencies.map((c) => (
                  <Select.Option key={c.code} value={c.code}>{c.code} — {c.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="state" label={t({ id: 'pages.finance.portfolios.form.state' })} initialValue="active">
              <Select>
                <Select.Option value="active">{t({ id: 'pages.finance.portfolios.state.active' })}</Select.Option>
                <Select.Option value="closed">{t({ id: 'pages.finance.portfolios.state.closed' })}</Select.Option>
              </Select>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}
