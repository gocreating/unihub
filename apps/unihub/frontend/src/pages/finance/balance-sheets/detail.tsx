import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Collapse, Form, Input, Row, Spin, Statistic, Tag, Tooltip, Typography, message } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { Column } from '@ant-design/plots';
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

  // Breakdown chart data: assets / liabilities / equity per currency
  const breakdownData = useMemo(() => {
    const map: Record<string, Record<string, Decimal>> = {};
    for (const b of balances) {
      const cur = b.currency;
      const type = b.account_type as string;
      if (!map[cur]) map[cur] = {};
      map[cur][type] = (map[cur][type] ?? new Decimal(0)).add(new Decimal(b.amount));
    }
    const rows: { currency: string; type: string; amount: number }[] = [];
    for (const [cur, types] of Object.entries(map)) {
      for (const [type, total] of Object.entries(types)) {
        rows.push({ currency: cur, type: type.toUpperCase(), amount: total.toNumber() });
      }
    }
    return rows;
  }, [balances]);

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
      {
        title: 'Type',
        dataIndex: 'account_type',
        ...widthForHeader('Type'),
        render: (val) => <Tag>{String(val).toUpperCase()}</Tag>,
      },
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
                  rules={[{ required: true, pattern: /^\d+(\.\d+)?$/, message: 'Enter a valid number' }]}
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
        {sheet.label || sheet.date} — {sheet.base_currency}
      </Typography.Title>

      {netWorthLoading ? (
        <Spin />
      ) : netWorth ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {netWorth.per_currency.map((entry) => (
            <Col key={entry.currency} xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title={`Net Worth (${entry.currency})`}
                  value={new Decimal(entry.net_worth).toFixed(2)}
                  prefix={entry.currency}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  Assets: {entry.total_assets} · Liabilities: {entry.total_liabilities}
                </div>
              </Card>
            </Col>
          ))}
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card size="small" style={{ borderColor: '#1890ff' }}>
              <Statistic
                title={`Total (${netWorth.base_currency})`}
                value={new Decimal(netWorth.base_currency_total.net_worth).toFixed(2)}
                prefix={netWorth.base_currency}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          {netWorth.base_currency_total.missing_rates.map((mr) => (
            <Col key={mr.currency} xs={24}>
              <Alert type="warning" showIcon message={mr.message} />
            </Col>
          ))}
        </Row>
      ) : null}

      {breakdownData.length > 0 && (
        <Collapse
          ghost
          style={{ marginBottom: 24 }}
          items={[{
            key: 'breakdown',
            label: 'Account Type Breakdown',
            children: (
              <Column
                data={breakdownData}
                xField="currency"
                yField="amount"
                colorField="type"
                stack
                height={220}
                legend={{ position: 'top' }}
              />
            ),
          }]}
        />
      )}

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
