import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Checkbox, Divider, Space, message } from 'antd';
import { HolderOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';

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
  const { columns, stickyLeft, stickyRight } = pendingState;

  const visibleCount = columns.filter((c) => c.visible).length;
  const sorted = useMemo(() => [...columns].sort((a, b) => a.order - b.order), [columns]);

  // Keys for the first and last visible columns (for inline sticky toggles)
  const firstVisibleKey = sorted.find((c) => c.visible)?.key;
  const lastVisibleKey = [...sorted].reverse().find((c) => c.visible)?.key;

  // Native HTML5 drag state
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

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

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      setOverKey(null);
      return;
    }
    const reordered = [...columns].sort((a, b) => a.order - b.order);
    const fromIdx = reordered.findIndex((c) => c.key === dragKey);
    if (fromIdx === -1) return;

    // Remove dragged item first, then find target in the modified array
    // so insertion index is correct regardless of dragged item's original position.
    const [moved] = reordered.splice(fromIdx, 1);
    const toIdx = reordered.findIndex((c) => c.key === targetKey);
    if (!moved || toIdx === -1) return;

    reordered.splice(toIdx, 0, moved);
    const newCols = columns.map((c) => ({
      ...c,
      order: reordered.findIndex((r) => r.key === c.key),
    }));
    setPendingState({ ...pendingState, columns: newCols });
    setDragKey(null);
    setOverKey(null);
  };

  return (
    <Card
      size="small"
      style={{ width: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      styles={{ body: { padding: 12 } }}
    >
      {/* Draggable column rows — sticky pin appears inline on first/last visible row */}
      {sorted.map((col) => {
        const isFirst = col.key === firstVisibleKey;
        const isLast  = col.key === lastVisibleKey && firstVisibleKey !== lastVisibleKey;
        return (
          <div
            key={col.key}
            data-column-row={col.key}
            draggable
            onDragStart={() => setDragKey(col.key)}
            onDragEnter={() => setOverKey(col.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.key)}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
              padding: '2px 0',
              opacity: dragKey === col.key ? 0.4 : 1,
              borderTop: overKey === col.key && dragKey !== col.key ? '2px solid #1677ff' : '2px solid transparent',
              cursor: 'grab',
            }}
          >
            <HolderOutlined style={{ color: '#bfbfbf', flexShrink: 0 }} />
            <Checkbox
              checked={col.visible}
              onChange={() => toggleVisible(col.key)}
              disabled={col.visible && visibleCount <= 1}
              style={{ flex: 1 }}
            >
              {col.label}
            </Checkbox>
            {isFirst && (
              <button
                data-sticky-pin="left"
                onClick={() => setPendingState({ ...pendingState, stickyLeft: !stickyLeft })}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: stickyLeft ? '#1677ff' : '#bfbfbf', padding: '0 2px', lineHeight: 1,
                  flexShrink: 0, fontSize: 14,
                }}
              >
                {stickyLeft ? <PushpinFilled /> : <PushpinOutlined />}
              </button>
            )}
            {isLast && (
              <button
                data-sticky-pin="right"
                onClick={() => setPendingState({ ...pendingState, stickyRight: !stickyRight })}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: stickyRight ? '#1677ff' : '#bfbfbf', padding: '0 2px', lineHeight: 1,
                  flexShrink: 0, fontSize: 14,
                }}
              >
                {stickyRight ? <PushpinFilled /> : <PushpinOutlined />}
              </button>
            )}
          </div>
        );
      })}

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
