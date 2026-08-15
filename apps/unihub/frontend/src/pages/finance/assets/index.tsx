import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, message } from 'antd';
import { confirmDialog } from '@/components/ConfirmDialog';
import { SearchHighlightProvider, SearchMark } from '@/components/HighlightText/SearchMark';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { useIntl } from 'react-intl';
import PageTable, { useActionsColWidth } from '@/components/PageTable';
import type { Asset } from '@/services/unihub-backend/finance';
import { createAsset, deleteAsset, listAssets, updateAsset } from '@/services/unihub-backend/finance';
import {
  EntityOffsetFooter,
  EntityToolbar,
  useEntityTable,
  viewConfigFromColumns,
} from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute, ViewConfig } from '@/components/EntityToolbar';
import { ViewTabs } from '@/components/EntityViews/ViewTabs';
import { useEntityViews } from '@/components/EntityViews/useEntityViews';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';

interface AssetFormValues {
  name: string;
}

export function AssetsPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [form] = Form.useForm<AssetFormValues>();

  const filterableAttrs = useMemo<FilterableAttribute[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.assets.col.name' }), dataType: 'text' },
  ], [t]);

  const columnDefs = useMemo<ColumnDef[]>(() => [
    { key: 'name', label: t({ id: 'pages.finance.assets.col.name' }), dataType: 'text', visible: true, order: 0 },
    { key: 'actions', label: t({ id: 'common.actions' }), dataType: 'text', visible: true, order: 1 },
  ], [t]);

  const table = useEntityTable({ key: 'finance-assets', filterableAttrs, columnDefs });

  // The default-view baseline the view tabs diff against (016 views).
  const defaultViewConfig = useMemo<ViewConfig>(() => viewConfigFromColumns(columnDefs), [columnDefs]);
  const views = useEntityViews({
    tableKey: table.tableKey,
    table,
    defaultConfig: defaultViewConfig,
  });

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
    form.setFieldsValue({ name: asset.name });
    setModalOpen(true);
  };

  const onFinish = (values: AssetFormValues) => {
    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data: values });
    } else {
      createMutation.mutate({ name: values.name });
    }
  };

  const actionsColWidth = useActionsColWidth(assets);

  const colDefMap = useMemo<Record<string, ProColumns<Asset>>>(
    () => {
      const getFixed = table.cols.fixedForKey;
      return {
        name: {
          dataIndex: 'name',
          autoWidth: { header: t({ id: 'pages.finance.assets.col.name' }) },
          fixed: getFixed('name'),
          render: (_, record) => <SearchMark text={record.name} />,
          ...makeSortProps('name', t({ id: 'pages.finance.assets.col.name' }), table.sort),
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
                    confirmDialog({
                      title: t({ id: 'pages.finance.assets.delete.title' }),
                      content: t({ id: 'pages.finance.assets.delete.confirm' }, { name: record.name }),
                      danger: true,
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
    [t, actionsColWidth, table.sort.sortOrderForField, table.sort.activeRules, table.cols.fixedForKey, table.cols.visibleColumns],
  );

  const columns = useMemo<ProColumns<Asset>[]>(
    () => table.cols.visibleColumns.map((c) => colDefMap[c.key]).filter((c): c is ProColumns<Asset> => Boolean(c)),
    [table.cols.visibleColumns, colDefMap],
  );

  return (
    <SearchHighlightProvider value={table.activeSearch}>
      <PageTable<Asset>
        key={`${table.cols.pinFingerprint}-${views.activeTabId}`}
        pageTitle={t({ id: 'pages.finance.assets.title' })}
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t({ id: 'pages.finance.assets.new' })}
          </Button>
        }
        viewBar={<ViewTabs views={views} />}
        headerTitle={
          <EntityToolbar
            filterProps={{ attrs: filterableAttrs, hook: table.filter }}
            sortProps={{ attrs: filterableAttrs, hook: table.sort }}
            columnProps={{ hook: table.cols }}
            searchProps={{ value: table.searchQuery, onChange: table.setSearchQuery }}
          />
        }
        rowKey="id"
        columns={columns}
        dataSource={assets}
        loading={isLoading}
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
        </Form>
      </Modal>
    </SearchHighlightProvider>
  );
}
