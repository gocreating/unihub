import { useEffect, useState } from 'react';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space } from 'antd';
import { useIntl } from 'react-intl';
import type { Item, ItemParameterWrite, ItemWrite } from '@/services/unihub-backend/inventory';
import { ParameterRowsEditor } from '@/components/ParameterRowsEditor';
import { useContainerWidth } from '@/hooks/useContainerWidth';

interface ItemFormValues {
  name: string;
  quantity: number;
  spec?: string;
  remark?: string;
  url?: string;
  sku_price?: number | null;
  sku_price_currency?: string;
  parameters?: ItemParameterWrite[];
}

interface CurrencyOption {
  value: string;
  label: string;
}

interface ItemFormModalProps {
  open: boolean;
  title: string;
  initial?: Item | null;
  currencyOptions: CurrencyOption[];
  confirmLoading?: boolean;
  onOk: (data: ItemWrite) => void;
  onCancel: () => void;
}

function formValuesToItemWrite(v: ItemFormValues): ItemWrite {
  return {
    name: v.name,
    quantity: v.quantity ?? 1,
    spec: v.spec ?? '',
    remark: v.remark ?? '',
    url: v.url ?? '',
    sku_price: v.sku_price != null ? String(v.sku_price) : null,
    sku_price_currency: v.sku_price_currency ?? '',
    // Incomplete editor rows (no key or no value yet) are simply dropped.
    parameters: (v.parameters ?? []).filter((p) => p.definition_id && p.value !== ''),
  };
}

export function ItemFormModal({
  open,
  title,
  initial,
  currencyOptions,
  confirmLoading,
  onOk,
  onCancel,
}: ItemFormModalProps) {
  const { formatMessage: t } = useIntl();
  const [form] = Form.useForm<ItemFormValues>();
  const [dirty, setDirty] = useState(false);
  // Stack fields into a single column based on the actual content width (not
  // the viewport, which AntD Col xs/sm breakpoints follow).
  const { ref, isNarrow } = useContainerWidth(560);
  const half = isNarrow ? 24 : 12;
  const third = isNarrow ? 24 : 8;
  // First row: Name 12 / Quantity 4 / SKU Price 8 — the currency select clipped at 6.
  const sixth = isNarrow ? 24 : 4;

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        quantity: Number(initial.quantity ?? 1),
        spec: initial.spec,
        remark: initial.remark,
        url: initial.url,
        sku_price: initial.sku_price != null ? Number(initial.sku_price) : null,
        sku_price_currency: initial.sku_price_currency || undefined,
        parameters: (initial.parameters ?? []).map((p) => ({
          definition_id: p.definition_id,
          value: p.value,
          unit: p.unit || undefined,
        })),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ quantity: 1, parameters: [] });
    }
  }, [open, initial, form]);

  // Disable the currency selector when sku_price is empty or zero.
  const skuPrice = Form.useWatch('sku_price', form);
  const currencyDisabled = skuPrice == null || Number(skuPrice) === 0;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      maskClosable={!dirty}
      keyboard={!dirty}
      width={720}
      footer={
        // Constitution Principle VI: Cancel flushed to the LEFT of the footer,
        // primary on the right (AntD's default footer right-aligns the whole
        // group, which is non-compliant).
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button key="cancel" onClick={onCancel}>
            {t({ id: 'common.cancel' })}
          </Button>
          <Button key="ok" type="primary" loading={confirmLoading} onClick={() => form.submit()}>
            {t({ id: 'common.save' })}
          </Button>
        </div>
      }
    >
      <div ref={ref}>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setDirty(true)}
          onFinish={(values) => onOk(formValuesToItemWrite(values))}
        >
          {/* Order (FR-022): Name, quantity, SKU price, spec, URL, remark,
              then the on-demand Parameters editor (FR-026). */}
          <Row gutter={12}>
            <Col span={half}>
              <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={sixth}>
              <Form.Item name="quantity" label={t({ id: 'pages.inventory.items.col.quantity' })} rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={third}>
              <Form.Item label={t({ id: 'pages.inventory.items.col.skuPrice' })}>
                <Space.Compact block>
                  <Form.Item name="sku_price" noStyle>
                    <InputNumber min={0} style={{ width: '60%' }} />
                  </Form.Item>
                  <Form.Item name="sku_price_currency" noStyle>
                    <Select
                      style={{ width: '40%' }}
                      showSearch
                      allowClear
                      disabled={currencyDisabled}
                      placeholder={currencyDisabled ? '-' : 'CUR'}
                      options={currencyOptions}
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="spec" label={t({ id: 'pages.inventory.items.col.spec' })}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="url" label={t({ id: 'pages.inventory.items.col.url' })}>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label={t({ id: 'pages.inventory.items.col.remark' })}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="parameters" label={t({ id: 'pages.inventory.catalog.col.parameters' })}>
            <ParameterRowsEditor />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}
