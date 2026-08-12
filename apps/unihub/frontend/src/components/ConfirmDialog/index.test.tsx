// Shared confirmation dialog (016 round 5, FR-031): the constitution's footer
// rule — Cancel flushed LEFT, the confirming action on the RIGHT — which AntD's
// Modal.confirm cannot express (it right-aligns both buttons together).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { confirmDialog } from './index';

function footer(): HTMLElement {
  return document.querySelector('[data-testid="confirm-dialog-footer"]') as HTMLElement;
}

function cancelButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('confirmDialog', () => {
  it('renders the title, content and confirming label', async () => {
    confirmDialog({ title: 'Delete view?', content: 'This cannot be undone.', okText: 'Delete' });

    expect(await screen.findByText('Delete view?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  // The rule this component exists for: Cancel LEFT-most, primary RIGHT-most.
  it('puts Cancel at the left edge of the footer and the action at the right', async () => {
    confirmDialog({ title: 'Delete view?', okText: 'Delete' });
    await screen.findByText('Delete view?');

    const buttons = Array.from(footer().querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toContain('Cancel');
    expect(buttons[1]!.textContent).toContain('Delete');
    expect(footer().style.justifyContent).toBe('space-between');
  });

  it('marks the confirming button as dangerous when asked', async () => {
    confirmDialog({ title: 'Delete view?', okText: 'Delete', danger: true });
    const ok = await screen.findByRole('button', { name: 'Delete' });
    expect(ok.className).toContain('ant-btn-dangerous');
  });

  it('leaves the confirming button non-dangerous by default', async () => {
    confirmDialog({ title: 'Publish?', okText: 'Publish' });
    const ok = await screen.findByRole('button', { name: 'Publish' });
    expect(ok.className).not.toContain('ant-btn-dangerous');
  });

  it('runs onOk when confirmed', async () => {
    const onOk = vi.fn();
    confirmDialog({ title: 'Delete view?', okText: 'Delete', onOk });

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onOk).toHaveBeenCalledTimes(1));
  });

  it('runs nothing when cancelled', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    confirmDialog({ title: 'Delete view?', okText: 'Delete', onOk, onCancel });

    await screen.findByText('Delete view?');
    fireEvent.click(cancelButton());

    expect(onOk).not.toHaveBeenCalled();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('awaits an async onOk before closing', async () => {
    let release!: () => void;
    const onOk = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    confirmDialog({ title: 'Delete view?', okText: 'Delete', onOk });

    const ok = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(ok);

    // Still open, with the action in flight.
    await waitFor(() => expect(ok.className).toContain('ant-btn-loading'));
    expect(screen.getByText('Delete view?')).toBeInTheDocument();

    release();
    // Only once the promise settles does the dialog close.
    await waitFor(() =>
      expect(document.querySelector('.ant-modal-wrap')).toHaveStyle({ display: 'none' }),
    );
  });

  it('keeps the dialog open when onOk rejects', async () => {
    const onOk = vi.fn().mockRejectedValue(new Error('boom'));
    confirmDialog({ title: 'Delete view?', okText: 'Delete', onOk });

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onOk).toHaveBeenCalled());
    expect(screen.getByText('Delete view?')).toBeInTheDocument();
  });

  it('accepts a custom cancel label', async () => {
    confirmDialog({ title: 'Discard?', okText: 'Discard', cancelText: 'Keep editing' });
    expect(await screen.findByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
  });
});
