/**
 * confirmDialog — the app's ONE confirmation dialog (016 round 5, FR-031).
 *
 * Ant Design's `Modal.confirm` hard-codes a right-aligned `[Cancel][OK]` pair
 * inside `.ant-modal-confirm-btns` and exposes no way to move Cancel, which
 * violates the constitution's footer rule (primary action right, everything
 * else grouped left, Cancel left-most). This helper owns the footer instead,
 * so every confirmation in the app is compliant by construction.
 *
 * It is called imperatively, exactly like `Modal.confirm`, so adopting it at a
 * call site is a one-line swap:
 *
 *   confirmDialog({
 *     title: t({ id: '…deleteTitle' }),
 *     content: t({ id: '…deleteBody' }),
 *     okText: t({ id: 'common.delete' }),
 *     cancelText: t({ id: 'common.cancel' }),
 *     danger: true,
 *     onOk: () => deleteThing(id),
 *   });
 *
 * `onOk` may be async: the confirming button shows a loading state until it
 * settles, and a rejection keeps the dialog open so the user can retry.
 * Strings arrive already translated — this component holds no copy of its own
 * beyond the "OK"/"Cancel" fallbacks.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Modal } from 'antd';
import type { ReactNode } from 'react';

export interface ConfirmDialogOptions {
  title: ReactNode;
  content?: ReactNode;
  /** Label of the confirming button (already translated). Defaults to "OK". */
  okText?: string;
  /** Label of the cancel button (already translated). Defaults to "Cancel". */
  cancelText?: string;
  /** Render the confirming button as destructive. */
  danger?: boolean;
  /** Runs on confirm; if it returns a promise the dialog waits for it. */
  onOk?: () => void | Promise<unknown>;
  onCancel?: () => void;
  width?: number;
}

// Internal — the module's only public export is `confirmDialog` below.
interface ConfirmDialogViewProps extends ConfirmDialogOptions {
  onClosed: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
function ConfirmDialogView({
  title,
  content,
  okText = 'OK',
  cancelText = 'Cancel',
  danger = false,
  onOk,
  onCancel,
  width,
  onClosed,
}: ConfirmDialogViewProps) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    onClosed();
  };

  const handleOk = async () => {
    if (!onOk) {
      close();
      return;
    }
    setBusy(true);
    try {
      await onOk();
      close();
    } catch {
      // Keep the dialog open so the user can retry — the caller surfaces why.
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    close();
  };

  return (
    <Modal
      title={title}
      open={open}
      width={width}
      onCancel={handleCancel}
      maskClosable={false}
      footer={
        // Constitution VI: Cancel flushed left, the confirming action right.
        <div
          data-testid="confirm-dialog-footer"
          style={{ display: 'flex', justifyContent: 'space-between' }}
        >
          <Button onClick={handleCancel}>{cancelText}</Button>
          <Button type="primary" danger={danger} loading={busy} onClick={() => void handleOk()}>
            {okText}
          </Button>
        </div>
      }
    >
      {content}
    </Modal>
  );
}

export function confirmDialog(options: ConfirmDialogOptions): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const destroy = () => {
    // Defer: unmounting a root synchronously from inside its own event handler
    // makes React warn about rendering during an unrelated render pass.
    setTimeout(() => {
      root.unmount();
      container.remove();
    }, 0);
  };

  root.render(<ConfirmDialogView {...options} onClosed={destroy} />);
}
