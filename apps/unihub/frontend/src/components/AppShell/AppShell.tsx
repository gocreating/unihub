import { ProLayout } from '@ant-design/pro-components';
import { Dropdown } from 'antd';
import {
  CustomerServiceOutlined,
  DatabaseOutlined,
  DollarOutlined,
  InboxOutlined,
  LogoutOutlined,
  ReadOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { type ReactNode } from 'react';
import { getMe, logout } from '@/services/unihub-backend/auth';
import { SelectLang } from '@/components/SelectLang';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
  });

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  const routeConfig = {
    routes: [
      {
        path: '/finance',
        name: t({ id: 'menu.finance' }),
        icon: <DollarOutlined />,
        routes: [
          { path: '/finance/currencies', name: t({ id: 'menu.finance.currencies' }) },
          { path: '/finance/exchange-rates', name: t({ id: 'menu.finance.exchangeRates' }) },
          { path: '/finance/accounts', name: t({ id: 'menu.finance.accounts' }) },
          { path: '/finance/balance-sheets', name: t({ id: 'menu.finance.balanceSheets' }) },
        ],
      },
      {
        path: '/inventory',
        name: t({ id: 'menu.inventory' }),
        icon: <InboxOutlined />,
        routes: [
          { path: '/inventory/catalog', name: t({ id: 'menu.inventory.catalog' }) },
          { path: '/inventory/scenarios', name: t({ id: 'menu.inventory.scenarios' }) },
        ],
      },
      { path: '/language', name: t({ id: 'menu.language' }), icon: <ReadOutlined /> },
      { path: '/people', name: t({ id: 'menu.people' }), icon: <TeamOutlined /> },
      { path: '/music', name: t({ id: 'menu.music' }), icon: <CustomerServiceOutlined /> },
      {
        path: '/system',
        name: t({ id: 'menu.system' }),
        icon: <SettingOutlined />,
        routes: [
          { path: '/system/io', name: t({ id: 'menu.system.io' }), icon: <DatabaseOutlined /> },
          { path: '/system/profile', name: t({ id: 'menu.system.profile' }) },
        ],
      },
    ],
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
      route={routeConfig}
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
      // Real hyperlinks (FR-034): browser shortcuts (middle/Cmd/Ctrl-click)
      // open a new tab; plain clicks stay SPA navigations via <Link>.
      menuItemRender={(item, dom) =>
        item.path ? (
          <Link to={item.path} style={{ display: 'block', width: '100%' }}>
            {dom}
          </Link>
        ) : (
          dom
        )
      }
      actionsRender={() => [<SelectLang key="select-lang" />]}
      avatarProps={{
        title: user?.username ?? '',
        size: 'small',
        render: (_, dom) => (
          <Dropdown
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: t({ id: 'menu.account.signOut' }),
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
