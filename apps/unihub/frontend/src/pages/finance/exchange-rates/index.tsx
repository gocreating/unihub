import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);
  const [form] = Form.useForm();

  const { data: rates = [], isLoading, isError } = useQuery({
    queryKey: ['finance', 'exchange-rates'],
    queryFn: () => listExchangeRates(),
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: listCurrencies,
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
      message.success('Exchange rate created.');
    },
    onError: () => message.error('Failed to create exchange rate.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateExchangeRate>[1] }) =>
      updateExchangeRate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'exchange-rates'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Exchange rate updated.');
    },
    onError: () => message.error('Failed to update exchange rate.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExchangeRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'exchange-rates'] });
      message.success('Exchange rate deleted.');
    },
    onError: () => message.error('Failed to delete exchange rate.'),
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

  const columns: ProColumns<ExchangeRate>[] = useMemo(
    () => [
      { title: 'Base', dataIndex: 'base_currency', ...widthForHeader('Base') },
      { title: 'Quote', dataIndex: 'quote_currency', ...widthForHeader('Quote') },
      { title: 'Rate', dataIndex: 'rate', ...widthForHeader('Rate', 120) },
      {
        title: 'Date',
        dataIndex: 'date',
        ...widthForHeader('Date', 160),
        sorter: true,
        render: (val) => dayjs(val as string).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: 'Actions',
        key: 'actions',
        ...widthForHeader('Actions'),
        render: (_, record) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Edit
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Delete Exchange Rate',
                  content: 'Delete this exchange rate?',
                  okType: 'danger',
                  onOk: () => deleteMutation.mutate(record.id),
                });
              }}
            >
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      {isError && (
        <Alert type="error" message="Failed to load exchange rates." style={{ marginBottom: 16 }} showIcon />
      )}
      <PageTable<ExchangeRate>
        pageTitle="Exchange Rates"
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Rate
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={rates}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={editingRate ? 'Edit Exchange Rate' : 'New Exchange Rate'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="base_currency" label="Base Currency" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select base currency" optionFilterProp="label" options={currencyOptions} />
          </Form.Item>
          <Form.Item name="quote_currency" label="Quote Currency" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select quote currency" optionFilterProp="label" options={currencyOptions} />
          </Form.Item>
          <Form.Item
            name="rate"
            label="Rate (1 base = ? quote)"
            rules={[
              { required: true },
              { pattern: /^\d+(\.\d+)?$/, message: 'Enter a positive decimal number' },
            ]}
          >
            <Input placeholder="e.g. 32.5" />
          </Form.Item>
          <Form.Item name="date" label="Effective Date & Time" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
