import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { confirmDialog } from '../ConfirmDialog';
import { DeleteOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import type { AttributeDefinition } from '@/services/unihub-backend/core';
import {
  createAttributeDefinition,
  deleteAttributeDefinition,
  listAttributeDefinitions,
} from '@/services/unihub-backend/core';

interface Props {
  contentType: string;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  long_text: 'Long Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Boolean',
  single_select: 'Single Select',
};

export function AttributeManagementPanel({ contentType }: Props) {
  const queryClient = useQueryClient();
  const [addingAttr, setAddingAttr] = useState(false);
  const [form] = Form.useForm();
  const dataTypeWatch: string | undefined = Form.useWatch('data_type', form);

  const { data: attrs = [], isLoading } = useQuery({
    queryKey: ['core', 'attribute-definitions', contentType],
    queryFn: () => listAttributeDefinitions(contentType),
  });

  const contentTypeId = attrs[0]?.content_type;

  const createMutation = useMutation({
    mutationFn: createAttributeDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['core', 'attribute-definitions', contentType] });
      setAddingAttr(false);
      form.resetFields();
      message.success('Attribute added.');
    },
    onError: () => message.error('Failed to add attribute.'),
  });

  const handleDelete = async (attr: AttributeDefinition) => {
    try {
      await deleteAttributeDefinition(attr.id, false);
      queryClient.invalidateQueries({ queryKey: ['core', 'attribute-definitions', contentType] });
      message.success('Attribute deleted.');
    } catch (err: unknown) {
      const e = err as { body?: { affected_entity_count?: number } };
      if (e?.body?.affected_entity_count !== undefined) {
        const count = e.body.affected_entity_count;
        confirmDialog({
          title: 'Delete Attribute',
          content: `This will remove values from ${count} record(s). Continue?`,
          okText: 'Delete',
          danger: true,
          onOk: async () => {
            await deleteAttributeDefinition(attr.id, true);
            queryClient.invalidateQueries({ queryKey: ['core', 'attribute-definitions', contentType] });
            message.success('Attribute deleted.');
          },
        });
      } else {
        message.error('Failed to delete attribute.');
      }
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, rec: AttributeDefinition) => (
        <Space>
          {rec.is_system && (
            <Tooltip title="System attribute (read-only)">
              <LockOutlined style={{ color: '#aaa' }} />
            </Tooltip>
          )}
          <Typography.Text>{name}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'data_type',
      render: (t: string) => <Tag>{DATA_TYPE_LABELS[t] ?? t}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, rec: AttributeDefinition) =>
        rec.is_system ? null : (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(rec)}
          />
        ),
    },
  ];

  const onAddFinish = (values: {
    name: string;
    data_type: AttributeDefinition['data_type'];
    options?: string;
  }) => {
    if (contentTypeId === undefined) return;
    createMutation.mutate({
      content_type: contentTypeId,
      name: values.name,
      data_type: values.data_type,
      options:
        values.options
          ? values.options.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
    });
  };

  return (
    <div>
      <Table
        rowKey="id"
        dataSource={attrs}
        columns={columns}
        loading={isLoading}
        pagination={false}
        size="small"
      />

      {addingAttr ? (
        <Form form={form} layout="inline" onFinish={onAddFinish} style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <Form.Item name="name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Attribute name" />
          </Form.Item>
          <Form.Item name="data_type" rules={[{ required: true, message: 'Required' }]}>
            <Select placeholder="Type" style={{ width: 150 }}>
              {Object.entries(DATA_TYPE_LABELS).map(([v, l]) => (
                <Select.Option key={v} value={v}>{l}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          {dataTypeWatch === 'single_select' && (
            <Form.Item name="options">
              <Input placeholder="Options (comma-separated)" style={{ width: 220 }} />
            </Form.Item>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                Add
              </Button>
              <Button onClick={() => { setAddingAttr(false); form.resetFields(); }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      ) : (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setAddingAttr(true)}
          style={{ marginTop: 12, width: '100%' }}
          disabled={contentTypeId === undefined}
        >
          Add Custom Attribute
        </Button>
      )}
    </div>
  );
}
