import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import PageTable, {
  computeScrollX,
  measureTextWidth,
  useActionsColWidth,
  widthForHeader,
} from '@/components/PageTable';
import type { Scenario } from '@/services/unihub-backend/inventory';
import {
  createScenario,
  deleteScenario,
  listScenarios,
  updateScenario,
} from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

interface ScenarioFormValues {
  name: string;
  description?: string;
}

export function ScenariosPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [form] = Form.useForm<ScenarioFormValues>();

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [{ key: 'name', label: t({ id: 'common.name' }), dataType: 'text' }],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      // Exactly three columns (FR-010): Name, Description, Actions.
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 0 },
      { key: 'description', label: t({ id: 'pages.inventory.scenarios.col.description' }), dataType: 'text', visible: true, order: 1 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 2 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-scenarios-v2', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'scenarios', table.queryParams],
    queryFn: () => listScenarios(table.queryParams),
  });
  const scenarios = useMemo(() => data?.results ?? [], [data]);

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.scenarios.loadError' }));
  }, [isError, t]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventory', 'scenarios'] });

  const createMutation = useMutation({
    mutationFn: createScenario,
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.inventory.scenarios.saved' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.saveError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }: { id: string; data: ScenarioFormValues }) =>
      updateScenario(id, patch),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.inventory.scenarios.saved' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.saveError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteScenario,
    onSuccess: () => {
      invalidate();
      message.success(t({ id: 'pages.inventory.scenarios.deleted' }));
    },
  });

  const confirmDelete = (record: Scenario) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.scenarios.delete.title' }),
      content: t({ id: 'pages.inventory.scenarios.delete.confirm' }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => deleteMutation.mutate(record.id),
    });
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: Scenario) => {
    setEditing(record);
    form.setFieldsValue({ name: record.name, description: record.description });
    setModalOpen(true);
  };

  const onFinish = (values: ScenarioFormValues) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const actionsColWidth = useActionsColWidth(scenarios);
  const nameWidth = useMemo(
    () => scenarios.reduce((m, s) => Math.max(m, measureTextWidth(s.name)), 0),
    [scenarios],
  );

  const colDefMap = useMemo<Record<string, ProColumns<Scenario>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      return {
        name: {
          dataIndex: 'name',
          ...widthForHeader(t({ id: 'common.name' }), Math.max(160, nameWidth)),
          fixed: getFixed('name'),
          render: (val, record) => (
            <a onClick={() => navigate(`/inventory/scenarios/${record.id}`)}>{val as string}</a>
          ),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
        },
        description: {
          key: 'description',
          title: t({ id: 'pages.inventory.scenarios.col.description' }),
          ...widthForHeader(t({ id: 'pages.inventory.scenarios.col.description' }), 260),
          fixed: getFixed('description'),
          ellipsis: true,
          render: (_, r) =>
            r.description || (
              <Typography.Text type="secondary" style={{ userSelect: 'none' }}>
                —
              </Typography.Text>
            ),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, record) => (
            <span data-actions-col>
              <Space>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/inventory/scenarios/${record.id}`)}
                >
                  {t({ id: 'common.view' })}
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  {t({ id: 'common.edit' })}
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)}>
                  {t({ id: 'common.delete' })}
                </Button>
              </Space>
            </span>
          ),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, nameWidth, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns, navigate],
  );

  const columns = useMemo<ProColumns<Scenario>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<Scenario> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Scenario>
        key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.inventory.scenarios.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.inventory.scenarios.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: filter }}
            sortProps={{ attrs: filterableAttrs, hook: sort }}
            columnProps={{ hook: cols }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={scenarios}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}
      />

      <Modal
        title={
          editing
            ? t({ id: 'pages.inventory.scenarios.edit' })
            : t({ id: 'pages.inventory.scenarios.new' })
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label={t({ id: 'common.name' })} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t({ id: 'pages.inventory.scenarios.col.description' })}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
