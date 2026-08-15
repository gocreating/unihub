import { Button, Dropdown, Space } from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface PanelAction {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  /** Rendered but non-interactive (e.g. an entity frozen by its state). */
  disabled?: boolean;
  onClick: () => void;
}

export interface PanelHeaderActionsProps {
  /** True when the panel's CONTENT area is narrow (page-owned measurement). */
  narrow: boolean;
  /** Actions shown as buttons on wide content; folded into the kebab on narrow. */
  visible: PanelAction[];
  /** Advanced/destructive actions — ALWAYS inside the kebab. */
  advanced: PanelAction[];
  /** aria-label for the kebab trigger (per-panel, for tests/screen readers). */
  kebabLabel: string;
}

/**
 * Panel-header action pattern (constitution v1.21.0): actions sit on the
 * right of a panel header; destructive actions fold into a kebab (⋯) menu by
 * default; on a narrow content area the visible actions fold in too. The
 * kebab dropdown right-aligns to its trigger and opens leftward.
 */
export function PanelHeaderActions({ narrow, visible, advanced, kebabLabel }: PanelHeaderActionsProps) {
  const folded = narrow ? [...visible, ...advanced] : advanced;
  const menuItems = folded.map((a) => ({
    key: a.key,
    label: a.label,
    icon: a.icon,
    danger: a.danger,
    disabled: a.disabled,
  }));
  const byKey = new Map(folded.map((a) => [a.key, a]));

  return (
    <Space>
      {!narrow &&
        visible.map((a) => (
          <Button key={a.key} icon={a.icon} danger={a.danger} disabled={a.disabled} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      {menuItems.length > 0 && (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: menuItems,
            onClick: ({ key }) => byKey.get(key)?.onClick(),
          }}
        >
          <Button aria-label={kebabLabel} icon={<EllipsisOutlined />} />
        </Dropdown>
      )}
    </Space>
  );
}
