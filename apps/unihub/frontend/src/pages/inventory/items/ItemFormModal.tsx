import { useEffect } from 'react';
import { Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useIntl } from 'react-intl';
import type {
  Item,
  ItemStatus,
  ItemType,
  ItemWrite,
  Measurement,
} from '@/services/unihub-backend/inventory';
import { LENGTH_UNITS, WEIGHT_UNITS } from '@/services/unihub-backend/inventory';

export interface ItemFormValues {
  name: string;
  item_type: ItemType;
  status: ItemStatus;
  model?: string;
  serial_number?: string;
  spec?: string;
  remark?: string;
  size?: string;
  color?: string;
  url?: string;
  quantity?: number | null;
  price?: number | null;
  price_currency?: string;
  cost?: number | null;
  cost_currency?: string;
  length_value?: number | null;
  length_unit: string;
  width_value?: number | null;
  width_unit: string;
  height_value?: number | null;
  height_unit: string;
  weight_value?: number | null;
  weight_unit: string;
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
    item_type: v.item_type,
    status: v.status,
    model: v.model ?? '',
    serial_number: v.serial_number ?? '',
    spec: v.spec ?? '',
    remark: v.remark ?? '',
    size: v.size ?? '',
    color: v.color ?? '',
    url: v.url ?? '',
    quantity: v.quantity != null ? String(v.quantity) : null,
    price: v.price != null ? String(v.price) : null,
    price_currency: v.price_currency ?? '',
    cost: v.cost != null ? String(v.cost) : null,
    cost_currency: v.cost_currency ?? '',
    length: measure(v.length_value, v.length_unit),
    width: measure(v.width_value, v.width_unit),
    height: measure(v.height_value, v.height_unit),
    weight: measure(v.weight_value, v.weight_unit),
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

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({
        name: initial.name,
        item_type: initial.item_type,
        status: initial.status,
        model: initial.model,
        serial_number: initial.serial_number,
        spec: initial.spec,
        remark: initial.remark,
        size: initial.size,
        color: initial.color,
        url: initial.url,
        quantity: initial.quantity != null ? Number(initial.quantity) : null,
        price: initial.price != null ? Number(initial.price) : null,
        price_currency: initial.price_currency || undefined,
        cost: initial.cost != null ? Number(initial.cost) : null,
        cost_currency: initial.cost_currency || undefined,
        length_value: toMeasureValue(initial.length),
        length_unit: initial.length?.unit ?? 'mm',
        width_value: toMeasureValue(initial.width),
        width_unit: initial.width?.unit ?? 'mm',
        height_value: toMeasureValue(initial.height),
        height_unit: initial.height?.unit ?? 'mm',
        weight_value: toMeasureValue(initial.weight),
        weight_unit: initial.weight?.unit ?? 'g',
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        item_type: 'stockable',
        status: 'active',
        length_unit: 'mm',
        width_unit: 'mm',
        height_unit: 'mm',
        weight_unit: 'g',
      });
    }
  }, [open, initial, form]);

  const lengthUnitOptions = LENGTH_UNITS.map((u) => ({ value: u, label: u }));
  const weightUnitOptions = WEIGHT_UNITS.map((u) => ({ value: u, label: u }));

  const dimensionField = (name: 'length' | 'width' | 'height', label: string) => (
    <Col span={8}>
      <Form.Item label={label}>
        <Input.Group compact>
          <Form.Item name={`${name}_value`} noStyle>
            <InputNumber min={0} style={{ width: '65%' }} />
          </Form.Item>
          <Form.Item name={`${name}_unit`} noStyle>
            <Select style={{ width: '35%' }} options={lengthUnitOptions} />
          </Form.Item>
        </Input.Group>
      </Form.Item>
    </Col>
  );

  const moneyField = (name: 'price' | 'cost', label: string) => (
    <Col span={12}>
      <Form.Item label={label}>
        <Input.Group compact>
          <Form.Item name={name} noStyle>
            <InputNumber min={0} style={{ width: '60%' }} />
          </Form.Item>
          <Form.Item name={`${name}_currency`} noStyle>
            <Select
              style={{ width: '40%' }}
              showSearch
              allowClear
              placeholder="CUR"
              options={currencyOptions}
            />
          </Form.Item>
        </Input.Group>
      </Form.Item>
    </Col>
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={confirmLoading}
      width={720}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => onOk(formValuesToItemWrite(values))}
      >
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="item_type" label={t({ id: 'pages.inventory.items.col.type' })} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'stockable', label: t({ id: 'pages.inventory.items.type.stockable' }) },
                  { value: 'consumable', label: t({ id: 'pages.inventory.items.type.consumable' }) },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="status" label={t({ id: 'pages.inventory.items.col.status' })} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'active', label: t({ id: 'pages.inventory.items.status.active' }) },
                  { value: 'deprecated', label: t({ id: 'pages.inventory.items.status.deprecated' }) },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="model" label={t({ id: 'pages.inventory.items.col.model' })}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="serial_number" label={t({ id: 'pages.inventory.items.col.serial' })}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="size" label={t({ id: 'pages.inventory.items.col.size' })}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="spec" label={t({ id: 'pages.inventory.items.col.spec' })}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Row gutter={12}>
          {dimensionField('length', t({ id: 'pages.inventory.items.col.length' }))}
          {dimensionField('width', t({ id: 'pages.inventory.items.col.width' }))}
          {dimensionField('height', t({ id: 'pages.inventory.items.col.height' }))}
        </Row>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label={t({ id: 'pages.inventory.items.col.weight' })}>
              <Input.Group compact>
                <Form.Item name="weight_value" noStyle>
                  <InputNumber min={0} style={{ width: '65%' }} />
                </Form.Item>
                <Form.Item name="weight_unit" noStyle>
                  <Select style={{ width: '35%' }} options={weightUnitOptions} />
                </Form.Item>
              </Input.Group>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="quantity" label={t({ id: 'pages.inventory.items.col.quantity' })}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="color" label={t({ id: 'pages.inventory.items.col.color' })}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          {moneyField('price', t({ id: 'pages.inventory.items.col.price' }))}
          {moneyField('cost', t({ id: 'pages.inventory.items.col.cost' }))}
        </Row>
        <Form.Item name="url" label={t({ id: 'pages.inventory.items.col.url' })}>
          <Input />
        </Form.Item>
        <Form.Item name="remark" label={t({ id: 'pages.inventory.items.col.remark' })}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
