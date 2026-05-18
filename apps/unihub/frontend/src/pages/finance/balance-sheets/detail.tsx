import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Form, Input, Row, Spin, Statistic, Tooltip, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { EditOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import { useParams } from 'react-router-dom';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { Balance } from '@/services/unihub-backend/finance';
import {
  deleteBalance,
  getNetWorth,
  listBalances,
  listBalanceSheets,
  upsertBalance,
} from '@/services/unihub-backend/finance';

interface EditAmountFormValues {
  amount: string;
}

export function BalanceSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editingBalance, setEditingBalance] = useState<Balance | null>(null);
  const [form] = Form.useForm<EditAmountFormValues>();

  const { data: sheets = [] } = useQuery({
    queryKey: ['finance', 'balance-sheets'],
    queryFn: () => listBalanceSheets(),
  });
  const sheet = sheets.find((s) => s.id === id);

  const { data: balances = [], isLoading: balancesLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'balances'],
    queryFn: () => listBalances(id!),
    enabled: !!id,
  });

  const { data: netWorth, isLoading: netWorthLoading } = useQuery({
    queryKey: ['finance', 'balance-sheets', id, 'net-worth'],
    queryFn: () => getNetWorth(id!),
    enabled: !!id,
  });

  const upsertMutation = useMutation({
    mutationFn: ({ accountId, amount }: { accountId: string; amount: string }) =>
      upsertBalance(id!, accountId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets', id] });
      setEditingBalance(null);
      form.resetFields();
      message.success('Balance updated.');
    },
    onError: () => message.error('Failed to update balance.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteBalance(id!, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets', id] });
      message.success('Balance removed.');
    },
    onError: () => message.error('Failed to remove balance.'),
  });

  const columns: ProColumns<Balance>[] = useMemo(
    () => [
      { title: 'Account', dataIndex: 'account_name', ...widthForHeader('Account') },
      { title: 'Currency', dataIndex: 'currency', ...widthForHeader('Currency') },
      {
        title: 'Amount',
        dataIndex: 'amount',
        ...widthForHeader('Amount', 100),
        render: (val, record) => {
          if (editingBalance?.id === record.id) {
            return (
              <Form
                form={form}
                onFinish={(v) =>
                  upsertMutation.mutate({ accountId: record.account_id, amount: v.amount })
                }
                style={{ margin: 0 }}
              >
                <Form.Item
                  name="amount"
                  style={{ margin: 0 }}
                  rules={[{ required: true, pattern: /^-?\d+(\.\d+)?$/, message: 'Enter a valid number' }]}
                >
                  <Input
                    autoFocus
                    size="small"
                    style={{ width: 140 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditingBalance(null);
                        form.resetFields();
                      }
                    }}
                    suffix={
                      <Button type="link" size="small" htmlType="submit" loading={upsertMutation.isPending}>
                        Save
                      </Button>
                    }
                  />
                </Form.Item>
              </Form>
            );
          }
          return (
            <span>
              {String(val)}&nbsp;
              <Tooltip title="Edit amount">
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingBalance(record);
                    form.setFieldsValue({ amount: record.amount });
                  }}
                />
              </Tooltip>
            </span>
          );
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        ...widthForHeader('Actions'),
        render: (_, record) => (
          <Button size="small" danger onClick={() => deleteMutation.mutate(record.account_id)}>
            Remove
          </Button>
        ),
      },
    ],
    [editingBalance, form, upsertMutation, deleteMutation],
  );

  if (!sheet) return <Spin />;

  return (
    <div>
      <Typography.Title level={4}>
        {dayjs(sheet.date).format('YYYY-MM-DD HH:mm')}
      </Typography.Title>

      {netWorthLoading ? (
        <Spin />
      ) : netWorth && netWorth.per_currency.length > 0 ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {netWorth.per_currency.map((entry) => (
            <Col key={entry.currency} xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title={`Net Worth (${entry.currency})`}
                  value={new Decimal(entry.net_worth).toFixed(2)}
                  prefix={entry.currency}
                />
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}

      <PageTable<Balance>
        pageTitle="Account Balances"
        rowKey="id"
        columns={columns}
        dataSource={balances}
        loading={balancesLoading}
        scroll={{ x: computeScrollX(columns) }}
      />
    </div>
  );
}
