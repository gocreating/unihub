import { useEffect, useState } from 'react';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space } from 'antd';
import { useIntl } from 'react-intl';
import type { Item, ItemWrite, Measurement } from '@/services/unihub-backend/inventory';
import { LENGTH_UNITS, VOLUME_UNITS, WEIGHT_UNITS } from '@/services/unihub-backend/inventory';
import { useContainerWidth } from '@/hooks/useContainerWidth';

interface ItemFormValues {
  name: string;
  quantity: number;
  spec?: string;
  remark?: string;
  size?: string;
  color?: string;
  url?: string;
  sku_price?: number | null;
  sku_price_currency?: string;
  length_value?: number | null;
  length_unit: string;
  width_value?: number | null;
  width_unit: string;
  height_value?: number | null;
  height_unit: string;
  weight_value?: number | null;
  weight_unit: string;
  volume_value?: number | null;
  volume_unit: string;
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

function measure(value?: number | null, unit?: string): Measurement | null {
  if (value === undefined || value === null) return null;
  return { value: String(value), unit: unit ?? '' };
}

function toMeasureValue(m: Measurement | null | undefined): number | null {
  return m ? Number(m.value) : null;
}

function formValuesToItemWrite(v: ItemFormValues): ItemWrite {
  return {
    name: v.name,
    quantity: v.quantity ?? 1,
    spec: v.spec ?? '',
    remark: v.remark ?? '',
    size: v.size ?? '',
    color: v.color ?? '',
    url: v.url ?? '',
    sku_price: v.sku_price != null ? String(v.sku_price) : null,
    sku_price_currency: v.sku_price_currency ?? '',
    length: measure(v.length_value, v.length_unit),
    width: measure(v.width_value, v.width_unit),
    height: measure(v.height_value, v.height_unit),
    weight: measure(v.weight_value, v.weight_unit),
    volume: measure(v.volume_value, v.volume_unit),
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
  const quarter = isNarrow ? 24 : 6;

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        quantity: Number(initial.quantity ?? 1),
        spec: initial.spec,
        remark: initial.remark,
        size: initial.size,
        color: initial.color,
        url: initial.url,
        sku_price: initial.sku_price != null ? Number(initial.sku_price) : null,
        sku_price_currency: initial.sku_price_currency || undefined,
        length_value: toMeasureValue(initial.length),
        length_unit: initial.length?.unit ?? 'mm',
        width_value: toMeasureValue(initial.width),
        width_unit: initial.width?.unit ?? 'mm',
        height_value: toMeasureValue(initial.height),
        height_unit: initial.height?.unit ?? 'mm',
        weight_value: toMeasureValue(initial.weight),
        weight_unit: initial.weight?.unit ?? 'g',
        volume_value: toMeasureValue(initial.volume),
        volume_unit: initial.volume?.unit ?? 'mL',
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        quantity: 1,
        length_unit: 'mm',
        width_unit: 'mm',
        height_unit: 'mm',
        weight_unit: 'g',
        volume_unit: 'mL',
      });
    }
  }, [open, initial, form]);

  // Disable the currency selector when sku_price is empty or zero.
  const skuPrice = Form.useWatch('sku_price', form);
  const currencyDisabled = skuPrice == null || Number(skuPrice) === 0;

  const lengthUnitOptions = LENGTH_UNITS.map((u) => ({ value: u, label: u }));
  const weightUnitOptions = WEIGHT_UNITS.map((u) => ({ value: u, label: u }));
  const volumeUnitOptions = VOLUME_UNITS.map((u) => ({ value: u, label: u }));

  const measureField = (
    name: 'length' | 'width' | 'height' | 'weight' | 'volume',
    label: string,
    unitOptions: { value: string; label: string }[],
    span: number = third,
  ) => (
    <Col span={span}>
      <Form.Item label={label}>
        <Space.Compact block>
          <Form.Item name={`${name}_value`} noStyle>
            <InputNumber min={0} style={{ width: '65%' }} />
          </Form.Item>
          <Form.Item name={`${name}_unit`} noStyle>
            <Select style={{ width: '35%' }} options={unitOptions} />
          </Form.Item>
        </Space.Compact>
      </Form.Item>
    </Col>
  );

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
          {/* Order (Principle VI grid): Name, quantity, SKU price, spec, URL,
              remark, color, size, weight, length, width, height, volume. */}
          <Row gutter={12}>
            <Col span={half}>
              <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={quarter}>
              <Form.Item name="quantity" label={t({ id: 'pages.inventory.items.col.quantity' })} rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={quarter}>
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
                      placeholder={currencyDisabled ? '—' : 'CUR'}
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
          <Row gutter={12}>
            <Col span={half}>
              <Form.Item name="color" label={t({ id: 'pages.inventory.items.col.color' })}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={half}>
              <Form.Item name="size" label={t({ id: 'pages.inventory.items.col.size' })}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            {measureField('weight', t({ id: 'pages.inventory.items.col.weight' }), weightUnitOptions)}
            {measureField('length', t({ id: 'pages.inventory.items.col.length' }), lengthUnitOptions)}
            {measureField('width', t({ id: 'pages.inventory.items.col.width' }), lengthUnitOptions)}
          </Row>
          <Row gutter={12}>
            {measureField('height', t({ id: 'pages.inventory.items.col.height' }), lengthUnitOptions, half)}
            {measureField('volume', t({ id: 'pages.inventory.items.col.volume' }), volumeUnitOptions, half)}
          </Row>
        </Form>
      </div>
    </Modal>
  );
}
