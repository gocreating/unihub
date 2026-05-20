import { Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useIntl } from 'react-intl';
import type { ChangeRecord, ValidationError } from '@/services/unihub-backend/io';

const { Text } = Typography;

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
  return (
    <Table
      rowKey="pk"
      size="small"
      columns={columns}
      dataSource={records}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      scroll={{ x: true }}
    />
  );
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
  return (
    <Table
      rowKey="pk"
      size="small"
      columns={columns}
      dataSource={records}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
    />
  );
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
  return (
    <Table
      rowKey="pk"
      size="small"
      columns={columns}
      dataSource={records}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      scroll={{ x: true }}
    />
  );
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
