import { Card, Typography } from 'antd';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';

const { Title } = Typography;

interface Asset {
  id: string;
  name: string;
  category: string;
  value: number;
  currency: string;
  notes?: string;
}

const COLUMNS: ProColumns<Asset>[] = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Category', dataIndex: 'category', key: 'category' },
  {
    title: 'Value',
    dataIndex: 'value',
    key: 'value',
    render: (_, row) =>
      `${row.currency} ${row.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
  },
  { title: 'Notes', dataIndex: 'notes', key: 'notes' },
];

export function AssetsPage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Assets
      </Title>
      <Card>
        <ProTable<Asset>
          rowKey="id"
          columns={COLUMNS}
          dataSource={[]}
          search={false}
          pagination={false}
          toolBarRender={false}
          locale={{ emptyText: 'No assets yet — add your first asset.' }}
        />
      </Card>
    </div>
  );
}
