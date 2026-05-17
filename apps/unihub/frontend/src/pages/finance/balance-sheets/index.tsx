import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Modal, Radio, Space, message } from 'antd';
import { BarChartOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { Line } from '@ant-design/plots';
import dayjs from 'dayjs';
import Decimal from 'decimal.js';
import { useNavigate } from 'react-router-dom';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { BalanceSheet } from '@/services/unihub-backend/finance';
import {
  createBalanceSheet,
  deleteBalanceSheet,
  getNetWorth,
  listBalanceSheets,
  updateBalanceSheet,
} from '@/services/unihub-backend/finance';

type ViewMode = 'table' | 'chart';

export function BalanceSheetsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSheet, setEditingSheet] = useState<BalanceSheet | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [form] = Form.useForm();

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });

  const netWorthQueries = useQueries({
    queries: viewMode === 'chart' ? sheets.map((bs) => ({
      queryKey: ['finance', 'balance-sheets', bs.id, 'net-worth'],
      queryFn: () => getNetWorth(bs.id),
    })) : [],
  });

  const chartData = useMemo(() => {
    if (viewMode !== 'chart') return [];
    return sheets
      .map((bs, i) => {
        const q = netWorthQueries[i];
        if (!q?.data) return null;
        const nw = q.data.base_currency_total.net_worth;
        return {
          date: bs.date,
          label: bs.label || bs.date,
          value: new Decimal(nw).toNumber(),
          currency: bs.base_currency,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sheets, netWorthQueries, viewMode]);

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
    form.setFieldsValue({ ...sheet, date: dayjs(sheet.date) });
    setModalOpen(true);
  };

  const onFinish = (values: { date: dayjs.Dayjs; label: string; base_currency: string }) => {
    const data = { ...values, date: values.date.format('YYYY-MM-DD') };
    if (editingSheet) {
      updateMutation.mutate({ id: editingSheet.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns: ProColumns<BalanceSheet>[] = useMemo(
    () => [
      { title: 'Date', dataIndex: 'date', ...widthForHeader('Date'), sorter: true },
      { title: 'Label', dataIndex: 'label', ...widthForHeader('Label') },
      { title: 'Base Currency', dataIndex: 'base_currency', ...widthForHeader('Base Currency') },
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

  const isChartLoading = viewMode === 'chart' && netWorthQueries.some((q) => q.isLoading);

  return (
    <>
      <PageTable<BalanceSheet>
        pageTitle="Balance Sheets"
        action={
          <Space>
            <Radio.Group
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              optionType="button"
              size="small"
            >
              <Radio.Button value="table"><TableOutlined /> Table</Radio.Button>
              <Radio.Button value="chart"><BarChartOutlined /> Chart</Radio.Button>
            </Radio.Group>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Balance Sheet
            </Button>
          </Space>
        }
        rowKey="id"
        columns={columns}
        dataSource={viewMode === 'table' ? sheets : []}
        loading={isLoading || isChartLoading}
        scroll={{ x: computeScrollX(columns) }}
        footer={
          viewMode === 'chart' && chartData.length > 0
            ? () => (
                <div style={{ padding: '16px 0' }}>
                  <Line
                    data={chartData}
                    xField="date"
                    yField="value"
                    point={{ size: 4 }}
                    label={{ position: 'top' }}
                    height={280}
                    tooltip={{ title: 'date', field: 'value', valueFormatter: (v: number) => String(v) }}
                  />
                </div>
              )
            : viewMode === 'chart' && !isChartLoading && chartData.length === 0
              ? () => (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>
                    No net worth data available. Enter balances and configure exchange rates to see the trend.
                  </div>
                )
              : undefined
        }
      />

      <Modal
        title={editingSheet ? 'Edit Balance Sheet' : 'New Balance Sheet'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="label" label="Label">
            <Input placeholder="e.g. May 2026" />
          </Form.Item>
          <Form.Item
            name="base_currency"
            label="Base Currency (ISO 4217)"
            rules={[
              { required: true },
              { pattern: /^[A-Za-z]{3}$/, message: 'Must be a 3-letter currency code' },
            ]}
          >
            <Input maxLength={3} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
