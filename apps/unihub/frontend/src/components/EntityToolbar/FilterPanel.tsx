import React, { useEffect, useRef } from 'react';
import { Button, Divider, Input, InputNumber, Select, Space } from 'antd';
import { useIntl } from 'react-intl';
import { emptyRoot, emptyRule } from './hooks/useEntityFilter';
import type { UseEntityFilterReturn } from './hooks/useEntityFilter';
import type {
  FilterGroupItem,
  FilterItem,
  FilterOperator,
  FilterRuleItem,
  FilterableAttribute,
  GroupLogic,
} from './types';
import { isFilterGroup } from './types';
import { SortableList } from './SortableList';

const uid = () => crypto.randomUUID();

// ── Operator definitions ──────────────────────────────────────────────────────

interface OpDef { value: FilterOperator; labelId: string; noValue?: boolean; }

const TEXT_OPS: OpDef[] = [
  { value: 'contains',     labelId: 'common.entityOps.op.contains' },
  { value: 'not_contains', labelId: 'common.entityOps.op.notContains' },
  { value: 'equals',       labelId: 'common.entityOps.op.equals' },
  { value: 'not_equals',   labelId: 'common.entityOps.op.notEquals' },
  { value: 'starts_with',  labelId: 'common.entityOps.op.startsWith' },
  { value: 'ends_with',    labelId: 'common.entityOps.op.endsWith' },
  { value: 'is_empty',     labelId: 'common.entityOps.op.isEmpty',    noValue: true },
  { value: 'is_not_empty', labelId: 'common.entityOps.op.isNotEmpty', noValue: true },
];
const NUMBER_OPS: OpDef[] = [
  { value: 'eq',  labelId: 'common.entityOps.op.eq' },
  { value: 'neq', labelId: 'common.entityOps.op.neq' },
  { value: 'gt',  labelId: 'common.entityOps.op.gt' },
  { value: 'gte', labelId: 'common.entityOps.op.gte' },
  { value: 'lt',  labelId: 'common.entityOps.op.lt' },
  { value: 'lte', labelId: 'common.entityOps.op.lte' },
  { value: 'is_empty',     labelId: 'common.entityOps.op.isEmpty',    noValue: true },
];
const DATE_OPS: OpDef[] = [
  { value: 'date_before',  labelId: 'common.entityOps.op.dateBefore' },
  { value: 'date_after',   labelId: 'common.entityOps.op.dateAfter' },
  { value: 'is_empty',     labelId: 'common.entityOps.op.isEmpty',    noValue: true },
  { value: 'is_not_empty', labelId: 'common.entityOps.op.isNotEmpty', noValue: true },
];
const SELECT_OPS: OpDef[] = [
  { value: 'is',     labelId: 'common.entityOps.op.is' },
  { value: 'is_not', labelId: 'common.entityOps.op.isNot' },
];

function getOps(attr: FilterableAttribute | undefined): OpDef[] {
  if (!attr) return TEXT_OPS;
  switch (attr.dataType) {
    case 'number': return NUMBER_OPS;
    case 'date':   return DATE_OPS;
    case 'boolean':
    case 'single_select': return SELECT_OPS;
    default: return TEXT_OPS;
  }
}

// ── Shared inline styles (mirrors the HTML prototype's CSS) ──────────────────

const css = {
  ruleRow: (isDragging: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 8px', borderRadius: 6, flexWrap: 'wrap',
    border: '1px solid #f0f0f0',
    background: isDragging ? '#fafafa' : '#ffffff',
    opacity: isDragging ? 0.35 : 1,
  }),
  dropIndicator: {
    height: 2, background: '#1677ff', borderRadius: 2,
    margin: '3px 0', boxShadow: '0 0 6px rgba(22,119,255,0.5)',
  } as React.CSSProperties,
  dragHandle: (canDrag: boolean): React.CSSProperties => ({
    color: '#bfbfbf', fontSize: 16, flexShrink: 0,
    cursor: canDrag ? 'grab' : 'not-allowed',
    opacity: canDrag ? 1 : 0.2,
    userSelect: 'none', lineHeight: 1,
  }),
  logicBadge: {
    display: 'inline-flex', alignItems: 'center',
    padding: '1px 8px', fontSize: 11, fontWeight: 500,
    borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)',
    cursor: 'pointer', userSelect: 'none' as const,
    background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.88)',
    letterSpacing: '0.03em',
  } as React.CSSProperties,
  ghostBtn: {
    border: 'none', background: 'transparent',
    color: 'rgba(0,0,0,0.45)', fontSize: 12,
    cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', lineHeight: 1,
  } as React.CSSProperties,
  removeRuleBtn: {
    border: 'none', background: 'transparent',
    color: 'rgba(0,0,0,0.25)', cursor: 'pointer',
    fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0,
  } as React.CSSProperties,
  removeGroupBtn: (depth: number): React.CSSProperties => ({
    position: 'absolute', top: -9, right: -9, zIndex: 1,
    width: 18, height: 18, borderRadius: '50%',
    border: '1px solid #d9d9d9',
    background: depth === 1 ? '#fafafa' : '#ffffff',
    color: 'rgba(0,0,0,0.35)', fontSize: 11,
    cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 0,
  }),
  noValue: {
    fontSize: 12, color: 'rgba(0,0,0,0.45)',
    fontStyle: 'italic', flex: 1,
  } as React.CSSProperties,
  chip: (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '1px 8px', borderRadius: 12,
    border: `1px solid ${active ? '#1677ff' : '#d9d9d9'}`,
    background: active ? '#e6f4ff' : '#f5f5f5',
    color: active ? '#1677ff' : 'rgba(0,0,0,0.45)',
    cursor: 'pointer', userSelect: 'none',
    transition: 'all 0.15s',
  }),
};

// ── RuleRow ───────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: FilterRuleItem;
  attrs: FilterableAttribute[];
  onUpdate: (r: FilterRuleItem) => void;
  onRemove: () => void;
  canDrag: boolean;
  isDragging: boolean;
  handleProps: React.HTMLAttributes<HTMLElement>;
}

function RuleRow({ rule, attrs, onUpdate, onRemove, canDrag, isDragging, handleProps }: RuleRowProps) {
  const { formatMessage: t } = useIntl();
  const attr = attrs.find((a) => a.key === rule.attr);
  const ops = getOps(attr);
  const opDef = ops.find((o) => o.value === rule.op);
  const noValue = opDef?.noValue ?? false;

  const changeField = (val: string) => {
    const newOp = getOps(attrs.find((a) => a.key === val))?.[0]?.value ?? 'contains';
    onUpdate({ ...rule, attr: val, op: newOp, val: '' });
  };
  const changeOp = (val: string) => onUpdate({ ...rule, op: val as FilterOperator, val: '' });
  const changeVal = (val: string) => onUpdate({ ...rule, val });

  return (
    <div data-rule-row style={css.ruleRow(isDragging)}>
      {/* Drag handle — connected to dnd-kit via handleProps */}
      <span aria-hidden {...handleProps} style={css.dragHandle(canDrag)}>⠿</span>

      {/* Field selector */}
      <Select
        size="small"
        style={{ width: 118 }}
        placeholder={t({ id: 'common.entityOps.filter.attribute' })}
        value={rule.attr || undefined}
        options={attrs.map((a) => ({ value: a.key, label: a.label }))}
        onChange={changeField}
      />

      {/* Operator selector */}
      <Select
        size="small"
        style={{ width: 148 }}
        value={rule.op}
        options={ops.map((o) => ({ value: o.value, label: t({ id: o.labelId }) }))}
        onChange={changeOp}
      />

      {/* Value input */}
      {noValue ? (
        <span style={css.noValue}>{t({ id: 'common.entityOps.filter.noValueNeeded' })}</span>
      ) : attr?.dataType === 'single_select' ? (
        <Select
          size="small"
          style={{ flex: 1, minWidth: 100 }}
          placeholder={t({ id: 'common.entityOps.filter.value' })}
          value={rule.val || undefined}
          options={(attr.options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={changeVal}
        />
      ) : attr?.dataType === 'number' ? (
        <InputNumber
          size="small"
          style={{ flex: 1, minWidth: 80 }}
          placeholder={t({ id: 'common.entityOps.filter.value' })}
          value={rule.val !== '' ? Number(rule.val) : undefined}
          onChange={(v) => changeVal(v?.toString() ?? '')}
        />
      ) : attr?.dataType === 'date' ? (
        <Input
          size="small"
          type="date"
          style={{ flex: 1, minWidth: 130 }}
          value={rule.val}
          onChange={(e) => changeVal(e.target.value)}
        />
      ) : (
        <Input
          size="small"
          style={{ flex: 1, minWidth: 100 }}
          placeholder={t({ id: 'common.entityOps.filter.value' })}
          value={rule.val}
          onChange={(e) => changeVal(e.target.value)}
        />
      )}

      {/* Remove rule — disabled when it is the only item in the group */}
      <button
        aria-label="✕"
        disabled={!canDrag}
        style={{ ...css.removeRuleBtn, opacity: canDrag ? 1 : 0.3, cursor: canDrag ? 'pointer' : 'not-allowed' }}
        onClick={canDrag ? onRemove : undefined}
      >✕</button>
    </div>
  );
}

// ── GroupCard — renders a group and its children recursively ─────────────────

interface GroupCardProps {
  group: FilterGroupItem;
  attrs: FilterableAttribute[];
  depth: number;         // 0 = root, 1 = nested
  onUpdate: (g: FilterGroupItem) => void;
  onRemove: (() => void) | null; // null = root (can't be removed)
  canDelete?: boolean;   // whether the ✕ remove button is enabled (default true)
}

function GroupCard({ group, attrs, depth, onUpdate, onRemove, canDelete = true }: GroupCardProps) {
  const { formatMessage: t } = useIntl();

  const updateItem = (id: string, updated: FilterItem) =>
    onUpdate({ ...group, rules: group.rules.map((r) => (r.id === id ? updated : r)) });

  const removeItem = (id: string) =>
    onUpdate({ ...group, rules: group.rules.filter((r) => r.id !== id) });

  const addRule = () =>
    onUpdate({ ...group, rules: [...group.rules, emptyRule()] });

  const addGroup = () =>
    onUpdate({
      ...group,
      rules: [
        ...group.rules,
        { id: uid(), type: 'group', logic: group.logic === 'and' ? 'or' : 'and', rules: [emptyRule(), emptyRule()] } satisfies FilterGroupItem,
      ],
    });

  const toggleLogic = () =>
    onUpdate({ ...group, logic: (group.logic === 'and' ? 'or' : 'and') as GroupLogic });

  const handleReorder = (reordered: FilterItem[]) =>
    onUpdate({ ...group, rules: reordered });

  const canDelete2 = group.rules.length > 1;

  return (
    <div style={{ position: 'relative' }}>
      {onRemove && (
        <button
          aria-label="✕"
          title={t({ id: 'common.entityOps.filter.removeConditionGroup' })}
          disabled={!canDelete}
          onClick={canDelete ? onRemove : undefined}
          style={{ ...css.removeGroupBtn(depth), opacity: canDelete ? 1 : 0.3, cursor: canDelete ? 'pointer' : 'not-allowed' }}
        >
          ✕
        </button>
      )}

      <div
        style={{
          background: depth > 0 ? 'rgba(0,0,0,0.03)' : 'transparent',
          border: depth > 0 ? '1px solid #d9d9d9' : 'none',
          borderRadius: depth > 0 ? 6 : 0,
          overflow: 'visible',
        }}
      >
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <SortableList
            items={group.rules}
            onReorder={handleReorder}
            renderItem={(item, handleProps, isDragging) => {
              const idx = group.rules.findIndex((r) => r.id === item.id);
              return (
                <React.Fragment>
                  {/* AND/OR badge between items */}
                  {idx > 0 && (
                    <div style={{ padding: '4px 0' }}>
                      <span style={css.logicBadge} onClick={toggleLogic} data-testid="logic-badge">
                        {group.logic.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {isFilterGroup(item) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isDragging ? 0.35 : 1 }}>
                      <span aria-hidden {...handleProps} style={css.dragHandle(true)}>⠿</span>
                      <div style={{ flex: 1 }}>
                        <GroupCard
                          group={item}
                          attrs={attrs}
                          depth={depth + 1}
                          onUpdate={(updated) => updateItem(item.id, updated)}
                          onRemove={() => removeItem(item.id)}
                          canDelete={canDelete2}
                        />
                      </div>
                    </div>
                  ) : (
                    <RuleRow
                      rule={item}
                      attrs={attrs}
                      onUpdate={(updated) => updateItem(item.id, updated)}
                      onRemove={() => removeItem(item.id)}
                      canDrag={canDelete2}
                      isDragging={isDragging}
                      handleProps={handleProps}
                    />
                  )}
                </React.Fragment>
              );
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px' }}>
          <button style={css.ghostBtn} onClick={addRule}>
            {t({ id: 'common.entityOps.filter.addCondition' })}
          </button>
          {depth < 1 && (
            <button style={css.ghostBtn} onClick={addGroup}>
              {t({ id: 'common.entityOps.filter.addConditionGroup' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FilterPanel ───────────────────────────────────────────────────────────────

export interface FilterPanelProps {
  attrs: FilterableAttribute[];
  hook: UseEntityFilterReturn;
  onApply: () => void;
  onClose: () => void;
  focusCancelOn?: number;
}

export function FilterPanel({ attrs, hook, onApply, onClose, focusCancelOn }: FilterPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingRoot, setPendingRoot, apply, cancel, reset, isDirty, isActive } = hook;
  const cancelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusCancelOn) return;
    const btn = cancelRef.current?.querySelector<HTMLButtonElement>('button');
    if (!btn) return;
    btn.focus();
    btn.style.boxShadow = '0 0 0 3px rgba(22,119,255,0.45)';
    const t = setTimeout(() => { btn.style.boxShadow = ''; }, 700);
    return () => clearTimeout(t);
  }, [focusCancelOn]);

  const root: FilterGroupItem = pendingRoot ?? emptyRoot();
  const resetDisabled = !isActive && !isDirty;

  return (
    <div
      style={{
        width: 520,
        background: '#ffffff',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        padding: 12,
      }}
    >
      <GroupCard
        group={root}
        attrs={attrs}
        depth={0}
        onUpdate={setPendingRoot}
        onRemove={null}
      />

      <Divider style={{ margin: '10px 0 8px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button size="small" disabled={resetDisabled} onClick={() => { reset(); onApply(); }}>
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
      </div>
    </div>
  );
}
