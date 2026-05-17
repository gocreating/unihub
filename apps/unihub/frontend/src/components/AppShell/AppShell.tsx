import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const { Sider, Header, Content } = Layout;

const NAV_ITEMS = [
  {
    key: 'finance',
    label: 'Finance',
    children: [
      { key: '/finance/accounts', label: 'Accounts' },
      { key: '/finance/balance-sheets', label: 'Balance Sheets' },
      { key: '/finance/exchange-rates', label: 'Exchange Rates' },
    ],
  },
  { key: '/language', label: 'Language' },
  { key: '/people', label: 'People' },
  { key: '/music', label: 'Music' },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Determine which top-level keys should be open
  const openKeys = pathname.startsWith('/finance') ? ['finance'] : [];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220} style={{ position: 'fixed', height: '100vh', left: 0, top: 0, bottom: 0 }}>
        <div
          style={{
            height: 56,
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
          defaultOpenKeys={openKeys}
          items={NAV_ITEMS}
          onClick={({ key }) => {
            if (!['finance'].includes(key)) navigate(key);
          }}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout style={{ marginLeft: 220 }}>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: '#fff',
            padding: '0 24px',
            height: 56,
            lineHeight: '56px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 16 }}>unihub</span>
        </Header>
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
