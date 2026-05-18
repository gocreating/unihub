import { ProLayout } from '@ant-design/pro-components';
import { Dropdown } from 'antd';
import {
  CustomerServiceOutlined,
  DollarOutlined,
  LogoutOutlined,
  ReadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { getMe, logout } from '@/services/unihub-backend/auth';
import { SelectLang } from '@/components/SelectLang';

const ROUTE_CONFIG = {
  routes: [
    {
      path: '/finance',
      name: 'Finance',
      icon: <DollarOutlined />,
      routes: [
        { path: '/finance/currencies', name: 'Currencies' },
        { path: '/finance/accounts', name: 'Accounts' },
        { path: '/finance/balance-sheets', name: 'Balance Sheets' },
        { path: '/finance/exchange-rates', name: 'Exchange Rates' },
      ],
    },
    { path: '/language', name: 'Language', icon: <ReadOutlined /> },
    { path: '/people', name: 'People', icon: <TeamOutlined /> },
    { path: '/music', name: 'Music', icon: <CustomerServiceOutlined /> },
  ],
};

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
  });

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <ProLayout
      title="Unihub"
      logo="/favicon.svg"
      layout="mix"
      navTheme="light"
      colorPrimary="#1890ff"
      fixSiderbar
      fixedHeader
      token={{ bgLayout: '#f0f2f5' }}
      location={location}
      route={ROUTE_CONFIG}
      menuHeaderRender={false}
      headerTitleRender={(logo, title) => (
        <span
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => navigate('/')}
        >
          {logo}
          {title}
        </span>
      )}
      menuItemRender={(item, dom) => (
        <span
          style={{ cursor: 'pointer', display: 'block', width: '100%' }}
          onClick={() => item.path && navigate(item.path)}
        >
          {dom}
        </span>
      )}
      actionsRender={() => [<SelectLang key="select-lang" />]}
      avatarProps={{
        title: user?.username ?? '',
        size: 'small',
        render: (_, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Sign Out',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
    >
      {children}
    </ProLayout>
  );
}
