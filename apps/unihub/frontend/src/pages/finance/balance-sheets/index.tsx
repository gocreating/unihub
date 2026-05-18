import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Form, Modal, Space, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { BalanceSheet } from '@/services/unihub-backend/finance';
import {
  createBalanceSheet,
  deleteBalanceSheet,
  listBalanceSheets,
  updateBalanceSheet,
} from '@/services/unihub-backend/finance';

export function BalanceSheetsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSheet, setEditingSheet] = useState<BalanceSheet | null>(null);
  const [form] = Form.useForm();

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });

  const createMutation = useMutation({
    mutationFn: createBalanceSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Balance sheet created.');
    },
    onError: () => message.error('Failed to create balance sheet.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBalanceSheet>[1] }) =>
      updateBalanceSheet(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Balance sheet updated.');
    },
    onError: () => message.error('Failed to update balance sheet.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBalanceSheet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      message.success('Balance sheet deleted.');
    },
    onError: () => message.error('Failed to delete balance sheet.'),
  });

  const openCreate = () => {
    setEditingSheet(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (sheet: BalanceSheet) => {
    setEditingSheet(sheet);
    form.setFieldsValue({ date: dayjs(sheet.date) });
    setModalOpen(true);
  };

  const onFinish = (values: { date: dayjs.Dayjs }) => {
    const data = { date: values.date.toISOString() };
    if (editingSheet) {
      updateMutation.mutate({ id: editingSheet.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns: ProColumns<BalanceSheet>[] = useMemo(
    () => [
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
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/finance/balance-sheets/${record.id}`)}
            >
              View
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Edit
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Delete Balance Sheet',
                  content: 'This will delete all balances in this sheet. Continue?',
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
    [navigate],
  );

  return (
    <>
      <PageTable<BalanceSheet>
        pageTitle="Balance Sheets"
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Balance Sheet
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={sheets}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={editingSheet ? 'Edit Balance Sheet' : 'New Balance Sheet'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="date" label="Date & Time" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
