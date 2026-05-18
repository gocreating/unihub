import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Form, Modal, Space, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { BalanceSheet } from '@/services/unihub-backend/finance';
import {
  deleteBalanceSheet,
  listBalanceSheets,
  updateBalanceSheet,
} from '@/services/unihub-backend/finance';

export function BalanceSheetsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSheet, setEditingSheet] = useState<BalanceSheet | null>(null);
  const [form] = Form.useForm();

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBalanceSheet>[1] }) =>
      updateBalanceSheet(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      setEditModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.balanceSheets.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.balanceSheets.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBalanceSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      message.success(t({ id: 'pages.finance.balanceSheets.deleted' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.balanceSheets.deleteError' })),
  });

  const openEdit = (sheet: BalanceSheet) => {
    setEditingSheet(sheet);
    form.setFieldsValue({ date: dayjs(sheet.date) });
    setEditModalOpen(true);
  };

  const onFinish = (values: { date: dayjs.Dayjs }) => {
    if (editingSheet) {
      updateMutation.mutate({ id: editingSheet.id, data: { date: values.date.toISOString() } });
    }
  };

  const columns: ProColumns<BalanceSheet>[] = useMemo(
    () => [
      {
        title: t({ id: 'common.date' }),
        dataIndex: 'date',
        ...widthForHeader('Date', 220),
        sorter: true,
        render: (val) => {
          const d = dayjs(val as string);
          return `${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`;
        },
      },
      {
        title: t({ id: 'common.actions' }),
        key: 'actions',
        ...widthForHeader('Actions'),
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/finance/balance-sheets/${record.id}`)}
            >
              {t({ id: 'common.view' })}
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              {t({ id: 'common.edit' })}
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: t({ id: 'pages.finance.balanceSheets.delete.title' }),
                  content: t({ id: 'pages.finance.balanceSheets.delete.confirm' }),
                  okType: 'danger',
                  onOk: () => deleteMutation.mutate(record.id),
                });
              }}
            >
              {t({ id: 'common.delete' })}
            </Button>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, navigate],
  );

  return (
    <>
      <PageTable<BalanceSheet>
        pageTitle={t({ id: 'pages.finance.balanceSheets.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/balance-sheets/new')}>
            {t({ id: 'pages.finance.balanceSheets.new' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={sheets}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={t({ id: 'pages.finance.balanceSheets.edit' })}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="date" label={t({ id: 'pages.finance.balanceSheets.form.dateTime' })} rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
