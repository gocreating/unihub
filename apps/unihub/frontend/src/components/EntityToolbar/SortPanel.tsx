import { useState } from 'react';
import { Button, Card, Divider, Select, Space } from 'antd';
import { CloseOutlined, HolderOutlined, PlusOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import type { FilterableAttribute, SortRule } from './types';

export interface SortPanelProps {
  attrs: FilterableAttribute[];
  hook: UseEntitySortReturn;
  onClose: () => void;
}

export function SortPanel({ attrs, hook, onClose }: SortPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingRules, setPendingRules, apply } = hook;

  // Native HTML5 drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const addRule = () =>
    setPendingRules([...pendingRules, { field: '', direction: 'asc' }]);

  const updateRule = (idx: number, updated: SortRule) =>
    setPendingRules(pendingRules.map((r, i) => (i === idx ? updated : r)));

  const removeRule = (idx: number) => {
    const next = pendingRules.filter((_, i) => i !== idx);
    // Keep at least one row (even empty) so the panel always shows something.
    setPendingRules(next.length > 0 ? next : [{ field: '', direction: 'asc' }]);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragEnter = (idx: number) => setOverIdx(idx);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      const next = [...pendingRules];
      const [item] = next.splice(dragIdx, 1);
      next.splice(idx, 0, item!);
      setPendingRules(next);
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const sortableAttrs = attrs.filter((a) => a.dataType !== 'long_text');

  return (
    <Card
      size="small"
      style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {pendingRules.map((rule, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragEnter={() => handleDragEnter(idx)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 6,
            opacity: dragIdx === idx ? 0.4 : 1,
            borderTop: overIdx === idx && dragIdx !== idx ? '2px solid #1677ff' : '2px solid transparent',
            cursor: 'grab',
          }}
        >
          <HolderOutlined style={{ color: '#bfbfbf', flexShrink: 0, cursor: 'grab' }} />
          <Space.Compact style={{ flex: 1 }}>
            <Select
              style={{ flex: 1 }}
              placeholder={t({ id: 'common.entityOps.sort.attribute' })}
              value={rule.field || undefined}
              options={sortableAttrs.map((a) => ({ value: a.key, label: a.label }))}
              onChange={(val) => updateRule(idx, { ...rule, field: val })}
            />
            <Button
              icon={rule.direction === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
              title={t({ id: 'common.entityOps.sort.direction' })}
              onClick={() => updateRule(idx, { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' })}
            />
          </Space.Compact>
          <Button
            icon={<CloseOutlined />}
            onClick={() => removeRule(idx)}
            style={{ flexShrink: 0 }}
          />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={addRule} style={{ marginBottom: 4 }}>
        {t({ id: 'common.entityOps.sort.addRule' })}
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
