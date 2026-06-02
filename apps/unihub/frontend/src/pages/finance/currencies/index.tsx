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
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

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

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'code', label: t({ id: 'pages.finance.currencies.col.code' }), dataType: 'text' },
    { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
    { key: 'symbol', label: t({ id: 'pages.finance.currencies.col.symbol' }), dataType: 'text' },
    { key: 'is_base_currency', label: t({ id: 'pages.finance.currencies.col.isBaseCurrency' }), dataType: 'boolean' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'code', label: t({ id: 'pages.finance.currencies.col.code' }), dataType: 'text', visible: true, order: 0 },
    { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 1 },
    { key: 'symbol', label: t({ id: 'pages.finance.currencies.col.symbol' }), dataType: 'text', visible: true, order: 2 },
    { key: 'is_base_currency', label: t({ id: 'pages.finance.currencies.col.isBaseCurrency' }), dataType: 'boolean', visible: true, order: 3 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 4 },
  ], [t]);

  const table = useEntityTable({ key: 'currencies', filterableAttrs, columnDefs });

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

  const colDefMap = useMemo<Record<string, ProColumns<Currency>>>(
    () => {
      const getFixed = (key: string) =>
        table.cols.visibleColumns[0]?.key === key ? table.cols.firstColumnFixed
          : table.cols.visibleColumns.at(-1)?.key === key ? table.cols.lastColumnFixed
          : undefined;
      return {
      code: {
        dataIndex: 'code',
        ...widthForHeader('Code', dataWidths.code),
        fixed: getFixed('code'),
        ...makeSortProps('code', t({ id: 'pages.finance.currencies.col.code' }), table.sort),
      },
      name: {
        dataIndex: 'name',
        ...widthForHeader('Name', dataWidths.name),
        fixed: getFixed('name'),
        ...makeSortProps('name', t({ id: 'common.name' }), table.sort),
      },
      symbol: {
        dataIndex: 'symbol',
        ...widthForHeader('Symbol', dataWidths.symbol),
        fixed: getFixed('symbol'),
        render: (val) =>
          val ? String(val) : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
        ...makeSortProps('symbol', t({ id: 'pages.finance.currencies.col.symbol' }), table.sort),
      },
      is_base_currency: {
        dataIndex: 'is_base_currency',
        width: 130,
        fixed: getFixed('is_base_currency'),
        render: (_, record) => <Switch checked={record.is_base_currency} disabled size="small" />,
        ...makeSortProps('is_base_currency', t({ id: 'pages.finance.currencies.col.isBaseCurrency' }), table.sort),
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
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, table.sort.sortOrderForField, table.sort.activeRules, table.cols.firstColumnFixed, table.cols.lastColumnFixed, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Currency>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Currency> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Currency>
        key={`${table.cols.visibleColumns[0]?.key ?? ''}-${table.cols.visibleColumns.at(-1)?.key ?? ''}-${!!table.cols.firstColumnFixed}-${!!table.cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.finance.currencies.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.currencies.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
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
