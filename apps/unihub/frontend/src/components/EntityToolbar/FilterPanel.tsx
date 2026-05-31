import React from 'react';
import { Button, Card, Divider, Input, Select, Space, Typography } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';
import type { FilterCondition, FilterGroup, FilterOperator, FilterableAttribute, GroupLogic } from './types';

const uid = () => crypto.randomUUID();

// ── Operator definitions ──────────────────────────────────────────────────────

const TEXT_OPS: { value: FilterOperator; labelId: string }[] = [
  { value: 'contains', labelId: 'common.entityOps.op.contains' },
  { value: 'not_contains', labelId: 'common.entityOps.op.notContains' },
  { value: 'equals', labelId: 'common.entityOps.op.equals' },
  { value: 'not_equals', labelId: 'common.entityOps.op.notEquals' },
  { value: 'starts_with', labelId: 'common.entityOps.op.startsWith' },
  { value: 'ends_with', labelId: 'common.entityOps.op.endsWith' },
  { value: 'is_empty', labelId: 'common.entityOps.op.isEmpty' },
  { value: 'is_not_empty', labelId: 'common.entityOps.op.isNotEmpty' },
];

const NUMBER_OPS: { value: FilterOperator; labelId: string }[] = [
  { value: 'eq', labelId: 'common.entityOps.op.eq' },
  { value: 'neq', labelId: 'common.entityOps.op.neq' },
  { value: 'gt', labelId: 'common.entityOps.op.gt' },
  { value: 'gte', labelId: 'common.entityOps.op.gte' },
  { value: 'lt', labelId: 'common.entityOps.op.lt' },
  { value: 'lte', labelId: 'common.entityOps.op.lte' },
];

const DATE_OPS: { value: FilterOperator; labelId: string }[] = [
  { value: 'date_before', labelId: 'common.entityOps.op.dateBefore' },
  { value: 'date_after', labelId: 'common.entityOps.op.dateAfter' },
  { value: 'is_empty', labelId: 'common.entityOps.op.isEmpty' },
  { value: 'is_not_empty', labelId: 'common.entityOps.op.isNotEmpty' },
];

const SELECT_OPS: { value: FilterOperator; labelId: string }[] = [
  { value: 'is', labelId: 'common.entityOps.op.is' },
  { value: 'is_not', labelId: 'common.entityOps.op.isNot' },
];

const NO_VALUE_OPS: FilterOperator[] = ['is_empty', 'is_not_empty'];

function getOpsForAttr(attr: FilterableAttribute | undefined) {
  if (!attr) return TEXT_OPS;
  switch (attr.dataType) {
    case 'number': return NUMBER_OPS;
    case 'date': return DATE_OPS;
    case 'boolean':
    case 'single_select': return SELECT_OPS;
    default: return TEXT_OPS;
  }
}

// ── Condition row ─────────────────────────────────────────────────────────────

interface ConditionRowProps {
  condition: FilterCondition;
  attrs: FilterableAttribute[];
  onUpdate: (updated: FilterCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ConditionRow({ condition, attrs, onUpdate, onRemove, canRemove }: ConditionRowProps) {
  const { formatMessage: t } = useIntl();
  const selectedAttr = attrs.find((a) => a.key === condition.attr);
  const ops = getOpsForAttr(selectedAttr);
  const noValue = NO_VALUE_OPS.includes(condition.op);
  const isValid = condition.attr && condition.op && (noValue || condition.val !== '');

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        style={{ width: 140 }}
        placeholder={t({ id: 'common.entityOps.filter.attribute' })}
        value={condition.attr || undefined}
        options={attrs.map((a) => ({ value: a.key, label: a.label }))}
        onChange={(val) => {
          const defaultOp = getOpsForAttr(attrs.find((a) => a.key === val))[0]?.value ?? 'contains';
          onUpdate({ ...condition, attr: val, op: defaultOp, val: '' });
        }}
        status={!condition.attr ? 'warning' : undefined}
      />
      <Select
        style={{ width: 140 }}
        value={condition.op}
        options={ops.map((o) => ({ value: o.value, label: t({ id: o.labelId }) }))}
        onChange={(val) => onUpdate({ ...condition, op: val as FilterOperator, val: '' })}
      />
      {!noValue && selectedAttr?.dataType === 'single_select' ? (
        <Select
          style={{ flex: 1 }}
          placeholder={t({ id: 'common.entityOps.filter.value' })}
          value={condition.val || undefined}
          options={(selectedAttr.options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={(val) => onUpdate({ ...condition, val })}
          status={!isValid ? 'warning' : undefined}
        />
      ) : !noValue ? (
        <Input
          style={{ flex: 1 }}
          placeholder={t({ id: 'common.entityOps.filter.value' })}
          value={condition.val}
          onChange={(e) => onUpdate({ ...condition, val: e.target.value })}
          status={!isValid ? 'warning' : undefined}
        />
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <Button icon={<CloseOutlined />} onClick={onRemove} disabled={!canRemove} />
    </Space.Compact>
  );
}

// ── Logic connector ───────────────────────────────────────────────────────────
// Shown between conditions inside a group, and as a fixed "OR" between groups.

interface LogicConnectorProps {
  logic: GroupLogic;
  isFirst: boolean;       // only the first connector is interactive
  onChange: (val: GroupLogic) => void;
}

function LogicConnector({ logic, isFirst, onChange }: LogicConnectorProps) {
  const { formatMessage: t } = useIntl();
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
      <Select
        size="small"
        value={logic}
        disabled={!isFirst}
        options={[
          { value: 'and', label: t({ id: 'common.entityOps.filter.and' }) },
          { value: 'or', label: t({ id: 'common.entityOps.filter.or' }) },
        ]}
        onChange={isFirst ? onChange : undefined}
        style={{ width: 72 }}
      />
    </div>
  );
}

// ── Condition group block ─────────────────────────────────────────────────────

interface GroupBlockProps {
  group: FilterGroup;
  attrs: FilterableAttribute[];
  totalGroups: number;
  onUpdate: (updated: FilterGroup) => void;
  onRemove: () => void;
}

function GroupBlock({ group, attrs, totalGroups, onUpdate, onRemove }: GroupBlockProps) {
  const { formatMessage: t } = useIntl();

  const addCondition = () =>
    onUpdate({
      ...group,
      conditions: [...group.conditions, { id: uid(), attr: '', op: 'contains', val: '' }],
    });

  const updateCondition = (idx: number, updated: FilterCondition) =>
    onUpdate({ ...group, conditions: group.conditions.map((c, i) => (i === idx ? updated : c)) });

  const removeCondition = (idx: number) =>
    onUpdate({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });

  const canRemoveCondition = group.conditions.length > 1;

  return (
    <div
      style={{
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      {/* Group header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t({ id: 'common.entityOps.filter.conditionGroup' })}
        </Typography.Text>
        {totalGroups > 1 && (
          <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={onRemove} />
        )}
      </div>

      {/* Conditions with AND/OR connectors between them */}
      {group.conditions.map((c, idx) => (
        <React.Fragment key={c.id}>
          <ConditionRow
            condition={c}
            attrs={attrs}
            onUpdate={(updated) => updateCondition(idx, updated)}
            onRemove={() => removeCondition(idx)}
            canRemove={canRemoveCondition}
          />
          {idx < group.conditions.length - 1 && (
            <LogicConnector
              logic={group.logic}
              isFirst={idx === 0}
              onChange={(val) => onUpdate({ ...group, logic: val })}
            />
          )}
        </React.Fragment>
      ))}

      <Button size="small" icon={<PlusOutlined />} onClick={addCondition} style={{ marginTop: 6 }}>
        {t({ id: 'common.entityOps.filter.addCondition' })}
      </Button>
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

export interface FilterPanelProps {
  attrs: FilterableAttribute[];
  hook: UseEntityFilterReturn;
  onClose: () => void;
}

export function FilterPanel({ attrs, hook, onClose }: FilterPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingGroups, setPendingGroups, apply } = hook;

  const addGroup = () =>
    setPendingGroups([
      ...pendingGroups,
      {
        id: uid(),
        logic: 'and',
        conditions: [
          { id: uid(), attr: '', op: 'contains', val: '' },
          { id: uid(), attr: '', op: 'contains', val: '' },
        ],
      },
    ]);

  const updateGroup = (idx: number, updated: FilterGroup) =>
    setPendingGroups(pendingGroups.map((g, i) => (i === idx ? updated : g)));

  const removeGroup = (idx: number) =>
    setPendingGroups(pendingGroups.filter((_, i) => i !== idx));

  return (
    <Card
      size="small"
      style={{ width: 520, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {pendingGroups.map((g, idx) => (
        <React.Fragment key={g.id}>
          {/* OR connector between groups — same visual language as AND/OR inside groups */}
          {idx > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
              <Select
                size="small"
                value="or"
                disabled
                options={[{ value: 'or', label: t({ id: 'common.entityOps.filter.or' }) }]}
                style={{ width: 72 }}
              />
            </div>
          )}
          <GroupBlock
            group={g}
            attrs={attrs}
            totalGroups={pendingGroups.length}
            onUpdate={(updated) => updateGroup(idx, updated)}
            onRemove={() => removeGroup(idx)}
          />
        </React.Fragment>
      ))}

      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={addGroup}
        style={{ marginTop: 10, marginBottom: 4 }}
      >
        {t({ id: 'common.entityOps.filter.addConditionGroup' })}
      </Button>

      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Button size="small" onClick={onClose}>
          {t({ id: 'common.entityOps.cancel' })}
        </Button>
        <Button size="small" type="primary" onClick={() => { apply(); onClose(); }}>
          {t({ id: 'common.entityOps.apply' })}
        </Button>
      </Space>
    </Card>
  );
}
