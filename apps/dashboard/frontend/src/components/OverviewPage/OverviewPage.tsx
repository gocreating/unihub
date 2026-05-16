import { Card, Col, Row, Statistic, Typography } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

export function OverviewPage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Overview
      </Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Net Worth"
              value={0}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Portfolio Value"
              value={0}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#3f8600' }}
              suffix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Monthly Cash Flow"
              value={0}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Liabilities"
              value={0}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#cf1322' }}
              suffix={<ArrowDownOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
