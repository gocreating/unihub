import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
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
import type { Item, ItemReferenceError, ItemType, ItemWrite } from '@/services/unihub-backend/inventory';
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
} from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

interface ItemFormValues {
  name: string;
  item_type: ItemType;
  category?: string;
  model?: string;
  serial_number?: string;
  quantity?: number | null;
  weight?: number | null;
  price?: number | null;
  cost?: number | null;
  size?: string;
  storage_location?: string;
  status?: string;
  purchase_time?: dayjs.Dayjs | null;
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

function numOrDash(val: string | null | undefined) {
  return val !== null && val !== undefined && val !== '' ? Number(val).toString() : null;
}

export function ItemsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form] = Form.useForm<ItemFormValues>();

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text' },
      { key: 'item_type', label: t({ id: 'pages.inventory.items.col.type' }), dataType: 'single_select' },
      { key: 'category', label: t({ id: 'pages.inventory.items.col.category' }), dataType: 'text' },
      { key: 'model', label: t({ id: 'pages.inventory.items.col.model' }), dataType: 'text' },
      { key: 'serial_number', label: t({ id: 'pages.inventory.items.col.serial' }), dataType: 'text' },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number' },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select' },
    ],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 0 },
      { key: 'item_type', label: t({ id: 'pages.inventory.items.col.type' }), dataType: 'single_select', visible: true, order: 1 },
      { key: 'category', label: t({ id: 'pages.inventory.items.col.category' }), dataType: 'text', visible: true, order: 2 },
      { key: 'model', label: t({ id: 'pages.inventory.items.col.model' }), dataType: 'text', visible: true, order: 3 },
      { key: 'quantity', label: t({ id: 'pages.inventory.items.col.quantity' }), dataType: 'number', visible: true, order: 4 },
      { key: 'weight', label: t({ id: 'pages.inventory.items.col.weight' }), dataType: 'number', visible: true, order: 5 },
      { key: 'status', label: t({ id: 'pages.inventory.items.col.status' }), dataType: 'single_select', visible: true, order: 6 },
      { key: 'purchase_time', label: t({ id: 'pages.inventory.items.col.purchaseTime' }), dataType: 'date', visible: true, order: 7 },
      { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 8 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-items', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'items', showArchived, table.queryParams],
    queryFn: () => listItems({ ...table.queryParams, archived: showArchived }),
  });
  const items = useMemo(() => data?.results ?? [], [data]);

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.items.loadError' }));
  }, [isError, t]);

  const createMutation = useMutation({
    mutationFn: createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.inventory.items.created' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.items.saveError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }: { id: string; data: Partial<ItemWrite> }) =>
      updateItem(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.inventory.items.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.items.saveError' })),
  });

  const archiveMutation = useMutation({
    mutationFn: (item: Item) => updateItem(item.id, { archived_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      message.success(t({ id: 'pages.inventory.items.archived' }));
    },
  });

  const deleteConfirmed = useMutation({
    mutationFn: (id: string) => deleteItem(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      message.success(t({ id: 'pages.inventory.items.deleted' }));
    },
  });

  const handleDelete = async (item: Item) => {
    try {
      await deleteItem(item.id, false);
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      message.success(t({ id: 'pages.inventory.items.deleted' }));
    } catch (err: unknown) {
      const e = err as { body?: ItemReferenceError };
      if (e?.body?.reference_summary) {
        Modal.confirm({
          title: t({ id: 'pages.inventory.items.delete.title' }),
          content: t({ id: 'pages.inventory.items.delete.confirm' }),
          okText: t({ id: 'common.delete' }),
          okType: 'danger',
          cancelText: t({ id: 'common.cancel' }),
          onOk: () => deleteConfirmed.mutate(item.id),
        });
      } else {
        message.error(t({ id: 'pages.inventory.items.saveError' }));
      }
    }
  };

  const confirmArchive = (item: Item) => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.items.archive.title' }),
      content: t({ id: 'pages.inventory.items.archive.confirm' }),
      okText: t({ id: 'pages.inventory.items.archive.ok' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: () => archiveMutation.mutate(item),
    });
  };

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ item_type: 'stockable' });
    setModalOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    form.setFieldsValue({
      name: item.name,
      item_type: item.item_type,
      category: item.category,
      model: item.model,
      serial_number: item.serial_number,
      quantity: item.quantity !== null ? Number(item.quantity) : null,
      weight: item.weight !== null ? Number(item.weight) : null,
      price: item.price !== null ? Number(item.price) : null,
      cost: item.cost !== null ? Number(item.cost) : null,
      size: item.size,
      storage_location: item.storage_location,
      status: item.status,
      purchase_time: item.purchase_time ? dayjs(item.purchase_time) : null,
    });
    setModalOpen(true);
  };

  const onFinish = (values: ItemFormValues) => {
    const payload: ItemWrite = {
      name: values.name,
      item_type: values.item_type,
      category: values.category ?? '',
      model: values.model ?? '',
      serial_number: values.serial_number ?? '',
      size: values.size ?? '',
      storage_location: values.storage_location ?? '',
      status: values.status ?? '',
      quantity: values.quantity != null ? String(values.quantity) : null,
      weight: values.weight != null ? String(values.weight) : null,
      price: values.price != null ? String(values.price) : null,
      cost: values.cost != null ? String(values.cost) : null,
      purchase_time: values.purchase_time ? values.purchase_time.toISOString() : null,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const actionsColWidth = useActionsColWidth(items);

  const dataWidths = useMemo(() => {
    const w = { name: 0, category: 0, model: 0 };
    for (const it of items) {
      w.name = Math.max(w.name, measureTextWidth(it.name));
      w.category = Math.max(w.category, measureTextWidth(it.category));
      w.model = Math.max(w.model, measureTextWidth(it.model));
    }
    return w;
  }, [items]);

  const colDefMap = useMemo<Record<string, ProColumns<Item>>>(
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
          ...widthForHeader(t({ id: 'common.name' }), Math.max(160, dataWidths.name)),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
        },
        item_type: {
          dataIndex: 'item_type',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.type' }), 120),
          fixed: getFixed('item_type'),
          render: (val) => <Tag>{t({ id: `pages.inventory.items.type.${val as string}` })}</Tag>,
          ...makeSortProps('item_type', t({ id: 'pages.inventory.items.col.type' }), sort),
        },
        category: {
          dataIndex: 'category',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.category' }), Math.max(120, dataWidths.category)),
          fixed: getFixed('category'),
          render: (val) => (val ? <Tag>{val as string}</Tag> : EMPTY),
          ...makeSortProps('category', t({ id: 'pages.inventory.items.col.category' }), sort),
        },
        model: {
          dataIndex: 'model',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.model' }), Math.max(120, dataWidths.model)),
          fixed: getFixed('model'),
          render: (val) => (val ? (val as string) : EMPTY),
          ...makeSortProps('model', t({ id: 'pages.inventory.items.col.model' }), sort),
        },
        quantity: {
          dataIndex: 'quantity',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.quantity' }), 110),
          fixed: getFixed('quantity'),
          render: (_, r) => numOrDash(r.quantity) ?? EMPTY,
        },
        weight: {
          dataIndex: 'weight',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.weight' }), 110),
          fixed: getFixed('weight'),
          render: (_, r) => numOrDash(r.weight) ?? EMPTY,
          ...makeSortProps('weight', t({ id: 'pages.inventory.items.col.weight' }), sort),
        },
        status: {
          dataIndex: 'status',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.status' }), 120),
          fixed: getFixed('status'),
          render: (val) => (val ? <Tag>{val as string}</Tag> : EMPTY),
          ...makeSortProps('status', t({ id: 'pages.inventory.items.col.status' }), sort),
        },
        purchase_time: {
          dataIndex: 'purchase_time',
          ...widthForHeader(t({ id: 'pages.inventory.items.col.purchaseTime' }), 220),
          fixed: getFixed('purchase_time'),
          render: (_, r) => formatDateRelative(r.purchase_time) ?? EMPTY,
          ...makeSortProps('purchase_time', t({ id: 'pages.inventory.items.col.purchaseTime' }), sort),
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
                {!record.archived_at && (
                  <Button size="small" onClick={() => confirmArchive(record)}>
                    {t({ id: 'pages.inventory.items.archive' })}
                  </Button>
                )}
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
                  {t({ id: 'common.delete' })}
                </Button>
              </Space>
            </span>
          ),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Item>[]>(
    () =>
      cols.visibleColumns
        .map((c) => colDefMap[c.key])
        .filter((c): c is ProColumns<Item> => Boolean(c)),
    [cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Item>
        key={`${cols.visibleColumns[0]?.key ?? ''}-${cols.visibleColumns.at(-1)?.key ?? ''}-${!!cols.firstColumnFixed}-${!!cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.inventory.items.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.inventory.items.new' })}
          </Button>
        }
        headerTitle={
          <Space>
            <Segmented
              value={showArchived ? 'archived' : 'active'}
              onChange={(v) => setShowArchived(v === 'archived')}
              options={[
                { label: t({ id: 'pages.inventory.items.filter.active' }), value: 'active' },
                { label: t({ id: 'pages.inventory.items.filter.archived' }), value: 'archived' },
              ]}
            />
            <EntityToolbar
              filterProps={{ attrs: filterableAttrs, hook: filter }}
              sortProps={{ attrs: filterableAttrs, hook: sort }}
              columnProps={{ hook: cols }}
            />
          </Space>
        }
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(data?.count)} />}
      />

      <Modal
        title={
          editingItem
            ? t({ id: 'pages.inventory.items.edit' })
            : t({ id: 'pages.inventory.items.new' })
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
          <Form.Item name="item_type" label={t({ id: 'pages.inventory.items.col.type' })} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'stockable', label: t({ id: 'pages.inventory.items.type.stockable' }) },
                { value: 'consumable', label: t({ id: 'pages.inventory.items.type.consumable' }) },
              ]}
            />
          </Form.Item>
          <Form.Item name="category" label={t({ id: 'pages.inventory.items.col.category' })}>
            <Input />
          </Form.Item>
          <Form.Item name="model" label={t({ id: 'pages.inventory.items.col.model' })}>
            <Input />
          </Form.Item>
          <Form.Item name="serial_number" label={t({ id: 'pages.inventory.items.col.serial' })}>
            <Input />
          </Form.Item>
          <Form.Item name="quantity" label={t({ id: 'pages.inventory.items.col.quantity' })}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="weight" label={t({ id: 'pages.inventory.items.col.weight' })}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="price" label={t({ id: 'pages.inventory.items.col.price' })}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cost" label={t({ id: 'pages.inventory.items.col.cost' })}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="size" label={t({ id: 'pages.inventory.items.col.size' })}>
            <Input />
          </Form.Item>
          <Form.Item name="storage_location" label={t({ id: 'pages.inventory.items.col.location' })}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label={t({ id: 'pages.inventory.items.col.status' })}>
            <Select
              allowClear
              options={['available', 'in_use', 'lost', 'retired'].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
          <Form.Item name="purchase_time" label={t({ id: 'pages.inventory.items.col.purchaseTime' })}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
