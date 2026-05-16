import { Card, Typography } from 'antd';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';

const { Title } = Typography;

interface Holding {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  gainLoss: number;
  gainLossPct: number;
}

const COLUMNS: ProColumns<Holding>[] = [
  { title: 'Ticker', dataIndex: 'ticker', key: 'ticker' },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Shares', dataIndex: 'shares', key: 'shares' },
  {
    title: 'Price',
    dataIndex: 'price',
    key: 'price',
    render: (_, row) => `$${row.price.toFixed(2)}`,
  },
  {
    title: 'Market Value',
    dataIndex: 'value',
    key: 'value',
    render: (_, row) => `$${row.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
  },
  {
    title: 'Gain / Loss',
    dataIndex: 'gainLoss',
    key: 'gainLoss',
    render: (_, row) => (
      <span style={{ color: row.gainLoss >= 0 ? '#3f8600' : '#cf1322' }}>
        {row.gainLoss >= 0 ? '+' : ''}${row.gainLoss.toFixed(2)}
      </span>
    ),
  },
];

export function PortfolioPage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Portfolio
      </Title>
      <Card>
        <ProTable<Holding>
          rowKey="id"
          columns={COLUMNS}
          dataSource={[]}
          search={false}
          pagination={false}
          toolBarRender={false}
          locale={{ emptyText: 'No holdings yet — add your first position.' }}
        />
      </Card>
    </div>
  );
}
