// 016 round 4 — the Rename dialog (FR-023): prefilled, trims, refuses blank.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { RenameViewModal } from './RenameViewModal';

function renderModal(
  props: Partial<React.ComponentProps<typeof RenameViewModal>> = {},
) {
  const onRename = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <IntlProvider locale="en" messages={enUS}>
      <RenameViewModal
        open
        currentName="Sales"
        onCancel={onCancel}
        onRename={onRename}
        {...props}
      />
    </IntlProvider>,
  );
  return { onRename, onCancel };
}

const input = () => screen.getByLabelText('View name') as HTMLInputElement;
const confirm = () => screen.getByRole('button', { name: 'Rename' });

beforeEach(() => vi.clearAllMocks());

describe('RenameViewModal', () => {
  it('opens pre-filled with the current name', () => {
    renderModal();
    expect(screen.getByText('Rename view')).toBeInTheDocument();
    expect(input().value).toBe('Sales');
  });

  it('commits the edited name', async () => {
    const { onRename } = renderModal();
    fireEvent.change(input(), { target: { value: 'Sales EMEA' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Sales EMEA'));
  });

  it('trims surrounding whitespace before committing', async () => {
    const { onRename } = renderModal();
    fireEvent.change(input(), { target: { value: '   Year to date   ' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Year to date'));
  });

  it('accepts a name another view already uses (names are not unique)', async () => {
    const { onRename } = renderModal({ currentName: 'Original' });
    fireEvent.change(input(), { target: { value: 'Sales' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Sales'));
  });

  it('refuses a blank or whitespace-only name and stays open', async () => {
    const { onRename } = renderModal();
    fireEvent.change(input(), { target: { value: '   ' } });
    fireEvent.click(confirm());

    expect(await screen.findByText('Please enter a view name')).toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
    expect(input()).toBeInTheDocument();
  });

  it('submits on Enter', async () => {
    const { onRename } = renderModal();
    fireEvent.change(input(), { target: { value: 'Quick' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Quick'));
  });

  it('Cancel closes without renaming', () => {
    const { onRename, onCancel } = renderModal();
    fireEvent.change(input(), { target: { value: 'Nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();
  });

  it('keeps the dialog open when the rename is rejected', async () => {
    const onRename = vi.fn().mockRejectedValue(new Error('boom'));
    renderModal({ onRename });
    fireEvent.change(input(), { target: { value: 'Retry me' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(onRename).toHaveBeenCalled());
    expect(input()).toBeInTheDocument();
  });
});
