import { useEffect } from 'react';
import { ConfigProvider, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import zhTW from 'antd/locale/zh_TW';
import dayjs from 'dayjs';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell/AppShell';
import { LocaleProvider, useLocale } from '@/contexts/LocaleContext';
import enUSMessages from '@/locales/en-US';
import zhTWMessages from '@/locales/zh-TW';
import { LoginPage } from '@/pages/auth/login';
import { DashboardPage } from '@/pages/dashboard/index';
import { AccountsPage } from '@/pages/finance/accounts/index';
import { BalanceSheetsPage } from '@/pages/finance/balance-sheets/index';
import { BalanceSheetDetailPage } from '@/pages/finance/balance-sheets/detail';
import { BalanceSheetNewPage } from '@/pages/finance/balance-sheets/new';
import { CurrenciesPage } from '@/pages/finance/currencies/index';
import { ExchangeRatesPage } from '@/pages/finance/exchange-rates/index';
import { LanguagePage } from '@/pages/language/LanguagePage';
import { PeoplePage } from '@/pages/people/PeoplePage';
import { MusicPage } from '@/pages/music/MusicPage';
import { getMe } from '@/services/unihub-backend/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/finance/currencies" element={<CurrenciesPage />} />
                <Route path="/finance/accounts" element={<AccountsPage />} />
                <Route path="/finance/balance-sheets" element={<BalanceSheetsPage />} />
                <Route path="/finance/balance-sheets/new" element={<BalanceSheetNewPage />} />
                <Route path="/finance/balance-sheets/:id" element={<BalanceSheetDetailPage />} />
                <Route path="/finance/exchange-rates" element={<ExchangeRatesPage />} />
                <Route path="/language" element={<LanguagePage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/music" element={<MusicPage />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}

function LocaleAwareProviders({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const antdLocale = locale === 'zh-TW' ? zhTW : enUS;
  const messages = locale === 'zh-TW' ? zhTWMessages : enUSMessages;

  useEffect(() => {
    dayjs.locale(locale === 'zh-TW' ? 'zh-tw' : 'en');
  }, [locale]);

  return (
    <IntlProvider locale={locale} messages={messages}>
      <ConfigProvider locale={antdLocale}>
        {children}
      </ConfigProvider>
    </IntlProvider>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleAwareProviders>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LocaleAwareProviders>
      </QueryClientProvider>
    </LocaleProvider>
  );
}
