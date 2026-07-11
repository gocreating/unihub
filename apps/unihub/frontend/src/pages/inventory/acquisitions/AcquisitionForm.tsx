import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import type { Acquisition, Item, ItemWrite } from '@/services/unihub-backend/inventory';
import {
  createAcquisition,
  deleteItem,
  listSources,
  updateAcquisition,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { listCurrencies } from '@/services/unihub-backend/finance';
import { ItemFormModal } from '../items/ItemFormModal';

interface AcquisitionFieldValues {
  source?: string;
  request_time?: dayjs.Dayjs | null;
  obtained_at?: dayjs.Dayjs | null;
  remark?: string;
  cost?: number | null;
  cost_currency?: string;
  discount?: number | null;
  tax_refund?: number | null;
}

// A card is either an already-persisted item (has `id`) or a new local one.
interface Card {
  id?: string;
  data: ItemWrite;
  full?: Item; // the persisted item, for pre-filling the edit modal
}

function itemToWrite(item: Item): ItemWrite {
  return {
    name: item.name,
    item_type: item.item_type,
    quantity: item.quantity,
    spec: item.spec,
    remark: item.remark,
    size: item.size,
    color: item.color,
    url: item.url,
    sku_price: item.sku_price,
    sku_price_currency: item.sku_price_currency,
    length: item.length,
    width: item.width,
    height: item.height,
    weight: item.weight,
    volume: item.volume,
  };
}

function emptyCard(): Card {
  return { data: { name: '', item_type: 'stockable', quantity: '1' } };
}

interface AcquisitionFormProps {
  initial?: Acquisition; // present ⇒ edit mode
}

export function AcquisitionForm({ initial }: AcquisitionFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [form] = Form.useForm<AcquisitionFieldValues>();
  const isEdit = Boolean(initial);

  const [cards, setCards] = useState<Card[]>(() =>
    initial ? initial.items.map((i) => ({ id: i.id, data: itemToWrite(i), full: i })) : [emptyCard()],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sourceOptions, setSourceOptions] = useState<{ value: string }[]>([]);

  useEffect(() => {
    if (!initial) return;
    form.setFieldsValue({
      source: initial.source,
      request_time: initial.request_time ? dayjs(initial.request_time) : null,
      obtained_at: initial.obtained_at ? dayjs(initial.obtained_at) : null,
      remark: initial.remark,
      cost: initial.cost != null ? Number(initial.cost) : null,
      cost_currency: initial.cost_currency || undefined,
      discount: initial.discount != null ? Number(initial.discount) : null,
      tax_refund: initial.tax_refund != null ? Number(initial.tax_refund) : null,
    });
  }, [initial, form]);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencyOptions = useMemo(
    () => (currenciesData?.results ?? []).map((c) => ({ value: c.code, label: c.code })),
    [currenciesData],
  );

  const cost = Form.useWatch('cost', form);
  const discount = Form.useWatch('discount', form);
  const taxRefund = Form.useWatch('tax_refund', form);
  const costCurrencyDisabled = cost == null || Number(cost) === 0;
  const netCost = useMemo(() => {
    if (cost == null) return null;
    return Number(cost) - Number(discount ?? 0) - Number(taxRefund ?? 0);
  }, [cost, discount, taxRefund]);

  const onSourceSearch = async (q: string) => {
    const results = await listSources(q).catch(() => []);
    setSourceOptions(results.map((s) => ({ value: s })));
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'acquisitions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
  };

  const scalarPayload = () => {
    const v = form.getFieldsValue();
    return {
      source: v.source ?? '',
      request_time: v.request_time ? v.request_time.toISOString() : null,
      obtained_at: v.obtained_at ? v.obtained_at.toISOString() : null,
      remark: v.remark ?? '',
      cost: v.cost != null ? String(v.cost) : null,
      cost_currency: v.cost_currency ?? '',
      discount: v.discount != null ? String(v.discount) : null,
      tax_refund: v.tax_refund != null ? String(v.tax_refund) : null,
    };
  };

  const createMutation = useMutation({
    mutationFn: () => createAcquisition({ ...scalarPayload(), items: cards.map((c) => c.data) }),
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
      navigate('/inventory/acquisitions');
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const editSaveMutation = useMutation({
    mutationFn: () => {
      const newItems = cards.filter((c) => !c.id).map((c) => c.data);
      return updateAcquisition(initial!.id, { ...scalarPayload(), items: newItems });
    },
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
      navigate('/inventory/acquisitions');
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const handleSubmit = () => {
    const hasName = cards.every((c) => c.data.name.trim().length > 0);
    if (cards.length === 0 || !hasName) {
      message.warning(t({ id: 'pages.inventory.acquisitions.new.needItem' }));
      return;
    }
    if (isEdit) editSaveMutation.mutate();
    else createMutation.mutate();
  };

  const openAddCard = () => {
    setEditingIndex(null);
    setModalOpen(true);
  };
  const openEditCard = (idx: number) => {
    setEditingIndex(idx);
    setModalOpen(true);
  };

  const handleCardOk = async (data: ItemWrite) => {
    if (editingIndex === null) {
      setCards((prev) => [...prev, { data }]);
    } else {
      const card = cards[editingIndex];
      if (isEdit && card?.id) {
        await updateItem(card.id, data).catch(() => message.error(t({ id: 'pages.inventory.items.saveError' })));
        invalidate();
      }
      setCards((prev) => prev.map((c, i) => (i === editingIndex ? { ...c, data } : c)));
    }
    setModalOpen(false);
    setEditingIndex(null);
  };

  const removeCard = async (idx: number) => {
    const card = cards[idx];
    if (isEdit && card?.id) {
      await deleteItem(card.id).catch(() => message.error(t({ id: 'pages.inventory.items.saveError' })));
      invalidate();
    }
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const modalInitial: Item | null =
    editingIndex !== null ? (cards[editingIndex]?.full ?? writeToItemLike(cards[editingIndex]?.data)) : null;

  return (
    <>
      <Card title={t({ id: 'pages.inventory.acquisitions.new' })} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="source" label={t({ id: 'pages.inventory.acquisitions.col.source' })}>
                <AutoComplete
                  options={sourceOptions}
                  onSearch={onSourceSearch}
                  placeholder={t({ id: 'pages.inventory.acquisitions.form.sourcePlaceholder' })}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={7}>
              <Form.Item name="request_time" label={t({ id: 'pages.inventory.acquisitions.col.requestTime' })}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={7}>
              <Form.Item name="obtained_at" label={t({ id: 'pages.inventory.acquisitions.col.obtainedAt' })}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item label={t({ id: 'pages.inventory.acquisitions.col.cost' })}>
                <Space.Compact block>
                  <Form.Item name="cost" noStyle>
                    <InputNumber min={0} style={{ width: '60%' }} />
                  </Form.Item>
                  <Form.Item name="cost_currency" noStyle>
                    <Select
                      style={{ width: '40%' }}
                      showSearch
                      allowClear
                      disabled={costCurrencyDisabled}
                      placeholder={costCurrencyDisabled ? '—' : 'CUR'}
                      options={currencyOptions}
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={12} sm={5}>
              <Form.Item name="discount" label={t({ id: 'pages.inventory.acquisitions.col.discount' })}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={5}>
              <Form.Item name="tax_refund" label={t({ id: 'pages.inventory.acquisitions.col.taxRefund' })}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item label={t({ id: 'pages.inventory.acquisitions.col.netCost' })}>
                <Typography.Text strong>
                  {netCost != null ? netCost.toLocaleString() : '—'}
                </Typography.Text>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label={t({ id: 'pages.inventory.acquisitions.col.remark' })}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title={t({ id: 'pages.inventory.acquisitions.new.items' })}
        extra={
          <Button icon={<PlusOutlined />} onClick={openAddCard}>
            {t({ id: 'pages.inventory.acquisitions.new.addItem' })}
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[12, 12]}>
          {cards.map((card, idx) => (
            <Col xs={24} sm={12} md={8} key={card.id ?? `new-${idx}`}>
              <Card
                size="small"
                title={card.data.name || t({ id: 'pages.inventory.acquisitions.new.untitled' })}
                actions={[
                  <EditOutlined key="edit" onClick={() => openEditCard(idx)} />,
                  <DeleteOutlined key="del" onClick={() => removeCard(idx)} />,
                ]}
              >
                <Space direction="vertical" size={2}>
                  <Tag>{t({ id: `pages.inventory.items.type.${card.data.item_type ?? 'stockable'}` })}</Tag>
                  {card.data.quantity && card.data.quantity !== '1' && (
                    <span>× {card.data.quantity}</span>
                  )}
                  {card.data.sku_price && (
                    <span>
                      {card.data.sku_price} {card.data.sku_price_currency}
                    </span>
                  )}
                  {card.data.spec && (
                    <Typography.Text type="secondary" ellipsis>
                      {card.data.spec}
                    </Typography.Text>
                  )}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Space>
        <Button
          type="primary"
          loading={createMutation.isPending || editSaveMutation.isPending}
          onClick={handleSubmit}
        >
          {isEdit
            ? t({ id: 'common.save' })
            : t({ id: 'pages.inventory.acquisitions.new.create' })}
        </Button>
      </Space>

      <ItemFormModal
        open={modalOpen}
        title={t({ id: 'pages.inventory.acquisitions.new.addItem' })}
        initial={modalInitial}
        currencyOptions={currencyOptions}
        onCancel={() => {
          setModalOpen(false);
          setEditingIndex(null);
        }}
        onOk={handleCardOk}
      />
    </>
  );
}

// Build a minimal Item-like object from an ItemWrite so the edit modal can pre-fill.
function writeToItemLike(data?: ItemWrite): Item | null {
  if (!data) return null;
  return {
    id: '',
    name: data.name,
    item_type: data.item_type ?? 'stockable',
    quantity: data.quantity ?? '1',
    spec: data.spec ?? '',
    remark: data.remark ?? '',
    size: data.size ?? '',
    length: data.length ?? null,
    width: data.width ?? null,
    height: data.height ?? null,
    weight: data.weight ?? null,
    volume: data.volume ?? null,
    sku_price: data.sku_price ?? null,
    sku_price_currency: data.sku_price_currency ?? '',
    total_price: null,
    color: data.color ?? '',
    url: data.url ?? '',
    status: 'active',
    deprecate_time: null,
    acquisition: null,
    created_at: '',
    updated_at: '',
  };
}
