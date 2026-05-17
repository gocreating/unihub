import { Card, Col, Row, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const DOMAINS = [
  { title: 'Finance', path: '/finance/accounts', description: 'Track accounts, balance sheets, and exchange rates.' },
  { title: 'Language', path: '/language', description: 'Language learning resources and vocabulary.' },
  { title: 'People', path: '/people', description: 'Manage contacts and relationships.' },
  { title: 'Music', path: '/music', description: 'Organize your music collection.' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  return (
    <div>
      <Typography.Title level={3}>Welcome to unihub</Typography.Title>
      <Row gutter={[16, 16]}>
        {DOMAINS.map((d) => (
          <Col key={d.path} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              onClick={() => navigate(d.path)}
              title={d.title}
              style={{ cursor: 'pointer' }}
            >
              {d.description}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
