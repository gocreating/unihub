import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useIntl } from 'react-intl';
import PageTable, { computeScrollX, measureTextWidth, useActionsColWidth, widthForHeader } from '@/components/PageTable';
import type { Asset } from '@/services/unihub-backend/finance';
import { createAsset, deleteAsset, listAssets, updateAsset } from '@/services/unihub-backend/finance';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

interface AssetFormValues {
  name: string;
  category: string;
}

export function AssetsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [form] = Form.useForm<AssetFormValues>();

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.assets.col.name' }), dataType: 'text' },
    { key: 'category', label: t({ id: 'pages.finance.assets.col.category' }), dataType: 'text' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.assets.col.name' }), dataType: 'text', visible: true, order: 0 },
    { key: 'category', label: t({ id: 'pages.finance.assets.col.category' }), dataType: 'text', visible: true, order: 1 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 2 },
  ], [t]);

  const table = useEntityTable({ key: 'assets', filterableAttrs, columnDefs });

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['finance', 'assets', table.queryParams],
    queryFn: () => listAssets(table.queryParams),
    meta: { errorMessage: t({ id: 'pages.finance.assets.loadError' }) },
  });
  const assets = useMemo(() => assetsData?.results ?? [], [assetsData]);

  const createMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'assets'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.assets.created' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.assets.createError' })),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAsset>[1] }) =>
      updateAsset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'assets'] });
      setModalOpen(false);
      form.resetFields();
      message.success(t({ id: 'pages.finance.assets.updated' }));
    },
    onError: () => message.error(t({ id: 'pages.finance.assets.updateError' })),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'assets'] });
      message.success(t({ id: 'pages.finance.assets.deleted' }));
    },
    onError: (error: Error & { status?: number }) => {
      if (error.status === 409) {
        message.error(t({ id: 'pages.finance.assets.deleteProtected' }));
      } else {
        message.error(t({ id: 'pages.finance.assets.deleteError' }));
      }
    },
  });

  const openCreate = () => {
    setEditingAsset(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditingAsset(asset);
    form.setFieldsValue({ name: asset.name, category: asset.category });
    setModalOpen(true);
  };

  const onFinish = (values: AssetFormValues) => {
    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data: values });
    } else {
      createMutation.mutate({ name: values.name, category: values.category ?? '' });
    }
  };

  const actionsColWidth = useActionsColWidth(assets);

  const dataWidths = useMemo(() => {
    const w = { name: 0, category: 0 };
    for (const a of assets) {
      w.name = Math.max(w.name, measureTextWidth(a.name));
      w.category = Math.max(w.category, measureTextWidth(a.category));
    }
    return w;
  }, [assets]);

  const colDefMap = useMemo<Record<string, ProColumns<Asset>>>(
    () => {
      const getFixed = (key: string) =>
        table.cols.visibleColumns[0]?.key === key ? table.cols.firstColumnFixed
          : table.cols.visibleColumns.at(-1)?.key === key ? table.cols.lastColumnFixed
          : undefined;
      return {
        name: {
          dataIndex: 'name',
          ...widthForHeader(t({ id: 'pages.finance.assets.col.name' }), dataWidths.name),
          fixed: getFixed('name'),
          ...makeSortProps('name', t({ id: 'pages.finance.assets.col.name' }), table.sort),
        },
        category: {
          dataIndex: 'category',
          ...widthForHeader(t({ id: 'pages.finance.assets.col.category' }), dataWidths.category),
          fixed: getFixed('category'),
          render: (val) =>
            val ? String(val) : <Typography.Text type="secondary" style={{ userSelect: 'none' }}>—</Typography.Text>,
          ...makeSortProps('category', t({ id: 'pages.finance.assets.col.category' }), table.sort),
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
                <Button
                  size="small" danger icon={<DeleteOutlined />}
                  onClick={() =>
                    Modal.confirm({
                      title: t({ id: 'pages.finance.assets.delete.title' }),
                      content: t({ id: 'pages.finance.assets.delete.confirm' }, { name: record.name }),
                      okType: 'danger',
                      onOk: () => deleteMutation.mutate(record.id),
                    })
                  }
                >
                  {t({ id: 'common.delete' })}
                </Button>
              </Space>
            </span>
          ),
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dataWidths, actionsColWidth, table.sort.sortOrderForField, table.sort.activeRules, table.cols.firstColumnFixed, table.cols.lastColumnFixed, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Asset>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Asset> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <>
      <PageTable<Asset>
        key={`${table.cols.visibleColumns[0]?.key ?? ''}-${table.cols.visibleColumns.at(-1)?.key ?? ''}-${!!table.cols.firstColumnFixed}-${!!table.cols.lastColumnFixed}`}
        pageTitle={t({ id: 'pages.finance.assets.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.assets.new' })}
          </Button>
        }
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
            columnProps={{ hook: table.cols }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={assets}
        loading={isLoading}
        scroll={{ x: computeScrollX(columns) }}
        onChange={(_, __, sorter) => table.handleTableSorterChange(sorter as never)}
        pagination={false}
        footer={() => <EntityOffsetFooter {...table.paginationProps(assetsData?.count)} />}
      />

      <Modal
        title={editingAsset ? t({ id: 'pages.finance.assets.edit' }) : t({ id: 'pages.finance.assets.new' })}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="name"
            label={t({ id: 'pages.finance.assets.form.name' })}
            rules={[{ required: true }]}
          >
            <Input placeholder={t({ id: 'pages.finance.assets.form.namePlaceholder' })} />
          </Form.Item>
          <Form.Item name="category" label={t({ id: 'pages.finance.assets.form.category' })}>
            <Input placeholder={t({ id: 'pages.finance.assets.form.categoryPlaceholder' })} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
