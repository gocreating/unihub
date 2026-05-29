import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { ExchangeRate } from '@/services/unihub-backend/finance';
import {
  createExchangeRate,
  deleteExchangeRate,
  listCurrencies,
  listExchangeRates,
  updateExchangeRate,
} from '@/services/unihub-backend/finance';

export function ExchangeRatesPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);
  const [form] = Form.useForm();

  const { data: rates = [], isLoading, isError } = useQuery({
    queryKey: ['finance', 'exchange-rates'],
    queryFn: () => listExchangeRates(),
  });

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.finance.exchangeRates.loadError' }));
  }, [isError, t]);

  const { data: currencies = [] } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });

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

  const columns: ProColumns<ExchangeRate>[] = useMemo(
    () => [
      { title: t({ id: 'pages.finance.exchangeRates.col.base' }), dataIndex: 'base_currency', ...widthForHeader('Base', dataWidths.base_currency), render: (val) => <Tag>{val as string}</Tag> },
      { title: t({ id: 'pages.finance.exchangeRates.col.quote' }), dataIndex: 'quote_currency', ...widthForHeader('Quote', dataWidths.quote_currency), render: (val) => <Tag>{val as string}</Tag> },
      {
        title: t({ id: 'pages.finance.exchangeRates.col.rate' }),
        dataIndex: 'rate',
        ...widthForHeader('Rate', Math.max(120, dataWidths.rate)),
        render: (val) => parseFloat(val as string).toString(),
      },
      {
        title: t({ id: 'common.date' }),
        dataIndex: 'date',
        ...widthForHeader('Date', Math.max(220, dataWidths.date)),
        sorter: true,
        render: (val) => {
          const d = dayjs(val as string);
          return `${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`;
        },
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
              onClick={() => {
                Modal.confirm({
                  title: t({ id: 'pages.finance.exchangeRates.delete.title' }),
                  content: t({ id: 'pages.finance.exchangeRates.delete.confirm' }),
                  okType: 'danger',
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth],
  );

  return (
    <>
      <PageTable<ExchangeRate>
        pageTitle={t({ id: 'pages.finance.exchangeRates.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.exchangeRates.new' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={rates}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
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
