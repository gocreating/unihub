import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Form,
  InputNumber,
  List,
  Modal,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import type { ConstraintType } from '@/services/unihub-backend/inventory';
import {
  addScenarioItem,
  createConstraint,
  deleteConstraint,
  deleteScenarioItem,
  getChecklist,
  getScenario,
  listConstraints,
  listItems,
  listScenarioItems,
  updateScenarioItem,
} from '@/services/unihub-backend/inventory';

const CONSTRAINT_TYPES: ConstraintType[] = ['mutual_exclusive', 'required', 'weight_limit'];

interface ConstraintFormValues {
  constraint_type: ConstraintType;
  name?: string;
  item_ids?: string[];
  limit_value?: number | null;
}

export function ScenarioDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [addItemId, setAddItemId] = useState<string | undefined>();
  const [addQty, setAddQty] = useState<number>(1);
  const [constraintModal, setConstraintModal] = useState(false);
  const [form] = Form.useForm<ConstraintFormValues>();

  const [scenarioQ, checklistQ, linesQ, constraintsQ, itemsQ] = useQueries({
    queries: [
      { queryKey: ['inventory', 'scenario', id], queryFn: () => getScenario(id) },
      { queryKey: ['inventory', 'scenario', id, 'checklist'], queryFn: () => getChecklist(id) },
      { queryKey: ['inventory', 'scenario', id, 'lines'], queryFn: () => listScenarioItems(id) },
      { queryKey: ['inventory', 'scenario', id, 'constraints'], queryFn: () => listConstraints(id) },
      { queryKey: ['inventory', 'items', 'all-for-select'], queryFn: () => listItems({ limit: 500 }) },
    ],
  });

  const scenario = scenarioQ.data;
  const checklist = checklistQ.data;
  const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
  const constraints = constraintsQ.data ?? [];
  const allItems = itemsQ.data?.results ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'scenario', id] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'scenarios'] });
  };

  const constraintType = Form.useWatch('constraint_type', form);

  const addItemMutation = useMutation({
    mutationFn: () => addScenarioItem(id, { item_id: addItemId!, required_quantity: String(addQty) }),
    onSuccess: () => {
      setAddItemId(undefined);
      setAddQty(1);
      refresh();
    },
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.detail.addError' })),
  });

  const togglePrepared = useMutation({
    mutationFn: ({ lineId, prepared }: { lineId: string; prepared: boolean }) =>
      updateScenarioItem(id, lineId, { prepared }),
    onSuccess: refresh,
  });

  const setContainer = useMutation({
    mutationFn: ({ lineId, containerId }: { lineId: string; containerId: string | null }) =>
      updateScenarioItem(id, lineId, { container_id: containerId }),
    onSuccess: refresh,
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.detail.cycleError' })),
  });

  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => deleteScenarioItem(id, lineId),
    onSuccess: refresh,
  });

  const addConstraintMutation = useMutation({
    mutationFn: (values: ConstraintFormValues) =>
      createConstraint(id, {
        constraint_type: values.constraint_type,
        name: values.name ?? '',
        item_ids: values.item_ids ?? [],
        limit_value: values.limit_value != null ? String(values.limit_value) : null,
      }),
    onSuccess: () => {
      setConstraintModal(false);
      form.resetFields();
      refresh();
    },
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.detail.constraintError' })),
  });

  const deleteConstraintMutation = useMutation({
    mutationFn: (constraintId: string) => deleteConstraint(id, constraintId),
    onSuccess: refresh,
  });

  const confirmRemoveLine = (lineId: string, name: string) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.scenarios.detail.removeItem.title' }),
      content: t({ id: 'pages.inventory.scenarios.detail.removeItem.confirm' }, { name }),
      okText: t({ id: 'common.remove' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => removeLineMutation.mutate(lineId),
    });
  };

  const confirmDeleteConstraint = (constraintId: string) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.scenarios.detail.deleteConstraint.title' }),
      content: t({ id: 'pages.inventory.scenarios.detail.deleteConstraint.confirm' }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => deleteConstraintMutation.mutate(constraintId),
    });
  };

  const selectedItemIds = new Set(lines.map((l) => l.item.id));
  const addableOptions = allItems
    .filter((i) => !selectedItemIds.has(i.id))
    .map((i) => ({ value: i.id, label: i.name }));
  const scenarioItemOptions = allItems.map((i) => ({ value: i.id, label: i.name }));

  const violationsByConstraint = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of checklist?.violations ?? []) {
      map.set(v.constraint_id, v.message + (v.overage ? ` (+${v.overage})` : ''));
    }
    return map;
  }, [checklist]);

  const progress = checklist?.progress;

  return (
    <div style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/inventory/scenarios">{t({ id: 'menu.inventory.scenarios' })}</Link> },
          { title: scenario?.name ?? '' },
        ]}
      />
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        {scenario?.name ?? ''}
      </Typography.Title>

      {progress && (
        <Card style={{ marginBottom: 16 }}>
          <Space size="large" align="center">
            <Progress
              type="circle"
              size={64}
              percent={progress.total ? Math.round((progress.prepared_count / progress.total) * 100) : 0}
            />
            <Typography.Text>
              {t(
                { id: 'pages.inventory.scenarios.detail.progress' },
                { prepared: progress.prepared_count, total: progress.total },
              )}
            </Typography.Text>
            {progress.complete && progress.total > 0 && (
              <Tag color="green">{t({ id: 'pages.inventory.scenarios.ready' })}</Tag>
            )}
          </Space>
        </Card>
      )}

      {(checklist?.violations.length ?? 0) > 0 && (
        <Alert
          type="warning"
          style={{ marginBottom: 16 }}
          message={t({ id: 'pages.inventory.scenarios.detail.violations' })}
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {checklist?.violations.map((v, idx) => (
                <li key={idx}>
                  {v.message}
                  {v.overage ? ` (+${v.overage})` : ''}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Card
        title={t({ id: 'pages.inventory.scenarios.detail.checklist' })}
        style={{ marginBottom: 16 }}
      >
        <Space.Compact style={{ marginBottom: 16, width: '100%' }}>
          <Select
            style={{ flex: 1 }}
            showSearch
            optionFilterProp="label"
            placeholder={t({ id: 'pages.inventory.scenarios.detail.addItemPlaceholder' })}
            value={addItemId}
            onChange={setAddItemId}
            options={addableOptions}
          />
          <InputNumber min={1} value={addQty} onChange={(v) => setAddQty(v ?? 1)} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!addItemId}
            onClick={() => addItemMutation.mutate()}
          >
            {t({ id: 'pages.inventory.scenarios.detail.addItem' })}
          </Button>
        </Space.Compact>

        <List
          dataSource={lines}
          locale={{ emptyText: t({ id: 'pages.inventory.scenarios.detail.empty' }) }}
          renderItem={(line) => {
            const containerOptions = lines
              .filter((l) => l.id !== line.id)
              .map((l) => ({ value: l.id, label: l.item.name }));
            return (
              <List.Item
                actions={[
                  <Select
                    key="container"
                    allowClear
                    style={{ width: 160 }}
                    placeholder={t({ id: 'pages.inventory.scenarios.detail.container' })}
                    value={line.container?.id}
                    options={containerOptions}
                    onChange={(v) =>
                      setContainer.mutate({ lineId: line.id, containerId: v ?? null })
                    }
                  />,
                  <Button
                    key="remove"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => confirmRemoveLine(line.id, line.item.name)}
                  >
                    {t({ id: 'common.remove' })}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Checkbox
                      checked={line.prepared}
                      onChange={(e) =>
                        togglePrepared.mutate({ lineId: line.id, prepared: e.target.checked })
                      }
                    />
                  }
                  title={<span>{line.item.name}</span>}
                  description={
                    <Space size="small">
                      <span>
                        {t(
                          { id: 'pages.inventory.scenarios.detail.required' },
                          { qty: line.required_quantity },
                        )}
                      </span>
                      {line.container && (
                        <Tag color="blue">
                          {t(
                            { id: 'pages.inventory.scenarios.detail.inside' },
                            { name: line.container.item_name },
                          )}
                        </Tag>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Card>

      <Card
        title={t({ id: 'pages.inventory.scenarios.detail.constraints' })}
        extra={
          <Button icon={<PlusOutlined />} onClick={() => setConstraintModal(true)}>
            {t({ id: 'pages.inventory.scenarios.detail.addConstraint' })}
          </Button>
        }
      >
        <List
          dataSource={constraints}
          locale={{ emptyText: t({ id: 'pages.inventory.scenarios.detail.noConstraints' }) }}
          renderItem={(c) => {
            const violation = violationsByConstraint.get(c.id);
            return (
              <List.Item
                actions={[
                  <Button
                    key="del"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => confirmDeleteConstraint(c.id)}
                  >
                    {t({ id: 'common.delete' })}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color={violation ? 'red' : 'default'}>
                        {t({ id: `pages.inventory.constraints.type.${c.constraint_type}` })}
                      </Tag>
                      <span>{c.name || c.items.map((i) => i.name).join(', ')}</span>
                    </Space>
                  }
                  description={
                    violation ? (
                      <Typography.Text type="danger">{violation}</Typography.Text>
                    ) : (
                      <Typography.Text type="success">
                        {t({ id: 'pages.inventory.scenarios.detail.satisfied' })}
                      </Typography.Text>
                    )
                  }
                />
              </List.Item>
            );
          }}
        />
      </Card>

      <Modal
        title={t({ id: 'pages.inventory.scenarios.detail.addConstraint' })}
        open={constraintModal}
        onCancel={() => {
          setConstraintModal(false);
          form.resetFields();
        }}
        footer={
          // Principle VI: Cancel flushed left, primary right.
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button
              onClick={() => {
                setConstraintModal(false);
                form.resetFields();
              }}
            >
              {t({ id: 'common.cancel' })}
            </Button>
            <Button type="primary" loading={addConstraintMutation.isPending} onClick={() => form.submit()}>
              {t({ id: 'common.save' })}
            </Button>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => addConstraintMutation.mutate(v)}
          initialValues={{ constraint_type: 'mutual_exclusive' }}
        >
          <Form.Item
            name="constraint_type"
            label={t({ id: 'pages.inventory.constraints.col.type' })}
            rules={[{ required: true }]}
          >
            <Select
              options={CONSTRAINT_TYPES.map((ct) => ({
                value: ct,
                label: t({ id: `pages.inventory.constraints.type.${ct}` }),
              }))}
            />
          </Form.Item>
          {(constraintType === 'mutual_exclusive' || constraintType === 'required') && (
            <Form.Item name="item_ids" label={t({ id: 'pages.inventory.constraints.col.items' })}>
              <Select mode="multiple" showSearch optionFilterProp="label" options={scenarioItemOptions} />
            </Form.Item>
          )}
          {constraintType === 'weight_limit' && (
            <Form.Item
              name="limit_value"
              label={t({ id: 'pages.inventory.constraints.col.limit' })}
              rules={[{ required: true }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
