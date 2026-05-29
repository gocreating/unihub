import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Breadcrumb, Button, DatePicker, Input, Tag, message } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, widthForHeader } from '@/components/PageTable';
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
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['finance', 'accounts', 'as_of', selectedDate?.toISOString()],
    queryFn: () => listAccounts({ as_of: selectedDate!.toISOString() }),
    enabled: !!selectedDate,
  });

  const createMutation = useMutation({ mutationFn: createBalanceSheet });

  const handleSubmit = async () => {
    if (!selectedDate) return;
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

  const dataWidths = useMemo(() => {
    const w = { name: 0, currency: 0 };
    for (const a of accounts) {
      w.name = Math.max(w.name, measureTextWidth(a.name));
      w.currency = Math.max(w.currency, measureTextWidth(a.currency));
    }
    return w;
  }, [accounts]);

  const columns: ProColumns<Account>[] = useMemo(() => [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }),
      dataIndex: 'name',
      ...widthForHeader('Account', dataWidths.name),
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
    {
      title: t({ id: 'common.currency' }),
      dataIndex: 'currency',
      ...widthForHeader('Currency', dataWidths.currency),
      render: (val) => <Tag>{val as string}</Tag>,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, dataWidths]);

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: t({ id: 'pages.finance.balanceSheets.title' }),
            href: '/finance/balance-sheets',
            onClick: (e) => { e.preventDefault(); navigate('/finance/balance-sheets'); },
          },
          { title: t({ id: 'pages.finance.balanceSheets.new' }) },
        ]}
      />

      <PageTable<Account>
        pageTitle={
          <DatePicker
            showTime
            value={selectedDate}
            onChange={setSelectedDate}
            placeholder={t({ id: 'pages.finance.balanceSheets.form.dateTime' })}
          />
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
