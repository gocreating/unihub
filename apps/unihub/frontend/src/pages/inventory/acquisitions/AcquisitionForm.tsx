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
  Modal,
  Row,
  Space,
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
import { draftParameters } from '../itemBadges';
import { ItemDisplay } from '@/components/ItemDisplay';
import { PriceInput } from '@/components/PriceInput';
import { formatPrice } from '@/utils/currency';
import { EmptyValue } from '@/components/EmptyValue';
import { listAttributeDefinitions } from '@/services/unihub-backend/core';
import {
  COST_FACTOR_TYPES,
  createAcquisition,
  deleteAcquisition,
  deleteItem,
  listSources,
  updateAcquisition,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { listCurrencies } from '@/services/unihub-backend/finance';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { ItemFormModal } from '../items/ItemFormModal';
import { PanelHeaderActions } from '@/components/PanelHeaderActions';

interface AcquisitionFieldValues {
  source?: string;
  request_time?: dayjs.Dayjs | null;
  obtained_at?: dayjs.Dayjs | null;
  remark?: string;
}

interface Card {
  id?: string;
  data: ItemWrite;
  /** Existing item whose data changed locally — updated on Save (FR-006, iter 33). */
  dirty?: boolean;
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
    alias_name: item.alias_name,
    quantity: item.quantity,
    spec: item.spec,
    remark: item.remark,
    url: item.url,
    sku_price: item.sku_price,
    sku_price_currency: item.sku_price_currency,
    parameters: (item.parameters ?? []).map((p) => ({
      definition_id: p.definition_id,
      value: p.value,
      unit: p.unit || undefined,
    })),
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

  // Panel kebab Delete (v1.21.0, edit mode only): item-count confirm, then
  // back to the Catalog (FR-007).
  const confirmDeleteAcquisition = () => {
    if (!initial) return;
    Modal.confirm({
      title: t({ id: 'pages.inventory.acquisitions.delete.title' }),
      content: t({ id: 'pages.inventory.acquisitions.delete.confirm' }, { count: initial.items.length }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: async () => {
        await deleteAcquisition(initial.id);
        message.success(t({ id: 'pages.inventory.acquisitions.deleted' }));
        navigate('/inventory/catalog');
      },
    });
  };

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
  // Staged removals of EXISTING items — applied only on Save (FR-006, iter 33).
  const [removedIds, setRemovedIds] = useState<string[]>([]);
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
  // Parameter definitions resolve pending-card parameter rows into badges.
  const { data: parameterDefs = [] } = useQuery({
    queryKey: ['core', 'attribute-definitions', 'inventory.item'],
    queryFn: () => listAttributeDefinitions('inventory.item'),
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
    mutationFn: async () => {
      // Apply the STAGED item mutations first (FR-006, iteration 33).
      await Promise.all([
        ...removedIds.map((id) => deleteItem(id)),
        ...cards.filter((c) => c.id && c.dirty).map((c) => updateItem(c.id!, c.data)),
      ]);
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

  // STAGED (FR-006, iteration 33): card edits never call the API — the page
  // Save applies them. An existing card is marked dirty instead.
  const handleCardOk = (data: ItemWrite) => {
    if (editingIndex === null) {
      setCards((prev) => [...prev, { data }]);
    } else {
      setCards((prev) =>
        prev.map((c, i) => (i === editingIndex ? { ...c, data, dirty: c.dirty || Boolean(c.id) } : c)),
      );
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

  // STAGED (FR-006, iteration 33): removal never calls the API — the id is
  // remembered and deleted only by the page Save; leaving discards it.
  const removeCard = (idx: number) => {
    const card = cards[idx];
    if (card?.id) setRemovedIds((prev) => [...prev, card.id!]);
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateFactor = (key: string, patch: Partial<FactorRow>) =>
    setFactors((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const addFactor = () =>
    setFactors((prev) => [...prev, { key: nextKey(), value: '0', currency: '', type: '', kind: 'manual' }]);

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

  // Memoized: a fresh object per render would defeat the modal's
  // initialize-on-open guard for consumers keying off identity.
  const modalInitial: Item | null = useMemo(
    () => (editingIndex !== null ? writeToItemLike(cards[editingIndex]?.data) : null),
    [editingIndex, cards],
  );

  const accumulatedRows = factors.filter((f) => f.kind === 'accumulated');
  const manualRows = factors.filter((f) => f.kind === 'manual');

  const valueCurrency = (f: FactorRow, currencyDisabled: boolean) => (
    <PriceInput
      amount={f.value === '' || f.value == null ? null : Number(f.value)}
      currency={f.currency}
      codes={currencyOptions}
      currencyDisabled={currencyDisabled}
      onAmount={(v) => updateFactor(f.key, { value: v == null ? '0' : String(v) })}
      onCurrency={(v) => updateFactor(f.key, { currency: v ?? '' })}
    />
  );

  return (
    <div ref={ref}>
      <Card
        title={t({ id: 'pages.inventory.acquisitions.form.title' })}
        style={{ marginBottom: 16 }}
        extra={
          isEdit ? (
            <PanelHeaderActions
              narrow={isNarrow}
              kebabLabel="acquisition-actions"
              visible={[]}
              advanced={[
                {
                  key: 'delete',
                  label: t({ id: 'common.delete' }),
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: confirmDeleteAcquisition,
                },
              ]}
            />
          ) : undefined
        }
      >
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
            // Equal-height cards per visual row (FR-006, iteration 27): the
            // Col stretches and the Card fills it, actions pinned at the bottom.
            <Col span={third} key={card.id ?? `new-${idx}`} style={{ display: 'flex' }}>
              <Card
                size="small"
                style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1 } }}
                actions={[
                  <EditOutlined key="edit" onClick={() => openEditCard(idx)} />,
                  <CopyOutlined key="dup" onClick={() => duplicateCard(idx)} />,
                  <DeleteOutlined key="del" onClick={() => removeCard(idx)} />,
                ]}
              >
                {/* Shared item display (FR-031); price stays a surface tag. */}
                <ItemDisplay
                  item={{
                    name: card.data.name || t({ id: 'pages.inventory.acquisitions.new.untitled' }),
                    alias_name: card.data.alias_name ?? '',
                    url: card.data.url,
                    spec: card.data.spec,
                    quantity: card.data.quantity,
                  }}
                  parameters={draftParameters(card.data.parameters, parameterDefs)}
                  showParameters
                  extraTags={[
                    formatPrice(card.data.sku_price_currency, card.data.sku_price),
                  ].filter(Boolean)}
                />
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
                <EmptyValue />
              ) : (
                <Space direction="vertical" size={0}>
                  {totals.map(([cur, total]) => (
                    <Typography.Text strong key={cur}>
                      {formatPrice(cur, total) || <EmptyValue />}
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
    alias_name: data.alias_name ?? '',
    quantity: data.quantity ?? 1,
    spec: data.spec ?? '',
    remark: data.remark ?? '',
    sku_price: data.sku_price ?? null,
    sku_price_currency: data.sku_price_currency ?? '',
    total_price: null,
    url: data.url ?? '',
    status: 'active',
    deprecate_time: null,
    parameters: (data.parameters ?? []).map((p) => ({
      definition_id: p.definition_id,
      name: '',
      data_type: '',
      unit_family: '' as const,
      emoji: '',
      value: p.value,
      unit: p.unit ?? '',
      value_number: null,
      value_number_max: null,
    })),
    acquisition: null,
    created_at: '',
    updated_at: '',
  };
}
