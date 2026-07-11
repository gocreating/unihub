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
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import type {
  Acquisition,
  CostFactorType,
  CostFactorWrite,
  Item,
  ItemWrite,
} from '@/services/unihub-backend/inventory';
import {
  COST_FACTOR_TYPES,
  createAcquisition,
  deleteItem,
  listSources,
  updateAcquisition,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { listCurrencies } from '@/services/unihub-backend/finance';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { ItemFormModal } from '../items/ItemFormModal';

interface AcquisitionFieldValues {
  source?: string;
  request_time?: dayjs.Dayjs | null;
  obtained_at?: dayjs.Dayjs | null;
  remark?: string;
}

// A card is either an already-persisted item (has `id`) or a new local one.
interface Card {
  id?: string;
  data: ItemWrite;
}

function itemToWrite(item: Item): ItemWrite {
  return {
    name: item.name,
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
  return { data: { name: '', quantity: 1 } };
}

// Σ (sku_price × quantity) across item cards, plus the first non-empty currency.
function accumulatedDefault(cards: Card[]): { value: string; currency: string } {
  let total = 0;
  let currency = '';
  for (const c of cards) {
    if (c.data.sku_price != null && c.data.sku_price !== '') {
      total += Number(c.data.sku_price) * (c.data.quantity ?? 1);
      currency = currency || c.data.sku_price_currency || '';
    }
  }
  return { value: String(total), currency };
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
  const { ref, isNarrow } = useContainerWidth(640);
  const half = isNarrow ? 24 : 12;
  const third = isNarrow ? 24 : 8;

  const [cards, setCards] = useState<Card[]>(() =>
    initial ? initial.items.map((i) => ({ id: i.id, data: itemToWrite(i) })) : [emptyCard()],
  );
  const [factors, setFactors] = useState<CostFactorWrite[]>(() =>
    initial
      ? initial.cost_factors.map((f) => ({ value: f.value, currency: f.currency, type: f.type }))
      : [{ value: '0', currency: '', type: 'accumulated' }],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sourceOptions, setSourceOptions] = useState<{ value: string }[]>([]);

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        source: initial.source,
        request_time: initial.request_time ? dayjs(initial.request_time) : null,
        obtained_at: initial.obtained_at ? dayjs(initial.obtained_at) : null,
        remark: initial.remark,
      });
    } else {
      // New acquisition: request_time defaults to today at 00:00.
      form.setFieldsValue({ request_time: dayjs().startOf('day') });
    }
  }, [initial, form]);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencyOptions = useMemo(
    () => (currenciesData?.results ?? []).map((c) => ({ value: c.code, label: c.code })),
    [currenciesData],
  );

  const factorTypeOptions = COST_FACTOR_TYPES.map((ct) => ({
    value: ct,
    label: t({ id: `pages.inventory.costFactors.type.${ct}` }),
  }));

  // Net cost = per-currency sum of factor values (value carries its own sign).
  const netByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const f of factors) {
      const cur = f.currency || '';
      totals.set(cur, (totals.get(cur) ?? 0) + Number(f.value || 0));
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [factors]);

  const onSourceSearch = async (q: string) => {
    const results = await listSources(q).catch(() => []);
    setSourceOptions(results.map((s) => ({ value: s })));
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'acquisitions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'catalog'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
  };

  const scalarPayload = () => {
    const v = form.getFieldsValue();
    return {
      source: v.source ?? '',
      request_time: v.request_time ? v.request_time.toISOString() : null,
      obtained_at: v.obtained_at ? v.obtained_at.toISOString() : null,
      remark: v.remark ?? '',
    };
  };

  const factorsPayload = (): CostFactorWrite[] =>
    factors.map((f) => ({
      value: String(f.value ?? '0'),
      currency: f.currency ?? '',
      type: f.type ?? 'other',
    }));

  const createMutation = useMutation({
    mutationFn: () =>
      createAcquisition({
        ...scalarPayload(),
        cost_factors: factorsPayload(),
        items: cards.map((c) => c.data),
      }),
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
      navigate('/inventory/catalog');
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const editSaveMutation = useMutation({
    mutationFn: () => {
      const newItems = cards.filter((c) => !c.id).map((c) => c.data);
      return updateAcquisition(initial!.id, {
        ...scalarPayload(),
        cost_factors: factorsPayload(),
        items: newItems,
      });
    },
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
      navigate('/inventory/catalog');
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const handleSubmit = () => {
    const hasName = cards.every((c) => c.data.name.trim().length > 0);
    if (cards.length === 0 || !hasName) {
      message.warning(t({ id: 'pages.inventory.acquisitions.new.needItem' }));
      return;
    }
    if (factors.length === 0) {
      message.warning(t({ id: 'pages.inventory.acquisitions.costFactors.needOne' }));
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
        // Persist the edit immediately; existing items are not resent on save.
        const updated = await updateItem(card.id, data).catch(() => {
          message.error(t({ id: 'pages.inventory.items.saveError' }));
          return null;
        });
        if (updated) invalidate();
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

  const updateFactor = (idx: number, patch: Partial<CostFactorWrite>) =>
    setFactors((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));

  const addFactor = () =>
    setFactors((prev) => [...prev, { value: '0', currency: '', type: 'other' }]);

  const removeFactor = (idx: number) => setFactors((prev) => prev.filter((_, i) => i !== idx));

  // Recompute (or add) the accumulated factor from the current item prices.
  const resetAccumulated = () => {
    const { value, currency } = accumulatedDefault(cards);
    setFactors((prev) => {
      const idx = prev.findIndex((f) => f.type === 'accumulated');
      if (idx === -1) return [{ value, currency, type: 'accumulated' }, ...prev];
      return prev.map((f, i) => (i === idx ? { ...f, value, currency } : f));
    });
  };

  // Build a minimal Item-like object from an ItemWrite so the edit modal pre-fills
  // from the *current* card data (fixes edits not being reflected on reopen).
  const modalInitial: Item | null =
    editingIndex !== null ? writeToItemLike(cards[editingIndex]?.data) : null;

  return (
    <div ref={ref}>
      <Card title={t({ id: 'pages.inventory.acquisitions.form.title' })} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={half}>
              <Form.Item name="source" label={t({ id: 'pages.inventory.acquisitions.col.source' })}>
                <AutoComplete
                  options={sourceOptions}
                  onSearch={onSourceSearch}
                  placeholder={t({ id: 'pages.inventory.acquisitions.form.sourcePlaceholder' })}
                />
              </Form.Item>
            </Col>
            <Col span={isNarrow ? 24 : 6}>
              <Form.Item name="request_time" label={t({ id: 'pages.inventory.acquisitions.col.requestTime' })}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isNarrow ? 24 : 6}>
              <Form.Item name="obtained_at" label={t({ id: 'pages.inventory.acquisitions.col.obtainedAt' })}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label={t({ id: 'pages.inventory.acquisitions.col.remark' })}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title={t({ id: 'pages.inventory.acquisitions.costFactors' })}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={resetAccumulated}>
              {t({ id: 'pages.inventory.acquisitions.costFactors.reset' })}
            </Button>
            <Button icon={<PlusOutlined />} onClick={addFactor}>
              {t({ id: 'pages.inventory.acquisitions.costFactors.add' })}
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {factors.map((f, idx) => (
            <Row gutter={8} key={idx} align="middle">
              <Col span={isNarrow ? 24 : 7}>
                <InputNumber
                  style={{ width: '100%' }}
                  value={f.value === '' || f.value == null ? null : Number(f.value)}
                  onChange={(v) => updateFactor(idx, { value: v == null ? '0' : String(v) })}
                  placeholder={t({ id: 'pages.inventory.acquisitions.costFactors.value' })}
                />
              </Col>
              <Col span={isNarrow ? 12 : 6}>
                <Select
                  style={{ width: '100%' }}
                  showSearch
                  allowClear
                  value={f.currency || undefined}
                  onChange={(v) => updateFactor(idx, { currency: v ?? '' })}
                  options={currencyOptions}
                  placeholder={t({ id: 'pages.inventory.acquisitions.costFactors.currency' })}
                />
              </Col>
              <Col span={isNarrow ? 10 : 8}>
                <Select
                  style={{ width: '100%' }}
                  value={f.type}
                  onChange={(v) => updateFactor(idx, { type: v as CostFactorType })}
                  options={factorTypeOptions}
                />
              </Col>
              <Col span={isNarrow ? 2 : 3}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeFactor(idx)}
                />
              </Col>
            </Row>
          ))}
        </Space>
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">
            {t({ id: 'pages.inventory.acquisitions.col.netCost' })}:{' '}
          </Typography.Text>
          {netByCurrency.length === 0 ? (
            <Typography.Text>—</Typography.Text>
          ) : (
            netByCurrency.map(([cur, total]) => (
              <Typography.Text strong key={cur} style={{ marginRight: 12 }}>
                {total.toLocaleString()} {cur}
              </Typography.Text>
            ))
          )}
        </div>
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
            <Col span={third} key={card.id ?? `new-${idx}`}>
              <Card
                size="small"
                title={card.data.name || t({ id: 'pages.inventory.acquisitions.new.untitled' })}
                actions={[
                  <EditOutlined key="edit" onClick={() => openEditCard(idx)} />,
                  <DeleteOutlined key="del" onClick={() => removeCard(idx)} />,
                ]}
              >
                <Space direction="vertical" size={2}>
                  {card.data.quantity != null && card.data.quantity !== 1 && (
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
    </div>
  );
}

// Build a minimal Item-like object from an ItemWrite so the edit modal can pre-fill.
function writeToItemLike(data?: ItemWrite): Item | null {
  if (!data) return null;
  return {
    id: '',
    name: data.name,
    quantity: data.quantity ?? 1,
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
