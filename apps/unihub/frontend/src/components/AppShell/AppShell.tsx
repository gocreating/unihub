import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const { Sider, Content } = Layout;

const NAV_ITEMS: { key: string; label: string }[] = [
  { key: '/language', label: 'Language' },
  { key: '/people',   label: 'People' },
  { key: '/music',    label: 'Music' },
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
          unihub
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
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
