import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
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
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import type { Acquisition, CostFactorWrite, Item, ItemWrite } from '@/services/unihub-backend/inventory';
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

interface Card {
  id?: string;
  data: ItemWrite;
}

// A cost-factor row in the editor. Accumulated rows are system-managed (one per
// currency, pinned, reset-only); manual rows are user-added and drag-sortable.
interface FactorRow {
  key: string;
  value: string;
  currency: string;
  type: string;
  kind: 'accumulated' | 'manual';
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

// Σ (sku_price × quantity) per item currency.
function deriveAccumulated(cards: Card[]): { currency: string; value: string }[] {
  const totals = new Map<string, number>();
  for (const c of cards) {
    const p = c.data.sku_price;
    if (p != null && p !== '') {
      const cur = c.data.sku_price_currency || '';
      totals.set(cur, (totals.get(cur) ?? 0) + Number(p) * (c.data.quantity ?? 1));
    }
  }
  if (totals.size === 0) return [{ currency: '', value: '0' }];
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => ({ currency, value: String(value) }));
}

// Drop trailing zeros: "10.0000" → "10", "59.9000" → "59.9".
function formatDecimal(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

// Available (non-empty) item attributes to show as badges on a card body.
function itemCardBadges(d: ItemWrite): string[] {
  const b: string[] = [];
  if (d.quantity != null && d.quantity !== 1) b.push(`× ${d.quantity}`);
  if (d.sku_price) b.push(`${formatDecimal(d.sku_price)} ${d.sku_price_currency ?? ''}`.trim());
  if (d.size) b.push(d.size);
  if (d.color) b.push(d.color);
  if (d.length) b.push(`L ${d.length.value}${d.length.unit}`);
  if (d.width) b.push(`W ${d.width.value}${d.width.unit}`);
  if (d.height) b.push(`H ${d.height.value}${d.height.unit}`);
  if (d.weight) b.push(`${d.weight.value} ${d.weight.unit}`);
  if (d.volume) b.push(`${d.volume.value} ${d.volume.unit}`);
  if (d.spec) b.push(d.spec);
  return b;
}

interface AcquisitionFormProps {
  initial?: Acquisition;
}

let factorKeySeq = 0;
const nextKey = () => `m:${factorKeySeq++}`;

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
  const [factors, setFactors] = useState<FactorRow[]>(() =>
    initial
      ? initial.cost_factors.map((f) => ({
          key: f.type === 'accumulated' ? `acc:${f.currency}` : nextKey(),
          value: f.value,
          currency: f.currency,
          type: f.type,
          kind: f.type === 'accumulated' ? 'accumulated' : 'manual',
        }))
      : deriveAccumulated([emptyCard()]).map((a) => ({
          key: `acc:${a.currency}`,
          value: a.value,
          currency: a.currency,
          type: 'accumulated',
          kind: 'accumulated',
        })),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sourceOptions, setSourceOptions] = useState<{ value: string }[]>([]);

  // Reconcile accumulated rows with the items' currencies as cards change:
  // add a row for each new currency (at the derived value), drop currencies with
  // no priced item, and preserve any overridden value for currencies that remain.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return; // keep the initial factor set on first render
    }
    const desired = deriveAccumulated(cards);
    setFactors((prev) => {
      const manual = prev.filter((f) => f.kind === 'manual');
      const prevAcc = new Map(prev.filter((f) => f.kind === 'accumulated').map((f) => [f.currency, f]));
      const acc: FactorRow[] = desired.map((d) => {
        const existing = prevAcc.get(d.currency);
        return existing ?? {
          key: `acc:${d.currency}`,
          value: d.value,
          currency: d.currency,
          type: 'accumulated',
          kind: 'accumulated',
        };
      });
      return [...acc, ...manual];
    });
  }, [cards]);

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        source: initial.source,
        request_time: initial.request_time ? dayjs(initial.request_time) : null,
        obtained_at: initial.obtained_at ? dayjs(initial.obtained_at) : null,
        remark: initial.remark,
      });
    } else {
      // New acquisition: request_time and obtained_at default to today at 00:00.
      form.setFieldsValue({ request_time: dayjs().startOf('day'), obtained_at: dayjs().startOf('day') });
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
  const typeOptions = COST_FACTOR_TYPES.filter((tp) => tp !== 'accumulated').map((tp) => ({
    value: tp,
    label: t({ id: `pages.inventory.costFactors.type.${tp}` }),
  }));
  // Built-in types store a stable key but display their localized label; free text shows verbatim.
  const typeLabel = (type: string) =>
    (COST_FACTOR_TYPES as string[]).includes(type)
      ? t({ id: `pages.inventory.costFactors.type.${type}` })
      : type;

  // Total = per-currency sum across every factor (accumulated + manual).
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of factors) map.set(f.currency || '', (map.get(f.currency || '') ?? 0) + Number(f.value || 0));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [factors]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

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

  const manualPayload = (): CostFactorWrite[] =>
    factors
      .filter((f) => f.kind === 'manual')
      .map((f) => ({ value: String(f.value ?? '0'), currency: f.currency ?? '', type: f.type || 'other' }));

  const fullPayload = (): CostFactorWrite[] =>
    factors.map((f) => ({ value: String(f.value ?? '0'), currency: f.currency ?? '', type: f.type }));

  const createMutation = useMutation({
    mutationFn: () => {
      const manual = manualPayload();
      return createAcquisition({
        ...scalarPayload(),
        // accumulated is server-derived on create; send only manual factors.
        ...(manual.length ? { cost_factors: manual } : {}),
        items: cards.map((c) => c.data),
      });
    },
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
        cost_factors: fullPayload(),
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

  // Duplicate an item card: append a copy (new, unsaved) to the end of the list.
  const duplicateCard = (idx: number) => {
    const card = cards[idx];
    if (!card) return;
    setCards((prev) => [...prev, { data: structuredClone(card.data) }]);
  };

  const removeCard = async (idx: number) => {
    const card = cards[idx];
    if (isEdit && card?.id) {
      await deleteItem(card.id).catch(() => message.error(t({ id: 'pages.inventory.items.saveError' })));
      invalidate();
    }
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateFactor = (key: string, patch: Partial<FactorRow>) =>
    setFactors((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const addFactor = () =>
    setFactors((prev) => [...prev, { key: nextKey(), value: '0', currency: '', type: 'other', kind: 'manual' }]);

  const removeFactor = (key: string) => setFactors((prev) => prev.filter((f) => f.key !== key));

  // Reset one accumulated row's value to the derived Σ for its currency.
  const resetAccumulated = (currency: string) => {
    const derived = deriveAccumulated(cards).find((d) => d.currency === currency);
    if (derived) updateFactor(`acc:${currency}`, { value: derived.value });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setFactors((prev) => {
      const manual = prev.filter((f) => f.kind === 'manual');
      const acc = prev.filter((f) => f.kind === 'accumulated');
      const from = manual.findIndex((f) => f.key === active.id);
      const to = manual.findIndex((f) => f.key === over.id);
      if (from < 0 || to < 0) return prev;
      return [...acc, ...arrayMove(manual, from, to)];
    });
  };

  const modalInitial: Item | null =
    editingIndex !== null ? writeToItemLike(cards[editingIndex]?.data) : null;

  const accumulatedRows = factors.filter((f) => f.kind === 'accumulated');
  const manualRows = factors.filter((f) => f.kind === 'manual');

  const valueCurrency = (f: FactorRow, currencyDisabled: boolean) => (
    <Space.Compact style={{ width: '100%' }}>
      <InputNumber
        style={{ width: '55%', textAlign: 'right' }}
        value={f.value === '' || f.value == null ? null : Number(f.value)}
        onChange={(v) => updateFactor(f.key, { value: v == null ? '0' : String(v) })}
      />
      <Select
        style={{ width: '45%' }}
        showSearch
        allowClear
        disabled={currencyDisabled}
        value={f.currency || undefined}
        onChange={(v) => updateFactor(f.key, { currency: v ?? '' })}
        options={currencyOptions}
        placeholder={t({ id: 'pages.inventory.acquisitions.costFactors.currency' })}
      />
    </Space.Compact>
  );

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
        title={t({ id: 'pages.inventory.acquisitions.items' })}
        extra={
          <Button icon={<PlusOutlined />} onClick={openAddCard}>
            {t({ id: 'common.add' })}
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[12, 12]}>
          {cards.map((card, idx) => (
            <Col span={third} key={card.id ?? `new-${idx}`}>
              <Card
                size="small"
                title={
                  card.data.url ? (
                    <a href={card.data.url} target="_blank" rel="noopener noreferrer">
                      {card.data.name || t({ id: 'pages.inventory.acquisitions.new.untitled' })}
                    </a>
                  ) : (
                    card.data.name || t({ id: 'pages.inventory.acquisitions.new.untitled' })
                  )
                }
                actions={[
                  <EditOutlined key="edit" onClick={() => openEditCard(idx)} />,
                  <CopyOutlined key="dup" onClick={() => duplicateCard(idx)} />,
                  <DeleteOutlined key="del" onClick={() => removeCard(idx)} />,
                ]}
              >
                <Space size={[4, 4]} wrap>
                  {itemCardBadges(card.data).map((badge, i) => (
                    <Tag key={i} style={{ marginInlineEnd: 0 }}>
                      {badge}
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        title={t({ id: 'pages.inventory.acquisitions.cost' })}
        extra={
          <Button icon={<PlusOutlined />} onClick={addFactor}>
            {t({ id: 'common.add' })}
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {accumulatedRows.map((f) => (
            <Row gutter={[8, 8]} key={f.key} align="middle" wrap={isNarrow}>
              {!isNarrow && <Col flex="24px" />}
              <Col flex={isNarrow ? '100%' : '1 1 0'}>
                <Typography.Text>
                  {t({ id: 'pages.inventory.acquisitions.costFactors.accumulatedLabel' })}
                </Typography.Text>
              </Col>
              <Col flex={isNarrow ? '100%' : '2 1 0'}>{valueCurrency(f, true)}</Col>
              <Col flex="none">
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  title={t({ id: 'pages.inventory.acquisitions.costFactors.reset' })}
                  onClick={() => resetAccumulated(f.currency)}
                />
              </Col>
            </Row>
          ))}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={manualRows.map((f) => f.key)} strategy={verticalListSortingStrategy}>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {manualRows.map((f) => (
                  <SortableFactorRow key={f.key} id={f.key} isNarrow={isNarrow}>
                    <Col flex={isNarrow ? '100%' : '1 1 0'}>
                      <AutoComplete
                        style={{ width: '100%' }}
                        value={typeLabel(f.type)}
                        options={typeOptions}
                        filterOption={(input, option) =>
                          String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        onChange={(v) => updateFactor(f.key, { type: v })}
                        placeholder={t({ id: 'pages.inventory.acquisitions.costFactors.factorType' })}
                      />
                    </Col>
                    <Col flex={isNarrow ? '100%' : '2 1 0'}>{valueCurrency(f, false)}</Col>
                    <Col flex="none">
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeFactor(f.key)} />
                    </Col>
                  </SortableFactorRow>
                ))}
              </Space>
            </SortableContext>
          </DndContext>

          <Divider style={{ margin: '8px 0' }} />
          <Row gutter={8} align="top" wrap={false}>
            <Col flex="24px" />
            <Col flex="1 1 0">
              <Typography.Text strong>{t({ id: 'pages.inventory.acquisitions.total' })}</Typography.Text>
            </Col>
            <Col flex="2 1 0">
              {totals.length === 0 ? (
                <Typography.Text>—</Typography.Text>
              ) : (
                <Space direction="vertical" size={0}>
                  {totals.map(([cur, total]) => (
                    <Typography.Text strong key={cur}>
                      {total.toLocaleString()} {cur}
                    </Typography.Text>
                  ))}
                </Space>
              )}
            </Col>
          </Row>
        </Space>
      </Card>

      <Space>
        <Button
          type="primary"
          loading={createMutation.isPending || editSaveMutation.isPending}
          onClick={handleSubmit}
        >
          {isEdit ? t({ id: 'common.save' }) : t({ id: 'pages.inventory.acquisitions.new.create' })}
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

// A drag-sortable manual cost-factor row (accumulated rows are not sortable).
// On a narrow content area the fields wrap to a single column (with a vertical gap).
function SortableFactorRow({
  id,
  isNarrow,
  children,
}: {
  id: string;
  isNarrow: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <Row ref={setNodeRef} style={style} gutter={[8, 8]} align="middle" wrap={isNarrow}>
      <Col flex={isNarrow ? '100%' : '24px'}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab' }}>
          <HolderOutlined />
        </span>
      </Col>
      {children}
    </Row>
  );
}

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
