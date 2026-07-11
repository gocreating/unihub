import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useIntl } from 'react-intl';
import PageTable, {
  computeScrollX,
  measureTextWidth,
  useActionsColWidth,
  widthForHeader,
} from '@/components/PageTable';
import type {
  Acquisition,
  AcquisitionMethod,
  AcquisitionWrite,
} from '@/services/unihub-backend/inventory';
import {
  createAcquisition,
  deleteAcquisition,
  listAcquisitions,
  listItems,
  updateAcquisition,
} from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

const METHODS: AcquisitionMethod[] = ['purchase', 'gift', 'transfer', 'found', 'other'];

interface AcquisitionFormValues {
  source?: string;
  method?: AcquisitionMethod;
  obtained_at?: dayjs.Dayjs | null;
  arrived_at?: dayjs.Dayjs | null;
  cost?: number | null;
  notes?: string;
  item_ids?: string[];
}

const EMPTY = (
  <Typography.Text type="secondary" style={{ userSelect: 'none' }}>
    —
  </Typography.Text>
);

function formatDateRelative(val: string | null | undefined) {
  if (!val) return null;
  return `${dayjs(val).format('YYYY-MM-DD HH:mm')} (${dayjs(val).fromNow()})`;
}

export function AcquisitionsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Acquisition | null>(null);
  const [form] = Form.useForm<AcquisitionFormValues>();

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text' },
      { key: 'method', label: t({ id: 'pages.inventory.acquisitions.col.method' }), dataType: 'single_select' },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date' },
      { key: 'arrived_at', label: t({ id: 'pages.inventory.acquisitions.col.arrivedAt' }), dataType: 'date' },
    ],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'source', label: t({ id: 'pages.inventory.acquisitions.col.source' }), dataType: 'text', visible: true, order: 0 },
      { key: 'method', label: t({ id: 'pages.inventory.acquisitions.col.method' }), dataType: 'single_select', visible: true, order: 1 },
      { key: 'item_count', label: t({ id: 'pages.inventory.acquisitions.col.itemCount' }), dataType: 'number', visible: true, order: 2 },
      { key: 'total_item_cost', label: t({ id: 'pages.inventory.acquisitions.col.total' }), dataType: 'number', visible: true, order: 3 },
      { key: 'obtained_at', label: t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), dataType: 'date', visible: true, order: 4 },
      { key: 'arrived_at', label: t({ id: 'pages.inventory.acquisitions.col.arrivedAt' }), dataType: 'date', visible: true, order: 5 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 6 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-acquisitions', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'acquisitions', table.queryParams],
    queryFn: () => listAcquisitions(table.queryParams),
  });
  const acquisitions = useMemo(() => data?.results ?? [], [data]);

  const { data: itemsData } = useQuery({
    queryKey: ['inventory', 'items', 'all-for-select'],
    queryFn: () => listItems({ limit: 500 }),
  });
  const itemOptions = useMemo(
    () => (itemsData?.results ?? []).map((i) => ({ value: i.id, label: i.name })),
    [itemsData],
  );

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.acquisitions.loadError' }));
  }, [isError, t]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['inventory', 'acquisitions'] });

  const createMutation = useMutation({
    mutationFn: createAcquisition,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }: { id: string; data: AcquisitionWrite }) =>
      updateAcquisition(id, patch),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAcquisition,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      message.success(t({ id: 'pages.inventory.acquisitions.deleted' }));
    },
  });

  const confirmDelete = (record: Acquisition) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.acquisitions.delete.title' }),
      content: t({ id: 'pages.inventory.acquisitions.delete.confirm' }),
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

  const openEdit = (record: Acquisition) => {
    setEditing(record);
    form.setFieldsValue({
      source: record.source,
      method: record.method || undefined,
      obtained_at: record.obtained_at ? dayjs(record.obtained_at) : null,
      arrived_at: record.arrived_at ? dayjs(record.arrived_at) : null,
      cost: record.cost !== null ? Number(record.cost) : null,
      notes: record.notes,
      item_ids: record.items.map((i) => i.id),
    });
    setModalOpen(true);
  };

  const onFinish = (values: AcquisitionFormValues) => {
    const payload: AcquisitionWrite = {
      source: values.source ?? '',
      method: values.method ?? '',
      obtained_at: values.obtained_at ? values.obtained_at.toISOString() : null,
      arrived_at: values.arrived_at ? values.arrived_at.toISOString() : null,
      cost: values.cost != null ? String(values.cost) : null,
      notes: values.notes ?? '',
      item_ids: values.item_ids ?? [],
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const actionsColWidth = useActionsColWidth(acquisitions);

  const sourceWidth = useMemo(
    () => acquisitions.reduce((m, a) => Math.max(m, measureTextWidth(a.source)), 0),
    [acquisitions],
  );

  const colDefMap = useMemo<Record<string, ProColumns<Acquisition>>>(
    () => {
      const getFixed = (key: string) =>
        cols.visibleColumns[0]?.key === key
          ? cols.firstColumnFixed
          : cols.visibleColumns.at(-1)?.key === key
            ? cols.lastColumnFixed
            : undefined;
      return {
        source: {
          dataIndex: 'source',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.source' }), Math.max(140, sourceWidth)),
          fixed: getFixed('source'),
          render: (val) => (val ? (val as string) : EMPTY),
          ...makeSortProps('source', t({ id: 'pages.inventory.acquisitions.col.source' }), sort),
        },
        method: {
          dataIndex: 'method',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.method' }), 130),
          fixed: getFixed('method'),
          render: (val) =>
            val ? <Tag>{t({ id: `pages.inventory.acquisitions.method.${val as string}` })}</Tag> : EMPTY,
          ...makeSortProps('method', t({ id: 'pages.inventory.acquisitions.col.method' }), sort),
        },
        item_count: {
          dataIndex: 'item_count',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.itemCount' }), 110),
          fixed: getFixed('item_count'),
        },
        total_item_cost: {
          dataIndex: 'total_item_cost',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.total' }), 130),
          fixed: getFixed('total_item_cost'),
          render: (val) => Number(val as string).toLocaleString(),
        },
        obtained_at: {
          dataIndex: 'obtained_at',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), 220),
          fixed: getFixed('obtained_at'),
          render: (_, r) => formatDateRelative(r.obtained_at) ?? EMPTY,
          ...makeSortProps('obtained_at', t({ id: 'pages.inventory.acquisitions.col.obtainedAt' }), sort),
        },
        arrived_at: {
          dataIndex: 'arrived_at',
          ...widthForHeader(t({ id: 'pages.inventory.acquisitions.col.arrivedAt' }), 220),
          fixed: getFixed('arrived_at'),
          render: (_, r) =>
            r.arrived_at ? (
              formatDateRelative(r.arrived_at)
            ) : (
              <Tag color="orange">{t({ id: 'pages.inventory.acquisitions.pending' })}</Tag>
            ),
          ...makeSortProps('arrived_at', t({ id: 'pages.inventory.acquisitions.col.arrivedAt' }), sort),
        },
        actions: {
          title: t({ id: 'common.actions' }),
          key: 'actions',
          width: actionsColWidth,
          fixed: getFixed('actions'),
          render: (_, record) => (
            <span data-actions-col>
              <Space>
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
    [t, sourceWidth, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Acquisition>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<Acquisition> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Acquisition>
        key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.inventory.acquisitions.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.inventory.acquisitions.new' })}
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
        dataSource={acquisitions}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}
      />

      <Modal
        title={
          editing
            ? t({ id: 'pages.inventory.acquisitions.edit' })
            : t({ id: 'pages.inventory.acquisitions.new' })
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
          <Form.Item name="source" label={t({ id: 'pages.inventory.acquisitions.col.source' })}>
            <Input placeholder={t({ id: 'pages.inventory.acquisitions.form.sourcePlaceholder' })} />
          </Form.Item>
          <Form.Item name="method" label={t({ id: 'pages.inventory.acquisitions.col.method' })}>
            <Select
              allowClear
              options={METHODS.map((m) => ({
                value: m,
                label: t({ id: `pages.inventory.acquisitions.method.${m}` }),
              }))}
            />
          </Form.Item>
          <Form.Item name="obtained_at" label={t({ id: 'pages.inventory.acquisitions.col.obtainedAt' })}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="arrived_at" label={t({ id: 'pages.inventory.acquisitions.col.arrivedAt' })}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cost" label={t({ id: 'pages.inventory.acquisitions.col.cost' })}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="item_ids" label={t({ id: 'pages.inventory.acquisitions.form.items' })}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              options={itemOptions}
              placeholder={t({ id: 'pages.inventory.acquisitions.form.itemsPlaceholder' })}
            />
          </Form.Item>
          <Form.Item name="notes" label={t({ id: 'pages.inventory.acquisitions.col.notes' })}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
