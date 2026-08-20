/**
 * Create/edit modal for a Transaction and its transfers (FR-045).
 *
 * Extracted from the detail page and rebuilt around three fixes:
 *
 *  1. **Constitution footer** — AntD right-aligns the whole button group;
 *     Principle VI puts the primary action right and everything else left.
 *  2. **Two tabs, General and Transfers** — the transfer list is unbounded, so
 *     stacking it under the transaction fields made a modal that scrolled the
 *     one part the user was reading out of view.
 *  3. **Transfers are a TABLE, not a row of free-floating controls** — the old
 *     `Space` layout laid four fixed-width inputs side by side and overflowed
 *     the modal as soon as a name was long. A table gives each field a column
 *     that owns its width, and one horizontal scroll container instead of
 *     content spilling past the dialog edge.
 *
 * FR-037: a transfer is EITHER a currency leg or an asset leg, never both, so
 * the row's first control picks the leg and the amount column swaps with it.
 * Sending both is rejected by a database constraint — the form must not be
 * able to compose that payload at all.
 */
import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Table, Tabs, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { FormListFieldData } from 'antd';
import { useIntl } from 'react-intl';
import dayjs from 'dayjs';
import type { Asset, Currency, Transaction } from '@/services/unihub-backend/finance';

export interface TransferFormRow {
  /** FR-037: a transfer records EITHER cash or a position, never both. */
  leg?: 'currency' | 'asset';
  currency?: string;
  currency_amount?: string;
  asset?: string;
  asset_change_amount?: string;
  pnl_change?: string;
}

export interface TransactionFormValues {
  timestamp: dayjs.Dayjs;
  description?: string;
  chain_id?: string;
  tx_hash?: string;
  transfers: TransferFormRow[];
}

export interface TransactionFormModalProps {
  open: boolean;
  /** null = create mode. */
  editing: Transaction | null;
  assets: readonly Asset[];
  currencies: readonly Currency[];
  baseCurrency: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: TransactionFormValues) => void;
}

export function TransactionFormModal({
  open,
  editing,
  assets,
  currencies,
  baseCurrency,
  submitting,
  onCancel,
  onSubmit,
}: TransactionFormModalProps) {
  const { formatMessage: t } = useIntl();
  const [form] = Form.useForm<TransactionFormValues>();
  const [tab, setTab] = useState('general');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('general');
    setDirty(false);
    if (editing) {
      form.setFieldsValue({
        timestamp: dayjs(editing.timestamp),
        description: editing.description,
        chain_id: editing.chain_id,
        tx_hash: editing.tx_hash,
        transfers: editing.transfers.map((tr) => ({
          leg: tr.currency ? ('currency' as const) : ('asset' as const),
          currency: tr.currency ?? undefined,
          currency_amount: tr.currency_amount ?? undefined,
          asset: tr.asset ?? undefined,
          asset_change_amount: tr.asset_change_amount ?? undefined,
          pnl_change: tr.pnl_change ?? undefined,
        })),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ transfers: [{ leg: 'asset' }] });
    }
  }, [open, editing, form]);

  /**
   * The transfers table. `Form.List` supplies the rows; each column renders the
   * `Form.Item` for its own field, so a row can never be wider than the table.
   */
  const transferColumns = (remove: (name: number) => void) => [
    {
      title: t({ id: 'pages.finance.transactions.form.leg' }),
      dataIndex: 'leg',
      width: 120,
      render: (_: unknown, field: FormListFieldData) => (
        <Form.Item name={[field.name, 'leg']} style={{ marginBottom: 0 }} initialValue="asset">
          <Select
            options={[
              { value: 'asset', label: t({ id: 'pages.finance.transactions.form.legAsset' }) },
              { value: 'currency', label: t({ id: 'pages.finance.transactions.form.legCurrency' }) },
            ]}
          />
        </Form.Item>
      ),
    },
    {
      title: t({ id: 'pages.finance.transactions.form.subject' }),
      dataIndex: 'subject',
      width: 200,
      render: (_: unknown, field: FormListFieldData) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) =>
            getFieldValue(['transfers', field.name, 'leg']) === 'currency' ? (
              <Form.Item name={[field.name, 'currency']} style={{ marginBottom: 0 }} rules={[{ required: true }]}>
                <Select
                  placeholder={t({ id: 'pages.finance.transactions.form.currencyPlaceholder' })}
                  showSearch
                  optionFilterProp="label"
                  options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                />
              </Form.Item>
            ) : (
              <Form.Item name={[field.name, 'asset']} style={{ marginBottom: 0 }} rules={[{ required: true }]}>
                <Select
                  placeholder={t({ id: 'pages.finance.transactions.form.assetPlaceholder' })}
                  showSearch
                  optionFilterProp="label"
                  options={assets.map((a) => ({ value: a.id, label: a.name }))}
                />
              </Form.Item>
            )
          }
        </Form.Item>
      ),
    },
    {
      title: t({ id: 'pages.finance.transactions.form.amount' }),
      dataIndex: 'amount',
      width: 180,
      render: (_: unknown, field: FormListFieldData) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const isCurrency = getFieldValue(['transfers', field.name, 'leg']) === 'currency';
            return (
              <Form.Item
                name={[field.name, isCurrency ? 'currency_amount' : 'asset_change_amount']}
                style={{ marginBottom: 0 }}
                rules={[{ required: true }]}
              >
                {/* stringMode with no `step`: typed values keep full 18dp precision (FR-008c) */}
                <InputNumber style={{ width: '100%' }} stringMode />
              </Form.Item>
            );
          }}
        </Form.Item>
      ),
    },
    {
      title: t({ id: 'pages.finance.transactions.form.pnlChange' }, { currency: baseCurrency }),
      dataIndex: 'pnl_change',
      width: 180,
      render: (_: unknown, field: FormListFieldData) => (
        <Form.Item name={[field.name, 'pnl_change']} style={{ marginBottom: 0 }}>
          <InputNumber
            style={{ width: '100%' }}
            stringMode
            placeholder={t({ id: 'pages.finance.transactions.form.pnlChangePlaceholder' })}
          />
        </Form.Item>
      ),
    },
    {
      title: '',
      dataIndex: 'remove',
      width: 48,
      render: (_: unknown, field: FormListFieldData) => (
        <Button
          type="text"
          icon={<DeleteOutlined />}
          aria-label={t({ id: 'pages.finance.transactions.form.removeTransfer' })}
          onClick={() => remove(field.name)}
        />
      ),
    },
  ];

  return (
    <Modal
      title={
        editing
          ? t({ id: 'pages.finance.transactions.edit' })
          : t({ id: 'pages.finance.transactions.new' })
      }
      open={open}
      width={840}
      onCancel={onCancel}
      maskClosable={!dirty}
      keyboard={!dirty}
      destroyOnClose
      footer={
        // Constitution Principle VI: primary right, everything else grouped
        // left with Cancel left-most. AntD's default right-aligns the group.
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={onCancel}>{t({ id: 'common.cancel' })}</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            {t({ id: 'common.save' })}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        onValuesChange={() => setDirty(true)}
        preserve={false}
        // A validation error on the Transfers tab is invisible from General —
        // jump to the tab that owns the first failing field.
        onFinishFailed={({ errorFields }) => {
          if (errorFields.some((f) => f.name[0] === 'transfers')) setTab('transfers');
        }}
      >
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'general',
              label: t({ id: 'pages.finance.transactions.form.tabGeneral' }),
              forceRender: true,
              children: (
                <>
                  <Form.Item
                    name="timestamp"
                    label={t({ id: 'pages.finance.transactions.form.timestamp' })}
                    rules={[{ required: true }]}
                  >
                    <DatePicker showTime style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name="description"
                    label={t({ id: 'pages.finance.transactions.form.description' })}
                  >
                    <Input placeholder={t({ id: 'pages.finance.transactions.form.descriptionPlaceholder' })} />
                  </Form.Item>
                  <Form.Item name="chain_id" label={t({ id: 'pages.finance.transactions.form.chainId' })}>
                    <Input
                      placeholder={t({ id: 'pages.finance.transactions.form.chainIdPlaceholder' })}
                      maxLength={32}
                    />
                  </Form.Item>
                  <Form.Item name="tx_hash" label={t({ id: 'pages.finance.transactions.form.txHash' })}>
                    <Input
                      placeholder={t({ id: 'pages.finance.transactions.form.txHashPlaceholder' })}
                      maxLength={128}
                    />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'transfers',
              label: t({ id: 'pages.finance.transactions.form.tabTransfers' }),
              forceRender: true,
              children: (
                <Form.List
                  name="transfers"
                  rules={[
                    {
                      validator: async (_, v) => {
                        if (!v || v.length === 0) {
                          throw new Error(t({ id: 'pages.finance.transactions.form.atLeastOneTransfer' }));
                        }
                      },
                    },
                  ]}
                >
                  {(fields, { add, remove }, { errors }) => (
                    <>
                      <Table<FormListFieldData>
                        size="small"
                        rowKey="key"
                        dataSource={fields}
                        columns={transferColumns(remove)}
                        pagination={false}
                        // The one scroll container: rows scroll INSIDE the
                        // table rather than overflowing the dialog (FR-045).
                        scroll={{ x: 728 }}
                        locale={{
                          emptyText: (
                            <Typography.Text type="secondary">
                              {t({ id: 'pages.finance.transactions.form.noTransfers' })}
                            </Typography.Text>
                          ),
                        }}
                      />
                      <Form.ErrorList errors={errors} />
                      {/* FR-045: a text/link button, not a dashed block. */}
                      <Button
                        type="link"
                        onClick={() => add({ leg: 'asset' })}
                        icon={<PlusOutlined />}
                        style={{ paddingLeft: 0, marginTop: 8 }}
                      >
                        {t({ id: 'pages.finance.transactions.form.addTransfer' })}
                      </Button>
                    </>
                  )}
                </Form.List>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
