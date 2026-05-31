import { Button, Card, Divider, Select, Space, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  PlusOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import type { FilterableAttribute, SortRule } from './types';

interface SortRuleRowProps {
  rule: SortRule;
  attrs: FilterableAttribute[];
  index: number;
  total: number;
  onUpdate: (updated: SortRule) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortRuleRow({ rule, attrs, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }: SortRuleRowProps) {
  const { formatMessage: t } = useIntl();
  return (
    <Space.Compact style={{ width: '100%', marginBottom: 6 }}>
      <Select
        style={{ flex: 1 }}
        placeholder={t({ id: 'common.entityOps.sort.attribute' })}
        value={rule.field || undefined}
        options={attrs.map((a) => ({ value: a.key, label: a.label }))}
        onChange={(val) => onUpdate({ ...rule, field: val })}
      />
      <Tooltip title={t({ id: 'common.entityOps.sort.direction' })}>
        <Button
          icon={rule.direction === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
          onClick={() => onUpdate({ ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' })}
        />
      </Tooltip>
      <Tooltip title={t({ id: 'common.entityOps.sort.moveUp' })}>
        <Button icon={<ArrowUpOutlined />} disabled={index === 0} onClick={onMoveUp} />
      </Tooltip>
      <Tooltip title={t({ id: 'common.entityOps.sort.moveDown' })}>
        <Button icon={<ArrowDownOutlined />} disabled={index === total - 1} onClick={onMoveDown} />
      </Tooltip>
      <Button icon={<CloseOutlined />} onClick={onRemove} />
    </Space.Compact>
  );
}

interface SortPanelProps {
  attrs: FilterableAttribute[];
  hook: UseEntitySortReturn;
}

export function SortPanel({ attrs, hook }: SortPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingRules, setPendingRules, apply, cancel } = hook;

  const addRule = () =>
    setPendingRules([...pendingRules, { field: '', direction: 'asc' }]);

  const updateRule = (idx: number, updated: SortRule) =>
    setPendingRules(pendingRules.map((r, i) => (i === idx ? updated : r)));

  const removeRule = (idx: number) =>
    setPendingRules(pendingRules.filter((_, i) => i !== idx));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...pendingRules];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    setPendingRules(next);
  };

  const moveDown = (idx: number) => {
    if (idx === pendingRules.length - 1) return;
    const next = [...pendingRules];
    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
    setPendingRules(next);
  };

  return (
    <Card
      size="small"
      style={{ width: 440, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {pendingRules.map((rule, idx) => (
        <SortRuleRow
          key={idx}
          rule={rule}
          attrs={attrs.filter((a) => a.dataType !== 'long_text')}
          index={idx}
          total={pendingRules.length}
          onUpdate={(updated) => updateRule(idx, updated)}
          onRemove={() => removeRule(idx)}
          onMoveUp={() => moveUp(idx)}
          onMoveDown={() => moveDown(idx)}
        />
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={addRule} style={{ marginBottom: 8 }}>
        {t({ id: 'common.entityOps.sort.addRule' })}
      </Button>
      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button size="small" onClick={cancel}>
          {t({ id: 'common.entityOps.cancel' })}
        </Button>
        <Button size="small" type="primary" onClick={apply}>
          {t({ id: 'common.entityOps.apply' })}
        </Button>
      </Space>
    </Card>
  );
}
