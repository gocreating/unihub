import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Form, Input, Modal, Space, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { ExchangeRate } from '@/services/unihub-backend/finance';
import {
  createExchangeRate,
  deleteExchangeRate,
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
    from_currency: string;
    to_currency: string;
    rate: string;
    date: dayjs.Dayjs;
  }) => {
    const data = { ...values, date: values.date.format('YYYY-MM-DD') };
    if (editingRate) {
      updateMutation.mutate({ id: editingRate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns: ProColumns<ExchangeRate>[] = useMemo(
    () => [
      { title: 'From', dataIndex: 'from_currency', ...widthForHeader('From') },
      { title: 'To', dataIndex: 'to_currency', ...widthForHeader('To') },
      { title: 'Rate', dataIndex: 'rate', ...widthForHeader('Rate', 100) },
      { title: 'Date', dataIndex: 'date', ...widthForHeader('Date'), sorter: true },
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
          <Form.Item
            name="from_currency"
            label="From Currency"
            rules={[{ required: true }, { pattern: /^[A-Za-z]{3}$/, message: '3-letter code' }]}
          >
            <Input maxLength={3} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item
            name="to_currency"
            label="To Currency"
            rules={[{ required: true }, { pattern: /^[A-Za-z]{3}$/, message: '3-letter code' }]}
          >
            <Input maxLength={3} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item
            name="rate"
            label="Rate"
            rules={[
              { required: true },
              { pattern: /^\d+(\.\d+)?$/, message: 'Enter a positive decimal number' },
            ]}
          >
            <Input placeholder="e.g. 0.030769" />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
