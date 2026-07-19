import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Input, Modal, Row, Select, Space, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { IntlShape } from 'react-intl';
import {
  createAttributeDefinition,
  deleteAttributeDefinition,
  listAttributeDefinitions,
} from '@/services/unihub-backend/core';
import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type { ItemParameterWrite, UnitFamily } from '@/services/unihub-backend/inventory';
import { UNIT_FAMILY_OPTIONS } from '@/services/unihub-backend/inventory';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { KeyEmoji } from '@/components/ItemDisplay';

const NEW_KEY = '__new__';

// User-facing type vocabulary (FR-027) → core data types.
const TYPE_CHOICES = [
  { value: 'text', labelId: 'pages.inventory.params.type.string' },
  { value: 'number', labelId: 'pages.inventory.params.type.numeric' },
  { value: 'single_select', labelId: 'pages.inventory.params.type.select' },
  { value: 'dimension', labelId: 'pages.inventory.params.type.dimension' },
] as const;

const FAMILY_CHOICES = [
  { value: 'length', labelId: 'pages.inventory.params.family.length' },
  { value: 'weight', labelId: 'pages.inventory.params.family.weight' },
  { value: 'volume', labelId: 'pages.inventory.params.family.volume' },
  { value: 'temperature', labelId: 'pages.inventory.params.family.temperature' },
  { value: 'time', labelId: 'pages.inventory.params.family.time' },
  { value: 'battery', labelId: 'pages.inventory.params.family.battery' },
] as const;

// Mirrors the backend range grammar (core.attributes): "5", "5-10", "-10~40".
const DIMENSION_VALUE_RE =
  /^\s*-?\d+(?:\.\d+)?\s*$|^\s*(-?\d+(?:\.\d+)?)\s*(?:~\s*(-?\d+(?:\.\d+)?)|-\s*(\d+(?:\.\d+)?))\s*$/;

/** Empty and valid single/range dimension texts pass; min>max fails. */
function isDimensionValueValid(text: string): boolean {
  if (text === '') return true;
  const m = DIMENSION_VALUE_RE.exec(text);
  if (!m) return false;
  if (m[1] === undefined) return true; // single value
  return Number(m[1]) <= Number(m[2] ?? m[3]);
}

/** Localized label for a parameter key: known system keys map to column labels. */
const SYSTEM_LABEL_KEYS: Record<string, string> = {
  color: 'pages.inventory.items.col.color',
  size: 'pages.inventory.items.col.size',
  weight: 'pages.inventory.items.col.weight',
  length: 'pages.inventory.items.col.length',
  width: 'pages.inventory.items.col.width',
  height: 'pages.inventory.items.col.height',
  volume: 'pages.inventory.items.col.volume',
};

// eslint-disable-next-line react-refresh/only-export-components
export function parameterKeyLabel(intl: IntlShape, name: string): string {
  const key = SYSTEM_LABEL_KEYS[name];
  return key ? intl.formatMessage({ id: key }) : name;
}

interface NewDefinitionDraft {
  rowIndex: number;
  name: string;
  data_type: (typeof TYPE_CHOICES)[number]['value'];
  unit_family?: UnitFamily;
  options: string;
  emoji: string;
}

export interface ParameterRowsEditorProps {
  /** Pending parameter rows (controlled — AntD Form injects value/onChange). */
  value?: ItemParameterWrite[];
  onChange?: (rows: ItemParameterWrite[]) => void;
}

// On-demand key·value(·unit) parameter rows over the shared attribute
// definitions (FR-026/FR-027). New keys are creatable inline with a type.
export function ParameterRowsEditor({ value, onChange }: ParameterRowsEditorProps) {
  const intl = useIntl();
  const { formatMessage: t } = intl;
  const queryClient = useQueryClient();
  const rows = useMemo(() => value ?? [], [value]);
  const [draft, setDraft] = useState<NewDefinitionDraft | null>(null);
  // Form-grid stacking on narrow content width (constitution VI).
  const { ref, isNarrow } = useContainerWidth(640);

  const { data: definitions = [] } = useQuery({
    queryKey: ['core', 'attribute-definitions', 'inventory.item'],
    queryFn: () => listAttributeDefinitions('inventory.item'),
  });
  const byId = useMemo(() => new Map(definitions.map((d) => [d.id, d])), [definitions]);

  const createMutation = useMutation({
    mutationFn: createAttributeDefinition,
    onSuccess: (created: AttributeDefinition, variables) => {
      queryClient.invalidateQueries({ queryKey: ['core', 'attribute-definitions'] });
      queryClient.setQueryData(
        ['core', 'attribute-definitions', 'inventory.item'],
        (prev: AttributeDefinition[] | undefined) => [...(prev ?? []), created],
      );
      void variables;
      if (draft) {
        setRow(draft.rowIndex, {
          definition_id: created.id,
          value: '',
          unit: created.unit_family ? UNIT_FAMILY_OPTIONS[created.unit_family][0] : undefined,
        });
        setDraft(null);
      }
    },
    onError: (err: Error) => message.error(err.message),
  });

  const emit = (next: ItemParameterWrite[]) => onChange?.(next);
  const setRow = (index: number, row: ItemParameterWrite) =>
    emit(rows.map((r, i) => (i === index ? row : r)));
  const removeRow = (index: number) => emit(rows.filter((_, i) => i !== index));
  const addRow = () => emit([...rows, { definition_id: '', value: '' }]);

  const usedIds = new Set(rows.map((r) => r.definition_id).filter(Boolean));

  type KeyOption = { value: string; label: string; definition?: AttributeDefinition };
  const keyOptions = (current: string): KeyOption[] => [
    ...definitions
      .filter((d) => d.id === current || !usedIds.has(d.id))
      .map((d) => ({ value: d.id, label: parameterKeyLabel(intl, d.name), definition: d })),
    { value: NEW_KEY, label: t({ id: 'pages.inventory.params.new' }) },
  ];

  // Two-step definition delete (FR-026): probe (400 + affected count) →
  // danger confirm → delete with confirm=true → refetch defs, drop its rows.
  const afterDefinitionDeleted = (definitionId: string) => {
    queryClient.invalidateQueries({ queryKey: ['core', 'attribute-definitions'] });
    emit(rows.filter((r) => r.definition_id !== definitionId));
  };

  const onDeleteDefinition = async (definition: AttributeDefinition) => {
    let count = 0;
    try {
      await deleteAttributeDefinition(definition.id);
      afterDefinitionDeleted(definition.id);
      return;
    } catch (err) {
      const e = err as Error & { status?: number; body?: { affected_entity_count?: number } };
      if (e.status !== 400 || e.body?.affected_entity_count === undefined) {
        message.error(e.message);
        return;
      }
      count = e.body.affected_entity_count;
    }
    Modal.confirm({
      title: t(
        { id: 'pages.inventory.params.deleteTitle' },
        { name: parameterKeyLabel(intl, definition.name) },
      ),
      content: t({ id: 'pages.inventory.params.deleteBody' }, { count }),
      okText: t({ id: 'common.delete' }),
      okButtonProps: { danger: true },
      cancelText: t({ id: 'common.cancel' }),
      onOk: async () => {
        await deleteAttributeDefinition(definition.id, true);
        afterDefinitionDeleted(definition.id);
      },
    });
  };

  const renderKeyOption = (option: {
    label?: React.ReactNode;
    data: { definition?: AttributeDefinition };
  }) => {
    const definition = option.data.definition;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          {definition?.emoji ? <KeyEmoji emoji={definition.emoji} /> : null}
          {option.label}
        </span>
        {definition && !definition.is_system && (
          <DeleteOutlined
            aria-label="delete-definition"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              void onDeleteDefinition(definition);
            }}
          />
        )}
      </div>
    );
  };

  const onKeyChange = (index: number, definitionId: string) => {
    if (definitionId === NEW_KEY) {
      setDraft({ rowIndex: index, name: '', data_type: 'text', options: '', emoji: '' });
      return;
    }
    const definition = byId.get(definitionId);
    setRow(index, {
      definition_id: definitionId,
      value: '',
      unit: definition?.unit_family
        ? UNIT_FAMILY_OPTIONS[definition.unit_family as UnitFamily][0]
        : undefined,
    });
  };

  const valueInput = (index: number, row: ItemParameterWrite) => {
    const definition = byId.get(row.definition_id);
    if (definition?.data_type === 'dimension' && definition.unit_family) {
      const units = UNIT_FAMILY_OPTIONS[definition.unit_family as UnitFamily];
      // Single value or min-max range (FR-002b) — validated text input.
      const valid = isDimensionValueValid(row.value);
      return (
        <>
          <Space.Compact block>
            <Input
              style={{ width: '65%' }}
              status={valid ? undefined : 'error'}
              value={row.value}
              onChange={(e) => setRow(index, { ...row, value: e.target.value })}
            />
            <Select
              style={{ width: '35%' }}
              value={row.unit || units[0]}
              options={units.map((u) => ({ value: u, label: u }))}
              onChange={(unit) => setRow(index, { ...row, unit })}
            />
          </Space.Compact>
          {!valid && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {t({ id: 'pages.inventory.params.rangeInvalid' })}
            </Typography.Text>
          )}
        </>
      );
    }
    if (definition?.data_type === 'number') {
      // Single value or min-max range (FR-002b, iteration 28) — same
      // validated text input as dimension rows, without a unit select.
      const valid = isDimensionValueValid(row.value);
      return (
        <>
          <Input
            status={valid ? undefined : 'error'}
            value={row.value}
            onChange={(e) => setRow(index, { ...row, value: e.target.value })}
          />
          {!valid && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {t({ id: 'pages.inventory.params.rangeInvalid' })}
            </Typography.Text>
          )}
        </>
      );
    }
    if (definition?.data_type === 'single_select') {
      return (
        <Select
          style={{ width: '100%' }}
          value={row.value || undefined}
          options={definition.options.map((o) => ({ value: o, label: o }))}
          onChange={(v) => setRow(index, { ...row, value: v })}
        />
      );
    }
    return (
      <Input value={row.value} onChange={(e) => setRow(index, { ...row, value: e.target.value })} />
    );
  };

  const contentTypeId = definitions[0]?.content_type;

  return (
    <div ref={ref}>
      {rows.map((row, index) => (
        <Row gutter={[8, 8]} key={index} align="middle" wrap={isNarrow} style={{ marginBottom: 8 }}>
          <Col flex={isNarrow ? '100%' : '1 1 0'}>
            <Select
              style={{ width: '100%' }}
              value={row.definition_id || undefined}
              placeholder={t({ id: 'pages.inventory.params.key' })}
              options={keyOptions(row.definition_id)}
              optionRender={renderKeyOption}
              onChange={(id) => onKeyChange(index, id)}
            />
          </Col>
          <Col flex={isNarrow ? '100%' : '2 1 0'}>{valueInput(index, row)}</Col>
          <Col flex="none">
            <Button
              aria-label="remove-parameter"
              icon={<DeleteOutlined />}
              onClick={() => removeRow(index)}
            />
          </Col>
        </Row>
      ))}

      {draft && (
        <Card size="small" style={{ marginBottom: 8 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Input
              placeholder={t({ id: 'pages.inventory.params.name' })}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              placeholder={t({ id: 'pages.inventory.params.emoji' })}
              maxLength={8}
              value={draft.emoji}
              onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
            />
            <Select
              style={{ width: '100%' }}
              placeholder={t({ id: 'pages.inventory.params.typeLabel' })}
              value={draft.data_type}
              options={TYPE_CHOICES.map((c) => ({ value: c.value, label: t({ id: c.labelId }) }))}
              onChange={(data_type) => setDraft({ ...draft, data_type, unit_family: undefined })}
            />
            {draft.data_type === 'dimension' && (
              <Select
                style={{ width: '100%' }}
                placeholder={t({ id: 'pages.inventory.params.familyLabel' })}
                value={draft.unit_family}
                options={FAMILY_CHOICES.map((c) => ({ value: c.value, label: t({ id: c.labelId }) }))}
                onChange={(unit_family) => setDraft({ ...draft, unit_family })}
              />
            )}
            {draft.data_type === 'single_select' && (
              <Input
                placeholder={t({ id: 'pages.inventory.params.optionsHint' })}
                value={draft.options}
                onChange={(e) => setDraft({ ...draft, options: e.target.value })}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setDraft(null)}>{t({ id: 'common.cancel' })}</Button>
              <Button
                type="primary"
                loading={createMutation.isPending}
                disabled={
                  !draft.name.trim() ||
                  (draft.data_type === 'dimension' && !draft.unit_family) ||
                  contentTypeId === undefined
                }
                onClick={() =>
                  createMutation.mutate({
                    content_type: contentTypeId!,
                    name: draft.name.trim(),
                    data_type: draft.data_type,
                    emoji: draft.emoji.trim() || undefined,
                    unit_family: draft.data_type === 'dimension' ? draft.unit_family : undefined,
                    options:
                      draft.data_type === 'single_select'
                        ? draft.options.split(',').map((o) => o.trim()).filter(Boolean)
                        : undefined,
                  })
                }
              >
                {t({ id: 'pages.inventory.params.create' })}
              </Button>
            </div>
          </Space>
        </Card>
      )}

      <Button icon={<PlusOutlined />} onClick={addRow} aria-label="Add parameter">
        {t({ id: 'pages.inventory.params.add' })}
      </Button>
    </div>
  );
}
