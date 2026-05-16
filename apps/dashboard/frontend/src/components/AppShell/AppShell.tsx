import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  StockOutlined,
  BankOutlined,
  SwapOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const { Header, Sider, Content } = Layout;

const NAV_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Overview' },
  { key: '/portfolio', icon: <StockOutlined />, label: 'Portfolio' },
  { key: '/assets', icon: <BankOutlined />, label: 'Assets' },
  { key: '/cash-flow', icon: <SwapOutlined />, label: 'Cash Flow' },
  { key: '/balance-sheet', icon: <BarChartOutlined />, label: 'Balance Sheet' },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          Personal Finance
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
          }}
        />
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
