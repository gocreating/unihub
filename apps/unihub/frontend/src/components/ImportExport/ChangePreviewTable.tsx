import { Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
  if (records.length === 0) return <Text type="secondary">No rows to create.</Text>;
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
  if (records.length === 0) return <Text type="secondary">No rows to update.</Text>;
  const columns: ColumnsType<ChangeRecord> = [
    {
      title: 'PK',
      dataIndex: 'pk',
      key: 'pk',
      width: 120,
    },
    {
      title: 'Changed Fields',
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
  if (records.length === 0) return <Text type="secondary">No rows to delete.</Text>;
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
  return (
    <ul style={{ paddingLeft: 16 }}>
      {errors.map((e, i) => (
        <li key={i}>
          <Text type="danger">
            {e.row > 0 ? `Row ${e.row}` : 'Header'}
            {e.column ? ` (${e.column})` : ''}: {e.message}
          </Text>
        </li>
      ))}
    </ul>
  );
}

export function ChangePreviewTable({ creates, updates, deletes, errors }: ChangePreviewTableProps) {
  const items = [
    {
      key: 'creates',
      label: (
        <span>
          <Tag color="green">{creates.length}</Tag>Create
        </span>
      ),
      children: <CreateTable records={creates} />,
    },
    {
      key: 'updates',
      label: (
        <span>
          <Tag color="orange">{updates.length}</Tag>Update
        </span>
      ),
      children: <UpdateTable records={updates} />,
    },
    {
      key: 'deletes',
      label: (
        <span>
          <Tag color="red">{deletes.length}</Tag>Delete
        </span>
      ),
      children: (
        <>
          {deletes.length > 0 && (
            <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
              Warning: these rows will be permanently deleted.
            </Text>
          )}
          <DeleteTable records={deletes} />
        </>
      ),
    },
    ...(errors.length > 0
      ? [
          {
            key: 'errors',
            label: (
              <span>
                <Tag color="red">{errors.length}</Tag>Errors
              </span>
            ),
            children: <ErrorList errors={errors} />,
          },
        ]
      : []),
  ];

  const defaultKey =
    errors.length > 0
      ? 'errors'
      : creates.length > 0
        ? 'creates'
        : updates.length > 0
          ? 'updates'
          : 'deletes';

  return <Tabs defaultActiveKey={defaultKey} items={items} size="small" />;
}
