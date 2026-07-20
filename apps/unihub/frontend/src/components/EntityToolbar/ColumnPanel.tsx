import { useEffect, useMemo, useRef } from 'react';
import { Button, Card, Checkbox, Divider, Space, Tooltip, message } from 'antd';
import { HolderOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import { compareDisplayOrder } from './hooks/useColumnConfig';
import type { PinSide } from './types';
import { SortableList } from './SortableList';

export interface ColumnPanelProps {
  hook: UseColumnConfigReturn;
  onApply: () => void;
  onClose: () => void;
  focusCancelOn?: number;
}

export function ColumnPanel({ hook, onApply, onClose, focusCancelOn }: ColumnPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingState, setPendingState, apply, cancel, reset, isDirty, isCustomised } = hook;
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

  const { columns } = pendingState;
  const visibleCount = columns.filter((c) => c.visible).length;

  // Rows render in DISPLAY order — pinned groups at the edges, `order` within
  // each group — so the panel is WYSIWYG with the table (017: per-column pins).
  const sorted = useMemo(() => [...columns].sort(compareDisplayOrder), [columns]);

  const toggleVisible = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col) return;
    if (col.visible && visibleCount <= 1) {
      void message.warning(t({ id: 'common.entityOps.columns.mustHaveOne' }));
      return;
    }
    setPendingState({
      ...pendingState,
      columns: columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)),
    });
  };

  // Clicking the active side unpins; clicking the other side swaps (a column
  // pins to at most one side). Pins never mutate `order`.
  const togglePin = (key: string, side: PinSide) => {
    setPendingState({
      ...pendingState,
      columns: columns.map((c) =>
        c.key === key ? { ...c, pin: c.pin === side ? undefined : side } : c,
      ),
    });
  };

  // SortableList requires items with `id` field; ColumnDef uses `key`
  const sortableItems = sorted.map((col) => ({ ...col, id: col.key }));

  const handleReorder = (reordered: typeof sortableItems) => {
    setPendingState({
      ...pendingState,
      columns: columns.map((c) => ({ ...c, order: reordered.findIndex((r) => r.key === c.key) })),
    });
  };

  const pinButton = (col: { key: string; pin?: PinSide }, side: PinSide) => {
    const active = col.pin === side;
    const label = t({ id: side === 'left' ? 'common.entityOps.columns.pinLeft' : 'common.entityOps.columns.pinRight' });
    return (
      <Tooltip title={label}>
        <button
          data-sticky-pin={side}
          aria-label={label}
          onClick={() => togglePin(col.key, side)}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: active ? '#1677ff' : '#bfbfbf', padding: '0 2px',
            lineHeight: 1, flexShrink: 0, fontSize: 14,
          }}
        >
          {/* The right-side pushpin mirrors horizontally so the two sides are
              distinguishable at a glance. */}
          <span style={side === 'right' ? { display: 'inline-flex', transform: 'scaleX(-1)' } : { display: 'inline-flex' }}>
            {active ? <PushpinFilled /> : <PushpinOutlined />}
          </span>
        </button>
      </Tooltip>
    );
  };

  return (
    <Card
      size="small"
      style={{ width: 'max-content', minWidth: 260, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {/* Constitution v1.20.0: the panel must never overflow the viewport —
          the (potentially long) column list scrolls internally while the
          Reset/Cancel/Apply footer stays visible. */}
      <div data-panel-scroll style={{ maxHeight: '60vh', overflowY: 'auto' }}>
      <SortableList
        items={sortableItems}
        onReorder={handleReorder}
        renderItem={(col, handleProps) => (
          <div
            data-column-row={col.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 4, padding: '2px 0',
            }}
          >
            <span {...handleProps} style={{ color: '#bfbfbf', flexShrink: 0, cursor: 'grab', lineHeight: 1 }}>
              <HolderOutlined />
            </span>
            <Checkbox
              checked={col.visible}
              onChange={() => toggleVisible(col.key)}
              disabled={col.visible && visibleCount <= 1}
              style={{ flex: 1 }}
            >
              {col.label}
            </Checkbox>
            {pinButton(col, 'left')}
            {pinButton(col, 'right')}
          </div>
        )}
      />
      </div>

      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button size="small" disabled={!isCustomised && !isDirty} onClick={() => { reset(); onApply(); }}>
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
