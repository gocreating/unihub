import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ColorPicker, DatePicker, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { Account } from '@/services/unihub-backend/finance';
import {
  createAccount,
  deleteAccount,
  listAccounts,
  listCurrencies,
  updateAccount,
} from '@/services/unihub-backend/finance';

// 20 preset colors covering the full hue spectrum — Material Design palette.
const ACCOUNT_PRESET_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
  '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800',
  '#ff5722', '#795548', '#9e9e9e', '#607d8b', '#000000',
];

/**
 * Normalize any CSS color representation to a 7-char hex string.
 * Browsers sometimes return computed backgroundColor as rgb() even when the
 * original value was a hex string. This ensures we always store #rrggbb.
 */
function toHexColor(raw?: string): string {
  if (!raw) return '';
  // Already a hex color — return as-is (trimmed to 7 chars)
  if (raw.startsWith('#')) return raw.slice(0, 7);
  // CSS rgb(r,g,b) or rgb(r, g, b) — convert to hex
  const m = raw.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) {
    return '#' + [m[1]!, m[2]!, m[3]!]
      .map((n) => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}


interface AccountFormValues {
  name: string;
  currency: string;
  color: string;
  open_datetime: dayjs.Dayjs;
  close_datetime?: dayjs.Dayjs | null;
}

function formatDateRelative(val: string | null | undefined) {
  if (!val) return null;
  return `${dayjs(val).format('YYYY-MM-DD HH:mm')} (${dayjs(val).fromNow()})`;
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form] = Form.useForm<AccountFormValues>();

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: () => listAccounts(),
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.finance.accounts.loadError' }));
  }, [isError, t]);

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.accounts.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.accounts.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAccount>[1] }) =>
      updateAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.accounts.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.accounts.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) => deleteAccount(id, confirm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      message.success(t({ id: 'pages.finance.accounts.deleted' }));
    },
  });

  const handleDelete = async (account: Account) => {
    try {
      await deleteAccount(account.id, false);
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      message.success(t({ id: 'pages.finance.accounts.deleted' }));
    } catch (err: unknown) {
      const e = err as { body?: { affected_balance_count?: number } };
      if (e?.body?.affected_balance_count !== undefined) {
        const count = e.body.affected_balance_count;
        Modal.confirm({
          title: t({ id: 'pages.finance.accounts.delete.title' }),
          content: t({ id: 'pages.finance.accounts.delete.confirm' }, { count }),
          okText: t({ id: 'pages.finance.accounts.delete.ok' }),
          okType: 'danger',
          onOk: () => deleteMutation.mutate({ id: account.id, confirm: true }),
        });
      } else {
        message.error(t({ id: 'pages.finance.accounts.deleteError' }));
      }
    }
  };

  const openCreate = () => {
    setEditingAccount(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    form.setFieldsValue({
      name: account.name,
      currency: account.currency,
      color: account.color || '',
      open_datetime: account.open_datetime ? dayjs(account.open_datetime) : undefined,
      close_datetime: account.close_datetime ? dayjs(account.close_datetime) : null,
    });
    setModalOpen(true);
  };

  const onFinish = (values: AccountFormValues) => {
    const data = {
      name: values.name,
      currency: values.currency,
      color: toHexColor(values.color),
      open_datetime: values.open_datetime.toISOString(),
      close_datetime: values.close_datetime ? values.close_datetime.toISOString() : null,
    };
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const actionsColWidth = useActionsColWidth(accounts);

  const dataWidths = useMemo(() => {
    const w = { name: 0, currency: 0, open_datetime: 0, close_datetime: 0 };
    for (const a of accounts) {
      w.name = Math.max(w.name, measureTextWidth(a.name));
      w.currency = Math.max(w.currency, measureTextWidth(a.currency));
      w.open_datetime = Math.max(w.open_datetime, measureTextWidth(formatDateRelative(a.open_datetime)));
      w.close_datetime = Math.max(w.close_datetime, measureTextWidth(formatDateRelative(a.close_datetime)));
    }
    return w;
  }, [accounts]);

  const columns: ProColumns<Account>[] = useMemo(
    () => [
      { title: t({ id: 'common.name' }), dataIndex: 'name', ...widthForHeader('Name', dataWidths.name), sorter: true },
      { title: t({ id: 'common.currency' }), dataIndex: 'currency', ...widthForHeader('Currency', dataWidths.currency), sorter: true, render: (val) => <Tag>{val as string}</Tag> },
      {
        title: t({ id: 'pages.finance.accounts.col.color' }),
        dataIndex: 'color',
        width: 72,
        render: (_dom, record) => record.color
          ? <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: '50%', background: record.color, border: '1px solid rgba(0,0,0,0.12)', verticalAlign: 'middle' }} />
          : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
      },
      {
        title: t({ id: 'pages.finance.accounts.col.openDatetime' }),
        dataIndex: 'open_datetime',
        ...widthForHeader('Open Date', Math.max(220, dataWidths.open_datetime)),
        sorter: true,
        render: (_, record) => {
          const formatted = formatDateRelative(record.open_datetime);
          return formatted
            ? <Tooltip title={dayjs(record.open_datetime!).format('YYYY-MM-DD HH:mm:ss')}>{formatted}</Tooltip>
            : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;
        },
      },
      {
        title: t({ id: 'pages.finance.accounts.col.closeDatetime' }),
        dataIndex: 'close_datetime',
        ...widthForHeader('Close Date', Math.max(220, dataWidths.close_datetime)),
        sorter: true,
        render: (_, record) => {
          const formatted = formatDateRelative(record.close_datetime);
          return formatted
            ? <Tooltip title={dayjs(record.close_datetime!).format('YYYY-MM-DD HH:mm:ss')}>{formatted}</Tooltip>
            : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>;
        },
      },
      {
        title: t({ id: 'common.actions' }),
        key: 'actions',
        width: actionsColWidth,
        render: (_, record) => (
          <span data-actions-col>
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              {t({ id: 'common.edit' })}
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
              {t({ id: 'common.delete' })}
            </Button>
          </Space>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth],
  );

  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }));

  return (
    <>
      <PageTable<Account>
        pageTitle={t({ id: 'pages.finance.accounts.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.accounts.new' })}
          </Button>
        }
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={editingAccount ? t({ id: 'pages.finance.accounts.edit' }) : t({ id: 'pages.finance.accounts.new' })}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="currency" label={t({ id: 'common.currency' })} rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder={t({ id: 'pages.finance.accounts.form.currencyPlaceholder' })}
              optionFilterProp="label"
              options={currencyOptions}
            />
          </Form.Item>
          <Form.Item
            name="color"
            label={t({ id: 'pages.finance.accounts.form.color' })}
            // ColorPicker.onChange(color, hex) — extract hex string
            getValueFromEvent={(_color: unknown, hex: string) => hex ?? ''}
          >
            <ColorPicker
              format="hex"
              allowClear
              showText
              presets={[{
                label: t({ id: 'pages.finance.accounts.form.color' }),
                colors: ACCOUNT_PRESET_COLORS,
              }]}
              // Show only the preset swatches — hides the gradient + sliders panel.
              // This keeps the popup compact so it fits inside the modal.
              panelRender={(_panel, { components: { Presets } }) => <Presets />}
              // Mount the popup inside the modal so it can't overflow the page.
              getPopupContainer={(trigger) =>
                (trigger.closest('.ant-modal-content') as HTMLElement) ?? document.body
              }
            />
          </Form.Item>
          <Form.Item name="open_datetime" label={t({ id: 'pages.finance.accounts.form.openDatetime' })} rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="close_datetime" label={t({ id: 'pages.finance.accounts.form.closeDatetime' })}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
