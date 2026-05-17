import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import PageTable, { computeScrollX, widthForHeader } from '@/components/PageTable';
import { AttributeManagementPanel } from '@/components/AttributeManagementPanel';
import type { Account } from '@/services/unihub-backend/finance';
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from '@/services/unihub-backend/finance';
import {
  bulkUpsertAttributeValues,
  listAttributeDefinitions,
  listAttributeValues,
} from '@/services/unihub-backend/core';

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: 'green',
  liability: 'red',
  equity: 'blue',
};

const CONTENT_TYPE = 'finance.account';

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form] = Form.useForm();

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['finance', 'accounts'],
    queryFn: () => listAccounts(),
  });

  const { data: attrDefs = [] } = useQuery({
    queryKey: ['core', 'attribute-definitions', CONTENT_TYPE],
    queryFn: () => listAttributeDefinitions(CONTENT_TYPE),
  });

  const userAttrs = useMemo(() => attrDefs.filter((a) => !a.is_system), [attrDefs]);

  const { data: existingAttrValues = [] } = useQuery({
    queryKey: ['core', 'attribute-values', CONTENT_TYPE, editingAccount?.id],
    queryFn: () => listAttributeValues(CONTENT_TYPE, editingAccount!.id),
    enabled: !!editingAccount,
  });

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: async (created) => {
      await saveAttrValues(created.id);
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Account created.');
    },
    onError: () => message.error('Failed to create account.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAccount>[1] }) =>
      updateAccount(id, data),
    onSuccess: async (_, variables) => {
      await saveAttrValues(variables.id);
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Account updated.');
    },
    onError: () => message.error('Failed to update account.'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) => deleteAccount(id, confirm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      message.success('Account deleted.');
    },
  });

  const saveAttrValues = async (objectId: string) => {
    const attrs = userAttrs.map((attr) => ({
      attribute_definition_id: attr.id,
      value: String(form.getFieldValue(`attr_${attr.id}`) ?? ''),
    })).filter((a) => a.value !== '');
    if (attrs.length > 0) {
      await bulkUpsertAttributeValues(CONTENT_TYPE, objectId, attrs);
    }
  };

  const handleDelete = async (account: Account) => {
    try {
      await deleteAccount(account.id, false);
      queryClient.invalidateQueries({ queryKey: ['finance', 'accounts'] });
      message.success('Account deleted.');
    } catch (err: unknown) {
      const e = err as { body?: { affected_balance_count?: number } };
      if (e?.body?.affected_balance_count !== undefined) {
        const count = e.body.affected_balance_count;
        Modal.confirm({
          title: 'Delete Account',
          content: `This will also delete ${count} balance record(s). Continue?`,
          okText: 'Delete',
          okType: 'danger',
          onOk: () => deleteMutation.mutate({ id: account.id, confirm: true }),
        });
      } else {
        message.error('Failed to delete account.');
      }
    }
  };

  const openCreate = () => {
    setEditingAccount(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    form.setFieldsValue(account);
    setModalOpen(true);
  };

  // Pre-fill custom attr values when editing
  useMemo(() => {
    if (editingAccount && existingAttrValues.length > 0) {
      const patch: Record<string, string> = {};
      for (const val of existingAttrValues) {
        patch[`attr_${val.attribute_definition}`] = val.value;
      }
      form.setFieldsValue(patch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAttrValues]);

  const onFinish = (values: { name: string; account_type: Account['account_type']; currency: string }) => {
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const columns: ProColumns<Account>[] = useMemo(
    () => [
      { title: 'Name', dataIndex: 'name', ...widthForHeader('Name'), sorter: true },
      {
        title: 'Type',
        dataIndex: 'account_type',
        ...widthForHeader('Type'),
        render: (val) => <Tag color={ACCOUNT_TYPE_COLORS[val as string]}>{String(val).toUpperCase()}</Tag>,
      },
      { title: 'Currency', dataIndex: 'currency', ...widthForHeader('Currency') },
      {
        title: 'Actions',
        key: 'actions',
        ...widthForHeader('Actions'),
        render: (_, record) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Edit
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      {isError && (
        <Alert type="error" message="Failed to load accounts." style={{ marginBottom: 16 }} showIcon />
      )}
      <PageTable<Account>
        pageTitle="Accounts"
        action={
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>
              Configure Fields
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Account
            </Button>
          </Space>
        }
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
      />

      <Modal
        title={editingAccount ? 'Edit Account' : 'New Account'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="account_type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="asset">Asset</Select.Option>
              <Select.Option value="liability">Liability</Select.Option>
              <Select.Option value="equity">Equity</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="currency"
            label="Currency (ISO 4217)"
            rules={[
              { required: true },
              { pattern: /^[A-Za-z]{3}$/, message: 'Must be a 3-letter currency code (e.g. USD, TWD)' },
            ]}
          >
            <Input maxLength={3} style={{ textTransform: 'uppercase' }} />
          </Form.Item>

          {userAttrs.map((attr) => (
            <Form.Item key={attr.id} name={`attr_${attr.id}`} label={attr.name}>
              {attr.data_type === 'boolean' ? (
                <Switch />
              ) : attr.data_type === 'single_select' ? (
                <Select allowClear>
                  {attr.options.map((opt) => (
                    <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                  ))}
                </Select>
              ) : attr.data_type === 'date' ? (
                <DatePicker
                  style={{ width: '100%' }}
                  value={form.getFieldValue(`attr_${attr.id}`) ? dayjs(form.getFieldValue(`attr_${attr.id}`) as string) : undefined}
                  onChange={(d) => form.setFieldValue(`attr_${attr.id}`, d?.format('YYYY-MM-DD') ?? '')}
                />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>

      <Drawer
        title="Configure Account Fields"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        <AttributeManagementPanel contentType={CONTENT_TYPE} />
      </Drawer>
    </>
  );
}
