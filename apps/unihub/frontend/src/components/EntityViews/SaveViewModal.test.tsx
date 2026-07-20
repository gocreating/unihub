// US1 (016): SaveViewModal — name prompt for saving a view.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { SaveViewModal } from './SaveViewModal';

function renderModal(onSave = vi.fn().mockResolvedValue(undefined), onCancel = vi.fn()) {
  render(
    <IntlProvider locale="en" messages={enUS}>
      <SaveViewModal open onSave={onSave} onCancel={onCancel} />
    </IntlProvider>,
  );
  return { onSave, onCancel };
}

beforeEach(() => vi.clearAllMocks());

describe('SaveViewModal', () => {
  it('submits the typed name', async () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'My view' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('My view'));
  });

  it('rejects an empty name with a validation message', async () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Please enter a view name')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate-name 400 inline', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('bad'), { status: 400, body: { name: ['exists'] } }),
      );
    renderModal(onSave);
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A view with this name already exists')).toBeInTheDocument();
  });

  it('places Cancel on the left and the primary Save on the right', () => {
    renderModal();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.className).toContain('ant-btn-primary');
    // Cancel precedes Save in DOM order (left-grouped footer).
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
