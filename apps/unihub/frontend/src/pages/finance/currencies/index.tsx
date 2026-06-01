import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Switch, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { Currency } from '@/services/unihub-backend/finance';
import {
  createCurrency,
  deleteCurrency,
  listCurrencies,
  updateCurrency,
} from '@/services/unihub-backend/finance';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';

const CURRENCY_FILTERABLE_ATTRS: FilterableAttribute[] = [
  { key: 'code', label: 'Code', dataType: 'text' },
  { key: 'name', label: 'Name', dataType: 'text' },
];

const CURRENCY_COLUMN_DEFS: ColumnDef[] = [
  { key: 'code', label: 'Code', dataType: 'text', visible: true, order: 0 },
  { key: 'name', label: 'Name', dataType: 'text', visible: true, order: 1 },
  { key: 'symbol', label: 'Symbol', dataType: 'text', visible: true, order: 2 },
  { key: 'is_base_currency', label: 'Base Currency', dataType: 'boolean', visible: true, order: 3 },
];

interface CurrencyFormValues {
  code: string;
  name: string;
  symbol: string;
  is_base_currency: boolean;
}

export function CurrenciesPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [form] = Form.useForm<CurrencyFormValues>();

  const table = useEntityTable({ key: 'currencies', filterableAttrs: CURRENCY_FILTERABLE_ATTRS, columnDefs: CURRENCY_COLUMN_DEFS });

  const { data: currenciesData, isLoading } = useQuery({
    queryKey: ['finance', 'currencies', table.queryParams],
    queryFn: () => listCurrencies(table.queryParams),
    meta: { errorMessage: t({ id: 'pages.finance.currencies.loadError' }) },
  });
  const currencies = useMemo(() => currenciesData?.results ?? [], [currenciesData]);

  const createMutation = useMutation({
    mutationFn: createCurrency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'currencies'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.currencies.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.currencies.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ code, data }: { code: string; data: Parameters<typeof updateCurrency>[1] }) =>
      updateCurrency(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'currencies'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.currencies.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.currencies.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCurrency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'currencies'] });
      message.success(t({ id: 'pages.finance.currencies.deleted' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.currencies.deleteError' })),
  });

  const openCreate = () => {
    setEditingCurrency(null);
    form.resetFields();
    form.setFieldsValue({ is_base_currency: false });
    setModalOpen(true);
  };

  const openEdit = (currency: Currency) => {
    setEditingCurrency(currency);
    form.setFieldsValue(currency);
    setModalOpen(true);
  };

  const onFinish = (values: CurrencyFormValues) => {
    if (editingCurrency) {
      updateMutation.mutate({
        code: editingCurrency.code,
        data: { name: values.name, symbol: values.symbol, is_base_currency: values.is_base_currency },
      });
    } else {
      createMutation.mutate({ ...values, code: values.code.toUpperCase() });
    }
  };

  const actionsColWidth = useActionsColWidth(currencies);

  const dataWidths = useMemo(() => {
    const w = { code: 0, name: 0, symbol: 0 };
    for (const c of currencies) {
      w.code = Math.max(w.code, measureTextWidth(c.code));
      w.name = Math.max(w.name, measureTextWidth(c.name));
      w.symbol = Math.max(w.symbol, measureTextWidth(c.symbol));
    }
    return w;
  }, [currencies]);

  const visibleKeys = new Set(table.cols.visibleColumns.map((c) => c.key));
  const lastVisKey = table.cols.visibleColumns.at(-1)?.key;

  const columns: ProColumns<Currency>[] = useMemo(
    () => [
      {
        title: t({ id: 'pages.finance.currencies.col.code' }),
        dataIndex: 'code',
        ...widthForHeader('Code', dataWidths.code),
        sorter: true,
        sortOrder: table.sort.sortOrderForField('code') ?? undefined,
        hidden: !visibleKeys.has('code'),
        fixed: table.cols.visibleColumns[0]?.key === 'code' ? table.cols.firstColumnFixed : lastVisKey === 'code' ? table.cols.lastColumnFixed : undefined,
      },
      {
        title: t({ id: 'common.name' }),
        dataIndex: 'name',
        ...widthForHeader('Name', dataWidths.name),
        sorter: true,
        sortOrder: table.sort.sortOrderForField('name') ?? undefined,
        hidden: !visibleKeys.has('name'),
        fixed: table.cols.visibleColumns[0]?.key === 'name' ? table.cols.firstColumnFixed : lastVisKey === 'name' ? table.cols.lastColumnFixed : undefined,
      },
      {
        title: t({ id: 'pages.finance.currencies.col.symbol' }),
        dataIndex: 'symbol',
        ...widthForHeader('Symbol', dataWidths.symbol),
        hidden: !visibleKeys.has('symbol'),
        fixed: table.cols.visibleColumns[0]?.key === 'symbol' ? table.cols.firstColumnFixed : lastVisKey === 'symbol' ? table.cols.lastColumnFixed : undefined,
        render: (val) =>
          val ? String(val) : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
      },
      {
        title: t({ id: 'pages.finance.currencies.col.isBaseCurrency' }),
        dataIndex: 'is_base_currency',
        width: 130,
        hidden: !visibleKeys.has('is_base_currency'),
        render: (_, record) => (
          <Switch checked={record.is_base_currency} disabled size="small" />
        ),
      },
      {
        title: t({ id: 'common.actions' }),
        key: 'actions',
        width: actionsColWidth,
        render: (_, record) => (
          <span data-actions-col>
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              {t({ id: 'common.edit' })}
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                Modal.confirm({
                  title: t({ id: 'pages.finance.currencies.delete.title' }),
                  content: t({ id: 'pages.finance.currencies.delete.confirm' }, { code: record.code, name: record.name }),
                  okType: 'danger',
                  onOk: () => deleteMutation.mutate(record.code),
                })
              }
            >
              {t({ id: 'common.delete' })}
            </Button>
          </Space>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, table.sort.activeRules, table.cols.activeState, visibleKeys, lastVisKey],
  );

  return (
    <>
      <PageTable<Currency>
        pageTitle={t({ id: 'pages.finance.currencies.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.currencies.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: CURRENCY_FILTERABLE_ATTRS, hook: table.filter }}
            sortProps={{ attrs: CURRENCY_FILTERABLE_ATTRS, hook: table.sort }}
            columnProps={{ hook: table.cols }}
          />
        }
        rowKey="code"
        columns={columns}
        dataSource={currencies}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(currenciesData?.count)} />}
      />

      <Modal
        title={editingCurrency ? t({ id: 'pages.finance.currencies.edit' }) : t({ id: 'pages.finance.currencies.new' })}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="code"
            label={t({ id: 'pages.finance.currencies.form.code' })}
            rules={[
              { required: true },
              { pattern: /^[A-Za-z]{3}$/, message: t({ id: 'pages.finance.currencies.form.codePattern' }) },
            ]}
          >
            <Input
              maxLength={3}
              style={{ textTransform: 'uppercase' }}
              disabled={!!editingCurrency}
              placeholder={t({ id: 'pages.finance.currencies.form.codePlaceholder' })}
            />
          </Form.Item>
          <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
            <Input placeholder={t({ id: 'pages.finance.currencies.form.namePlaceholder' })} />
          </Form.Item>
          <Form.Item name="symbol" label={t({ id: 'pages.finance.currencies.col.symbol' })}>
            <Input placeholder={t({ id: 'pages.finance.currencies.form.symbolPlaceholder' })} maxLength={10} />
          </Form.Item>
          <Form.Item
            name="is_base_currency"
            label={t({ id: 'pages.finance.currencies.col.isBaseCurrency' })}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: -16, marginBottom: 8 }}>
            {t({ id: 'pages.finance.currencies.form.isBaseCurrency' })}
          </Typography.Text>
        </Form>
      </Modal>
    </>
  );
}
