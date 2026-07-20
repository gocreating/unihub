// Intentionally uses antd/Table (not PageTable). This is a diff-preview
// sub-component embedded inside the IO panel — not a top-level page.
// PageTable's sticky behaviors (useStickyFix, useStickyHorizontalScrollbar)
// require the document body as the scroll container, which conflicts with a
// panel parent. Datasets here are small (preview diffs) so sticky
// header/scrollbar provide no UX value. Pagination goes through the shared
// EntityOffsetFooter (constitution footer layout: info left; size selector
// then pagination, right) instead of antd Table's built-in pagination, whose
// size changer renders on the wrong side of the paginators.
import { useState } from 'react';
import { Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useIntl } from 'react-intl';
import { EntityOffsetFooter } from '@/components/EntityToolbar';
import type { ChangeRecord, ValidationError } from '@/services/unihub-backend/io';

const { Text } = Typography;

const PREVIEW_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface ChangePreviewTableProps {
  creates: ChangeRecord[];
  updates: ChangeRecord[];
  deletes: ChangeRecord[];
  errors: ValidationError[];
}

function columnsFromRecord(records: ChangeRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of records) {
    const dict = r.after ?? r.before ?? {};
    for (const k of Object.keys(dict)) keys.add(k);
  }
  return Array.from(keys);
}

/** Client-side paged antd Table + the shared constitution footer. */
function PagedPreviewTable({
  records,
  columns,
  scrollX,
}: {
  records: ChangeRecord[];
  columns: ColumnsType<ChangeRecord>;
  scrollX?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = records.slice((current - 1) * pageSize, current * pageSize);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <Table
        rowKey="pk"
        size="small"
        columns={columns}
        dataSource={paged}
        pagination={false}
        {...(scrollX ? { scroll: { x: true as const } } : {})}
      />
      <EntityOffsetFooter
        total={records.length}
        pageSize={pageSize}
        current={current}
        pageSizeOptions={PREVIEW_PAGE_SIZE_OPTIONS}
        onChange={(nextPage, nextSize) => {
          setPage(nextPage);
          setPageSize(nextSize);
        }}
      />
    </Space>
  );
}

function CreateTable({ records }: { records: ChangeRecord[] }) {
  const { formatMessage: t } = useIntl();
  if (records.length === 0) return <Text type="secondary">{t({ id: 'pages.io.preview.create.empty' })}</Text>;
  const cols = columnsFromRecord(records);
  const columns: ColumnsType<ChangeRecord> = cols.map((col) => ({
    title: col,
    dataIndex: ['after', col],
    key: col,
    ellipsis: true,
  }));
  return <PagedPreviewTable records={records} columns={columns} scrollX />;
}

function UpdateTable({ records }: { records: ChangeRecord[] }) {
  const { formatMessage: t } = useIntl();
  if (records.length === 0) return <Text type="secondary">{t({ id: 'pages.io.preview.update.empty' })}</Text>;
  const columns: ColumnsType<ChangeRecord> = [
    {
      title: t({ id: 'pages.io.preview.col.pk' }),
      dataIndex: 'pk',
      key: 'pk',
      width: 120,
    },
    {
      title: t({ id: 'pages.io.preview.col.changedFields' }),
      key: 'changes',
      render: (_, record) =>
        record.changed_fields.map((f) => (
          <div key={f} style={{ marginBottom: 2 }}>
            <Tag color="orange">{f}</Tag>
            <Text delete style={{ marginRight: 8 }}>
              {record.before?.[f] ?? ''}
            </Text>
            <Text strong>{record.after?.[f] ?? ''}</Text>
          </div>
        )),
    },
  ];
  return <PagedPreviewTable records={records} columns={columns} />;
}

function DeleteTable({ records }: { records: ChangeRecord[] }) {
  const { formatMessage: t } = useIntl();
  if (records.length === 0) return <Text type="secondary">{t({ id: 'pages.io.preview.delete.empty' })}</Text>;
  const cols = columnsFromRecord(records);
  const columns: ColumnsType<ChangeRecord> = cols.map((col) => ({
    title: col,
    dataIndex: ['before', col],
    key: col,
    ellipsis: true,
    render: (val: string) => <Text type="danger">{val}</Text>,
  }));
  return <PagedPreviewTable records={records} columns={columns} scrollX />;
}

function ErrorList({ errors }: { errors: ValidationError[] }) {
  const { formatMessage: t } = useIntl();
  return (
    <ul style={{ paddingLeft: 16 }}>
      {errors.map((e, i) => (
        <li key={i}>
          <Text type="danger">
            {e.row > 0
              ? t({ id: 'pages.io.preview.error.row' }, { row: e.row })
              : t({ id: 'pages.io.preview.error.header' })}
            {e.column ? ` (${e.column})` : ''}: {e.message}
          </Text>
        </li>
      ))}
    </ul>
  );
}

export function ChangePreviewTable({ creates, updates, deletes, errors }: ChangePreviewTableProps) {
  const { formatMessage: t } = useIntl();

  const items = [
    {
      key: 'creates',
      label: (
        <span>
          <Tag color="green">{creates.length}</Tag>
          {t({ id: 'pages.io.preview.tab.create' })}
        </span>
      ),
      children: <CreateTable records={creates} />,
    },
    {
      key: 'updates',
      label: (
        <span>
          <Tag color="orange">{updates.length}</Tag>
          {t({ id: 'pages.io.preview.tab.update' })}
        </span>
      ),
      children: <UpdateTable records={updates} />,
    },
    {
      key: 'deletes',
      label: (
        <span>
          <Tag color="red">{deletes.length}</Tag>
          {t({ id: 'pages.io.preview.tab.delete' })}
        </span>
      ),
      children: <DeleteTable records={deletes} />,
    },
    ...(errors.length > 0
      ? [
          {
            key: 'errors',
            label: (
              <span>
                <Tag color="red">{errors.length}</Tag>
                {t({ id: 'pages.io.preview.tab.errors' })}
              </span>
            ),
            children: <ErrorList errors={errors} />,
          },
        ]
      : []),
  ];

  const defaultKey =
    creates.length > 0
      ? 'creates'
      : updates.length > 0
        ? 'updates'
        : deletes.length > 0
          ? 'deletes'
          : errors.length > 0
            ? 'errors'
            : 'creates';

  return <Tabs defaultActiveKey={defaultKey} items={items} size="small" />;
}
