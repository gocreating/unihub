import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Breadcrumb, Button, DatePicker, InputNumber, Tag, message } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, resolveAutoWidths } from '@/components/PageTable';
import type { SizedColumn } from '@/components/PageTable';
import type { Account } from '@/services/unihub-backend/finance';
import {
  createBalanceSheet,
  listAccounts,
  upsertBalance,
} from '@/services/unihub-backend/finance';
import { getCurrencySymbol } from '@/utils/finance';

export function BalanceSheetNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(dayjs());
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['finance', 'accounts', 'as_of', selectedDate?.toISOString()],
    queryFn: () => listAccounts({ as_of: selectedDate!.toISOString() }),
    enabled: !!selectedDate,
  });
  const accounts = useMemo(() => accountsData?.results ?? [], [accountsData]);

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

  const columns: ProColumns<Account>[] = useMemo(() => {
    const defs: SizedColumn<Account>[] = [
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.account' }),
      dataIndex: 'name',
      autoWidth: { header: 'Account' },
    },
    {
      title: t({ id: 'pages.finance.balanceSheets.detail.col.amount' }),
      key: 'amount',
      autoWidth: {
        header: 'Amount',
        min: 160,
        measure: (a: Account) => `${getCurrencySymbol(a.currency)}  00,000.00`,
      },
      render: (_, record) => (
        <InputNumber<string>
          stringMode
          value={amountMap[record.id] ?? null}
          onChange={(val) =>
            setAmountMap((prev) => ({ ...prev, [record.id]: val ?? '' }))
          }
          placeholder="0.00"
          addonBefore={getCurrencySymbol(record.currency)}
          className="amount-input"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t({ id: 'common.currency' }),
      dataIndex: 'currency',
      autoWidth: { header: 'Currency' },
      render: (val) => <Tag>{val as string}</Tag>,
    },
    ];
    return resolveAutoWidths<Account>(defs, accounts) as ProColumns<Account>[];
  }, [t, amountMap, accounts]);

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
