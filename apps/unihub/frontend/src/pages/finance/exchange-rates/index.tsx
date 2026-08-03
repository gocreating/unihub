import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { confirmDialog } from '@/components/ConfirmDialog';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { ExchangeRate } from '@/services/unihub-backend/finance';
import { formatAmount } from '@/utils/finance';
import {
  createExchangeRate,
  deleteExchangeRate,
  listCurrencies,
  listExchangeRates,
  updateExchangeRate,
} from '@/services/unihub-backend/finance';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute, ViewConfig } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';
import { ViewTabs } from '@/components/EntityViews/ViewTabs';
import { useEntityViews } from '@/components/EntityViews/useEntityViews';

export function ExchangeRatesPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);
  const [form] = Form.useForm();

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'base_currency', label: t({ id: 'pages.finance.exchangeRates.col.base' }), dataType: 'single_select' },
    { key: 'quote_currency', label: t({ id: 'pages.finance.exchangeRates.col.quote' }), dataType: 'single_select' },
    { key: 'rate', label: t({ id: 'pages.finance.exchangeRates.col.rate' }), dataType: 'number' },
    { key: 'date', label: t({ id: 'common.date' }), dataType: 'date' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'base_currency', label: t({ id: 'pages.finance.exchangeRates.col.base' }), dataType: 'single_select', visible: true, order: 0 },
    { key: 'quote_currency', label: t({ id: 'pages.finance.exchangeRates.col.quote' }), dataType: 'single_select', visible: true, order: 1 },
    { key: 'rate', label: t({ id: 'pages.finance.exchangeRates.col.rate' }), dataType: 'text', visible: true, order: 2 },
    { key: 'date', label: t({ id: 'common.date' }), dataType: 'date', visible: true, order: 3 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 4 },
  ], [t]);

  const table = useEntityTable({ key: 'finance-exchange-rates', filterableAttrs, columnDefs });

  // The default-view baseline the view tabs diff against (016 views).
  const defaultViewConfig = useMemo<ViewConfig>(
    () => ({
      filters: [],
      sort: [],
      columns: columnDefs.map((c) => ({ key: c.key, visible: c.visible, order: c.order, pin: c.pin })),
      pageSize: 25,
    }),
    [columnDefs],
  );
  const views = useEntityViews({
    tableKey: table.tableKey,
    table,
    defaultConfig: defaultViewConfig,
  });

  const { data: ratesData, isLoading } = useQuery({
    queryKey: ['finance', 'exchange-rates', table.queryParams],
    queryFn: () => listExchangeRates(table.queryParams),
    meta: { errorMessage: t({ id: 'pages.finance.exchangeRates.loadError' }) },
  });
  const rates = useMemo(() => ratesData?.results ?? [], [ratesData]);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencies = useMemo(() => currenciesData?.results ?? [], [currenciesData]);

  const currencyOptions = currencies.map((c) => ({
    value: c.code,
    label: `${c.code} – ${c.name}`,
  }));

  const createMutation = useMutation({
    mutationFn: createExchangeRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'exchange-rates'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.exchangeRates.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.exchangeRates.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateExchangeRate>[1] }) =>
      updateExchangeRate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'exchange-rates'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.exchangeRates.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.exchangeRates.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExchangeRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'exchange-rates'] });
      message.success(t({ id: 'pages.finance.exchangeRates.deleted' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.exchangeRates.deleteError' })),
  });

  const openCreate = () => {
    setEditingRate(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (rate: ExchangeRate) => {
    setEditingRate(rate);
    form.setFieldsValue({ ...rate, date: dayjs(rate.date) });
    setModalOpen(true);
  };

  const onFinish = (values: {
    base_currency: string;
    quote_currency: string;
    rate: string;
    date: dayjs.Dayjs;
  }) => {
    const data = { ...values, date: values.date.toISOString() };
    if (editingRate) {
      updateMutation.mutate({ id: editingRate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const actionsColWidth = useActionsColWidth(rates);

  const dataWidths = useMemo(() => {
    const w = { base_currency: 0, quote_currency: 0, rate: 0, date: 0 };
    for (const r of rates) {
      w.base_currency = Math.max(w.base_currency, measureTextWidth(r.base_currency));
      w.quote_currency = Math.max(w.quote_currency, measureTextWidth(r.quote_currency));
      w.rate = Math.max(w.rate, measureTextWidth(parseFloat(r.rate).toString()));
      const d = dayjs(r.date);
      w.date = Math.max(w.date, measureTextWidth(`${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`));
    }
    return w;
  }, [rates]);

  const colDefMap = useMemo<Record<string, ProColumns<ExchangeRate>>>(
    () => {
      const getFixed = table.cols.fixedForKey;
      return {
      base_currency: {
        dataIndex: 'base_currency',
        ...widthForHeader('Base', dataWidths.base_currency),
        fixed: getFixed('base_currency'),
        render: (val) => <Tag>{val as string}</Tag>,
        ...makeSortProps('base_currency', t({ id: 'pages.finance.exchangeRates.col.base' }), table.sort),
      },
      quote_currency: {
        dataIndex: 'quote_currency',
        ...widthForHeader('Quote', dataWidths.quote_currency),
        fixed: getFixed('quote_currency'),
        render: (val) => <Tag>{val as string}</Tag>,
        ...makeSortProps('quote_currency', t({ id: 'pages.finance.exchangeRates.col.quote' }), table.sort),
      },
      rate: {
        dataIndex: 'rate',
        ...widthForHeader('Rate', Math.max(120, dataWidths.rate)),
        align: 'right',
        fixed: getFixed('rate'),
        render: (val) => formatAmount(val as string),
        ...makeSortProps('rate', t({ id: 'pages.finance.exchangeRates.col.rate' }), table.sort),
      },
      date: {
        dataIndex: 'date',
        ...widthForHeader('Date', Math.max(220, dataWidths.date)),
        fixed: getFixed('date'),
        render: (val) => {
          const d = dayjs(val as string);
          return `${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`;
        },
        ...makeSortProps('date', t({ id: 'common.date' }), table.sort),
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
                onClick={() => {
                  confirmDialog({
                    title: t({ id: 'pages.finance.exchangeRates.delete.title' }),
                    content: t({ id: 'pages.finance.exchangeRates.delete.confirm' }),
                    danger: true,
                    onOk: () => deleteMutation.mutate(record.id),
                  });
                }}
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

  const columns = useMemo<ProColumns<ExchangeRate>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<ExchangeRate> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<ExchangeRate>
        key={`${table.cols.pinFingerprint}-${views.activeTabId}`}
        pageTitle={t({ id: 'pages.finance.exchangeRates.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.exchangeRates.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
            columnProps={{ hook: table.cols }}
          />
        }
        viewBar={<ViewTabs views={views} />}
        rowKey="id"
        columns={columns}
        dataSource={rates}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(ratesData?.count)} />}
      />

      <Modal
        title={editingRate ? t({ id: 'pages.finance.exchangeRates.edit' }) : t({ id: 'pages.finance.exchangeRates.new' })}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="base_currency" label={t({ id: 'pages.finance.exchangeRates.form.baseCurrency' })} rules={[{ required: true }]}>
            <Select showSearch placeholder={t({ id: 'pages.finance.exchangeRates.form.basePlaceholder' })} optionFilterProp="label" options={currencyOptions} />
          </Form.Item>
          <Form.Item name="quote_currency" label={t({ id: 'pages.finance.exchangeRates.form.quoteCurrency' })} rules={[{ required: true }]}>
            <Select showSearch placeholder={t({ id: 'pages.finance.exchangeRates.form.quotePlaceholder' })} optionFilterProp="label" options={currencyOptions} />
          </Form.Item>
          <Form.Item
            name="rate"
            label={t({ id: 'pages.finance.exchangeRates.form.rate' })}
            rules={[
              { required: true },
              { pattern: /^\d+(\.\d+)?$/, message: t({ id: 'pages.finance.exchangeRates.form.ratePattern' }) },
            ]}
          >
            <Input placeholder="e.g. 32.5" />
          </Form.Item>
          <Form.Item name="date" label={t({ id: 'pages.finance.exchangeRates.form.date' })} rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
