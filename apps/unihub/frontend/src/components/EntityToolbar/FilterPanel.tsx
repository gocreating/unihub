import { Button, Card, Divider, Input, Select, Space, Tag, Typography } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';

const uid = () => crypto.randomUUID();
import type { FilterCondition, FilterGroup, FilterOperator, FilterableAttribute, GroupLogic } from './types';

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

interface ConditionRowProps {
  condition: FilterCondition;
  attrs: FilterableAttribute[];
  onUpdate: (updated: FilterCondition) => void;
  onRemove: () => void;
}

function ConditionRow({ condition, attrs, onUpdate, onRemove }: ConditionRowProps) {
  const { formatMessage: t } = useIntl();
  const selectedAttr = attrs.find((a) => a.key === condition.attr);
  const ops = getOpsForAttr(selectedAttr);
  const noValue = NO_VALUE_OPS.includes(condition.op);

  const isValid = condition.attr && condition.op && (noValue || condition.val !== '');

  return (
    <Space.Compact style={{ width: '100%', marginBottom: 6 }}>
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
      <Button icon={<CloseOutlined />} onClick={onRemove} />
    </Space.Compact>
  );
}

interface GroupBlockProps {
  group: FilterGroup;
  attrs: FilterableAttribute[];
  onUpdate: (updated: FilterGroup) => void;
  onRemove: () => void;
  showRemove: boolean;
}

function GroupBlock({ group, attrs, onUpdate, onRemove, showRemove }: GroupBlockProps) {
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

  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 10, marginBottom: 8 }}>
      <Space style={{ marginBottom: 6 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t({ id: 'common.entityOps.filter.match' })}
        </Typography.Text>
        <Select
          size="small"
          value={group.logic}
          options={[
            { value: 'and', label: t({ id: 'common.entityOps.filter.and' }) },
            { value: 'or', label: t({ id: 'common.entityOps.filter.or' }) },
          ]}
          onChange={(val) => onUpdate({ ...group, logic: val as GroupLogic })}
          style={{ width: 80 }}
        />
        {showRemove && (
          <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={onRemove} />
        )}
      </Space>
      {group.conditions.map((c, idx) => (
        <ConditionRow
          key={c.id}
          condition={c}
          attrs={attrs}
          onUpdate={(updated) => updateCondition(idx, updated)}
          onRemove={() => removeCondition(idx)}
        />
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={addCondition} style={{ marginTop: 2 }}>
        {t({ id: 'common.entityOps.filter.addCondition' })}
      </Button>
    </div>
  );
}

interface FilterPanelProps {
  attrs: FilterableAttribute[];
  hook: UseEntityFilterReturn;
}

export function FilterPanel({ attrs, hook }: FilterPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingGroups, setPendingGroups, apply, cancel, reset } = hook;

  const addGroup = () =>
    setPendingGroups([
      ...pendingGroups,
      { id: uid(), logic: 'and', conditions: [{ id: uid(), attr: '', op: 'contains', val: '' }] },
    ]);

  const updateGroup = (idx: number, updated: FilterGroup) =>
    setPendingGroups(pendingGroups.map((g, i) => (i === idx ? updated : g)));

  const removeGroup = (idx: number) =>
    setPendingGroups(pendingGroups.filter((_, i) => i !== idx));

  return (
    <Card
      size="small"
      style={{ width: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {pendingGroups.map((g, idx) => (
        <GroupBlock
          key={g.id}
          group={g}
          attrs={attrs}
          onUpdate={(updated) => updateGroup(idx, updated)}
          onRemove={() => removeGroup(idx)}
          showRemove={pendingGroups.length > 1}
        />
      ))}
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={addGroup}
        style={{ marginBottom: 8 }}
      >
        {t({ id: 'common.entityOps.filter.addGroup' })}
      </Button>
      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Button size="small" onClick={reset}>
          {t({ id: 'common.entityOps.reset' })}
        </Button>
        <Space>
          <Button size="small" onClick={cancel}>
            {t({ id: 'common.entityOps.cancel' })}
          </Button>
          <Button size="small" type="primary" onClick={apply}>
            {t({ id: 'common.entityOps.apply' })}
          </Button>
        </Space>
      </Space>
    </Card>
  );
}

// Re-export tag helper for toolbar badge usage
export { Tag };
