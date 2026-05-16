import { Card, Col, Row, Statistic, Typography } from 'antd';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';

const { Title } = Typography;

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
}

const COLUMNS: ProColumns<Transaction>[] = [
  { title: 'Date', dataIndex: 'date', key: 'date' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Category', dataIndex: 'category', key: 'category' },
  {
    title: 'Amount',
    dataIndex: 'amount',
    key: 'amount',
    render: (_, row) => (
      <span style={{ color: row.type === 'income' ? '#3f8600' : '#cf1322' }}>
        {row.type === 'income' ? '+' : '-'}${Math.abs(row.amount).toFixed(2)}
      </span>
    ),
  },
];

export function CashFlowPage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Cash Flow
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Income"
              value={0}
              prefix="$"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Expenses"
              value={0}
              prefix="$"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Net Cash Flow" value={0} prefix="$" precision={2} />
          </Card>
        </Col>
      </Row>
      <Card>
        <ProTable<Transaction>
          rowKey="id"
          columns={COLUMNS}
          dataSource={[]}
          search={false}
          pagination={{ pageSize: 20 }}
          toolBarRender={false}
          locale={{ emptyText: 'No transactions yet.' }}
        />
      </Card>
    </div>
  );
}
