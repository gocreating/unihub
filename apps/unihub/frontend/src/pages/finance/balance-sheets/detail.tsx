import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Form, Input, Modal, Row, Select, Spin, Statistic, Tooltip, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import Decimal from 'decimal.js';
import { useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { Balance } from '@/services/unihub-backend/finance';
import {
  deleteBalance,
  getNetWorth,
  listAccounts,
  listBalances,
  listBalanceSheets,
  upsertBalance,
} from '@/services/unihub-backend/finance';

interface EditAmountFormValues {
  amount: string;
}

interface AddBalanceFormValues {
  account_id: string;
  amount: string;
}

export function BalanceSheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [editingBalance, setEditingBalance] = useState<Balance | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form] = Form.useForm<EditAmountFormValues>();
  const [addForm] = Form.useForm<AddBalanceFormValues>();

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

  const { data: availableAccounts = [] } = useQuery({
    queryKey: ['finance', 'accounts', 'as_of', sheet?.date],
    queryFn: () => listAccounts({ as_of: sheet!.date }),
    enabled: !!sheet && addModalOpen,
  });

  const upsertMutation = useMutation({
    mutationFn: ({ accountId, amount }: { accountId: string; amount: string }) =>
      upsertBalance(id!, accountId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets', id] });
      setEditingBalance(null);
      form.resetFields();
      message.success(t({ id: 'pages.finance.balanceSheets.detail.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.balanceSheets.detail.updateError' })),
  });

  const addMutation = useMutation({
    mutationFn: ({ accountId, amount }: { accountId: string; amount: string }) =>
      upsertBalance(id!, accountId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets', id] });
      setAddModalOpen(false);
      addForm.resetFields();
      message.success(t({ id: 'pages.finance.balanceSheets.detail.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.balanceSheets.detail.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteBalance(id!, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets', id] });
      message.success(t({ id: 'pages.finance.balanceSheets.detail.removed' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.balanceSheets.detail.removeError' })),
  });

  const columns: ProColumns<Balance>[] = useMemo(
    () => [
      { title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }), dataIndex: 'account_name', ...widthForHeader('Account') },
      { title: t({ id: 'common.currency' }), dataIndex: 'currency', ...widthForHeader('Currency') },
      {
        title: t({ id: 'pages.finance.balanceSheets.detail.col.amount' }),
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
                  rules={[{ required: true, pattern: /^-?\d+(\.\d+)?$/, message: t({ id: 'pages.finance.balanceSheets.detail.amountRequired' }) }]}
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
                        {t({ id: 'common.save' })}
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
              <Tooltip title={t({ id: 'pages.finance.balanceSheets.detail.editAmount' })}>
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
        title: t({ id: 'common.actions' }),
        key: 'actions',
        ...widthForHeader('Actions'),
        render: (_, record) => (
          <Button size="small" danger onClick={() => deleteMutation.mutate(record.account_id)}>
            {t({ id: 'common.remove' })}
          </Button>
        ),
      },
    ],
    [editingBalance, form, upsertMutation, deleteMutation, t],
  );

  if (!sheet) return <Spin />;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/finance/balance-sheets')}>
          {t({ id: 'pages.finance.balanceSheets.detail.back' })}
        </Button>
      </div>

      <Typography.Title level={4}>
        {dayjs(sheet.date).format('YYYY-MM-DD HH:mm')} ({dayjs(sheet.date).fromNow()})
      </Typography.Title>

      {netWorthLoading ? (
        <Spin />
      ) : netWorth && netWorth.per_currency.length > 0 ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {netWorth.per_currency.map((entry) => (
            <Col key={entry.currency} xs={24} sm={12} md={8} lg={6}>
              <Card size="small">
                <Statistic
                  title={t({ id: 'pages.finance.balanceSheets.detail.netWorth' }, { currency: entry.currency })}
                  value={new Decimal(entry.net_worth).toFixed(2)}
                  prefix={entry.currency}
                />
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}

      <PageTable<Balance>
        pageTitle={t({ id: 'pages.finance.balanceSheets.detail.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            {t({ id: 'pages.finance.balanceSheets.detail.addBalance' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={balances}
        loading={balancesLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={t({ id: 'pages.finance.balanceSheets.detail.addBalance' })}
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        onOk={() => addForm.submit()}
        confirmLoading={addMutation.isPending}
      >
        <Form
          form={addForm}
          layout="vertical"
          onFinish={(v) => addMutation.mutate({ accountId: v.account_id, amount: v.amount })}
        >
          <Form.Item
            name="account_id"
            label={t({ id: 'pages.finance.balanceSheets.detail.col.account' })}
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              placeholder={t({ id: 'pages.finance.balanceSheets.detail.selectAccount' })}
              optionFilterProp="label"
              options={availableAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} (${a.currency})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t({ id: 'pages.finance.balanceSheets.detail.col.amount' })}
            rules={[
              { required: true },
              { pattern: /^-?\d+(\.\d+)?$/, message: t({ id: 'pages.finance.balanceSheets.detail.amountRequired' }) },
            ]}
          >
            <Input placeholder="e.g. 5000.00" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
