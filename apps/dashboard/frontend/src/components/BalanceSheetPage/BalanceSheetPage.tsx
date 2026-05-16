import { Card, Col, Row, Statistic, Table, Typography } from 'antd';

const { Title } = Typography;

interface LineItem {
  key: string;
  label: string;
  value: number;
}

const COLUMNS = [
  { title: '', dataIndex: 'label', key: 'label' },
  {
    title: 'Amount',
    dataIndex: 'value',
    key: 'value',
    align: 'right' as const,
    render: (v: number) =>
      `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
  },
];

export function BalanceSheetPage() {
  const assets: LineItem[] = [];
  const liabilities: LineItem[] = [];

  const totalAssets = assets.reduce((s, r) => s + r.value, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.value, 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Balance Sheet
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Total Assets" value={totalAssets} prefix="$" precision={2} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Liabilities"
              value={totalLiabilities}
              prefix="$"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Net Worth"
              value={netWorth}
              prefix="$"
              precision={2}
              valueStyle={{ color: netWorth >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Assets">
            <Table
              rowKey="key"
              columns={COLUMNS}
              dataSource={assets}
              pagination={false}
              size="small"
              locale={{ emptyText: 'No assets' }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <strong>Total Assets</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong>${totalAssets.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Liabilities">
            <Table
              rowKey="key"
              columns={COLUMNS}
              dataSource={liabilities}
              pagination={false}
              size="small"
              locale={{ emptyText: 'No liabilities' }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <strong>Total Liabilities</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong>${totalLiabilities.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
