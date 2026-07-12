import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { PanelHeaderActions } from './index';

function renderActions(narrow: boolean, onEdit = vi.fn(), onDelete = vi.fn()) {
  render(
    <PanelHeaderActions
      narrow={narrow}
      kebabLabel="panel-actions"
      visible={[{ key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: onEdit }]}
      advanced={[
        { key: 'delete', label: 'Delete', danger: true, icon: <DeleteOutlined />, onClick: onDelete },
      ]}
    />,
  );
  return { onEdit, onDelete };
}

describe('PanelHeaderActions (constitution v1.21.0)', () => {
  it('wide: renders visible actions as buttons and only advanced ones in the kebab', async () => {
    const { onEdit, onDelete } = renderActions(false);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('panel-actions'));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Delete');
    expect(menu).not.toHaveTextContent('Edit');
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('narrow: folds the visible actions into the kebab (labels preserved)', async () => {
    const { onEdit } = renderActions(true);
    // No standalone Edit button — only the kebab trigger.
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    fireEvent.click(screen.getByLabelText('panel-actions'));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Edit');
    expect(menu).toHaveTextContent('Delete');
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalled();
  });

  it('opens the kebab dropdown right-aligned (bottomRight placement)', async () => {
    renderActions(false);
    fireEvent.click(screen.getByLabelText('panel-actions'));
    await screen.findByRole('menu');
    expect(document.querySelector('.ant-dropdown-placement-bottomRight')).toBeTruthy();
  });
});
