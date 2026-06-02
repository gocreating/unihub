import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Checkbox, Divider, Space, Switch, Typography, message } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
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
    const sortedCols = [...columns].sort((a, b) => a.order - b.order);
    const fromIdx = sortedCols.findIndex((c) => c.key === dragKey);
    const toIdx = sortedCols.findIndex((c) => c.key === targetKey);
    if (fromIdx === -1 || toIdx === -1) return;

    // Reassign orders by swapping positions.
    const reordered = [...sortedCols];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved!);
    const newCols = columns.map((c) => {
      const newOrder = reordered.findIndex((r) => r.key === c.key);
      return { ...c, order: newOrder };
    });
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
      {/* Sticky toggles */}
      <Space direction="vertical" style={{ width: '100%', marginBottom: 8 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text style={{ fontSize: 13 }}>
            {t({ id: 'common.entityOps.columns.stickyLeft' })}
          </Typography.Text>
          <Switch
            size="small"
            checked={stickyLeft}
            onChange={(val) => setPendingState({ ...pendingState, stickyLeft: val })}
          />
        </Space>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text style={{ fontSize: 13 }}>
            {t({ id: 'common.entityOps.columns.stickyRight' })}
          </Typography.Text>
          <Switch
            size="small"
            checked={stickyRight}
            onChange={(val) => setPendingState({ ...pendingState, stickyRight: val })}
          />
        </Space>
      </Space>
      <Divider style={{ margin: '8px 0' }} />

      {/* Draggable column rows */}
      {sorted.map((col) => (
        <div
          key={col.key}
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
        </div>
      ))}

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
