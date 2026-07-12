import { useEffect } from 'react';
import { Button, Form, Input, Modal } from 'antd';
import { useIntl } from 'react-intl';
import type { Scenario } from '@/services/unihub-backend/inventory';

export interface ScenarioFormValues {
  name: string;
  description?: string;
}

export interface ScenarioFormModalProps {
  open: boolean;
  /** Pre-fill for editing; null/undefined = create. */
  initial?: Scenario | null;
  confirmLoading?: boolean;
  onOk: (values: ScenarioFormValues) => void;
  onCancel: () => void;
}

/**
 * Shared scenario create/edit modal (name + description) — mounted from the
 * list page ("New") and the detail info panel ("Edit"). Footer follows the
 * constitution: Cancel flushed left, primary action right.
 */
export function ScenarioFormModal({
  open,
  initial,
  confirmLoading,
  onOk,
  onCancel,
}: ScenarioFormModalProps) {
  const { formatMessage: t } = useIntl();
  const [form] = Form.useForm<ScenarioFormValues>();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({ name: initial.name, description: initial.description });
    } else {
      form.resetFields();
    }
  }, [open, initial, form]);

  return (
    <Modal
      title={
        initial
          ? t({ id: 'pages.inventory.scenarios.edit' })
          : t({ id: 'pages.inventory.scenarios.new' })
      }
      open={open}
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={onCancel}>{t({ id: 'common.cancel' })}</Button>
          <Button type="primary" loading={confirmLoading} onClick={() => form.submit()}>
            {t({ id: 'common.save' })}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={onOk}>
        <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="description"
          label={t({ id: 'pages.inventory.scenarios.col.description' })}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
