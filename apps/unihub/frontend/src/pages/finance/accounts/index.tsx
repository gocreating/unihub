import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ColorPicker, DatePicker, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { EmptyValue } from '@/components/EmptyValue';
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
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

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

  // Localized attrs/defs must come before hooks that consume them.
  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
    { key: 'currency', label: t({ id: 'common.currency' }), dataType: 'single_select' },
    { key: 'color', label: t({ id: 'pages.finance.accounts.col.color' }), dataType: 'text' },
    { key: 'open_datetime', label: t({ id: 'pages.finance.accounts.col.openDatetime' }), dataType: 'date' },
    { key: 'close_datetime', label: t({ id: 'pages.finance.accounts.col.closeDatetime' }), dataType: 'date' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 0 },
    { key: 'currency', label: t({ id: 'common.currency' }), dataType: 'single_select', visible: true, order: 1 },
    { key: 'color', label: t({ id: 'pages.finance.accounts.col.color' }), dataType: 'text', visible: true, order: 2 },
    { key: 'open_datetime', label: t({ id: 'pages.finance.accounts.col.openDatetime' }), dataType: 'date', visible: true, order: 3 },
    { key: 'close_datetime', label: t({ id: 'pages.finance.accounts.col.closeDatetime' }), dataType: 'date', visible: true, order: 4 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 5 },
  ], [t]);

  // ── Entity operations — single standardized hook ─────────────────────
  const table = useEntityTable({ key: 'accounts', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data: accountsData, isLoading, isError } = useQuery({
    queryKey: ['finance', 'accounts', table.queryParams],
    queryFn: () => listAccounts(table.queryParams),
  });
  const accounts = useMemo(() => accountsData?.results ?? [], [accountsData]);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencies = currenciesData?.results ?? [];

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

  // All column definitions keyed by column key. Derived order comes from cols.visibleColumns.
  // Depends on sort.sortOrderForField so sort highlighting updates when active rules change.
  const colDefMap = useMemo<Record<string, ProColumns<Account>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key ? cols.lastColumnFixed
          : undefined;
      return {
      name: {
        dataIndex: 'name',
        ...widthForHeader('Name', dataWidths.name),
        fixed: getFixed('name'),
        ...makeSortProps('name', t({ id: 'common.name' }), sort),
      },
      currency: {
        dataIndex: 'currency',
        ...widthForHeader('Currency', dataWidths.currency),
        fixed: getFixed('currency'),
        render: (val) => <Tag>{val as string}</Tag>,
        ...makeSortProps('currency', t({ id: 'common.currency' }), sort),
      },
      color: {
        dataIndex: 'color',
        width: 72,
        fixed: getFixed('color'),
        render: (_dom, record) =>
          record.color ? (
            <span
              style={{
                display: 'inline-block',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: record.color,
                border: '1px solid rgba(0,0,0,0.12)',
                verticalAlign: 'middle',
              }}
            />
          ) : (
            <EmptyValue />
          ),
        ...makeSortProps('color', t({ id: 'pages.finance.accounts.col.color' }), sort),
      },
      open_datetime: {
        dataIndex: 'open_datetime',
        ...widthForHeader('Open Date', Math.max(220, dataWidths.open_datetime)),
        fixed: getFixed('open_datetime'),
        ...makeSortProps('open_datetime', t({ id: 'pages.finance.accounts.col.openDatetime' }), sort),
        render: (_, record) => {
          const formatted = formatDateRelative(record.open_datetime);
          return formatted ?? <EmptyValue />;
        },
      },
      close_datetime: {
        dataIndex: 'close_datetime',
        ...widthForHeader('Close Date', Math.max(220, dataWidths.close_datetime)),
        fixed: getFixed('close_datetime'),
        ...makeSortProps('close_datetime', t({ id: 'pages.finance.accounts.col.closeDatetime' }), sort),
        render: (_, record) => {
          const formatted = formatDateRelative(record.close_datetime);
          return formatted ?? <EmptyValue />;
        },
      },
      actions: {
        title: t({ id: 'common.actions' }),
        key: 'actions',
        width: actionsColWidth,
        fixed: getFixed('actions'),
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
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns],
  );

  // Column array derived from the visible column order — this is what makes reordering work.
  const columns = useMemo<ProColumns<Account>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<Account> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }));

  return (
    <>
      <PageTable<Account>
        key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.finance.accounts.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.accounts.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: filter }}
            sortProps={{ attrs: filterableAttrs, hook: sort }}
            columnProps={{ hook: cols }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(accountsData?.count)} />}
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
            // ColorPicker.onChange(color, hex) — extract hex string for Form.Item storage.
            getValueFromEvent={(_color: unknown, hex: string) => hex ?? ''}
          >
            <ColorPicker
              format="hex"
              allowClear
              showText
              // Open upward so the picker never overflows the modal's bottom edge.
              placement="topLeft"
              presets={[{
                label: t({ id: 'pages.finance.accounts.form.color' }),
                colors: ACCOUNT_PRESET_COLORS,
              }]}
              // Constrain popup to the modal so it can't escape outside the page.
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
