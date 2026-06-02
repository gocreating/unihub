import { useEffect, useRef } from 'react';
import { Button, Card, Divider, Select, Space } from 'antd';
import { CloseOutlined, HolderOutlined, PlusOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseEntitySortReturn } from './hooks/useEntitySort';
import type { FilterableAttribute, SortRule } from './types';
import { SortableList } from './SortableList';

export interface SortPanelProps {
  attrs: FilterableAttribute[];
  hook: UseEntitySortReturn;
  onApply: () => void;
  onClose: () => void;
  focusCancelOn?: number;
}

export function SortPanel({ attrs, hook, onApply, onClose, focusCancelOn }: SortPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingRules, setPendingRules, apply, cancel, reset, isDirty, isActive } = hook;
  const cancelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusCancelOn) return;
    const btn = cancelRef.current?.querySelector<HTMLButtonElement>('button');
    if (!btn) return;
    btn.focus();
    btn.style.boxShadow = '0 0 0 3px rgba(22,119,255,0.45)';
    const timer = setTimeout(() => { btn.style.boxShadow = ''; }, 700);
    return () => clearTimeout(timer);
  }, [focusCancelOn]);

  const addRule = () =>
    setPendingRules([...pendingRules, { field: '', direction: 'asc' }]);

  const updateRule = (id: string, updated: SortRule) =>
    setPendingRules(pendingRules.map((r) => (r.field === id || (r as SortRule & { id?: string }).id === id ? updated : r)));

  const removeRule = (id: string) => {
    const next = pendingRules.filter((r) => (r as SortRule & { id?: string }).id !== id);
    setPendingRules(next.length > 0 ? next : [{ field: '', direction: 'asc' }]);
  };

  const sortableAttrs = attrs.filter((a) => a.dataType !== 'long_text');

  // dnd-kit requires each item to have a stable string id
  const items = pendingRules.map((r, i) => ({
    ...r,
    id: (r as SortRule & { id?: string }).id ?? `rule-${i}`,
  }));

  const handleReorder = (reordered: typeof items) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setPendingRules(reordered.map(({ id: _id, ...rule }) => rule as SortRule));
  };

  return (
    <Card
      size="small"
      style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      <SortableList
        items={items}
        onReorder={handleReorder}
        renderItem={(item, handleProps) => (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}
          >
            <span {...handleProps} style={{ color: '#bfbfbf', flexShrink: 0, cursor: 'grab', lineHeight: 1 }}>
              <HolderOutlined />
            </span>
            <Space.Compact style={{ flex: 1 }}>
              <Select
                style={{ flex: 1 }}
                placeholder={t({ id: 'common.entityOps.sort.attribute' })}
                value={item.field || undefined}
                options={sortableAttrs.map((a) => ({ value: a.key, label: a.label }))}
                onChange={(val) => updateRule(item.id, { field: val, direction: item.direction })}
              />
              <Button
                icon={item.direction === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                title={t({ id: 'common.entityOps.sort.direction' })}
                onClick={() => updateRule(item.id, { field: item.field, direction: item.direction === 'asc' ? 'desc' : 'asc' })}
              />
            </Space.Compact>
            <Button
              icon={<CloseOutlined />}
              onClick={() => removeRule(item.id)}
              style={{ flexShrink: 0 }}
            />
          </div>
        )}
      />
      <Button size="small" icon={<PlusOutlined />} onClick={addRule} style={{ marginBottom: 4 }}>
        {t({ id: 'common.entityOps.sort.addRule' })}
      </Button>
      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button size="small" disabled={!isActive && !isDirty} onClick={() => { reset(); onApply(); }}>
            {t({ id: 'common.entityOps.reset' })}
          </Button>
          <div ref={cancelRef}>
            <Button size="small" onClick={() => { cancel(); onClose(); }}>
              {t({ id: 'common.entityOps.cancel' })}
            </Button>
          </div>
        </Space>
        <Button size="small" type="primary" disabled={!isDirty} onClick={() => { apply(); onApply(); }}>
          {t({ id: 'common.entityOps.apply' })}
        </Button>
      </Space>
    </Card>
  );
}
