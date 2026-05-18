import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Space, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { Currency } from '@/services/unihub-backend/finance';
import {
  createCurrency,
  deleteCurrency,
  listCurrencies,
  updateCurrency,
} from '@/services/unihub-backend/finance';

export function CurrenciesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [form] = Form.useForm();

  const { data: currencies = [], isLoading, isError } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: listCurrencies,
  });

  const createMutation = useMutation({
    mutationFn: createCurrency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'currencies'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Currency created.');
    },
    onError: () => message.error('Failed to create currency.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ code, data }: { code: string; data: Parameters<typeof updateCurrency>[1] }) =>
      updateCurrency(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'currencies'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Currency updated.');
    },
    onError: () => message.error('Failed to update currency.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCurrency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'currencies'] });
      message.success('Currency deleted.');
    },
    onError: () => message.error('Failed to delete currency.'),
  });

  const openCreate = () => {
    setEditingCurrency(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (currency: Currency) => {
    setEditingCurrency(currency);
    form.setFieldsValue(currency);
    setModalOpen(true);
  };

  const onFinish = (values: Currency) => {
    if (editingCurrency) {
      updateMutation.mutate({ code: editingCurrency.code, data: { name: values.name, symbol: values.symbol } });
    } else {
      createMutation.mutate({ ...values, code: values.code.toUpperCase() });
    }
  };

  const columns: ProColumns<Currency>[] = useMemo(
    () => [
      { title: 'Code', dataIndex: 'code', ...widthForHeader('Code'), sorter: true },
      { title: 'Name', dataIndex: 'name', ...widthForHeader('Name') },
      { title: 'Symbol', dataIndex: 'symbol', ...widthForHeader('Symbol') },
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
              onClick={() =>
                Modal.confirm({
                  title: 'Delete Currency',
                  content: `Delete "${record.code} – ${record.name}"? Accounts using this currency will be affected.`,
                  okType: 'danger',
                  onOk: () => deleteMutation.mutate(record.code),
                })
              }
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
        <Alert type="error" message="Failed to load currencies." style={{ marginBottom: 16 }} showIcon />
      )}
      <PageTable<Currency>
        pageTitle="Currencies"
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Currency
          </Button>
        }
        rowKey="code"
        columns={columns}
        dataSource={currencies}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={editingCurrency ? 'Edit Currency' : 'New Currency'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="code"
            label="Code (ISO 4217)"
            rules={[
              { required: true },
              { pattern: /^[A-Za-z]{3}$/, message: 'Must be a 3-letter code (e.g. USD, TWD)' },
            ]}
          >
            <Input
              maxLength={3}
              style={{ textTransform: 'uppercase' }}
              disabled={!!editingCurrency}
              placeholder="e.g. USD"
            />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. US Dollar" />
          </Form.Item>
          <Form.Item name="symbol" label="Symbol">
            <Input placeholder="e.g. $" maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
