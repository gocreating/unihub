import { Button, Card, Checkbox, Divider, Space, Switch, Tooltip, Typography, message } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import type { UseColumnConfigReturn } from './hooks/useColumnConfig';
import type { ColumnDef } from './types';

interface ColumnRowProps {
  col: ColumnDef;
  index: number;
  total: number;
  canHide: boolean;
  onToggleVisible: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ColumnRow({ col, index, total, canHide, onToggleVisible, onMoveUp, onMoveDown }: ColumnRowProps) {
  const { formatMessage: t } = useIntl();
  return (
    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
      <Checkbox
        checked={col.visible}
        onChange={onToggleVisible}
        disabled={col.visible && !canHide}
      >
        {col.label}
      </Checkbox>
      <Space size={2}>
        <Tooltip title={t({ id: 'common.entityOps.columns.moveUp' })}>
          <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={onMoveUp} />
        </Tooltip>
        <Tooltip title={t({ id: 'common.entityOps.columns.moveDown' })}>
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === total - 1}
            onClick={onMoveDown}
          />
        </Tooltip>
      </Space>
    </Space>
  );
}

interface ColumnPanelProps {
  hook: UseColumnConfigReturn;
}

export function ColumnPanel({ hook }: ColumnPanelProps) {
  const { formatMessage: t } = useIntl();
  const { pendingState, setPendingState, apply, cancel } = hook;
  const { columns, stickyLeft, stickyRight } = pendingState;

  // Number of visible columns in the pending state.
  const visibleCount = columns.filter((c) => c.visible).length;

  // Sorted columns for display (by pending order).
  const sorted = [...columns].sort((a, b) => a.order - b.order);

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

  const moveByOrder = (key: string, delta: -1 | 1) => {
    const sortedCols = [...columns].sort((a, b) => a.order - b.order);
    const idx = sortedCols.findIndex((c) => c.key === key);
    const swapIdx = idx + delta;
    if (swapIdx < 0 || swapIdx >= sortedCols.length) return;
    const curr = sortedCols[idx]!;
    const swap = sortedCols[swapIdx]!;
    const newCols = columns.map((c) => {
      if (c.key === curr.key) return { ...c, order: swap.order };
      if (c.key === swap.key) return { ...c, order: curr.order };
      return c;
    });
    setPendingState({ ...pendingState, columns: newCols });
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

      {/* Column rows */}
      {sorted.map((col, idx) => (
        <ColumnRow
          key={col.key}
          col={col}
          index={idx}
          total={sorted.length}
          canHide={visibleCount > 1}
          onToggleVisible={() => toggleVisible(col.key)}
          onMoveUp={() => moveByOrder(col.key, -1)}
          onMoveDown={() => moveByOrder(col.key, 1)}
        />
      ))}

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
