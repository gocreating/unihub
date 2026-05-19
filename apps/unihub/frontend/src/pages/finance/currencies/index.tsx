import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useIntl } from 'react-intl';
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
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [form] = Form.useForm();

  const { data: currencies = [], isLoading, isError } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.finance.currencies.loadError' }));
  }, [isError, t]);

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
      { title: t({ id: 'pages.finance.currencies.col.code' }), dataIndex: 'code', ...widthForHeader('Code'), sorter: true },
      { title: t({ id: 'common.name' }), dataIndex: 'name', ...widthForHeader('Name') },
      {
        title: t({ id: 'pages.finance.currencies.col.symbol' }),
        dataIndex: 'symbol',
        ...widthForHeader('Symbol'),
        render: (val) =>
          val ? String(val) : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
      },
      {
        title: t({ id: 'common.actions' }),
        key: 'actions',
        ...widthForHeader('Actions'),
        render: (_, record) => (
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
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
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
        rowKey="code"
        columns={columns}
        dataSource={currencies}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
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
        </Form>
      </Modal>
    </>
  );
}
