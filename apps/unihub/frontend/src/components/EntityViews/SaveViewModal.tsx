/**
 * SaveViewModal — name prompt when saving an unnamed (default/anonymous) tab
 * as a saved view (016, US1). Footer follows the constitution: Cancel flushed
 * left, primary Save right; no outside-click close while the form is dirty.
 */
import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal } from 'antd';
import { useIntl } from 'react-intl';

export interface SaveViewModalProps {
  open: boolean;
  /** Pre-fill (e.g. duplicating an existing tab name). */
  initialName?: string;
  onCancel: () => void;
  /** Persist under the given name. Reject with the service error to surface
   *  a duplicate-name 400 inline. */
  onSave: (name: string) => Promise<void>;
}

interface FormValues {
  name: string;
}

export function SaveViewModal({ open, initialName, onCancel, onSave }: SaveViewModalProps) {
  const { formatMessage: t } = useIntl();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ name: initialName ?? '' });
  }, [open, initialName, form]);

  const handleFinish = async ({ name }: FormValues) => {
    setSaving(true);
    try {
      await onSave(name.trim());
      form.resetFields();
    } catch (err) {
      const body = (err as { status?: number; body?: { name?: unknown } }) ?? {};
      if (body.status === 400 && body.body?.name) {
        form.setFields([
          { name: 'name', errors: [t({ id: 'common.entityViews.duplicateName' })] },
        ]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t({ id: 'common.entityViews.saveViewTitle' })}
      open={open}
      onCancel={onCancel}
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={onCancel}>{t({ id: 'common.cancel' })}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t({ id: 'common.entityViews.save' })}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label={t({ id: 'common.entityViews.viewName' })}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t({ id: 'common.entityViews.viewNameRequired' }),
            },
            { max: 100 },
          ]}
        >
          <Input autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
