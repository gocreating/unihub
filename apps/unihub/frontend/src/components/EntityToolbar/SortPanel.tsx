import { useEffect, useRef } from 'react';
import { Button, Card, Divider, Radio, Select, Space, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HolderOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignMiddleOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons';
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

/** Matches FilterPanel's ghostBtn — no border, transparent, muted colour */
const ghostBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent',
  color: 'rgba(0,0,0,0.45)', fontSize: 12,
  cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', lineHeight: 1,
};

/** Matches FilterPanel's removeRuleBtn */
const deleteBtnStyle = (disabled: boolean): React.CSSProperties => ({
  border: 'none', background: 'transparent',
  color: disabled ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.25)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0,
});

export function SortPanel({ attrs, hook, onApply, onClose, focusCancelOn }: SortPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingRules, setPendingRules, apply, cancel, reset, isDirty, isDefault } = hook;
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

  // Stable id per position — SortRule has no id, so we assign one by index.
  const items = pendingRules.map((r, i) => ({
    ...r,
    id: `rule-${i}`,
  }));

  const addRule = () =>
    setPendingRules([...pendingRules, { field: '', direction: 'asc' }]);

  // Lookup by generated id → index in pendingRules so we never rely on r.id.
  // Extract only SortRule fields — callers spread `item` (which has `id`) into `updated`.
  const updateRule = (id: string, updated: SortRule) => {
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return;
    const rule: SortRule = { field: updated.field, direction: updated.direction, nulls: updated.nulls };
    setPendingRules(pendingRules.map((r, i) => (i === idx ? rule : r)));
  };

  const removeRule = (id: string) => {
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return;
    const next = pendingRules.filter((_, i) => i !== idx);
    setPendingRules(next.length > 0 ? next : [{ field: '', direction: 'asc' }]);
  };

  const sortableAttrs = attrs.filter((a) => a.dataType !== 'long_text');
  const usedFields = new Set(pendingRules.map((r) => r.field).filter(Boolean));
  const canDelete = pendingRules.length > 1;

  const handleReorder = (reordered: typeof items) => {
    setPendingRules(reordered.map((item) => ({ field: item.field, direction: item.direction, nulls: item.nulls })));
  };

  return (
    <Card
      size="small"
      style={{ width: 'max-content', minWidth: 360, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {/* Constitution v1.20.0: panels never overflow the viewport. */}
      <div data-panel-scroll style={{ maxHeight: '60vh', overflowY: 'auto' }}>
      <SortableList
        items={items}
        onReorder={handleReorder}
        renderItem={(item, handleProps) => (
          /* Every control on ONE line */
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {/* Drag handle */}
            <span {...handleProps} style={{ color: '#bfbfbf', flexShrink: 0, cursor: 'grab', lineHeight: 1 }}>
              <HolderOutlined />
            </span>

            {/* Field — same size as FilterPanel field selector */}
            <Select
              size="small"
              style={{ width: 118 }}
              placeholder={t({ id: 'common.entityOps.sort.attribute' })}
              value={item.field || undefined}
              options={sortableAttrs.map((a) => ({
                value: a.key,
                label: a.label,
                disabled: a.key !== item.field && usedFields.has(a.key),
              }))}
              onChange={(val) => updateRule(item.id, { ...item, field: val })}
            />

            {/* Asc / Desc — icon-only radio blocks */}
            <Radio.Group
              size="small"
              optionType="button"
              buttonStyle="solid"
              value={item.direction}
              onChange={(e) => updateRule(item.id, { ...item, direction: e.target.value })}
            >
              <Tooltip title={t({ id: 'common.entityOps.sort.asc' })}>
                <Radio.Button value="asc"><ArrowUpOutlined /></Radio.Button>
              </Tooltip>
              <Tooltip title={t({ id: 'common.entityOps.sort.desc' })}>
                <Radio.Button value="desc"><ArrowDownOutlined /></Radio.Button>
              </Tooltip>
            </Radio.Group>

            {/* Null ordering — icon-only radio blocks, same style */}
            <Radio.Group
              size="small"
              optionType="button"
              buttonStyle="solid"
              value={item.nulls ?? 'default'}
              onChange={(e) => {
                const v = e.target.value;
                updateRule(item.id, { ...item, nulls: v === 'default' ? undefined : v });
              }}
            >
              <Tooltip title={t({ id: 'common.entityOps.sort.nullsDefault' })}>
                <Radio.Button value="default"><VerticalAlignMiddleOutlined /></Radio.Button>
              </Tooltip>
              <Tooltip title={t({ id: 'common.entityOps.sort.nullsFirst' })}>
                <Radio.Button value="first"><VerticalAlignTopOutlined /></Radio.Button>
              </Tooltip>
              <Tooltip title={t({ id: 'common.entityOps.sort.nullsLast' })}>
                <Radio.Button value="last"><VerticalAlignBottomOutlined /></Radio.Button>
              </Tooltip>
            </Radio.Group>

            {/* Delete ✕ — matches FilterPanel remove button */}
            <button
              aria-label="✕"
              disabled={!canDelete}
              style={deleteBtnStyle(!canDelete)}
              onClick={canDelete ? () => removeRule(item.id) : undefined}
            >
              ✕
            </button>
          </div>
        )}
      />

      {/* Add rule — ghost button, i18n text already contains "+" */}
      <button style={ghostBtnStyle} onClick={addRule}>
        {t({ id: 'common.entityOps.sort.addRule' })}
      </button>
      </div>

      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button size="small" disabled={isDefault && !isDirty} onClick={() => { reset(); onApply(); }}>
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
