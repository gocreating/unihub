import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, message } from 'antd';
import { EmptyValue } from '@/components/EmptyValue';
import { PlusOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageTable, {
  computeScrollX,
  measureTextWidth,
  widthForHeader,
} from '@/components/PageTable';
import type { Scenario } from '@/services/unihub-backend/inventory';
import { createScenario, listScenarios } from '@/services/unihub-backend/inventory';
import { EntityOffsetFooter, EntityToolbar, useEntityTable } from '@/components/EntityToolbar';
import type { ColumnDef, FilterableAttribute } from '@/components/EntityToolbar';
import { makeSortProps } from '@/components/EntityToolbar/makeSortProps';
import { ScenarioFormModal } from './ScenarioFormModal';

export function ScenariosPage() {
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  // Browser tab title (FR-035).
  usePageTitle(t({ id: 'pages.inventory.scenarios.title' }));
  const [modalOpen, setModalOpen] = useState(false);

  const filterableAttrs = useMemo<FilterableAttribute[]>(
    () => [{ key: 'name', label: t({ id: 'common.name' }), dataType: 'text' }],
    [t],
  );

  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      // Exactly two columns (FR-010, iteration 18): Name + Description —
      // Edit/Delete live on the detail page.
      { key: 'name', label: t({ id: 'common.name' }), dataType: 'text', visible: true, order: 0 },
      { key: 'description', label: t({ id: 'pages.inventory.scenarios.col.description' }), dataType: 'text', visible: true, order: 1 },
    ],
    [t],
  );

  const table = useEntityTable({ key: 'inventory-scenarios-v3', filterableAttrs, columnDefs });
  const { filter, sort, cols } = table;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', 'scenarios', table.queryParams],
    queryFn: () => listScenarios(table.queryParams),
  });
  const scenarios = useMemo(() => data?.results ?? [], [data]);

  useEffect(() => {
    if (isError) message.error(t({ id: 'pages.inventory.scenarios.loadError' }));
  }, [isError, t]);

  const createMutation = useMutation({
    mutationFn: createScenario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'scenarios'] });
      setModalOpen(false);
      message.success(t({ id: 'pages.inventory.scenarios.saved' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.saveError' })),
  });

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
            // Real hyperlink (FR-010, iteration 45): browser affordances
            // (new tab, copy link) need an href, not an onClick.
            <Link to={`/inventory/scenarios/${record.id}`}>{val as string}</Link>
          ),
          ...makeSortProps('name', t({ id: 'common.name' }), sort),
        },
        description: {
          key: 'description',
          title: t({ id: 'pages.inventory.scenarios.col.description' }),
          ...widthForHeader(t({ id: 'pages.inventory.scenarios.col.description' }), 260),
          fixed: getFixed('description'),
          ellipsis: true,
          render: (_, r) => r.description || <EmptyValue />,
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, nameWidth, sort.sortOrderForField, sort.activeRules, cols.firstColumnFixed, cols.lastColumnFixed, cols.visibleColumns],
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
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

      <ScenarioFormModal
        open={modalOpen}
        confirmLoading={createMutation.isPending}
        onOk={(values) => createMutation.mutate(values)}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
}
