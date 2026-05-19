import { Card, Col, Row, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';

export function DashboardPage() {
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();

  const domains = [
    {
      title: t({ id: 'pages.dashboard.finance.title' }),
      path: '/finance/accounts',
      description: t({ id: 'pages.dashboard.finance.description' }),
    },
    {
      title: t({ id: 'pages.dashboard.language.title' }),
      path: '/language',
      description: t({ id: 'pages.dashboard.language.description' }),
    },
    {
      title: t({ id: 'pages.dashboard.people.title' }),
      path: '/people',
      description: t({ id: 'pages.dashboard.people.description' }),
    },
    {
      title: t({ id: 'pages.dashboard.music.title' }),
      path: '/music',
      description: t({ id: 'pages.dashboard.music.description' }),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>{t({ id: 'pages.dashboard.welcome' })}</Typography.Title>
      <Row gutter={[16, 16]}>
        {domains.map((d) => (
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
