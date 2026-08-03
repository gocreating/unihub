/**
 * RenameViewModal — the view-naming dialog (016 round 4, FR-023).
 *
 * Opened from a tab's Rename action, pre-filled with that tab's current name.
 * Committing trims the value and rejects a blank; names need not be unique
 * (FR-016), so there is no collision path. On a tab that has no stored view
 * the caller simply relabels local state — the next Save stores it.
 *
 * Replaces both the round-2 "Save view" prompt and the round-3 inline input.
 */
import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal } from 'antd';
import { useIntl } from 'react-intl';

export interface RenameViewModalProps {
  open: boolean;
  /** The name to pre-fill (the tab's rendered label). */
  currentName: string;
  onCancel: () => void;
  /** Receives the TRIMMED name. Rejections keep the dialog open. */
  onRename: (name: string) => Promise<void>;
}

export function RenameViewModal({ open, currentName, onCancel, onRename }: RenameViewModalProps) {
  const { formatMessage: t } = useIntl();
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed every time the dialog opens — it may target a different tab.
  useEffect(() => {
    if (open) {
      setValue(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const submit = async () => {
    const name = value.trim();
    if (!name) {
      setError(t({ id: 'common.entityViews.viewNameRequired' }));
      return;
    }
    setSaving(true);
    try {
      await onRename(name);
    } catch {
      // The caller surfaced the failure; keep the dialog open to retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t({ id: 'common.entityViews.renameViewTitle' })}
      open={open}
      onCancel={onCancel}
      // Never dismiss on an outside click while the name is being edited.
      maskClosable={value.trim() === currentName.trim()}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={onCancel}>{t({ id: 'common.cancel' })}</Button>
          <Button type="primary" loading={saving} onClick={() => void submit()}>
            {t({ id: 'common.entityViews.rename' })}
          </Button>
        </div>
      }
    >
      <Form layout="vertical">
        <Form.Item
          label={t({ id: 'common.entityViews.viewName' })}
          validateStatus={error ? 'error' : undefined}
          help={error ?? undefined}
        >
          <Input
            autoFocus
            value={value}
            maxLength={100}
            aria-label={t({ id: 'common.entityViews.viewName' })}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onPressEnter={() => void submit()}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
