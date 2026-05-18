import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DatePicker, Input, Space, Typography, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import type { Account } from '@/services/unihub-backend/finance';
import {
  createBalanceSheet,
  listAccounts,
  upsertBalance,
} from '@/services/unihub-backend/finance';

export function BalanceSheetNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['finance', 'accounts', 'as_of', selectedDate?.toISOString()],
    queryFn: () => listAccounts({ as_of: selectedDate!.toISOString() }),
    enabled: !!selectedDate,
  });

  const createMutation = useMutation({ mutationFn: createBalanceSheet });

  const handleSubmit = async () => {
    if (!selectedDate) {
      message.error(t({ id: 'pages.finance.balanceSheets.form.dateTime' }));
      return;
    }
    setSubmitting(true);
    try {
      const sheet = await createMutation.mutateAsync({ date: selectedDate.toISOString() });
      const entries = Object.entries(amountMap).filter(([, v]) => v.trim() !== '');
      await Promise.all(
        entries.map(([accountId, amount]) => upsertBalance(sheet.id, accountId, amount)),
      );
      queryClient.invalidateQueries({ queryKey: ['finance', 'balance-sheets'] });
      message.success(t({ id: 'pages.finance.balanceSheets.created' }));
      navigate(`/finance/balance-sheets/${sheet.id}`);
    } catch {
      message.error(t({ id: 'pages.finance.balanceSheets.createError' }));
      setSubmitting(false);
    }
  };

  const columns: ProColumns<Account>[] = [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }),
      dataIndex: 'name',
      ...widthForHeader('Account'),
    },
    {
      title: t({ id: 'common.currency' }),
      dataIndex: 'currency',
      ...widthForHeader('Currency'),
    },
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.amount' }),
      key: 'amount',
      ...widthForHeader('Amount', 160),
      render: (_, record) => (
        <Input
          value={amountMap[record.id] ?? ''}
          onChange={(e) =>
            setAmountMap((prev) => ({ ...prev, [record.id]: e.target.value }))
          }
          placeholder="0.00"
          style={{ width: 140 }}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/finance/balance-sheets')}>
          {t({ id: 'pages.finance.balanceSheets.detail.back' })}
        </Button>
      </div>

      <Typography.Title level={4}>
        {t({ id: 'pages.finance.balanceSheets.new' })}
      </Typography.Title>

      <PageTable<Account>
        pageTitle={
          <Space>
            <DatePicker
              showTime
              value={selectedDate}
              onChange={setSelectedDate}
              placeholder={t({ id: 'pages.finance.balanceSheets.form.dateTime' })}
            />
            {!selectedDate && (
              <Typography.Text type="secondary">
                {t({ id: 'pages.finance.balanceSheets.new.datePrompt' })}
              </Typography.Text>
            )}
          </Space>
        }
        action={
          <Button
            type="primary"
            loading={submitting}
            disabled={!selectedDate}
            onClick={handleSubmit}
          >
            {t({ id: 'pages.finance.balanceSheets.new.submit' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        loading={accountsLoading}
        scroll={{ x: computeScrollX(columns) }}
      />
    </div>
  );
}
